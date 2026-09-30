// apps/web/lib/ops/refund-by-hand.test.ts
//
// 20-10 refunds by hand: the admin Refund across payments. Mocked SQL layer and Stripe.
// Synthetic rappen only (100 + 20 = 10000 + 2000).

import { beforeEach, describe, expect, it, vi } from "vitest";

const createRefund = vi.fn();
const findRefundByIntent = vi.fn();
const retrieveRefund = vi.fn();
const resolvePaymentIntentId = vi.fn();
const stripeFromEnv = vi.fn();

vi.mock("../checkout/stripe", () => ({
  createRefund: (...a: unknown[]) => createRefund(...a),
  findRefundByIntent: (...a: unknown[]) => findRefundByIntent(...a),
  retrieveRefund: (...a: unknown[]) => retrieveRefund(...a),
  resolvePaymentIntentId: (...a: unknown[]) => resolvePaymentIntentId(...a),
  stripeFromEnv: (...a: unknown[]) => stripeFromEnv(...a),
}));

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>;
let staffSql: Sql;
let systemSql: Sql;

vi.mock("../db/identity", () => ({
  asStaff: (_e: unknown, _c: unknown, fn: (sql: Sql) => unknown) => fn((s, ...v) => staffSql(s, ...v)),
  asSystem: (_e: unknown, fn: (sql: Sql) => unknown) => fn((s, ...v) => systemSql(s, ...v)),
}));

vi.mock("./resolve-booking-id", () => ({
  resolveStaffBookingId: async () => BOOKING_ID,
}));

const BOOKING_ID = "00000000-0000-4000-8000-000000000009";
const ENV = { STRIPE_SECRET_KEY: "sk_test_x" } as CloudflareEnv;
const CLAIMS = { sub: "00000000-0000-4000-8000-0000000000aa" } as never;

type Pay = {
  id: number;
  charged: number;
  refunded?: number;
  extra?: boolean;
  open?: { amount: number; state: string };
};

function state(opts: {
  status?: string;
  refundStatus?: string;
  owed?: number | null;
  refunded?: number;
  pays: Pay[];
}) {
  return {
    booking: {
      status: opts.status ?? "cancelled",
      refund_status: opts.refundStatus ?? "pending_ops",
      refund_owed_rappen: opts.owed ?? null,
      refunded_rappen: opts.refunded ?? 0,
    },
    pays: opts.pays.map((p) => ({
      id: p.id,
      stripe_payment_intent_id: `pi_${p.id}`,
      charged_rappen: p.charged,
      captured_at: "2026-10-01T10:00:00.000Z",
      is_extra: p.extra === true,
      refunded: p.refunded ?? 0,
      open_amount: p.open?.amount ?? null,
      open_state: p.open?.state ?? null,
    })),
  };
}

function intent(id: number, paymentId: number, amount: number, extra: Partial<Record<string, unknown>> = {}) {
  return {
    intent_id: id,
    payment_id: paymentId,
    stripe_payment_intent_id: `pi_${paymentId}`,
    amount_rappen: amount,
    idempotency_key: `refund-intent:${id}`,
    state: "intended",
    attempts: 0,
    resumed: false,
    ...extra,
  };
}

function sentRow(amount: number, refunded: number, due: number, over: Partial<Record<string, unknown>> = {}) {
  return {
    booking_id: BOOKING_ID,
    refund_id: 5,
    payment_id: 1,
    refund_rappen: amount,
    contact_email: "guest@example.test",
    payer_email: "",
    contact_name: "Guest",
    locale: "en",
    reference: "VT-26-0101",
    open_intents: 0,
    refunded_rappen: refunded,
    due_rappen: due,
    refund_status: due > 0 ? "pending_ops" : "refunded",
    ...over,
  };
}

let calls: string[];
let planRows: unknown[];
let planArgs: unknown[] | null;
let sentImpl: (intentId: number) => unknown[] | Promise<unknown[]>;
let staff: ReturnType<typeof state>;

