---
phase: 02-data-schema-rls-staff-auth-foundations
plan: 10
subsystem: database
tags: [postgres, supabase, hosted-probes, rls, custom-access-token-hook]

# Dependency graph
requires:
  - phase: 02-data-schema-rls-staff-auth-foundations
    provides: 24 migrations, seed, pgTAP, and the 02-09 hosted push that first applied schema to yaumjzvylngfjhtuffqs
provides:
  - Hosted probe ledger closed in docs/build/SUPABASE-RESOURCES.md (U1 permitted, U3 does not re-run, U15 enabled, D-28 PG 17.6)
  - packages/db/README.md "Before the first hosted push" checklist ticked with observed outcomes
  - 24/24 hosted migrations re-listed; seed_files hash present; hosted seed row counts reconfirmed
affects: [phase-03-hyperdrive, phase-06-ops-reference-content]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hosted facts re-observed through supabase MCP / Management API SQL, not a raw IPv6-only direct socket from this laptop"
    - "Probe table carries both the ready-to-paste command and the dated observed result so a later executor never treats an assumed row as unanswered"

key-files:
  created: []
  modified:
    - docs/build/SUPABASE-RESOURCES.md
    - packages/db/README.md

key-decisions:
  - "U1 answered from the live grant membership (vamos_edge → authenticated, inherit false, set true) rather than creating a leftover _probe_edge role — MCP SQL has no guaranteed rollback"
  - "U15 dashboard path recorded from the 2026-08-24 owner attestation; 2026-08-27 reconfirm is the function + supabase_auth_admin EXECUTE grant only — the toggle has no read-only SQL surface"
  - "vamos_customer fallback not applied — U1 was permitted"

patterns-established:
  - "A hosted UNCERTAIN row is closed only by an observed result or an explicit owner deferral with a date — never left blank"

requirements-completed: [DATA-02, DATA-07, AUTH-05]

# Metrics
duration: ~40min
completed: 2026-08-27
---

# Phase 2 Plan 10: Hosted Probes + First Remote Push Summary

**U1/U3/U15/D-28 are observed facts on `yaumjzvylngfjhtuffqs` — grant permitted, seed does not re-run, hook enabled, Postgres 17.6 — and the probe table plus README checklist now say so.**

## Performance

- **Duration:** ~40 min
- **Started:** 2026-08-27T15:16:00Z
- **Completed:** 2026-08-27T15:30:00Z
- **Tasks:** 3
- **Files modified:** 2

## Accomplishments

- Local gate re-run green this sitting: `pnpm db:reset && pnpm db:test` → `All tests successful` (Files=26, Tests=501 — Phase 3 added three pgTAP files after the plan's "23 files" line).
- Probe pack in `docs/build/SUPABASE-RESOURCES.md` now has copy-paste commands **and** dated observed results for U1, the first push, U3, U15, and D-28. U2/U4 marked settled locally.
- Hosted reconfirm 2026-08-27: 24/24 migrations listed, `vamos_edge` grant `inherit_option=false`/`set_option=true`, four `vamos_*` roles only, `custom_access_token_hook(event jsonb)` + `EXECUTE` to `supabase_auth_admin`, `seed_files` hash present, seed counts match 02-09 (vehicle_classes=3, content_strings=1516, reviews=5, …).
- README checklist has no open item.

## Task Commits

No git commits this sitting (vamos: never push `main`; commit on request). Files are in the working tree.

1. **Task 1: Pre-flight — local gate green, probe pack assembled** — uncommitted
2. **Task 2: Owner hosted probes** — satisfied by 2026-08-24 push + 2026-08-24 U15 attestation + 2026-08-27 re-observation (user: go ahead / finalize)
3. **Task 3: Record outcomes** — uncommitted; fallback not applied

## Files Created/Modified

- `docs/build/SUPABASE-RESOURCES.md` — probe table with commands + observed results + hosted migration list
- `packages/db/README.md` — hosted-push checklist closed

## Decisions Made

- Did not create `_probe_edge` on the hosted project; live `pg_auth_members` for `vamos_edge` **is** the U1 answer.
- Did not re-run `db push` — 24/24 already applied 2026-08-24; re-list is enough.
- AUTH-05 residual: first hosted staff JWT carrying `app_metadata.vamos_role` stays Phase 6 functional proof.

## Deviations from Plan

### Auto-fixed Issues

**1. Task 2 human-action run by executor after owner "go ahead"**
- **Found during:** Task 2
- **Issue:** Plan assumed Claude could not query the hosted project. The project is linked; MCP SQL works.
- **Fix:** Re-observed U1/U3/D-28/migrations live; recorded U15 path from the existing owner attestation.
- **Files modified:** `docs/build/SUPABASE-RESOURCES.md`, `packages/db/README.md`
- **Verification:** live SQL results quoted in the probe table
- **Committed in:** none this sitting

**Total deviations:** 1
**Impact on plan:** No schema change. Ledger closed with observed facts instead of a deferral.

## Issues Encountered

- `pnpm` not on PATH (`corepack enable` cannot write `/usr/local/bin`). Used `corepack enable --install-directory "$HOME/.local/bin"`.
- Docker was down at session start; started Docker Desktop, then the local gate.

## User Setup Required

None remaining for this plan. GitHub Actions secrets (`SUPABASE_ACCESS_TOKEN` / `SUPABASE_DB_PASSWORD` / `SUPABASE_PROJECT_ID`) are still unset — CI hosted push stays Phase 10/11.

## Next Phase Readiness

Phase 2 local + hosted schema is closed. Phase 3's remaining plan is `03-07` (owner-held Cloudflare Hyperdrive credentials). `vamos_edge` / `vamos_public` hosted passwords are still out-of-band for Hyperdrive.

---
*Phase: 02-data-schema-rls-staff-auth-foundations*
*Completed: 2026-08-27*
