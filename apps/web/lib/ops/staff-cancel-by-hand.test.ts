// apps/web/lib/ops/staff-cancel-by-hand.test.ts
//
// 20-10 refunds by hand (B.3 + owner answer 6): a staff cancel of a paid booking makes no Stripe
// refund call, leaves "Refund due", and mails the customer the normal cancellation mail at once.
// Synthetic rappen only.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { VamosClaims } from "../db/identity";

const here = dirname(fileURLToPath(import.meta.url));

const asStaff = vi.fn();
const asSystem = vi.fn();
const createRefund = vi.fn();
const stripeFromEnv = vi.fn();
const notifyCancellation = vi.fn();
const loadPaidCancelMail = vi.fn();

vi.mock("@/lib/db/identity", () => ({
  asStaff: (...a: unknown[]) => asStaff(...a),
  asSystem: (...a: unknown[]) => asSystem(...a),
}));
vi.mock("@/lib/checkout/manage-token", () => ({ mintManageToken: vi.fn() }));
vi.mock("../checkout/stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../checkout/stripe")>();
  return {
    ...actual,
    createRefund: (...a: unknown[]) => createRefund(...a),
    stripeFromEnv: (...a: unknown[]) => stripeFromEnv(...a),
    expireCheckoutSession: vi.fn(),
  };
});
vi.mock("../lifecycle/notify-lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lifecycle/notify-lifecycle")>();
  return { ...actual, notifyCancellation: (...a: unknown[]) => notifyCancellation(...a) };
});
vi.mock("../db/system-reads", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../db/system-reads")>();
  return { ...actual, loadPaidCancelMail: (...a: unknown[]) => loadPaidCancelMail(...a) };
});

const ENV = { STRIPE_SECRET_KEY: "sk_test_bw", STRIPE_PUBLISHABLE_KEY: "pk_test_normal" } as CloudflareEnv;
const CLAIMS = { sub: "staff-1", role: "authenticated" } as VamosClaims;
const BOOKING_ID = "00000000-0000-4000-8000-000000000001";

function cancelRow(mode: string, rappen: number) {
  return {
    booking_id: BOOKING_ID,
    reference: "VT-26-0101",
    email: "a@example.test",
    name: "Ada",
    locale: "en",
    paid: true,
    refund_mode: mode,
    refund_rappen: rappen,
    stripe_checkout_session_ids: [],
  };
}

function mock(mode: string, rappen: number, paid = true) {
  asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(async () => [{ id: 1 }]));
  asSystem.mockImplementation(async (_e: unknown, fn: (sql: unknown) => unknown) => fn(async () => [{ ...cancelRow(mode, rappen), paid }]));
}

beforeEach(() => {
  for (const m of [asStaff, asSystem, createRefund, stripeFromEnv, notifyCancellation, loadPaidCancelMail]) m.mockReset();
  loadPaidCancelMail.mockResolvedValue({
    reference: "VT-26-0101",
    locale: "en",
    contact_email: "guest@example.test",
    pickup_text: "A",
    dropoff_text: "B",
    scheduled_local: "2026-10-20 10:00",
    assigned_chauffeur_id: null,
    chauffeur_email: null,
  });
});

describe("staff cancel of a paid booking (20-10)", () => {
  it("more than 24 h ahead: zero Stripe refund calls, customer mail with the full-refund line", async () => {
    mock("auto_full", 12000);
    const { cancelBooking } = await import("./bookings-write");
    const result = await cancelBooking(ENV, CLAIMS, BOOKING_ID);
    expect(result.ok).toBe(true);
    expect(createRefund).not.toHaveBeenCalled();
    expect(notifyCancellation).toHaveBeenCalledTimes(1);
    expect(notifyCancellation.mock.calls[0]![1]).toMatchObject({
      customerEmail: "guest@example.test",
      refundLine: "full_captured",
    });
  });

  it("inside 24 h: no Stripe call, mail line pending_ops", async () => {
    mock("pending_ops", 0);
    const { cancelBooking } = await import("./bookings-write");
    await cancelBooking(ENV, CLAIMS, BOOKING_ID);
    expect(createRefund).not.toHaveBeenCalled();
    expect(notifyCancellation.mock.calls[0]![1]).toMatchObject({ refundLine: "pending_ops" });
  });

  it("unpaid booking: no Stripe call and no customer mail", async () => {
    mock("none", 0, false);
    const { cancelBooking } = await import("./bookings-write");
    const result = await cancelBooking(ENV, CLAIMS, BOOKING_ID);
    expect(result.ok).toBe(true);
    expect(createRefund).not.toHaveBeenCalled();
    expect(notifyCancellation).not.toHaveBeenCalled();
  });

  it("a failing mail never undoes the cancel", async () => {
    mock("auto_full", 12000);
    notifyCancellation.mockRejectedValue(new Error("resend down"));
    const { cancelBooking } = await import("./bookings-write");
    expect((await cancelBooking(ENV, CLAIMS, BOOKING_ID)).ok).toBe(true);
  });

  it("source: bookings-write.ts has no Stripe refund path", () => {
    const src = readFileSync(join(here, "bookings-write.ts"), "utf8");
    expect(src).toMatch(/ops_cancel_booking/);
    expect(src).not.toMatch(/applyStripeRefund|createRefund|record_booking_refund|loadCapturedPaymentRow/);
  });
});
