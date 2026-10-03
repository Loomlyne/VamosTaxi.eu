import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { mintLock, type QuoteLockPayload } from "../quote/lock";
import { checkoutIntentSchema } from "./intent-schema";
import { runCheckoutIntent, type CheckoutIntentDeps } from "./intent";
import { decideAccount, runAccountGate, type AccountBlock, type AccountGateDeps } from "./account-gate";

const here = dirname(fileURLToPath(import.meta.url));
const SECRETS = { current: "lock-secret-current" };
const NOW = "2026-09-05T12:00:00.000Z";
const QUOTE = "00000000-0000-4000-8000-000000000001";

const payload = (): QuoteLockPayload => ({
  v: 1,
  quote_id: QUOTE,
  exp: "2026-09-05T13:00:00.000Z",
  engine_version: "quote-engine@test",
  rate_version_id: 1,
  settings_version_id: 1,
  computed_at: NOW,
  display_currency: "CHF",
  mode: "one_way",
  pax: 1,
  bags: 0,
  extras: null,
  coupon: null,
  class_totals: [{ slug: "economy", total_rappen: 8000 }],
  legs: [
    {
      leg_seq: 1,
      pickup: { lng: 8.5, lat: 47.4, text: "ZRH" },
      dropoff: { lng: 8.54, lat: 47.37, text: "Zurich" },
      scheduled_local: "2026-09-06T10:00:00",
      distance_m: 12000,
      duration_s: 1200,
      origin_zone_id: null,
      dest_zone_id: null,
      waypoints: [],
      flight_no: null,
      landing_source: null,
    },
  ],
});

const TRIP = {
  from: "ZRH", fid: "mbx-a", to: "Zurich", tid: "mbx-b",
  gs: "11111111-1111-4111-8111-111111111111",
  when: "2026-09-06T10:00", pax: 1, bags: 0, flight: null,
};

async function body(account?: AccountBlock) {
  return {
    quote_id: QUOTE,
    lock: await mintLock(SECRETS, payload()),
    vehicle_class: "economy",
    extra_codes: [] as string[],
    coupon: null,
    contact: { name: "Ada", email: "ada@example.test", phone: "+41790000000" },
    locale: "en" as const,
    display_currency: "CHF" as const,
    company_name: "", company_address: "", company_vat: "", driver_note: "",
    trip: { ...TRIP },
    idempotency_key: "idem-a1",
    ...(account ? { account } : {}),
  };
}

/** The route's sequence: schema, decide, gate, then the intent with afterBooking. */
async function pay(opts: {
  account?: AccountBlock;
  signedIn?: boolean;
  guestOn?: boolean;
  createAvailable?: boolean;
  known?: boolean;
  writeThrows?: boolean;
  open?: boolean;
}) {
  const stripe: string[] = [];
  const writes: unknown[][] = [];
  const parsed = checkoutIntentSchema.parse(await body(opts.account));
  const decision = decideAccount({
    signedIn: opts.signedIn ?? false,
    account: parsed.account,
    guestOn: opts.guestOn ?? false,
    createAvailable: opts.createAvailable ?? true,
  });
  const gateDeps: AccountGateDeps = {
    verifyTurnstile: async () => true,
    ipLimit: async () => true,
    emailLimit: async () => true,
    hasAccount: async () => opts.known === true,
    sendLink: async () => undefined,
  };
  // The route's gate runs inside runCheckoutIntent, right after the lock verifies (U11-4).
  let gate: Awaited<ReturnType<typeof runAccountGate>> | null = null;
  let record: { choice: "guest" | "create"; textVersion: string } | null = null;
  const accountGate = async () => {
    gate = await runAccountGate({ decision, email: parsed.contact.email, account: parsed.account }, gateDeps);
    if (gate.proceed) {
      record = gate.record;
      return null;
    }
    return new Response(JSON.stringify({ ok: false, code: gate.code }), { status: gate.status });
  };

  const deps = {
    mode: "web",
    accountGate,
    origin: "https://vamostaxi.site",
    checkoutWindowMinutes: 31,
    lockSecrets: SECRETS,
    workerNowIso: NOW,
    postgresNowIso: NOW,
    reprice: (p: QuoteLockPayload) => ({
      pricing_live: true,
      engine_version: p.engine_version,
      classes: [{ slug: "economy", total_rappen: 8000, eligible: true }],
    }),
    mintManageToken: async () => ({ raw: "raw", hash: new Uint8Array(32) }),
    issueManageToken: async () => undefined,
    manageLinkMaxAgeSeconds: 1800,
    createCheckoutSession: async () => {
      stripe.push("create");
      return { id: "cs_1", status: "open", payment_status: "unpaid", currency: "chf", amount_total: 8648, url: "https://checkout.stripe.test/cs_1", payment_intent: null, expires_at: 1_790_000_000, metadata: {} } as never;
    },
    expireCheckoutSession: async () => undefined,
    retrieveCheckoutSession: async () => ({ id: "cs_1", status: "open", payment_status: "unpaid", currency: "chf", amount_total: 8648, url: "https://checkout.stripe.test/cs_1", metadata: {} }) as never,
    createBooking: async () => ({ booking_id: "booking-1", reference: "VT-1", snapshot_id: 1, payment_id: 1, replayed: false }),
    attachPayment: async () => { throw new Error("no"); },
    loadOpenPayment: async () => null,
    actorCustomerId: null,
    vehicleClassId: "00000000-0000-4000-8000-0000000000aa",
    snapshotPolicy: {
      cancellation_tiers: [], free_cancel_hours: null, airport_waiting_minutes: null, city_waiting_minutes: null,
      settings_version_id: 1, modification_deadline_hours: null, min_advance_minutes: null, policy_doc: null,
    },
    loadCatalog: async () => [],
    ownsBooking: async () => false,
    setBookingDetails: async () => undefined,
    afterBooking: async (bookingId: string) => {
      const r = record as { choice: string; textVersion: string } | null;
      if (!r) return;
      // Mirrors the route: surface checkout, e-mail null (D-19).
      writes.push(["checkout", bookingId, null, r.choice, r.textVersion, parsed.locale]);
      if (opts.writeThrows) throw Object.assign(new Error("secret detail"), { code: "23514" });
    },
  } as unknown as CheckoutIntentDeps;
  const res = await runCheckoutIntent(parsed, deps);
  return { gate: gate as Awaited<ReturnType<typeof runAccountGate>> | null, stripe, writes, res };
}

