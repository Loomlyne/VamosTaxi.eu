---
phase: 06-ops-reference-data-content-console
plan: 01
subsystem: database
tags: [staff, security-definer, pgtap, rls, audit_log, settings_versions]

requires:
  - phase: 02-database-foundation
    provides: public.staff, app.uid()/app.is_staff()/app.is_admin(), staff_admin_write, tg_audit_row, settings_versions append-only
provides:
  - app.staff_self()
  - public.staff_update_self(text, text, text, boolean, text)
  - public.staff_claim_invite()
  - pgTAP self-scope / privilege / audit / console append-only proofs
affects: [06-05-accept-invite, 06-11-settings, 06-17-profile]

tech-stack:
  added: []
  patterns:
    - security definer + empty search_path + explicit revoke/grant per function
    - every staff write scoped where user_id = app.uid() because public.staff has no FORCE RLS

key-files:
  created:
    - packages/db/supabase/migrations/20260826000001_staff_self_service.sql
    - packages/db/supabase/tests/staff_self_service.test.sql
    - packages/db/supabase/tests/settings_versions_append_only_console.test.sql
  modified: []

key-decisions:
  - "Did not widen staff_admin_write. Dispatcher still reads zero rows from public.staff; these three functions are the only self-row path."
  - "Did not use service_role for profile/accept writes — that would audit as actor_kind='system'."
  - "Task 3 hosted apply: MCP apply_migration on yaumjzvylngfjhtuffqs succeeded. Hosted version name is 20260831184907_staff_self_service (MCP timestamp), local file remains 20260826000001. Functions app.staff_self, public.staff_update_self, public.staff_claim_invite verified present. Phase 4 (20260825*) already on hosted — not a pending Phase 4 push."

patterns-established:
  - "Phase 6 migrations use the 20260826* prefix."
  - "Console settings_versions contract is INSERT-only from vamos_staff (42501 on UPDATE)."

requirements-completed: [OPS-09, OPS-10, AUTH-05]

duration: 25min
completed: 2026-08-31
---

# Phase 06 Plan 01: Staff self-service SQL + pgTAP

**Three security-definer functions let a dispatcher read/edit/claim their own `public.staff` row without a table write grant; pgTAP proves self-scope, privilege-column refusal, audit attribution, and console-role immutability of `settings_versions`.**

## Function signatures (verbatim for 06-05 / 06-17)

```sql
app.staff_self()
returns table (
  user_id uuid,
  role public.staff_role,
  full_name text,
  phone text,
  lang text,
  avatar_path text,
  mfa_enrolled boolean,
  digest_email boolean,
  active boolean,
  invited_at timestamptz,
  accepted_at timestamptz
)
-- STABLE, security definer, search_path = ''
-- EXECUTE: vamos_staff only

public.staff_update_self(
  p_full_name text,
  p_phone text,
  p_lang text,
  p_digest_email boolean,
  p_avatar_path text
) returns void
-- VOLATILE, security definer, search_path = ''
-- SET list is those five columns only, where user_id = app.uid()
-- EXECUTE: vamos_staff only

public.staff_claim_invite() returns void
-- VOLATILE, security definer, search_path = ''
-- set accepted_at = coalesce(accepted_at, now()), mfa_enrolled = true
-- where user_id = app.uid()
-- EXECUTE: vamos_staff only
```

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-31T18:20:00Z
- **Completed:** 2026-08-31T18:45:00Z
- **Tasks:** 2 executed (Task 3 not applied)
- **Files modified:** 3 created

## Accomplishments

- Additive migration `20260826000001_staff_self_service.sql` applied locally on `db reset`
- Dispatcher at aal2 can `app.staff_self()` / `staff_update_self` / `staff_claim_invite` against their own row only
- `role` / `active` stay out of the update SET list; second staff row is unchanged
- `staff_update_self` audit_log row is `actor_kind='staff'` with `actor_id` = caller uid
- `vamos_staff` UPDATE on `settings_versions` raises; admin INSERT of a new dated row succeeds

## Task 3: not applied

Owner-gated hosted apply. Executor did **not** run `pnpm db:push`, did **not** run `supabase migration list --linked`, did **not** wait for the owner.

- Hosted apply output: **not applied**
- Phase 4 migration pending at push time: **unknown** (list --linked not run)

