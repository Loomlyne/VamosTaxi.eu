// Phase 28, review 2 item 3: the Pay answer never waits for the Meta click-id save.
//
// POST /api/checkout/intent runs for real up to runCheckoutIntent, which is replaced by a stand-in that
// does what the real one does at the point that matters: it calls deps.afterBooking(bookingId) and awaits
// it, then answers. The database is a fake whose click-id write is held open until the test lets it go.

import { beforeEach, describe, expect, it, vi } from "vitest";

const SUBJECT = "a1b2c3d4-0000-4000-8000-000000002801";
const FBP = "fb.1.1727771234567.1234567890";
const FBC = "fb.1.1727771234567.IwAR0abc_DEF-123";
const COOKIES = `consent_subject=${SUBJECT}; _fbp=${FBP}; _fbc=${FBC}`;

const state = {
  waited: [] as Promise<unknown>[],
  writes: [] as unknown[][],
  release: null as null | (() => void),
  gate: null as null | Promise<void>,
  failWith: null as null | { code?: string; message: string },
  withContext: true,
  staffSession: false,
};

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: { QUOTE_LOCK_SECRET: "s".repeat(32), tag: "env" },
    ctx: state.withContext ? { waitUntil: (p: Promise<unknown>) => void state.waited.push(p) } : undefined,
  }),
}));

function fakeSql() {
  const sql = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("checkout_set_meta_click_ids")) {
      state.writes.push(values);
      if (state.gate) await state.gate;
      if (state.failWith) throw Object.assign(new Error(state.failWith.message), { code: state.failWith.code });
    }
    return [];
  };
  return sql;
}
vi.mock("@/lib/db/identity", () => ({
  asAnon: async (_e: unknown, fn: (tx: unknown) => unknown) => fn(fakeSql()),
  asCheckout: async (_e: unknown, _n: unknown, fn: (sql: unknown) => unknown) => fn(fakeSql()),
  asQuote: async (_e: unknown, fn: (sql: unknown) => unknown) => fn(fakeSql()),
}));
vi.mock("@/lib/consent/read", () => ({ readConsentChoice: async () => ({ marketing: true }) }));
vi.mock("@/lib/checkout/intent-schema", () => ({
  checkoutIntentSchema: { safeParse: (data: unknown) => ({ success: true, data }) },
}));
vi.mock("@/lib/checkout/intent-limits", () => ({
  intentIpAllowed: async () => true,
  payPressAllowed: async () => true,
  notePayPressFromEnv: () => undefined,
  intentLimitResponse: () => new Response("limit", { status: 429 }),
}));
vi.mock("@/lib/checkout/lock-to-rpc", () => ({
  lookupVehicleClassId: async () => "class-1",
  snapshotPolicyFromSettings: () => ({ ok: true }),
}));
vi.mock("@/lib/db/quote", () => ({
  evaluateCoupon: vi.fn(),
  loadLaunchFlags: vi.fn(),
  loadSettingsVersion: async () => ({}),
}));
vi.mock("@/lib/checkout/policy-settings", () => ({ policyHours: () => ({ checkoutWindowMinutes: 31 }) }));
vi.mock("@/lib/checkout/reprice", () => ({
  loadCheckoutReprice: async () => ({ ok: true }),
  repriceFromLock: vi.fn(),
}));
vi.mock("@/lib/checkout/actor-customer", () => ({ resolveActorCustomerId: async () => null }));
vi.mock("@/lib/checkout/quote-left", () => ({ quoteWasLeft: async () => false }));
vi.mock("@/lib/checkout/stripe", () => ({
  WEB_CHECKOUT_MINUTES: 31,
  checkoutPaymentMethodTypes: () => ["card"],
  createCheckoutSession: vi.fn(),
  expireCheckoutSession: vi.fn(),
  retrieveCheckoutSession: vi.fn(),
  stripeFromEnv: vi.fn(),
  stripePublishableKey: () => "pk_test_x",
}));
vi.mock("@/lib/checkout/charge-gate", () => ({
  refusalForMissingClassId: () => "pricing_not_live",
  stripeAccountIsLegacyUaeTest: () => false,
}));
vi.mock("@/lib/ops/staff-origin", () => ({ requestHasStaffSession: async () => state.staffSession }));
vi.mock("@/lib/checkout/intent", () => ({
  runCheckoutIntent: async (_body: unknown, deps: { afterBooking: (id: string) => Promise<void> }) => {
    await deps.afterBooking("11111111-0000-4000-8000-000000000001");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  },
}));

