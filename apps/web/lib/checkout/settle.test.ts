import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const sqlCalls: Array<{ text: string; values: unknown[] }> = [];
const retrieved: { session: unknown } = { session: null };

vi.mock("../db/identity", () => ({
  asSystem: async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      sqlCalls.push({ text, values });
      if (text.includes("stripe_event_begin")) return Promise.resolve([{ should_process: true, reason: "ok" }]);
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
  };
});
import {
  applyHandleResult,
  captureAllowed,
  handleStripeMessage,
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
  deliverConfirmation: ReturnType<typeof vi.fn>;
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
    deliverConfirmation: ReturnType<typeof vi.fn>;
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
    expect(result).toEqual({ ack: true });
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

  it("a plain retry keeps the queue's default backoff", () => {
    const m = queueMessage();
    expect(applyHandleResult(m, { retry: true })).toBe("retry");
    expect(m.retry).toHaveBeenCalledWith();
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
    expect(src).toMatch(/applyHandleResult\(message, result\)/);
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
    expect(values.slice(-2)).toEqual([9000, "EUR"]);
  });

  it("passes null and null for a CHF presentment", async () => {
    const values = await settleWith({
      presentment_details: { presentment_amount: 8000, presentment_currency: "chf" },
    } as Partial<Stripe.Checkout.Session>);
    expect(values.slice(-2)).toEqual([null, null]);
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

  function missing(created: number | undefined, patch: Partial<Stripe.Checkout.Session> = {}) {
    return deps({
      retrieveSession: vi.fn(async () =>
        session({ created, metadata: { booking_id: "quote-1" }, ...patch } as Partial<Stripe.Checkout.Session>),
      ),
      settlePayment: vi.fn(async () => {
        throw Object.assign(new Error("payment_not_found"), { code: "P0002" });
      }),
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
    expect(d.eventSettle).toHaveBeenCalledWith("evt_1", "booking_missing");
  });

  it("still acks (no infinite retry) when the refund itself fails", async () => {
    const d = missing(OLD);
    d.refund.mockRejectedValueOnce(new Error("stripe down"));
    expect(await handleStripeMessageWithDeps(message(), d)).toEqual({ ack: true });
    expect(d.alertStuckPayment).toHaveBeenCalled();
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
