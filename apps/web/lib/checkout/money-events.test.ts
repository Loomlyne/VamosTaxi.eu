import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import {
  APP_REFUND_PENDING_DELAY_SECONDS,
  handleChargeRefundedWithDeps,
  handleDisputeWithDeps,
  moneyEventKind,
  paymentIntentIdOfCharge,
  paymentIntentIdOfDispute,
  type MoneyEventDeps,
} from "./money-events";
import type { StripeQueueMessage } from "./webhook";

// Synthetic minor-unit integers only -- never a real CHF amount (D-34).

function message(patch: Partial<StripeQueueMessage> = {}): StripeQueueMessage {
  return {
    eventId: "evt_ch_1",
    type: "charge.refunded",
    objectId: "ch_test_1",
    stripeCreated: 1_725_000_100,
    ...patch,
  };
}

function refund(patch: Partial<Stripe.Refund> = {}): Stripe.Refund {
  return {
    id: "re_dash_1",
    object: "refund",
    amount: 6,
    currency: "chf",
    status: "succeeded",
    created: 1_725_000_050,
    metadata: {},
    ...patch,
  } as Stripe.Refund;
}

function charge(refunds: Stripe.Refund[], patch: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return {
    id: "ch_test_1",
    object: "charge",
    payment_intent: "pi_test_1",
    currency: "chf",
    refunds: { object: "list", data: refunds, has_more: false, url: "/v1/refunds" },
    ...patch,
  } as Stripe.Charge;
}

function dispute(patch: Partial<Stripe.Dispute> = {}): Stripe.Dispute {
  return {
    id: "du_test_1",
    object: "dispute",
    payment_intent: "pi_test_1",
    charge: "ch_test_1",
    status: "needs_response",
    reason: "fraudulent",
    amount: 6,
    currency: "chf",
    created: 1_725_000_000,
    ...patch,
  } as Stripe.Dispute;
}

function pgError(code: string, text: string): Error & { code: string } {
  return Object.assign(new Error(text), { code });
}

function deps(patch: Partial<MoneyEventDeps> = {}): MoneyEventDeps & {
  findSessionIdForPaymentIntent: ReturnType<typeof vi.fn>;
  recordChargeRefund: ReturnType<typeof vi.fn>;
  upsertDispute: ReturnType<typeof vi.fn>;
  eventSettle: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
} {
  return {
    retrieveCharge: vi.fn(async () => charge([refund()])),
    retrieveDispute: vi.fn(async () => dispute()),
    findSessionIdForPaymentIntent: vi.fn(async () => "cs_test_1"),
    recordChargeRefund: vi.fn(async () => ({ outcome: "recorded" })),
    upsertDispute: vi.fn(async () => undefined),
    eventSettle: vi.fn(async () => undefined),
    emit: vi.fn(),
    ...patch,
  } as MoneyEventDeps & {
    findSessionIdForPaymentIntent: ReturnType<typeof vi.fn>;
    recordChargeRefund: ReturnType<typeof vi.fn>;
    upsertDispute: ReturnType<typeof vi.fn>;
    eventSettle: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
  };
}

describe("moneyEventKind", () => {
  it("maps charge.refunded and the three dispute events, nothing else", () => {
    expect(moneyEventKind("charge.refunded")).toBe("charge_refunded");
    expect(moneyEventKind("charge.dispute.created")).toBe("dispute");
    expect(moneyEventKind("charge.dispute.updated")).toBe("dispute");
    expect(moneyEventKind("charge.dispute.closed")).toBe("dispute");
    expect(moneyEventKind("charge.dispute.funds_withdrawn")).toBeNull();
    expect(moneyEventKind("checkout.session.completed")).toBeNull();
    expect(moneyEventKind("charge.succeeded")).toBeNull();
  });
});

