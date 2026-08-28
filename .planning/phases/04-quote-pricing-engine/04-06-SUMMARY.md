---
phase: 04-quote-pricing-engine
plan: 06
subsystem: database
tags: [postgres, pgtap, security-definer, quote-read, coupons, quote-03, quote-06, quote-10]

# Dependency graph
requires:
  - phase: 02-data-schema-rls-staff-auth-foundations
    provides: >-
      anon SELECT on four content tables + settings_public only; coupons,
      coupon_redemptions, tg_coupon_redemption_caps FOR UPDATE, settings_versions
      quote_lock_minutes
  - phase: 04-quote-pricing-engine (plan 04-04)
    provides: surcharges.predicate/quantity_source, service_zones.zone_type/tags, ten seeded surcharges
  - phase: 04-quote-pricing-engine (plan 04-05)
    provides: charge-gate definer, rate_version_is_live was-published, service_area_geojson
provides:
  - quote_rate_book / quote_settings_version / quote_lock_deadline SECURITY DEFINER RPCs (D-34)
  - coupon_redemptions.released_at / released_reason (D-31)
  - evaluate_coupon() seven-rule i18n ladder (D-30)
  - release-aware tg_coupon_redemption_caps counts
affects: [04-09, 04-10, 04-15, quote engine, checkout coupon path]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pricing grant surface is three definer RPCs; tables stay revoked from anon (settings_public analogue)"
    - "quote_lock_deadline is VOLATILE (clock); the two book/settings readers are STABLE"
    - "create or replace re-revokes PUBLIC EXECUTE; function_privs_are + prosecdef catalog assert"
    - "evaluate_coupon returns percent as text so numeric(5,2) survives JSON"

key-files:
  created:
    - packages/db/supabase/migrations/20260825000005_quote_read_rpc.sql
    - packages/db/supabase/migrations/20260825000006_coupon_release.sql
    - packages/db/supabase/tests/quote_read_rpc.test.sql
    - packages/db/supabase/tests/coupon_evaluate.test.sql
  modified:
    - packages/db/supabase/tests/reference_tables.test.sql
    - packages/db/database.types.ts
    - packages/db/README.md

key-decisions:
  - "No table grant on the pricing schema — D-34's asQuote/definer-RPC door, not 04-RESEARCH.md §1's implied direct select"
  - "No second booking_payments_reserve_coupon trigger — Phase 2's coupon_redemptions_caps is the consumption gate; Phase 7 application-orders payment insert before redemption"
  - "No abandon-release sweep (D-55) — released_at ships; checkout_abandon_release_minutes does not exist"

patterns-established:
  - "Every array inside quote_rate_book is ORDER BY'd (threat T5); to_jsonb(row) never casts numeric to float"
  - "D-50 role-switch: temporary GRANT INSERT + permissive policy so the gate is reachable under authenticated and vamos_guest"

requirements-completed: [QUOTE-03, QUOTE-06, QUOTE-10]

# Metrics
duration: 13min
completed: 2026-08-28
---

# Phase 4 Plan 06: Quote Read RPC + Coupon Release Summary

**Three SECURITY DEFINER RPCs are the anonymous quote identity's only pricing grant surface; `evaluate_coupon()` speaks seven i18n refusals; `released_at` stops a use counting without deleting the evidence.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-08-28T12:35:35Z
- **Completed:** 2026-08-28T12:48:40Z
- **Tasks:** 3/3
- **Files modified:** 7

## Accomplishments

- `quote_rate_book` / `quote_settings_version` / `quote_lock_deadline` granted EXECUTE to `anon, authenticated` only; PUBLIC revoked; no SELECT/INSERT/UPDATE/DELETE table grant. Under `set local role anon`, `select count(*) from public.rate_versions` is `42501` and `select public.quote_rate_book()` lives.
- Launch state (QUOTE-10): `quote_rate_book()` returns `rate_version: null`; `quote_rate_book(true)` returns `seed-placeholder` labelled `draft`. `quote_lock_deadline` raises `restrict_violation` on a null `quote_lock_minutes` rather than inventing 30.
- `evaluate_coupon` implements the seven ordered refusals as `quote.coupon.error.*` keys; lookup is `upper(p_code)`; returned `code` is stored casing; `percent` is `numeric::text`. A released redemption stops counting (D-31). D-50: unchargeable `booking_payments` insert raises `23001` under `authenticated` and `vamos_guest` with zero `coupon_redemptions` side effect.

