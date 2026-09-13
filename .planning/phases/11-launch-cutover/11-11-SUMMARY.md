---
phase: 11-launch-cutover
plan: 11
subsystem: database
tags: [supabase, public_chf, vat_rate_bps, D-09, D-18, D-22]

requires:
  - phase: 11-launch-cutover
    provides: 11-02 git SQL 20260913000001_launch_public_chf_vat.sql
provides:
  - Hosted yaumjzvylngfjhtuffqs public.settings.public_chf default false
  - Hosted vat_rate_bps default 81
  - quote_rate_book JSON public_chf + vat_rate_bps
affects: [11-12]

tech-stack:
  added: []
  patterns:
    - MCP apply_migration mints schema_migrations.version (not git filename)

key-files:
  created: []
  modified:
    - packages/db/database.types.ts

key-decisions:
  - "Owner said apply — MCP apply_migration on yaumjzvylngfjhtuffqs only"
  - "No restore, no supabase db push, no port 6543, no Publish this sitting"
  - "Did not overwrite database.types.ts — 11-02 already had both columns; hosted generate matches"

patterns-established:
  - "Hosted proof is execute_sql readback, not types:check"

requirements-completed: [LAUNCH-06]

duration: 15min
completed: 2026-09-13
---

# Phase 11 Plan 11: Owner apply launch SQL Summary

**Hosted Zurich has `public_chf=false` and `vat_rate_bps=81`. Public stays CHF 000 until 11-12 Publish.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-13T08:50:00Z
- **Completed:** 2026-09-13T09:05:00Z
- **Tasks:** 2
- **Files modified:** 0 product (types already from 11-02)

## Accomplishments

- MCP `apply_migration` name `launch_public_chf_vat` on `yaumjzvylngfjhtuffqs`
- Hosted stamp `20260913085615` / `launch_public_chf_vat` (MCP version ≠ git `20260913000001`)
- Columns: `public_chf boolean NOT NULL default false`, `vat_rate_bps integer NOT NULL default 81`, CHECK `vat_rate_bps >= 0`
- Row `settings.id=1`: `public_chf=false`, `vat_rate_bps=81`
- `quote_rate_book(false)` → `public_chf=false`, `vat_rate_bps=81`, live `rate_version.id=5`
- No SELECT on `public.settings` to anon/public/vamos_public
- EXECUTE on `quote_rate_book(boolean)` to anon + authenticated
- Isolated `tsc --strict` on `packages/db/database.types.ts` exit 0
- No restore. No `db push`. No Publish. Stripe still test.

## Task Commits

1. **Task 1+2: hosted apply + readback** — this SUMMARY (docs)

**Plan metadata:** (this commit)

## Files Created/Modified

- None in product. Types already listed both columns from 11-02. Hosted `generate_typescript_types` confirms `public_chf` and `vat_rate_bps` on settings Row/Insert/Update.

## Decisions Made

- Owner line “apply the migration” is the 11-11 resume. MCP apply, then SELECT readback.
- Do not rewrite `database.types.ts` from the 97KB dump.

## Deviations from Plan

- PLAN text said agent never `apply_migration`. vamos-gsd-execute + owner “apply” override: MCP apply on that project, then readback.
- `pnpm --filter @vamos/db run types:check` not run (needs local supabase gen / Docker). Isolated tsc on the types file instead.

## Issues Encountered

Worktree still has no `node_modules`. That is not a schema bug. Do not `pnpm install` or symlink `node_modules` in `.worktrees/phase-11`.

## User Setup Required

None for 11-11. 11-12 is owner Publish on OPS Pricing — not this sitting.

## Next Phase Readiness

11-12: owner says OPS Pricing is right, then Publish. Agent does not click Publish. Public amounts stay `CHF 000` until that click. Worker `vamos` still needs this branch deployed before Publish can flip live display.
