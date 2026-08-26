---
phase: 02-data-schema-rls-staff-auth-foundations
plan: 04
subsystem: database
tags: [postgres, pgtap, supabase, pricing, i18n, triggers]

# Dependency graph
requires:
  - phase: 02-03
    provides: vehicle_classes (FK target for distance_rates/fixed_routes), settings_versions night_window_start/end/tz columns, app.uid()
provides:
  - "rate_versions with the D-09 one-live partial unique index and the draft->live/live->retired transition trigger"
  - "F-04 fix: tg_rate_version_insert_draft forces every INSERT to be born draft with nulled attribution"
  - "F-12 fix: tg_pricing_row_frozen fires on INSERT as well as UPDATE/DELETE, closing the insert-straight-into-live bypass"
  - "service_zones, distance_rates, fixed_routes, surcharges — every priced column nullable (D-34)"
  - "coupons (D-29: coupon_redemptions deliberately deferred to ...15, after booking_payments)"
  - "rate_version_publish.test.sql (16 assertions) and pricing_frozen.test.sql (12 assertions) proving QUOTE-10 and QUOTE-05"
  - "price.line.* and price.surcharge.<code>.{label,rule} i18n keys in en/de/fr/ar (D-08, D-35)"
affects: [02-05 (bookings/price_snapshots will FK these rows as source_row), 02-08 (RLS: rate_versions_admin_write policy), phase-04-quote-pricing-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Partial unique index ((true)) where status = 'live' for a single-row-exclusivity invariant, instead of a boolean flag"
    - "Paired BEFORE UPDATE + BEFORE INSERT triggers on the same guarded table, so a state machine enforced on transitions cannot be bypassed by INSERT"
    - "One shared trigger function attached to BEFORE UPDATE OR DELETE and BEFORE INSERT on three sibling tables, with a column-diff carve-out (to_jsonb(old) - excluded_columns) for the one mutable field each table has"

key-files:
  created:
    - packages/db/supabase/migrations/20260823000008_rate_versions.sql
    - packages/db/supabase/migrations/20260823000009_coupons.sql
    - packages/db/supabase/tests/rate_version_publish.test.sql
    - packages/db/supabase/tests/pricing_frozen.test.sql
  modified:
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json

key-decisions:
  - "A trigger function declaring set search_path = '' must schema-qualify every type it uses, not just every table/function — tg_pricing_row_frozen's `declare v_status rate_version_status` failed with 42704 (type does not exist) until qualified as public.rate_version_status; the enum lives in public via the unqualified CREATE TYPE in migration 03, so with an empty search_path nothing resolves it unqualified"
  - "tg_pricing_row_frozen's availability-flag carve-out (schema draft) excluded only 'live' and 'available' from the immutability diff, never 'active' — so surcharges.active, the flag this plan's own task text and pricing_frozen.test.sql both require to stay toggleable on a published version, was wrongly frozen. Fixed by excluding all three flag names in the shared function; harmless no-op on the two tables that lack a given column"
  - "Every function this plan creates (tg_rate_version_transition, tg_rate_version_insert_draft, tg_pricing_row_frozen) carries its own `revoke all on function ... from public`, per the Wave 3 binding note that ALTER DEFAULT PRIVILEGES does not apply at CREATE FUNCTION time on this Postgres image. This makes the plan's own acceptance-criteria grep count for `tg_rate_version_insert_draft` occurrences read 3 (function + trigger + revoke) instead of the plan text's stated 2 (function + trigger) — the revoke is mandatory for the extensions.test.sql catalog-wide F-13 sweep to keep passing and is explicitly required by this dispatch's own success criteria, which take precedence over the specific grep count"
  - "The rate_versions_one_live index is written as a single line (matching the plan's own <interfaces> contract) rather than the schema draft's two-line form, so grep for the index name and its where-clause resolve on the same match"

# Metrics
duration: ~6min (task-commit span; total session including context reading was longer)
completed: 2026-08-24
---

# Phase 2 Plan 4: Versioned pricing batches, publish gate, coupons, price i18n keys Summary

**rate_versions with a partial-unique-index one-live gate and paired INSERT/UPDATE triggers closing both the F-04 born-live bypass and the F-12 insert-into-live bypass, proven by 28 new pgTAP assertions; coupons and four-language price/surcharge i18n keys land alongside, every priced column staying nullable end to end.**

## Performance

- **Duration:** ~6 min (span between the three task commits)
- **Completed:** 2026-08-24T03:42:22+04:00
- **Tasks:** 3 (all `type="auto"`)
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- `rate_versions` carries the `rate_versions_one_live` partial unique index (D-09 — pricing_live
  is not a boolean anywhere in this schema) plus two triggers: `tg_rate_version_transition`
  (BEFORE UPDATE — legal transitions only, completeness gate, attribution stamp) and
  `tg_rate_version_insert_draft` (BEFORE INSERT, F-04 — forces every insert to be born `draft`
  with nulled `published_at`/`published_by`, closing the bypass where a single INSERT could make
  `pricing_live` true with attacker-supplied attribution and zero completeness checking).
- `service_zones`, `distance_rates`, `fixed_routes`, `surcharges` all land with every priced
  column (`*_rappen`, `percent`) nullable and no CHF literal anywhere in the migration (D-34).
  `tg_pricing_row_frozen` now fires on BEFORE INSERT as well as BEFORE UPDATE OR DELETE (F-12),
  closing the bypass where a priced row could be inserted straight into a live version, out of
  band from any version transition.
- `coupons` lands with the D-29 header note that `coupon_redemptions` is deliberately deferred to
  `...15_coupon_redemptions.sql`, after `booking_payments` exists to FK against — consumption
  happens at payment, never at quote.
- `rate_version_publish.test.sql` (16 assertions) proves the completeness gate, the one-live
  index (`23505`), the full legal-transition set (draft→live, live→retired, and the four illegal
  transitions), the F-04 born-live INSERT rejection, and the F-12 insert-into-live rejection on
  all three pricing tables.
- `pricing_frozen.test.sql` (12 assertions) proves the freeze trigger on both UPDATE/DELETE and
  INSERT, with the availability-flag carve-out (`available` / `live` / `active`) proven allowed
  on a live version and every one of the same statements proven allowed on a draft control.
- `price.line.*` and `price.surcharge.<code>.{label,rule}` land in all four locale files as a
  nested `price` namespace (D-08 — snapshot lines cite an i18n key, never stored English prose),
  with every digit that would render (window times, waiting minutes) as an ICU parameter so the
  D-35 night window (`20:00`–`06:00` Europe/Zurich) renders from the snapshot instead of being
  frozen into copy. `pnpm i18n:check` passes at 1508 keys / 74 call sites / 0 problems.
- `pnpm db:reset && pnpm db:test` is green: `Files=6, Tests=138, Result: PASS` (110 pre-existing +
  16 + 12 new). `select count(*) from rate_versions where status='live'` returns `0` — nothing
  seeded, nothing live, matching D-34/D-09.

## Task Commits

1. **Task 1: Migration 08 — rate_versions, zones, rates, routes, surcharges, freeze + transition
   triggers** - `9ea3b46` (feat)
2. **Task 2: Migration 09 (coupons) + rate_version_publish.test.sql + pricing_frozen.test.sql** -
   `42304db` (feat) — also carries the Task-1 file fix for the `active` carve-out gap found while
   writing this task's test
3. **Task 3: Price-line and surcharge i18n keys in all four locale files** - `501bb9d` (feat)

## Files Created/Modified

- `packages/db/supabase/migrations/20260823000008_rate_versions.sql` - rate_versions, service_zones, distance_rates, fixed_routes, surcharges, the one-live index, the transition/insert-draft/freeze triggers
- `packages/db/supabase/migrations/20260823000009_coupons.sql` - coupons table, D-29 deferral note
- `packages/db/supabase/tests/rate_version_publish.test.sql` - QUOTE-10 publish-gate proof, F-04 and F-12 bypass cases
- `packages/db/supabase/tests/pricing_frozen.test.sql` - QUOTE-05 freeze-trigger proof, live vs draft, availability carve-out
- `apps/web/i18n/messages/{en,de,fr,ar}.json` - `price.line.*` / `price.surcharge.<code>.{label,rule}` namespace, 21 keys per locale

## Decisions Made

See `key-decisions` in frontmatter — summarized: (1) an empty-search_path trigger function must
schema-qualify enum types, not just tables; (2) the schema draft's carve-out list was missing
`active`, fixed in the shared trigger function; (3) the mandatory per-function `revoke ... from
public` inflates one plan-specified grep count by one occurrence, which is expected and
documented rather than worked around; (4) the one-live index is written on one line to match the
plan's own `<interfaces>` contract rather than the schema draft's two-line form.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Unqualified enum type name inside a `search_path = ''` trigger function**
- **Found during:** Task 1, first `pnpm db:reset` after adding `tg_pricing_row_frozen`
- **Issue:** `declare v_status rate_version_status;` failed with `42704: type "rate_version_status" does not exist` — the enum is created unqualified in migration 03 (lives in `public`), and with an empty `search_path` nothing resolves an unqualified type name, exactly as it would for an unqualified table or function name.
- **Fix:** Qualified the declaration as `v_status public.rate_version_status`.
- **Files modified:** `packages/db/supabase/migrations/20260823000008_rate_versions.sql`
- **Verification:** `pnpm db:reset` exits 0.
- **Committed in:** `9ea3b46` (Task 1 commit)

**2. [Rule 1 - Bug] `tg_pricing_row_frozen`'s availability carve-out excluded only `live`/`available`, never `active`**
- **Found during:** Task 2, first run of `pricing_frozen.test.sql` (`update surcharges set active = false` on a live version, which the plan's own task text and this file both specify must succeed)
- **Issue:** The schema draft's column-diff comparison (`to_jsonb(old) - 'live' - 'available'`) never subtracted `'active'`, so `surcharges.active` — the exact carve-out flag the plan's Task 1 action text names ("`active` on surcharges" is one of the three listed carve-out flags) — was wrongly frozen once a rate_version left draft.
- **Fix:** Added `- 'active'` to both `v_old`/`v_new` computations in `tg_pricing_row_frozen`. Harmless no-op on `distance_rates`/`fixed_routes`, which don't have that column.
- **Files modified:** `packages/db/supabase/migrations/20260823000008_rate_versions.sql`
- **Verification:** `pnpm db:test` — `pricing_frozen.test.sql` all 12 assertions pass.
- **Committed in:** `42304db` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 — an environment-specific `search_path=''` qualification gap that blocked `db reset`; 1 Rule 1 — a real gap in the schema draft's carve-out logic that this plan's own test suite exists to catch).
**Impact on plan:** No scope change. Both fixes were required for the acceptance-criteria SQL to run and for the plan's own stated pgTAP behaviour to hold; neither touches anything outside the two functions this plan authors.

## Issues Encountered

- The plan's Task 1 acceptance criterion `grep -c "tg_rate_version_insert_draft" ...08` expecting
  `2` reads `3` once the mandatory `revoke all on function public.tg_rate_version_insert_draft()
  from public;` is added — every named revoke necessarily repeats the function name it revokes.
  Kept the revoke (required by this dispatch's own success criteria and by `extensions.test.sql`'s
  catalog-wide F-13 sweep, which would otherwise fail) rather than the literal grep count;
  documented here rather than silently diverging.
- `git diff apps/web/i18n/messages/en.json | grep -c '"\$meta"'` reads `1`, not the acceptance
  criterion's `0`, because the new `price` block is inserted immediately before the `"$meta"` key
  and git's default 3-line diff context pulls that unchanged line into the hunk as context. With
  zero-context diff (`git diff -U0`) the count is `0` — nothing under `$meta` actually changed;
  confirmed by inspection.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 02-05 (`price_snapshots`) can now FK `rate_versions`/`distance_rates`/`fixed_routes`/
  `surcharges` rows as `source_row` with confidence those rows cannot mutate under a live version.
- Plan 02-08 (RLS) has its `rate_versions_admin_write` policy target ready — the trigger enforces
  the state machine regardless of caller identity in the meantime (T-02-14 disposition: mitigate,
  this plan's half done; the RLS half is 02-08's).
- Phase 4 (quote/pricing engine) has its `price.line.*` / `price.surcharge.<code>.*` i18n keys
  ready to reference from computed price-snapshot lines with no hand-typed SQL needed later —
  Plan 02-09's seed generator will carry the same keys into `content_strings`.
- No blockers. The owner's CHF matrix remains open (D-34); every priced column stays NULL and no
  `rate_versions` row is live, exactly as required before launch.

---
*Phase: 02-data-schema-rls-staff-auth-foundations*
*Completed: 2026-08-24*

## Self-Check: PASSED

All 8 created/modified files confirmed present on disk; all 3 task commit hashes (`9ea3b46`,
`42304db`, `501bb9d`) confirmed in `git log`.
