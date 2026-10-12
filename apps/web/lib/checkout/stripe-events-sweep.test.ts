import { describe, expect, it, vi } from "vitest";
import { sweepUnprocessedEventsWithDeps, type SweepDeps, type SweepRow } from "./stripe-events-sweep";

function row(patch: Partial<SweepRow> = {}): SweepRow {
  return {
    eventId: "evt_1",
    type: "checkout.session.completed",
    objectId: "cs_live_1",
    stripeCreated: 1_725_000_000,
    attempts: 9,
    lastError: null,
    action: "requeue",
    ...patch,
  };
}

function deps(rows: SweepRow[], patch: Partial<SweepDeps> = {}) {
  const enqueue = vi.fn(async () => undefined);
  const alertAbandoned = vi.fn(async () => undefined);
  const markAbandoned = vi.fn(async (ids: string[]) => ids.length);
  const emit = vi.fn();
  const d: SweepDeps = { claim: vi.fn(async () => rows), enqueue, alertAbandoned, markAbandoned, emit, ...patch };
  return { d, enqueue, alertAbandoned, markAbandoned, emit };
}

describe("sweepUnprocessedEventsWithDeps (W4-01)", () => {
  it("re-enqueues each claimed event with exactly the ids the consumer needs", async () => {
    const { d, enqueue } = deps([row(), row({ eventId: "evt_2", type: "charge.refunded", objectId: "py_1", stripeCreated: 5 })]);
    const result = await sweepUnprocessedEventsWithDeps(d);
    expect(result).toEqual({ requeued: 2, enqueueFailed: 0, abandoned: 0, alertFailed: 0 });
    expect(enqueue).toHaveBeenNthCalledWith(1, { eventId: "evt_1", type: "checkout.session.completed", objectId: "cs_live_1", stripeCreated: 1_725_000_000 });
    expect(enqueue).toHaveBeenNthCalledWith(2, { eventId: "evt_2", type: "charge.refunded", objectId: "py_1", stripeCreated: 5 });
  });

  it("nothing to do: no queue call, no mail", async () => {
    const { d, enqueue, alertAbandoned } = deps([]);
    expect(await sweepUnprocessedEventsWithDeps(d)).toEqual({ requeued: 0, enqueueFailed: 0, abandoned: 0, alertFailed: 0 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(alertAbandoned).not.toHaveBeenCalled();
  });

  it("an enqueue that fails is an error log and does not stop the other events", async () => {
    const enqueue = vi.fn().mockRejectedValueOnce(new Error("queue down")).mockResolvedValue(undefined);
    const { d, emit } = deps([row(), row({ eventId: "evt_2" })], { enqueue });
    const result = await sweepUnprocessedEventsWithDeps(d);
    expect(result).toMatchObject({ requeued: 1, enqueueFailed: 1 });
    expect(emit).toHaveBeenCalledWith("error", "stripe_event_requeue_failed", expect.objectContaining({ eventId: "evt_1" }));
  });

  it("an event that used every sweep is mailed once (ids only) and only then marked reported", async () => {
    const { d, alertAbandoned, markAbandoned, enqueue, emit } = deps([row({ action: "abandon", lastError: "40P01" })]);
    const result = await sweepUnprocessedEventsWithDeps(d);
    expect(result).toEqual({ requeued: 0, enqueueFailed: 0, abandoned: 1, alertFailed: 0 });
    expect(enqueue).not.toHaveBeenCalled();
    expect(alertAbandoned).toHaveBeenCalledWith({ eventId: "evt_1", type: "checkout.session.completed", objectId: "cs_live_1", reference: null });
    expect(markAbandoned).toHaveBeenCalledWith(["evt_1"]);
    expect(emit).toHaveBeenCalledWith("error", "stripe_event_abandoned", expect.objectContaining({ eventId: "evt_1" }));
  });

  it("an abandon mail that did not go out is NOT marked reported: it is an error log and is reported again next hour", async () => {
    const { d, markAbandoned, emit } = deps([row({ action: "abandon" }), row({ action: "abandon", eventId: "evt_2" })], {
      alertAbandoned: vi.fn().mockRejectedValueOnce(new Error("resend down")).mockResolvedValue(undefined),
    });
    const result = await sweepUnprocessedEventsWithDeps(d);
    expect(result).toMatchObject({ abandoned: 1, alertFailed: 1 });
    expect(markAbandoned).toHaveBeenCalledWith(["evt_2"]);
    expect(emit).toHaveBeenCalledWith("error", "stripe_event_abandon_alert_failed", expect.objectContaining({ eventId: "evt_1" }));
  });

  it("a mark that fails after the mail went out is an error log (a duplicate mail next hour, never a lost one)", async () => {
    const { d, emit } = deps([row({ action: "abandon" })], {
      markAbandoned: vi.fn(async () => {
        throw Object.assign(new Error("db"), { code: "57014" });
      }),
    });
    const result = await sweepUnprocessedEventsWithDeps(d);
    expect(result.abandoned).toBe(0);
    expect(emit).toHaveBeenCalledWith("error", "stripe_event_abandon_mark_failed", { count: 1, sqlstate: "57014" });
  });

  it("the log of a re-enqueued event carries ids and the error code, no payload", async () => {
    const { d, emit } = deps([row({ lastError: "23505" })]);
    await sweepUnprocessedEventsWithDeps(d);
    expect(emit).toHaveBeenCalledWith("warn", "stripe_event_requeued", { eventId: "evt_1", eventType: "checkout.session.completed", attempts: 9, lastError: "23505" });
  });
});
