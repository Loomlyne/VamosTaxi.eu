import { describe, expect, it, vi } from "vitest";
import {
  captureAllowed,
  handleStripeMessageWithDeps,
  pgTextArrayLiteral,
  type SettleDeps,
  type SettleRow,
} from "./settle";
import type { StripeQueueMessage } from "./webhook";
import type Stripe from "stripe";

function session(patch: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_1",
    payment_intent: "pi_test_1",
    payment_status: "paid",
    currency: "chf",
    ...patch,
  } as Stripe.Checkout.Session;
}

function message(patch: Partial<StripeQueueMessage> = {}): StripeQueueMessage {
  return {
    eventId: "evt_1",
    type: "checkout.session.completed",
    objectId: "cs_test_1",
    stripeCreated: 1_725_000_000,
    ...patch,
  };
}

function settleRow(patch: Partial<SettleRow> = {}): SettleRow {
  return {
    booking_id: "11111111-1111-1111-1111-111111111111",
    reference: "VT-1",
    locale: "en",
    contact_email: "a@b.c",
    already_settled: false,
    revived: false,
    duplicate: false,
    refund_required: false,
    refund_reason: null,
    payment_id: 1,
    charged_rappen: 8000,
    other_open_session_ids: [],
    ...patch,
  };
}

function deps(patch: Partial<SettleDeps> = {}): SettleDeps & {
  begin: ReturnType<typeof vi.fn>;
  retrieveSession: ReturnType<typeof vi.fn>;
  settlePayment: ReturnType<typeof vi.fn>;
  eventSettle: ReturnType<typeof vi.fn>;
  deliverConfirmation: ReturnType<typeof vi.fn>;
  refund: ReturnType<typeof vi.fn>;
  recordDuplicateRefund: ReturnType<typeof vi.fn>;
  alertPaidAfterCancel: ReturnType<typeof vi.fn>;
  alertStuckPayment: ReturnType<typeof vi.fn>;
  expireSession: ReturnType<typeof vi.fn>;
} {
  const begin = vi.fn(async () => ({ should_process: true, reason: "ok" }));
  const retrieveSession = vi.fn(async () => session());
  const settlePayment = vi.fn(async () => settleRow());
  const eventSettle = vi.fn(async () => undefined);
  const deliverConfirmation = vi.fn(async () => undefined);
  const refund = vi.fn(async () => ({ id: "re_test_1" }));
  const recordDuplicateRefund = vi.fn(async () => undefined);
  const alertPaidAfterCancel = vi.fn(async () => undefined);
  const alertStuckPayment = vi.fn(async () => undefined);
  const expireSession = vi.fn(async () => undefined);
  return {
    begin,
    retrieveSession,
    settlePayment,
    eventSettle,
    deliverConfirmation,
    refund,
    recordDuplicateRefund,
    alertPaidAfterCancel,
    alertStuckPayment,
    expireSession,
    emit: () => undefined,
    ...patch,
  } as SettleDeps & {
    begin: ReturnType<typeof vi.fn>;
    retrieveSession: ReturnType<typeof vi.fn>;
    settlePayment: ReturnType<typeof vi.fn>;
    eventSettle: ReturnType<typeof vi.fn>;
    deliverConfirmation: ReturnType<typeof vi.fn>;
    refund: ReturnType<typeof vi.fn>;
    recordDuplicateRefund: ReturnType<typeof vi.fn>;
    alertPaidAfterCancel: ReturnType<typeof vi.fn>;
    alertStuckPayment: ReturnType<typeof vi.fn>;
    expireSession: ReturnType<typeof vi.fn>;
  };
}

describe("pgTextArrayLiteral", () => {
  it("quotes one id so ::text[] is not 22P02", () => {
    expect(pgTextArrayLiteral(["cs_test_1"])).toBe('{"cs_test_1"}');
  });

  it("joins cs_ and pi_ ids", () => {
    expect(pgTextArrayLiteral(["cs_test_1", "pi_test_1"])).toBe('{"cs_test_1","pi_test_1"}');
  });
});

