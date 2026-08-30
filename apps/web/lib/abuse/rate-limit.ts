// apps/web/lib/abuse/rate-limit.ts
//
// D-35 / D-36: which of the two Workers rate-limit buckets a request falls
// into. This module decides the bucket, not whether the request is legitimate;
// it holds no secret of its own and builds no Response.
//
// Three inputs collapse to two outcomes. A VERIFIED cookie earns the larger
// 8/60 allowance because it cost a signature to obtain. Everything else —
// missing, malformed, unsigned, wrongly signed — shares the smaller 4/60
// IP bucket. Without this, `Cookie: vamos_qs=<fresh uuid>` is a new
// 8-per-minute allowance on every request, and the Turnstile counter resets
// with it.
//
// Binding limits (04-RESEARCH.md §12): QUOTE_RATE_LIMITER is 8/60,
// QUOTE_RATE_LIMITER_BARE is 4/60. The binding is permissive, eventually
// consistent, PER COLO. A geographically distributed campaign sees a multiple
// of the nominal limit. This layer defeats a single-origin hammer and is not
// the layer that catches low-and-slow — that sentence belongs in the ops
// runbook (plan 04-14) and here, not only in a research document.
//
// When the binding itself throws, we fail open and log. Layer 1 (the zone
// Rate Limiting Rule, 30/60 s managed_challenge) remains the gate.

import { log, type LogFields, type LogLevel } from "../logger";
import { verifyVamosQs } from "./vamos-qs";

export type AbuseEmit = (
  level: LogLevel,
  type: string,
  fields?: LogFields,
) => void;

export type RateLimitBindings = {
  QUOTE_RATE_LIMITER: RateLimit;
  QUOTE_RATE_LIMITER_BARE: RateLimit;
};

export type BucketKind = "verified" | "bare";

export type Bucket = {
  limiter: RateLimit;
  key: string;
  kind: BucketKind;
};

export type BucketForInput = {
  ip: string;
  cookie: string | null | undefined;
  secret: string;
  previousSecret?: string;
  bindings: RateLimitBindings;
  /** Injected instant; rotation is previousSecret presence, not a clock here. */
  nowMs?: number;
};

export type CheckRateLimitInput = {
  limiter: RateLimit;
  key: string;
  nowMs?: number;
  emit?: AbuseEmit;
};

const fallbackEmit: AbuseEmit = (level, type, fields = {}) => {
  log(level, type, { requestId: "abuse", route: "rate-limit", locale: null }, fields);
};

async function verifiedSubject(
  cookie: string | null | undefined,
  secret: string,
  previousSecret: string | undefined,
): Promise<string | null> {
  const current = await verifyVamosQs(secret, cookie);
  if (current) return current;
  if (typeof previousSecret === "string" && previousSecret.length > 0) {
    return verifyVamosQs(previousSecret, cookie);
  }
  return null;
}

/**
 * Pick the 8/60 verified binding or the 4/60 bare-IP binding.
 * An unverifiable cookie is treated as missing — never as a new identity.
 */
export async function bucketFor(input: BucketForInput): Promise<Bucket> {
  const subject = await verifiedSubject(
    input.cookie,
    input.secret,
    input.previousSecret,
  );
  if (subject) {
    return {
      limiter: input.bindings.QUOTE_RATE_LIMITER,
      key: `${input.ip}:${subject}`,
      kind: "verified",
    };
  }
  return {
    limiter: input.bindings.QUOTE_RATE_LIMITER_BARE,
    key: input.ip,
    kind: "bare",
  };
}

/**
 * Ask the chosen binding. A throw must not take the funnel down — Layer 1
 * is the remaining gate.
 */
export async function checkRateLimit(
  input: CheckRateLimitInput,
): Promise<{ ok: true } | { ok: false; code: "rate_limited" }> {
  try {
    const result = await input.limiter.limit({ key: input.key });
    if (!result.success) {
      return { ok: false, code: "rate_limited" };
    }
    return { ok: true };
  } catch {
    const emit = input.emit ?? fallbackEmit;
    emit("warn", "quote_rate_limit_degraded", { limiter_ok: 0 });
    return { ok: true };
  }
}
