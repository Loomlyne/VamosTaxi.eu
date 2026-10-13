// apps/web/lib/translate/jobs.test.ts
//
// Phase 32 plan 05: the background translate jobs. The real engine runs against the AI stub (no network,
// no bill); the store is a recording fake of the plan-02 wrappers. Every log line carries ids, kinds,
// reason codes, language codes and counts only (T-32-22).
import { describe, expect, it, vi } from "vitest";
import { gemmaReply, stubAi } from "./ai-stub";
import { handleTranslateJob, TranslateRetryError, type TranslateStore } from "./jobs";
import { PROMPT_VERSION } from "./model";

const MSG = "0b8f3a52-2c1e-4c55-9d1a-6f0e1d2c3b4a";
const SUB = "1c9f4b63-3d2f-4d66-8e2b-7a1f2e3d4c5b";
const BOOKING = "2da05c74-4e30-4e77-9f3c-8b20f3e4d5e6";
const REVIEW = "3eb16d85-5f41-4f88-a04d-9c3104f5e6f7";

const DE_TEXT = "Bitte warten Sie am Ausgang der Ankunftshalle auf mich.";
const IT_TEXT = "Per favore aspettatemi all'uscita degli arrivi.";
const EN = "Please wait for me at the arrivals hall exit.";
const FR = "Veuillez m'attendre à la sortie du hall des arrivées.";
const AR = "يرجى انتظاري عند مخرج صالة الوصول.";
const DE = "Bitte warten Sie am Ausgang der Ankunftshalle auf mich.";
const CUSTOMER_TEXTS = [DE_TEXT, IT_TEXT, EN, FR, AR];

type Calls = Record<string, unknown[][]>;

function fakeStore(patch: Partial<TranslateStore> = {}): TranslateStore & { calls: Calls } {
  const calls: Calls = {};
  const rec =
    <A extends unknown[], R>(name: string, ret: R) =>
    async (...args: A): Promise<R> => {
      (calls[name] ??= []).push(args);
      return ret;
    };
  const base: TranslateStore = {
    supportTranslationSource: rec("supportTranslationSource", {
      body_text: DE_TEXT,
      direction: "inbound_email" as const,
      form_locale: "en",
      detected_lang: null,
    }),
    supportFormMessageId: rec("supportFormMessageId", MSG),
    putSupportTranslation: rec("putSupportTranslation", 3),
    failSupportTranslation: rec("failSupportTranslation", undefined),
    bookingNoteSource: rec("bookingNoteSource", { note: DE_TEXT, note_hash: "f".repeat(64) }),
    putBookingNoteTranslation: rec("putBookingNoteTranslation", 3),
    failBookingNoteTranslation: rec("failBookingNoteTranslation", undefined),
    reviewLanguageSource: rec("reviewLanguageSource", { body: DE_TEXT, language: null, published: true }),
    setReviewLanguage: rec("setReviewLanguage", undefined),
    extraLabelsMissing: rec("extraLabelsMissing", [{ code: "child_seat", label_en: "Child seat" }]),
    fillExtraLabel: rec("fillExtraLabel", 3),
    staleTranslationSource: rec("staleTranslationSource", {
      source_hash: "c".repeat(64),
      source_lang: "de",
      target_lang: "en",
      source_text: DE_TEXT,
      context: "review" as const,
    }),
    putMachineTranslation: rec("putMachineTranslation", { translated_text: EN, origin: "machine" as const, status: "done" as const }),
  };
  const out = { ...base, calls } as TranslateStore & { calls: Calls };
  for (const [k, fn] of Object.entries(patch)) {
    (out as Record<string, unknown>)[k] = async (...args: unknown[]) => {
      (calls[k] ??= []).push(args);
      return (fn as (...a: unknown[]) => unknown)(...args);
    };
  }
  return out;
}

