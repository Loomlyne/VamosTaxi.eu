// POST /api/consent — record_consent after GUC bind (SITE-08 / D-03 / D-14).
// Accept is fail-closed Turnstile action consent. Dismiss writes without Turnstile.
// Guest writes use asAnon only (D-08). Do not import @vamos/db.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { checkWriteRateLimit } from "@/lib/abuse/rate-limit";
import {
  recordConsent,
  type ConsentLocale,
  type ConsentMethod,
} from "@/lib/consent/bind";
import {
  consentSubjectSetCookie,
  mintConsentSubject,
  readConsentSubject,
} from "@/lib/consent/cookie";
import { cfConnectingIp, truncateClientIp } from "@/lib/consent/ip";
import { asAnon } from "@/lib/db/identity";
import { verifyTurnstile } from "@/lib/turnstile";

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
  const { env } = getCloudflareContext();
  const bindings = env as unknown as Record<string, string | undefined>;

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

  if (method === "accept_all") {
    const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";
    const challenge = await verifyTurnstile(
      env.TURNSTILE_SECRET_KEY ?? process.env.TURNSTILE_SECRET_KEY,
      token,
      {
        action: "consent",
        idempotencyKey,
        allowedHostnames:
          bindings.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES ??
          process.env.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES,
        remoteip: connectingIp ?? undefined,
      },
    );
    if (!challenge.ok) return json({ ok: false, code: "challenge_failed" }, 403);
  }

  try {
    await asAnon(env, async (tx) => {
      await recordConsent(tx, {
        subject,
        method,
        locale,
        userAgent: request.headers.get("user-agent"),
        ipTruncated,
      });
    });
  } catch {
    return json({ ok: false, code: "unavailable" }, 503);
  }

  return json({ ok: true }, 200, consentSubjectSetCookie(subject));
}
