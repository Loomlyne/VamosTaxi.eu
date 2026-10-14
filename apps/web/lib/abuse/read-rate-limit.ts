// apps/web/lib/abuse/read-rate-limit.ts
//
// Security S12 (2026-10-05): the public reads that ask the database had no Worker rate limit:
// the confirmation status poll, the checkout resume, the manage-booking read, the pay-link open,
// the lock-expire call (S8) and the published review list. Each now spends its own key on one
// binding, READ_RATE_LIMITER (namespace 1012, 120 per 60 s): `read:<route>:<ip>`, the address cut
// by limiterIp (IPv4 as is, IPv6 to its /64), so one route never uses up another.
//
// 120 a minute sits far above a real visitor: the confirmation page polls status once a second
// while it waits (60 a minute), every other route is asked once per page load. It stops a single
// address from hammering the database, not a spread-out campaign (the zone rule stays the outer
// gate). A missing binding or a limiter that throws lets the read through and logs: these are
// reads, and a misconfiguration must not take the confirmation or the manage page down.
// A caller whose read can spend money (the review translate tap runs a model call on a cache miss)
// passes `{ failClosed: true }`: a missing or failing limiter then refuses (PR #83 review).

import { log } from "../logger";
import { limiterIp } from "./rate-limit";

// Phase 32 (T-32-32): the review-translate key is the home review translate tap (GET
// /api/reviews/:ref/translation). Own key on the same binding, no new namespace, so a tap burst never
// eats the review list's budget.
export type ReadRoute = "status" | "resume" | "manage" | "paylink" | "lockexpire" | "reviews" | "review-translate";

/** The limiter key for one route and one caller address. */
export function readRateKey(route: ReadRoute, request: Request): string {
  const ip = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
  return `read:${route}:${limiterIp(ip)}`;
}

let missingWarned = false;
let missingClosedWarned = false;

export type ReadAllowedOptions = {
  /** Refuse when the binding is missing or throws (default false: let the read through). */
  failClosed?: boolean;
};

/** True when the read may go ahead. A missing or failing limiter lets it through unless `failClosed`. */
export async function readAllowed(
  limiter: RateLimit | undefined,
  route: ReadRoute,
  request: Request,
  options: ReadAllowedOptions = {},
): Promise<boolean> {
  const failClosed = options.failClosed === true;
  if (!limiter) {
    // Once per isolate and mode: `next dev` and unit runs have no binding at all.
    if (failClosed ? !missingClosedWarned : !missingWarned) {
      if (failClosed) missingClosedWarned = true;
      else missingWarned = true;
      log("warn", "read_rate_limit_missing", { requestId: "abuse", route: `read:${route}`, locale: null }, {
        fail_closed: failClosed ? 1 : 0,
      });
    }
    return !failClosed;
  }
  try {
    const out = await limiter.limit({ key: readRateKey(route, request) });
    return out.success;
  } catch {
    log("warn", "read_rate_limit_degraded", { requestId: "abuse", route: `read:${route}`, locale: null }, {
      limiter_ok: 0,
      fail_closed: failClosed ? 1 : 0,
    });
    return !failClosed;
  }
}

/** The one refusal every limited read answers with: private, never cached, retry in a minute. */
export function readRateLimited(body: Record<string, unknown> = { ok: false, code: "rate_limited" }): Response {
  return Response.json(body, {
    status: 429,
    headers: { "cache-control": "private, no-store", "retry-after": "60" },
  });
}