/** No log key that names text, and no log value equal to any customer text (T-32-22). */
function expectCleanLogs(emit: ReturnType<typeof vi.fn>): void {
  for (const call of emit.mock.calls) {
    const fields = (call[2] ?? {}) as Record<string, unknown>;
    for (const key of Object.keys(fields)) {
      expect(["body", "text", "note", "translation", "label", "source"]).not.toContain(key);
    }
    for (const value of Object.values(fields)) {
      for (const t of CUSTOMER_TEXTS) expect(value).not.toBe(t);
    }
  }
  const all = JSON.stringify(emit.mock.calls);
  for (const t of CUSTOMER_TEXTS) expect(all).not.toContain(t);
}

describe("handleTranslateJob: customer messages", () => {
  it("a German message writes en, fr, ar rows (done) and detected_lang de; no de row", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply({ lang: "de", en: EN, de: DE, fr: FR, ar: AR }));
    const store = fakeStore();
    const emit = vi.fn();
    const outcome = await handleTranslateJob({ ai, store, emit }, { v: 1, kind: "support", messageId: MSG });
    expect(outcome).toBe("done");
    expect(store.calls.putSupportTranslation).toHaveLength(1);
    const [id, detected, rows, pv] = store.calls.putSupportTranslation![0]!;
    expect(id).toBe(MSG);
    expect(detected).toBe("de");
    expect(rows).toEqual({ en: { body: EN, status: "done" }, fr: { body: FR, status: "done" }, ar: { body: AR, status: "done" } });
    expect(rows).not.toHaveProperty("de");
    expect(pv).toBe(PROMPT_VERSION);
    expectCleanLogs(emit);
  });

  it("an Italian message writes en, de, fr, ar rows and detected_lang it (D-08)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply({ lang: "it", en: EN, de: DE, fr: FR, ar: AR }));
    const store = fakeStore({
      supportTranslationSource: async () => ({ body_text: IT_TEXT, direction: "inbound_form", form_locale: "en", detected_lang: null }),
    });
    const emit = vi.fn();
    expect(await handleTranslateJob({ ai, store, emit }, { v: 1, kind: "support", messageId: MSG })).toBe("done");
    const [, detected, rows] = store.calls.putSupportTranslation![0]!;
    expect(detected).toBe("it");
    expect(Object.keys(rows as object).sort()).toEqual(["ar", "de", "en", "fr"]);
    expectCleanLogs(emit);
  });

  it("a guard-rejected language is written as rejected and the job acks", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    // Arabic answered in Latin script: the guard rejects it (script).
    const ai = stubAi(() => gemmaReply({ lang: "de", en: EN, fr: FR, ar: EN }));
    const store = fakeStore();
    const emit = vi.fn();
    expect(await handleTranslateJob({ ai, store, emit }, { v: 1, kind: "support", messageId: MSG })).toBe("done");
    const [, , rows] = store.calls.putSupportTranslation![0]!;
    expect(rows).toEqual({ en: { body: EN, status: "done" }, fr: { body: FR, status: "done" }, ar: { body: null, status: "rejected" } });
    expectCleanLogs(emit);
  });

  it("every language guard-rejected: rejected rows for each target, detected language kept", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply({ lang: "de", en: DE_TEXT, fr: DE_TEXT, ar: DE_TEXT }));
    const store = fakeStore();
    expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "support", messageId: MSG })).toBe("rejected");
    const [, detected, rows] = store.calls.putSupportTranslation![0]!;
    expect(detected).toBe("de");
    expect(rows).toEqual({
      en: { body: null, status: "rejected" },
      fr: { body: null, status: "rejected" },
      ar: { body: null, status: "rejected" },
    });
  });

  it("a timeout throws TranslateRetryError and writes nothing", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => {
      throw Object.assign(new Error("timed out"), { name: "TimeoutError" });
    });
    const store = fakeStore();
    await expect(handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "support", messageId: MSG })).rejects.toBeInstanceOf(
      TranslateRetryError,
    );
    expect(store.calls.putSupportTranslation).toBeUndefined();
    expect(store.calls.failSupportTranslation).toBeUndefined();
  });

  it("no_binding acks without any store write", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const store = fakeStore();
    expect(await handleTranslateJob({ ai: null, store, emit: vi.fn() }, { v: 1, kind: "support", messageId: MSG })).toBe("no_binding");
    expect(store.calls.putSupportTranslation).toBeUndefined();
    expect(store.calls.failSupportTranslation).toBeUndefined();
  });

  it("a final failure (unparsable answer) marks the message failed", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply(null, { raw: "not json at all" }));
    const store = fakeStore();
    expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "support", messageId: MSG })).toBe("failed");
    expect(store.calls.failSupportTranslation).toEqual([[MSG]]);
  });

  it("a staff reply is skipped without a model call", async () => {
    const ai = stubAi(() => gemmaReply({ lang: "en" }));
    const store = fakeStore({
      supportTranslationSource: async () => ({ body_text: EN, direction: "outbound_staff", form_locale: "en", detected_lang: null }),
    });
    expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "support", messageId: MSG })).toBe("skipped");
    expect(ai.calls).toHaveLength(0);
  });

  it("support-form resolves the inbound_form message id first and uses the form locale as fallback", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply({ lang: "de", en: EN, fr: FR, ar: AR }));
    const store = fakeStore();
    expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "support-form", submissionId: SUB })).toBe("done");
    expect(store.calls.supportFormMessageId).toEqual([[SUB]]);
    expect(store.calls.supportTranslationSource).toEqual([[MSG]]);
    expect(store.calls.putSupportTranslation![0]![0]).toBe(MSG);
  });

  it("a store error is logged with its SQLSTATE only and rethrown (the consumer retries)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const store = fakeStore({
      supportTranslationSource: async () => {
        throw Object.assign(new Error(`connection lost: ${DE_TEXT}`), { code: "08006" });
      },
    });
    const emit = vi.fn();
    await expect(handleTranslateJob({ ai: stubAi(() => null), store, emit }, { v: 1, kind: "support", messageId: MSG })).rejects.toThrow();
    const call = emit.mock.calls.find((c) => c[1] === "translate_store_failed");
    expect(call?.[2]).toMatchObject({ step: "supportTranslationSource", sqlstate: "08006", sqlstateClass: "08" });
    expectCleanLogs(emit);
  });
});

