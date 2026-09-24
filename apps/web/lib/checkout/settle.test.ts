import { describe, expect, it, vi } from "vitest";
import {
  captureAllowed,
  handleStripeMessageWithDeps,
  pgTextArrayLiteral,
  type CaptureGate,
  type SettleDeps,
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

function deps(patch: Partial<SettleDeps> = {}): SettleDeps & {
  begin: ReturnType<typeof vi.fn>;
  retrieveSession: ReturnType<typeof vi.fn>;
  settlePayment: ReturnType<typeof vi.fn>;
  eventSettle: ReturnType<typeof vi.fn>;
  deliverConfirmation: ReturnType<typeof vi.fn>;
} {
  const begin = vi.fn(async () => ({ should_process: true, reason: "ok" }));
  const retrieveSession = vi.fn(async () => session());
  const settlePayment = vi.fn(async () => ({
    booking_id: "11111111-1111-1111-1111-111111111111",
    reference: "VT-1",
    locale: "en",
    contact_email: "a@b.c",
    already_settled: false,
  }));
  const eventSettle = vi.fn(async () => undefined);
  const deliverConfirmation = vi.fn(async () => undefined);
  return {
    begin,
    retrieveSession,
    settlePayment,
    eventSettle,
    deliverConfirmation,
    emit: () => undefined,
    ...patch,
  } as SettleDeps & {
    begin: ReturnType<typeof vi.fn>;
    retrieveSession: ReturnType<typeof vi.fn>;
    settlePayment: ReturnType<typeof vi.fn>;
    eventSettle: ReturnType<typeof vi.fn>;
    deliverConfirmation: ReturnType<typeof vi.fn>;
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
  });

  it("acks superseded without calling the booking-status stub", async () => {
    const d = deps({
      begin: vi.fn(async () => ({ should_process: false, reason: "superseded" })),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.settlePayment).not.toHaveBeenCalled();
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
      settlePayment: vi.fn(async () => ({
        booking_id: "11111111-1111-1111-1111-111111111111",
        reference: "VT-1",
        locale: "en",
        contact_email: "a@b.c",
        already_settled: true,
      })),
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

  it("acks a paid checkout.session.completed without succeeded settle when the unpaid lock expired (D-23)", async () => {
    const d = deps({
      loadCaptureGate: vi.fn(async (): Promise<CaptureGate> => ({ capture: false, reason: "expired" })),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.settlePayment).not.toHaveBeenCalled();
    expect(d.deliverConfirmation).not.toHaveBeenCalled();
    expect(d.eventSettle).toHaveBeenCalledWith("evt_1", "expired");
  });

  it("acks without capture when the unpaid trip is cancelled", async () => {
    const d = deps({
      loadCaptureGate: vi.fn(async (): Promise<CaptureGate> => ({ capture: false, reason: "cancelled" })),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.settlePayment).not.toHaveBeenCalled();
  });

  it("acks capture_gate_failed when the gate throws and does not settle", async () => {
    const d = deps({
      loadCaptureGate: vi.fn(async () => {
        throw Object.assign(new Error("permission denied for table bookings"), { code: "42501" });
      }),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.settlePayment).not.toHaveBeenCalled();
    expect(d.deliverConfirmation).not.toHaveBeenCalled();
    expect(d.eventSettle).toHaveBeenCalledWith("evt_1", "capture_gate_failed");
  });

  it("acks without capture when bookings.is_test (D-33)", async () => {
    const d = deps({
      loadCaptureGate: vi.fn(async (): Promise<CaptureGate> => ({ capture: false, reason: "is_test" })),
    });
    const result = await handleStripeMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.settlePayment).not.toHaveBeenCalled();
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
