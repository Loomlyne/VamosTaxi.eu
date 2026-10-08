import { describe, expect, it, vi } from "vitest";
import { DLQ_MAX_ATTEMPTS, DLQ_RETRY_DELAY_SECONDS, handleDlqMessageWithDeps, type DlqDeps } from "./dlq";
import type { StripeQueueMessage } from "./webhook";

function message(patch: Partial<StripeQueueMessage> = {}): StripeQueueMessage {
  return {
    eventId: "evt_1",
    type: "checkout.session.completed",
    objectId: "cs_test_1",
    stripeCreated: 1_725_000_000,
    ...patch,
  };
}

function deps(patch: Partial<DlqDeps> = {}): DlqDeps & {
  lookupReference: ReturnType<typeof vi.fn>;
  alert: ReturnType<typeof vi.fn>;
  emit: ReturnType<typeof vi.fn>;
} {
  const lookupReference = vi.fn(async () => "VT-1" as string | null);
  const alert = vi.fn(async () => undefined);
  const emit = vi.fn();
  return { lookupReference, alert, emit, ...patch } as DlqDeps & {
    lookupReference: ReturnType<typeof vi.fn>;
    alert: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
  };
}

describe("handleDlqMessageWithDeps", () => {
  it("resolves the reference for a cs_ objectId and alerts once, then acks", async () => {
    const d = deps();
    const result = await handleDlqMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.lookupReference).toHaveBeenCalledWith("cs_test_1");
    expect(d.alert).toHaveBeenCalledTimes(1);
    expect(d.alert).toHaveBeenCalledWith({
      eventId: "evt_1",
      type: "checkout.session.completed",
      objectId: "cs_test_1",
      reference: "VT-1",
    });
  });

  it("alerts with reference null for a pi_ objectId and never looks up a reference", async () => {
    const d = deps();
    const result = await handleDlqMessageWithDeps(
      message({ objectId: "pi_test_1", type: "payment_intent.canceled" }),
      d,
    );
    expect(result).toEqual({ ack: true });
    expect(d.lookupReference).not.toHaveBeenCalled();
    expect(d.alert).toHaveBeenCalledWith({
      eventId: "evt_1",
      type: "payment_intent.canceled",
      objectId: "pi_test_1",
      reference: null,
    });
  });

  it("alerts with reference null for a ch_ objectId", async () => {
    const d = deps();
    const result = await handleDlqMessageWithDeps(
      message({ objectId: "ch_test_1", type: "charge.refunded" }),
      d,
    );
    expect(result).toEqual({ ack: true });
    expect(d.lookupReference).not.toHaveBeenCalled();
    expect(d.alert.mock.calls[0]?.[0].reference).toBeNull();
  });

  it("W4-02: an alert that did not go out is NOT acked: the message is retried later and logged at error level", async () => {
    const d = deps({
      alert: vi.fn(async () => {
        throw new Error("resend down");
      }),
    });
    const result = await handleDlqMessageWithDeps(message(), d, 1);
    expect(result).toEqual({ retry: true, delaySeconds: DLQ_RETRY_DELAY_SECONDS });
    expect(d.emit).toHaveBeenCalledWith(
      "error",
      "dlq_alert_failed",
      expect.objectContaining({ eventId: "evt_1", attempts: 1 }),
    );
  });

  it("W4-02: the retry that gets the mail out acks", async () => {
    const alert = vi.fn().mockRejectedValueOnce(new Error("resend down")).mockResolvedValue(undefined);
    const d = deps({ alert });
    expect(await handleDlqMessageWithDeps(message(), d, 1)).toEqual({ retry: true, delaySeconds: DLQ_RETRY_DELAY_SECONDS });
    expect(await handleDlqMessageWithDeps(message(), d, 2)).toEqual({ ack: true });
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it("W4-02: on the last delivery it acks (no further queue) with an error log; the sweep is the second line", async () => {
    const d = deps({
      alert: vi.fn(async () => {
        throw new Error("resend down");
      }),
    });
    expect(await handleDlqMessageWithDeps(message(), d, DLQ_MAX_ATTEMPTS)).toEqual({ ack: true });
    expect(d.emit).toHaveBeenCalledWith("error", "dlq_alert_gave_up", expect.objectContaining({ eventId: "evt_1" }));
  });

  it("a poison body (no ids) still alerts with what it has, never throws", async () => {
    const d = deps();
    const result = await handleDlqMessageWithDeps({} as StripeQueueMessage, d);
    expect(result).toEqual({ ack: true });
    expect(d.alert).toHaveBeenCalledWith({ eventId: "", type: "", objectId: "", reference: null });
  });

  it("never calls settlePayment, begin, or Stripe — the deps shape has no such members", async () => {
    const d = deps();
    await handleDlqMessageWithDeps(message(), d);
    expect(Object.keys(d)).toEqual(["lookupReference", "alert", "emit"]);
  });
});
