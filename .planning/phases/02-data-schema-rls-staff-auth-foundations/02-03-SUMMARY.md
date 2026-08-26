---
phase: 02-data-schema-rls-staff-auth-foundations
plan: 03
subsystem: database
tags: [postgres, supabase, pgtap, rls-prep, staff-auth, custom-access-token-hook, i18n]

# Dependency graph
requires:
  - phase: 02-data-schema-rls-staff-auth-foundations
    provides: "02-02: the four roles, app.jwt()/app.uid()/app.manage_token_hash(), every enum, the rappen domain"
provides:
  - "settings (mutable singleton) + settings_versions (immutable policy history, D-10) with the seven D-35/ADR-014 §5 policy columns — all nullable, no value seeded here"
  - "vehicle_classes, vehicles, chauffeurs mirroring VamosOps (DATA-01)"
  - "customers with the D-19 redact-in-place erasure guard; no ON DELETE CASCADE anywhere except staff.user_id -> auth.users"
  - "staff, app.is_staff()/app.is_admin() (D-05: app_metadata.vamos_role + aal2 + active staff row), custom_access_token_hook with F-19's bidirectional-authoritative strip/re-add and the supabase_auth_admin read policy"
  - "content_strings (D-22 three $meta facts) and reviews (external_ref natural key, generated locked column)"
  - "config.toml local hook + TOTP enablement (D-33 local half)"
  - "110 pgTAP assertions (4 files) proving all of the above from a zero supabase db reset"