function install() {
  calls = [];
  planArgs = null;
  staffSql = async (strings) => {
    const text = strings.join(" ");
    if (text.includes("public.booking_payments")) return staff.pays;
    if (text.includes("public.bookings as b")) return [staff.booking];
    return [];
  };
  systemSql = async (strings, ...values) => {
    const text = strings.join(" ");
    if (text.includes("ops_refund_plan")) {
      calls.push("plan");
      planArgs = values;
      return planRows;
    }
    if (text.includes("ops_refund_intent_sent")) {
      calls.push(`sent:${String(values[0])}`);
      return sentImpl(Number(values[0]));
    }
    if (text.includes("ops_refund_intent_failed")) {
      calls.push(`failed:${String(values[0])}:${String(values[2])}`);
      return [];
    }
    throw new Error(`unexpected system sql: ${text}`);
  };
}

beforeEach(() => {
  for (const m of [createRefund, findRefundByIntent, retrieveRefund, resolvePaymentIntentId, stripeFromEnv]) m.mockReset();
  stripeFromEnv.mockReturnValue({});
  resolvePaymentIntentId.mockImplementation(async (_s: unknown, id: string) => id);
  findRefundByIntent.mockResolvedValue(null);
  retrieveRefund.mockImplementation(async (_s: unknown, id: string) => ({ id, status: "succeeded" }));
  createRefund.mockImplementation(async (_s: unknown, input: { idempotencyKey: string }) => ({
    id: `re_${input.idempotencyKey}`,
    status: "succeeded",
  }));
  install();
  staff = state({ pays: [{ id: 1, charged: 10000 }, { id: 2, charged: 2000, extra: true }] });
  planRows = [intent(11, 1, 10000), intent(12, 2, 2000)];
  sentImpl = (id) => (id === 11 ? [sentRow(10000, 10000, 2000)] : [sentRow(2000, 12000, 0, { payment_id: 2 })]);
});

