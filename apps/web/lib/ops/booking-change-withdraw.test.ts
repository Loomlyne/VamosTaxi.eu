// apps/web/lib/ops/booking-change-withdraw.test.ts
//
// 26.2 P1 Withdraw (owner sign-off 2026-10-01): "Withdraw change" ends a dearer class change that
// waits for the customer's payment. The Stripe page for the difference is closed FIRST; only then is
// the request ended, so a link that still works never sits behind an ended request. If she paid in
// the same second, the answer says so and nothing is ended (the payment applies the change).
// Fakes only; asSystem rethrows like postgres.js begin().

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();
const asSystem = vi.fn();
const expireCheckoutSession = vi.fn();
const retrieveCheckoutSession = vi.fn();

vi.mock("@/lib/db/identity", () => ({
  asStaff: (...a: unknown[]) => asStaff(...a),
  asSystem: (...a: unknown[]) => asSystem(...a),
}));
vi.mock("./resolve-booking-id", () => ({
  resolveStaffBookingId: async (_e: unknown, _c: unknown, key: string) => (key === "VT-26-0801" ? BOOKING : null),
}));
vi.mock("@/lib/checkout/stripe", () => ({
  stripeFromEnv: () => ({}),
  expireCheckoutSession: (...a: unknown[]) => expireCheckoutSession(...a),
  retrieveCheckoutSession: (...a: unknown[]) => retrieveCheckoutSession(...a),
}));
vi.mock("./edit-request", () => ({ DASHBOARD_ORIGIN: "https://dashboard.vamostaxi.site", openDifferencePayment: vi.fn() }));
vi.mock("@/lib/db/system-reads", () => ({ supersedePendingEditRequest: vi.fn() }));
vi.mock("@vamos/emails/confirmation", () => ({ sendClassChangePay: vi.fn(), sendChauffeurUnassign: vi.fn(), chauffeurEmailLocale: () => "en" }));
vi.mock("./voucher", () => ({ deliverBookingConfirmation: vi.fn() }));
vi.mock("@/lib/db/quote", () => ({ loadRateBook: vi.fn(), loadLaunchFlags: vi.fn() }));
vi.mock("./draft-preview", () => ({ loadSettingsRows: vi.fn() }));
vi.mock("./rate-book", () => ({ loadQuoteBookDocForVersion: vi.fn() }));

import { withdrawBookingChange } from "./booking-change";

const BOOKING = "b0000000-0000-4000-8000-000000000802";
const REQUEST = "e0000000-0000-4000-8000-000000000802";
const env = { STRIPE_SECRET_KEY: "sk_test_x" } as unknown as CloudflareEnv;
const claims = { sub: "a0000000-0000-4000-8000-0000000000aa", role: "authenticated" } as VamosClaims;

let systemCalls: { text: string; values: unknown[] }[] = [];

function staffWaiting(row: Record<string, unknown> | null) {
  asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) =>
    fn(async () => (row ? [row] : [])),
  );
}

/** asSystem as postgres.js begin() runs it: a query error the callback caught is rethrown. */
function systemAnswers(out: unknown[] | Error) {
  asSystem.mockImplementation(async (_e: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    let uncaught: unknown;
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      systemCalls.push({ text: strings.join("?"), values });
      const q = out instanceof Error ? Promise.reject(out) : Promise.resolve(out);
      q.catch((e: unknown) => {
        if (uncaught === undefined) uncaught = e;
      });
      return q;
    };
    const result = await fn(sql);
    if (uncaught !== undefined) throw uncaught;
    return result;
  });
}

const waiting = { request_id: REQUEST, actor: "staff", extra_session_id: "cs_test_wait", reference: "VT-26-0801" };

beforeEach(() => {
  vi.clearAllMocks();
  systemCalls = [];
  systemAnswers([{ request_id: REQUEST, booking_id: BOOKING, extra_session_id: "cs_test_wait" }]);
});

