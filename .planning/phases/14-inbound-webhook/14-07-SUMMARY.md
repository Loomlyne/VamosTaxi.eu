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
  - hosted public.support_message_files on yaumjzvylngfjhtuffqs
  - R2 bucket vamos-support-staging (EEUR)
affects: [15, 16]

tech-stack:
  added: []
  patterns:
    - Non-production wrangler bind first; hosted apply and R2 create after owner apply

key-files:
  created: []
  modified:
    - apps/web/wrangler.jsonc
    - packages/db/database.types.ts

key-decisions:
  - "Koss said apply 2026-09-18. MCP apply_migration name support_message_files (hosted version 20260918072323, not the git filename)."
  - "No supabase db push. No wrangler deploy. No MX. No vamostaxi.eu. No env.production SUPPORT_FILES."

patterns-established:
  - "SUPPORT_FILES lives next to PHOTOS on staging / ops-changes / front only"

requirements-completed: [INB-02]

duration: 12min
completed: 2026-09-18
---

# Phase 14 Plan 07: owner apply SQL + staging R2 bind Summary

**Non-production wrangler binds SUPPORT_FILES → vamos-support-staging. Hosted `support_message_files` applied. Staging R2 bucket exists. No deploy. No MX.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-17T22:54:31Z
- **Completed:** 2026-09-18T07:26:00Z
- **Tasks:** 2 of 2
- **Files modified:** 2

## Accomplishments

- `env.front`, `env.staging`, and `env.ops-changes` each bind `SUPPORT_FILES` to `vamos-support-staging` next to existing `PHOTOS`.
- `env.production` r2_buckets remains `PHOTOS` / `vamos-photos-production` only.
- MCP `apply_migration` `support_message_files` on `yaumjzvylngfjhtuffqs` after owner **apply**. Hosted stamp `20260918072323`.
- Readback: `to_regclass` = `support_message_files`; RLS enable + FORCE; columns id/message_id/filename/content_type/byte_size/r2_key/kept/created_at; CHECKs filename 1–255, byte_size >= 0, kept↔r2_key; staff SELECT only (no anon/authenticated); policy `support_message_files_staff_select`; rfc_message_id index on `support_messages`.
- `generate_typescript_types` written to `packages/db/database.types.ts` (`support_message_files` Row present).
- `wrangler whoami` = `koussayzayeni@gmail.com` / `e64b47deef83692806ab23279d53633e`. Created R2 `vamos-support-staging` (EEUR, empty). Did not deploy. Did not touch MX or `vamostaxi.eu`.

## Task Commits

1. **Task 1: bind SUPPORT_FILES on non-production wrangler** - `636e570` (feat)
2. **Task 2: owner apply SQL + R2 bucket create** - types commit this sitting

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/wrangler.jsonc` — SUPPORT_FILES on staging / ops-changes / front
- `packages/db/database.types.ts` — hosted types after apply

## Decisions Made

Owner said **apply**. Agent applied via MCP (not `supabase db push`). Did not deploy (plan: this plan should not deploy).

## Deviations from Plan

None.

**Total deviations:** 0
**Impact on plan:** None.

## Issues Encountered

None.

## User Setup Required

None for 14-07. Worker still needs a later deploy (owner **continue** after bind) before live ingest can PUT objects. Phase 16 still owns MX.

## Next Phase Readiness

Schema + staging bucket exist. Bind is in git. Do not start Phase 15 from this tree. Do not change MX.

## Self-Check: PASSED

- `rg SUPPORT_FILES` hits wrangler.jsonc lines 53, 129, 242 and env.d.ts
- production r2_buckets has no SUPPORT_FILES
- hosted `list_migrations` name `support_message_files` version `20260918072323`
- `wrangler r2 bucket list` includes `vamos-support-staging`
- types file contains `support_message_files`
- No deploy, no MX, no `.eu` this sitting

---
*Phase: 14-inbound-webhook*
*Completed: 2026-09-18*
