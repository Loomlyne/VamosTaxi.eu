// apps/web/lib/translate/queue-consumer.test.ts
//
// Phase 32 plan 05: the translate queue consumer. Ids-only bodies, retries with backoff on a transient
// failure, and a quiet dead-letter path: every DLQ message is acked, nothing is retried, nothing is
// mailed (the deps carry no mailer at all). Logs carry ids, kinds, reason codes and counts only.
import { describe, expect, it, vi } from "vitest";
import { gemmaReply, stubAi } from "./ai-stub";
import type { TranslateStore } from "./jobs";
import { consumeTranslateBatch, type TranslateConsumerDeps } from "./queue-consumer";
import type { ConsumerMessage } from "../checkout/queue-consumers";
import { retryDelayForAttempt } from "../checkout/settle-errors";

const MSG = "0b8f3a52-2c1e-4c55-9d1a-6f0e1d2c3b4a";
const SUB = "1c9f4b63-3d2f-4d66-8e2b-7a1f2e3d4c5b";
const BOOKING = "2da05c74-4e30-4e77-9f3c-8b20f3e4d5e6";
const REVIEW = "3eb16d85-5f41-4f88-a04d-9c3104f5e6f7";
const DE_TEXT = "Bitte warten Sie am Ausgang der Ankunftshalle auf mich.";
const HASH = "f".repeat(64);

type Msg = ConsumerMessage & { ack: ReturnType<typeof vi.fn>; retry: ReturnType<typeof vi.fn> };

function msg(body: unknown, patch: Partial<ConsumerMessage> = {}): Msg {
  return { id: "qmsg_1", body, attempts: 1, ack: vi.fn(), retry: vi.fn(), ...patch } as Msg;
}

function store(patch: Partial<TranslateStore> = {}): TranslateStore & { calls: Record<string, unknown[][]> } {
  const calls: Record<string, unknown[][]> = {};
  const rec =
    (name: string, ret: unknown) =>
    async (...args: unknown[]) => {
      (calls[name] ??= []).push(args);
      return ret;
    };
  const base = {
    supportTranslationSource: rec("supportTranslationSource", {
      body_text: DE_TEXT,
      direction: "inbound_email",
      form_locale: "en",
      detected_lang: null,
    }),
    supportFormMessageId: rec("supportFormMessageId", MSG),
    putSupportTranslation: rec("putSupportTranslation", 3),
    failSupportTranslation: rec("failSupportTranslation", undefined),
    bookingNoteSource: rec("bookingNoteSource", { note: DE_TEXT, note_hash: HASH }),
    putBookingNoteTranslation: rec("putBookingNoteTranslation", 3),
    failBookingNoteTranslation: rec("failBookingNoteTranslation", undefined),
    reviewLanguageSource: rec("reviewLanguageSource", { body: DE_TEXT, language: null, published: true }),
    setReviewLanguage: rec("setReviewLanguage", undefined),
    extraLabelsMissing: rec("extraLabelsMissing", []),
    fillExtraLabel: rec("fillExtraLabel", 0),
    staleTranslationSource: rec("staleTranslationSource", null),
    putMachineTranslation: rec("putMachineTranslation", null),
  } as unknown as TranslateStore;
  const out = { ...base, calls } as TranslateStore & { calls: Record<string, unknown[][]> };
  for (const [k, fn] of Object.entries(patch)) {
    (out as Record<string, unknown>)[k] = async (...args: unknown[]) => {
      (calls[k] ??= []).push(args);
      return (fn as (...a: unknown[]) => unknown)(...args);
    };
  }
  return out;
}

function deps(s: TranslateStore, ai: TranslateConsumerDeps["ai"] = null) {
  const emit = vi.fn();
  const d: TranslateConsumerDeps = { ai, store: s, emitFor: () => emit };
  return { d, emit };
}

function expectNoText(emit: ReturnType<typeof vi.fn>): void {
  for (const call of emit.mock.calls) {
    for (const key of Object.keys((call[2] ?? {}) as object)) {
      expect(["body", "text", "note", "translation"]).not.toContain(key);
    }
  }
  expect(JSON.stringify(emit.mock.calls)).not.toContain(DE_TEXT);
}

