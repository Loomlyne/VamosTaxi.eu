import { describe, expect, it, vi } from "vitest";
import { consumeDlqMessage, consumeStripeEventMessage, type ConsumerMessage } from "./queue-consumers";
import { DLQ_MAX_ATTEMPTS, DLQ_RETRY_DELAY_SECONDS } from "./dlq";

function msg(patch: Partial<ConsumerMessage> = {}): ConsumerMessage & { ack: ReturnType<typeof vi.fn>; retry: ReturnType<typeof vi.fn> } {
  return {
    id: "msg_1",
    body: { eventId: "evt_1", type: "checkout.session.completed", objectId: "cs_test_1", stripeCreated: 1 },
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
    ...patch,
  } as ConsumerMessage & { ack: ReturnType<typeof vi.fn>; retry: ReturnType<typeof vi.fn> };
}

describe("consumeStripeEventMessage (W4-14, W1-14, W4-06)", () => {
  it("a thrown handler is logged at error level with the message id, the event type and the SQLSTATE class, and retried after a delay", async () => {
    const emit = vi.fn();
    const m = msg({ attempts: 3 });
    const outcome = await consumeStripeEventMessage(
      m,
      1,
      async () => {
        throw Object.assign(new Error("connection lost for jane@example.test"), { code: "08006" });
      },
      emit,
    );
    expect(outcome).toBe("retry");
    expect(m.retry).toHaveBeenCalledWith({ delaySeconds: 120 });
    expect(m.ack).not.toHaveBeenCalled();
    const call = emit.mock.calls.find((c) => c[1] === "queue_handler_threw");
    expect(call?.[0]).toBe("error");
    expect(call?.[2]).toEqual({
      messageId: "msg_1",
      eventType: "checkout.session.completed",
      sqlstate: "08006",
      sqlstateClass: "08",
    });
    // No PII: the error text (which here names an address) never reaches the log.
    expect(JSON.stringify(emit.mock.calls)).not.toContain("jane@example.test");
  });

  it("an error with no SQLSTATE logs its name, never its message", async () => {
    const emit = vi.fn();
    await consumeStripeEventMessage(msg(), 1, async () => {
      throw new TypeError("Cannot read properties of undefined");
    }, emit);
    const call = emit.mock.calls.find((c) => c[1] === "queue_handler_threw");
    expect(call?.[2]).toEqual({ messageId: "msg_1", eventType: "checkout.session.completed", errorName: "TypeError" });
  });

  it("a thrown handler never retries at once: the delay grows with the delivery count", async () => {
    const delays: number[] = [];
    for (const attempts of [1, 2, 3, 4, 5, 8, 9]) {
      const m = msg({ attempts });
      await consumeStripeEventMessage(m, 1, async () => {
        throw new Error("x");
      }, vi.fn());
      delays.push(m.retry.mock.calls[0]?.[0]?.delaySeconds);
    }
    expect(delays).toEqual([30, 60, 120, 240, 300, 300, 300]);
    expect(delays.every((d) => d > 0)).toBe(true);
  });

  it("a message that can be neither retried nor acked is rethrown (Cloudflare redelivers), logged at error level", async () => {
    const emit = vi.fn();
    const m = msg();
    m.retry.mockImplementation(() => {
      throw new Error("retry failed");
    });
    await expect(
      consumeStripeEventMessage(m, 1, async () => {
        throw new Error("boom");
      }, emit),
    ).rejects.toThrow(/neither acked nor retried/);
    expect(emit).toHaveBeenCalledWith("error", "queue", expect.objectContaining({ ackOutcome: "ack-failed" }));
  });

  it("a normal ack and a handler-requested retry pass through", async () => {
    const a = msg();
    expect(await consumeStripeEventMessage(a, 1, async () => ({ ack: true }), vi.fn())).toBe("acked");
    expect(a.ack).toHaveBeenCalledTimes(1);
    const r = msg({ attempts: 2 });
    expect(await consumeStripeEventMessage(r, 1, async () => ({ retry: true }), vi.fn())).toBe("retry");
    expect(r.retry).toHaveBeenCalledWith({ delaySeconds: 60 });
  });
});

describe("consumeDlqMessage (W4-02)", () => {
  it("an alert that did not go out is retried, not acked", async () => {
    const m = msg();
    const outcome = await consumeDlqMessage(m, 1, async () => ({ retry: true, delaySeconds: DLQ_RETRY_DELAY_SECONDS }), vi.fn());
    expect(outcome).toBe("retry");
    expect(m.retry).toHaveBeenCalledWith({ delaySeconds: DLQ_RETRY_DELAY_SECONDS });
    expect(m.ack).not.toHaveBeenCalled();
  });

  it("an alert that went out is acked", async () => {
    const m = msg();
    expect(await consumeDlqMessage(m, 1, async () => ({ ack: true }), vi.fn())).toBe("acked");
    expect(m.ack).toHaveBeenCalledTimes(1);
  });

  it("passes the delivery count to the handler", async () => {
    const run = vi.fn(async () => ({ ack: true as const }));
    await consumeDlqMessage(msg({ attempts: 4 }), 1, run, vi.fn());
    expect(run).toHaveBeenCalledWith(expect.anything(), 4);
  });

  it("a handler that throws is logged and retried until the last delivery, then acked", async () => {
    const emit = vi.fn();
    const first = msg({ attempts: 1 });
    await consumeDlqMessage(first, 1, async () => {
      throw new Error("db down");
    }, emit);
    expect(first.retry).toHaveBeenCalledWith({ delaySeconds: DLQ_RETRY_DELAY_SECONDS });
    expect(emit).toHaveBeenCalledWith("error", "dlq_handle_failed", expect.objectContaining({ messageId: "msg_1" }));
    const last = msg({ attempts: DLQ_MAX_ATTEMPTS });
    await consumeDlqMessage(last, 1, async () => {
      throw new Error("db down");
    }, emit);
    expect(last.ack).toHaveBeenCalledTimes(1);
    expect(last.retry).not.toHaveBeenCalled();
  });
});