describe("handleTranslateJob: booking notes", () => {
  it("translates the current note and stores it under its note_hash", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply({ lang: "de", en: EN, fr: FR, ar: AR }));
    const store = fakeStore();
    const emit = vi.fn();
    expect(await handleTranslateJob({ ai, store, emit }, { v: 1, kind: "note", bookingId: BOOKING })).toBe("done");
    const [id, detected, hash, rows, pv] = store.calls.putBookingNoteTranslation![0]!;
    expect([id, detected, hash, pv]).toEqual([BOOKING, "de", "f".repeat(64), PROMPT_VERSION]);
    expect(Object.keys(rows as object).sort()).toEqual(["ar", "en", "fr"]);
    expectCleanLogs(emit);
  });

  it("an empty note is skipped without a model call or a write", async () => {
    const ai = stubAi(() => gemmaReply({}));
    const store = fakeStore({ bookingNoteSource: async () => ({ note: "   ", note_hash: "e".repeat(64) }) });
    expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "note", bookingId: BOOKING })).toBe("skipped");
    expect(ai.calls).toHaveLength(0);
    expect(store.calls.putBookingNoteTranslation).toBeUndefined();
  });

  it("a final failure marks the note failed for its current hash", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply({ lang: "de", en: EN }, { finish: "length" }));
    const store = fakeStore();
    expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "note", bookingId: BOOKING })).toBe("failed");
    expect(store.calls.failBookingNoteTranslation).toEqual([[BOOKING, "f".repeat(64)]]);
  });
});