describe("consumeTranslateBatch: the translate queue", () => {
  it("a handled job is acked", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() =>
      gemmaReply({
        lang: "de",
        en: "Please wait for me at the arrivals hall exit.",
        fr: "Veuillez m'attendre à la sortie du hall des arrivées.",
        ar: "يرجى انتظاري عند مخرج صالة الوصول.",
      }),
    );
    const s = store();
    const { d, emit } = deps(s, ai);
    const m = msg({ v: 1, kind: "support", messageId: MSG });
    await consumeTranslateBatch({ queue: "vamos-translate-staging", messages: [m] }, d);
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(m.retry).not.toHaveBeenCalled();
    expect(s.calls.putSupportTranslation).toHaveLength(1);
    expectNoText(emit);
  });

  it("a timeout retries with retryDelayForAttempt(attempts) and does not ack", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    });
    const { d, emit } = deps(store(), ai);
    const m = msg({ v: 1, kind: "support", messageId: MSG }, { attempts: 3 });
    await consumeTranslateBatch({ queue: "vamos-translate-staging", messages: [m] }, d);
    expect(m.retry).toHaveBeenCalledWith({ delaySeconds: retryDelayForAttempt(3) });
    expect(m.ack).not.toHaveBeenCalled();
    const call = emit.mock.calls.find((c) => c[1] === "translate_job_retry");
    expect(call?.[2]).toMatchObject({ messageId: "qmsg_1", kind: "support", reason: "timeout" });
  });

  it("no_binding acks without any store write", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const s = store();
    const { d } = deps(s, null);
    const m = msg({ v: 1, kind: "support", messageId: MSG });
    await consumeTranslateBatch({ queue: "vamos-translate-staging", messages: [m] }, d);
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(s.calls.putSupportTranslation).toBeUndefined();
    expect(s.calls.failSupportTranslation).toBeUndefined();
  });

  it("a body that fails parseTranslateJob is acked and logged as translate_bad_job with no body content", async () => {
    for (const body of [
      { v: 1, kind: "poem", messageId: MSG },
      { v: 1, kind: "support", messageId: MSG, text: DE_TEXT },
      { v: 1, kind: "support", messageId: "not-a-uuid" },
      DE_TEXT,
    ]) {
      const s = store();
      const { d, emit } = deps(s, null);
      const m = msg(body);
      await consumeTranslateBatch({ queue: "vamos-translate-staging", messages: [m] }, d);
      expect(m.ack).toHaveBeenCalledTimes(1);
      expect(m.retry).not.toHaveBeenCalled();
      const call = emit.mock.calls.find((c) => c[1] === "translate_bad_job");
      expect(call?.[2]).toEqual({ messageId: "qmsg_1" });
      expectNoText(emit);
      expect(Object.keys(s.calls)).toHaveLength(0);
    }
  });

  it("a message that can be neither acked nor retried is rethrown", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    });
    const { d } = deps(store(), ai);
    const m = msg({ v: 1, kind: "support", messageId: MSG });
    m.retry.mockImplementation(() => {
      throw new Error("closed");
    });
    await expect(consumeTranslateBatch({ queue: "vamos-translate-staging", messages: [m] }, d)).rejects.toThrow();
  });
});

describe("consumeTranslateBatch: the quiet dead-letter queue", () => {
  const DLQ = "vamos-translate-staging-dlq";

  it("support and support-form jobs mark the message failed; acked, never retried", async () => {
    const s = store();
    const { d } = deps(s, stubAi(() => null));
    const a = msg({ v: 1, kind: "support", messageId: MSG });
    const b = msg({ v: 1, kind: "support-form", submissionId: SUB }, { id: "qmsg_2" });
    await consumeTranslateBatch({ queue: DLQ, messages: [a, b] }, d);
    expect(s.calls.failSupportTranslation).toEqual([[MSG], [MSG]]);
    expect(s.calls.supportFormMessageId).toEqual([[SUB]]);
    for (const m of [a, b]) {
      expect(m.ack).toHaveBeenCalledTimes(1);
      expect(m.retry).not.toHaveBeenCalled();
    }
  });

  it("a note job reads the current note and marks that hash failed", async () => {
    const s = store();
    const { d } = deps(s);
    const m = msg({ v: 1, kind: "note", bookingId: BOOKING });
    await consumeTranslateBatch({ queue: DLQ, messages: [m] }, d);
    expect(s.calls.bookingNoteSource).toEqual([[BOOKING]]);
    expect(s.calls.failBookingNoteTranslation).toEqual([[BOOKING, HASH]]);
    expect(m.ack).toHaveBeenCalledTimes(1);
  });

  it("an empty note calls neither put nor fail", async () => {
    for (const src of [null, { note: "  ", note_hash: HASH }]) {
      const s = store({ bookingNoteSource: async () => src });
      const { d } = deps(s);
      const m = msg({ v: 1, kind: "note", bookingId: BOOKING });
      await consumeTranslateBatch({ queue: DLQ, messages: [m] }, d);
      expect(s.calls.failBookingNoteTranslation).toBeUndefined();
      expect(s.calls.putBookingNoteTranslation).toBeUndefined();
      expect(m.ack).toHaveBeenCalledTimes(1);
    }
  });

  it("review, extra and cache jobs only ack (the nightly sweep retries them)", async () => {
    const s = store();
    const { d } = deps(s);
    const a = msg({ v: 1, kind: "review", reviewId: REVIEW });
    const b = msg({ v: 1, kind: "extra", code: "child_seat" }, { id: "qmsg_2" });
    const c = msg({ v: 1, kind: "cache", translationId: "42" }, { id: "qmsg_3" });
    await consumeTranslateBatch({ queue: DLQ, messages: [a, b, c] }, d);
    expect(Object.keys(s.calls)).toHaveLength(0);
    for (const m of [a, b, c]) {
      expect(m.ack).toHaveBeenCalledTimes(1);
      expect(m.retry).not.toHaveBeenCalled();
    }
  });

  it("a store failure in the DLQ is logged (SQLSTATE only) and still acked; nothing is retried or mailed", async () => {
    const s = store({
      failSupportTranslation: async () => {
        throw Object.assign(new Error(`boom ${DE_TEXT}`), { code: "57014" });
      },
    });
    const { d, emit } = deps(s);
    const bad = msg("garbage", { id: "qmsg_bad" });
    const m = msg({ v: 1, kind: "support", messageId: MSG });
    await consumeTranslateBatch({ queue: DLQ, messages: [m, bad] }, d);
    expect(m.ack).toHaveBeenCalledTimes(1);
    expect(m.retry).not.toHaveBeenCalled();
    expect(bad.ack).toHaveBeenCalledTimes(1);
    const call = emit.mock.calls.find((c) => c[1] === "translate_dlq_failed");
    expect(call?.[2]).toMatchObject({ messageId: "qmsg_1", kind: "support", sqlstate: "57014" });
    // The consumer's deps hold no mail function of any kind.
    expect(Object.keys(d).sort()).toEqual(["ai", "emitFor", "store"]);
    for (const key of Object.keys(s)) expect(key.toLowerCase()).not.toMatch(/mail|alert|resend|send/);
    expectNoText(emit);
  });
});
