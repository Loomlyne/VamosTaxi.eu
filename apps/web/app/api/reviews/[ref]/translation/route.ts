// apps/web/app/api/reviews/[ref]/translation/route.ts
//
// GET /api/reviews/:ref/translation?lang=xx — Phase 32 (D-09, F-06, F-07). The home review card shows
// the original; a tap on Translate asks here. `ref` is the opaque `public.review_ref(body)` handle the
// public list sends (Security S10: never the row id), `lang` one of en/de/fr/ar.
//
//   200 { ok:true, data:{ text } }            public, max-age=3600, s-maxage=86400
//   400 { ok:false, code:"bad-request" }      ref not 16 hex, or lang not en/de/fr/ar
//   404 { ok:false, code:"not-found" }        no published review with that ref
//   409 { ok:false, code:"same-language" }    review language unknown or equal to lang
//   429 readRateLimited()                     own key read:review-translate:<ip> (T-32-32); also when the
//                                             limiter binding is missing or throws (fail closed: a miss
//                                             here can spend a model call, PR #83 review)
//   503 { ok:false, code:"unavailable" }      translator down, answer rejected, or attempt cap reached
//   every non-200 is private, no-store; POST/PUT/PATCH/DELETE answer 405.
//
// Order (T-32-32): limiter, validation, source (published only, publicSql), cache read, attempt cap,
// translator, store write. The translator runs only on a cache miss for a published review, at most
// MAX_ATTEMPTS failed tries per review and language within 24 h, with a 15 s ceiling; never on page load
// (GET /api/reviews has no path to it, lib/translate/boundary.test.ts). A store write that fails after a
// good translation still answers with the text (F-07). No answer names a vendor (D-05, memory
// no-internal-ids-public); logs carry reason codes and the language, never the review text.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { readAllowed, readRateLimited } from "@/lib/abuse/read-rate-limit";
import { log } from "@/lib/logger";
import { sourceHash } from "@/lib/translate/hash";
import { isLang, PROMPT_VERSION, type Lang } from "@/lib/translate/model";
import {
  markTranslation,
  putMachineTranslation,
  readCachedTranslation,
  reviewTranslationSource,
  type CachedTranslationRow,
} from "@/lib/translate/store";
import { translateText, translateUnknown, type AiLike, type TranslateFailReason } from "@/lib/translate/translate";

export const dynamic = "force-dynamic";

const REF = /^[0-9a-f]{16}$/;
const LANG_CODE = /^[a-z]{2}$/;
const TIMEOUT_MS = 15_000;
/** Failed or rejected tries per review and language before the 24 h pause (T-32-32). */
const MAX_ATTEMPTS = 3;
const CAP_WINDOW_MS = 24 * 60 * 60 * 1000;

const NO_STORE = { "cache-control": "private, no-store" };
const SHARED = { "cache-control": "public, max-age=3600, s-maxage=86400" };
const LOG_CTX = { requestId: "review-translate", route: "/api/reviews/[ref]/translation", locale: null };

/** Failure reasons that say the answer itself was unusable (stored as rejected, not failed). */
const REJECT_REASONS: readonly TranslateFailReason[] = ["guard", "refusal", "empty", "too_long"];

function fail(code: "bad-request" | "not-found" | "same-language" | "unavailable", status: number): Response {
  return Response.json({ ok: false, code }, { status, headers: NO_STORE });
}

function ok(text: string): Response {
  return Response.json({ ok: true, data: { text } }, { status: 200, headers: SHARED });
}

function methodNotAllowed(): Response {
  return Response.json({ ok: false, code: "method_not_allowed" }, { status: 405, headers: NO_STORE });
}

/** Error class only: a SQLSTATE class (two characters) or the error name. Never a message. */
function errorClass(err: unknown): string {
  const code = typeof err === "object" && err !== null ? (err as { code?: unknown }).code : undefined;
  if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code.slice(0, 2);
  return err instanceof Error ? err.name : typeof err;
}

function note(level: "info" | "warn", outcome: string, lang: Lang, extra: Record<string, string> = {}): void {
  log(level, "review_translate", LOG_CTX, { outcome, lang, ...extra });
}

