// apps/web/lib/ops/refusal-rpc-errors.test.ts
//
// Quick 261001-refusal-messages. Cancel, Complete, No-show (bookings-write.ts) and the refund
// Decline / Reject decision (refund.ts) must hand the dashboard the RPC's named refusal
// ({ ok:false, code }) — never throw. A throw leaves the route without an answer: the Worker
// sends a 500 with no JSON and OpsDetail shows its generic "Could not cancel / refund VT-…".
//
// asSystem / asStaff are stood in with the one postgres.js rule that matters here
// (postgres@3.4.9, cf/src/index.js — the build the Worker loads — lines 256-293): every query
// inside sql.begin() gets `q.catch(e => uncaughtError || (uncaughtError = e))`, and after the
// callback resolves `if (uncaughtError) throw uncaughtError` — so a query error the callback
// caught is thrown anyway. Same stand-in as assign-rpc-errors.test.ts (260930-dash-assign).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const asStaff = vi.fn();
const asSystem = vi.fn();

vi.mock("../db/identity", () => ({
  asStaff: (...args: unknown[]) => asStaff(...args),
  asSystem: (...args: unknown[]) => asSystem(...args),
}));
vi.mock("./resolve-booking-id", () => ({
  resolveStaffBookingId: async (_env: unknown, _claims: unknown, key: string) => (key ? BOOKING : null),
}));
vi.mock("@/lib/checkout/manage-token", () => ({
  mintManageToken: vi.fn(async () => ({ raw: "manage-token-raw", hash: new Uint8Array([1, 2, 3]) })),
}));
vi.mock("../checkout/stripe", () => ({
  createRefund: vi.fn(),
  expireCheckoutSession: vi.fn(),
  findRefundByIntent: vi.fn(),
  resolvePaymentIntentId: vi.fn(),
  retrieveRefund: vi.fn(),
  stripeFromEnv: vi.fn(),
}));
vi.mock("../lifecycle/paid-cancel", () => ({
  finishPaidCancel: vi.fn(async () => undefined),
  payoutFactsFromRefund: vi.fn(() => ({ payoutCountry: "CH", availableOn: null })),
}));

import { cancelBooking, markComplete, markNoShow } from "./bookings-write";
import { decideRefund } from "./refund";

const BOOKING = "b0000000-0000-4000-8000-000000000006";
const env = {} as CloudflareEnv;
const claims: VamosClaims = {
  sub: "a0000000-0000-4000-8000-000000000005",
  role: "authenticated",
  app_metadata: { vamos_role: "admin" },
};

/** A PostgresError as postgres.js builds it: message is the RAISE text, code the SQLSTATE. */
function pgError(message: string, code: string): Error & { code: string } {
  return Object.assign(new Error(message), { name: "PostgresError", code });
}

type Step = { queryError?: unknown; rows?: unknown[]; commitError?: unknown };

/** sql.begin() as postgres.js runs it (see header). The callback is the wrapper's last argument. */
function beginLike(step: Step) {
  return async (...args: unknown[]) => {
    const fn = args[args.length - 1] as (sql: unknown) => Promise<unknown>;
    let uncaught: unknown;
    const sql = () => {
      const q = step.queryError ? Promise.reject(step.queryError) : Promise.resolve(step.rows ?? []);
      q.catch((e: unknown) => {
        if (uncaught === undefined) uncaught = e;
      });
      return q;
    };
    const result = await fn(sql);
    if (uncaught !== undefined) throw uncaught;
    if (step.commitError) throw step.commitError;
    return result;
  };
}

const cancelRow = {
  booking_id: BOOKING,
  reference: "VT-26-0101",
  email: "guest@example.test",
  name: "Ada",
  locale: "en",
  paid: false,
  refund_mode: null,
  refund_rappen: null,
  stripe_checkout_session_ids: [],
};

const markRow = {
  booking_id: BOOKING,
  reference: "VT-26-0101",
  email: "guest@example.test",
  name: "Ada",
  locale: "en",
  paid: true,
  pickup_text: "A",
  dropoff_text: "B",
  scheduled_local: "2027-09-24T10:30",
};

beforeEach(() => {
  asStaff.mockReset();
  asSystem.mockReset();
});