describe("intent schema account block", () => {
  it("accepts the block, rejects unknown keys inside it, and still parses without it", async () => {
    expect(checkoutIntentSchema.safeParse(await body({ choice: "create", consent: true })).success).toBe(true);
    expect(checkoutIntentSchema.safeParse(await body()).success).toBe(true);
    const bad = { ...(await body({ choice: "create", consent: true })) } as Record<string, unknown>;
    bad.account = { choice: "create", consent: true, extra: 1 };
    expect(checkoutIntentSchema.safeParse(bad).success).toBe(false);
    bad.account = { choice: "maybe", consent: true };
    expect(checkoutIntentSchema.safeParse(bad).success).toBe(false);
  });
});

describe("PAY with the account block (26.5-04)", () => {
  it("create with the tick writes one consent record and pays", async () => {
    const out = await pay({ account: { choice: "create", consent: true } });
    expect(out.res!.status).toBe(200);
    expect(out.stripe).toEqual(["create"]);
    expect(out.writes).toEqual([["checkout", "booking-1", null, "create", "2026-09-29", "en"]]);
  });

  it("create without the tick is refused and opens no Stripe session", async () => {
    const out = await pay({ account: { choice: "create", consent: false } });
    expect(out.gate).toEqual({ proceed: false, status: 400, code: "account_consent_required" });
    expect(out.stripe).toEqual([]);
  });

  it("create while unavailable is refused and opens no Stripe session", async () => {
    const out = await pay({ account: { choice: "create", consent: true }, createAvailable: false });
    expect(out.gate).toEqual({ proceed: false, status: 400, code: "account_create_unavailable" });
    expect(out.stripe).toEqual([]);
  });

  it("guest with the switch on writes one informed record, no tick needed", async () => {
    const out = await pay({ account: { choice: "guest", consent: false }, guestOn: true });
    expect(out.res!.status).toBe(200);
    expect(out.writes).toEqual([["checkout", "booking-1", null, "guest", "2026-09-29", "en"]]);
  });

  it("guest with the switch off behaves as today: no record, still pays", async () => {
    const out = await pay({ account: { choice: "guest", consent: false }, guestOn: false });
    expect(out.res!.status).toBe(200);
    expect(out.writes).toEqual([]);
  });

  it("a known e-mail answers sign_in_first before any Stripe session", async () => {
    for (const account of [{ choice: "guest", consent: false }, { choice: "create", consent: true }] as AccountBlock[]) {
      const out = await pay({ account, guestOn: true, known: true });
      expect(out.gate).toEqual({ proceed: false, status: 200, code: "sign_in_first" });
      expect(out.stripe).toEqual([]);
      expect(out.writes).toEqual([]);
    }
  });

  it("a signed-in request ignores the block", async () => {
    const out = await pay({ account: { choice: "create", consent: false }, signedIn: true });
    expect(out.res!.status).toBe(200);
    expect(out.writes).toEqual([]);
  });

  it("a failing record write is logged without detail and PAY still returns the Stripe URL", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const out = await pay({ account: { choice: "create", consent: true }, writeThrows: true });
    expect(out.res!.status).toBe(200);
    expect(((await out.res!.json()) as { url: string }).url).toMatch(/^https:\/\/checkout\.stripe\.test\//);
    expect(spy).toHaveBeenCalledWith("checkout_account_record_failed", "23514");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("secret detail");
    spy.mockRestore();
  });

  it("no PAY answer carries a session cookie", async () => {
    const out = await pay({ account: { choice: "create", consent: true } });
    const cookie = out.res!.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^vt_manage=/);
    expect(cookie).not.toMatch(/sb-[^=]*-auth-token/);
  });
});

