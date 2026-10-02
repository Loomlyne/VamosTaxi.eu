// apps/web/lib/ops/difference-page.test.ts
//
// 261002 (review of item 4, finding 1): one Stripe page for a difference belongs to one request. The settle
// finds its request by page id, so a page handed on to the request that replaced it recorded the payment on
// the ended request, left the change waiting and kept the customer refused ("staff-change-waiting").
// openDifferencePayment now reuses only the page of the SAME request (the dashboard's Accept again) and
// always closes the page of a request it replaced, then opens a new one. Review round 3: the request's own
// page is replaced only once Stripe says it is closed; a paid own page answers already-paid and nothing
// changes. The fake Stripe below answers a reused key as Stripe does: the same page for identical
// parameters, idempotency_error for different ones (expires_at moves every second). Fakes only.

import { beforeEach, describe, expect, it, vi } from "vitest";

const retrieve = vi.fn();
const createSession = vi.fn();
const expire = vi.fn();
const stored: { requestId: unknown; sessionId: unknown }[] = [];

function fakeSql() {
  return (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("edit_request_booking_contact")) {
      return Promise.resolve([{ reference: "VT-26-0001", contact_email: "ada@example.test", locale: "en" }]);
    }
    if (text.includes("booking_edit_request_set_extra_session")) {
      stored.push({ requestId: values[0], sessionId: values[1] });
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  };
}

vi.mock("@/lib/db/identity", () => ({
  asSystem: (_env: unknown, fn: (sql: unknown) => unknown) => fn(fakeSql()),
  asCustomer: vi.fn(),
  asGuest: vi.fn(),
}));
vi.mock("../db/identity", () => ({
  asSystem: (_env: unknown, fn: (sql: unknown) => unknown) => fn(fakeSql()),
}));
vi.mock("@/lib/lifecycle/notify-lifecycle", () => ({ notifyFlightNumber: vi.fn(), notifyTimeChange: vi.fn() }));
vi.mock("./must-fix-mail", () => ({ deliverOverlapMustFix: vi.fn() }));
vi.mock("@/lib/checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/checkout/stripe")>();
  return {
    ...actual,
    stripeFromEnv: () => ({}),
    retrieveCheckoutSession: (...a: unknown[]) => retrieve(...a),
    createCheckoutSession: (...a: unknown[]) => createSession(...a),
    expireCheckoutSession: (...a: unknown[]) => expire(...a),
  };
});

import { stripeSessionExpiresAtUnix } from "@/lib/checkout/stripe";
import { openDifferencePayment } from "./edit-request";

type CreateInput = {
  idempotencyKey: string; chargedRappen: number; bookingId: string; customerEmail: string; locale: string;
  expiresAt: Date; successUrl: string; cancelUrl: string; extra: unknown;
};

/** A Stripe create that keeps its idempotency keys as Stripe does (parameters compared to the second). */
function realKeyStripe() {
  const seen = new Map<string, { params: string; id: string }>();
  let next = 0;
  createSession.mockImplementation(async (_s: unknown, input: CreateInput) => {
    const params = JSON.stringify({
      amount: input.chargedRappen, booking: input.bookingId, email: input.customerEmail, locale: input.locale,
      expires_at: stripeSessionExpiresAtUnix(input.expiresAt), success: input.successUrl, cancel: input.cancelUrl, extra: input.extra,
    });
    const before = seen.get(input.idempotencyKey);
    if (before && before.params !== params) {
      throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters"), { type: "idempotency_error" });
    }
    if (before) return { id: before.id, url: `https://checkout.stripe.test/c/pay/${before.id}` };
    const id = `cs_test_n${++next}`;
    seen.set(input.idempotencyKey, { params, id });
    return { id, url: `https://checkout.stripe.test/c/pay/${id}` };
  });
  return seen;
}

const env = { STRIPE_SECRET_KEY: "sk_test_x" } as unknown as CloudflareEnv;
const BOOKING = "00000000-0000-4000-8000-000000000001";
const OLD_REQUEST = "00000000-0000-4000-8000-0000000000e1";
const NEW_REQUEST = "00000000-0000-4000-8000-0000000000e2";
/** A page that is open and payable for exactly 3000 rappen (synthetic). */
const OPEN_3000 = { id: "cs_test_a", status: "open", url: "https://checkout.stripe.test/c/pay/cs_test_a", currency: "chf", amount_total: 3000 };

beforeEach(() => {
  vi.clearAllMocks();
  // Drop queued one-off answers and fakes too, so one test's Stripe never answers the next.
  retrieve.mockReset();
  createSession.mockReset();
  expire.mockReset();
  stored.length = 0;
  createSession.mockResolvedValue({ id: "cs_test_b", url: "https://checkout.stripe.test/c/pay/cs_test_b" });
  expire.mockResolvedValue({ status: "expired" });
});