## Task Commits

Each task was committed atomically:

1. **Task 1: The anonymous read door — three definer RPCs** - `e089c3e` (feat)
2. **Task 2: The coupon ladder and the release column** - `50a2b79` (feat)
3. **Task 3: pgTAP proofs, then [BLOCKING] apply from zero** - `349da68` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/db/supabase/migrations/20260825000005_quote_read_rpc.sql` - three definer read RPCs
- `packages/db/supabase/migrations/20260825000006_coupon_release.sql` - `released_at`/`released_reason`, release-aware caps, `evaluate_coupon`
- `packages/db/supabase/tests/quote_read_rpc.test.sql` - 22 assertions (privs, 42501, launch/draft book, lock clock)
- `packages/db/supabase/tests/coupon_evaluate.test.sql` - 16 assertions (seven-rule ladder, D-31, D-50)
- `packages/db/supabase/tests/reference_tables.test.sql` - `plan(40)` + `released_at`/`released_reason`/`evaluate_coupon`
- `packages/db/database.types.ts` - regenerated (`released_at`, four new Functions entries)
- `packages/db/README.md` - ordinals 05 and 06 marked landed

## Decisions Made

- Followed the plan's correction: no `booking_payments_reserve_coupon` trigger. Ordering is an application requirement on Phase 7, asserted here by the D-50 pgTAP case.
- `quote_lock_deadline` marked `volatile` (reads `now()`); the two readers marked `stable`. Header comments avoid the literal substrings `security definer` / `search_path = ''` so Task 1's count greps stay exact.

## Deviations from Plan

None - plan executed exactly as written, with one inherited verification miss recorded below (not an auto-fix).

**Total deviations:** 0 auto-fixed.
**Impact on plan:** None.

## Issues Encountered

- `pnpm db:seed:check` exits 1 on this worktree: committed `seed.sql` has `content_strings=1516`; the generator (after 04-08 i18n) would emit `1584`. Drift is inherited from `gsd/04-08-schema-errors` (`b19eb21` landed the strings; seed was not regenerated). Out of this plan's `files_modified`. Regenerating would fail Task 3's "no file outside files_modified" gate. `pnpm db:reset` still seeds the committed file and `pnpm db:test` is green (586 assertions / 31 files).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 04-09 (engine wiring against `quote_rate_book` / `quote_settings_version` / `quote_lock_deadline`) and 04-10 / 04-15 (snapshot write door still deferred).
- `asQuote` still resolves to `anon`; Phase 4's remaining write RPC is plan 04-15.
- Abandon-release sweep still deferred (D-55 / U42).

## Verification log

```
pnpm db:reset          exit 0  (30 migrations from zero, including 05 and 06)
pnpm db:test           exit 0  (Files=31, Tests=586, including quote_identity.test.sql)
pnpm db:seed:check     exit 1  (inherited 04-08 content_strings drift; see Issues)
pnpm db:types:check    exit 0
```

Single-file: `pnpm --filter @vamos/db run test:db supabase/tests/quote_read_rpc.test.sql` exit 0 (22).
`coupon_evaluate.test.sql` exit 0 (16).

## Self-Check: PASSED

- Key files exist on disk.
- `git log --oneline --all --grep=04-06` returns the three task commits plus this metadata commit.
- Task 1–3 `<acceptance_criteria>` greps re-run; all print the required values.
- Plan-level `db:reset` / `db:test` / `db:types:check` green. `db:seed:check` red for inherited reasons documented above — not a 04-06 production defect.

---
*Phase: 04-quote-pricing-engine*
*Completed: 2026-08-28*
