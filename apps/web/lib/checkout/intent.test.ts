import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mintLock, type QuoteLockPayload } from "../quote/lock";
import { runCheckoutIntent, type CheckoutIntentDeps } from "./intent";
import { priceCheckoutWithDeps } from "./price-route";

const SECRETS = { current: "lock-secret-current" };
const NOW = "2026-09-05T12:00:00.000Z";
const EXP = "2026-09-05T13:00:00.000Z";
const here = dirname(fileURLToPath(import.meta.url));

function payload(overrides: Partial<QuoteLockPayload> = {}): QuoteLockPayload {
  return {
    v: 1,
    quote_id: "00000000-0000-4000-8000-000000000001",
    exp: EXP,
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
    ...overrides,
  };
}

function deps(p: QuoteLockPayload, patch: Partial<CheckoutIntentDeps> = {}): CheckoutIntentDeps {
  const order: string[] = [];
  const base: CheckoutIntentDeps = {
    lockSecrets: SECRETS,
    workerNowIso: NOW,
    postgresNowIso: NOW,
    reprice: () => ({
      pricing_live: true,
      engine_version: p.engine_version,
      classes: [{ slug: "economy", total_rappen: 8000, eligible: true }],
    }),
    mintManageToken: async () => ({
      raw: "raw-token",
      hash: new Uint8Array(32),
    }),
    issueManageToken: async () => undefined,
    manageLinkMaxAgeSeconds: 1800,
    createCheckoutSession: async () => {
      order.push("stripe");
      return {
        id: "cs_test_1",
        client_secret: "cs_test_1_secret",
        payment_intent: "pi_test_1",
        currency: "chf",
      } as never;
    },
    expireCheckoutSession: async () => {
      order.push("expire");
    },
    retrieveCheckoutSession: async () =>
      ({
        id: "cs_test_1",
        client_secret: "cs_test_1_secret",
        payment_intent: "pi_test_1",
        status: "open",
      }) as never,
    createBooking: async () => {
      order.push("rpc");
      return {
        booking_id: "00000000-0000-4000-8000-000000000099",
        reference: "VT-10001",
        snapshot_id: 1,
        payment_id: 1,
        replayed: false,
      };
    },
    attachPayment: async () => {
      const err = Object.assign(new Error("already"), { code: "23001" });
      throw err;
    },
    loadOpenPayment: async () => null,
    checkoutWindowMinutes: 30,
    actorCustomerId: null,
    vehicleClassId: "00000000-0000-4000-8000-0000000000aa",
    snapshotPolicy: {
      cancellation_tiers: [],
      free_cancel_hours: null,
      airport_waiting_minutes: null,
      city_waiting_minutes: null,
      settings_version_id: 1,
      modification_deadline_hours: null,
      min_advance_minutes: null,
      policy_doc: null,
    },
    ...patch,
  };
  (base as CheckoutIntentDeps & { order: string[] }).order = order;
  return base;
}

describe("18-08 Stripe gates", () => {
  it("has no sk_live_ and pins hosted methods only through the TWINT flag (D-20)", () => {
    for (const name of ["intent.ts", "settle.ts", "webhook.ts", "stripe.ts"]) {
      const src = readFileSync(join(here, name), "utf8");
      expect(src, name).not.toMatch(/sk_live_/);
    }
    const stripe = readFileSync(join(here, "stripe.ts"), "utf8");
    expect(stripe).toMatch(/checkoutPaymentMethodTypes/);
  });
});


