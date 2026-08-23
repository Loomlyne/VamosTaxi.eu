---
phase: 02-data-schema-rls-staff-auth-foundations
plan: 02
subsystem: database
tags: [postgres, supabase, pgtap, rls, roles, extensions, migrations]

# Dependency graph
requires:
  - phase: 02-data-schema-rls-staff-auth-foundations
    provides: "02-01: packages/db/supabase/ as the one Supabase project directory, the pinned CLI, the pre-assigned 24-file migration numbering table"
provides:
  - "The four Postgres roles (vamos_edge, vamos_public, vamos_guest, vamos_staff) with the D-02 privilege-less-login-role security boundary, idempotent across db reset"
  - "The app schema and its three GUC-reading identity helpers: app.jwt(), app.uid(), app.manage_token_hash()"
  - "Every enum type (11) and the rappen money domain, with F-17's non-negativity check carried on the domain itself"
  - "F-13's closed default-privilege gaps (no client role can CREATE on schema public; no function in public/app is PUBLIC-executable) and F-21's documented vamos_edge trust-assumption"
  - "58 pgTAP assertions across two files proving all of the above, re-run on every supabase db reset"
affects: [02-03, 02-04, 02-05, 02-06, 02-07, 02-08, 02-09, 02-10, phase-03-hyperdrive]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cluster-level objects (roles) are created in idempotent `do $$ if not exists ... $$` guards, never a bare CREATE ROLE, because `supabase db reset` drops the database but not the cluster's roles"
    - "Every app.* SQL-language identity helper: `language sql stable set search_path = ''`, explicit `revoke all ... from public` then a narrow `grant execute` — the shape every later SECURITY DEFINER function in this phase copies"
    - "pgTAP schema-qualified checks (has_domain/has_enum/has_extension) must use the 3-arg (schema, name, description) form — the 2-arg (schema, name) form collides with a same-arity (name, version) overload under Postgres's unknown-literal type resolution and silently resolves to the wrong function"

key-files:
  created:
    - packages/db/supabase/migrations/20260823000001_extensions.sql
    - packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql
    - packages/db/supabase/migrations/20260823000003_types.sql
    - packages/db/supabase/tests/extensions.test.sql
    - packages/db/supabase/tests/identity_helpers.test.sql
  modified:
    - docs/build/GSD-LAUNCH.md

key-decisions:
  - "vamos_edge/vamos_public/vamos_guest/vamos_staff created inside idempotent pg_roles-guarded DO blocks (not a bare CREATE ROLE) so a second `supabase db reset` succeeds — roles are cluster-level and survive the database drop"
  - "F-13: four extra default-privilege statements added beyond the schema draft's three — REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC in both public and app, REVOKE ALL ON TABLES FROM ... in app, and REVOKE CREATE ON SCHEMA public FROM ... — because a named-role REVOKE never removes PUBLIC's own default EXECUTE grant on a new function"
  - "F-17: rappen domain carries `check (value >= 0)` on the domain itself, not per-column, so a future money column cannot omit the check the way bookings.price_total_rappen does in the draft"
  - "F-21: the vamos_edge/vamos_public password trust-assumption is written both beside the membership grants in the migration and as a new line in GSD-LAUNCH.md's Secrets/env matrix, placing those passwords in the same tier as SUPABASE_SERVICE_ROLE"
  - "requirements-completed left empty for this plan despite DATA-01..04 appearing in the plan's frontmatter: the plan's own objective states DATA-02/03/04 are proved later by RLS and are only structural here (no table exists yet), and DATA-01 (schema mirrors VamosOps) was already marked Complete by Plan 02-01 before any schema existed — re-affirming any of the four from this plan would overstate what 02-02 actually proves"

requirements-completed: []

# Metrics
duration: ~20min
completed: 2026-08-23
---

# Phase 2 Plan 2: Foundation migrations — extensions, roles, identity helpers, types Summary

**Four idempotent Postgres roles behind the D-02 privilege-less `vamos_edge` login boundary, three `app.*` identity helpers, eleven enums, the non-negativity-checked `rappen` domain, and 58 pgTAP assertions proving all of it — closing F-13's default-privilege gap and F-17's missing money-domain check along the way.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-08-23T22:53:44Z
- **Tasks:** 2 (both `type="auto"`)
- **Files modified:** 6 (5 created, 1 modified)

## Accomplishments

- `packages/db/supabase/migrations/20260823000001_extensions.sql` installs `pgcrypto`,
  `btree_gist`, `citext` and `pgtap` into schema `extensions` (available on the local image but
  not installed by default) and sets the database `search_path`.
