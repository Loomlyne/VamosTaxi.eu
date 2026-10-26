// POST /api/consent — record_consent after GUC bind (SITE-08 / D-03 / D-14).
// The row carries the categories the visitor chose (27 D-05). No Turnstile on consent (owner 2026-10-26,
// replaces 27 D-33): every choice saves in one click; the per-IP write limit below is the abuse guard.
// Guest writes use asCheckout with no claims only (D-08; 261005 S6: record_consent is executable by
// vamos_checkout, not by anon, so Supabase REST cannot write consent rows past this route's limits).
// Do not import @vamos/db.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkWriteRateLimit } from "@/lib/abuse/rate-limit";
import {
  recordConsent,
  type ConsentLocale,
  type ConsentMethod,
} from "@/lib/consent/bind";
import { categoriesForChoice } from "@/lib/consent/choice";
import {
  consentSubjectSetCookie,
  mintConsentSubject,
  readConsentSubject,
} from "@/lib/consent/cookie";
import { cfConnectingIp, truncateClientIp } from "@/lib/consent/ip";
import { asCheckout } from "@/lib/db/identity";
import { csrfForbidden } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

const LOCALES = new Set<ConsentLocale>(["en", "de", "fr", "ar"]);

function json(
  body: { ok: true } | { ok: false; code: string },
  status: number,
  setCookie?: string,
): Response {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  if (setCookie) headers.set("Set-Cookie", setCookie);
  return Response.json(body, { status, headers });
}

function parseLocale(raw: unknown): ConsentLocale {
  if (typeof raw === "string" && LOCALES.has(raw as ConsentLocale)) {
    return raw as ConsentLocale;
  }
  return "en";
}

export function GET(): Response {
  return new Response(null, {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;
  const { env } = getCloudflareContext();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json({ ok: false, code: "invalid_input" }, 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return json({ ok: false, code: "invalid_input" }, 400);
  }
  const body = raw as Record<string, unknown>;
  let method: ConsentMethod | null = null;
  if (body.method === "accept" || body.method === "accept_all") method = "accept_all";
  else if (body.method === "dismiss" || body.method === "reject" || body.method === "reject_all") {
    method = "reject_all";
  } else if (body.method === "settings_change") method = "settings_change";
  if (!method) return json({ ok: false, code: "invalid_input" }, 400);
  const chosen = categoriesForChoice(method, body);
  if (!chosen.ok) return json({ ok: false, code: "invalid_input" }, 400);
  const categories = chosen.categories;
  const locale = parseLocale(body.locale);

  const existing = readConsentSubject(request.headers.get("cookie"));
  const subject = existing ?? mintConsentSubject();
  const connectingIp = cfConnectingIp(request.headers);
  const ipKey = connectingIp ?? "unknown";
  const ipTruncated = truncateClientIp(connectingIp);

  const limited = await checkWriteRateLimit({
    limiter: env.QUOTE_RATE_LIMITER_BARE,
    kind: "consent",
    ip: ipKey,
    subject,
  });
  if (!limited.ok) return json({ ok: false, code: "rate_limited" }, 429);

  try {
    await asCheckout(env, null, async (tx) => {
      await recordConsent(tx, {
        subject,
        method,
        locale,
        categories,
        userAgent: request.headers.get("user-agent"),
        ipTruncated,
      });
    });
  } catch {
    return json({ ok: false, code: "unavailable" }, 503);
  }

  return json({ ok: true }, 200, consentSubjectSetCookie(subject));
}
