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
  siteverify,
  type AttemptStore,
} from "./turnstile";

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
