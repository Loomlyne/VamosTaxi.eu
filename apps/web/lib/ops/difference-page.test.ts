// apps/web/lib/ops/difference-page.test.ts
//
// 261002 (review of item 4, finding 1): one Stripe page for a difference belongs to one request. The settle
// finds its request by page id, so a page handed on to the request that replaced it recorded the payment on
// the ended request, left the change waiting and kept the customer refused ("staff-change-waiting").
// openDifferencePayment now reuses only the page of the SAME request (the dashboard's Accept again) and
// always closes the page of a request it replaced, then opens a new one. Fakes only.

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

import { openDifferencePayment } from "./edit-request";

const env = { STRIPE_SECRET_KEY: "sk_test_x" } as unknown as CloudflareEnv;
const BOOKING = "00000000-0000-4000-8000-000000000001";
const OLD_REQUEST = "00000000-0000-4000-8000-0000000000e1";
const NEW_REQUEST = "00000000-0000-4000-8000-0000000000e2";
/** A page that is open and payable for exactly 3000 rappen (synthetic). */
const OPEN_3000 = { id: "cs_test_a", status: "open", url: "https://checkout.stripe.test/c/pay/cs_test_a", currency: "chf", amount_total: 3000 };

beforeEach(() => {
  vi.clearAllMocks();
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
    // Stripe as it really answers: a key it has seen comes back with the same page only for the same
    // parameters; the expiry moves every second, so a replayed key is an idempotency_error.
    const seen = new Map<string, string>();
    let next = 0;
    createSession.mockImplementation(async (_s: unknown, input: { idempotencyKey: string }) => {
      if (seen.has(input.idempotencyKey)) {
        throw Object.assign(new Error("Keys for idempotent requests can only be used with the same parameters"), { type: "idempotency_error" });
      }
      const id = `cs_test_n${++next}`;
      seen.set(input.idempotencyKey, id);
      return { id, url: `https://checkout.stripe.test/c/pay/${id}` };
    });

    // The request's first page (the first Accept): key ":0".
    const first = await openDifferencePayment(env, {
      requestId: OLD_REQUEST, bookingId: BOOKING, differenceRappen: 3000, dashboardOrigin: "https://dashboard.vamostaxi.site",
    });
    expect(first).toMatchObject({ ok: true, sessionId: "cs_test_n1" });

    for (const answer of [{ ...OPEN_3000, id: "cs_test_n1", amount_total: 2500 }, { ...OPEN_3000, id: "cs_test_n1", status: "expired" }]) {
      expire.mockClear();
      stored.length = 0;
      retrieve.mockResolvedValue(answer);
      const own = [...seen.values()].at(-1)!;
      const r = await openDifferencePayment(env, {
        requestId: OLD_REQUEST, bookingId: BOOKING, differenceRappen: 3000,
        ownSessionId: own, dashboardOrigin: "https://dashboard.vamostaxi.site",
      });
      // A new page for the same request and amount, not a refusal: its key names the page it replaces.
      expect(r).toMatchObject({ ok: true });
      const made = (r as { sessionId: string }).sessionId;
      expect(made).not.toBe(own);
      expect(expire.mock.calls.map((c) => c[1])).toEqual([own]);
      expect(stored).toEqual([{ requestId: OLD_REQUEST, sessionId: made }]);
      const key = (createSession.mock.calls.at(-1)![1] as { idempotencyKey: string }).idempotencyKey;
      expect(key).toBe(`extra:${OLD_REQUEST}:3000:${own}`);
    }
    // Three pages, three keys: none replayed.
    expect([...seen.keys()]).toEqual([
      `extra:${OLD_REQUEST}:3000:0`,
      `extra:${OLD_REQUEST}:3000:cs_test_n1`,
      `extra:${OLD_REQUEST}:3000:cs_test_n2`,
    ]);
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