describe("paymentIntentIdOf*", () => {
  it("reads a string or expanded payment_intent, else null", () => {
    expect(paymentIntentIdOfCharge(charge([]))).toBe("pi_test_1");
    expect(paymentIntentIdOfCharge(charge([], { payment_intent: { id: "pi_x" } as Stripe.PaymentIntent }))).toBe("pi_x");
    expect(paymentIntentIdOfCharge(charge([], { payment_intent: null }))).toBeNull();
    expect(paymentIntentIdOfCharge(null)).toBeNull();
    expect(paymentIntentIdOfDispute(dispute())).toBe("pi_test_1");
    expect(paymentIntentIdOfDispute(dispute({ payment_intent: null }))).toBeNull();
    expect(paymentIntentIdOfDispute(null)).toBeNull();
  });
});

describe("handleChargeRefundedWithDeps", () => {
  it("records a dashboard refund against the charge's pi_ and session, then settles the event", async () => {
    const d = deps();
    const result = await handleChargeRefundedWithDeps(message(), charge([refund()]), d);
    expect(result).toEqual({ ack: true });
    expect(d.findSessionIdForPaymentIntent).toHaveBeenCalledWith("pi_test_1");
    expect(d.recordChargeRefund).toHaveBeenCalledWith({
      paymentIntentId: "pi_test_1",
      sessionId: "cs_test_1",
      stripeRefundId: "re_dash_1",
      refundRappen: 6,
      created: new Date(1_725_000_050 * 1000),
      appSource: false,
    });
    expect(d.eventSettle).toHaveBeenCalledWith("evt_ch_1", null);
  });

  it("flags an app-created refund (metadata vamos_source=app) as appSource", async () => {
    const d = deps();
    await handleChargeRefundedWithDeps(
      message(),
      charge([refund({ id: "re_app_1", metadata: { vamos_source: "app" } })]),
      d,
    );
    expect(d.recordChargeRefund).toHaveBeenCalledWith(
      expect.objectContaining({ stripeRefundId: "re_app_1", appSource: true }),
    );
  });

  it("records every succeeded refund on the charge", async () => {
    const d = deps();
    await handleChargeRefundedWithDeps(
      message(),
      charge([refund({ id: "re_a" }), refund({ id: "re_b", amount: 2 })]),
      d,
    );
    expect(d.recordChargeRefund).toHaveBeenCalledTimes(2);
    expect(d.recordChargeRefund).toHaveBeenLastCalledWith(
      expect.objectContaining({ stripeRefundId: "re_b", refundRappen: 2 }),
    );
  });

  it("never records a failed or canceled refund", async () => {
    const d = deps();
    const result = await handleChargeRefundedWithDeps(
      message(),
      charge([refund({ id: "re_f", status: "failed" }), refund({ id: "re_c", status: "canceled" })]),
      d,
    );
    expect(result).toEqual({ ack: true });
    expect(d.recordChargeRefund).not.toHaveBeenCalled();
    expect(d.eventSettle).toHaveBeenCalledWith("evt_ch_1", null);
  });

  it("retries with a delay while a refund is still pending at Stripe", async () => {
    const d = deps();
    const result = await handleChargeRefundedWithDeps(
      message(),
      charge([refund({ id: "re_p", status: "pending" })]),
      d,
    );
    expect(result).toEqual({ retry: true, delaySeconds: APP_REFUND_PENDING_DELAY_SECONDS });
    expect(d.recordChargeRefund).not.toHaveBeenCalled();
    expect(d.eventSettle).not.toHaveBeenCalled();
  });

  it("app_refund_pending (P0002) retries after 30 seconds, not immediately", async () => {
    const d = deps({
      recordChargeRefund: vi.fn(async () => {
        throw pgError("P0002", "app_refund_pending");
      }),
    });
    const result = await handleChargeRefundedWithDeps(
      message(),
      charge([refund({ metadata: { vamos_source: "app" } })]),
      d,
    );
    expect(APP_REFUND_PENDING_DELAY_SECONDS).toBe(30);
    expect(result).toEqual({ retry: true, delaySeconds: 30 });
    expect(d.eventSettle).not.toHaveBeenCalled();
  });

  it("an unknown payment (P0002 payment_not_found) retries so the DLQ alert fires if it never resolves", async () => {
    const d = deps({
      recordChargeRefund: vi.fn(async () => {
        throw pgError("P0002", "payment_not_found");
      }),
    });
    const result = await handleChargeRefundedWithDeps(message(), charge([refund()]), d);
    expect(result).toEqual({ retry: true });
    expect(d.eventSettle).not.toHaveBeenCalled();
  });

  it("a session lookup failure retries", async () => {
    const d = deps({
      findSessionIdForPaymentIntent: vi.fn(async () => {
        throw new Error("stripe down");
      }),
    });
    const result = await handleChargeRefundedWithDeps(message(), charge([refund()]), d);
    expect(result).toEqual({ retry: true });
    expect(d.recordChargeRefund).not.toHaveBeenCalled();
  });

  it("a permanent SQL error settles the event with its state and acks", async () => {
    const d = deps({
      recordChargeRefund: vi.fn(async () => {
        throw pgError("23514", "check violation");
      }),
    });
    const result = await handleChargeRefundedWithDeps(message(), charge([refund()]), d);
    expect(result).toEqual({ ack: true });
    expect(d.eventSettle).toHaveBeenCalledWith("evt_ch_1", "23514");
  });

  it("a refund in a currency other than CHF is never written as rappen", async () => {
    const d = deps();
    const result = await handleChargeRefundedWithDeps(
      message(),
      charge([refund({ currency: "eur" })]),
      d,
    );
    expect(result).toEqual({ ack: true });
    expect(d.recordChargeRefund).not.toHaveBeenCalled();
    expect(d.eventSettle).toHaveBeenCalledWith("evt_ch_1", "non_chf_refund");
  });
});

