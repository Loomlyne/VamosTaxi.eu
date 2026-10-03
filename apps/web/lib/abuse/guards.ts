// apps/web/lib/abuse/guards.ts
//
// The three pipeline guards, in the shape plan 04-11's runner already injects.
// QUOTE_STEPS fixed the ORDER in plan 04-11 and this module fills the slots —
// no step moves, and a guard that wants to run somewhere else is a change to
// that array, reviewed as one.
//
// Ordering is money, not taste: step 2 costs one binding call, step 3 costs a
// network round trip, step 4 costs a KV read, and step 10 costs a Mapbox unit
// — so the sequence is a cost ladder and inverting any pair means paying for
// a request that was going to be refused.

import { sessionBucket } from "../geo/session";
import type { InjectedGuard } from "../quote/pipeline";
import { breakerOpen, type AbuseEmit as BreakerEmit } from "./breaker";
import {
  bucketFor,
  checkRateLimit,
  type BucketForInput,
  type RateLimitBindings,
  type AbuseEmit as RateEmit,
} from "./rate-limit";
import {
  challengeDecision,
  kvAttemptStore,
  siteverify,
  type AttemptStore,
} from "./turnstile";
import { VAMOS_QS_COOKIE, verifyVamosQs } from "./vamos-qs";

export type RateLimitGuardInput = BucketForInput & { emit?: RateEmit };

export type TurnstileGuardInput = {
  ip: string;
  cookie?: string | null;
  secret: string;
  previousSecret?: string;
  token?: string | null;
  turnstileSecret?: string;
  fetch?: typeof fetch;
  attemptStore: AttemptStore;
  emit?: RateEmit;
};

export type BreakerGuardInput = {
  env: { QUOTE_ABUSE: KVNamespace; MAPBOX_DAILY_UNIT_SENTINEL?: string };
  nowMs?: number;
  emit?: BreakerEmit;
};

export function rateLimitGuard(input: RateLimitGuardInput): InjectedGuard {
  return async () => {
    const bucket = await bucketFor(input);
    return checkRateLimit({
      limiter: bucket.limiter,
      key: bucket.key,
      nowMs: input.nowMs,
      emit: input.emit,
    });
  };
}

export function turnstileGuard(input: TurnstileGuardInput): InjectedGuard {
  return async () => {
    const configured =
      typeof input.turnstileSecret === "string" && input.turnstileSecret.length > 0;
    let verify = undefined as Awaited<ReturnType<typeof siteverify>> | undefined;
    let degraded = false;
    if (configured && typeof input.token === "string" && input.token.length > 0) {
      verify = await siteverify({
        secret: input.turnstileSecret,
        response: input.token,
        remoteip: input.ip,
        idempotencyKey: crypto.randomUUID(),
        fetch: input.fetch,
      });
      if (verify.configured && "degraded" in verify && verify.degraded) {
        degraded = true;
      }
    }
    const decision = await challengeDecision({
      ip: input.ip,
      cookie: input.cookie,
      secret: input.secret,
      previousSecret: input.previousSecret,
      attemptStore: input.attemptStore,
      token: input.token,
      verify,
      configured,
      degraded,
    });
    if (!decision.enforce || decision.passed) {
      return { ok: true };
    }
    return { ok: false, code: "turnstile_required" };
  };
}

export function breakerGuard(input: BreakerGuardInput): InjectedGuard {
  return async () => {
    const open = await breakerOpen(input.env, input.nowMs ?? Date.now(), input.emit);
    if (open) {
      return { ok: false, code: "temporarily_unavailable" };
    }
    return { ok: true };
  };
}

export function clientIp(request: Request): string {
  return sessionBucket(request);
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  const parts = header.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    if (trimmed.slice(0, eq) === name) return trimmed.slice(eq + 1);
  }
  return null;
}

function passLimiter(): RateLimit {
  return { async limit() { return { success: true }; } };
}

function qsSecret(env: CloudflareEnv): string {
  const bound = env.VAMOS_QS_SECRET;
  if (typeof bound === "string" && bound.length > 0) return bound;
  if (typeof process !== "undefined" && typeof process.env.VAMOS_QS_SECRET === "string") {
    return process.env.VAMOS_QS_SECRET;
  }
  return "";
}

export type QuoteAbuseWire = {
  rateLimit: InjectedGuard;
  turnstile: InjectedGuard;
  mapboxBreaker: InjectedGuard;
  qsSubject: string | null;
  geoSession: { token: string; bucket: string } | null;
};

