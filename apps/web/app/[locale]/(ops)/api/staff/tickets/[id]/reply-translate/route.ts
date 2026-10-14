// apps/web/app/[locale]/(ops)/api/staff/tickets/[id]/reply-translate/route.ts
//
// POST /api/staff/tickets/:id/reply-translate — Phase 32 (D-07, D-08). His reply box calls this before
// it opens his mail app: the text he wrote in his dashboard language comes back in the customer's
// language. Body { text (1..4000), lang (the customer's language), from? (his dashboard language) }.
// Answers { status: "ready", text } | { status: "failed" } | { status: "skipped" }.
//
// - Only into en/de/fr/ar (D-08): any other customer language is "skipped" and his text goes as written.
// - The dashboard still sends nothing (owner G27): this route only returns text. Nothing is stored (his
//   reply is private and unique). Logs carry a reason code and the target language, never his text.
// - Staff only: withStaff (session, active staff row, CSRF origin on POST); the ticket must exist under
//   the staff RLS, else 404 (T-32-28). 4000-character cap and a 20 s ceiling (T-32-29).
// Dual-mounted at app/api/staff/tickets/[id]/reply-translate.

import { getCloudflareContext as workerContext } from "@opennextjs/cloudflare";
import { asStaff } from "@/lib/db/identity";
import { log } from "@/lib/logger";
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";
import { isLang, type Lang } from "@/lib/translate/model";
import { MAX_SOURCE, translateText, translateUnknown, type AiLike } from "@/lib/translate/translate";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIMEOUT_MS = 20_000;
const LOG_CTX = { requestId: "reply-translate", route: "/api/staff/tickets/[id]/reply-translate", locale: null };

/** The ticket id: the path segment before `reply-translate`. */
function ticketId(request: Request): string | null {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  if (parts.at(-1) !== "reply-translate") return null;
  const id = parts.at(-2) ?? "";
  return UUID.test(id) ? id : null;
}

function failed(reason: string, lang: Lang): Response {
  log("warn", "reply_translate", LOG_CTX, { reason, lang });
  return jsonOk({ status: "failed" });
}

/** A usable answer is ready; an empty one failed; one equal to his text (nothing to translate) is skipped. */
function answer(out: string | undefined, text: string, lang: Lang): Response {
  if (!out || out.trim().length === 0) return failed("guard", lang);
  if (out.trim() === text.trim()) return jsonOk({ status: "skipped" });
  return jsonOk({ status: "ready", text: out });
}

export const POST = withStaff(async (claims, request) => {
  const id = ticketId(request);
  if (!id) return jsonErr("not-found", 404);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonErr("invalid-json", 400);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonErr("invalid-json", 400);
  const record = body as { text?: unknown; lang?: unknown; from?: unknown };
  const text = record.text;
  if (typeof text !== "string" || text.trim().length === 0 || text.length > MAX_SOURCE) {
    return jsonErr("invalid-text", 400);
  }

  const { env } = workerContext();
  // Catch around the wrapper, never inside it (a refused statement poisons the transaction).
  let found: boolean;
  try {
    found = await asStaff(env, claims, async (sql) => {
      const rows = await sql<{ id: string }[]>`
        select id from public.contact_submissions where id = ${id}::uuid limit 1
      `;
      return rows.length > 0;
    });
  } catch {
    return jsonErr("unavailable", 503);
  }
  if (!found) return jsonErr("not-found", 404);

  const lang = record.lang;
  if (!isLang(lang)) return jsonOk({ status: "skipped" });
  const from = isLang(record.from) ? record.from : null;
  if (from === lang) return jsonOk({ status: "skipped" });

  const ai = (env as { AI?: AiLike }).AI;
  if (from) {
    const result = await translateText(ai, { text, from, to: [lang], timeoutMs: TIMEOUT_MS });
    if (!result.ok) return failed(result.reason, lang);
    return answer(result.out[lang], text, lang);
  }
  const result = await translateUnknown(ai, { text, to: [lang], timeoutMs: TIMEOUT_MS });
  if (result.ok && result.lang === lang) return jsonOk({ status: "skipped" });
  if (!result.ok) return failed(result.reason, lang);
  return answer(result.out[lang], text, lang);
});