- `packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql` creates `vamos_edge`
  and `vamos_public` (LOGIN NOINHERIT, no password clause — passwords are set out-of-band per
  `packages/db/README.md` "Role passwords") and `vamos_guest`/`vamos_staff` (NOLOGIN), each
  inside an idempotent `pg_roles`-guarded block; grants `vamos_edge` membership in `anon`,
  `authenticated`, `vamos_guest`, `vamos_staff` `WITH INHERIT FALSE, SET TRUE`; closes F-13's
  default-privilege gap with four statements beyond the schema draft's three (`REVOKE EXECUTE
  ON FUNCTIONS FROM PUBLIC` in both `public` and `app`, `REVOKE ALL ON TABLES` in `app`,
  `REVOKE CREATE ON SCHEMA public`); documents F-21's `vamos_edge` trust assumption beside the
  membership grants; and creates `app.jwt()`, `app.uid()`, `app.manage_token_hash()` (leaving
  `app.is_staff()`/`app.is_admin()`/`app.booking_has_manage_token()` for the plans that create
  the tables they read, per `check_function_bodies`).
- `packages/db/supabase/migrations/20260823000003_types.sql` creates all eleven enum types
  from the schema draft and `create domain rappen as integer check (value >= 0)` — F-17's
  non-negativity check lives on the domain, not repeated per column.
- `docs/build/GSD-LAUNCH.md` gained a one-line F-21 addition to the Secrets/env matrix: the
  `vamos_edge`/`vamos_public` role passwords sit in the same tier as `SUPABASE_SERVICE_ROLE`.
- `packages/db/supabase/tests/extensions.test.sql` (47 assertions) and
  `packages/db/supabase/tests/identity_helpers.test.sql` (11 assertions) prove every structural
  claim above, including F-17's `(-1)::rappen` → `23514` and F-13's "no function in public/app
  is PUBLIC-executable" invariant.
- `pnpm db:reset` run three times in this session (twice back-to-back as the task's own gate,
  once more after the test files landed) — always exits 0, proving the role-creation guards.
  `pnpm db:test` reports `Files=2, Tests=58, Result: PASS`.

## Task Commits

1. **Task 1: Write migrations 01 (extensions), 02 (roles + identity helpers), 03 (types)** —
   `b713e25` (feat)
2. **Task 2: pgTAP — `extensions.test.sql` and `identity_helpers.test.sql` (D-01, D-26 local
   proof)** — `408ee2f` (test)

_No TDD tasks in this plan (both tasks are `type="auto"`, not `tdd="true"`); plan-metadata
commit (this SUMMARY + STATE/ROADMAP/REQUIREMENTS) lands separately below._

## Files Created/Modified

- `packages/db/supabase/migrations/20260823000001_extensions.sql` — extensions schema, four
  `CREATE EXTENSION IF NOT EXISTS` statements, database `search_path`
- `packages/db/supabase/migrations/20260823000002_roles_and_helpers.sql` — `app` schema, four
  idempotent role-creation blocks, `vamos_edge` memberships, seven default-privilege statements
  (three from the draft + F-13's four), three identity helper functions
- `packages/db/supabase/migrations/20260823000003_types.sql` — eleven `create type ... as enum`
  statements, the `rappen` domain with `check (value >= 0)`
- `packages/db/supabase/tests/extensions.test.sql` — 47 pgTAP assertions (extensions, roles,
  memberships, enums, domain, F-13, F-17)
- `packages/db/supabase/tests/identity_helpers.test.sql` — 11 pgTAP assertions (unset-GUC
  behaviour, claim reads, the D-26 savepoint proof, the grant-layer boundary)
- `docs/build/GSD-LAUNCH.md` — one new sentence in "Secrets / env matrix" (F-21)

## Decisions Made

- Idempotent `DO $$ ... IF NOT EXISTS ... $$` blocks for all four role-creation statements
  (plan-specified, confirmed necessary: a bare `CREATE ROLE` failed on the second `db reset`
  in early manual testing of the pattern before writing the guarded form).
- F-13's four extra default-privilege statements written exactly as the plan specifies, with
  the reasoning comment kept inline (a named-role `REVOKE` never removes `PUBLIC`'s own default
  `EXECUTE` grant on a new function — the three-statement form in the schema draft was a no-op
  for functions).
- pgTAP schema-qualified assertions (`has_domain`, `has_enum`, `has_extension`) written with
  the 3-arg `(schema, name, description)` form throughout, not the 2-arg `(schema, name)` form
  the read-first documentation implied — see Issues Encountered.
- `is_member_of(role, member, description)` called with the *role* first and the *member*
  (`vamos_edge`) second, verified against `pg_auth_members` directly rather than assumed —
  the natural reading ("is vamos_edge a member of X") maps to `is_member_of(X, 'vamos_edge')`.
- `requirements-completed` left empty in this SUMMARY's frontmatter and `requirements
  mark-complete` was **not** run for DATA-01..04, despite the plan's own frontmatter listing
  them. The plan's `<objective>` explicitly states DATA-02/03/04 are "proved later by RLS" and
  are only structural here (this plan creates zero tables), and DATA-01 (schema mirrors the
  `VamosOps` contract) was already marked Complete by Plan 02-01 before any schema existed.
  Marking any of the four complete from this plan would overstate what it actually proves;
  they remain open in `REQUIREMENTS.md` until the plans that create the tables and enable RLS
  land (02-03 through 02-08 in the CONTEXT.md proposed split).

## Deviations from Plan

None that changed scope — the two adjustments below were discovered *while writing* the pgTAP
files (Task 2's own subject matter) and are corrections to test-authoring technique, not to the
schema or its invariants.

### Auto-fixed Issues

**1. [Rule 1 - Bug] pgTAP's 2-arg `(schema, name)` overload for `has_domain`/`has_enum`/
`has_extension` does not resolve the way the plan's read-first list implied**
- **Found during:** Task 2, first draft of `extensions.test.sql`
- **Issue:** Calling `has_domain('public', 'rappen')` (two untyped string literals) resolves
  to the `(name, text)` "check domain exists with this custom description" overload, not the
  `(name, name)` "check domain exists in this schema" overload — Postgres's unknown-literal
  type resolution prefers the `text`-typed candidate in the STRING category when two overloads
  of the same arity differ only in `name` vs `text`. The call silently checked for a domain
  literally named `public` (which doesn't exist) instead of `rappen` in schema `public`, and
  failed with a misleading "Domain public does not exist" message. Confirmed empirically
  against the actual installed `pgtap 1.3.3` functions (`\sf` on each candidate signature),
  not assumed from documentation.
- **Fix:** Every schema-qualified assertion in both test files uses the unambiguous 3-arg
  `(schema, name, description)` form instead, which has only one matching overload.
- **Files modified:** `packages/db/supabase/tests/extensions.test.sql`,
  `packages/db/supabase/tests/identity_helpers.test.sql`
- **Verification:** `pnpm --filter @vamos/db run test:db supabase/tests/extensions.test.sql`
  — all 47 assertions `ok`, no "planned N but ran M" warning.
- **Committed in:** `408ee2f` (Task 2 commit)

**2. [Rule 1 - Bug] `is_member_of` argument order verified empirically, not assumed**
- **Found during:** Task 2, first draft of `extensions.test.sql`
- **Issue:** An initial `is_member_of('vamos_edge', 'authenticated', ...)` call (read as "is
  vamos_edge a member of authenticated") failed — the function's actual signature is
  `is_member_of(role, member)`, so the role is the *first* argument.
- **Fix:** Swapped to `is_member_of('authenticated', 'vamos_edge', ...)` for all four
  membership assertions, confirmed by reading the function's SQL body (`\sf`) and by a
  positive-control probe against `pg_auth_members` before writing the final file.
- **Files modified:** `packages/db/supabase/tests/extensions.test.sql`
- **Verification:** Same test run as above — all four `is_member_of` assertions `ok`.
- **Committed in:** `408ee2f` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1, test-authoring corrections discovered while
writing the very pgTAP files the task asked for — no schema change, no scope change).
**Impact on plan:** None on the shipped schema. Both fixes are internal to the test files and
were required to make the tests assert what the plan actually specifies, rather than passing
for the wrong reason (a schema-qualified check that accidentally checked an unqualified name
would have been a false-positive test, not a passing one).

## Issues Encountered

- pgTAP 1.3.3's overload resolution for `has_domain`/`has_enum`/`has_extension` was not
  documented anywhere accessible offline (the CLI/local install ships no man page beyond
  `\df`), so signatures were confirmed by inspecting each candidate's SQL body directly
  (`\sf extensions.has_domain(name,name)` etc.) against the live local database rather than
  from the pgTAP website — recorded above as Auto-fixed Issue 1 since it changed how the test
  files are written, not just a note.

## User Setup Required

None — no external service configuration required. `vamos_edge`/`vamos_public` role passwords
remain unset locally by design (fail-closed, per `packages/db/README.md` "Role passwords");
they are set out-of-band per environment once Phase 3 wires Hyperdrive.

## Next Phase Readiness

The foundation Plan 02-03 (`P2` — reference data: settings, fleet, customers, staff) is written
against is now real: the four roles exist with the exact grant shape D-02/D-03 specify, the
`app.*` identity-helper contract (`app.jwt()`, `app.uid()`, `app.manage_token_hash()`) is live
and pgTAP-proven, and `app.is_staff()`/`app.is_admin()` have their exact ship location already
documented (next to `public.staff` in `...06_customers_and_staff.sql`). Every enum name and the
`rappen` domain Plan 02-03 onward will reference in column definitions exist. No blockers.

`pnpm db:reset` and `pnpm db:test` both green from zero, twice, as required by the plan's
top-level `<verification>` block.

---
*Phase: 02-data-schema-rls-staff-auth-foundations*
*Completed: 2026-08-23*

## Self-Check: PASSED

All 7 created/modified files verified present on disk; all 3 commits (`b713e25`, `408ee2f`,
`a3c2f7d`) verified present in `git log --oneline --all`.
