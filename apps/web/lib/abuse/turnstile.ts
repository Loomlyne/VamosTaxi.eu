// apps/web/lib/abuse/turnstile.ts
//
// D-35 / D-36 / D-47: Turnstile siteverify and the log-then-enforce ladder.
// Negative space: this module never renders a widget, never sets a cookie,
// and never blocks a request the owner has no account to challenge with.
//
// Rules that are decisions:
//  - 2-second timeout, ONE retry, SAME idempotency_key. Turnstile tokens are
//    single-use, so a retry with a NEW key against an already-consumed token
//    returns timeout-or-duplicate and turns a good customer into a 403.
//  - timeout-or-duplicate on a genuine duplicate is "mint a fresh token", not
//    "you are blocked". That is a distinct result member, not a boolean.
//  - The counter key is the IP or the VERIFIED cookie subject, never the raw
//    cookie value. Keying it on a client-mintable string is exactly the D-36
//    reset.
//  - Absence and degradation both fail OPEN below the threshold and fall back
//    to Layer 1's edge managed_challenge at or above it. A hard block here
//    would make an owner's unopened account into a customer-facing outage.
//  - Never log the token, the secret or the remoteip in raw form.

import { verifiedSubject } from "./vamos-qs";

export const TURNSTILE_TIMEOUT_MS = 2_000;

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type SiteverifyResult =
  | { configured: false }
  | { configured: true; success: true }
  | { configured: true; success: false; timeoutOrDuplicate: true }
  | { configured: true; success: false; degraded: true }
  | { configured: true; success: false };

export type AttemptStore = {
  increment(key: string): Promise<number>;
};

/**
 * KV-backed attempt counter. Missing or throwing KV never climbs — Layer 3
 * fails open rather than locking customers out of an unopened account (D-47).
 */
export function kvAttemptStore(kv: KVNamespace | undefined): AttemptStore {
  return {
    async increment(key: string): Promise<number> {
      if (!kv) return 1;
      try {
        const kvKey = "quote:turnstile:" + key;
        const stored = await kv.get(kvKey);
        const current = stored ? Number.parseInt(stored, 10) : 0;
        const next = (Number.isFinite(current) ? current : 0) + 1;
        await kv.put(kvKey, String(next), { expirationTtl: 60 });
        return next;
      } catch {
        return 1;
      }
    },
  };
}

export type ChallengeDecision = {
  enforce: boolean;
  passed?: boolean;
  fellBackToEdge?: true;
  mintFreshToken?: true;
};

export type SiteverifyInput = {
  secret?: string;
  response: string;
  remoteip?: string;
  idempotencyKey: string;
  fetch?: typeof fetch;
};

export type ChallengeDecisionInput = {
  ip: string;
  cookie?: string | null;
  secret: string;
  previousSecret?: string;
  attemptStore: AttemptStore;
  token?: string | null;
  verify?: SiteverifyResult;
  configured: boolean;
  degraded?: boolean;
};

function isTimeoutError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = (err as { name?: string }).name;
  return name === "TimeoutError" || name === "AbortError";
}

function readErrorCodes(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const codes = (body as { "error-codes"?: unknown })["error-codes"];
  if (!Array.isArray(codes)) return [];
  return codes.filter((c): c is string => typeof c === "string");
}

async function postSiteverify(
  fetchImpl: typeof fetch,
  payload: Record<string, string>,
): Promise<SiteverifyResult> {
  const res = await fetchImpl(SITEVERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TURNSTILE_TIMEOUT_MS),
  });
  // 26.2 audit: a 5xx answer, or a 2xx body that is not JSON, means siteverify is down, not
  // that the visitor failed the challenge: same degraded shape as a timeout, so
  // challengeDecision fails open as the header says. A 4xx is about the request (a malformed or
  // oversized token a stranger can send on purpose), so it stays a failed challenge.
  if (res.status >= 500) return { configured: true, success: false, degraded: true };
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return res.ok
      ? { configured: true, success: false, degraded: true }
      : { configured: true, success: false };
  }
  if (json && typeof json === "object" && (json as { success?: unknown }).success === true) {
    return { configured: true, success: true };
  }
  if (readErrorCodes(json).includes("timeout-or-duplicate")) {
    return { configured: true, success: false, timeoutOrDuplicate: true };
  }
  return { configured: true, success: false };
}

/**
 * Cloudflare siteverify. No secret → not configured, no fetch.
 */
export async function siteverify(input: SiteverifyInput): Promise<SiteverifyResult> {
  if (typeof input.secret !== "string" || input.secret.length === 0) {
    return { configured: false };
  }
  const fetchImpl = input.fetch ?? globalThis.fetch;
  const payload: Record<string, string> = {
    secret: input.secret,
    response: input.response,
    idempotency_key: input.idempotencyKey,
  };
  if (typeof input.remoteip === "string" && input.remoteip.length > 0) {
    payload.remoteip = input.remoteip;
  }

  try {
    return await postSiteverify(fetchImpl, payload);
  } catch (err) {
    if (!isTimeoutError(err)) {
      return { configured: true, success: false, degraded: true };
    }
    // ONE retry, SAME idempotency_key — a new key on a consumed token is a
    // real timeout-or-duplicate and would 403 a good customer. The payload already
    // carries that key and is not touched between the two calls.
    try {
      return await postSiteverify(fetchImpl, payload);
    } catch {
      return { configured: true, success: false, degraded: true };
    }
  }
}

function verifyDegraded(verify: SiteverifyResult | undefined): boolean {
  return Boolean(verify && "degraded" in verify && verify.degraded);
}

function verifyPassed(verify: SiteverifyResult | undefined): boolean {
  return Boolean(verify && verify.configured && "success" in verify && verify.success);
}

function verifyMintFresh(verify: SiteverifyResult | undefined): boolean {
  return Boolean(
    verify && "timeoutOrDuplicate" in verify && verify.timeoutOrDuplicate,
  );
}

/**
 * Log on the 1st–2nd request in the window; enforce from the 3rd.
 * Keyed on IP or verified cookie subject — never a client-mintable string.
 */
export async function challengeDecision(
  input: ChallengeDecisionInput,
): Promise<ChallengeDecision> {
  const subject = await verifiedSubject(input.cookie, input.secret, input.previousSecret);
  const key = subject ? input.ip + ":" + subject : input.ip;
  const attempt = await input.attemptStore.increment(key);

  if (attempt < 3) {
    return { enforce: false };
  }

  const degraded = input.degraded === true || verifyDegraded(input.verify);
  if (!input.configured || degraded) {
    return { enforce: false, fellBackToEdge: true };
  }

  if (verifyMintFresh(input.verify)) {
    return { enforce: true, passed: false, mintFreshToken: true };
  }

  if (verifyPassed(input.verify)) {
    return { enforce: true, passed: true };
  }

  return { enforce: true, passed: false };
}