import { POST } from "../../app/api/checkout/intent/route";

function pay(origin: string, cookie = COOKIES): Request {
  const host = origin.startsWith("https://dashboard.") ? "dashboard.vamostaxi.site" : "vamostaxi.site";
  return new Request(`https://${host}/api/checkout/intent`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, cookie },
    body: JSON.stringify({ quote_id: "q1", idempotency_key: "k1", vehicle_class: "economy", contact: { email: "a@b.test" } }),
  });
}

/** Answers "pending" if the promise has not settled after a few turns of the event loop. */
async function settledWithin(p: Promise<unknown>): Promise<boolean> {
  const marker = Symbol("pending");
  const r = await Promise.race([p.then(() => "done", () => "done"), new Promise((res) => setTimeout(() => res(marker), 50))]);
  return r === "done";
}

beforeEach(() => {
  state.waited.length = 0;
  state.writes.length = 0;
  state.failWith = null;
  state.withContext = true;
  state.staffSession = false;
  state.gate = new Promise<void>((res) => (state.release = res));
  vi.restoreAllMocks();
});

describe("POST /api/checkout/intent and the Meta click-id save", () => {
  it("answers while the save is still pending; the save runs in ctx.waitUntil and then writes both values", async () => {
    const answer = POST(pay("https://vamostaxi.site"));
    // The database write is held open: if the route awaited it, this would never settle.
    expect(await settledWithin(answer)).toBe(true);
    const res = await answer;
    expect(res.status).toBe(200);
    expect(state.waited).toHaveLength(1);
    expect(await settledWithin(state.waited[0])).toBe(false); // still waiting on the held write

    state.release!();
    await state.waited[0];
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0]).toEqual(["11111111-0000-4000-8000-000000000001", FBP, FBC]);
  });

  it("a failing write does not touch the answer, never rejects the background job, logs the SQLSTATE only", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.failWith = { code: "23514", message: `leaked ${FBP}` };
    state.release!();
    const res = await POST(pay("https://vamostaxi.site"));
    expect(res.status).toBe(200);
    await expect(Promise.all(state.waited)).resolves.toBeDefined();
    expect(log).toHaveBeenCalledWith("checkout_meta_click_ids_failed", "23514");
    expect(JSON.stringify(log.mock.calls)).not.toContain(FBP);
    expect(JSON.stringify(log.mock.calls)).not.toContain(FBC);
  });

  it("a dashboard Origin (staff session) saves and clears nothing", async () => {
    state.staffSession = true;
    state.release!();
    const res = await POST(pay("https://dashboard.vamostaxi.site"));
    expect(res.status).toBe(200);
    await Promise.all(state.waited);
    expect(state.writes).toEqual([]);
  });

  it("without an execution context the ids are still saved, inline", async () => {
    state.withContext = false;
    state.release!();
    const res = await POST(pay("https://vamostaxi.site"));
    expect(res.status).toBe(200);
    expect(state.waited).toHaveLength(0);
    expect(state.writes).toHaveLength(1);
  });

  it("no consent cookie: nulls are written in the background (clears an earlier press)", async () => {
    state.release!();
    const res = await POST(pay("https://vamostaxi.site", `_fbp=${FBP}`));
    expect(res.status).toBe(200);
    await Promise.all(state.waited);
    expect(state.writes[0]).toEqual(["11111111-0000-4000-8000-000000000001", null, null]);
  });
});
