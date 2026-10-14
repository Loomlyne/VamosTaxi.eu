// apps/web/tests/unit/review-translation-route.test.ts
//
// Phase 32 plan 08 (D-09, F-06, F-07, T-32-32..36): GET /api/reviews/:ref/translation?lang=xx.
// Cache first; the engine runs only on a miss for a published review, at most 3 failed attempts per
// review and language in 24 h; every refusal is private/no-store; no vendor, model or "machine" word
// and no review row id in any answer. Store and engine are stand-ins (no database, no network).

import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  allow: true,
  limiter: "ok" as "ok" | "missing" | "throws",
  limiterKeys: [] as string[],
  ai: { run: vi.fn() } as { run: ReturnType<typeof vi.fn> } | undefined,
};

vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: {
      READ_RATE_LIMITER:
        state.limiter === "missing"
          ? undefined
          : {
              limit: async ({ key }: { key: string }) => {
                state.limiterKeys.push(key);
                if (state.limiter === "throws") throw new Error("limiter down");
                return { success: state.allow };
              },
            },
      HYPERDRIVE: { connectionString: "postgres://unused" },
      AI: state.ai,
    },
  }),
}));

const store = {
  reviewTranslationSource: vi.fn(),
  readCachedTranslation: vi.fn(),
  putMachineTranslation: vi.fn(),
  markTranslation: vi.fn(),
};
vi.mock("@/lib/translate/store", () => ({
  reviewTranslationSource: (...a: unknown[]) => store.reviewTranslationSource(...a),
  readCachedTranslation: (...a: unknown[]) => store.readCachedTranslation(...a),
  putMachineTranslation: (...a: unknown[]) => store.putMachineTranslation(...a),
  markTranslation: (...a: unknown[]) => store.markTranslation(...a),
}));

const engine = { translateText: vi.fn(), translateUnknown: vi.fn() };
vi.mock("@/lib/translate/translate", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/translate/translate")>();
  return {
    ...real,
    translateText: (...a: unknown[]) => engine.translateText(...a),
    translateUnknown: (...a: unknown[]) => engine.translateUnknown(...a),
  };
});

const logs: unknown[][] = [];
vi.mock("@/lib/logger", () => ({
  log: (...a: unknown[]) => {
    logs.push(a);
  },
}));

import { sourceHash } from "@/lib/translate/hash";
import { DELETE, GET, PATCH, POST, PUT } from "../../app/api/reviews/[ref]/translation/route";

const REF = "0123456789abcdef";
const ROW_ID = "8f0b4c3e-1d2a-4b5c-9e8f-7a6b5c4d3e2f";
const BODY = "Pünktlich, sauberes Auto, sehr freundlich.";
const TEXT_EN = "On time, clean car, very friendly.";
const VENDOR = /gemma|google|cloudflare|workers|model|machine/i;
const PUBLIC_CACHE = "public, max-age=3600, s-maxage=86400";

function req(ref: string, lang: string | null, method = "GET"): [Request, { params: Promise<{ ref: string }> }] {
  const q = lang === null ? "" : `?lang=${encodeURIComponent(lang)}`;
  return [
    new Request(`https://vamostaxi.site/api/reviews/${ref}/translation${q}`, {
      method,
      headers: { "cf-connecting-ip": "203.0.113.7" },
    }),
    { params: Promise.resolve({ ref }) },
  ];
}

async function call(ref: string, lang: string | null): Promise<{ res: Response; json: Record<string, unknown>; raw: string }> {
  const res = await GET(...req(ref, lang));
  const raw = await res.text();
  return { res, raw, json: JSON.parse(raw) as Record<string, unknown> };
}

/** Body and every header value: no vendor word, no row id. */
function assertClean(res: Response, raw: string): void {
  expect(raw).not.toMatch(VENDOR);
  expect(raw).not.toContain(ROW_ID);
  res.headers.forEach((value, key) => {
    expect(`${key}: ${value}`).not.toMatch(VENDOR);
  });
}

function noStore(res: Response): void {
  expect(res.headers.get("cache-control")).toBe("private, no-store");
}

