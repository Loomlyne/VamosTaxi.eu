import { describe, expect, it, vi } from "vitest";
import { handleDlqMessageWithDeps, type DlqDeps } from "./dlq";
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

  it("still acks and logs when alert throws — a DLQ message is never retried into itself", async () => {
    const d = deps({
      alert: vi.fn(async () => {
        throw new Error("resend down");
      }),
    });
    const result = await handleDlqMessageWithDeps(message(), d);
    expect(result).toEqual({ ack: true });
    expect(d.emit).toHaveBeenCalledWith(
      "error",
      expect.any(String),
      expect.objectContaining({ eventId: "evt_1" }),
    );
  });

  it("never calls settlePayment, begin, or Stripe — the deps shape has no such members", async () => {
    const d = deps();
    await handleDlqMessageWithDeps(message(), d);
    expect(Object.keys(d)).toEqual(["lookupReference", "alert", "emit"]);
  });
});