// ---------------------------------------------------------------------------
// 26.3 plan 10: mode "web" — hosted page, generic extras, reuse, supersede.
// ---------------------------------------------------------------------------
describe("runCheckoutIntent mode web (26.3)", () => {
  const OLD_BOOKING = "00000000-0000-4000-8000-0000000000b1";
  const NEW_QUOTE = "00000000-0000-4000-8000-000000000002";
  const CATALOG = [
    { code: "child_seat", amountRappen: 1000, labels: { en: "Child seat", de: "Kindersitz", fr: "Siege enfant", ar: "x" } },
    { code: "ski_bag", amountRappen: 2000, labels: { en: "Ski bag", de: "Skitasche", fr: "Sac de ski", ar: "x" } },
  ];
  const TRIP = {
    from: "ZRH", fid: "mbx-a", to: "Zurich", tid: "mbx-b",
    gs: "11111111-1111-4111-8111-111111111111",
    when: "2026-09-06T10:00", pax: 1, bags: 0, flight: null, flightDisplay: null,
    class: null, extras: [] as string[], resume: null, pay: null,
  };

  type Sess = { id: string; status: "open" | "expired" | "complete"; payment_status: "unpaid" | "paid"; amount: number; meta: Record<string, string> };

  async function webBody(p: QuoteLockPayload, patch: Record<string, unknown> = {}) {
    const lock = await mintLock(SECRETS, p);
    return {
      quote_id: p.quote_id,
      lock,
      vehicle_class: "economy",
      extra_codes: [] as string[],
      coupon: null,
      contact: { name: "Ada", email: "ada@example.test", phone: "+41790000000" },
      locale: "en" as const,
      display_currency: "CHF" as const,
      company_name: "",
      company_address: "",
      company_vat: "",
      driver_note: "",
      trip: { ...TRIP },
      idempotency_key: "idem-w1",
      ...patch,
    } as never;
  }

  // In-memory Stripe + database. One pending row per booking, sessions per booking.
  function world(p: QuoteLockPayload, over: Partial<CheckoutIntentDeps> = {}) {
    const sessions = new Map<string, Sess>();
    const bookings = new Map<string, { quote: string; reference: string; sessions: string[]; charged: number }>();
    const calls: string[] = [];
    const created: Array<Record<string, unknown>> = [];
    const details: Array<Record<string, unknown>> = [];
    let n = 0;
    let bookingSeq = 0;
    const asSession = (s: Sess) =>
      ({
        id: s.id,
        status: s.status,
        payment_status: s.payment_status,
        currency: "chf",
        amount_total: s.amount,
        url: s.status === "open" ? `https://checkout.stripe.test/${s.id}` : null,
        payment_intent: null,
        expires_at: 1_790_000_000,
        metadata: s.meta,
      }) as never;
    const d = deps(p, {
      mode: "web",
      origin: "https://vamostaxi.site",
      checkoutWindowMinutes: 31,
      loadCatalog: async () => CATALOG,
      ownsBooking: async () => false,
      createCheckoutSession: (async (input: Record<string, unknown>) => {
        created.push(input);
        n += 1;
        const s: Sess = { id: `cs_${n}`, status: "open", payment_status: "unpaid", amount: input.chargedRappen as number, meta: { selection: String(input.selectionFingerprint) } };
        sessions.set(s.id, s);
        calls.push(`create:${s.id}`);
        return asSession(s);
      }) as never,
      expireCheckoutSession: async (id) => {
        calls.push(`expire:${id}`);
        const s = sessions.get(id);
        if (s && s.status === "open") s.status = "expired";
      },
      retrieveCheckoutSession: async (id) => {
        const s = sessions.get(id);
        if (!s) throw new Error("no session");
        return asSession(s);
      },
      createBooking: async (a) => {
        calls.push("createBooking");
        for (const b of bookings.values()) if (b.quote === a.quoteId) throw Object.assign(new Error("dup"), { code: "23505" });
        bookingSeq += 1;
        const id = `booking-${bookingSeq}`;
        bookings.set(id, { quote: a.quoteId, reference: `VT-${20000 + bookingSeq}`, sessions: [a.stripeCheckoutSessionId], charged: a.chargedRappen });
        return { booking_id: id, reference: bookings.get(id)!.reference, snapshot_id: 1, payment_id: 1, replayed: false };
      },
      loadOpenPayment: async (quoteId) => {
        for (const [id, b] of bookings) {
          if (b.quote === quoteId) return { booking_id: id, reference: b.reference, stripe_checkout_session_id: b.sessions[b.sessions.length - 1]! };
        }
        return null;
      },
      attachPayment: async (a) => {
        calls.push("attach");
        for (const [id, b] of bookings) {
          if (b.quote === a.quoteId) {
            b.sessions.push(a.stripeCheckoutSessionId);
            return { booking_id: id, reference: b.reference, snapshot_id: 1, payment_id: 2, replayed: false };
          }
        }
        throw Object.assign(new Error("none"), { code: "P0002" });
      },
      listSessionIds: async (id) => [...(bookings.get(id)?.sessions ?? [])],
      purgeUnpaid: async (id, reason) => {
        calls.push(`purge:${id}:${reason}`);
        bookings.delete(id);
      },
      setBookingDetails: async (a) => {
        details.push(a);
      },
      ...over,
    });
    return { d, sessions, bookings, calls, created, details };
  }

  it("creates one pending booking priced by checkoutCharge with generic snapshot lines and a hosted session", async () => {
    const p = payload();
    const w = world(p);
    let snap: { lines: Array<{ code: string }>; policy: { extras: string[] }; total_rappen: number } | null = null;
    const base = w.d.createBooking;
    w.d.createBooking = async (a) => {
      snap = a.snapshot as never;
      return base(a);
    };
    const res = await runCheckoutIntent(
      await webBody(p, { extra_codes: ["child_seat", "ski_bag"], company_name: " Acme AG ", driver_note: " gate 4 " }),
      w.d as CheckoutIntentDeps & { mode: "web" },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    // net 8000 + 1000 + 2000 = 11000; VAT 8.1 % on top = 11891
    expect(json.amount_rappen).toBe(11891);
    expect(json.url).toMatch(/^https:\/\/checkout\.stripe\.test\/cs_/);
    expect(json.ok).toBe(true);
    expect(json).not.toHaveProperty("client_secret");
    expect(json).not.toHaveProperty("publishable_key");
    expect(res.headers.get("set-cookie")).toMatch(/^vt_manage=/);
    expect(w.created[0]).toMatchObject({ uiMode: "hosted_page", productName: "Vamos Taxi transfer" });
    expect(String(w.created[0]!.successUrl)).toBe(
      "https://vamostaxi.site/api/checkout/return?locale=en&session_id={CHECKOUT_SESSION_ID}",
    );
    expect(String(w.created[0]!.cancelUrl)).toContain("https://vamostaxi.site/checkout?");
    expect(String(w.created[0]!.cancelUrl)).toContain("fid=mbx-a");
    expect(String(w.created[0]!.cancelUrl)).toContain("tid=mbx-b");
    expect(String(w.created[0]!.cancelUrl)).toContain("gs=11111111");
    expect(String(w.created[0]!.cancelUrl)).toContain(`resume=${p.quote_id}`);
    expect(String(w.created[0]!.cancelUrl)).not.toContain("ada%40");
    expect((w.created[0]!.expiresAt as Date).toISOString()).toBe("2026-09-05T12:31:00.000Z");
    expect(snap!.policy.extras).toEqual(["child_seat", "ski_bag"]);
    expect(snap!.lines.map((l) => l.code)).toContain("ski_bag");
    expect(snap!.total_rappen).toBe(11891);
    expect(w.bookings.size).toBe(1);
    expect(w.details).toHaveLength(1);
    expect(w.details[0]).toMatchObject({ companyName: "Acme AG", driverNote: "gate 4" });
    expect(String(w.details[0]!.tripQuery)).toContain("fid=mbx-a");
  });

  it("refuses an unknown extra code as price_changed and creates nothing", async () => {
    const p = payload();
    const w = world(p);
    const res = await runCheckoutIntent(await webBody(p, { extra_codes: ["helicopter"] }), w.d as never);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("price_changed");
    expect(w.created).toHaveLength(0);
    expect(w.bookings.size).toBe(0);
  });

  it("refuses a trip that disagrees with the signed lock (when, pax, bags, flight)", async () => {
    const p = payload();
    for (const trip of [
      { ...TRIP, when: "2026-09-06T11:00" },
      { ...TRIP, pax: 3 },
      { ...TRIP, bags: 2 },
      { ...TRIP, flight: "LX318" },
    ]) {
      const w = world(p);
      const res = await runCheckoutIntent(await webBody(p, { trip }), w.d as never);
      expect(((await res.json()) as { code: string }).code).toBe("price_changed");
      expect(w.bookings.size).toBe(0);
    }
  });

  it("keeps a fixed coupon before VAT (9729 case)", async () => {
    const p = payload({ coupon: "TEN", class_totals: [{ slug: "economy", total_rappen: 9000, pre_coupon_rappen: 10000 }] });
    const w = world(p, {
      reprice: () => ({ pricing_live: true, engine_version: p.engine_version, classes: [{ slug: "economy", total_rappen: 9000, eligible: true }] }),
      evaluateCoupon: async () => ({ ok: true, coupon_id: 7, kind: "amount", percent: null, amount_rappen: 1000 }),
    });
    const res = await runCheckoutIntent(await webBody(p, { coupon: "TEN" }), w.d as never);
    // fare 100.00 - 10.00 = 90.00, plus 8.1 % VAT = 97.29
    expect(((await res.json()) as { amount_rappen: number }).amount_rappen).toBe(9729);
  });

  it("26.2 audit U11-1: a voucher signed into the lock is accepted by the price route and by PAY, at the same amount", async () => {
    const evaluateCoupon = async () => ({ ok: true, coupon_id: 7, kind: "amount", percent: null, amount_rappen: 1000 });
    const p = payload({ coupon: "TEN", class_totals: [{ slug: "economy", total_rappen: 9000, pre_coupon_rappen: 10000 }] });
    const reprice = () => ({ pricing_live: true, engine_version: p.engine_version, classes: [{ slug: "economy", total_rappen: 9000, eligible: true }] });

    const priced = await priceCheckoutWithDeps(
      { lock: await mintLock(SECRETS, p), vehicle_class: "economy", extra_codes: [], coupon: "TEN" },
      { lockSecrets: SECRETS, nowIso: NOW, loadCatalog: async () => CATALOG, loadVatBps: async () => 81, evaluateCoupon, actorCustomerId: null },
    );
    if (!priced.body.ok) throw new Error("price route refused the signed voucher");

    const w = world(p, { reprice, evaluateCoupon });
    const res = await runCheckoutIntent(await webBody(p, { coupon: "TEN" }), w.d as never);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { amount_rappen: number }).amount_rappen).toBe(priced.body.charged_rappen);
  });

  describe("261003 fare lines: the verified lock's price_rows only cut the Fare line", () => {
    const PRICE_ROWS = [
      {
        slug: "economy",
        lines: [
          { code: "airport_fee" as const, leg_seq: 1, amount_rappen: 1500 },
          {
            code: "fixed_route" as const,
            leg_seq: 1,
            amount_rappen: 2500,
            params: { origin: "Zürich", destination: "Genève" },
          },
        ],
      },
    ];

    async function run(p: QuoteLockPayload, patch: Record<string, unknown>, over: Partial<CheckoutIntentDeps> = {}) {
      const w = world(p, over);
      let snap: { lines: Array<{ code: string; kind: string; amount_rappen: number | null }>; total_rappen: number } | null = null;
      const base = w.d.createBooking;
      w.d.createBooking = async (a) => {
        snap = a.snapshot as never;
        return base(a);
      };
      const res = await runCheckoutIntent(await webBody(p, patch), w.d as never);
      expect(res.status).toBe(200);
      const json = (await res.json()) as { amount_rappen: number };
      return { json, snap: snap!, created: w.created[0]! };
    }

    it("airport pickup with a route extra and an extra: Stripe amount and total equal the old one-line run; pieces add up", async () => {
      const old = await run(payload(), { extra_codes: ["child_seat"] });
      const split = await run(payload({ price_rows: PRICE_ROWS }), { extra_codes: ["child_seat"] });
      expect(split.json.amount_rappen).toBe(old.json.amount_rappen);
      expect(split.created.chargedRappen).toBe(old.created.chargedRappen);
      expect(split.snap.total_rappen).toBe(old.snap.total_rappen);
      expect(old.snap.lines.map((l) => l.code)).toEqual(["distance_fare", "child_seat", "vat"]);
      expect(split.snap.lines.map((l) => [l.code, l.amount_rappen])).toEqual([
        ["distance_fare", 4000],
        ["airport_fee", 1500],
        ["fixed_route", 2500],
        ["child_seat", 1000],
        ["vat", old.snap.lines.find((l) => l.kind === "vat")!.amount_rappen],
      ]);
      expect(split.snap.lines.reduce((s, l) => s + (l.amount_rappen ?? 0), 0)).toBe(split.snap.total_rappen);
    });

    it("the price route shows the same lines the booking saves (D-19), and the same total", async () => {
      const p = payload({ price_rows: PRICE_ROWS });
      const priced = await priceCheckoutWithDeps(
        { lock: await mintLock(SECRETS, p), vehicle_class: "economy", extra_codes: ["child_seat"], coupon: null },
        { lockSecrets: SECRETS, nowIso: NOW, loadCatalog: async () => CATALOG, loadVatBps: async () => 81, evaluateCoupon: async () => ({ ok: false }), actorCustomerId: null },
      );
      if (!priced.body.ok) throw new Error("price route refused");
      const saved = await run(p, { extra_codes: ["child_seat"] });
      expect(saved.json.amount_rappen).toBe(priced.body.charged_rappen);
      expect(priced.body.lines.filter((l) => l.kind !== "coupon").map((l) => [l.code, l.amount_rappen])).toEqual(
        saved.snap.lines.map((l) => [l.code, l.amount_rappen]),
      );
    });

    it("with a voucher: the charge equals the one-line run and the saved total reconciles", async () => {
      const lockTotals = [{ slug: "economy", total_rappen: 7000, pre_coupon_rappen: 8000 }];
      const evaluateCoupon = async () => ({ ok: true, coupon_id: 7, kind: "amount", percent: null, amount_rappen: 1000 });
      const reprice = () => ({ pricing_live: true, engine_version: "quote-engine@test", classes: [{ slug: "economy", total_rappen: 7000, eligible: true }] });
      const patch = { coupon: "TEN", extra_codes: ["child_seat"] };
      const old = await run(payload({ coupon: "TEN", class_totals: lockTotals }), patch, { reprice, evaluateCoupon });
      const split = await run(payload({ coupon: "TEN", class_totals: lockTotals, price_rows: PRICE_ROWS }), patch, { reprice, evaluateCoupon });
      expect(split.json.amount_rappen).toBe(old.json.amount_rappen);
      expect(split.snap.total_rappen).toBe(old.snap.total_rappen);
      expect(split.snap.lines.reduce((s, l) => s + (l.amount_rappen ?? 0), 0)).toBe(split.snap.total_rappen);
      const fare = (s: typeof old) => s.snap.lines.filter((l) => l.kind === "fare").reduce((a, l) => a + (l.amount_rappen ?? 0), 0);
      expect(fare(split)).toBe(fare(old));
    });

    it("a request body cannot send a part: price_rows in the body is not read (strict schema), only the lock is", async () => {
      // A lock without price_rows plus a body that carries some: the saved lines never gain a part.
      const r = await run(payload(), { price_rows: PRICE_ROWS, airport_fee: 1500 });
      expect(r.snap.lines.map((l) => l.code)).toEqual(["distance_fare", "vat"]);
    });

    it("parts that do not fit under the class net fall back to one Fare line, never a refusal", async () => {
      const bad = [{ slug: "economy", lines: [{ code: "airport_fee" as const, leg_seq: 1, amount_rappen: 9000 }] }];
      const r = await run(payload({ price_rows: bad }), {});
      expect(r.snap.lines.map((l) => l.code)).toEqual(["distance_fare", "vat"]);
    });
  });

  it("26.2 audit U04-1: PAY charges max(0, fare + extras - coupon) from the pinned fare, not fare + the coupon's face value", async () => {
    // Fare 3000 rappen, fixed coupon 3500 (clamped to the fare: lock total 0), ski bag 2000.
    // 30.00 + 20.00 - 35.00 = 15.00, plus 8.1 % VAT = 16.22. The old gross-up read the fare as 35.00 and charged 21.62.
    const p = payload({ coupon: "TEN", class_totals: [{ slug: "economy", total_rappen: 0, pre_coupon_rappen: 3000 }] });
    const w = world(p, {
      reprice: () => ({ pricing_live: true, engine_version: p.engine_version, classes: [{ slug: "economy", total_rappen: 0, eligible: true }] }),
      evaluateCoupon: async () => ({ ok: true, coupon_id: 7, kind: "amount", percent: null, amount_rappen: 3500 }),
    });
    const res = await runCheckoutIntent(await webBody(p, { coupon: "TEN", extra_codes: ["ski_bag"] }), w.d as never);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { amount_rappen: number }).amount_rappen).toBe(1622);
  });

  it("26.2 audit U04-1: a lock minted before pre_coupon_rappen existed, carrying a coupon, is price_changed at PAY", async () => {
    const p = payload({ coupon: "TEN", class_totals: [{ slug: "economy", total_rappen: 9000 }] });
    const w = world(p, {
      reprice: () => ({ pricing_live: true, engine_version: p.engine_version, classes: [{ slug: "economy", total_rappen: 9000, eligible: true }] }),
      evaluateCoupon: async () => ({ ok: true, coupon_id: 7, kind: "amount", percent: null, amount_rappen: 1000 }),
    });
    const res = await runCheckoutIntent(await webBody(p, { coupon: "TEN" }), w.d as never);
    expect(((await res.json()) as { code: string }).code).toBe("price_changed");
    expect(w.created).toHaveLength(0);
    expect(w.bookings.size).toBe(0);
  });

  it("26.2 audit U11-1: a lock without the voucher still refuses a body voucher at PAY (the safety check stays)", async () => {
    const p = payload();
    const w = world(p, { evaluateCoupon: async () => ({ ok: true, coupon_id: 7, kind: "amount", percent: null, amount_rappen: 1000 }) });
    const res = await runCheckoutIntent(await webBody(p, { coupon: "TEN" }), w.d as never);
    expect(((await res.json()) as { code: string }).code).toBe("coupon_no_longer_valid");
    expect(w.created).toHaveLength(0);
    expect(w.bookings.size).toBe(0);
  });

  it("26.2 audit U11-5: launch flags that cannot be read refuse pricing_not_live and open nothing", async () => {
    const p = payload();
    for (const loadLaunchFlags of [
      async () => {
        throw new Error("db down");
      },
      async () => ({ vat_rate_bps: Number.NaN }),
      async () => ({ vat_rate_bps: -1 }),
    ]) {
      const w = world(p, { loadLaunchFlags });
      const res = await runCheckoutIntent(await webBody(p), w.d as never);
      expect(((await res.json()) as { code: string }).code).toBe("pricing_not_live");
      expect(w.created).toHaveLength(0);
      expect(w.bookings.size).toBe(0);
    }
  });

  it("26.2 audit U11-5: a readable VAT rate is used as read, not 8.1 %", async () => {
    const p = payload();
    const w = world(p, { loadLaunchFlags: async () => ({ vat_rate_bps: 0 }) });
    const res = await runCheckoutIntent(await webBody(p), w.d as never);
    expect(((await res.json()) as { amount_rappen: number }).amount_rappen).toBe(8000);
  });

  it("uses the Zurich instant for the manage-link expiry (D-36)", async () => {
    const p = payload();
    const w = world(p);
    let expiry = "";
    const base = w.d.createBooking;
    w.d.createBooking = async (a) => {
      expiry = a.manageTokenExpiresAt.toISOString();
      return base(a);
    };
    await runCheckoutIntent(await webBody(p), w.d as never);
    // 2026-09-06 10:00 Zurich (CEST, UTC+2) = 08:00Z, plus 1800 s
    expect(expiry).toBe("2026-09-06T08:30:00.000Z");
  });

  it("Pay again with the same selection returns the same booking and open url without createBooking", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    w.calls.length = 0;
    w.d.ownsBooking = async (id: string) => id === first.booking_id;
    const res = await runCheckoutIntent(await webBody(p, { idempotency_key: "idem-w2" }), w.d as never);
    const again = (await res.json()) as Record<string, unknown>;
    expect(again.reference).toBe(first.reference);
    expect(again.booking_id).toBe(first.booking_id);
    expect(again.url).toBe(first.url);
    expect(w.calls).not.toContain("createBooking");
    expect(w.bookings.size).toBe(1);
    expect(res.headers.get("set-cookie")).toMatch(/^vt_manage=/);
  });

  it("F8: Pay again by a requester who does not own the booking gets the url but no manage token, cookie or detail write", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    const issued: string[] = [];
    w.d.issueManageToken = async (a: { bookingId: string }) => {
      issued.push(a.bookingId);
    };
    w.details.length = 0;
    w.d.ownsBooking = async () => false;
    const res = await runCheckoutIntent(await webBody(p, { idempotency_key: "idem-w2" }), w.d as never);
    const again = (await res.json()) as Record<string, unknown>;
    expect(again.booking_id).toBe(first.booking_id);
    expect(issued).toEqual([]);
    expect(w.details).toEqual([]);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("F8: an expired session re-attached for a non-owner mints no manage token either", async () => {
    const p = payload();
    const w = world(p);
    await runCheckoutIntent(await webBody(p), w.d as never);
    w.sessions.get("cs_1")!.status = "expired";
    const issued: string[] = [];
    w.d.issueManageToken = async (a: { bookingId: string }) => {
      issued.push(a.bookingId);
    };
    w.d.ownsBooking = async () => false;
    const res = await runCheckoutIntent(await webBody(p, { idempotency_key: "idem-w2" }), w.d as never);
    expect(res.status).toBe(200);
    expect(issued).toEqual([]);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("an expired session on a still-pending booking gets a new hosted session on the same booking", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    w.sessions.get("cs_1")!.status = "expired";
    const again = (await (await runCheckoutIntent(await webBody(p, { idempotency_key: "idem-w2" }), w.d as never)).json()) as Record<string, unknown>;
    expect(again.reference).toBe(first.reference);
    expect(again.url).not.toBe(first.url);
    expect(w.calls).toContain("attach");
    expect(w.bookings.size).toBe(1);
  });

  it("a changed selection on the same quote expires every old session, confirms, purges as superseded, creates anew", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    w.calls.length = 0;
    const res = await runCheckoutIntent(
      await webBody(p, { extra_codes: ["child_seat"], idempotency_key: "idem-w2" }),
      w.d as never,
    );
    expect(res.status).toBe(200);
    const next = (await res.json()) as Record<string, unknown>;
    expect(next.booking_id).not.toBe(first.booking_id);
    const order = w.calls.join(" ");
    expect(order.indexOf("expire:cs_1")).toBeLessThan(order.indexOf(`purge:${first.booking_id}:superseded`));
    expect(order.indexOf(`purge:${first.booking_id}:superseded`)).toBeLessThan(order.indexOf("createBooking"));
    expect(w.bookings.size).toBe(1);
  });

  it("an old session that is complete refuses quote_already_booked and never purges", async () => {
    const p = payload();
    const w = world(p);
    await runCheckoutIntent(await webBody(p), w.d as never);
    const s = w.sessions.get("cs_1")!;
    s.status = "complete";
    s.payment_status = "paid";
    w.calls.length = 0;
    const res = await runCheckoutIntent(await webBody(p, { extra_codes: ["ski_bag"], idempotency_key: "idem-w2" }), w.d as never);
    expect(((await res.json()) as { code: string }).code).toBe("quote_already_booked");
    expect(w.calls.some((c) => c.startsWith("purge"))).toBe(false);
    expect(w.bookings.size).toBe(1);
  });

  it("new quote_id + supersedes → same single row (owner only)", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    const p2 = payload({ quote_id: NEW_QUOTE });
    w.d.ownsBooking = async (id) => id === first.booking_id;
    const res = await runCheckoutIntent(
      await webBody(p2, { supersedes: first.booking_id, idempotency_key: "idem-w3" }),
      w.d as never,
    );
    expect(res.status).toBe(200);
    expect(w.calls).toContain(`purge:${first.booking_id}:superseded`);
    expect(w.bookings.size).toBe(1);
    expect([...w.bookings.values()][0]!.quote).toBe(NEW_QUOTE);
  });

  it("supersedes for a booking the cookie does not own purges nothing", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    const p2 = payload({ quote_id: NEW_QUOTE });
    const res = await runCheckoutIntent(
      await webBody(p2, { supersedes: first.booking_id, idempotency_key: "idem-w3" }),
      w.d as never,
    );
    expect(res.status).toBe(200);
    expect(w.calls.some((c) => c.startsWith("purge"))).toBe(false);
    expect(w.bookings.size).toBe(2);
  });

  it("supersedes where an old session is complete refuses and leaves one row", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    w.sessions.get("cs_1")!.status = "complete";
    w.d.ownsBooking = async () => true;
    const p2 = payload({ quote_id: NEW_QUOTE });
    const res = await runCheckoutIntent(
      await webBody(p2, { supersedes: first.booking_id, idempotency_key: "idem-w3" }),
      w.d as never,
    );
    expect(((await res.json()) as { code: string }).code).toBe("quote_already_booked");
    expect(w.calls.some((c) => c.startsWith("purge"))).toBe(false);
    expect(w.bookings.size).toBe(1);
  });

  it("same total, different extra: not reused, takes the changed-selection path", async () => {
    const p = payload();
    const w = world(p, {
      loadCatalog: async () => [
        { code: "ext_a", amountRappen: 1000, labels: { en: "A", de: "A", fr: "A", ar: "A" } },
        { code: "ext_b", amountRappen: 1000, labels: { en: "B", de: "B", fr: "B", ar: "B" } },
      ],
    });
    const first = (await (await runCheckoutIntent(await webBody(p, { extra_codes: ["ext_a"] }), w.d as never)).json()) as Record<string, unknown>;
    w.calls.length = 0;
    const res = await runCheckoutIntent(await webBody(p, { extra_codes: ["ext_b"], idempotency_key: "idem-w2" }), w.d as never);
    const next = (await res.json()) as Record<string, unknown>;
    expect(next.amount_rappen).toBe(first.amount_rappen);
    expect(next.booking_id).not.toBe(first.booking_id);
    expect(w.calls).toContain(`purge:${first.booking_id}:superseded`);
    expect(w.calls).toContain("createBooking");
    expect(w.bookings.size).toBe(1);
  });

  it("same total, different class: not reused, takes the changed-selection path", async () => {
    const p = payload({ class_totals: [{ slug: "economy", total_rappen: 8000 }, { slug: "business", total_rappen: 8000 }] });
    const w = world(p, {
      reprice: () => ({
        pricing_live: true,
        engine_version: p.engine_version,
        classes: [
          { slug: "economy", total_rappen: 8000, eligible: true },
          { slug: "business", total_rappen: 8000, eligible: true },
        ],
      }),
    });
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    w.calls.length = 0;
    const res = await runCheckoutIntent(await webBody(p, { vehicle_class: "business", idempotency_key: "idem-w2" }), w.d as never);
    const next = (await res.json()) as Record<string, unknown>;
    expect(next.booking_id).not.toBe(first.booking_id);
    expect(w.calls).toContain(`purge:${first.booking_id}:superseded`);
    expect(w.bookings.size).toBe(1);
  });

  it("a session without a selection fingerprint is never reused", async () => {
    const p = payload();
    const w = world(p);
    const first = (await (await runCheckoutIntent(await webBody(p), w.d as never)).json()) as Record<string, unknown>;
    w.sessions.get("cs_1")!.meta = {};
    const next = (await (await runCheckoutIntent(await webBody(p, { idempotency_key: "idem-w2" }), w.d as never)).json()) as Record<string, unknown>;
    expect(next.booking_id).not.toBe(first.booking_id);
    expect(w.bookings.size).toBe(1);
  });

  it("a purge the database refuses (false) stops the supersede and creates nothing new", async () => {
    const p = payload();
    const w = world(p, { purgeUnpaid: async () => false });
    await runCheckoutIntent(await webBody(p), w.d as never);
    w.calls.length = 0;
    const res = await runCheckoutIntent(await webBody(p, { extra_codes: ["ski_bag"], idempotency_key: "idem-w2" }), w.d as never);
    expect(((await res.json()) as { code: string }).code).toBe("quote_already_booked");
    expect(w.calls).not.toContain("createBooking");
  });

  it("the legacy UAE test account never mints a hosted session", async () => {
    const p = payload();
    const w = world(p, { legacyUaeAccount: true });
    const res = await runCheckoutIntent(await webBody(p), w.d as never);
    expect(res.status).toBe(503);
    expect(w.created).toHaveLength(0);
  });
  // ---- Gates moved from the removed pay_link mode; the web runner shares them. ----
  describe("shared gates (moved from pay_link mode)", () => {
    const EXPIRED = "2026-09-05T11:00:00.000Z";

    async function run(p: QuoteLockPayload, over: Partial<CheckoutIntentDeps> & { holdUntilIso?: string | null } = {}, patch: Record<string, unknown> = {}, tamper = false) {
      const w = world(p, over as Partial<CheckoutIntentDeps>);
      const body = (await webBody(p, patch)) as { lock: string };
      if (tamper) body.lock = `${body.lock.slice(0, -2)}xx`;
      const res = await runCheckoutIntent(body as never, w.d as never);
      return { res, w };
    }
    const code = async (res: Response) => ((await res.json()) as { code: string }).code;

    it("404 quote_not_found for a bad HMAC, without leaking why", async () => {
      const { res, w } = await run(payload(), {}, {}, true);
      expect(res.status).toBe(404);
      expect(await code(res)).toBe("quote_not_found");
      expect(w.created).toHaveLength(0);
      expect(w.calls).toEqual([]);
    });

    it("409 quote_expired reaches neither Stripe nor the database", async () => {
      const { res, w } = await run(payload({ exp: EXPIRED }));
      expect(res.status).toBe(409);
      expect(await code(res)).toBe("quote_expired");
      expect(w.calls).toEqual([]);
    });

    it("409 pricing_not_live when the class has no price on the board", async () => {
      const p = payload();
      const { res, w } = await run(p, { reprice: () => ({ pricing_live: true, engine_version: p.engine_version, classes: [{ slug: "economy", total_rappen: null, eligible: false }] }) as never });
      expect(await code(res)).toBe("pricing_not_live");
      expect(w.created).toHaveLength(0);
    });

    it("409 engine_changed when the engine version moved since the quote", async () => {
      const p = payload();
      const { res, w } = await run(p, { reprice: () => ({ pricing_live: true, engine_version: "quote-engine@other", classes: [{ slug: "economy", total_rappen: 8000, eligible: true }] }) as never });
      expect(res.status).toBe(409);
      expect(await code(res)).toBe("engine_changed");
      expect(w.created).toHaveLength(0);
    });

    it("refuses bookings.is_test and never creates a Stripe session (D-33)", async () => {
      const { res, w } = await run(payload(), { loadQuotePayGate: async () => ({ is_test: true }) });
      expect(res.status).toBe(400);
      expect(w.created).toHaveLength(0);
      expect(w.calls).not.toContain("createBooking");
    });

    it("refuses a flight number that is not the lock's, and proceeds when it matches ignoring case and spacing", async () => {
      const lockWith = (flight: string | null) => {
        const base = payload();
        return payload({ legs: [{ ...base.legs[0]!, flight_no: flight }] });
      };
      const bad = await run(lockWith(null), {}, { flight_no: "LX 1" });
      expect(await code(bad.res)).toBe("price_changed");
      expect(bad.w.created).toHaveLength(0);
      const lx = lockWith("LX1");
      const ok = await run(lx, {}, { flight_no: "lx 1", trip: { ...TRIP, flight: "LX1" } });
      expect(ok.res.status).toBe(200);
    });

    it("D-11: coupon_no_longer_valid when the body coupon is not the lock's, or the lock's coupon cannot be re-evaluated", async () => {
      const a = await run(payload(), {}, { coupon: "TEN" });
      expect(await code(a.res)).toBe("coupon_no_longer_valid");
      const lockCoupon = payload({ coupon: "TEN" });
      const b = await run(lockCoupon, { evaluateCoupon: undefined }, { coupon: "TEN" });
      expect(await code(b.res)).toBe("coupon_no_longer_valid");
      const c = await run(lockCoupon, { evaluateCoupon: async () => ({ ok: false }) }, { coupon: "TEN" });
      expect(await code(c.res)).toBe("coupon_no_longer_valid");
      expect(c.w.created).toHaveLength(0);
    });

    it("23P01 from createBooking is payment_window_closed and the new session is expired", async () => {
      const { res, w } = await run(payload(), {
        createBooking: async () => {
          throw Object.assign(new Error("exclusion"), { code: "23P01" });
        },
      });
      expect(res.status).toBe(409);
      expect(await code(res)).toBe("payment_window_closed");
      expect(w.calls.some((c) => c.startsWith("expire:"))).toBe(true);
    });

    it("23505 from createBooking is quote_already_booked and the new session is expired", async () => {
      const { res, w } = await run(payload(), {
        createBooking: async () => {
          throw Object.assign(new Error("dup"), { code: "23505" });
        },
      });
      expect(await code(res)).toBe("quote_already_booked");
      expect(w.calls.some((c) => c.startsWith("expire:"))).toBe(true);
    });

    it("P0002 or 23514 from createBooking is coupon_no_longer_valid and the new session is expired", async () => {
      for (const sqlstate of ["P0002", "23514"]) {
        const { res, w } = await run(payload(), {
          createBooking: async () => {
            throw Object.assign(new Error("coupon"), { code: sqlstate });
          },
        });
        expect(await code(res)).toBe("coupon_no_longer_valid");
        expect(w.calls.some((c) => c.startsWith("expire:"))).toBe(true);
      }
    });

    it("a replayed booking whose stored session is no longer payable is payment_window_closed and the session is expired", async () => {
      const { res, w } = await run(payload(), {
        createBooking: async () => ({
          booking_id: "booking-replay",
          reference: "VT-20099",
          snapshot_id: 1,
          payment_id: 1,
          replayed: true,
        }),
        retrieveCheckoutSession: (async (id: string) => ({
          id,
          status: "expired",
          payment_status: "unpaid",
          currency: "chf",
          amount_total: 8648,
          url: null,
          metadata: {},
        })) as never,
      });
      expect(res.status).toBe(409);
      expect(await code(res)).toBe("payment_window_closed");
      expect(w.calls.some((c) => c.startsWith("expire:"))).toBe(true);
    });

    describe("the pay-link hold keeps the traveller's lock payable (D-20, D-21)", () => {
      it("accepts an expired lock while the hold is still open", async () => {
        const { res, w } = await run(payload({ exp: EXPIRED }), { holdUntilIso: "2026-09-06T10:00:00.000Z" });
        expect(res.status).toBe(200);
        expect(w.created).toHaveLength(1);
      });

      it("honours the hold on both clocks (Worker and Postgres)", async () => {
        const { res } = await run(payload({ exp: EXPIRED }), {
          holdUntilIso: "2026-09-05T12:30:00.000Z",
          workerNowIso: "2026-09-05T12:10:00.000Z",
          postgresNowIso: "2026-09-05T12:20:00.000Z",
        });
        expect(res.status).toBe(200);
      });

      it("refuses quote_expired when the lock and the hold are both past", async () => {
        const { res, w } = await run(payload({ exp: EXPIRED }), { holdUntilIso: "2026-09-05T11:30:00.000Z" });
        expect(res.status).toBe(409);
        expect(await code(res)).toBe("quote_expired");
        expect(w.created).toHaveLength(0);
      });

      it("refuses quote_expired when the hold is past on the Postgres clock only", async () => {
        const { res } = await run(payload({ exp: EXPIRED }), {
          holdUntilIso: "2026-09-05T12:30:00.000Z",
          workerNowIso: "2026-09-05T12:10:00.000Z",
          postgresNowIso: "2026-09-05T12:30:00.000Z",
        });
        expect(await code(res)).toBe("quote_expired");
      });

      it("still verifies the signature when a hold is open", async () => {
        const { res, w } = await run(payload({ exp: EXPIRED }), { holdUntilIso: "2026-09-06T10:00:00.000Z" }, {}, true);
        expect(res.status).toBe(404);
        expect(await code(res)).toBe("quote_not_found");
        expect(w.created).toHaveLength(0);
      });

      it("without a hold an expired lock is refused exactly as before", async () => {
        for (const hold of [undefined, null, "not-a-date"]) {
          const { res, w } = await run(payload({ exp: EXPIRED }), { holdUntilIso: hold });
          expect(await code(res)).toBe("quote_expired");
          expect(w.created).toHaveLength(0);
        }
      });

      it("a hold earlier than the lock never shortens the lock", async () => {
        const { res } = await run(payload(), { holdUntilIso: "2026-09-05T11:00:00.000Z" });
        expect(res.status).toBe(200);
      });

      it("the intent route loads the hold from the database before runCheckoutIntent", () => {
        const src = readFileSync(join(here, "../../app/api/checkout/intent/route.ts"), "utf8");
        const read = src.indexOf("public.checkout_booking_hold_until(");
        expect(read).toBeGreaterThan(-1);
        expect(read).toBeLessThan(src.indexOf("return runCheckoutIntent("));
        expect(src).toMatch(/holdUntilIso[,:]/);
        expect(src).toContain("asCheckout(env, null");
        // The hold comes from the database, never the request body (T-26.1-90).
        expect(src).not.toMatch(/body\.hold_until|json\.hold_until/);
      });
    });
  });
});