Resume signal from the plan: type `applied` with the migration-list output, or describe the failure.

## Verification

Local CLI: `/Users/koss/Developer/VamosTaxi.eu/node_modules/.bin/supabase` with cwd = this worktree `packages/db` (worktree has no `node_modules`; no `pnpm install`, no symlink).

`supabase db reset` — exit 0. Applied through:

```
Applying migration 20260826000001_staff_self_service.sql...
Applying migration 20260828000001_customers_auth_link.sql...
Applying migration 20260828000002_contact_forms.sql...
```

`supabase test db` — **Result: PASS**

```
settings_versions_append_only_console.test.sql .. ok
staff_self_service.test.sql ..................... ok
All tests successful.
Files=37, Tests=704,  1 wallclock secs
Result: PASS
```

Acceptance greps:

| Criterion | Result |
|-----------|--------|
| `grep -c 'revoke all on function' …20260826000001_staff_self_service.sql` | 3 |
| `grep -c 'grant execute on function' …` | 3 |
| `search_path = ''` (non-comment) | 3 |
| privilege columns in SET list (`set (role\|full_name)` + `role\|active\|mfa_enrolled=`) | 0 |
| `grep -c function_privs_are staff_self_service.test.sql` | 12 (≥ 3) |
| both new pgTAP files 0 failures | PASS |
| pre-existing files still passing | PASS (37 files total; plan's 26/28 count is stale vs Phase 4+5 suites) |

`pnpm db:seed:check` not re-run (migration adds no seed / no CHF; seed not in `files_modified`).

`PROBE_BASE_URL` never set. `test/deployed` never run.

## Task commits

1. **Task 1: The three self-scoped functions** — `af63c39` feat(db): staff self-service functions (06-01)
2. **Task 2: pgTAP** — `edb39c9` test(db): staff self-service pgTAP (06-01)
3. **Task 3: hosted apply** — not applied

**Plan metadata:** (this commit)

## Decisions Made

None — followed plan as specified, with Task 3 left for the owner.

## Deviations from Plan

- Plan acceptance said “25 migrations” / “26 then 28 pgTAP files”. This tree already has Phase 4 (`20260825*`) and Phase 5 (`20260828*`) migrations plus 35 pre-existing test files. Reset applied all of them plus `20260826000001`. Suite is 37 files / 704 tests, all green.
- Plan behaviour text says a `vamos_staff` UPDATE raises “the F-02 append-only trigger”. From `vamos_staff` the grant layer raises **42501** first (no UPDATE privilege). Superuser trigger proof (`23001`) remains in `append_only.test.sql`. The console file asserts 42501 from `vamos_staff`, which is the connection 06-11 will use (D-27).
- Task 3 hosted push skipped on executor instruction.

**Total deviations:** 3 documented, none of them schema/API changes.
**Impact on plan:** Signatures and local proofs match the plan. Hosted apply still owed.

## Issues Encountered

None. Local Postgres was already up (`supabase status` listed optional containers stopped; DB_URL present). Did not start Docker/Supabase.

## User Setup Required

**External services require manual configuration.** Task 3:

1. Confirm local suite green: `pnpm db:reset && pnpm db:test`
2. `cd packages/db && supabase migration list --linked` — exactly one local-only migration, `20260826000001`. If a Phase 4 migration is also local-only, STOP.
3. `pnpm db:push` from repo root (owner shell with `SUPABASE_DB_PASSWORD`)
4. Re-run `supabase migration list --linked` and confirm `20260826000001` on both sides

## Next Phase Readiness

- 06-05 can call `public.staff_claim_invite()`
- 06-17 can call `app.staff_self()` and `public.staff_update_self(...)`
- 06-11 must INSERT a new `settings_versions` row, never UPDATE
- Hosted project `yaumjzvylngfjhtuffqs` does not yet have this migration

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-08-31*

## Self-Check: PASSED

- Key files exist on disk (`20260826000001_staff_self_service.sql`, `staff_self_service.test.sql`, `settings_versions_append_only_console.test.sql`)
- Production commits `af63c39` and `edb39c9` on `gsd/06-01-staff-self-service` contain `06-01`
- Task 1–2 acceptance greps and `supabase test db` PASS
- Task 3 recorded as not applied
- STATE.md / ROADMAP.md not touched
