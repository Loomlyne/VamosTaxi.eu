// apps/web/lib/ops/booking-change-settle.test.ts
//
// 26.2 P1: the Stripe webhook for a paid difference (kind=extra). When the change was applied, the
// confirmation goes again and the driver taken off is told (D6, D7) — through the settle deps hook;
// the first-payment confirmation never goes for an extra payment; a mail failure never retries.

import { describe, expect, it, vi } from "vitest";

vi.mock("../db/identity", () => ({ asSystem: vi.fn(), asStaff: vi.fn() }));

import { handleStripeMessageWithDeps, type SettleDeps, type SettleRow } from "../checkout/settle";
import type { StripeQueueMessage } from "../checkout/webhook";
import type Stripe from "stripe";

const message: StripeQueueMessage = {
  eventId: "evt_p1",
  type: "checkout.session.completed",
  objectId: "cs_test_extra",
  stripeCreated: 1_725_000_000,
};

function row(patch: Partial<SettleRow>): SettleRow {
  return {
    booking_id: "11111111-1111-1111-1111-111111111111",
    reference: "VT-26-0801",
    locale: "de",
    contact_email: "anna@example.test",
    already_settled: false,
    revived: false,
    duplicate: false,
    refund_required: false,
    refund_reason: null,
    payment_id: 0,
    charged_rappen: 0,
    other_open_session_ids: [],
    ...patch,
  };
}

function deps(settled: SettleRow, afterExtraApplied = vi.fn(async (_row: SettleRow): Promise<void> => undefined)) {
  const session = { id: "cs_test_extra", payment_intent: "pi_x", payment_status: "paid", currency: "chf", metadata: { kind: "extra" } } as unknown as Stripe.Checkout.Session;
  const d = {
    begin: vi.fn(async () => ({ should_process: true, reason: "ok" })),
    retrieveSession: vi.fn(async () => session),
    settlePayment: vi.fn(async () => settled),
    eventSettle: vi.fn(async () => undefined),
    deliverConfirmation: vi.fn(async () => undefined),
    provisionAccount: vi.fn(async () => "created"),
    afterExtraApplied,
    refund: vi.fn(async () => ({ id: "re_x" })),
    recordDuplicateRefund: vi.fn(async () => undefined),
    alertPaidAfterCancel: vi.fn(async () => undefined),
    alertStuckPayment: vi.fn(async () => undefined),
    expireSession: vi.fn(async () => undefined),
    purgeOnSessionExpired: vi.fn(async () => false),
    retrieveCharge: vi.fn(),
    retrieveDispute: vi.fn(),
    findSessionIdForPaymentIntent: vi.fn(async () => "cs_test_extra"),
    recordChargeRefund: vi.fn(),
    upsertDispute: vi.fn(),
    emit: vi.fn(),
  };
  return d as unknown as SettleDeps & typeof d;
}

describe("paid difference of a class change (kind=extra)", () => {
  it("applied: the after-change hook runs once; the first-payment confirmation does not", async () => {
    const d = deps(row({ applied: true, unassigned_chauffeur_id: "c1" }));
    expect(await handleStripeMessageWithDeps(message, d)).toMatchObject({ ack: true });
    expect(d.afterExtraApplied).toHaveBeenCalledTimes(1);
    expect(d.afterExtraApplied.mock.calls[0]![0]).toMatchObject({ applied: true, unassigned_chauffeur_id: "c1" });
    expect(d.deliverConfirmation).not.toHaveBeenCalled();
  });

  it("not applied (the request had ended) or already settled: no mail", async () => {
    const ended = deps(row({ applied: false }));
    await handleStripeMessageWithDeps(message, ended);
    expect(ended.afterExtraApplied).not.toHaveBeenCalled();
    const again = deps(row({ applied: true, already_settled: true }));
    await handleStripeMessageWithDeps(message, again);
    expect(again.afterExtraApplied).not.toHaveBeenCalled();
  });

  it("a failing mail never turns the settle into a retry", async () => {
    const d = deps(row({ applied: true }), vi.fn(async () => {
      throw new Error("resend down");
    }));
    expect(await handleStripeMessageWithDeps(message, d)).toMatchObject({ ack: true });
    expect(d.emit).toHaveBeenCalledWith("error", "change_mail_failed", { bookingId: "11111111-1111-1111-1111-111111111111" });
  });
});