describe("refundBooking across payments (20-10 B.2)", () => {
  it("(a) 100 + 20 with {}: plan, then two Stripe refunds with refund-intent keys, two sent calls", async () => {
    const { refundBooking } = await import("./refund");
    const result = await refundBooking(ENV, CLAIMS, "VT-26-0101", {});
    expect(calls).toEqual(["plan", "sent:11", "sent:12"]);
    expect(createRefund).toHaveBeenCalledTimes(2);
    expect(createRefund.mock.calls[0]![1]).toMatchObject({
      amountRappen: 10000,
      idempotencyKey: "refund-intent:11",
      paymentId: 1,
      metadata: { vamos_intent: "11" },
    });
    expect(createRefund.mock.calls[1]![1]).toMatchObject({ amountRappen: 2000, idempotencyKey: "refund-intent:12", paymentId: 2 });
    expect(findRefundByIntent).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      refundedRappen: 12000,
      dueRappen: 0,
      refundStatus: "refunded",
      parts: [
        { paymentId: 1, amountRappen: 10000, state: "sent" },
        { paymentId: 2, amountRappen: 2000, state: "sent" },
      ],
    });
  });

  it("(b) second Stripe call refuses: refund-partial with what went and what is due, failed called once", async () => {
    createRefund.mockImplementationOnce(async () => ({ id: "re_1", status: "succeeded" }));
    createRefund.mockImplementationOnce(async () => {
      throw Object.assign(new Error("card refused the refund"), { code: "refund_failed" });
    });
    // After the batch the booking shows 100 refunded and 20 due.
    const { refundBooking } = await import("./refund");
    const first = staff;
    let reads = 0;
    staffSql = async (strings) => {
      const text = strings.join(" ");
      if (text.includes("public.booking_payments")) return first.pays;
      if (text.includes("public.bookings as b")) {
        reads += 1;
        return [reads === 1 ? first.booking : { ...first.booking, refund_owed_rappen: 12000, refunded_rappen: 10000 }];
      }
      return [];
    };
    const result = await refundBooking(ENV, CLAIMS, "VT-26-0101", {});
    expect(calls).toEqual(["plan", "sent:11", "failed:12:false"]);
    expect(result).toEqual({
      ok: false,
      code: "refund-partial",
      refundedRappen: 10000,
      dueRappen: 2000,
      parts: [
        { paymentId: 1, amountRappen: 10000, state: "sent" },
        { paymentId: 2, amountRappen: 2000, state: "failed" },
      ],
    });
  });

  it("(c) the same press again: the plan returns the failed intent as resumed; Stripe is asked first, then one create for that part only", async () => {
    staff = state({ pays: [{ id: 1, charged: 10000, refunded: 10000 }, { id: 2, charged: 2000, extra: true, open: { amount: 2000, state: "failed" } }] });
    planRows = [intent(12, 2, 2000, { state: "failed", attempts: 1, resumed: true })];
    sentImpl = () => [sentRow(2000, 12000, 0, { payment_id: 2 })];
    const { refundBooking } = await import("./refund");
    const result = await refundBooking(ENV, CLAIMS, "VT-26-0101", {});
    expect(findRefundByIntent).toHaveBeenCalledTimes(1);
    expect(findRefundByIntent.mock.calls[0]!.slice(1)).toEqual(["pi_2", 12]);
    expect(createRefund).toHaveBeenCalledTimes(1);
    expect(createRefund.mock.calls[0]![1]).toMatchObject({ amountRappen: 2000, paymentId: 2 });
    expect(calls).toEqual(["plan", "sent:12"]);
    expect(result).toMatchObject({ ok: true, dueRappen: 0 });
  });

  it("(c2) a refund already at Stripe for the intent is recorded, not created again", async () => {
    staff = state({ pays: [{ id: 2, charged: 2000, extra: true, open: { amount: 2000, state: "failed" } }] });
    planRows = [intent(12, 2, 2000, { state: "failed", attempts: 1, resumed: true })];
    findRefundByIntent.mockResolvedValue({ id: "re_at_stripe", status: "succeeded", metadata: { vamos_intent: "12" } });
    sentImpl = () => [sentRow(2000, 12000, 0, { payment_id: 2 })];
    const { refundBooking } = await import("./refund");
    const result = await refundBooking(ENV, CLAIMS, "VT-26-0101", { retry: true });
    expect(createRefund).not.toHaveBeenCalled();
    expect(calls).toEqual(["plan", "sent:12"]);
    expect(result.ok).toBe(true);
  });

  it("(d2) second press after Stripe accepted and the database failed: intended, attempts 0, resumed: zero creates, recorded as sent", async () => {
    planRows = [intent(11, 1, 10000, { state: "intended", attempts: 0, resumed: true })];
    staff = state({ pays: [{ id: 1, charged: 10000, open: { amount: 10000, state: "intended" } }] });
    findRefundByIntent.mockResolvedValue({ id: "re_at_stripe", status: "succeeded", metadata: { vamos_intent: "11" } });
    sentImpl = () => [sentRow(10000, 10000, 0)];
    const { refundBooking } = await import("./refund");
    const result = await refundBooking(ENV, CLAIMS, "VT-26-0101", {});
    expect(findRefundByIntent).toHaveBeenCalledTimes(1);
    expect(createRefund).not.toHaveBeenCalled();
    expect(calls).toEqual(["plan", "sent:11"]);
    expect(result).toMatchObject({ ok: true, dueRappen: 0, parts: [{ paymentId: 1, state: "sent" }] });
  });

  it("(d) Stripe accepted but ops_refund_intent_sent throws: part unrecorded, ops_refund_intent_failed NOT called", async () => {
    planRows = [intent(11, 1, 10000)];
    staff = state({ pays: [{ id: 1, charged: 10000 }] });
    sentImpl = () => {
      throw new Error("connection lost");
    };
    const { refundBooking } = await import("./refund");
    const result = await refundBooking(ENV, CLAIMS, "VT-26-0101", {});
    expect(createRefund).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["plan", "sent:11"]);
    expect(calls.some((c) => c.startsWith("failed"))).toBe(false);
    expect(result).toMatchObject({
      ok: false,
      code: "refund-partial",
      parts: [{ paymentId: 1, amountRappen: 10000, state: "unrecorded" }],
    });
  });

  it("(e) pressing twice while intents are open: same intents, same idempotency keys", async () => {
    staff = state({
      pays: [
        { id: 1, charged: 10000, open: { amount: 10000, state: "intended" } },
        { id: 2, charged: 2000, extra: true, open: { amount: 2000, state: "intended" } },
      ],
    });
    planRows = [intent(11, 1, 10000, { resumed: true }), intent(12, 2, 2000, { resumed: true })];
    const { refundBooking } = await import("./refund");
    await refundBooking(ENV, CLAIMS, "VT-26-0101", { percent: 50 });
    await refundBooking(ENV, CLAIMS, "VT-26-0101", {});
    const keys = createRefund.mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual(["refund-intent:11", "refund-intent:12", "refund-intent:11", "refund-intent:12"]);
  });

  it("(f) charge_already_refunded marks the intent failed with p_void true", async () => {
    planRows = [intent(11, 1, 10000)];
    staff = state({ pays: [{ id: 1, charged: 10000 }] });
    createRefund.mockRejectedValue(Object.assign(new Error("already refunded"), { code: "charge_already_refunded" }));
    const { refundBooking } = await import("./refund");
    const result = await refundBooking(ENV, CLAIMS, "VT-26-0101", {});
    expect(calls).toEqual(["plan", "failed:11:true"]);
    expect(result).toMatchObject({ ok: false, code: "stripe-failed", parts: [{ paymentId: 1, state: "failed" }] });
  });

  it("the sk_live_ guard stays: a live key makes no plan and no Stripe call", async () => {
    const { refundBooking } = await import("./refund");
    const result = await refundBooking({ STRIPE_SECRET_KEY: "sk_live_x" } as CloudflareEnv, CLAIMS, "VT-26-0101", {});
    expect(result).toEqual({ ok: false, code: "stripe-test-only" });
    expect(calls).toEqual([]);
    expect(createRefund).not.toHaveBeenCalled();
  });

  it("{ retry: true } with nothing open answers nothing-to-retry and plans nothing", async () => {
    const { refundBooking } = await import("./refund");
    const result = await refundBooking(ENV, CLAIMS, "VT-26-0101", { retry: true });
    expect(result).toEqual({ ok: false, code: "nothing-to-retry" });
    expect(calls).toEqual([]);
  });

  it("post-trip is refused before any plan unless the trip happened", async () => {
    staff = state({ status: "confirmed", refundStatus: "none", pays: [{ id: 1, charged: 10000 }] });
    const { refundBooking } = await import("./refund");
    const result = await refundBooking(ENV, CLAIMS, "VT-26-0101", { postTrip: true });
    expect(result).toEqual({ ok: false, code: "not-post-trip" });
    expect(calls).toEqual([]);
  });

  it("passes payment, percent, reason and the exact amount to ops_refund_plan", async () => {
    staff = state({ status: "completed", refundStatus: "none", pays: [{ id: 1, charged: 10000 }, { id: 2, charged: 2000 }] });
    planRows = [intent(11, 2, 1000)];
    sentImpl = () => [sentRow(1000, 1000, 0, { payment_id: 2 })];
    const { refundBooking } = await import("./refund");
    await refundBooking(ENV, CLAIMS, "VT-26-0101", { paymentId: 2, percent: 50 });
    expect(planArgs).toEqual([BOOKING_ID, "00000000-0000-4000-8000-0000000000aa", 2, 50, null, false, null]);
    await refundBooking(ENV, CLAIMS, "VT-26-0101", { paymentId: 1, amountRappen: 3300 });
    expect(planArgs).toEqual([BOOKING_ID, "00000000-0000-4000-8000-0000000000aa", 1, null, null, false, 3300]);
    await refundBooking(ENV, CLAIMS, "VT-26-0101", { postTrip: true });
    expect(planArgs).toEqual([BOOKING_ID, "00000000-0000-4000-8000-0000000000aa", null, null, "post_trip", false, null]);
  });
});

