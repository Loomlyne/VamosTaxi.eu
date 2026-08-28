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

/** Quote / reprice: all three guards in step order 2, 3, 4. */
export async function wireQuoteAbuse(
  env: CloudflareEnv,
  request: Request,
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
      bindings: {
        QUOTE_RATE_LIMITER: env.QUOTE_RATE_LIMITER ?? passLimiter(),
        QUOTE_RATE_LIMITER_BARE: env.QUOTE_RATE_LIMITER_BARE ?? passLimiter(),
      },
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

/** Geo: rate-limit + breaker only. Flight: rate-limit only. */
export function wireRateLimitGuard(env: CloudflareEnv, request: Request): InjectedGuard {
  const ip = clientIp(request);
  const cookie = readCookie(request, VAMOS_QS_COOKIE);
  const secret = qsSecret(env);
  return rateLimitGuard({
    ip,
    cookie,
    secret,
    bindings: {
      QUOTE_RATE_LIMITER: env.QUOTE_RATE_LIMITER ?? passLimiter(),
      QUOTE_RATE_LIMITER_BARE: env.QUOTE_RATE_LIMITER_BARE ?? passLimiter(),
    },
  });
}

export function wireBreakerGuard(env: CloudflareEnv): InjectedGuard {
  return breakerGuard({ env, nowMs: Date.now() });
}