beforeEach(() => {
  state.allow = true;
  state.limiter = "ok";
  state.limiterKeys = [];
  state.ai = { run: vi.fn() };
  logs.length = 0;
  for (const f of [...Object.values(store), ...Object.values(engine)]) f.mockReset();
  store.reviewTranslationSource.mockResolvedValue({ body: BODY, language: "de" });
  store.readCachedTranslation.mockResolvedValue(null);
  store.putMachineTranslation.mockResolvedValue({ translated_text: TEXT_EN, origin: "machine", status: "done" });
  store.markTranslation.mockResolvedValue(undefined);
  engine.translateText.mockResolvedValue({ ok: true, out: { en: TEXT_EN }, rejected: [] });
  engine.translateUnknown.mockResolvedValue({ ok: true, lang: "it", out: { en: TEXT_EN }, rejected: [] });
});

describe("GET /api/reviews/:ref/translation", () => {
  it("cache hit (done): 200 { ok, data:{ text } } with the public cache header and no engine call", async () => {
    store.readCachedTranslation.mockResolvedValue({
      translated_text: TEXT_EN,
      status: "done",
      attempts: 1,
      updated_at: new Date().toISOString(),
    });
    const { res, json, raw } = await call(REF, "en");
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { text: TEXT_EN } });
    expect(res.headers.get("cache-control")).toBe(PUBLIC_CACHE);
    expect(engine.translateText).not.toHaveBeenCalled();
    expect(engine.translateUnknown).not.toHaveBeenCalled();
    expect(store.putMachineTranslation).not.toHaveBeenCalled();
    expect(store.readCachedTranslation).toHaveBeenCalledWith(expect.anything(), await sourceHash("de", BODY), "en");
    assertClean(res, raw);
  });

  it("cache miss: one engine call, stored through putMachineTranslation, then 200", async () => {
    const { res, json, raw } = await call(REF, "en");
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { text: TEXT_EN } });
    expect(res.headers.get("cache-control")).toBe(PUBLIC_CACHE);
    expect(engine.translateText).toHaveBeenCalledTimes(1);
    const [ai, args] = engine.translateText.mock.calls[0]!;
    expect(ai).toBe(state.ai);
    expect(args).toMatchObject({ text: BODY, from: "de", to: ["en"], timeoutMs: 15000 });
    expect(store.putMachineTranslation).toHaveBeenCalledTimes(1);
    expect(store.putMachineTranslation.mock.calls[0]![1]).toMatchObject({
      hash: await sourceHash("de", BODY),
      sourceLang: "de",
      targetLang: "en",
      sourceText: BODY,
      text: TEXT_EN,
      context: "review",
      promptVersion: 1,
    });
    assertClean(res, raw);
  });

  it("a human row returned by the put is served instead of the fresh text", async () => {
    store.putMachineTranslation.mockResolvedValue({ translated_text: "His own words.", origin: "human", status: "done" });
    const { res, json } = await call(REF, "en");
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { text: "His own words." } });
  });

  it("engine failure: markTranslation failed, 503 unavailable, no-store", async () => {
    engine.translateText.mockResolvedValue({ ok: false, reason: "timeout" });
    const { res, json, raw } = await call(REF, "en");
    expect(res.status).toBe(503);
    expect(json).toEqual({ ok: false, code: "unavailable" });
    noStore(res);
    expect(store.markTranslation).toHaveBeenCalledTimes(1);
    expect(store.markTranslation.mock.calls[0]![1]).toMatchObject({
      hash: await sourceHash("de", BODY),
      targetLang: "en",
      sourceLang: "de",
      context: "review",
      status: "failed",
      reason: "timeout",
    });
    expect(store.putMachineTranslation).not.toHaveBeenCalled();
    assertClean(res, raw);
  });

  it("rejected target: markTranslation rejected, 503 unavailable, no-store", async () => {
    engine.translateText.mockResolvedValue({ ok: true, out: {}, rejected: ["en"] });
    const { res, json, raw } = await call(REF, "en");
    expect(res.status).toBe(503);
    expect(json).toEqual({ ok: false, code: "unavailable" });
    noStore(res);
    expect(store.markTranslation.mock.calls[0]![1]).toMatchObject({ status: "rejected", reason: "guard" });
    assertClean(res, raw);
  });

  it("a guard failure of the whole call is marked rejected, not failed", async () => {
    engine.translateText.mockResolvedValue({ ok: false, reason: "guard" });
    const { res } = await call(REF, "en");
    expect(res.status).toBe(503);
    expect(store.markTranslation.mock.calls[0]![1]).toMatchObject({ status: "rejected", reason: "guard" });
  });

  it("a failed/rejected row with attempts >= 3 updated within 24 h: 503 with no engine call", async () => {
    for (const status of ["failed", "rejected"] as const) {
      engine.translateText.mockClear();
      store.readCachedTranslation.mockResolvedValue({
        translated_text: null,
        status,
        attempts: 3,
        updated_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      });
      const { res, json, raw } = await call(REF, "en");
      expect(res.status).toBe(503);
      expect(json).toEqual({ ok: false, code: "unavailable" });
      noStore(res);
      expect(engine.translateText).not.toHaveBeenCalled();
      expect(store.markTranslation).not.toHaveBeenCalled();
      assertClean(res, raw);
    }
  });

  it("the cap lifts after 24 h, and fewer than 3 attempts may try again", async () => {
    store.readCachedTranslation.mockResolvedValue({
      translated_text: null,
      status: "failed",
      attempts: 5,
      updated_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    });
    expect((await call(REF, "en")).res.status).toBe(200);
    store.readCachedTranslation.mockResolvedValue({
      translated_text: null,
      status: "failed",
      attempts: 2,
      updated_at: new Date().toISOString(),
    });
    expect((await call(REF, "en")).res.status).toBe(200);
    expect(engine.translateText).toHaveBeenCalledTimes(2);
  });

  it("unknown or unpublished ref: 404 not-found, no-store, no cache read and no engine call", async () => {
    store.reviewTranslationSource.mockResolvedValue(null);
    const { res, json, raw } = await call(REF, "en");
    expect(res.status).toBe(404);
    expect(json).toEqual({ ok: false, code: "not-found" });
    noStore(res);
    expect(store.readCachedTranslation).not.toHaveBeenCalled();
    expect(engine.translateText).not.toHaveBeenCalled();
    assertClean(res, raw);
  });

  it("bad ref or lang: 400 bad-request, no-store, no database read", async () => {
    const cases: [string, string | null][] = [
      [ROW_ID, "en"],
      ["0123456789ABCDEF", "en"],
      ["0123456789abcde", "en"],
      ["0123456789abcdef0", "en"],
      [REF, "it"],
      [REF, "EN"],
      [REF, null],
      [REF, ""],
    ];
    for (const [ref, lang] of cases) {
      const { res, json, raw } = await call(ref, lang);
      expect(res.status).toBe(400);
      expect(json).toEqual({ ok: false, code: "bad-request" });
      noStore(res);
      assertClean(res, raw);
    }
    expect(store.reviewTranslationSource).not.toHaveBeenCalled();
    expect(store.readCachedTranslation).not.toHaveBeenCalled();
  });

  it("review language unknown or equal to lang: 409 same-language, no engine call", async () => {
    for (const language of [null, "en"]) {
      store.reviewTranslationSource.mockResolvedValue({ body: BODY, language });
      const { res, json, raw } = await call(REF, "en");
      expect(res.status).toBe(409);
      expect(json).toEqual({ ok: false, code: "same-language" });
      noStore(res);
      assertClean(res, raw);
    }
    expect(store.readCachedTranslation).not.toHaveBeenCalled();
    expect(engine.translateText).not.toHaveBeenCalled();
    expect(engine.translateUnknown).not.toHaveBeenCalled();
  });

  it("limiter refuses: 429 private on its own key read:review-translate:<ip>, and no database read", async () => {
    state.allow = false;
    const { res, raw } = await call(REF, "en");
    expect(res.status).toBe(429);
    noStore(res);
    expect(state.limiterKeys).toEqual(["read:review-translate:203.0.113.7"]);
    expect(store.reviewTranslationSource).not.toHaveBeenCalled();
    expect(store.readCachedTranslation).not.toHaveBeenCalled();
    expect(engine.translateText).not.toHaveBeenCalled();
    assertClean(res, raw);
  });

  // PR #83 review: a cache miss here spends a model call, so this route alone fails closed.
  it("limiter binding missing: 429 private, no database read, no engine call (fail closed)", async () => {
    state.limiter = "missing";
    const { res, json, raw } = await call(REF, "en");
    expect(res.status).toBe(429);
    noStore(res);
    expect(json).toEqual({ ok: false, code: "rate_limited" });
    expect(store.reviewTranslationSource).not.toHaveBeenCalled();
    expect(store.readCachedTranslation).not.toHaveBeenCalled();
    expect(engine.translateText).not.toHaveBeenCalled();
    expect(engine.translateUnknown).not.toHaveBeenCalled();
    assertClean(res, raw);
  });

  it("limiter that throws: 429 private, no database read, no engine call (fail closed)", async () => {
    state.limiter = "throws";
    const { res, json, raw } = await call(REF, "en");
    expect(res.status).toBe(429);
    noStore(res);
    expect(json).toEqual({ ok: false, code: "rate_limited" });
    expect(state.limiterKeys).toEqual(["read:review-translate:203.0.113.7"]);
    expect(store.reviewTranslationSource).not.toHaveBeenCalled();
    expect(store.readCachedTranslation).not.toHaveBeenCalled();
    expect(engine.translateText).not.toHaveBeenCalled();
    assertClean(res, raw);
  });

  it("review language outside the four (it): translateUnknown with fallbackLang it, target lang only", async () => {
    store.reviewTranslationSource.mockResolvedValue({ body: "Puntuale e gentile.", language: "it" });
    const { res, json } = await call(REF, "en");
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { text: TEXT_EN } });
    expect(engine.translateText).not.toHaveBeenCalled();
    expect(engine.translateUnknown).toHaveBeenCalledTimes(1);
    expect(engine.translateUnknown.mock.calls[0]![1]).toMatchObject({
      text: "Puntuale e gentile.",
      to: ["en"],
      fallbackLang: "it",
      timeoutMs: 15000,
    });
    expect(store.readCachedTranslation).toHaveBeenCalledWith(expect.anything(), await sourceHash("it", "Puntuale e gentile."), "en");
    expect(store.putMachineTranslation.mock.calls[0]![1]).toMatchObject({ sourceLang: "it", targetLang: "en" });
  });

  it("store write failure after a successful translation still answers 200 with the text; logs carry no text", async () => {
    store.putMachineTranslation.mockRejectedValue(Object.assign(new Error(`boom ${BODY}`), { code: "42501" }));
    const { res, json } = await call(REF, "en");
    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, data: { text: TEXT_EN } });
    expect(logs.length).toBeGreaterThan(0);
    const logged = JSON.stringify(logs);
    expect(logged).not.toContain(BODY);
    expect(logged).not.toContain(TEXT_EN);
    expect(logged).not.toContain("boom");
  });

  it("a mark failure after an engine failure still answers 503 unavailable", async () => {
    engine.translateText.mockResolvedValue({ ok: false, reason: "model_error" });
    store.markTranslation.mockRejectedValue(new Error("down"));
    const { res, json } = await call(REF, "en");
    expect(res.status).toBe(503);
    expect(json).toEqual({ ok: false, code: "unavailable" });
  });

  it("a database error on the source or cache read: 503 unavailable, no engine call", async () => {
    store.reviewTranslationSource.mockRejectedValue(new Error("db down"));
    expect((await call(REF, "en")).res.status).toBe(503);
    store.reviewTranslationSource.mockResolvedValue({ body: BODY, language: "de" });
    store.readCachedTranslation.mockRejectedValue(new Error("db down"));
    const { res, json } = await call(REF, "en");
    expect(res.status).toBe(503);
    expect(json).toEqual({ ok: false, code: "unavailable" });
    noStore(res);
    expect(engine.translateText).not.toHaveBeenCalled();
  });

  it("no binding (local without the translator): 503 unavailable and no attempt recorded", async () => {
    state.ai = undefined;
    engine.translateText.mockResolvedValue({ ok: false, reason: "no_binding" });
    const { res } = await call(REF, "en");
    expect(res.status).toBe(503);
    expect(store.markTranslation).not.toHaveBeenCalled();
  });

  it("POST, PUT, PATCH, DELETE answer 405", async () => {
    for (const handler of [POST, PUT, PATCH, DELETE]) {
      const res = await handler();
      expect(res.status).toBe(405);
      noStore(res);
      const raw = await res.text();
      assertClean(res, raw);
    }
  });
});