describe("handleTranslateJob: reviews and extras", () => {
  it("a review gets its detected language (detect only, no targets)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply({ lang: "de" }));
    const store = fakeStore();
    expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "review", reviewId: REVIEW })).toBe("done");
    expect(store.calls.setReviewLanguage).toEqual([[REVIEW, "de"]]);
  });

  it("an unpublished review or one with a language already is skipped", async () => {
    const ai = stubAi(() => gemmaReply({ lang: "de" }));
    for (const src of [
      { body: DE_TEXT, language: null, published: false },
      { body: DE_TEXT, language: "de", published: true },
    ]) {
      const store = fakeStore({ reviewLanguageSource: async () => src });
      expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "review", reviewId: REVIEW })).toBe("skipped");
      expect(store.calls.setReviewLanguage).toBeUndefined();
    }
    expect(ai.calls).toHaveLength(0);
  });

  it("an undetermined language is not stored", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply({ lang: "unknown" }));
    const store = fakeStore();
    expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "review", reviewId: REVIEW })).toBe("failed");
    expect(store.calls.setReviewLanguage).toBeUndefined();
  });

  it("an extra gets its de, fr, ar names from the English name", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply({ de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال" }));
    const store = fakeStore();
    expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "extra", code: "child_seat" })).toBe("done");
    expect(store.calls.fillExtraLabel).toEqual([["child_seat", { de: "Kindersitz", fr: "Siège enfant", ar: "مقعد أطفال" }]]);
  });

  it("an extra with nothing missing is skipped", async () => {
    const ai = stubAi(() => gemmaReply({}));
    const store = fakeStore({ extraLabelsMissing: async () => [{ code: "other_code", label_en: "Other" }] });
    expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "extra", code: "child_seat" })).toBe("skipped");
    expect(ai.calls).toHaveLength(0);
    expect(store.calls.fillExtraLabel).toBeUndefined();
  });
});

describe("handleTranslateJob: stale machine cache rows (prompt_version bump, plan 32-05)", () => {
  it("re-translates the row and stores it under the same key with the current prompt version", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply({ en: EN }));
    const store = fakeStore();
    const emit = vi.fn();
    expect(await handleTranslateJob({ ai, store, emit }, { v: 1, kind: "cache", translationId: "42" })).toBe("done");
    expect(store.calls.staleTranslationSource).toEqual([["42", PROMPT_VERSION]]);
    expect(store.calls.putMachineTranslation).toEqual([
      [
        {
          hash: "c".repeat(64),
          sourceLang: "de",
          targetLang: "en",
          sourceText: DE_TEXT,
          text: EN,
          context: "review",
          promptVersion: PROMPT_VERSION,
        },
      ],
    ]);
    expectCleanLogs(emit);
  });

  it("a row that is human or current (no source returned) is skipped without a model call", async () => {
    const ai = stubAi(() => gemmaReply({ en: EN }));
    const store = fakeStore({ staleTranslationSource: async () => null });
    expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "cache", translationId: "42" })).toBe("skipped");
    expect(ai.calls).toHaveLength(0);
    expect(store.calls.putMachineTranslation).toBeUndefined();
  });

  it("a source language outside the four is detected again with it as the fallback", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply({ lang: "it", en: EN }));
    const store = fakeStore({
      staleTranslationSource: async () => ({
        source_hash: "d".repeat(64),
        source_lang: "it",
        target_lang: "en",
        source_text: IT_TEXT,
        context: "review",
      }),
    });
    expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "cache", translationId: "43" })).toBe("done");
    expect(store.calls.putMachineTranslation![0]![0]).toMatchObject({ hash: "d".repeat(64), sourceLang: "it", targetLang: "en", text: EN });
  });

  it("a rejected re-translation keeps the earlier text (no write)", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const ai = stubAi(() => gemmaReply({ en: `Sure, here is the translation: ${EN}` }));
    const store = fakeStore();
    expect(await handleTranslateJob({ ai, store, emit: vi.fn() }, { v: 1, kind: "cache", translationId: "42" })).toBe("failed");
    expect(store.calls.putMachineTranslation).toBeUndefined();
  });
});