describe("amount rules in the Worker (20-10 section E)", () => {
  it("an exact amount without a chosen payment is refused when there are two payments", async () => {
    staff = state({ status: "completed", refundStatus: "none", pays: [{ id: 1, charged: 10000 }, { id: 2, charged: 2000 }] });
    const { refundBooking } = await import("./refund");
    expect(await refundBooking(ENV, CLAIMS, "VT-26-0101", { amountRappen: 500 })).toEqual({ ok: false, code: "invalid-body" });
    expect(calls).toEqual([]);
  });

  it("an exact amount with one payment only is taken for that payment; more than left is refused", async () => {
    staff = state({ status: "completed", refundStatus: "none", pays: [{ id: 1, charged: 10000, refunded: 3000 }] });
    planRows = [intent(11, 1, 2500)];
    sentImpl = () => [sentRow(2500, 5500, 0)];
    const { refundBooking } = await import("./refund");
    expect(await refundBooking(ENV, CLAIMS, "VT-26-0101", { amountRappen: 7001 })).toEqual({
      ok: false,
      code: "refund-exceeds-remaining",
    });
    expect(createRefund).not.toHaveBeenCalled();
    await refundBooking(ENV, CLAIMS, "VT-26-0101", { amountRappen: 2500 });
    expect((planArgs as unknown[])[2]).toBe(1);
    expect((planArgs as unknown[])[6]).toBe(2500);
  });

  it("full tier (pending_ops with owed): below 100 % and an amount below what is left are refused, 100 % passes", async () => {
    staff = state({ owed: 12000, pays: [{ id: 1, charged: 10000 }, { id: 2, charged: 2000, extra: true }] });
    const { refundBooking } = await import("./refund");
    expect(await refundBooking(ENV, CLAIMS, "VT-26-0101", { percent: 50 })).toEqual({ ok: false, code: "full-refund-only" });
    expect(await refundBooking(ENV, CLAIMS, "VT-26-0101", { paymentId: 2, amountRappen: 1999 })).toEqual({
      ok: false,
      code: "full-refund-only",
    });
    expect(calls).toEqual([]);
    planRows = [intent(12, 2, 2000)];
    sentImpl = () => [sentRow(2000, 2000, 10000, { payment_id: 2 })];
    const one = await refundBooking(ENV, CLAIMS, "VT-26-0101", { paymentId: 2, percent: 100 });
    expect(one).toMatchObject({ ok: true, refundStatus: "pending_ops", dueRappen: 10000 });
  });

  it("the review tier (owed null) still takes a lower percent", async () => {
    staff = state({ owed: null, pays: [{ id: 1, charged: 10000 }] });
    planRows = [intent(11, 1, 4000)];
    sentImpl = () => [sentRow(4000, 4000, 0)];
    const { refundBooking } = await import("./refund");
    expect(await refundBooking(ENV, CLAIMS, "VT-26-0101", { percent: 40 })).toMatchObject({ ok: true });
  });

  it("decline is refused on a full-tier booking and allowed on the review tier", async () => {
    const decide: string[] = [];
    staffSql = async (strings) => {
      const text = strings.join(" ");
      if (text.includes("ops_refund_decide")) {
        decide.push("decide");
        return [{ booking_id: BOOKING_ID, refund_status: "declined", reference: "VT-26-0101" }];
      }
      if (text.includes("public.booking_payments")) return staff.pays;
      if (text.includes("public.bookings as b")) return [staff.booking];
      return [];
    };
    const { decideRefund } = await import("./refund");
    staff = state({ owed: 12000, pays: [{ id: 1, charged: 12000 }] });
    expect(await decideRefund(ENV, CLAIMS, "VT-26-0101", "decline")).toEqual({ ok: false, code: "full-refund-only" });
    expect(decide).toEqual([]);
    staff = state({ owed: null, pays: [{ id: 1, charged: 12000 }] });
    expect(await decideRefund(ENV, CLAIMS, "VT-26-0101", "decline")).toMatchObject({ ok: true, refundStatus: "declined" });
  });
});

