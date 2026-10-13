import { afterEach, describe, expect, it, vi } from "vitest";
import { parseTranslateJob, sendTranslateJob, type TranslateJob } from "./jobs-contract";

const ID = "3f2b8c1e-9a4d-4e2f-8b7a-1c2d3e4f5a6b";

const JOBS: TranslateJob[] = [
  { v: 1, kind: "support", messageId: ID },
  { v: 1, kind: "support-form", submissionId: ID },
  { v: 1, kind: "note", bookingId: ID },
  { v: 1, kind: "review", reviewId: ID },
  { v: 1, kind: "extra", code: "child_seat_2" },
];

function loggedLines(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown>[] {
  return spy.mock.calls.map((c: unknown[]) => JSON.parse(String(c[0])) as Record<string, unknown>);
}

afterEach(() => vi.restoreAllMocks());

describe("parseTranslateJob", () => {
  it.each(JOBS)("round-trips kind $kind", (job) => {
    expect(parseTranslateJob(JSON.parse(JSON.stringify(job)))).toEqual(job);
  });

  it("refuses an extra key, so text can never ride along", () => {
    expect(parseTranslateJob({ v: 1, kind: "support", messageId: ID, text: "hello" })).toBeNull();
    expect(parseTranslateJob({ v: 1, kind: "extra", code: "roof_box", body: "x" })).toBeNull();
  });

  it("refuses a non-uuid id", () => {
    expect(parseTranslateJob({ v: 1, kind: "note", bookingId: "VT-26-0753" })).toBeNull();
    expect(parseTranslateJob({ v: 1, kind: "review", reviewId: 42 })).toBeNull();
  });

  it("refuses a bad extra code, a wrong version, a wrong id key and a missing key", () => {
    expect(parseTranslateJob({ v: 1, kind: "extra", code: "Roof Box" })).toBeNull();
    expect(parseTranslateJob({ v: 1, kind: "extra", code: "a".repeat(41) })).toBeNull();
    expect(parseTranslateJob({ v: 2, kind: "support", messageId: ID })).toBeNull();
    expect(parseTranslateJob({ v: 1, kind: "support", bookingId: ID })).toBeNull();
    expect(parseTranslateJob({ v: 1, kind: "support" })).toBeNull();
    expect(parseTranslateJob({ v: 1, kind: "other", messageId: ID })).toBeNull();
  });

  it("refuses non-objects", () => {
    for (const x of [null, undefined, "job", 1, [], [ID]]) expect(parseTranslateJob(x)).toBeNull();
  });
});

describe("sendTranslateJob", () => {
  it("resolves false and logs no_queue without a binding", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await sendTranslateJob({}, JOBS[0]!)).toBe(false);
    const [line] = loggedLines(spy);
    expect(line).toMatchObject({ type: "translate_enqueue", reason: "no_queue", kind: "support" });
  });

  it("sends exactly the contract keys", async () => {
    const send = vi.fn(async () => {});
    const job = { ...JOBS[4]!, text: "smuggled" } as unknown as TranslateJob;
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await sendTranslateJob({ TRANSLATE_QUEUE: { send } as unknown as Queue }, JOBS[4]!)).toBe(true);
    expect(send).toHaveBeenCalledWith({ v: 1, kind: "extra", code: "child_seat_2" });
    // A job carrying an extra key is refused before it reaches the queue.
    expect(await sendTranslateJob({ TRANSLATE_QUEUE: { send } as unknown as Queue }, job)).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("resolves false when send throws; the log has no text, body or id", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const send = vi.fn(async () => {
      throw new Error("queue down");
    });
    expect(await sendTranslateJob({ TRANSLATE_QUEUE: { send } as unknown as Queue }, JOBS[0]!)).toBe(false);
    const lines = loggedLines(spy);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(line).toMatchObject({ reason: "send_failed", kind: "support" });
    for (const key of ["text", "body", "messageId", "message"]) expect(line).not.toHaveProperty(key);
    expect(JSON.stringify(line)).not.toContain(ID);
  });
});