describe("handleStripeMessageWithDeps", () => {
  it("acks already_processed with no side effect", async () => {
    const d = deps({
      begin: vi.fn(async () => ({ should_process: false, reason: "already_processed" })),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.settlePayment).not.toHaveBeenCalled();
    expect(d.deliverConfirmation).not.toHaveBeenCalled();
    expect(d.refund).not.toHaveBeenCalled();
  });

  it("acks superseded without calling the booking-status stub", async () => {
    const d = deps({
      begin: vi.fn(async () => ({ should_process: false, reason: "superseded" })),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.settlePayment).not.toHaveBeenCalled();
  });

  it("a second delivery of the same event never issues a second refund (dedupe stays at begin)", async () => {
    const d = deps({
      begin: vi.fn(async () => ({ should_process: false, reason: "already_processed" })),
    });
    await handleStripeMessageWithDeps(message(), d);
    expect(d.settlePayment).not.toHaveBeenCalled();
    expect(d.refund).not.toHaveBeenCalled();
  });

  it("passes both cs_ and pi_ ids into stripe_event_begin", async () => {
    const d = deps();
    await handleStripeMessageWithDeps(message(), d);
    expect(d.begin.mock.calls[0]?.[1]).toEqual(["cs_test_1", "pi_test_1"]);
  });

  it("settles a completed session that is not paid as failed", async () => {
    const d = deps({
      retrieveSession: vi.fn(async () => session({ payment_status: "unpaid" })),
    });
    await handleStripeMessageWithDeps(message(), d);
    expect(d.settlePayment.mock.calls[0]?.[0].outcome).toBe("failed");
    expect(d.deliverConfirmation).not.toHaveBeenCalled();
  });

  it("retries on P0002 and acks other SQLSTATEs after recording", async () => {
    const retry = deps({
      settlePayment: vi.fn(async () => {
        const err = new Error("payment_not_found") as Error & { code: string };
        err.code = "P0002";
        throw err;
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), retry)).toEqual({ retry: true });
    expect(retry.eventSettle).not.toHaveBeenCalled();

    const permanent = deps({
      settlePayment: vi.fn(async () => {
        const err = new Error("one_success") as Error & { code: string };
        err.code = "23505";
        throw err;
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), permanent)).toEqual({ ack: true });
    expect(permanent.eventSettle).toHaveBeenCalled();
  });

  it("does not send a second email when already_settled is true", async () => {
    const d = deps({
      settlePayment: vi.fn(async () => settleRow({ already_settled: true })),
    });
    await handleStripeMessageWithDeps(message(), d);
    expect(d.deliverConfirmation).not.toHaveBeenCalled();
  });

  it("sends confirmation once on first succeeded settlement", async () => {
    const d = deps();
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.deliverConfirmation).toHaveBeenCalledTimes(1);
  });

  it("succeeded + revived:true delivers the confirmation once (D-03)", async () => {
    const d = deps({
      settlePayment: vi.fn(async () => settleRow({ revived: true })),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.deliverConfirmation).toHaveBeenCalledTimes(1);
    expect(d.refund).not.toHaveBeenCalled();
  });

  it("succeeded on a cancelled booking still calls settlePayment — the gate is not consulted for cancelled/expired (D-03)", async () => {
    const d = deps();
    await handleStripeMessageWithDeps(message(), d);
    expect(d.settlePayment).toHaveBeenCalledTimes(1);
  });

  it("refund_required duplicate_charge refunds with the booking:payment:reason idempotency key, records it, sends no confirmation (D-22)", async () => {
    const d = deps({
      settlePayment: vi.fn(async () =>
        settleRow({
          already_settled: true,
          refund_required: true,
          refund_reason: "duplicate_charge",
          payment_id: 42,
          charged_rappen: 7780,
        }),
      ),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.refund).toHaveBeenCalledWith({
      paymentIntentId: "pi_test_1",
      amountRappen: 7780,
      idempotencyKey: "refund:11111111-1111-1111-1111-111111111111:42:duplicate_charge",
      bookingId: "11111111-1111-1111-1111-111111111111",
      paymentId: 42,
      reason: "duplicate_charge",
    });
    expect(d.recordDuplicateRefund).toHaveBeenCalledWith({
      paymentId: 42,
      stripeRefundId: "re_test_1",
      refundRappen: 7780,
      reason: "duplicate_charge",
    });
    expect(d.deliverConfirmation).not.toHaveBeenCalled();
    expect(d.alertPaidAfterCancel).not.toHaveBeenCalled();
  });

  it.each(["paid_after_cancel", "test_booking", "requote_superseded"])(
    "refund_required %s refunds and alerts paid-after-cancel with the booking id",
    async (reason) => {
      const d = deps({
        settlePayment: vi.fn(async () =>
          settleRow({ refund_required: true, refund_reason: reason }),
        ),
      });
      const result = await handleStripeMessageWithDeps(message(), d);
      expect(result).toEqual({ ack: true });
      expect(d.refund).toHaveBeenCalledTimes(1);
      expect(d.recordDuplicateRefund).toHaveBeenCalledTimes(1);
      expect(d.alertPaidAfterCancel).toHaveBeenCalledWith(
        "11111111-1111-1111-1111-111111111111",
      );
    },
  );

  it("succeeded with other_open_session_ids expires each one; a failed expire is logged, not retried", async () => {
    const emit = vi.fn();
    const expireSession = vi.fn(async (id: string) => {
      if (id === "cs_bad") throw new Error("stripe down");
    });
    const d = deps({
      emit,
      expireSession,
      settlePayment: vi.fn(async () =>
        settleRow({ other_open_session_ids: ["cs_ok", "cs_bad"] }),
      ),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(expireSession).toHaveBeenCalledWith("cs_ok");
    expect(expireSession).toHaveBeenCalledWith("cs_bad");
    expect(expireSession).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenCalledWith(
      "warn",
      "expire_session_failed",
      expect.objectContaining({ sessionId: "cs_bad" }),
    );
  });

  it("a refund dep throw never retries (processed_at already stamped) — alerts stuck payment and acks", async () => {
    const emit = vi.fn();
    const alertStuckPayment = vi.fn(async () => undefined);
    const d = deps({
      emit,
      alertStuckPayment,
      refund: vi.fn(async () => {
        throw new Error("card_declined");
      }),
      settlePayment: vi.fn(async () =>
        settleRow({ refund_required: true, refund_reason: "duplicate_charge" }),
      ),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(alertStuckPayment).toHaveBeenCalledWith({
      eventId: "evt_1",
      type: "checkout.session.completed",
      objectId: "cs_test_1",
      reference: "VT-1",
    });
    expect(emit).toHaveBeenCalledWith(
      "error",
      "refund_failed",
      expect.objectContaining({ eventId: "evt_1" }),
    );
    expect(d.recordDuplicateRefund).not.toHaveBeenCalled();
  });

  it("a null PaymentIntent id on a refund_required row never calls Stripe — alerts stuck payment and acks", async () => {
    const alertStuckPayment = vi.fn(async () => undefined);
    const refund = vi.fn(async () => ({ id: "re_never" }));
    const d = deps({
      alertStuckPayment,
      refund,
      retrieveSession: vi.fn(async () => session({ payment_intent: null })),
      settlePayment: vi.fn(async () =>
        settleRow({ refund_required: true, refund_reason: "paid_after_cancel" }),
      ),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(refund).not.toHaveBeenCalled();
    expect(alertStuckPayment).toHaveBeenCalledWith({
      eventId: "evt_1",
      type: "checkout.session.completed",
      objectId: "cs_test_1",
      reference: "VT-1",
    });
  });
});

describe("captureAllowed", () => {
  it("blocks expired pending, cancelled, and is_test; allows paid after lock expiry", () => {
    expect(captureAllowed({ status: "pending", is_test: false, expired: true })).toEqual({
      capture: false,
      reason: "expired",
    });
    expect(captureAllowed({ status: "cancelled", is_test: false, expired: false })).toEqual({
      capture: false,
      reason: "cancelled",
    });
    expect(captureAllowed({ status: "pending", is_test: true, expired: false })).toEqual({
      capture: false,
      reason: "is_test",
    });
    expect(captureAllowed({ status: "paid", is_test: false, expired: true })).toEqual({
      capture: true,
    });
    expect(captureAllowed({ status: "pending", is_test: false, expired: false })).toEqual({
      capture: true,
    });
  });
});
