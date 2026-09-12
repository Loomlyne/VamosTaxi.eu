---
phase: 10-hardening-performance-security-compliance
plan: 08
subsystem: infra
tags: [health, hyperdrive, stripe, mapbox, launch-03]

requires:
  - phase: 10-hardening-performance-security-compliance
    provides: Wave 0 lib/health source-scan tests (header, probe, leak-gate)
  - phase: 03-hyperdrive-data-access-wiring
    provides: asSystem on HYPERDRIVE_NOCACHE
  - phase: 07-checkout-payment
    provides: stripeFromEnv + hourly scheduled branch
provides:
  - GET /api/internal/health secret-header empty 404
  - probeHealth {ok, db, payments, maps} booleans
  - in-process hourly probeHealth from existing 0 * * * * cron
affects: [10-09]

tech-stack:
  added: []
  patterns:
    - SHA-256 then crypto.subtle.timingSafeEqual for X-Vamos-Health-Key
    - Missing/wrong health header is empty 404 never 401
    - Fail-closed probes: SELECT 1, Stripe balance.retrieve, Mapbox tokens/v2

key-files:
  created:
    - apps/web/lib/health/header.ts
    - apps/web/lib/health/probe.ts
    - apps/web/app/api/internal/health/route.ts
  modified:
    - apps/web/lib/env.d.ts
    - apps/web/worker.ts

key-decisions:
  - "Header compare hashes both sides SHA-256 then timingSafeEqual; never string equality"
  - "Hourly cron calls probeHealth in-process after expire/reminder; 0 3 * * * sweep unchanged"
  - "HEALTH_PROBE_SECRET is wrangler secret put only; Task 3 skipped this sitting — probes stay 404 until owner puts it"

patterns-established:
  - "Internal health: X-Vamos-Health-Key, empty 404 on miss/wrong, JSON booleans only"
  - "Watch in Cloudflare Workers logs (health_probe); no Sentry, no public /health"

requirements-completed: [LAUNCH-03]

duration: 7min
completed: 2026-09-12
---

# Phase 10 Plan 08: Secret-header health Summary

**GET /api/internal/health is empty 404 without X-Vamos-Health-Key; authorized body is {ok, db, payments, maps}; hourly cron probes in-process. HEALTH_PROBE_SECRET still owner-gated.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-12T15:28:36Z
- **Completed:** 2026-09-12T15:35:16Z
- **Tasks:** 2/3 (Task 3 owner-gated, skipped)
- **Files modified:** 5

## Accomplishments

- Timing-safe `X-Vamos-Health-Key` compare (SHA-256 then `timingSafeEqual`)
- `probeHealth` fail-closes per dep: Hyperdrive `select 1`, Stripe `balance.retrieve` (no charge), Mapbox `tokens/v2` (no geocode)
- `GET /api/internal/health` force-dynamic; missing/wrong header empty 404; other methods empty 404
- Existing hourly scheduled branch calls `probeHealth(env)` in-process (no HTTP loopback, no new cron)
- `/api/dev/db-smoke` still empty 404; no public `/health`; no Sentry; no `:6543`; no `HEALTH_PROBE_SECRET` in wrangler vars

## Task Commits

1. **Task 1: Health header compare + probes** - `fa0e71d` (feat)
2. **Task 2: GET /api/internal/health + hourly in-process probe** - `b7ba46a` (feat)
3. **Task 3: Owner puts HEALTH_PROBE_SECRET** - skipped this sitting (executor instruction). Secret still owner-gated. Health stays empty 404 for everyone until `wrangler secret put HEALTH_PROBE_SECRET --env staging`.

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/health/header.ts` - timing-safe header compare
- `apps/web/lib/health/probe.ts` - db / payments / maps booleans
- `apps/web/lib/env.d.ts` - optional `HEALTH_PROBE_SECRET` (secret put, never vars)
- `apps/web/app/api/internal/health/route.ts` - GET secret-header 404-shaped
- `apps/web/worker.ts` - hourly in-process `probeHealth`

## Decisions Made

- Probe on the hourly path (after expire/reminder, before Zurich digest early-return) so it runs every hour, not only at 06:00 Zurich
- `asSystem` + `HYPERDRIVE_NOCACHE` for `select 1`; SubtleCrypto `timingSafeEqual` via a Workers-typed cast because apps/web DOM lib lacks the method

## Deviations from Plan

None - plan executed as written for Tasks 1–2. Task 3 not run (owner-gated; skipped by executor instruction).

---

**Total deviations:** 0 auto-fixed
**Impact on plan:** Task 3 remaining — fail-closed 404 until owner puts the secret.

## Issues Encountered

None

## User Setup Required

**HEALTH_PROBE_SECRET still owner-gated.** Agent did not invent, print, or `wrangler secret put` a value. Owner terminal only, later sitting:

1. From `apps/web`: `wrangler secret put HEALTH_PROBE_SECRET --env staging`
2. Type a long random value. Do not paste into chat.
3. Optional later: same for production when that sitting exists.

Until then, every caller (including cron’s in-process probe still runs; the HTTP route 404s without the binding).

## Next Phase Readiness

- LAUNCH-03 code is in. Watching is Cloudflare observability (`health_probe` log lines).
- Secret sitting remains owner-gated. Do not deploy from this plan.
- Ready for next Phase 10 plan.

## Self-Check: PASSED

- `pnpm --filter web exec vitest run lib/health` — 3 files, 9 passed
- db-smoke route unchanged empty 404
- wrangler.jsonc has no `HEALTH_PROBE_SECRET` in vars
- crons still `0 * * * *` and `0 3 * * *`
- no public `/health`; no Sentry; no `:6543`; no new npm packages

---
*Phase: 10-hardening-performance-security-compliance*
*Completed: 2026-09-12*
