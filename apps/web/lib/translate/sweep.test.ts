// apps/web/lib/translate/sweep.test.ts
//
// Phase 32 plan 05: the nightly 03:00 translate sweep. It re-enqueues what is still untranslated (ids
// only), one extra job per extra code with a missing name, and the machine cache rows written under an
// older prompt_version (F-06). A human row is never re-queued (F-05). Counts only in the result.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TranslateJob } from "./jobs-contract";
import { PROMPT_VERSION } from "./model";
import { runTranslateSweep, runTranslateSweepWithDeps, SWEEP_LIMIT, type SweepDeps } from "./sweep";

const A = "0b8f3a52-2c1e-4c55-9d1a-6f0e1d2c3b4a";
const B = "2da05c74-4e30-4e77-9f3c-8b20f3e4d5e6";
const C = "3eb16d85-5f41-4f88-a04d-9c3104f5e6f7";

afterEach(() => vi.restoreAllMocks());

function deps(patch: Partial<SweepDeps> = {}): SweepDeps & { sent: TranslateJob[]; emit: ReturnType<typeof vi.fn> } {
  const sent: TranslateJob[] = [];
  const emit = vi.fn();
  return {
    hasQueue: true,
    backlog: vi.fn(async () => []),
    extrasMissing: vi.fn(async () => []),
    stale: vi.fn(async () => []),
    enqueue: vi.fn(async (job: TranslateJob) => {
      sent.push(job);
      return true;
    }),
    emit,
    sent,
    ...patch,
  } as SweepDeps & { sent: TranslateJob[]; emit: ReturnType<typeof vi.fn> };
}

describe("runTranslateSweepWithDeps", () => {
  it("enqueues one job per backlog row and one extra job per code; returns counts", async () => {
    const d = deps({
      backlog: vi.fn(async () => [
        { kind: "support" as const, id: A },
        { kind: "note" as const, id: B },
        { kind: "review" as const, id: C },
      ]),
      extrasMissing: vi.fn(async () => [
        { code: "child_seat", label_en: "Child seat" },
        { code: "roof_box", label_en: "Roof box" },
      ]),
    });
    const r = await runTranslateSweepWithDeps(d);
    expect(r).toEqual({ enqueued: 5, failed: 0 });
    expect(d.sent).toEqual([
      { v: 1, kind: "support", messageId: A },
      { v: 1, kind: "note", bookingId: B },
      { v: 1, kind: "review", reviewId: C },
      { v: 1, kind: "extra", code: "child_seat" },
      { v: 1, kind: "extra", code: "roof_box" },
    ]);
  });

  it("reads the backlog and the stale rows with a limit of 100", async () => {
    const d = deps();
    await runTranslateSweepWithDeps(d);
    expect(SWEEP_LIMIT).toBe(100);
    expect(d.backlog).toHaveBeenCalledWith(100);
    expect(d.stale).toHaveBeenCalledWith(PROMPT_VERSION, 100);
  });

  it("re-enqueues machine rows with an older prompt_version, never a human row or a current one", async () => {
    const d = deps({
      stale: vi.fn(async () => [
        { id: "7", origin: "machine" as const, prompt_version: PROMPT_VERSION - 1 },
        { id: "8", origin: "human" as const, prompt_version: PROMPT_VERSION - 1 },
        { id: "9", origin: "machine" as const, prompt_version: PROMPT_VERSION },
        { id: "10", origin: "machine" as const, prompt_version: null },
      ]),
    });
    const r = await runTranslateSweepWithDeps(d);
    expect(d.sent).toEqual([{ v: 1, kind: "cache", translationId: "7" }]);
    expect(r).toEqual({ enqueued: 1, failed: 0 });
  });

  it("a store failure returns { enqueued: 0, failed: 1 } and does not throw", async () => {
    const d = deps({
      backlog: vi.fn(async () => {
        throw Object.assign(new Error("connection lost"), { code: "08006" });
      }),
    });
    await expect(runTranslateSweepWithDeps(d)).resolves.toEqual({ enqueued: 0, failed: 1 });
    const call = d.emit.mock.calls.find((c) => c[1] === "translate_sweep_read_failed");
    expect(call?.[2]).toEqual({ step: "backlog", sqlstate: "08006", sqlstateClass: "08" });
  });

  it("a send that fails counts as failed", async () => {
    const d = deps({
      backlog: vi.fn(async () => [{ kind: "support" as const, id: A }]),
      enqueue: vi.fn(async () => false),
    });
    expect(await runTranslateSweepWithDeps(d)).toEqual({ enqueued: 0, failed: 1 });
  });

  it("with no queue it reads nothing and returns skipped", async () => {
    const d = deps({ hasQueue: false });
    expect(await runTranslateSweepWithDeps(d)).toEqual({ enqueued: 0, failed: 0, skipped: true });
    expect(d.backlog).not.toHaveBeenCalled();
    expect(d.emit.mock.calls.some((c) => c[1] === "translate_sweep_no_queue")).toBe(true);
  });
});

describe("runTranslateSweep(env)", () => {
  it("with no TRANSLATE_QUEUE binding returns skipped and logs translate_sweep_no_queue", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const r = await runTranslateSweep({} as CloudflareEnv);
    expect(r).toEqual({ enqueued: 0, failed: 0, skipped: true });
    expect(spy.mock.calls.map((c) => String(c[0])).join("\n")).toContain("translate_sweep_no_queue");
  });
});

describe("worker.ts 03:00 cron order (Phase 31 merge)", () => {
  it("runs the translate sweep after the Phase 31 refund check and before return, once", () => {
    const worker = readFileSync(fileURLToPath(new URL("../../worker.ts", import.meta.url)), "utf8");
    const branch = worker.indexOf('if (controller.cron === "0 3 * * *")');
    expect(branch).toBeGreaterThan(-1);
    const ret = worker.indexOf("return;", branch);
    const refund = worker.indexOf("await refundCheck(env)", branch);
    const sweep = worker.indexOf("await runTranslateSweep(env)", branch);
    expect(worker.split("runTranslateSweep(env)")).toHaveLength(2);
    expect(refund).toBeGreaterThan(branch);
    expect(sweep).toBeGreaterThan(refund);
    expect(sweep).toBeLessThan(ret);
  });
});

describe("worker.ts queue() order (Phase 32 plan 05)", () => {
  it("routes vamos-translate batches first and returns, before the -dlq alert mail and the Stripe loop", () => {
    const worker = readFileSync(fileURLToPath(new URL("../../worker.ts", import.meta.url)), "utf8");
    const handler = worker.indexOf("async queue(batch, env");
    expect(handler).toBeGreaterThan(-1);
    const translate = worker.indexOf('if (batch.queue.startsWith("vamos-translate"))', handler);
    const consume = worker.indexOf("await consumeTranslateBatch(batch", handler);
    const ret = worker.indexOf("return;", consume);
    const dlq = worker.indexOf('if (batch.queue.endsWith("-dlq"))', handler);
    expect(translate).toBeGreaterThan(handler);
    expect(consume).toBeGreaterThan(translate);
    expect(ret).toBeGreaterThan(consume);
    expect(dlq).toBeGreaterThan(ret);
  });
});