describe("openDifferencePayment: one page, one request", () => {
  it("the page of the request this one replaced is closed and a new page is opened, even for the same amount while it is open", async () => {
    retrieve.mockResolvedValue(OPEN_3000);
    const r = await openDifferencePayment(env, {
      requestId: NEW_REQUEST, bookingId: BOOKING, differenceRappen: 3000,
      supersededSessionId: "cs_test_a", dashboardOrigin: "https://dashboard.vamostaxi.site",
    });
    expect(r).toEqual({ ok: true, sessionId: "cs_test_b", url: "https://checkout.stripe.test/c/pay/cs_test_b" });
    expect(retrieve).not.toHaveBeenCalled();
    expect(expire).toHaveBeenCalledTimes(1);
    expect(expire.mock.calls[0]![1]).toBe("cs_test_a");
    expect(createSession).toHaveBeenCalledTimes(1);
    // A fresh request's first page: nothing replaced, so the key ends in ":0".
    expect((createSession.mock.calls[0]![1] as { idempotencyKey: string }).idempotencyKey).toBe(`extra:${NEW_REQUEST}:3000:0`);
    expect(stored).toEqual([{ requestId: NEW_REQUEST, sessionId: "cs_test_b" }]);
  });

  it("closing the replaced page is best effort: Stripe refusing it does not stop the new page", async () => {
    expire.mockRejectedValue(new Error("This Checkout Session is not open"));
    const r = await openDifferencePayment(env, {
      requestId: NEW_REQUEST, bookingId: BOOKING, differenceRappen: 3000,
      supersededSessionId: "cs_test_a", dashboardOrigin: "https://dashboard.vamostaxi.site",
    });
    expect(r).toMatchObject({ ok: true, sessionId: "cs_test_b" });
    expect(expire).toHaveBeenCalledWith(expect.anything(), "cs_test_a");
    expect(stored).toEqual([{ requestId: NEW_REQUEST, sessionId: "cs_test_b" }]);
  });

  it("the same request's own page is reused while it is open for the same amount (the dashboard's Accept again)", async () => {
    retrieve.mockResolvedValue(OPEN_3000);
    const r = await openDifferencePayment(env, {
      requestId: OLD_REQUEST, bookingId: BOOKING, differenceRappen: 3000,
      ownSessionId: "cs_test_a", dashboardOrigin: "https://dashboard.vamostaxi.site",
    });
    expect(r).toEqual({ ok: true, sessionId: "cs_test_a", url: OPEN_3000.url });
    expect(expire).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(stored).toEqual([{ requestId: OLD_REQUEST, sessionId: "cs_test_a" }]);
  });

  it("review round 2, warning 2: the own page is closed and replaced when it no longer pays this difference (another amount, expired), under a key of its own", async () => {
    const seen = realKeyStripe();

    // The request's first page (the first Accept): key ":0".
    const first = await openDifferencePayment(env, {
      requestId: OLD_REQUEST, bookingId: BOOKING, differenceRappen: 3000, dashboardOrigin: "https://dashboard.vamostaxi.site",
    });
    expect(first).toMatchObject({ ok: true, sessionId: "cs_test_n1" });

    // Open for another amount (Stripe confirms the close), then already expired (nothing to close).
    for (const kind of ["other-amount", "expired"] as const) {
      expire.mockClear();
      stored.length = 0;
      const own = [...seen.values()].at(-1)!.id;
      retrieve.mockResolvedValue(kind === "other-amount" ? { ...OPEN_3000, id: own, amount_total: 2500 } : { ...OPEN_3000, id: own, status: "expired" });
      const r = await openDifferencePayment(env, {
        requestId: OLD_REQUEST, bookingId: BOOKING, differenceRappen: 3000,
        ownSessionId: own, dashboardOrigin: "https://dashboard.vamostaxi.site",
      });
      // A new page for the same request and amount, not a refusal: its key names the page it replaces.
      expect(r).toMatchObject({ ok: true });
      const made = (r as { sessionId: string }).sessionId;
      expect(made).not.toBe(own);
      expect(expire.mock.calls.map((c) => c[1])).toEqual(kind === "other-amount" ? [own] : []);
      expect(stored).toEqual([{ requestId: OLD_REQUEST, sessionId: made }]);
      const key = (createSession.mock.calls.at(-1)![1] as { idempotencyKey: string }).idempotencyKey;
      expect(key).toBe(`extra:${OLD_REQUEST}:3000:${own}`);
    }
    expect([...seen.keys()]).toEqual([
      `extra:${OLD_REQUEST}:3000:0`,
      `extra:${OLD_REQUEST}:3000:cs_test_n1`,
      `extra:${OLD_REQUEST}:3000:cs_test_n2`,
    ]);
  });

  it("review round 3, finding 1: an own page that is already paid answers already-paid; nothing is closed, made or stored", async () => {
    realKeyStripe();
    retrieve.mockResolvedValue({ ...OPEN_3000, status: "complete", url: null });
    const r = await openDifferencePayment(env, {
      requestId: OLD_REQUEST, bookingId: BOOKING, differenceRappen: 3000,
      ownSessionId: "cs_test_a", dashboardOrigin: "https://dashboard.vamostaxi.site",
    });
    expect(r).toEqual({ ok: false, code: "already-paid" });
    expect(expire).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(stored).toEqual([]);
  });

  it("review round 3, findings 1 and 2: an own page open for another amount whose close Stripe refuses is read again: paid → already-paid, still open → stripe-failed; nothing made or stored", async () => {
    for (const [after, answer] of [["complete", "already-paid"], ["open", "stripe-failed"]] as const) {
      vi.clearAllMocks();
      stored.length = 0;
      realKeyStripe();
      retrieve
        .mockResolvedValueOnce({ ...OPEN_3000, amount_total: 2500 })
        .mockResolvedValueOnce({ ...OPEN_3000, amount_total: 2500, status: after });
      expire.mockRejectedValue(new Error("This Checkout Session is not open"));
      const r = await openDifferencePayment(env, {
        requestId: OLD_REQUEST, bookingId: BOOKING, differenceRappen: 3000,
        ownSessionId: "cs_test_a", dashboardOrigin: "https://dashboard.vamostaxi.site",
      });
      expect(r).toEqual({ ok: false, code: answer });
      expect(expire.mock.calls.map((c) => c[1])).toEqual(["cs_test_a"]);
      expect(retrieve).toHaveBeenCalledTimes(2);
      expect(createSession).not.toHaveBeenCalled();
      expect(stored).toEqual([]);
    }
  });

  it("review round 3: a refused close that Stripe then reports as expired is a closed page, and a new one is made", async () => {
    realKeyStripe();
    retrieve
      .mockResolvedValueOnce({ ...OPEN_3000, amount_total: 2500 })
      .mockResolvedValueOnce({ ...OPEN_3000, amount_total: 2500, status: "expired" });
    expire.mockRejectedValue(new Error("This Checkout Session is not open"));
    const r = await openDifferencePayment(env, {
      requestId: OLD_REQUEST, bookingId: BOOKING, differenceRappen: 3000,
      ownSessionId: "cs_test_a", dashboardOrigin: "https://dashboard.vamostaxi.site",
    });
    expect(r).toMatchObject({ ok: true, sessionId: "cs_test_n1" });
    expect(stored).toEqual([{ requestId: OLD_REQUEST, sessionId: "cs_test_n1" }]);
  });

  it("review round 3, warning 3: a retry of the same state gets the same page only within the same second; later Stripe refuses the key and no second page is made", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2030-01-01T10:00:00.100Z"));
      realKeyStripe();
      // The first Accept made a page but did not store it (the store failed): the request has no page.
      const first = await openDifferencePayment(env, {
        requestId: OLD_REQUEST, bookingId: BOOKING, differenceRappen: 3000, dashboardOrigin: "https://dashboard.vamostaxi.site",
      });
      expect(first).toMatchObject({ ok: true, sessionId: "cs_test_n1" });
      // Same state, same second: Stripe replays the same page.
      vi.setSystemTime(new Date("2030-01-01T10:00:00.900Z"));
      expect(await openDifferencePayment(env, {
        requestId: OLD_REQUEST, bookingId: BOOKING, differenceRappen: 3000, dashboardOrigin: "https://dashboard.vamostaxi.site",
      })).toMatchObject({ ok: true, sessionId: "cs_test_n1" });
      // Same state, a later second: expires_at differs, Stripe refuses the key, nothing new is made or stored.
      stored.length = 0;
      vi.setSystemTime(new Date("2030-01-01T10:00:02.000Z"));
      expect(await openDifferencePayment(env, {
        requestId: OLD_REQUEST, bookingId: BOOKING, differenceRappen: 3000, dashboardOrigin: "https://dashboard.vamostaxi.site",
      })).toEqual({ ok: false, code: "stripe-failed" });
      expect(stored).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("review round 2, warning 2: an own page Stripe cannot read is left alone and the answer is stripe-failed", async () => {
    retrieve.mockRejectedValue(new Error("down"));
    const r = await openDifferencePayment(env, {
      requestId: OLD_REQUEST, bookingId: BOOKING, differenceRappen: 3000,
      ownSessionId: "cs_test_a", dashboardOrigin: "https://dashboard.vamostaxi.site",
    });
    expect(r).toEqual({ ok: false, code: "stripe-failed" });
    expect(expire).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
    expect(stored).toEqual([]);
  });

  it("no earlier page: nothing is closed, one page is opened", async () => {
    const r = await openDifferencePayment(env, {
      requestId: NEW_REQUEST, bookingId: BOOKING, differenceRappen: 3000, dashboardOrigin: "https://dashboard.vamostaxi.site",
    });
    expect(r).toMatchObject({ ok: true, sessionId: "cs_test_b" });
    expect(retrieve).not.toHaveBeenCalled();
    expect(expire).not.toHaveBeenCalled();
  });
});
