import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
const retrieved: { session: unknown; charge: unknown } = { session: null, charge: null };
// Phase 31-05: what public.stripe_charge_refunded_record answers in the real-deps test below.
const chargeRefundRow: { row: Record<string, unknown> | null } = { row: null };
const refundMails: unknown[][] = [];

vi.mock("../db/identity", () => ({
  asSystem: async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      sqlCalls.push({ text, values });
      if (text.includes("stripe_event_begin")) return Promise.resolve([{ should_process: true, reason: "ok" }]);
      if (text.includes("stripe_charge_refunded_record")) {
        return Promise.resolve(chargeRefundRow.row ? [chargeRefundRow.row] : []);
      }
      if (text.includes("checkout_payment_settle")) {
        return Promise.resolve([
          {
            booking_id: "b1",
            reference: "VT-1",
            locale: "en",
            contact_email: "a@example.test",
            already_settled: true,
            revived: false,
            duplicate: false,
            refund_required: false,
            refund_reason: null,
            payment_id: 1,
            charged_rappen: 8000,
            other_open_session_ids: [],
          },
        ]);
      }
      return Promise.resolve([]);
    };
    return fn(sql);
  },
}));

vi.mock("./stripe", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./stripe")>();
  return {
    ...actual,
    stripeFromEnv: () => ({}),
    retrieveCheckoutSession: async () => retrieved.session,
    retrieveCharge: async () => retrieved.charge,
    findSessionIdForPaymentIntent: async () => "cs_test_1",
  };
});