describe("loadRefundPicker (GET)", () => {
  it("returns the payments, open parts and the due amount", async () => {
    staff = state({
      owed: 12000,
      refunded: 10000,
      pays: [
        { id: 1, charged: 10000, refunded: 10000 },
        { id: 2, charged: 2000, extra: true, open: { amount: 2000, state: "failed" } },
      ],
    });
    const { loadRefundPicker } = await import("./refund");
    const picker = await loadRefundPicker(ENV, CLAIMS, "VT-26-0101");
    expect(picker).toEqual({
      ok: true,
      payments: [
        { id: 1, kind: "trip", capturedAt: "2026-10-01T10:00:00.000Z", chargedRappen: 10000, refundedRappen: 10000, leftRappen: 0, open: null },
        { id: 2, kind: "extra", capturedAt: "2026-10-01T10:00:00.000Z", chargedRappen: 2000, refundedRappen: 0, leftRappen: 2000, open: { amountRappen: 2000, state: "failed" } },
      ],
      owedRappen: 12000,
      refundedRappen: 10000,
      dueRappen: 2000,
      refundStatus: "pending_ops",
      fullTier: true,
    });
  });
});

describe("findRefundByIntent", () => {
  it("lists refunds on the PaymentIntent and matches metadata.vamos_intent", async () => {
    const { findRefundByIntent: real } = await vi.importActual<typeof import("../checkout/stripe")>("../checkout/stripe");
    const list = vi.fn().mockResolvedValue({
      data: [{ id: "re_a", metadata: {} }, { id: "re_b", metadata: { vamos_intent: "12" } }],
    });
    const stripe = { refunds: { list } } as never;
    expect((await real(stripe, "pi_2", 12))?.id).toBe("re_b");
    expect(await real(stripe, "pi_2", 99)).toBeNull();
    expect(list).toHaveBeenCalledWith({ payment_intent: "pi_2", limit: 100 });
  });
});

