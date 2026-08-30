// apps/web/lib/turnstile.ts
//
// SITE-04 / D-22 / D-24: always-on server-side siteverify for the public forms.
// Distinct from Phase 4's quote-abuse ladder (`lib/abuse/turnstile.ts`) — that
// system fails open below a threshold; a form write must never treat a missing
// secret, a non-200, or an unparseable body as a pass.
//
// The secret is a parameter, never read from the environment here, so the
// helper is unit-testable and has no hidden binding dependency.

import { log } from "./logger";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const SITEVERIFY_TIMEOUT_MS = 2_000;

export type TurnstileAction = "contact" | "partner-application";

export type TurnstileResult = { ok: true } | { ok: false; codes: string[] };

const MISSING_SECRET_CONTEXT = {
  requestId: "turnstile",
  route: "siteverify",
  locale: null,
} as const;

function fail(codes: string[]): TurnstileResult {
  return { ok: false, codes };
}

/**
 * POST form-encoded siteverify. Never throws — a transport or parse failure is
 * `{ ok: false, codes: ["unavailable"] }`.
 */
export async function verifyTurnstile(
  secret: string | undefined,
  token: string,
  opts: { action: TurnstileAction; idempotencyKey: string; remoteip?: string },
): Promise<TurnstileResult> {
  if (typeof secret !== "string" || secret.length === 0) {
    log("error", "turnstile", MISSING_SECRET_CONTEXT, { reason: "missing-secret" });
    return fail(["missing-secret"]);
  }

  const params = new URLSearchParams();
  params.set("secret", secret);
  params.set("response", token);
  params.set("action", opts.action);
  params.set("idempotency_key", opts.idempotencyKey);
  if (typeof opts.remoteip === "string" && opts.remoteip.length > 0) {
    params.set("remoteip", opts.remoteip);
  }

  let response: Response;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
  } catch {
    return fail(["unavailable"]);
  }

  if (response.status !== 200) {
    return fail(["unavailable"]);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return fail(["unavailable"]);
  }

  if (!body || typeof body !== "object") {
    return fail(["unavailable"]);
  }

  const record = body as { success?: unknown; "error-codes"?: unknown };
  if (record.success === true) {
    return { ok: true };
  }

  const raw = record["error-codes"];
  const codes = Array.isArray(raw)
    ? raw.filter((code): code is string => typeof code === "string")
    : [];
  return fail(codes.length > 0 ? codes : ["unavailable"]);
}
