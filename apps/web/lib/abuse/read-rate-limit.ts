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

import { log } from "../logger";
import { limiterIp } from "./rate-limit";

export type ReadRoute = "status" | "resume" | "manage" | "paylink" | "lockexpire" | "reviews";

/** The limiter key for one route and one caller address. */
export function readRateKey(route: ReadRoute, request: Request): string {
  const ip = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
  return `read:${route}:${limiterIp(ip)}`;
}

let missingWarned = false;

/** True when the read may go ahead. */
export async function readAllowed(
  limiter: RateLimit | undefined,
  route: ReadRoute,
  request: Request,
): Promise<boolean> {
  if (!limiter) {
    // Once per isolate: `next dev` and unit runs have no binding at all.
    if (!missingWarned) {
      missingWarned = true;
      log("warn", "read_rate_limit_missing", { requestId: "abuse", route: `read:${route}`, locale: null }, {});
    }
    return true;
  }
  try {
    const out = await limiter.limit({ key: readRateKey(route, request) });
    return out.success;
  } catch {
    log("warn", "read_rate_limit_degraded", { requestId: "abuse", route: `read:${route}`, locale: null }, { limiter_ok: 0 });
    return true;
  }
}

/** The one refusal every limited read answers with: private, never cached, retry in a minute. */
export function readRateLimited(body: Record<string, unknown> = { ok: false, code: "rate_limited" }): Response {
  return Response.json(body, {
    status: 429,
    headers: { "cache-control": "private, no-store", "retry-after": "60" },
  });
}