describe("Retry and Stripe idempotency keys (20-10 B2)", () => {
  /** staff reads as before, plus the stored last_error of an intent (what ops_refund_intent_failed kept). */
  function withLastError(lastError: string | null) {
    const base = staffSql;
    staffSql = async (strings, ...values) => {
      if (strings.join(" ").includes("last_error")) return lastError === null ? [] : [{ last_error: lastError }];
      return base(strings, ...values);
    };
  }
  /** system calls of ops_refund_intent_failed, with the stored error text. */
  function captureFailedText() {
    const texts: string[] = [];
    const base = systemSql;
    systemSql = async (strings, ...values) => {
      if (strings.join(" ").includes("ops_refund_intent_failed")) texts.push(String(values[1]));
      return base(strings, ...values);
    };
    return texts;
  }
  const retryState = () => {
    staff = state({ pays: [{ id: 2, charged: 2000, extra: true, open: { amount: 2000, state: "failed" } }] });
    planRows = [intent(12, 2, 2000, { state: "failed", attempts: 1, resumed: true })];
    sentImpl = () => [sentRow(2000, 2000, 0, { payment_id: 2 })];
  };

  it("a Stripe refusal is stored as 'stripe:'; a timeout as 'transport:'", async () => {
    planRows = [intent(11, 1, 10000)];
    staff = state({ pays: [{ id: 1, charged: 10000 }] });
    const texts = captureFailedText();
    const { refundBooking } = await import("./refund");
    createRefund.mockRejectedValueOnce(Object.assign(new Error("insufficient balance"), { statusCode: 400, code: "balance_insufficient" }));
    await refundBooking(ENV, CLAIMS, "VT-26-0101", {});
    createRefund.mockRejectedValueOnce(Object.assign(new Error("socket hang up"), { type: "StripeConnectionError" }));
    await refundBooking(ENV, CLAIMS, "VT-26-0101", {});
    expect(texts[0]).toMatch(/^stripe: insufficient balance/);
    expect(texts[1]).toMatch(/^transport: socket hang up/);
  });

  it("first attempt keeps refund-intent:<id>; after a Stripe refusal, Retry sends refund-intent:<id>:<attempts>", async () => {
    retryState();
    withLastError("stripe: insufficient balance");
    const { refundBooking } = await import("./refund");
    const result = await refundBooking(ENV, CLAIMS, "VT-26-0101", { retry: true });
    expect(createRefund).toHaveBeenCalledTimes(1);
    expect(createRefund.mock.calls[0]![1]).toMatchObject({ idempotencyKey: "refund-intent:12:1" });
    expect(result.ok).toBe(true);
  });

  it("after a timeout, Retry keeps the same key (the first request may still be in flight)", async () => {
    retryState();
    withLastError("transport: socket hang up");
    const { refundBooking } = await import("./refund");
    await refundBooking(ENV, CLAIMS, "VT-26-0101", { retry: true });
    expect(createRefund.mock.calls[0]![1]).toMatchObject({ idempotencyKey: "refund-intent:12" });
  });

  it("an old row without a prefix, or no readable error, keeps the same key", async () => {
    retryState();
    withLastError("card refused");
    const { refundBooking } = await import("./refund");
    await refundBooking(ENV, CLAIMS, "VT-26-0101", { retry: true });
    withLastError(null);
    await refundBooking(ENV, CLAIMS, "VT-26-0101", { retry: true });
    const keys = createRefund.mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toEqual(["refund-intent:12", "refund-intent:12"]);
  });

  it("a second refusal bumps again: attempts 2 sends refund-intent:<id>:2", async () => {
    retryState();
    planRows = [intent(12, 2, 2000, { state: "failed", attempts: 2, resumed: true })];
    withLastError("stripe: still refused");
    const { refundBooking } = await import("./refund");
    await refundBooking(ENV, CLAIMS, "VT-26-0101", { retry: true });
    expect(createRefund.mock.calls[0]![1]).toMatchObject({ idempotencyKey: "refund-intent:12:2" });
  });

  it("a failed refund of the intent found at Stripe is not taken as sent: a new create is made", async () => {
    retryState();
    withLastError("stripe: stripe-refund-not-created");
    const sentRefundIds: string[] = [];
    const baseSystem = systemSql;
    systemSql = async (strings, ...values) => {
      if (strings.join(" ").includes("ops_refund_intent_sent")) sentRefundIds.push(String(values[1]));
      return baseSystem(strings, ...values);
    };
    const { findRefundByIntent: real } = await vi.importActual<typeof import("../checkout/stripe")>("../checkout/stripe");
    const list = vi.fn().mockResolvedValue({
      data: [{ id: "re_dead", status: "failed", metadata: { vamos_intent: "12" } }],
    });
    findRefundByIntent.mockImplementation((_s: unknown, pi: string, id: number) => real({ refunds: { list } } as never, pi, id));
    const { refundBooking } = await import("./refund");
    const result = await refundBooking(ENV, CLAIMS, "VT-26-0101", { retry: true });
    expect(createRefund).toHaveBeenCalledTimes(1);
    expect(createRefund.mock.calls[0]![1]).toMatchObject({ idempotencyKey: "refund-intent:12:1" });
    expect(calls).toEqual(["plan", "sent:12"]);
    expect(sentRefundIds).not.toContain("re_dead");
    expect(result.ok).toBe(true);
  });

  it("findRefundByIntent: failed and canceled are not sent; succeeded, pending and requires_action are", async () => {
    const { findRefundByIntent: real } = await vi.importActual<typeof import("../checkout/stripe")>("../checkout/stripe");
    const find = async (status: string) => {
      const list = vi.fn().mockResolvedValue({ data: [{ id: "re_x", status, metadata: { vamos_intent: "12" } }] });
      return real({ refunds: { list } } as never, "pi_2", 12);
    };
    expect(await find("failed")).toBeNull();
    expect(await find("canceled")).toBeNull();
    for (const ok of ["succeeded", "pending", "requires_action"]) expect((await find(ok))?.id).toBe("re_x");
  });
});