/**
 * Which Worker rate-limit counter a route spends (quick 261003). Each is its own pair of
 * namespaces in wrangler.jsonc, because a Workers rate limit counts per namespace + key:
 * sharing one pair let every address keystroke on home spend the allowance /checkout
 * needed for its first price (live, 2026-10-03).
 *
 * - quote:  POST /api/quote only. QUOTE_RATE_LIMITER 8/60 (ip:subject) / _BARE 4/60 (ip).
 *           Unchanged numbers: each call can bill Mapbox Directions. One booking spends
 *           1–2 (checkout load, maybe one trip edit). Namespaces 1001/1002 also hold the
 *           prefixed write keys (contact, review, consent, auth code), so they are not raised.
 * - price:  POST /api/quote/reprice and the voucher check in POST /api/checkout/price.
 *           PRICE_RATE_LIMITER 12/60 / _BARE 8/60. No Directions call; the limit is there
 *           against voucher guessing. One booking spends 1–4 (voucher, flight edit).
 * - lookup: /api/geo/suggest|retrieve|reverse and /api/flight/[no].
 *           LOOKUP_RATE_LIMITER 60/60 / _BARE 30/60. Home asks suggest 160 ms after each
 *           keystroke once 2 characters are typed: "ZRH" + "Zurich Main Station" is ~20
 *           calls, plus two retrieves and the checkout retrieve ≈ 20–25 in a minute.
 *           The daily Mapbox breaker (step 4, MAPBOX_DAILY_UNIT_SENTINEL) is SITE-WIDE: when
 *           it trips, every quote on the site answers temporarily_unavailable until midnight
 *           UTC. One IPv4 address or IPv6 /64 at the bare 30/min reaches 5000 units in
 *           ~170 min, so this counter is what keeps a single client from closing pricing.
 *
 * All keys are built from limiterIp(): IPv4 as is, IPv6 cut to its /64.
 */
export type RateCounter = "quote" | "price" | "lookup";

/** The verified/bare binding pair for one counter, in the shape bucketFor reads. */
export function counterBindings(env: CloudflareEnv, counter: RateCounter): RateLimitBindings {
  if (counter === "lookup") {
    return {
      QUOTE_RATE_LIMITER: env.LOOKUP_RATE_LIMITER ?? passLimiter(),
      QUOTE_RATE_LIMITER_BARE: env.LOOKUP_RATE_LIMITER_BARE ?? passLimiter(),
    };
  }
  if (counter === "price") {
    return {
      QUOTE_RATE_LIMITER: env.PRICE_RATE_LIMITER ?? passLimiter(),
      QUOTE_RATE_LIMITER_BARE: env.PRICE_RATE_LIMITER_BARE ?? passLimiter(),
    };
  }
  return {
    QUOTE_RATE_LIMITER: env.QUOTE_RATE_LIMITER ?? passLimiter(),
    QUOTE_RATE_LIMITER_BARE: env.QUOTE_RATE_LIMITER_BARE ?? passLimiter(),
  };
}

/** Quote / reprice / checkout price: all three guards in step order 2, 3, 4. */
export async function wireQuoteAbuse(
  env: CloudflareEnv,
  request: Request,
  counter: Exclude<RateCounter, "lookup"> = "quote",
): Promise<QuoteAbuseWire> {
  const ip = clientIp(request);
  const cookie = readCookie(request, VAMOS_QS_COOKIE);
  const secret = qsSecret(env);
  const qsSubject = secret ? await verifyVamosQs(secret, cookie) : null;
  const geoHeader = request.headers.get("x-geo-session");
  const geoSession =
    typeof geoHeader === "string" && geoHeader.length > 0
      ? { token: geoHeader, bucket: ip }
      : null;
  return {
    rateLimit: rateLimitGuard({
      ip,
      cookie,
      secret,
      bindings: counterBindings(env, counter),
    }),
    turnstile: turnstileGuard({
      ip,
      cookie,
      secret,
      turnstileSecret: env.TURNSTILE_SECRET,
      token: request.headers.get("cf-turnstile-response"),
      attemptStore: kvAttemptStore(env.QUOTE_ABUSE),
    }),
    mapboxBreaker: breakerGuard({
      env,
      nowMs: Date.now(),
    }),
    qsSubject,
    geoSession,
  };
}

/** Geo: rate-limit + breaker only. Flight: rate-limit only. Both spend the lookup counter. */
export function wireRateLimitGuard(env: CloudflareEnv, request: Request): InjectedGuard {
  const ip = clientIp(request);
  const cookie = readCookie(request, VAMOS_QS_COOKIE);
  const secret = qsSecret(env);
  return rateLimitGuard({
    ip,
    cookie,
    secret,
    bindings: counterBindings(env, "lookup"),
  });
}

export function wireBreakerGuard(env: CloudflareEnv): InjectedGuard {
  return breakerGuard({ env, nowMs: Date.now() });
}
