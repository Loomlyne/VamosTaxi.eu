// apps/web/lib/checkout/capture-gate.test.ts
//
// 26.1-05 D-03: the capture gate no longer short-circuits the consumer.
// `checkout_payment_settle` v2 (26.1-02) decides revive vs refund_required
// for a cancelled/expired/is_test booking itself, so `settlePayment` is
// always called for a succeeded outcome — never a silent ack.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { handleStripeMessageWithDeps, type SettleDeps, type SettleRow } from "./settle";
import type { StripeQueueMessage } from "./webhook";
import type Stripe from "stripe";

const here = dirname(fileURLToPath(import.meta.url));

function session(): Stripe.Checkout.Session {
  return {
    id: "cs_test_1",
    payment_intent: "pi_test_1",
    payment_status: "paid",
    currency: "chf",
  } as Stripe.Checkout.Session;
}

function message(): StripeQueueMessage {
  return {
    eventId: "evt_1",
    type: "checkout.session.completed",
    objectId: "cs_test_1",
    stripeCreated: 1_725_000_000,
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

describe("capture gate removed (D-03)", () => {
  it("settlePayment is called for a succeeded session even when the booking is cancelled or expired — no early ack", async () => {
    const d = deps();
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.settlePayment).toHaveBeenCalledTimes(1);
  });

  it("a revived settle result delivers the confirmation instead of any silent ack (D-03)", async () => {
    const d = deps({
      settlePayment: vi.fn(async () => settleRow({ revived: true })),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.deliverConfirmation).toHaveBeenCalledTimes(1);
  });

  it("an is_test settle result (refund_required, reason test_booking) refunds instead of confirming — never a bare ack with money kept (D-03)", async () => {
    const d = deps({
      settlePayment: vi.fn(async () =>
        settleRow({ refund_required: true, refund_reason: "test_booking" }),
      ),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.refund).toHaveBeenCalledTimes(1);
    expect(d.deliverConfirmation).not.toHaveBeenCalled();
  });

  it("production wiring in handleStripeMessage no longer supplies loadCaptureGate", () => {
    const src = readFileSync(join(here, "settle.ts"), "utf8");
    const start = src.indexOf("return handleStripeMessageWithDeps(message, {");
    expect(start).toBeGreaterThan(-1);
    const wiring = src.slice(start, src.indexOf("\n  });", start));
    expect(wiring).not.toMatch(/loadCaptureGate:/);
  });

  it("checkout_capture_gate SQL function is never called from settle.ts (26.1-05 stops calling it; the SQL function itself stays in the schema)", () => {
    const src = readFileSync(join(here, "settle.ts"), "utf8");
    expect(src).not.toMatch(/from public\.checkout_capture_gate/);
    expect(src).not.toMatch(/loadCaptureGate\s*:/);
  });
});