describe("cancelBooking answers the RPC's refusal instead of throwing", () => {
  beforeEach(() => {
    // The captured-payment check: this booking was paid, so the cancel goes to ops_cancel_booking.
    asStaff.mockImplementation(beginLike({ rows: [{ id: 1 }] }));
  });

  it("finished or cancelled trip → frozen", async () => {
    asSystem.mockImplementation(beginLike({ queryError: pgError("frozen", "P0001") }));
    await expect(cancelBooking(env, claims, BOOKING)).resolves.toEqual({ ok: false, code: "frozen" });
  });

  it("booking gone → not-found", async () => {
    asSystem.mockImplementation(beginLike({ queryError: pgError("not-found", "P0002") }));
    await expect(cancelBooking(env, claims, BOOKING)).resolves.toEqual({ ok: false, code: "not-found" });
  });

  it("any other database error → unknown (the route answers JSON, not a bare 500)", async () => {
    asSystem.mockImplementation(beginLike({ queryError: pgError("canceling statement due to statement timeout", "57014") }));
    await expect(cancelBooking(env, claims, BOOKING)).resolves.toEqual({ ok: false, code: "unknown" });
  });

  it("a clean run still cancels", async () => {
    asSystem.mockImplementation(beginLike({ rows: [cancelRow] }));
    await expect(cancelBooking(env, claims, BOOKING)).resolves.toMatchObject({
      ok: true,
      booking: { id: BOOKING, reference: "VT-26-0101", paid: false },
    });
  });
});

describe("markComplete / markNoShow answer the RPC's refusal instead of throwing", () => {
  it("frozen trip → frozen, for Complete and for No-show", async () => {
    asSystem.mockImplementation(beginLike({ queryError: pgError("frozen", "P0001") }));
    await expect(markComplete(env, claims, BOOKING)).resolves.toEqual({ ok: false, code: "frozen" });
    await expect(markNoShow(env, claims, BOOKING)).resolves.toEqual({ ok: false, code: "frozen" });
  });

  it("booking gone → not-found", async () => {
    asSystem.mockImplementation(beginLike({ queryError: pgError("not-found", "P0002") }));
    await expect(markComplete(env, claims, BOOKING)).resolves.toEqual({ ok: false, code: "not-found" });
    await expect(markNoShow(env, claims, BOOKING)).resolves.toEqual({ ok: false, code: "not-found" });
  });

  it("a clean run still marks the trip", async () => {
    asSystem.mockImplementation(beginLike({ rows: [markRow] }));
    await expect(markComplete(env, claims, BOOKING)).resolves.toMatchObject({
      ok: true,
      booking: { bookingId: BOOKING, reference: "VT-26-0101", token: "manage-token-raw" },
    });
  });
});

describe("decideRefund answers the RPC's refusal instead of throwing", () => {
  it("decline on a refund that is no longer waiting → not-pending", async () => {
    // First asStaff call: readRefundState (no full-tier state); second: ops_refund_decide.
    asStaff.mockImplementationOnce(async () => null);
    asStaff.mockImplementationOnce(beginLike({ queryError: pgError("not-pending", "P0001") }));
    await expect(decideRefund(env, claims, BOOKING, "decline")).resolves.toEqual({ ok: false, code: "not-pending" });
  });

  it("decline that meets the 24 h full-refund rule under the row lock → full-refund-only", async () => {
    asStaff.mockImplementationOnce(async () => null);
    asStaff.mockImplementationOnce(beginLike({ queryError: pgError("full-refund-only", "P0001") }));
    await expect(decideRefund(env, claims, BOOKING, "decline")).resolves.toEqual({
      ok: false,
      code: "full-refund-only",
    });
  });

  it("every reject refusal reaches the page", async () => {
    for (const name of ["not-post-trip", "not-open", "not-paid"]) {
      asStaff.mockImplementationOnce(beginLike({ queryError: pgError(name, "P0001") }));
      await expect(decideRefund(env, claims, BOOKING, "reject")).resolves.toEqual({ ok: false, code: name });
    }
    asStaff.mockImplementationOnce(beginLike({ queryError: pgError("not-found", "P0002") }));
    await expect(decideRefund(env, claims, BOOKING, "reject")).resolves.toEqual({ ok: false, code: "not-found" });
  });

  it("not an admin in the database → not-admin", async () => {
    asStaff.mockImplementationOnce(beginLike({ queryError: pgError("admin-only", "42501") }));
    await expect(decideRefund(env, claims, BOOKING, "reject")).resolves.toEqual({ ok: false, code: "not-admin" });
  });

  it("a clean run still records the decision", async () => {
    asStaff.mockImplementationOnce(
      beginLike({ rows: [{ booking_id: BOOKING, refund_status: "declined", reference: "VT-26-0101" }] }),
    );
    await expect(decideRefund(env, claims, BOOKING, "reject")).resolves.toEqual({
      ok: true,
      bookingId: BOOKING,
      refundStatus: "declined",
      reference: "VT-26-0101",
    });
  });
});
