---
phase: 11-launch-cutover
plan: 02
subsystem: database
tags: [postgres, supabase, public_chf, vat_rate_bps, quote_rate_book]

# Dependency graph
requires:
  - phase: 11-launch-cutover
    provides: Wave 0 public_chf AND derivePricingLive contract tests
provides:
  - public.settings.public_chf boolean not null default false
  - public.settings.vat_rate_bps integer not null default 81 check >= 0
  - quote_rate_book JSON keys public_chf + vat_rate_bps from settings id=1
affects: [11-03, 11-07, 11-08, 11-11, 11-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - asQuote + SECURITY DEFINER quote_rate_book JSON for quote-flag reads (never raw public.settings)

key-files:
  created:
    - packages/db/supabase/migrations/20260913000001_launch_public_chf_vat.sql
  modified:
    - packages/db/database.types.ts

key-decisions:
  - "RPC chosen: extend public.quote_rate_book (not a sibling RPC). Existing asQuote + definer path."
  - "public_chf default false; vat_rate_bps default 81 from CH_VAT_RATE_BPS, not 7.7"
  - "Hosted apply is owner-gated (11-11). This plan writes the SQL file + local types only."
  - "Local types additive-edited because local supabase is down; types:check not faked green"

patterns-established:
  - "Launch flags live on settings singleton id=1 and ride quote_rate_book JSON; not settings_public, not rate_versions.pricing_live"

requirements-completed: [LAUNCH-06]

# Metrics
duration: 3min
completed: 2026-09-13
---

# Phase 11 Plan 02: Launch public_chf + vat_rate_bps Summary

**SQL contract for D-18/D-22: settings.public_chf default false and vat_rate_bps default 81, readable by quote identity via extended quote_rate_book JSON — hosted apply waits on 11-11**

## Performance

- **Duration:** 3 min
- **Started:** 2026-09-12T23:07:50Z
- **Completed:** 2026-09-12T23:10:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added additive migration `20260913000001_launch_public_chf_vat.sql` with `public_chf` (default false) and `vat_rate_bps` (default 81, check >= 0)
- Extended `public.quote_rate_book` (SECURITY DEFINER, empty search_path) so both empty-book and live-book JSON include the two flags from `public.settings` id=1
- Granted EXECUTE to anon + authenticated; revoked from public. No SELECT on `public.settings`. No `settings_public` change. No `pricing_live` on `rate_versions`
- Additive-edited local `database.types.ts` settings Row/Insert/Update. Hosted Zurich untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Write launch public_chf + vat_rate_bps migration** - `38252e0` (feat)
2. **Task 2: Local types for public_chf + vat_rate_bps** - `e5a81f7` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/db/supabase/migrations/20260913000001_launch_public_chf_vat.sql` - columns + quote_rate_book replace; header says hosted apply is owner-gated (11-11)
- `packages/db/database.types.ts` - settings.public_chf boolean, settings.vat_rate_bps number (Insert/Update optional)

## Decisions Made

- **RPC chosen: `public.quote_rate_book`.** Extended the latest body from `20260906000001_distance_bands.sql` with `public_chf` and `vat_rate_bps`. Did not add a sibling definer RPC. Quote identity already calls this via `asQuote`; `Returns: Json` so Functions types needed no change.
- Flags are independent of `rate_versions.status` (D-23): both JSON return paths include the keys even when `rate_version` is null.
- `vat_rate_bps` default 81 is existing `CH_VAT_RATE_BPS`, not 7.7.

## Deviations from Plan

### Auto-fixed Issues

None.

### Planned verification skipped (local supabase down)

**1. [Rule 3 - Blocking] types:check / db:reset cannot run**

- **Found during:** Task 2 (Local reset + regenerate database.types.ts)
- **Issue:** Plan says `pnpm db:reset` then `pnpm --filter @vamos/db run types` and `types:check`. Local supabase is DOWN. Executors must not start Docker / `supabase start` / `pnpm db:start` / `pnpm install`.
- **Fix:** Additive-edit `packages/db/database.types.ts` settings Row + Insert + Update only (`public_chf`, `vat_rate_bps`). Do not fake a green types:check.
- **Files modified:** `packages/db/database.types.ts`
- **Verification:** `rg public_chf vat_rate_bps packages/db/database.types.ts` shows both fields on Row (required) and Insert/Update (optional). SQL file exists. `types:check` (`supabase gen types --local | diff`) was not run.
- **Committed in:** `e5a81f7` (Task 2)

---

**Total deviations:** 1 documented skip (local types gen). No hosted apply.
**Impact on plan:** SQL contract is in git. Local types match the new columns. Hosted apply still 11-11. D-23 preserved.

## Issues Encountered

None beyond the documented local-supabase skip.

## User Setup Required

None - no external service configuration required. Hosted apply of this SQL is 11-11 (owner-gated).

## Next Phase Readiness

- Ready for 11-03 Worker wiring that reads `quote_rate_book` JSON `public_chf` / `vat_rate_bps`
- Do not apply this migration on `yaumjzvylngfjhtuffqs` until 11-11
- `public_chf` stays false until 11-12 Publish-as-flip

## Self-Check: PASSED

- FOUND: `packages/db/supabase/migrations/20260913000001_launch_public_chf_vat.sql`
- FOUND: `packages/db/database.types.ts` contains `public_chf` and `vat_rate_bps`
- FOUND: `38252e0` feat(11-02) migration
- FOUND: `e5a81f7` feat(11-02) types
- PASS: SQL has public_chf, vat_rate_bps, default 81, check >= 0
- PASS: no GRANT SELECT on public.settings to anon/vamos_public
- PASS: no pricing_live column on rate_versions
- PASS: quote_rate_book retains distance_bands + region_premiums
- PASS: no MCP apply / db push in this plan's git log

---
*Phase: 11-launch-cutover*
*Completed: 2026-09-13*