/** True when a cached failed/rejected row has used up its tries in the last 24 h. */
function capped(row: CachedTranslationRow | null): boolean {
  if (!row || (row.status !== "failed" && row.status !== "rejected")) return false;
  if (row.attempts < MAX_ATTEMPTS) return false;
  const at = Date.parse(row.updated_at);
  return Number.isFinite(at) && Date.now() - at < CAP_WINDOW_MS;
}

export async function GET(request: Request, context: { params: Promise<{ ref: string }> }): Promise<Response> {
  const { env } = getCloudflareContext();
  if (!(await readAllowed(env.READ_RATE_LIMITER, "review-translate", request, { failClosed: true }))) {
    return readRateLimited();
  }

  const { ref } = await context.params;
  const lang = new URL(request.url).searchParams.get("lang");
  if (typeof ref !== "string" || !REF.test(ref) || !isLang(lang)) return fail("bad-request", 400);

  let source: { body: string; language: string | null } | null;
  try {
    source = await reviewTranslationSource(env, ref);
  } catch (err) {
    note("warn", "source_error", lang, { error: errorClass(err) });
    return fail("unavailable", 503);
  }
  if (!source) return fail("not-found", 404);
  const from = typeof source.language === "string" && LANG_CODE.test(source.language) ? source.language : null;
  if (!from || from === lang) return fail("same-language", 409);

  const hash = await sourceHash(from, source.body);
  let cached: CachedTranslationRow | null;
  try {
    cached = await readCachedTranslation(env, hash, lang);
  } catch (err) {
    note("warn", "cache_error", lang, { error: errorClass(err) });
    return fail("unavailable", 503);
  }
  if (cached?.status === "done" && typeof cached.translated_text === "string" && cached.translated_text.trim()) {
    return ok(cached.translated_text);
  }
  if (capped(cached)) return fail("unavailable", 503);

  const ai = (env as { AI?: AiLike }).AI;
  const outcome = await runEngine(ai, source.body, from, lang);
  if (!outcome.ok) {
    note("warn", "unavailable", lang, { reason: outcome.reason });
    if (outcome.status) {
      // Catch around the wrapper, never inside it (postgres.js begin() rethrows).
      try {
        await markTranslation(env, {
          hash,
          targetLang: lang,
          sourceLang: from,
          sourceText: source.body,
          context: "review",
          status: outcome.status,
          reason: outcome.reason,
        });
      } catch (err) {
        note("warn", "mark_error", lang, { error: errorClass(err) });
      }
    }
    return fail("unavailable", 503);
  }

  let text = outcome.text;
  try {
    const stored = await putMachineTranslation(env, {
      hash,
      sourceLang: from,
      targetLang: lang,
      sourceText: source.body,
      text,
      context: "review",
      promptVersion: PROMPT_VERSION,
    });
    // A row he wrote himself wins over the fresh text.
    if (stored?.origin === "human" && typeof stored.translated_text === "string" && stored.translated_text.trim()) {
      text = stored.translated_text;
    }
  } catch (err) {
    note("warn", "store_error", lang, { error: errorClass(err) });
  }
  return ok(text);
}

type EngineOutcome = { ok: true; text: string } | { ok: false; status: "failed" | "rejected" | null; reason: string };

/** One translator call for one target. `status: null` records nothing (no binding: a setup gap). */
async function runEngine(ai: AiLike | undefined, body: string, from: string, lang: Lang): Promise<EngineOutcome> {
  const result = isLang(from)
    ? await translateText(ai, { text: body, from, to: [lang], timeoutMs: TIMEOUT_MS })
    : await translateUnknown(ai, { text: body, to: [lang], fallbackLang: from, timeoutMs: TIMEOUT_MS });
  if (!result.ok) {
    if (result.reason === "no_binding") return { ok: false, status: null, reason: result.reason };
    return { ok: false, status: REJECT_REASONS.includes(result.reason) ? "rejected" : "failed", reason: result.reason };
  }
  const text = result.out[lang];
  if (typeof text !== "string" || text.trim().length === 0) return { ok: false, status: "rejected", reason: "guard" };
  return { ok: true, text };
}

export function POST() {
  return methodNotAllowed();
}

export function PUT() {
  return methodNotAllowed();
}

export function PATCH() {
  return methodNotAllowed();
}

export function DELETE() {
  return methodNotAllowed();
}