describe("withdrawBookingChange", () => {
  it("closes the Stripe page first, then ends the request; the booking is not touched", async () => {
    staffWaiting(waiting);
    expireCheckoutSession.mockResolvedValue({ id: "cs_test_wait", status: "expired" });
    const order: string[] = [];
    expireCheckoutSession.mockImplementation(async () => {
      order.push("stripe");
      return { status: "expired" };
    });
    asSystem.mockImplementationOnce(async (_e: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      order.push("database");
      return fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        systemCalls.push({ text: strings.join("?"), values });
        return [{ request_id: REQUEST, booking_id: BOOKING, extra_session_id: "cs_test_wait" }];
      });
    });
    expect(await withdrawBookingChange(env, claims, "VT-26-0801")).toEqual({ ok: true, bookingId: BOOKING, reference: "VT-26-0801" });
    expect(order).toEqual(["stripe", "database"]);
    expect(expireCheckoutSession.mock.calls[0]![1]).toBe("cs_test_wait");
    const call = systemCalls.find((c) => c.text.includes("booking_change_withdraw"))!;
    expect(call.values).toEqual([BOOKING, REQUEST, claims.sub]);
    expect(systemCalls.some((c) => /update|booking_staff_change|apply/i.test(c.text))).toBe(false);
  });

  it("nothing waits (no request, or a customer's request): refused, nothing called", async () => {
    for (const row of [null, { ...waiting, actor: "customer" }]) {
      staffWaiting(row);
      expect(await withdrawBookingChange(env, claims, "VT-26-0801")).toEqual({ ok: false, code: "nothing-waiting" });
    }
    expect(expireCheckoutSession).not.toHaveBeenCalled();
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("261002 finding 2: a staff change that never got a Stripe page is ended in the database alone, with no Stripe step", async () => {
    for (const page of [null, ""]) {
      vi.clearAllMocks();
      systemCalls = [];
      systemAnswers([{ request_id: REQUEST, booking_id: BOOKING, extra_session_id: null }]);
      staffWaiting({ ...waiting, extra_session_id: page });
      expect(await withdrawBookingChange(env, claims, "VT-26-0801")).toEqual({ ok: true, bookingId: BOOKING, reference: "VT-26-0801" });
      expect(expireCheckoutSession).not.toHaveBeenCalled();
      expect(retrieveCheckoutSession).not.toHaveBeenCalled();
      const call = systemCalls.find((c) => c.text.includes("booking_change_withdraw"))!;
      expect(call.values).toEqual([BOOKING, REQUEST, claims.sub]);
    }
    // The database still refuses what is not a waiting staff change (e.g. no price record): mapped, not a 500.
    vi.clearAllMocks();
    systemCalls = [];
    systemAnswers(Object.assign(new Error("nothing-waiting"), { code: "P0001" }));
    staffWaiting({ ...waiting, extra_session_id: null });
    expect(await withdrawBookingChange(env, claims, "VT-26-0801")).toEqual({ ok: false, code: "nothing-waiting" });
    // The refusal is the database's own (the old code refused before reaching it).
    expect(systemCalls.some((c) => c.text.includes("booking_change_withdraw"))).toBe(true);
  });

  it("261002 review round 2, warning 1: a page stored between the read and the withdraw is closed after it, best effort", async () => {
    // The read sees no page; the confirm on another device stores one before the withdraw locks the row,
    // so booking_change_withdraw names it.
    staffWaiting({ ...waiting, extra_session_id: null });
    systemAnswers([{ request_id: REQUEST, booking_id: BOOKING, extra_session_id: "cs_test_late" }]);
    const order: string[] = [];
    asSystem.mockImplementationOnce(async (_e: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      order.push("database");
      return fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        systemCalls.push({ text: strings.join("?"), values });
        return [{ request_id: REQUEST, booking_id: BOOKING, extra_session_id: "cs_test_late" }];
      });
    });
    expireCheckoutSession.mockImplementation(async () => {
      order.push("stripe");
      return { status: "expired" };
    });
    expect(await withdrawBookingChange(env, claims, "VT-26-0801")).toEqual({ ok: true, bookingId: BOOKING, reference: "VT-26-0801" });
    expect(order).toEqual(["database", "stripe"]);
    expect(expireCheckoutSession).toHaveBeenCalledTimes(1);
    expect(expireCheckoutSession.mock.calls[0]![1]).toBe("cs_test_late");

    // Stripe refusing that late close does not undo or fail the withdrawal.
    vi.clearAllMocks();
    systemCalls = [];
    staffWaiting({ ...waiting, extra_session_id: null });
    systemAnswers([{ request_id: REQUEST, booking_id: BOOKING, extra_session_id: "cs_test_late" }]);
    expireCheckoutSession.mockRejectedValue(new Error("This Checkout Session is not open"));
    expect(await withdrawBookingChange(env, claims, "VT-26-0801")).toEqual({ ok: true, bookingId: BOOKING, reference: "VT-26-0801" });
    expect(expireCheckoutSession).toHaveBeenCalledTimes(1);
  });

  it("the page this call closed first is not closed a second time when the withdraw names the same page", async () => {
    staffWaiting(waiting);
    systemAnswers([{ request_id: REQUEST, booking_id: BOOKING, extra_session_id: "cs_test_wait" }]);
    expireCheckoutSession.mockResolvedValue({ status: "expired" });
    expect(await withdrawBookingChange(env, claims, "VT-26-0801")).toEqual({ ok: true, bookingId: BOOKING, reference: "VT-26-0801" });
    expect(expireCheckoutSession.mock.calls.map((c) => c[1])).toEqual(["cs_test_wait"]);
  });

  it("she paid in the same second: the answer says so and nothing is ended (the payment applies the change)", async () => {
    staffWaiting(waiting);
    expireCheckoutSession.mockRejectedValue(new Error("This Checkout Session is not open"));
    retrieveCheckoutSession.mockResolvedValue({ id: "cs_test_wait", status: "complete" });
    expect(await withdrawBookingChange(env, claims, "VT-26-0801")).toEqual({ ok: false, code: "already-paid" });
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("the page had already expired: the request is ended all the same", async () => {
    staffWaiting(waiting);
    expireCheckoutSession.mockRejectedValue(new Error("This Checkout Session is not open"));
    retrieveCheckoutSession.mockResolvedValue({ id: "cs_test_wait", status: "expired" });
    expect(await withdrawBookingChange(env, claims, "VT-26-0801")).toMatchObject({ ok: true });
    expect(systemCalls.some((c) => c.text.includes("booking_change_withdraw"))).toBe(true);
  });

  it("Stripe did not answer: nothing is ended, the admin can try again", async () => {
    staffWaiting(waiting);
    expireCheckoutSession.mockRejectedValue(new Error("timeout"));
    retrieveCheckoutSession.mockRejectedValue(new Error("timeout"));
    expect(await withdrawBookingChange(env, claims, "VT-26-0801")).toEqual({ ok: false, code: "stripe-failed" });
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("a refusal raised by the database is mapped around asSystem", async () => {
    staffWaiting(waiting);
    expireCheckoutSession.mockResolvedValue({ status: "expired" });
    systemAnswers(Object.assign(new Error("already-paid"), { code: "P0001" }));
    expect(await withdrawBookingChange(env, claims, "VT-26-0801")).toEqual({ ok: false, code: "already-paid" });
  });

  it("a live Stripe key and an unknown booking are refused", async () => {
    const live = { STRIPE_SECRET_KEY: "sk_live_x" } as unknown as CloudflareEnv;
    expect(await withdrawBookingChange(live, claims, "VT-26-0801")).toEqual({ ok: false, code: "stripe-test-only" });
    expect(await withdrawBookingChange(env, claims, "nope")).toEqual({ ok: false, code: "not-found" });
  });
});