affects: [02-04, 02-05, 02-06, 02-07, 02-08, 02-09, 02-10, phase-03-hyperdrive, phase-06-ops-content, phase-08-dispatch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mutable-singleton (settings) vs. immutable-history (settings_versions) split for any future 'current config + booked-at-the-time policy' pair — copy the settings/settings_versions shape, not a single mutable table"
    - "Every new function created in schema public/app MUST carry its own explicit `revoke all on function ... from public;` — the schema-level ALTER DEFAULT PRIVILEGES REVOKE from 02_roles_and_helpers.sql does not apply at CREATE FUNCTION time on this Postgres image (see Deviations)"
    - "A hook function invoked by a Supabase-managed service role (supabase_auth_admin, supabase_storage_admin, etc.) cannot be tested via `set local role <that role>` from a pgTAP suite running as `postgres` — that role's membership is reserved to superusers. Prove the grant/policy shape via catalog assertions (function_privs_are, policy_roles_are, policy_cmd_is) instead of literal impersonation, and prove the function's logic by calling it as the owning role"

key-files:
  created:
    - packages/db/supabase/migrations/20260823000004_settings.sql
    - packages/db/supabase/migrations/20260823000005_fleet.sql
    - packages/db/supabase/migrations/20260823000006_customers_and_staff.sql
    - packages/db/supabase/migrations/20260823000007_content_and_reviews.sql
    - packages/db/supabase/tests/staff_hook_claim.test.sql
    - packages/db/supabase/tests/reference_tables.test.sql
  modified:
    - packages/db/supabase/config.toml

key-decisions:
  - "D-35 applied on top of the schema draft: settings_versions gains manage_link_validity_days (moved out of settings), round_trip_discount_percent, night_window_start/end/tz, quote_lock_minutes, checkout_window_minutes — all nullable, no value written by any migration (D-34 CHF/policy matrix still owner-blocked; values land in Plan 02-09's generated seed)"
  - "F-19 hardening implemented as specified: custom_access_token_hook strips any inbound app_metadata.vamos_role unconditionally before conditionally re-adding it from an active staff row — proven for both the inactive-staff and no-staff-row-at-all cases, with other app_metadata keys surviving the strip"
  - "requirements-completed left empty despite DATA-01/DATA-04/AUTH-05 in the plan's frontmatter: DATA-01 was already marked Complete by Plan 02-01; DATA-04 ('staff reach ops data through a role claim') needs the RLS policies a later wave enables, not just the claim mechanism; AUTH-05 ('sign in by invitation only, second factor') is proven here only on its SQL half per the plan's own objective — the invite flow and the hosted dashboard hook confirmation are Plan 02-10's job. Marking either complete now would overstate what this plan proves, mirroring Plan 02-02's precedent."

# Metrics
duration: ~25min (task-commit span; includes a mid-task Postgres ACL investigation)
completed: 2026-08-24
---

# Phase 2 Plan 3: Settings/settings_versions split, fleet, customers/staff, Custom Access Token Hook, content/reviews Summary

**Seven DATA-01 reference tables plus the SQL half of AUTH-05: settings_versions carries all six ADR-014 §5 (D-35) policy columns nullable, the Custom Access Token Hook strips-then-reconditionally-re-adds `app_metadata.vamos_role` (F-19), and 110 pgTAP assertions prove it all from a zero `supabase db reset`.**

## Performance

- **Duration:** ~25 min (span between the three task commits; a mid-Task-2 investigation into a Postgres default-privilege gap for functions added time but is folded into that commit)
- **Completed:** 2026-08-24T03:23:13+04:00
- **Tasks:** 3 (all `type="auto"`)
- **Files modified:** 7 (6 created, 1 modified)

## Accomplishments

- `settings` (mutable singleton, D-10) and `settings_versions` (immutable policy history) split
  cleanly: `settings` keeps contacts/toggles/`chauffeur_turnaround_minutes` (D-14, defaults 30,
  the one internal parameter that is not NULL-seeded); `settings_versions` gained the six D-35
  columns (`manage_link_validity_days`, `round_trip_discount_percent`, `night_window_start/end/
  tz`, `quote_lock_minutes`, `checkout_window_minutes`) on top of the pre-existing ADR-005/
  ADR-002 columns — every one nullable, no value written anywhere in this plan.
- `vehicle_classes`, `vehicles`, `chauffeurs` mirror `VamosOps`; the `vehicle_classes.slug` CHECK
  stays tolerant of the draft's full list (including `'first'`) per D-36 — the schema doesn't
  narrow it, the seed and pgTAP do.
- `customers` (D-19 redact-in-place erasure via `tg_customers_erasure_guard`, no `ON DELETE
  CASCADE` anywhere) and `staff` (the authoritative role source) are live; `app.is_staff()`/
  `app.is_admin()` require `app_metadata.vamos_role` + `aal = 'aal2'` + an active `staff` row
  (D-05), never `user_metadata` (D-04).
- `custom_access_token_hook` implements the F-19 hardening exactly as specified: it strips any
  inbound `app_metadata.vamos_role` unconditionally, then conditionally re-adds it from an
  active `staff` row — proven for the inactive-staff case, the no-staff-row-at-all case, and
  that every other `app_metadata` key survives the strip untouched. `staff_auth_admin_read`
  policy + grants are in place so `supabase_auth_admin` can read `staff` once RLS is enabled.
- `content_strings` (D-22: `pending_value`/`non_translatable`/`no_param_reason`) and `reviews`
  (`external_ref` natural key, `locked` generated from `source`) land ahead of the not-yet-
  written audit-log migration, since `tg_audit_row` (a later plan) attaches to both.
- `config.toml` has the local half of D-33: `[auth.hook.custom_access_token]` enabled with the
  hook's `pg-functions://` uri, `[auth.mfa.totp]` enroll/verify enabled. The stack was stopped
  and restarted so the auth container picked up both before the final test run.
- 110 pgTAP assertions across 4 files (47 + 11 + 34 + 18), `pnpm db:reset && pnpm db:test` green
  twice in a row.

## Task Commits

1. **Task 1: Migrations 04 (settings + settings_versions with D-35 columns) and 05 (fleet)** — `59bba0d` (feat)
2. **Task 2: Migration 06 (customers, staff, app.is_staff/is_admin, Custom Access Token Hook) + config.toml hook/TOTP enablement + staff_hook_claim.test.sql** — `285e0f2` (feat)
3. **Task 3: Migration 07 (content_strings, reviews) + reference_tables.test.sql** — `870dc03` (feat)

_No TDD tasks in this plan; plan-metadata commit (this SUMMARY + STATE/ROADMAP/REQUIREMENTS) lands separately below._

## Files Created/Modified

- `packages/db/supabase/migrations/20260823000004_settings.sql` — `settings` singleton,
  `settings_versions` with the D-35 column set
- `packages/db/supabase/migrations/20260823000005_fleet.sql` — `vehicle_classes`, `vehicles`,
  `chauffeurs`
- `packages/db/supabase/migrations/20260823000006_customers_and_staff.sql` — `customers` +
  erasure guard, `staff`, `app.is_staff()`/`app.is_admin()`, `custom_access_token_hook` (F-19),
  `staff_auth_admin_read` policy
- `packages/db/supabase/migrations/20260823000007_content_and_reviews.sql` — `content_strings`,
  `reviews`
- `packages/db/supabase/tests/staff_hook_claim.test.sql` — 18 pgTAP assertions (hook shape,
  F-19 strip, grant boundary, D-04/D-05 gates)
- `packages/db/supabase/tests/reference_tables.test.sql` — 34 pgTAP assertions (DATA-01 shape,
  D-35 columns, CHECK boundaries, erasure guard, content_strings $meta)
- `packages/db/supabase/config.toml` — `[auth.hook.custom_access_token]` and `[auth.mfa.totp]`
  enabled (D-33 local half)

## Decisions Made

- `requirements-completed` left empty in this SUMMARY's frontmatter and `requirements
  mark-complete` was **not** run for DATA-04/AUTH-05, despite the plan's own frontmatter listing
  them alongside DATA-01 (already Complete since Plan 02-01). DATA-04 ("staff reach ops data
  through a role claim; customers never can") needs the RLS policies a later wave (Plan 02-06 in
  the proposed split) enables — the claim mechanism exists and is tested, but no table has RLS
  turned on yet, so no actor is actually gated through it. AUTH-05 ("staff sign in by invitation
  only and must pass a second factor") is proven here only on its SQL half, exactly as the
  plan's own `<objective>` states — the invite route and the hosted dashboard hook confirmation
  are Plan 02-10's job. This mirrors Plan 02-02's documented precedent for the same reasoning.
- Catalog-based proof (`function_privs_are`, `policy_roles_are`, `policy_cmd_is`) substituted
  for literal `set local role supabase_auth_admin` impersonation in `staff_hook_claim.test.sql`
  — see Deviations below for why the literal approach is not possible on this Postgres image.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`
(migration 02) does not apply at `CREATE FUNCTION` time on this Postgres image**
- **Found during:** Task 2, first `pnpm db:test` run after adding `tg_customers_erasure_guard()`
- **Issue:** `extensions.test.sql`'s F-13 invariant ("no function in schema public or app is
  executable by PUBLIC") failed on `tg_customers_erasure_guard()` — the one new function in this
  plan that had no explicit `revoke`/`grant` of its own (unlike `is_staff`/`is_admin`/
  `custom_access_token_hook`, which all got explicit revokes per the draft). Investigated with
  scratch functions directly against the running container: a brand-new function created by
  `postgres` in schema `public` — even immediately after re-running the exact
  `ALTER DEFAULT PRIVILEGES` statement in the same session — still gets a `NULL` catalog ACL,
  which Postgres resolves to the hard-coded "PUBLIC has EXECUTE" default for functions
  specifically. A parallel test with a `TABLE` in the same session correctly picked up the
  customized default (explicit non-null ACL, no PUBLIC grant) — the gap is function-specific,
  not schema- or session-specific. This makes migration 02's F-13 fix a no-op for any function
  that doesn't carry its own explicit revoke, which the other three functions already did
  (masking the gap until this trigger function, the first to rely purely on the default).
  Security impact here is nil (a `returns trigger` function errors if invoked outside trigger
  context, PUBLIC-executable or not), but the pgTAP invariant is real and worth keeping honest.
- **Fix:** Added `revoke all on function public.tg_customers_erasure_guard() from public;` right
  after its creation, matching the pattern the other three functions already used. Documented
  the finding inline as a binding note for every later plan: new functions in `public`/`app`
  must carry their own explicit revoke, not rely on the schema-level default-privilege
  statements.
- **Files modified:** `packages/db/supabase/migrations/20260823000006_customers_and_staff.sql`
- **Verification:** `pnpm db:reset && pnpm db:test` — `extensions.test.sql` test 47 passes.
- **Committed in:** `285e0f2` (Task 2 commit)

**2. [Rule 3 - Blocking issue] `set local role supabase_auth_admin` is not possible for the
`postgres` role that runs pgTAP tests on this Postgres image**
- **Found during:** Task 2, first draft of `staff_hook_claim.test.sql`
- **Issue:** The plan's action text asks the test to call the hook "as `set local role
  supabase_auth_admin`". `postgres` on this Supabase local image is not a superuser
  (`rolsuper = false`) and is deliberately not a member of `supabase_auth_admin` — even
  `GRANT supabase_auth_admin TO postgres` inside a transaction that would otherwise roll back
  fails with `"supabase_auth_admin" role memberships are reserved, only superusers can grant
  them`. There is no `supabase test db` flag to connect as a different role.
- **Fix:** Restructured the test to prove the same invariants without impersonation: the hook's
  claim-manipulation logic (F-19 strip/re-add, D-04 role source) is exercised by calling it as
  `postgres`, which — as owner of both the function and `public.staff` — reads and executes
  exactly as any grantee with the same row would, since the function is `SECURITY INVOKER` by
  design and no RLS is enabled on `staff` yet at this point in the migration sequence. The
  `supabase_auth_admin`-specific EXECUTE grant and the `staff_auth_admin_read` policy are proved
  directly against the catalog instead, via `function_privs_are`, `policy_roles_are` and
  `policy_cmd_is` — none of which require impersonating the role. The file's header comment
  explains this substitution in full.
- **Files modified:** `packages/db/supabase/tests/staff_hook_claim.test.sql`
- **Verification:** `pnpm db:test` — 18/18 assertions pass; `docker exec ... psql ... "select
  has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'execute')"`
  independently confirms `f`.