describe("account gate waits for the lock (26.2 audit U11-4)", () => {
  async function forged(known: boolean) {
    const sendLink = vi.fn(async () => undefined);
    const hasAccount = vi.fn(async () => known);
    const parsed = checkoutIntentSchema.parse(await body({ choice: "guest", consent: false }));
    const decision = decideAccount({ signedIn: false, account: parsed.account, guestOn: true, createAvailable: true });
    const gateDeps: AccountGateDeps = {
      verifyTurnstile: async () => true,
      ipLimit: async () => true,
      emailLimit: async () => true,
      hasAccount,
      sendLink,
    };
    const stripe: string[] = [];
    const deps = {
      mode: "web",
      lockSecrets: SECRETS,
      workerNowIso: NOW,
      postgresNowIso: NOW,
      reprice: () => ({ pricing_live: true, engine_version: "quote-engine@test", classes: [] }),
      accountGate: async () => {
        const gate = await runAccountGate({ decision, email: parsed.contact.email, account: parsed.account }, gateDeps);
        return gate.proceed ? null : new Response(JSON.stringify({ ok: false, code: gate.code }), { status: gate.status });
      },
      createCheckoutSession: async () => {
        stripe.push("create");
        throw new Error("never");
      },
    } as unknown as CheckoutIntentDeps;
    const res = await runCheckoutIntent({ ...parsed, lock: "forged-lock" }, deps);
    return { res, sendLink, hasAccount, stripe };
  }

  it("a forged lock with a known e-mail gets the lock refusal, no account lookup and no mail", async () => {
    const out = await forged(true);
    expect(out.res.status).toBe(404);
    expect(((await out.res.json()) as { code: string }).code).toBe("quote_not_found");
    expect(out.hasAccount).not.toHaveBeenCalled();
    expect(out.sendLink).not.toHaveBeenCalled();
    expect(out.stripe).toEqual([]);
  });
});

describe("route wiring", () => {
  const route = readFileSync(join(here, "../../app/api/checkout/intent/route.ts"), "utf8");
  it("hands the gate to the intent, which runs it after the lock check, and passes an e-mail-less record write", () => {
    expect(route.indexOf("gateAccountForRequest(")).toBeGreaterThan(-1);
    expect(route).toContain("accountGate,");
    // U11-4: the route itself no longer asks about the e-mail before the lock is verified.
    expect(route.indexOf("gateAccountForRequest(")).toBeGreaterThan(route.indexOf("const accountGate"));
    const intent = readFileSync(join(here, "intent.ts"), "utf8");
    expect(intent.indexOf("if (!checked.ok)")).toBeLessThan(intent.indexOf("deps.accountGate?.()"));
    expect(intent.indexOf("deps.accountGate?.()")).toBeLessThan(intent.indexOf("deps.createCheckoutSession"));
    expect(route).toContain("public.record_account_agreement");
    expect(route).toMatch(/'checkout',\s+\$\{bookingId\}::uuid,\s+null,/);
  });
  it("writes agreement records only, never consent_log, and never names the service key", () => {
    for (const name of ["account-gate.ts", "account-notice.ts", "intent.ts", "../../app/api/checkout/intent/route.ts"]) {
      const src = readFileSync(join(here, name), "utf8");
      expect(src, name).not.toMatch(/consent_log/);
      expect(src, name).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
  });
});