describe("handleDisputeWithDeps", () => {
  const disputeMessage = message({ eventId: "evt_du_1", type: "charge.dispute.updated", objectId: "du_test_1" });

  it("upserts Stripe's dispute status keyed to the event's own timestamp", async () => {
    const d = deps();
    const result = await handleDisputeWithDeps(disputeMessage, dispute({ status: "under_review" }), d);
    expect(result).toEqual({ ack: true });
    expect(d.upsertDispute).toHaveBeenCalledWith({
      stripeDisputeId: "du_test_1",
      paymentIntentId: "pi_test_1",
      sessionId: "cs_test_1",
      status: "under_review",
      reason: "fraudulent",
      amountRappen: 6,
      stripeCreated: new Date(1_725_000_100 * 1000),
    });
    expect(d.eventSettle).toHaveBeenCalledWith("evt_du_1", null);
  });

  it("a non-CHF dispute amount is stored as null, never as rappen", async () => {
    const d = deps();
    await handleDisputeWithDeps(disputeMessage, dispute({ currency: "eur" }), d);
    expect(d.upsertDispute).toHaveBeenCalledWith(expect.objectContaining({ amountRappen: null }));
  });

  it("P0002 (payment not yet known) retries", async () => {
    const d = deps({
      upsertDispute: vi.fn(async () => {
        throw pgError("P0002", "payment_not_found");
      }),
    });
    const result = await handleDisputeWithDeps(disputeMessage, dispute(), d);
    expect(result).toEqual({ retry: true });
    expect(d.eventSettle).not.toHaveBeenCalled();
  });

  it("a permanent SQL error settles the event and acks", async () => {
    const d = deps({
      upsertDispute: vi.fn(async () => {
        throw pgError("22P02", "bad input");
      }),
    });
    const result = await handleDisputeWithDeps(disputeMessage, dispute(), d);
    expect(result).toEqual({ ack: true });
    expect(d.eventSettle).toHaveBeenCalledWith("evt_du_1", "22P02");
  });
});
