// apps/web/lib/translate/store.test.ts
//
// Phase 32 plan 02: every store wrapper reaches the database through exactly one definer function,
// with the expected identity (publicSql for the two public reads, asSystem for the rest). JSON goes as
// sql.json (no arrays through the Worker pg client), and no statement touches a table directly.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Call = { via: "system" | "public"; text: string; values: unknown[] };

const h = vi.hoisted(() => {
  const state = { calls: [] as Call[], reply: [] as unknown[], via: "system" as "system" | "public" };
  const JSON_MARK = Symbol("json");
  function makeSql() {
    const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      state.calls.push({ via: state.via, text: strings.join("$?"), values });
      return Promise.resolve(state.reply);
    }) as unknown as ((s: TemplateStringsArray, ...v: unknown[]) => Promise<unknown[]>) & {
      json: (x: unknown) => unknown;
    };
    sql.json = (x: unknown) => ({ [JSON_MARK]: true, value: x });
    return sql;
  }
  return { state, JSON_MARK, makeSql };
});

vi.mock("@/lib/db/identity", () => ({
  asSystem: async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    h.state.via = "system";
    return fn(h.makeSql());
  },
}));
vi.mock("@/lib/db/public", () => ({
  publicSql: () => {
    h.state.via = "public";
    return h.makeSql();
  },
}));

import * as store from "./store";

const env = {} as CloudflareEnv;
const UUID = "0b8f3a52-2c1e-4c55-9d1a-6f0e1d2c3b4a";
const HASH = "a".repeat(64);

function only(): Call {
  expect(h.state.calls).toHaveLength(1);
  return h.state.calls[0]!;
}
function fnName(text: string): string | null {
  const m = /select \* from public\.([a-z_]+)\(/.exec(text);
  return m ? m[1]! : null;
}
function isJson(v: unknown): v is { value: unknown } {
  return typeof v === "object" && v !== null && (v as Record<symbol, unknown>)[h.JSON_MARK] === true;
}

beforeEach(() => {
  h.state.calls = [];
  h.state.reply = [];
});

const cases: Array<{ name: string; fn: string; via: "system" | "public"; run: () => Promise<unknown>; json?: boolean }> = [
  { name: "readCachedTranslation", fn: "translation_read", via: "public", run: () => store.readCachedTranslation(env, HASH, "de") },
  { name: "reviewTranslationSource", fn: "review_translation_source", via: "public", run: () => store.reviewTranslationSource(env, "0123456789abcdef") },
  {
    name: "putMachineTranslation",
    fn: "system_translation_put_machine",
    via: "system",
    run: () =>
      store.putMachineTranslation(env, {
        hash: HASH, sourceLang: "en", targetLang: "de", sourceText: "Great", text: "Toll", context: "review", promptVersion: 1,
      }),
  },
  {
    name: "markTranslation",
    fn: "system_translation_mark",
    via: "system",
    run: () =>
      store.markTranslation(env, {
        hash: HASH, targetLang: "fr", sourceLang: "en", sourceText: "Great", context: "review", status: "rejected", reason: "guard",
      }),
  },
  { name: "supportTranslationSource", fn: "system_support_translation_source", via: "system", run: () => store.supportTranslationSource(env, UUID) },
  { name: "supportFormMessageId", fn: "system_support_form_message_id", via: "system", run: () => store.supportFormMessageId(env, UUID) },
  {
    name: "putSupportTranslation",
    fn: "system_support_translation_put",
    via: "system",
    json: true,
    run: () => store.putSupportTranslation(env, UUID, "de", { en: { body: "Hello", status: "done" }, fr: { body: null, status: "rejected" } }, 1),
  },
  { name: "failSupportTranslation", fn: "system_support_translation_fail", via: "system", run: () => store.failSupportTranslation(env, UUID) },
  { name: "bookingNoteSource", fn: "system_booking_note_source", via: "system", run: () => store.bookingNoteSource(env, UUID) },
  {
    name: "putBookingNoteTranslation",
    fn: "system_booking_note_translation_put",
    via: "system",
    json: true,
    run: () => store.putBookingNoteTranslation(env, UUID, "de", HASH, { en: { body: "Wait at exit B", status: "done" } }, 1),
  },
  { name: "failBookingNoteTranslation", fn: "system_booking_note_translation_fail", via: "system", run: () => store.failBookingNoteTranslation(env, UUID, HASH) },
  { name: "translationBacklog", fn: "system_translation_backlog", via: "system", run: () => store.translationBacklog(env, 50) },
  { name: "reviewLanguageSource", fn: "system_review_language_source", via: "system", run: () => store.reviewLanguageSource(env, UUID) },
  { name: "setReviewLanguage", fn: "system_review_language_set", via: "system", run: () => store.setReviewLanguage(env, UUID, "de") },
  { name: "extraLabelsMissing", fn: "system_extra_labels_missing", via: "system", run: () => store.extraLabelsMissing(env) },
  { name: "fillExtraLabel", fn: "system_extra_label_fill", via: "system", json: true, run: () => store.fillExtraLabel(env, "child_seat", { de: "Kindersitz" }) },
];

describe("translate store: one definer function per wrapper", () => {
  it("covers every exported wrapper", () => {
    const exported = Object.entries(store)
      .filter(([, v]) => typeof v === "function")
      .map(([k]) => k)
      .sort();
    expect(exported).toEqual(cases.map((c) => c.name).sort());
  });

  for (const c of cases) {
    it(`${c.name} calls only public.${c.fn} through ${c.via === "public" ? "publicSql" : "asSystem"}`, async () => {
      await c.run();
      const call = only();
      expect(call.via).toBe(c.via);
      expect(fnName(call.text)).toBe(c.fn);
      expect(call.text).not.toMatch(/from public\.translations\b/);
      expect(call.text).not.toMatch(/from public\.support_message_translations\b/);
      expect(call.text).not.toMatch(/from public\.booking_note_translations\b/);
      expect(call.text).not.toMatch(/\binsert into\b|\bupdate public\.|\bdelete from\b/i);
      expect(call.values.some((v) => Array.isArray(v))).toBe(false);
      expect(call.values.some(isJson)).toBe(Boolean(c.json));
    });
  }

  it("failBookingNoteTranslation calls only public.system_booking_note_translation_fail with id and hash", async () => {
    await store.failBookingNoteTranslation(env, UUID, HASH);
    const call = only();
    expect(fnName(call.text)).toBe("system_booking_note_translation_fail");
    expect(call.values).toEqual([UUID, HASH]);
  });

  it("customer-text writers send per-language rows as sql.json with the prompt version", async () => {
    await store.putSupportTranslation(env, UUID, "de", { en: { body: "Hello", status: "done" } }, 3);
    const json = only().values.find(isJson);
    expect(json?.value).toEqual({ en: { body: "Hello", status: "done", prompt_version: 3 } });
  });

  it("readers map the first row or null", async () => {
    expect(await store.readCachedTranslation(env, HASH, "de")).toBeNull();
    h.state.reply = [{ translated_text: "Toll", status: "done", attempts: 1, updated_at: "2026-10-14" }];
    expect((await store.readCachedTranslation(env, HASH, "de"))?.translated_text).toBe("Toll");
    h.state.reply = [{ id: UUID }];
    expect(await store.supportFormMessageId(env, UUID)).toBe(UUID);
    h.state.reply = [{ n: 2 }];
    expect(await store.fillExtraLabel(env, "child_seat", { de: "Kindersitz" })).toBe(2);
  });
});