vi.mock("./refund-mail", () => ({
  mailCustomerRefund: async (...args: unknown[]) => {
    refundMails.push(args);
  },
  deliverRefundMailByClaim: async () => undefined,
}));
import {
  applyHandleResult,
  captureAllowed,
  chargeFactsFromSession,
  handleStripeMessage,
  handleStripeMessageWithDeps,
  metaPurchaseDepFor,
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

function chargeFixture(patch: Partial<Stripe.Charge> = {}): Stripe.Charge {
  return {
    id: "ch_test_1",
    object: "charge",
    payment_intent: "pi_test_1",
    currency: "chf",
    refunds: {
      object: "list",
      data: [{ id: "re_dash_1", amount: 6, currency: "chf", status: "succeeded", created: 1_725_000_050, metadata: {} }],
      has_more: false,
      url: "/v1/refunds",
    },
    ...patch,
  } as Stripe.Charge;
}

function disputeFixture(patch: Partial<Stripe.Dispute> = {}): Stripe.Dispute {
  return {
    id: "du_test_1",
    object: "dispute",
    payment_intent: "pi_test_1",
    charge: "ch_test_1",
    status: "needs_response",
    reason: "fraudulent",
    amount: 6,
    currency: "chf",
    ...patch,
  } as Stripe.Dispute;
}

function deps(patch: Partial<SettleDeps> = {}): SettleDeps & {
  begin: ReturnType<typeof vi.fn>;
  retrieveSession: ReturnType<typeof vi.fn>;
  settlePayment: ReturnType<typeof vi.fn>;
  eventSettle: ReturnType<typeof vi.fn>;
  eventClose: ReturnType<typeof vi.fn>;
  deliverConfirmation: ReturnType<typeof vi.fn>;
  provisionAccount: ReturnType<typeof vi.fn>;
  refund: ReturnType<typeof vi.fn>;
  recordDuplicateRefund: ReturnType<typeof vi.fn>;
  alertPaidAfterCancel: ReturnType<typeof vi.fn>;
  alertStuckPayment: ReturnType<typeof vi.fn>;
  expireSession: ReturnType<typeof vi.fn>;
  purgeOnSessionExpired: ReturnType<typeof vi.fn>;
  retrieveCharge: ReturnType<typeof vi.fn>;
  retrieveDispute: ReturnType<typeof vi.fn>;
  recordChargeRefund: ReturnType<typeof vi.fn>;
  upsertDispute: ReturnType<typeof vi.fn>;
} {
  const begin = vi.fn(async () => ({ should_process: true, reason: "ok" }));
  const retrieveSession = vi.fn(async () => session());
  const settlePayment = vi.fn(async () => settleRow());
  const eventSettle = vi.fn(async () => undefined);
  const eventClose = vi.fn(async () => undefined);
  const deliverConfirmation = vi.fn(async () => undefined);
  const provisionAccount = vi.fn(async () => "created");
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
    eventClose,
    deliverConfirmation,
    provisionAccount,
    refund,
    recordDuplicateRefund,
    alertPaidAfterCancel,
    alertStuckPayment,
    expireSession,
    purgeOnSessionExpired: vi.fn(async () => false),
    retrieveCharge: vi.fn(async () => chargeFixture()),
    retrieveDispute: vi.fn(async () => disputeFixture()),
    findSessionIdForPaymentIntent: vi.fn(async () => "cs_test_1"),
    recordChargeRefund: vi.fn(async () => ({ outcome: "recorded" })),
    upsertDispute: vi.fn(async () => undefined),
    emit: () => undefined,
    ...patch,
  } as SettleDeps & {
    begin: ReturnType<typeof vi.fn>;
    retrieveSession: ReturnType<typeof vi.fn>;
    settlePayment: ReturnType<typeof vi.fn>;
    eventSettle: ReturnType<typeof vi.fn>;
    eventClose: ReturnType<typeof vi.fn>;
    deliverConfirmation: ReturnType<typeof vi.fn>;
    provisionAccount: ReturnType<typeof vi.fn>;
    refund: ReturnType<typeof vi.fn>;
    recordDuplicateRefund: ReturnType<typeof vi.fn>;
    alertPaidAfterCancel: ReturnType<typeof vi.fn>;
    alertStuckPayment: ReturnType<typeof vi.fn>;
    expireSession: ReturnType<typeof vi.fn>;
    purgeOnSessionExpired: ReturnType<typeof vi.fn>;
    retrieveCharge: ReturnType<typeof vi.fn>;
    retrieveDispute: ReturnType<typeof vi.fn>;
    recordChargeRefund: ReturnType<typeof vi.fn>;
    upsertDispute: ReturnType<typeof vi.fn>;
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

  // 261005 review follow-up (U15, the other arrival order): the return route's event carries the
  // session's `created`, older than the webhook's. Webhook first, then return: begin() answers
  // superseded for the return event. It is closed (processed), never settled a second time.
  describe("261005 U15: a superseded event is closed", () => {
    it("stamps the superseded event processed (error null), then acks, with no second settle", async () => {
      const d = deps({
        begin: vi.fn(async () => ({ should_process: false, reason: "superseded" })),
      });
      const result = await handleStripeMessageWithDeps(message({ eventId: "return_cs_test_1" }), d);
      expect(result).toEqual({ ack: true });
      expect(d.eventSettle).toHaveBeenCalledTimes(1);
      expect(d.eventSettle).toHaveBeenCalledWith("return_cs_test_1", null);
      expect(d.settlePayment).not.toHaveBeenCalled();
      expect(d.deliverConfirmation).not.toHaveBeenCalled();
      expect(d.refund).not.toHaveBeenCalled();
    });

    it("retries when the stamp itself fails (the next begin() answers superseded again)", async () => {
      const d = deps({
        begin: vi.fn(async () => ({ should_process: false, reason: "superseded" })),
        eventSettle: vi.fn(async () => {
          throw new Error("connection lost");
        }),
      });
      const result = await handleStripeMessageWithDeps(message({ eventId: "return_cs_test_1" }), d);
      expect(result).toEqual({ retry: true });
      expect(d.settlePayment).not.toHaveBeenCalled();
    });

    it("already_processed is acked without a second stamp", async () => {
      const d = deps({
        begin: vi.fn(async () => ({ should_process: false, reason: "already_processed" })),
      });
      const result = await handleStripeMessageWithDeps(message(), d);
      expect(result).toEqual({ ack: true });
      expect(d.eventSettle).not.toHaveBeenCalled();
    });

    it("a paid error is never stamped processed: it is retried", async () => {
      const d = deps({
        settlePayment: vi.fn(async () => {
          throw Object.assign(new Error("check violated"), { code: "23514" });
        }),
      });
      const result = await handleStripeMessageWithDeps(message(), d);
      expect(result).toMatchObject({ retry: true });
      // The only stamp is the error record (non-null): processed_at stays null.
      for (const call of d.eventSettle.mock.calls) expect(call[1]).not.toBeNull();
    });
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

  it("retries on P0002; a permanent error is recorded and acked only when no money was captured", async () => {
    const retry = deps({
      settlePayment: vi.fn(async () => {
        const err = new Error("payment_not_found") as Error & { code: string };
        err.code = "P0002";
        throw err;
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), retry)).toEqual({ retry: true });
    expect(retry.eventSettle).not.toHaveBeenCalled();

    // 261002 settle safety: a paid session (money captured) is never acknowledged on a permanent
    // error; it is recorded and retried until the dead-letter queue sends the stuck-payment mail.
    const paid = deps({
      settlePayment: vi.fn(async () => {
        const err = new Error("one_success") as Error & { code: string };
        err.code = "23505";
        throw err;
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), paid)).toEqual({ retry: true, delaySeconds: 300 });
    expect(paid.eventSettle).toHaveBeenCalledWith("evt_1", "23505");

    // Nothing captured (an expired page): unchanged, recorded and acknowledged.
    const unpaid = deps({
      retrieveSession: vi.fn(async () => session({ status: "expired", payment_status: "unpaid" } as Partial<Stripe.Checkout.Session>)),
      settlePayment: vi.fn(async () => {
        throw Object.assign(new Error("invalid"), { code: "22023" });
      }),
    });
    expect(await handleStripeMessageWithDeps(message({ type: "checkout.session.expired" }), unpaid)).toEqual({ ack: true });
    // J2 (W4-09): closed (processed, reason kept), so the sweep never re-enqueues it.
    expect(unpaid.eventClose).toHaveBeenCalledWith("evt_1", "22023");
    expect(unpaid.eventSettle).not.toHaveBeenCalled();
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

  it("provisions the account once after the confirmation on a first settlement (26.5-05)", async () => {
    const order: string[] = [];
    const d = deps({
      deliverConfirmation: vi.fn(async () => void order.push("mail")),
      provisionAccount: vi.fn(async () => void order.push("account")),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
    expect(d.provisionAccount).toHaveBeenCalledTimes(1);
    expect(d.provisionAccount).toHaveBeenCalledWith(expect.objectContaining({ booking_id: expect.any(String) }));
    expect(order).toEqual(["mail", "account"]);
  });

  it("does not provision on already_settled or refund_required (26.5-05)", async () => {
    const settled = deps({ settlePayment: vi.fn(async () => settleRow({ already_settled: true })) });
    await handleStripeMessageWithDeps(message(), settled);
    expect(settled.provisionAccount).not.toHaveBeenCalled();
    const refunded = deps({
      settlePayment: vi.fn(async () => settleRow({ refund_required: true, refund_reason: "duplicate_charge" })),
    });
    await handleStripeMessageWithDeps(message(), refunded);
    expect(refunded.provisionAccount).not.toHaveBeenCalled();
  });

  it("a provisioning rejection or failed result still acks and emits with the booking id only (26.5-05)", async () => {
    for (const provisionAccount of [
      vi.fn(async () => {
        throw new Error("boom mia@example.com");
      }),
      vi.fn(async () => "failed"),
    ]) {
      const emit = vi.fn();
      const d = deps({ provisionAccount, emit });
      expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
      expect(emit).toHaveBeenCalledWith("error", "account_provision_failed", {
        bookingId: expect.any(String),
      });
      expect(JSON.stringify(emit.mock.calls)).not.toContain("mia@");
    }
  });

  it("a confirmation mail failure does not stop the account step (26.5-05)", async () => {
    const d = deps({
      deliverConfirmation: vi.fn(async () => {
        throw new Error("resend down");
      }),
    });
    await handleStripeMessageWithDeps(message(), d);
    expect(d.provisionAccount).toHaveBeenCalledTimes(1);
  });

  it("a confirmation e-mail failure acks like a success and emits an error (26.3 D-27)", async () => {
    const emit = vi.fn();
    const d = deps({
      deliverConfirmation: vi.fn(async () => {
        throw new Error("resend down");
      }),
      emit,
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(applyHandleResult({ ack: () => undefined, retry: () => undefined }, result)).toBe("acked");
    expect(emit).toHaveBeenCalledWith(
      "error",
      "confirmation_mail_failed",
      expect.objectContaining({ bookingId: expect.any(String) }),
    );
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

  it("a refunded duplicate settle reports settled.duplicate so the return route can say so (D-22, 26.1-16)", async () => {
    const d = deps({
      settlePayment: vi.fn(async () =>
        settleRow({
          already_settled: true,
          duplicate: true,
          refund_required: true,
          refund_reason: "duplicate_charge",
        }),
      ),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true, settled: { duplicate: true, revived: false } });
    expect(d.refund).toHaveBeenCalledTimes(1);
    expect(d.recordDuplicateRefund).toHaveBeenCalledTimes(1);
  });

  it("a duplicate whose refund failed does not claim a refund to the return route (D-22, 26.1-16)", async () => {
    const d = deps({
      refund: vi.fn(async () => {
        throw new Error("card_declined");
      }),
      settlePayment: vi.fn(async () =>
        settleRow({
          already_settled: true,
          duplicate: true,
          refund_required: true,
          refund_reason: "duplicate_charge",
        }),
      ),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    // J2 (W4-03): a refund that failed is retried (the event stays open), never acked.
    expect(result).toEqual({ retry: true });
    expect(d.eventSettle).not.toHaveBeenCalled();
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

  it("W4-03: a refund dep throw retries, leaves the event open and logs at error level (no alert mail per retry)", async () => {
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
    expect(result).toEqual({ retry: true });
    expect(emit).toHaveBeenCalledWith(
      "error",
      "refund_failed",
      expect.objectContaining({ eventId: "evt_1", reason: "duplicate_charge" }),
    );
    expect(d.recordDuplicateRefund).not.toHaveBeenCalled();
    // The event is NOT stamped processed: a redelivery or the sweep retries the refund.
    expect(d.eventSettle).not.toHaveBeenCalled();
    expect(d.eventClose).not.toHaveBeenCalled();
  });

  it("W4-03: a failed refund is made again on the next delivery, with the same idempotency key, and the event is closed only then", async () => {
    const refund = vi
      .fn()
      .mockRejectedValueOnce(new Error("stripe 503"))
      .mockResolvedValue({ id: "re_ok" });
    const d = deps({
      refund,
      // The settle answers the same refund order on every delivery (the SQL marker keeps the event open).
      settlePayment: vi.fn(async () =>
        settleRow({ refund_required: true, refund_reason: "paid_after_cancel", already_settled: false }),
      ),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true });
    expect(d.eventSettle).not.toHaveBeenCalled();
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
    expect(refund).toHaveBeenCalledTimes(2);
    const keys = refund.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys[0]).toBe(keys[1]);
    expect(keys[0]).toBe("refund:11111111-1111-1111-1111-111111111111:1:paid_after_cancel");
    expect(d.recordDuplicateRefund).toHaveBeenCalledTimes(1);
    expect(d.eventSettle).toHaveBeenCalledTimes(1);
    expect(d.eventSettle).toHaveBeenCalledWith("evt_1", null);
  });

  it("W4-03: a successful refund is not repeated once the event is closed (a redelivery is already_processed)", async () => {
    const d = deps({
      settlePayment: vi.fn(async () =>
        settleRow({ refund_required: true, refund_reason: "duplicate_charge", duplicate: true, already_settled: true }),
      ),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({
      ack: true,
      settled: { duplicate: true, revived: false },
    });
    expect(d.refund).toHaveBeenCalledTimes(1);
    expect(d.eventSettle).toHaveBeenCalledWith("evt_1", null);
    // The closed event: begin answers already_processed, nothing runs.
    d.begin.mockResolvedValueOnce({ should_process: false, reason: "already_processed" });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
    expect(d.refund).toHaveBeenCalledTimes(1);
    expect(d.settlePayment).toHaveBeenCalledTimes(1);
  });

  it("W4-03: a refund that landed but could not be stamped retries (the repeat refund is idempotent)", async () => {
    const d = deps({
      eventSettle: vi.fn(async () => {
        throw new Error("db down");
      }),
      settlePayment: vi.fn(async () => settleRow({ refund_required: true, refund_reason: "test_booking" })),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true });
    expect(d.recordDuplicateRefund).toHaveBeenCalledTimes(1);
  });

  it("W4-02: a paid-after-cancel mail that did not go out is an error log, the refund stays done and the event closes", async () => {
    const emit = vi.fn();
    const d = deps({
      emit,
      alertPaidAfterCancel: vi.fn(async () => {
        throw new Error("resend down");
      }),
      settlePayment: vi.fn(async () => settleRow({ refund_required: true, refund_reason: "paid_after_cancel" })),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
    expect(emit).toHaveBeenCalledWith("error", "paid_after_cancel_alert_failed", expect.objectContaining({ eventId: "evt_1" }));
    expect(d.eventSettle).toHaveBeenCalledWith("evt_1", null);
  });

  it("a null PaymentIntent id on a refund_required row never calls Stripe — alerts stuck payment, then closes the event and acks", async () => {
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
    expect(d.eventClose).toHaveBeenCalledWith("evt_1", "refund_required_no_payment_intent");
  });

  it("W4-02: a null PaymentIntent whose stuck-payment mail did not go out is NOT closed: it retries", async () => {
    const emit = vi.fn();
    const d = deps({
      emit,
      alertStuckPayment: vi.fn(async () => {
        throw new Error("resend down");
      }),
      retrieveSession: vi.fn(async () => session({ payment_intent: null })),
      settlePayment: vi.fn(async () => settleRow({ refund_required: true, refund_reason: "paid_after_cancel" })),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true });
    expect(d.eventClose).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith("error", "stuck_payment_alert_failed", expect.objectContaining({ eventId: "evt_1" }));
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

describe("handleStripeMessageWithDeps — charge.refunded and charge.dispute.* (26.1-08 D-07)", () => {
  const refunded = message({ eventId: "evt_ch_1", type: "charge.refunded", objectId: "ch_test_1" });

  it("retrieves the charge before begin so its pi_ joins the ordering window", async () => {
    const d = deps();
    const result = await handleStripeMessageWithDeps(refunded, d);
    expect(result).toEqual({ ack: true });
    expect(d.retrieveCharge).toHaveBeenCalledWith("ch_test_1");
    expect(d.begin).toHaveBeenCalledWith("evt_ch_1", ["ch_test_1", "pi_test_1"], expect.any(Date));
    const chargeAt = d.retrieveCharge.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    const beginAt = d.begin.mock.invocationCallOrder[0] ?? 0;
    expect(chargeAt).toBeLessThan(beginAt);
    expect(d.recordChargeRefund).toHaveBeenCalledWith(
      expect.objectContaining({ paymentIntentId: "pi_test_1", stripeRefundId: "re_dash_1", appSource: false }),
    );
    expect(d.settlePayment).not.toHaveBeenCalled();
    expect(d.retrieveSession).not.toHaveBeenCalled();
    expect(d.eventSettle).toHaveBeenCalledWith("evt_ch_1", null);
  });

  it("a charge retrieve failure retries without calling begin", async () => {
    const d = deps({
      retrieveCharge: vi.fn(async () => {
        throw new Error("stripe down");
      }),
    });
    const result = await handleStripeMessageWithDeps(refunded, d);
    expect(result).toEqual({ retry: true });
    expect(d.begin).not.toHaveBeenCalled();
  });

  it("app_refund_pending returns retry with delaySeconds 30", async () => {
    const d = deps({
      recordChargeRefund: vi.fn(async () => {
        throw Object.assign(new Error("app_refund_pending"), { code: "P0002" });
      }),
    });
    const result = await handleStripeMessageWithDeps(refunded, d);
    expect(result).toEqual({ retry: true, delaySeconds: 30 });
  });

  it("a superseded charge event is acked without recording", async () => {
    const d = deps({
      begin: vi.fn(async () => ({ should_process: false, reason: "superseded" })),
    });
    const result = await handleStripeMessageWithDeps(refunded, d);
    expect(result).toEqual({ ack: true });
    expect(d.recordChargeRefund).not.toHaveBeenCalled();
  });

  it.each(["charge.dispute.created", "charge.dispute.updated", "charge.dispute.closed"])(
    "%s retrieves the dispute, joins its pi_ to the window, upserts Stripe's status",
    async (type) => {
      const d = deps({
        retrieveDispute: vi.fn(async () => disputeFixture({ status: "won" })),
      });
      const result = await handleStripeMessageWithDeps(
        message({ eventId: "evt_du_1", type, objectId: "du_test_1" }),
        d,
      );
      expect(result).toEqual({ ack: true });
      expect(d.retrieveDispute).toHaveBeenCalledWith("du_test_1");
      expect(d.begin).toHaveBeenCalledWith("evt_du_1", ["du_test_1", "pi_test_1"], expect.any(Date));
      expect(d.upsertDispute).toHaveBeenCalledWith(
        expect.objectContaining({ stripeDisputeId: "du_test_1", status: "won", reason: "fraudulent", amountRappen: 6 }),
      );
      expect(d.settlePayment).not.toHaveBeenCalled();
    },
  );

  it("a dispute retrieve failure retries", async () => {
    const d = deps({
      retrieveDispute: vi.fn(async () => {
        throw new Error("stripe down");
      }),
    });
    const result = await handleStripeMessageWithDeps(
      message({ eventId: "evt_du_1", type: "charge.dispute.created", objectId: "du_test_1" }),
      d,
    );
    expect(result).toEqual({ retry: true });
    expect(d.begin).not.toHaveBeenCalled();
  });

  // J7 W6-05: the refund-update events are in the handled set. Their ordering window is the refund id alone, so a
  // later charge.refunded of another refund on the same PaymentIntent can never supersede (and drop) a failure.
  it.each(["refund.failed", "refund.updated", "charge.refund.updated"])(
    "%s is handled: the refund is re-read and a failed one is reversed (not ignored)",
    async (type) => {
      const recordRefundFailure = vi.fn(async () => ({ outcome: "reversed", reference: "VT-26-0101", alertPending: false }));
      const d = deps({
        retrieveRefund: vi.fn(async () => ({ id: "re_app_1", status: "failed", metadata: { vamos_source: "app" } }) as unknown as Stripe.Refund),
        recordRefundFailure,
      });
      const result = await handleStripeMessageWithDeps(
        message({ eventId: "evt_re_1", type, objectId: "re_app_1" }),
        d,
      );
      expect(result).toEqual({ ack: true });
      expect(d.begin).toHaveBeenCalledWith("evt_re_1", ["re_app_1"], expect.any(Date));
      expect(recordRefundFailure).toHaveBeenCalledWith(expect.objectContaining({ stripeRefundId: "re_app_1", status: "failed" }));
      expect(d.settlePayment).not.toHaveBeenCalled();
    },
  );

  it("other event types are still ignored (settled, acked, nothing retrieved)", async () => {
    const d = deps();
    const result = await handleStripeMessageWithDeps(
      message({ eventId: "evt_x", type: "charge.succeeded", objectId: "ch_test_9" }),
      d,
    );
    expect(result).toEqual({ ack: true });
    expect(d.retrieveCharge).not.toHaveBeenCalled();
    expect(d.recordChargeRefund).not.toHaveBeenCalled();
    expect(d.eventSettle).toHaveBeenCalledWith("evt_x", null);
  });
});

describe("applyHandleResult (worker queue loop)", () => {
  function queueMessage() {
    return { ack: vi.fn(), retry: vi.fn() };
  }

  it("passes delaySeconds through to message.retry for app_refund_pending", () => {
    const m = queueMessage();
    expect(applyHandleResult(m, { retry: true, delaySeconds: 30 })).toBe("retry");
    expect(m.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(m.ack).not.toHaveBeenCalled();
  });

  it("W4-06: a retry that names no delay waits (escalating by delivery), never an immediate redelivery", () => {
    const first = { ack: vi.fn(), retry: vi.fn(), attempts: 1 };
    expect(applyHandleResult(first, { retry: true })).toBe("retry");
    expect(first.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    const fifth = { ack: vi.fn(), retry: vi.fn(), attempts: 5 };
    applyHandleResult(fifth, { retry: true });
    expect(fifth.retry).toHaveBeenCalledWith({ delaySeconds: 300 });
    const unknown = queueMessage();
    applyHandleResult(unknown, { retry: true });
    expect(unknown.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
  });

  it("ack acks", () => {
    const m = queueMessage();
    expect(applyHandleResult(m, { ack: true })).toBe("acked");
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(m.retry).not.toHaveBeenCalled();
  });

  it("worker.ts routes every Stripe-event result through applyHandleResult", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "..", "..", "worker.ts"), "utf8");
    // J2: the loop moved to queue-consumers.ts (testable); the worker must still call it for every message.
    expect(src).toMatch(/consumeStripeEventMessage\(/);
    expect(src).toMatch(/consumeDlqMessage\(/);
    const consumers = readFileSync(join(here, "queue-consumers.ts"), "utf8");
    expect(consumers).toMatch(/applyHandleResult\(message, await run\(body\)\)/);
  });

  it("J2: the hourly cron runs the unprocessed-event sweep and both consumers set a retry delay", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const worker = readFileSync(join(here, "..", "..", "worker.ts"), "utf8");
    expect(worker).toMatch(/sweepUnprocessedEvents\(env\)/);
    // The sweep sits in the hourly path, after the 03:00 early return.
    expect(worker.indexOf("sweepUnprocessedEvents(env)")).toBeGreaterThan(worker.indexOf('controller.cron === "0 3 * * *"'));
    const wrangler = readFileSync(join(here, "..", "..", "wrangler.jsonc"), "utf8");
    // staging and production, main consumer and DLQ consumer: four retry_delay entries.
    expect(wrangler.match(/"retry_delay":\s*\d+/g)?.length).toBe(4);
    expect(wrangler.match(/"retry_delay":\s*30\b/g)?.length).toBe(2);
  });
});

describe("J2 W4-04: charge and dispute ids are chosen by the event type, not by a prefix", () => {
  const chargeMsg = (objectId: string) => message({ type: "charge.refunded", objectId, eventId: "evt_ch" });
  const disputeMsg = (objectId: string, type = "charge.dispute.created") =>
    message({ type, objectId, eventId: "evt_dp" } as Partial<StripeQueueMessage>);

  it.each(["ch_3Abc123", "py_3Abc123"])("a charge.refunded for %s is re-read from Stripe and recorded", async (id) => {
    const d = deps();
    const result = await handleStripeMessageWithDeps(chargeMsg(id), d);
    expect(result).toEqual({ ack: true });
    expect(d.retrieveCharge).toHaveBeenCalledWith(id);
    expect(d.recordChargeRefund).toHaveBeenCalledTimes(1);
    expect(d.eventSettle).toHaveBeenCalledWith("evt_ch", null);
  });

  it.each(["du_1Abc", "dp_1Abc"])("a dispute event for %s is re-read from Stripe and upserted", async (id) => {
    const d = deps();
    const result = await handleStripeMessageWithDeps(disputeMsg(id), d);
    expect(result).toEqual({ ack: true });
    expect(d.retrieveDispute).toHaveBeenCalledWith(id);
    expect(d.upsertDispute).toHaveBeenCalledTimes(1);
    expect(d.eventSettle).toHaveBeenCalledWith("evt_dp", null);
  });

  it.each([
    ["charge.refunded", "re_123"],
    ["charge.refunded", "pi_123"],
    ["charge.refunded", ""],
    ["charge.dispute.closed", "ch_123"],
    ["charge.dispute.updated", "xx_123"],
  ])("%s with the object id %j is an error that retries and alerts: never stamped processed, never acked", async (type, id) => {
    const emit = vi.fn();
    const d = deps({ emit });
    const result = await handleStripeMessageWithDeps(message({ type, objectId: id, eventId: "evt_bad" } as Partial<StripeQueueMessage>), d);
    expect(result).toEqual({ retry: true });
    expect(emit).toHaveBeenCalledWith("error", "stripe_event_unknown_object_id", expect.objectContaining({ eventId: "evt_bad" }));
    // The reason is written on the event (open), and it is never stamped processed or closed.
    expect(d.eventSettle).toHaveBeenCalledWith("evt_bad", "unknown_object_id");
    expect(d.eventSettle).not.toHaveBeenCalledWith("evt_bad", null);
    expect(d.eventClose).not.toHaveBeenCalled();
    expect(d.retrieveCharge).not.toHaveBeenCalled();
    expect(d.retrieveDispute).not.toHaveBeenCalled();
    expect(d.begin).not.toHaveBeenCalled();
  });

  it("a poison body without an object id retries and logs; it does not throw a TypeError", async () => {
    const d = deps();
    const result = await handleStripeMessageWithDeps({ eventId: "evt_p", type: "charge.refunded", stripeCreated: 1 } as unknown as StripeQueueMessage, d);
    expect(result).toEqual({ retry: true });
  });
});

describe("J2 W4-14 / W4-02: nothing fails silently", () => {
  it("a Stripe read that fails is logged and retried", async () => {
    const emit = vi.fn();
    const d = deps({
      emit,
      retrieveSession: vi.fn(async () => {
        throw new Error("stripe 503");
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true });
    expect(emit).toHaveBeenCalledWith("warn", "stripe_read_failed", expect.objectContaining({ kind: "session" }));
  });

  it("a permanent database error after capture is logged at error level with its SQLSTATE", async () => {
    const emit = vi.fn();
    const d = deps({
      emit,
      settlePayment: vi.fn(async () => {
        throw Object.assign(new Error("one_success"), { code: "23505" });
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true, delaySeconds: 300 });
    expect(emit).toHaveBeenCalledWith("error", "settle_failed_paid", expect.objectContaining({ sqlstate: "23505", sqlstateClass: "23" }));
  });

  it("the overlap must-fix mail failing is an error log (settle rolled back, retried by the queue)", async () => {
    // production wiring: settlePayment catches 23P01 for an extra session and logs when the mail fails.
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "settle.ts"), "utf8");
    expect(src).toMatch(/overlap_must_fix_alert_failed/);
  });
});


describe("settle stores the presentment currency (D-21)", () => {
  async function settleWith(patch: Partial<Stripe.Checkout.Session>) {
    sqlCalls.length = 0;
    retrieved.session = session(patch);
    await handleStripeMessage({} as CloudflareEnv, message());
    const call = sqlCalls.find((c) => c.text.includes("checkout_payment_settle"));
    expect(call).toBeDefined();
    return call!.values;
  }

  it("passes the EUR amount and currency to checkout_payment_settle", async () => {
    const values = await settleWith({
      amount_total: 8000,
      presentment_details: { presentment_amount: 9000, presentment_currency: "eur" },
    } as Partial<Stripe.Checkout.Session>);
    expect(values.slice(8, 10)).toEqual([9000, "EUR"]);
  });

  it("passes null and null for a CHF presentment", async () => {
    const values = await settleWith({
      presentment_details: { presentment_amount: 8000, presentment_currency: "chf" },
    } as Partial<Stripe.Checkout.Session>);
    expect(values.slice(8, 10)).toEqual([null, null]);
  });
});

describe("J3 W4-07 / W5-02: what Stripe collected is compared with the payment row", () => {
  async function settleWith(patch: Partial<Stripe.Checkout.Session>) {
    sqlCalls.length = 0;
    retrieved.session = session(patch);
    await handleStripeMessage({} as CloudflareEnv, message());
    const call = sqlCalls.find((c) => c.text.includes("checkout_payment_settle"));
    expect(call).toBeDefined();
    return call!.values;
  }

  it("passes the session's total, its currency, the PaymentIntent's amount_received and the metadata booking id", async () => {
    const values = await settleWith({
      amount_total: 8000,
      currency: "chf",
      metadata: { booking_id: "11111111-1111-4111-8111-111111111111" },
      payment_intent: { id: "pi_test_1", status: "succeeded", amount_received: 8000, currency: "chf" },
    } as unknown as Partial<Stripe.Checkout.Session>);
    expect(values.slice(10)).toEqual([8000, "CHF", 8000, "11111111-1111-4111-8111-111111111111"]);
  });

  it("an unexpanded PaymentIntent leaves amount_received null (the database skips that check)", async () => {
    const values = await settleWith({ amount_total: 8000, currency: "chf", payment_intent: "pi_test_1" } as Partial<Stripe.Checkout.Session>);
    expect(values.slice(10)).toEqual([8000, "CHF", null, null]);
  });

  it("a legitimate EUR presentment of a CHF charge sends the CHF facts: it is not a mismatch", async () => {
    const values = await settleWith({
      amount_total: 8000,
      currency: "chf",
      presentment_details: { presentment_amount: 9000, presentment_currency: "eur" },
      payment_intent: { id: "pi_test_1", status: "succeeded", amount_received: 8000, currency: "chf" },
    } as unknown as Partial<Stripe.Checkout.Session>);
    expect(values.slice(8, 10)).toEqual([9000, "EUR"]);
    expect(values.slice(10, 13)).toEqual([8000, "CHF", 8000]);
  });

  describe("chargeFactsFromSession", () => {
    it("a processing PaymentIntent (amount_received 0) is not read", () => {
      const f = chargeFactsFromSession({
        amount_total: 8000,
        currency: "chf",
        payment_intent: { id: "pi_1", status: "processing", amount_received: 0, currency: "chf" },
      } as unknown as Stripe.Checkout.Session);
      expect(f.amountReceivedMinor).toBeNull();
      expect(f.amountTotalMinor).toBe(8000);
    });

    it("a PaymentIntent in another currency is not compared with the session total", () => {
      const f = chargeFactsFromSession({
        amount_total: 8000,
        currency: "chf",
        payment_intent: { id: "pi_1", status: "succeeded", amount_received: 9000, currency: "eur" },
      } as unknown as Stripe.Checkout.Session);
      expect(f.amountReceivedMinor).toBeNull();
    });

    it("the old Adaptive Pricing shape (currency_conversion): the creation currency and total are the charge, the PaymentIntent is not read", () => {
      const f = chargeFactsFromSession({
        amount_total: 9000,
        currency: "eur",
        currency_conversion: { source_currency: "chf", amount_total: 8000, amount_subtotal: 8000, fx_rate: "1.125" },
        payment_intent: { id: "pi_1", status: "succeeded", amount_received: 9000, currency: "eur" },
      } as unknown as Stripe.Checkout.Session);
      expect(f).toEqual({ amountTotalMinor: 8000, currency: "CHF", amountReceivedMinor: null, metadataBookingId: null });
    });

    it("a session without a currency or total gives nulls, never a made-up number", () => {
      expect(chargeFactsFromSession({ metadata: {} } as unknown as Stripe.Checkout.Session)).toEqual({
        amountTotalMinor: null,
        currency: null,
        amountReceivedMinor: null,
        metadataBookingId: null,
      });
      expect(chargeFactsFromSession(null).amountTotalMinor).toBeNull();
    });
  });

  it("an expired / failed event sends no amount facts (nothing was collected)", async () => {
    sqlCalls.length = 0;
    retrieved.session = session({ status: "expired", payment_status: "unpaid", amount_total: 8000, currency: "chf" } as Partial<Stripe.Checkout.Session>);
    await handleStripeMessage({} as CloudflareEnv, message({ type: "checkout.session.expired" }));
    const call = sqlCalls.find((c) => c.text.includes("checkout_payment_settle"));
    expect(call?.values.slice(10)).toEqual([null, null, null, null]);
  });

  describe("a mismatch row", () => {
    const mismatchRow = () => settleRow({ already_settled: true, amount_mismatch: true });

    it("mails ops (ids only), closes the event, and does NOT confirm, provision, refund or send the Purchase", async () => {
      const alertAmountMismatch = vi.fn(async () => undefined);
      const sendMetaPurchase = vi.fn(async () => undefined);
      const emit = vi.fn();
      const d = deps({
        emit,
        alertAmountMismatch,
        sendMetaPurchase,
        settlePayment: vi.fn(async () => settleRow({ already_settled: true, amount_mismatch: true, other_open_session_ids: ["cs_other"] })),
      });
      expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
      expect(alertAmountMismatch).toHaveBeenCalledWith({
        eventId: "evt_1",
        type: "checkout.session.completed",
        objectId: "cs_test_1",
        reference: "VT-1",
      });
      expect(d.eventClose).toHaveBeenCalledWith("evt_1", "amount_mismatch");
      expect(d.deliverConfirmation).not.toHaveBeenCalled();
      expect(d.provisionAccount).not.toHaveBeenCalled();
      expect(d.refund).not.toHaveBeenCalled();
      expect(sendMetaPurchase).not.toHaveBeenCalled();
      expect(emit).toHaveBeenCalledWith("error", "amount_mismatch", expect.objectContaining({ eventId: "evt_1" }));
      // the other open pages are still expired, so nobody can pay the held booking a second time
      expect(d.expireSession).toHaveBeenCalledWith("cs_other");
    });

    it("a mail that did not go out keeps the event OPEN and retries; the next delivery mails again", async () => {
      const alertAmountMismatch = vi
        .fn()
        .mockRejectedValueOnce(new Error("resend down"))
        .mockResolvedValue(undefined);
      const d = deps({ alertAmountMismatch, settlePayment: vi.fn(async () => mismatchRow()) });
      expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true });
      expect(d.eventClose).not.toHaveBeenCalled();
      expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
      expect(d.eventClose).toHaveBeenCalledWith("evt_1", "amount_mismatch");
      expect(alertAmountMismatch).toHaveBeenCalledTimes(2);
    });

    it("an ordinary settled row (no mismatch) is unchanged: confirmation, no mismatch mail", async () => {
      const alertAmountMismatch = vi.fn(async () => undefined);
      const d = deps({ alertAmountMismatch, settlePayment: vi.fn(async () => settleRow()) });
      expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
      expect(alertAmountMismatch).not.toHaveBeenCalled();
      expect(d.deliverConfirmation).toHaveBeenCalledTimes(1);
    });

    it("production wiring mails through deliverAmountMismatchAlert", async () => {
      const { readFileSync } = await import("node:fs");
      const { dirname, join } = await import("node:path");
      const { fileURLToPath } = await import("node:url");
      const here = dirname(fileURLToPath(import.meta.url));
      expect(readFileSync(join(here, "settle.ts"), "utf8")).toMatch(/alertAmountMismatch: \(input\) => deliverAmountMismatchAlert\(env, input\)/);
    });
  });
});

describe("26.3-12 purge on expired, refund when the booking is gone (D-25, Pitfall 7)", () => {
  const expiredMsg = () => message({ type: "checkout.session.expired" } as Partial<StripeQueueMessage>);

  it("purges after the payment row is marked failed, and acks", async () => {
    const d = deps({
      retrieveSession: vi.fn(async () => session({ status: "expired", payment_status: "unpaid" } as Partial<Stripe.Checkout.Session>)),
    });
    expect(await handleStripeMessageWithDeps(expiredMsg(), d)).toEqual({ ack: true });
    expect(d.settlePayment.mock.calls[0]?.[0].outcome).toBe("failed");
    expect(d.purgeOnSessionExpired).toHaveBeenCalledWith("cs_test_1", "11111111-1111-1111-1111-111111111111");
    expect(d.deliverConfirmation).not.toHaveBeenCalled();
  });

  it("acks even when the purge helper throws", async () => {
    const d = deps({
      retrieveSession: vi.fn(async () => session({ status: "expired", payment_status: "unpaid" } as Partial<Stripe.Checkout.Session>)),
      purgeOnSessionExpired: vi.fn(async () => {
        throw new Error("x");
      }),
    });
    expect(await handleStripeMessageWithDeps(expiredMsg(), d)).toEqual({ ack: true });
  });

  it("does not purge on a completed event", async () => {
    const d = deps();
    await handleStripeMessageWithDeps(message(), d);
    expect(d.purgeOnSessionExpired).not.toHaveBeenCalled();
  });

  function missing(created: number | undefined, patch: Partial<Stripe.Checkout.Session> = {}, depsPatch: Partial<SettleDeps> = {}) {
    return deps({
      retrieveSession: vi.fn(async () =>
        session({ created, metadata: { booking_id: "quote-1" }, ...patch } as Partial<Stripe.Checkout.Session>),
      ),
      settlePayment: vi.fn(async () => {
        throw Object.assign(new Error("payment_not_found"), { code: "P0002" });
      }),
      ...depsPatch,
    });
  }
  const OLD = Math.floor(Date.now() / 1000) - 3600;

  it("refunds a paid session whose booking is gone, with a valid reason, alerts and acks", async () => {
    const d = missing(OLD);
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
    const arg = d.refund.mock.calls[0]?.[0];
    expect(arg.paymentIntentId).toBe("pi_test_1");
    expect(arg.metadata).toEqual({ vamos_reason: "booking_missing" });
    expect(d.alertStuckPayment).toHaveBeenCalled();
    expect(d.eventClose).toHaveBeenCalledWith("evt_1", "booking_missing");
  });

  it("W4-03: a refund that Stripe refused is retried (the event stays open), logged at error level", async () => {
    const d = missing(OLD);
    d.refund.mockRejectedValueOnce(new Error("stripe down"));
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true });
    expect(d.eventClose).not.toHaveBeenCalled();
    expect(d.eventSettle).not.toHaveBeenCalled();
  });

  it("W4-03: the repeat refund of a booking-missing payment uses the same stable idempotency key", async () => {
    const d = missing(OLD);
    d.refund.mockRejectedValueOnce(new Error("stripe down"));
    await handleStripeMessageWithDeps(message(), d);
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
    const keys = d.refund.mock.calls.map((c) => c[0].idempotencyKey);
    expect(keys).toEqual(["refund:missing-booking:cs_test_1", "refund:missing-booking:cs_test_1"]);
    expect(d.eventClose).toHaveBeenCalledWith("evt_1", "booking_missing");
  });

  it("W4-02: a booking-missing refund whose stuck-payment mail did not go out is not closed: it retries", async () => {
    const d = missing(OLD, {}, {
      alertStuckPayment: vi.fn(async () => {
        throw new Error("resend down");
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true });
    expect(d.eventClose).not.toHaveBeenCalled();
  });

  it("retries a young session (intent transaction may not be committed)", async () => {
    const d = missing(Math.floor(Date.now() / 1000) - 5);
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true });
    expect(d.refund).not.toHaveBeenCalled();
  });

  it("never refunds an ops extra session or an unpaid one", async () => {
    const extra = missing(OLD, { metadata: { kind: "extra" } } as Partial<Stripe.Checkout.Session>);
    expect(await handleStripeMessageWithDeps(message(), extra)).toEqual({ retry: true });
    const unpaid = missing(OLD, { payment_status: "unpaid" } as Partial<Stripe.Checkout.Session>);
    await handleStripeMessageWithDeps(message(), unpaid);
    expect(extra.refund).not.toHaveBeenCalled();
    expect(unpaid.refund).not.toHaveBeenCalled();
  });
});

describe("261002 settle safety: a database hiccup is retried, never acknowledged", () => {
  const sqlErr = (code: string) => Object.assign(new Error(`pg ${code}`), { code });
  const expiredMsg = () => message({ type: "checkout.session.expired" } as Partial<StripeQueueMessage>);
  const expiredSession = () =>
    session({ status: "expired", payment_status: "unpaid" } as Partial<Stripe.Checkout.Session>);

  it("begin: a deadlock retries after 5 s and records nothing", async () => {
    const d = deps({
      begin: vi.fn(async () => {
        throw sqlErr("40P01");
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true, delaySeconds: 5 });
    expect(d.eventSettle).not.toHaveBeenCalled();
    expect(d.settlePayment).not.toHaveBeenCalled();
  });

  it("begin: an error with no code, and a permanent code, retry after 60 s without recording", async () => {
    const plain = deps({
      begin: vi.fn(async () => {
        throw new Error("socket hang up");
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), plain)).toEqual({ retry: true, delaySeconds: 60 });
    expect(plain.eventSettle).not.toHaveBeenCalled();
    const permanent = deps({
      begin: vi.fn(async () => {
        throw sqlErr("42501");
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), permanent)).toEqual({ retry: true, delaySeconds: 60 });
    expect(permanent.eventSettle).not.toHaveBeenCalled();
  });

  it("begin: P0002 still retries with the queue's default backoff", async () => {
    const d = deps({
      begin: vi.fn(async () => {
        throw sqlErr("P0002");
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true });
  });

  it("settle: a deadlock retries after 5 s and never records the event as failed", async () => {
    const d = deps({
      settlePayment: vi.fn(async () => {
        throw sqlErr("40P01");
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true, delaySeconds: 5 });
    expect(d.eventSettle).not.toHaveBeenCalled();
  });

  it("settle: a dropped connection, a connection-class error and a plain Error retry after 60 s", async () => {
    for (const err of [
      Object.assign(new Error("closed"), { code: "CONNECTION_CLOSED" }),
      sqlErr("08006"),
      new Error("boom"),
    ]) {
      const d = deps({
        settlePayment: vi.fn(async () => {
          throw err;
        }),
      });
      expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true, delaySeconds: 60 });
      expect(d.eventSettle).not.toHaveBeenCalled();
    }
  });

  it("settle: a paid difference page that fails on P0001 is recorded and retried after 300 s", async () => {
    const d = deps({
      retrieveSession: vi.fn(async () =>
        session({ metadata: { kind: "extra", booking_id: "b1" } } as Partial<Stripe.Checkout.Session>),
      ),
      settlePayment: vi.fn(async () => {
        throw sqlErr("P0001");
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true, delaySeconds: 300 });
    expect(d.eventSettle).toHaveBeenCalledWith("evt_1", "P0001");
  });

  it("settle: a paid page whose eventSettle also fails still retries after 300 s", async () => {
    const d = deps({
      settlePayment: vi.fn(async () => {
        throw sqlErr("23505");
      }),
      eventSettle: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true, delaySeconds: 300 });
  });

  it("settle: an expired page (nothing captured) that fails on 22023 is recorded and acked", async () => {
    const d = deps({
      retrieveSession: vi.fn(async () => expiredSession()),
      settlePayment: vi.fn(async () => {
        throw sqlErr("22023");
      }),
    });
    expect(await handleStripeMessageWithDeps(expiredMsg(), d)).toEqual({ ack: true });
    expect(d.eventClose).toHaveBeenCalledWith("evt_1", "22023");
  });

  it("settle: an expired page whose close fails retries (unchanged)", async () => {
    const d = deps({
      retrieveSession: vi.fn(async () => expiredSession()),
      settlePayment: vi.fn(async () => {
        throw sqlErr("22023");
      }),
      eventClose: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    expect(await handleStripeMessageWithDeps(expiredMsg(), d)).toEqual({ retry: true });
  });
});

describe("261002 settle safety: an unpaid difference page that belongs to no request", () => {
  const sqlErr = (code: string) => Object.assign(new Error(`pg ${code}`), { code });
  const expiredMsg = () => message({ type: "checkout.session.expired" } as Partial<StripeQueueMessage>);
  const extraSession = (patch: Partial<Stripe.Checkout.Session> = {}) =>
    session({ metadata: { kind: "extra", booking_id: "b1" }, ...patch } as Partial<Stripe.Checkout.Session>);
  const expiredExtra = () => extraSession({ status: "expired", payment_status: "unpaid" } as Partial<Stripe.Checkout.Session>);

  it("an expired difference page with no request is recorded as no_request and acked, no alert", async () => {
    const d = deps({
      retrieveSession: vi.fn(async () => expiredExtra()),
      settlePayment: vi.fn(async () => {
        throw sqlErr("P0002");
      }),
    });
    expect(await handleStripeMessageWithDeps(expiredMsg(), d)).toEqual({ ack: true });
    expect(d.eventClose).toHaveBeenCalledWith("evt_1", "no_request");
    expect(d.alertStuckPayment).not.toHaveBeenCalled();
    expect(d.refund).not.toHaveBeenCalled();
  });

  it("if recording no_request fails the message is retried", async () => {
    const d = deps({
      retrieveSession: vi.fn(async () => expiredExtra()),
      settlePayment: vi.fn(async () => {
        throw sqlErr("P0002");
      }),
      eventClose: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    expect(await handleStripeMessageWithDeps(expiredMsg(), d)).toEqual({ retry: true });
  });

  it("a PAID difference page with no request yet still retries (the request may not be committed)", async () => {
    const d = deps({
      retrieveSession: vi.fn(async () => extraSession()),
      settlePayment: vi.fn(async () => {
        throw sqlErr("P0002");
      }),
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true });
    expect(d.eventSettle).not.toHaveBeenCalled();
  });
});

describe("261002 settle safety: a difference that settled but was not applied (T1 mail)", () => {
  const extraSession = () =>
    session({ metadata: { kind: "extra", booking_id: "b1" } } as Partial<Stripe.Checkout.Session>);
  type ExtraDeps = ReturnType<typeof deps> & {
    afterExtraApplied: ReturnType<typeof vi.fn>;
    alertDifferenceNotApplied: ReturnType<typeof vi.fn>;
  };
  const extraDeps = (row: SettleRow, patch: Partial<SettleDeps> = {}): ExtraDeps =>
    deps({
      retrieveSession: vi.fn(async () => extraSession()),
      settlePayment: vi.fn(async () => row),
      afterExtraApplied: vi.fn(async () => undefined),
      alertDifferenceNotApplied: vi.fn(async () => undefined),
      ...patch,
    }) as ExtraDeps;

  it("applied = false and not already settled: one alert with the row, no change mail, ack", async () => {
    const row = settleRow({ applied: false, already_settled: false });
    const d = extraDeps(row);
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
    expect(d.alertDifferenceNotApplied).toHaveBeenCalledTimes(1);
    expect(d.alertDifferenceNotApplied).toHaveBeenCalledWith(row);
    expect(d.afterExtraApplied).not.toHaveBeenCalled();
    expect(d.deliverConfirmation).not.toHaveBeenCalled();
  });

  it("applied = true: the change mail goes out, no alert", async () => {
    const d = extraDeps(settleRow({ applied: true, already_settled: false }));
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
    expect(d.afterExtraApplied).toHaveBeenCalledTimes(1);
    expect(d.alertDifferenceNotApplied).not.toHaveBeenCalled();
  });

  it("already settled: neither mail", async () => {
    const d = extraDeps(settleRow({ applied: false, already_settled: true }));
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
    expect(d.afterExtraApplied).not.toHaveBeenCalled();
    expect(d.alertDifferenceNotApplied).not.toHaveBeenCalled();
  });

  it("a refund-required difference row (refunded by the refund branch) sends no alert from this branch", async () => {
    const d = extraDeps(
      settleRow({ applied: false, already_settled: false, refund_required: true, refund_reason: "paid_after_cancel" }),
    );
    await handleStripeMessageWithDeps(message(), d);
    expect(d.alertDifferenceNotApplied).not.toHaveBeenCalled();
  });

  it("a failing alert still acks and emits an error with the booking id only", async () => {
    const emit = vi.fn();
    const d = extraDeps(settleRow({ applied: false, already_settled: false }), {
      alertDifferenceNotApplied: vi.fn(async () => {
        throw new Error("resend down");
      }),
      emit,
    });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
    expect(emit).toHaveBeenCalledWith("error", "difference_not_applied_alert_failed", {
      bookingId: "11111111-1111-1111-1111-111111111111",
    });
  });

  it("an ordinary (non-difference) settle never sends the alert", async () => {
    const d = deps({ alertDifferenceNotApplied: vi.fn(async () => undefined) });
    await handleStripeMessageWithDeps(message(), d);
    expect(d.alertDifferenceNotApplied).not.toHaveBeenCalled();
  });

  it("production wiring sends the T1 mail through deliverDifferenceNotAppliedAlert", () => {
    const src = readFileSync(new URL("./settle.ts", import.meta.url), "utf8");
    expect(src).toContain("alertDifferenceNotApplied: (row) => deliverDifferenceNotAppliedAlert(env, row.booking_id)");
  });
});

describe("meta purchase (Phase 29)", () => {
  const purchaseInput = (patch = {}) => ({
    bookingId: "11111111-1111-1111-1111-111111111111",
    paymentId: 1,
    livemode: false,
    refundRequired: false,
    reference: "VT-1", // sent on to Meta as order_id only when the owner's 2026-10-09 wording is live
    ...patch,
  });

  it("calls the dep once after a first succeeded settle", async () => {
    const send = vi.fn(async () => undefined);
    const d = deps({ sendMetaPurchase: send });
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(purchaseInput());
  });

  it("still calls it when the return route settled first (already_settled)", async () => {
    const send = vi.fn(async () => undefined);
    const d = deps({ sendMetaPurchase: send, settlePayment: vi.fn(async () => settleRow({ already_settled: true })) });
    await handleStripeMessageWithDeps(message(), d);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("passes refundRequired true for a refunded payment, after the refund", async () => {
    const order: string[] = [];
    const d = deps({
      sendMetaPurchase: vi.fn(async () => {
        order.push("purchase");
      }),
      settlePayment: vi.fn(async () => settleRow({ refund_required: true, refund_reason: "duplicate_charge" })),
    });
    d.refund.mockImplementation(async () => {
      order.push("refund");
      return { id: "re_1" };
    });
    await handleStripeMessageWithDeps(message(), d);
    expect(order).toEqual(["refund", "purchase"]);
    expect(d.sendMetaPurchase).toHaveBeenCalledWith(purchaseInput({ refundRequired: true }));
  });

  it("never calls it for an extra", async () => {
    const send = vi.fn(async () => undefined);
    const d = deps({
      sendMetaPurchase: send,
      retrieveSession: vi.fn(async () => session({ metadata: { kind: "extra" } } as Partial<Stripe.Checkout.Session>)),
    });
    await handleStripeMessageWithDeps(message(), d);
    expect(send).not.toHaveBeenCalled();
  });

  it("never calls it for failed, expired or money events", async () => {
    const send = vi.fn(async () => undefined);
    await handleStripeMessageWithDeps(
      message(),
      deps({
        sendMetaPurchase: send,
        retrieveSession: vi.fn(async () => session({ payment_status: "unpaid" } as Partial<Stripe.Checkout.Session>)),
      }),
    );
    await handleStripeMessageWithDeps(
      message({ type: "checkout.session.expired" }),
      deps({
        sendMetaPurchase: send,
        retrieveSession: vi.fn(async () => session({ status: "expired", payment_status: "unpaid" } as Partial<Stripe.Checkout.Session>)),
      }),
    );
    await handleStripeMessageWithDeps(
      message({ type: "charge.refunded", objectId: "ch_test_1" }),
      deps({ sendMetaPurchase: send }),
    );
    await handleStripeMessageWithDeps(
      message({ type: "charge.dispute.created", objectId: "du_test_1" }),
      deps({ sendMetaPurchase: send }),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("maps session.livemode to livemode, false when absent", async () => {
    const live = vi.fn(async () => undefined);
    await handleStripeMessageWithDeps(
      message(),
      deps({ sendMetaPurchase: live, retrieveSession: vi.fn(async () => session({ livemode: true } as Partial<Stripe.Checkout.Session>)) }),
    );
    expect(live).toHaveBeenCalledWith(purchaseInput({ livemode: true }));
    const test = vi.fn(async () => undefined);
    await handleStripeMessageWithDeps(
      message(),
      deps({ sendMetaPurchase: test, retrieveSession: vi.fn(async () => session({ livemode: false } as Partial<Stripe.Checkout.Session>)) }),
    );
    expect(test).toHaveBeenCalledWith(purchaseInput({ livemode: false }));
  });

  it("never calls it for payment_id 0", async () => {
    const send = vi.fn(async () => undefined);
    await handleStripeMessageWithDeps(
      message(),
      deps({ sendMetaPurchase: send, settlePayment: vi.fn(async () => settleRow({ payment_id: 0 })) }),
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("a throwing or rejecting dep leaves the result identical and emits meta_purchase_failed", async () => {
    for (const fail of [
      vi.fn(() => {
        throw new Error("boom");
      }),
      vi.fn(async () => {
        throw new Error("boom");
      }),
    ]) {
      const emit = vi.fn();
      const plain = await handleStripeMessageWithDeps(message(), deps());
      const withDep = await handleStripeMessageWithDeps(message(), deps({ sendMetaPurchase: fail, emit }));
      expect(withDep).toEqual(plain);
      expect(emit).toHaveBeenCalledWith("error", "meta_purchase_failed", { bookingId: "11111111-1111-1111-1111-111111111111" });
    }
    const dup = () =>
      settleRow({ already_settled: true, duplicate: true, refund_required: true, refund_reason: "duplicate_charge" });
    const plainDup = await handleStripeMessageWithDeps(message(), deps({ settlePayment: vi.fn(async () => dup()) }));
    const failDup = await handleStripeMessageWithDeps(
      message(),
      deps({
        settlePayment: vi.fn(async () => dup()),
        sendMetaPurchase: vi.fn(async () => {
          throw new Error("boom");
        }),
      }),
    );
    expect(failDup).toEqual(plainDup);
    expect(failDup).toEqual({ ack: true, settled: { duplicate: true, revived: false } });
  });

  it("absent dep: same result, no error", async () => {
    const emit = vi.fn();
    expect(await handleStripeMessageWithDeps(message(), deps({ emit }))).toEqual({ ack: true });
    expect(emit).not.toHaveBeenCalledWith("error", "meta_purchase_failed", expect.anything());
  });

  it("runs after every other open session was expired", async () => {
    const order: string[] = [];
    const d = deps({
      sendMetaPurchase: vi.fn(async () => {
        order.push("purchase");
      }),
      settlePayment: vi.fn(async () => settleRow({ other_open_session_ids: ["cs_a", "cs_b"] })),
    });
    d.expireSession.mockImplementation(async (id: string) => {
      order.push(id);
    });
    await handleStripeMessageWithDeps(message(), d);
    expect(order).toEqual(["cs_a", "cs_b", "purchase"]);
  });

  it("metaPurchaseDepFor builds the dep only when the caller opts in", () => {
    const emit = vi.fn();
    const env = {} as CloudflareEnv;
    expect(metaPurchaseDepFor(env, undefined, emit)).toBeUndefined();
    expect(metaPurchaseDepFor(env, {}, emit)).toBeUndefined();
    expect(metaPurchaseDepFor(env, { metaPurchase: false }, emit)).toBeUndefined();
    expect(typeof metaPurchaseDepFor(env, { metaPurchase: true }, emit)).toBe("function");
  });
});

describe("261005 U15: an expired checkout page with no payment row", () => {
  const sqlErr = (code: string) => Object.assign(new Error(`pg ${code}`), { code });
  const expiredMsg = () => message({ type: "checkout.session.expired" } as Partial<StripeQueueMessage>);
  const expiredMain = (patch: Partial<Stripe.Checkout.Session> = {}) =>
    session({ status: "expired", payment_status: "unpaid", metadata: { booking_id: "quote-1" }, ...patch } as Partial<Stripe.Checkout.Session>);
  const noRow = (s: Stripe.Checkout.Session, patch: Partial<SettleDeps> = {}) =>
    deps({
      retrieveSession: vi.fn(async () => s),
      settlePayment: vi.fn(async () => {
        throw sqlErr("P0002");
      }),
      ...patch,
    });

  it("is recorded as no_payment and acked: nothing was charged, no stuck-payment mail, no refund", async () => {
    const d = noRow(expiredMain());
    expect(await handleStripeMessageWithDeps(expiredMsg(), d)).toEqual({ ack: true });
    expect(d.eventClose).toHaveBeenCalledWith("evt_1", "no_payment");
    expect(d.alertStuckPayment).not.toHaveBeenCalled();
    expect(d.refund).not.toHaveBeenCalled();
    expect(d.purgeOnSessionExpired).not.toHaveBeenCalled();
  });

  it("a canceled intent with no payment row is closed the same way: a declined card, then the page expires", async () => {
    const canceledMsg = message({ type: "payment_intent.canceled", objectId: "pi_1" } as Partial<StripeQueueMessage>);
    const d = deps({
      settlePayment: vi.fn(async () => {
        throw sqlErr("P0002");
      }),
    });
    expect(await handleStripeMessageWithDeps(canceledMsg, d)).toEqual({ ack: true });
    expect(d.eventClose).toHaveBeenCalledWith("evt_1", "no_payment");
    expect(d.alertStuckPayment).not.toHaveBeenCalled();
    expect(d.refund).not.toHaveBeenCalled();
  });

  it("if recording no_payment fails the message is retried", async () => {
    const d = noRow(expiredMain(), {
      eventClose: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    expect(await handleStripeMessageWithDeps(expiredMsg(), d)).toEqual({ retry: true });
  });

  it("a page Stripe reports as paid is never closed this way (unchanged: retried)", async () => {
    const d = noRow(expiredMain({ payment_status: "paid", created: Math.floor(Date.now() / 1000) - 5 }));
    expect(await handleStripeMessageWithDeps(expiredMsg(), d)).toEqual({ retry: true });
    expect(d.eventSettle).not.toHaveBeenCalled();
  });

  it("a completed-but-unpaid page with no row is not closed this way (unchanged: retried)", async () => {
    const d = noRow(expiredMain({ status: "complete" } as Partial<Stripe.Checkout.Session>));
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ retry: true });
    expect(d.eventSettle).not.toHaveBeenCalled();
  });
});

describe("Phase 31-05: the production deps hand the recorded booking to the customer refund mail", () => {
  const refunded = message({ eventId: "evt_ch_31", type: "charge.refunded", objectId: "ch_test_1" });
  const env = {} as CloudflareEnv;

  function reset(row: Record<string, unknown> | null) {
    sqlCalls.length = 0;
    refundMails.length = 0;
    chargeRefundRow.row = row;
    retrieved.charge = chargeFixture();
  }

  it("'recorded' with a booking_id mails that booking with the Stripe refund's own id and amount", async () => {
    reset({ booking_id: "b1", refund_id: 9, outcome: "recorded" });
    expect(await handleStripeMessage(env, refunded)).toEqual({ ack: true });
    expect(sqlCalls.some((c) => c.text.includes("stripe_charge_refunded_record"))).toBe(true);
    expect(refundMails).toEqual([[env, { bookingId: "b1", stripeRefundId: "re_dash_1", refundRappen: 6 }]]);
  });

  it("'already' sends nothing", async () => {
    reset({ booking_id: "b1", refund_id: 9, outcome: "already" });
    expect(await handleStripeMessage(env, refunded)).toEqual({ ack: true });
    expect(refundMails).toEqual([]);
  });

  it("no booking_id on the row (or no row) gives bookingId null: nothing is mailed", async () => {
    reset({ booking_id: null, refund_id: null, outcome: "recorded" });
    expect(await handleStripeMessage(env, refunded)).toEqual({ ack: true });
    reset(null);
    expect(await handleStripeMessage(env, refunded)).toEqual({ ack: true });
    expect(refundMails).toEqual([]);
  });

  it("source: recordChargeRefund returns the row's booking_id, the mail dep is bound, the duplicate path is unchanged", () => {
    const src = readFileSync(new URL("./settle.ts", import.meta.url), "utf8");
    expect(src).toContain("bookingId: rows[0]?.booking_id ? String(rows[0].booking_id) : null");
    expect(src).toContain("mailCustomerRefund: (input) => mailCustomerRefund(env, input)");
    expect(src).toContain('import { mailCustomerRefund } from "./refund-mail";');
    // D-03: the app-made duplicate refund keeps its own recorder and never reaches the mail.
    expect(src).toContain("const refund = await createRefund(stripe, {");
    expect(src).toContain("select public.checkout_duplicate_refund_record(");
    const dup = src.slice(src.indexOf("recordDuplicateRefund: async"), src.indexOf("alertPaidAfterCancel:"));
    expect(dup).not.toContain("mailCustomerRefund");
  });
});
