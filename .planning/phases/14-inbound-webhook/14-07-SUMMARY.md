---
phase: 14-inbound-webhook
plan: 07
subsystem: infra
tags: [wrangler, r2, SUPPORT_FILES, supabase, apply-gate]

requires:
  - phase: 14-inbound-webhook
    provides: support_message_files SQL in git + staff file GET
provides:
  - SUPPORT_FILES bound to vamos-support-staging on env.staging / env.ops-changes / env.front
  - env.production r2_buckets still PHOTOS-only
affects: [15, 16]

tech-stack:
  added: []
  patterns:
    - Non-production wrangler bind first; hosted apply and R2 create wait on owner "apply"

key-files:
  created: []
  modified:
    - apps/web/wrangler.jsonc

key-decisions:
  - "Task 2 is checkpoint:human-action. No MCP apply_migration, no wrangler r2 bucket create, no deploy until Koss says apply."
  - "Do not invent types regen until after apply."
  - "No MX. No vamostaxi.eu. No env.production SUPPORT_FILES."

patterns-established:
  - "SUPPORT_FILES lives next to PHOTOS on staging / ops-changes / front only"

requirements-completed: []

duration: 2min
completed: 2026-09-18
---

# Phase 14 Plan 07: owner apply SQL + staging R2 bind Summary

**Non-production wrangler binds SUPPORT_FILES → vamos-support-staging. Hosted SQL and R2 create are still owner-gated.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-09-17T22:54:31Z
- **Completed:** 2026-09-17T22:55:31Z
- **Tasks:** 1 of 2 (Task 2 waiting owner apply)
- **Files modified:** 1

## Accomplishments

- `env.front`, `env.staging`, and `env.ops-changes` each bind `SUPPORT_FILES` to `vamos-support-staging` next to existing `PHOTOS`.
- `env.production` r2_buckets remains `PHOTOS` / `vamos-photos-production` only.
- Did not deploy. Did not create the R2 bucket. Did not apply `support_message_files` on `yaumjzvylngfjhtuffqs`. Did not regenerate `packages/db/database.types.ts`. Did not touch MX or `vamostaxi.eu`.

## Task Commits

1. **Task 1: bind SUPPORT_FILES on non-production wrangler** - `636e570` (feat)
2. **Task 2: owner apply SQL + R2 bucket create** - not started (checkpoint:human-action)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/wrangler.jsonc` — SUPPORT_FILES on staging / ops-changes / front

## Decisions Made

Stop at the apply gate. `approve` is not apply. Types regen waits until after hosted readback.

## Deviations from Plan

None - plan executed exactly as written for Task 1. Task 2 is the planned owner stop.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

None

## User Setup Required

Owner must say **apply** (or **you apply**) then:

1. MCP `apply_migration` for `support_message_files` on `yaumjzvylngfjhtuffqs` (never `supabase db push`).
2. After apply: `execute_sql` readback + `generate_typescript_types`.
3. `wrangler whoami` must be `koussayzayeni@gmail.com` / account `e64b47deef83692806ab23279d53633e`, then `wrangler r2 bucket create vamos-support-staging` if missing.
4. Do not `wrangler deploy` unless he says continue after bind.

## Next Phase Readiness

Bind is in git. Staging ingest cannot store files until apply + bucket exist. Phase 16 still owns MX.

## Self-Check: PASSED

- `rg SUPPORT_FILES` hits wrangler.jsonc lines 53, 129, 242 and env.d.ts
- production r2_buckets has no SUPPORT_FILES
- SQL file still in git: `packages/db/supabase/migrations/20260918020000_support_message_files.sql`
- feat commit `636e570` present
- No apply, no R2 create, no deploy this sitting

---
*Phase: 14-inbound-webhook*
*Completed: 2026-09-18*