- **Committed in:** `285e0f2` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 — a real, if low-impact, security-invariant gap
found while writing this plan's own migration; 1 Rule 3 — an environmental testing constraint
with no functional impact on what's proven).
**Impact on plan:** No scope change. Both fixes keep the shipped schema and its pgTAP proof
honest to what the plan specifies; neither weakens a security guarantee.

## Issues Encountered

- One acceptance-criteria grep in Task 3 is a known false positive:
  `grep -c "generated always as" migrations/2026082300000[4-7]_*.sql` sums to 3, not the 1 that
  `grep -c ") stored"` sums to, because the pattern also matches `settings_versions.id bigint
  generated always as identity primary key` (a PK identity column — a completely different SQL
  construct that never takes `stored` and would be a syntax error if it did) and a prose comment
  in the same migration explaining why `settings.id` uses `default 1` instead. The actual D-28
  invariant — every `generated always as (expression)` computed column explicitly writes
  `stored` — is satisfied: the only such column across migrations 04–07 is `reviews.locked`,
  and it does say `stored`. Verified directly rather than chasing the literal grep, which would
  have required either invalid SQL or deleting a useful comment.

## User Setup Required

None — no external service configuration required. The hosted dashboard equivalents of the
Custom Access Token Hook and TOTP MFA (D-33) remain Plan 02-10's owner-held step.

## Next Phase Readiness

All nine DATA-01 reference/identity tables exist (`settings`, `settings_versions`,
`vehicle_classes`, `vehicles`, `chauffeurs`, `customers`, `staff`, `content_strings`,
`reviews`), `app.is_staff()`/`app.is_admin()` and `custom_access_token_hook` are live and
pgTAP-proven, and `content_strings`/`reviews` are positioned ahead of the audit-log migration
so `tg_audit_row` (a later plan) can attach to both without a forward reference. `pnpm db:reset
&& pnpm db:test` green twice, `Files=4, Tests=110, Result: PASS`. No blockers for Plan 02-04
(pricing: `rate_versions`, `distance_rates`, `fixed_routes`, `surcharges`, `coupons`), which
needs `vehicle_classes` (present) for its FK.

---
*Phase: 02-data-schema-rls-staff-auth-foundations*
*Completed: 2026-08-24*

## Self-Check: PASSED

All 8 created/modified files verified present on disk; all 3 task commits (`59bba0d`,
`285e0f2`, `870dc03`) verified present in `git log --oneline --all`.
