---
phase: 02-data-schema-rls-staff-auth-foundations
plan: 07
subsystem: database
tags: [postgres, supabase, pgtap, plpgsql, append-only, audit-log, consent, security-definer]

# Dependency graph
requires:
  - phase: 02-data-schema-rls-staff-auth-foundations (waves 0-7, plans 02-01..02-06)
    provides: extensions/roles/types, settings/fleet/customers/staff, content_strings/reviews, rate_versions/coupons, bookings/booking_legs/booking_access_tokens (D-15/D-16), price_snapshots/booking_payments/booking_refunds/stripe_events/booking_notifications/coupon_redemptions
provides:
  - booking_events (app-written timeline, D-17) + audit_log/tg_audit_row (trigger-written CRUD diff over 15 tables)
  - consent_log + record_consent() -- the one write path into the consent ledger (D-32)
  - tg_append_only four-layer enforcement over seven tables (the drafted six plus settings_versions, F-02), with the F-03 TRUNCATE closure and the F-10 consent_log erasure carve-out
  - manage_booking_cancel proven end-to-end against the real booking_events table (D-16), plus four Rule-1 fixes in that function surfaced by its first real invocation
affects: [02-08 (RLS policies read/write this evidence layer; settings_versions' admin-only insert policy and its removal from the dispatcher working set), Phase 8 (booking_events timeline consumed by ops board), Phase 9 (booking_status roll-up trigger generalizes manage_booking_cancel's inline rule), Phase 10 (D-19/D-20 erasure routine uses the consent_log carve-out landed here; audit_log's pre-redaction-PII half is explicitly deferred)]

tech-stack:
  added: []
  patterns:
    - "Generic trigger-written audit log: one tg_audit_row() function, attached via a DO-block loop to N tables of differing shape, with the PK read as coalesce(to_jsonb(new)->>'id', to_jsonb(new)->>'user_id', ...) rather than a typed new.id/new.user_id, so one function body works across tables whose primary key column name differs"
    - "Four-layer append-only enforcement, now with two independent carve-outs: table-name dispatch MUST be its own outer PL/pgSQL IF/ELSIF (not folded into one combined boolean expression with the record-field check) -- PL/pgSQL resolves every OLD/NEW field reference in an expression before the SQL executor's own short-circuit runs, so a shared trigger firing on a table lacking one carve-out's column crashes with 42703 unless the table check is a separate, sequentially-evaluated statement"
    - "A STORED GENERATED column reads NULL in NEW during a BEFORE ROW UPDATE trigger (recomputed only after the trigger chain returns); a same-row-shape comparison (to_jsonb(new) = to_jsonb(old)) that must ignore an unrelated generated column has to carry OLD's value forward into NEW immediately before the comparison, in the SAME function invocation -- the assignment does not survive being read by a later trigger"
    - "A SECURITY DEFINER function's own `returns table (...)` OUT parameter names are visible as bare identifiers inside the function body and can collide with an unqualified column reference of the same name in a single-table UPDATE/SELECT -- qualify with a table alias rather than relying on the column being unambiguous by position"

key-files:
  created:
    - packages/db/supabase/migrations/20260823000016_booking_events.sql
    - packages/db/supabase/migrations/20260823000017_audit_log.sql
    - packages/db/supabase/migrations/20260823000018_consent_log.sql
    - packages/db/supabase/migrations/20260823000019_append_only.sql
    - packages/db/supabase/tests/audit_trigger.test.sql
    - packages/db/supabase/tests/consent_write.test.sql
    - packages/db/supabase/tests/append_only.test.sql
    - packages/db/supabase/tests/manage_booking_mutation.test.sql
  modified:
    - packages/db/supabase/migrations/20260823000012_booking_access_tokens.sql

key-decisions:
  - "D-17/D-18 audit split realised exactly: booking_events is app-written with no trigger and no client write grant at all; audit_log is trigger-written over 15 admin/reference tables including customers (D-19 redaction evidence)"
  - "F-02: settings_versions joins the seven-table append-only set here (trigger + revoke + FORCE RLS); the dispatcher-vs-admin grant/policy half is explicitly left to Plan 02-08, since no policy migration exists before ...20"
  - "F-03: TRUNCATE closed with a global revoke, a default-privilege revoke for future tables, and nine BEFORE TRUNCATE statement triggers reusing tg_append_only -- proven that service_role gets 42501 and postgres (table owner) still gets 23001 from the trigger"
  - "F-10: only the consent_log.customer_id -> NULL carve-out and its service_role grant land here, making D-19's documented erasure write reachable; the audit_log pre-redaction-PII half stays explicitly deferred to Phase 10 with counsel, per the plan's <deferred> block"
  - "F-22: the postgres-role BYPASSRLS/superuser dependency that lets tg_audit_row and record_consent write under FORCE RLS with zero INSERT policy is asserted in pgTAP rather than papered over with a policy, so a future re-owning of either function fails the gate instead of silently breaking the audit trail or the cookie banner"

patterns-established:
  - "PL/pgSQL functions shared across multiple differently-shaped tables (one trigger function, many attached tables) must dispatch on tg_table_name as an OUTER IF/ELSIF before ever referencing an OLD/NEW field specific to one table's shape -- never inside one combined AND expression"
  - "A generated column excluded from a before/after JSONB diff inside its OWN table's BEFORE UPDATE trigger needs its value carried from OLD into NEW immediately before the comparison, not merely subtracted out of the JSONB objects being compared (subtracting the key does not help once you know NEW's copy is NULL, not stale -- the assignment approach was what actually worked)"

requirements-completed: [DATA-01, DATA-03]

# Metrics
duration: ~50min
completed: 2026-08-24
---

# Phase 2 Plan 7: Evidence Layer -- Booking Events, Audit Log, Consent, Four-Layer Append-Only Summary

**booking_events (app-written) + audit_log (15-table trigger-written diff), consent_log with record_consent() as its only write path, and tg_append_only hardened to seven tables with F-02/F-03/F-10/F-22 folded in -- plus manage_booking_cancel's first real end-to-end run, which surfaced and fixed four latent bugs in already-committed code. 19 migrations apply clean from zero, 29 tables, pnpm db:test Files=15, Tests=321, PASS.**

## Performance

- **Duration:** ~50 min active execution across three tasks
- **Completed:** 2026-08-24T18:23:30+04:00
- **Tasks:** 3/3
- **Files modified:** 9 (4 new migrations, 4 new pgTAP files, 1 amended migration)

## Accomplishments

- `booking_events` ships with the full 17-kind CHECK vocabulary and no trigger at all (D-17); `audit_log` + `tg_audit_row()` attach via a DO-block loop to 15 tables including `customers` (D-19 redaction evidence), with a PK-read that works whether the table's primary key column is `id` or `user_id` (`staff`).
- `consent_log` + `record_consent()`: the only write path into the consent ledger, subject and customer bound from a server-set GUC and `app.uid()` -- never a caller argument, so consent cannot be forged or attributed to a victim.
- `tg_append_only` now covers SEVEN tables (the drafted six plus `settings_versions`, F-02) with the F-03 TRUNCATE closure (nine BEFORE TRUNCATE statement triggers, since a row trigger never fires on TRUNCATE and RLS does not filter it), the F-10 consent-erasure carve-out, F-11's DELETE/TRUNCATE closure on `stripe_events`/`booking_notifications` (UPDATE deliberately preserved), F-20's `search_path`, and F-22's BYPASSRLS assertion.
- `manage_booking_cancel` (Plan 02-05) executed end-to-end for the first time in this plan's `manage_booking_mutation.test.sql`, surfacing four real bugs that no prior test had exercised -- all fixed (see Deviations).
- 19 migrations apply clean from a zero `db reset`; 29 tables in `public` before RLS (matches the plan's stated verification target).

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrations 16 (booking_events) and 17 (audit_log + tg_audit_row + 15 triggers) + `audit_trigger.test.sql`** - `60f2bf3` (feat)
2. **Task 2: Migrations 18 (consent_log) and 19 (four-layer append-only) + `consent_write.test.sql` + `append_only.test.sql`** - `89c8cc1` (feat, includes an amendment to Task 1's `audit_trigger.test.sql`)
3. **Task 3: `manage_booking_mutation.test.sql` -- D-16 atomic guest cancel end-to-end (F-09)** - `a3c8840` (test, includes four Rule-1 fixes to Plan 02-05's `...012_booking_access_tokens.sql`)

**Plan metadata:** (this commit, following this summary)

## Files Created/Modified

- `packages/db/supabase/migrations/20260823000016_booking_events.sql` - `booking_events` table, 17-kind CHECK, two named CHECKs, app-written (no trigger)
- `packages/db/supabase/migrations/20260823000017_audit_log.sql` - `audit_log`, `tg_audit_row()`, 15 `audit_<table>` triggers via a DO block
- `packages/db/supabase/migrations/20260823000018_consent_log.sql` - `consent_log`, `record_consent()` (the one write path, D-32)
- `packages/db/supabase/migrations/20260823000019_append_only.sql` - `tg_append_only` (two carve-outs), seven append-only tables + two delete/truncate-only tables, revokes incl. `service_role` and `truncate`, FORCE RLS x9
- `packages/db/supabase/migrations/20260823000012_booking_access_tokens.sql` - **modified**: four Rule-1 fixes in `manage_booking_cancel` (see Deviations)
- `packages/db/supabase/tests/audit_trigger.test.sql` - 14 pgTAP assertions
- `packages/db/supabase/tests/consent_write.test.sql` - 12 pgTAP assertions
- `packages/db/supabase/tests/append_only.test.sql` - 44 pgTAP assertions
- `packages/db/supabase/tests/manage_booking_mutation.test.sql` - 29 pgTAP assertions

## Decisions Made

- The dispatcher-vs-admin half of F-02 (removing `settings_versions` from the working-set CRUD grant, adding the admin-only restrictive insert policy) is deliberately NOT done here -- it lands in Plan 02-08's `...23_rls_staff.sql`, per the plan's own `<deferred>` scoping (no RLS policy migration exists before `...20`).
- F-10's second half (stripping pre-redaction PII out of `audit_log`'s `to_jsonb(old)`/`to_jsonb(new)` copies for `customers`) is deliberately NOT done here -- it needs counsel's sign-off (a legal decision, not a schema decision) and is explicitly flagged for Phase 10 in the plan's `<deferred>` block.
- `append_only.test.sql`'s F-02 immutability assertions reuse a settings_versions fixture row distinct from the one referenced by the price-snapshot fixtures, so the two concerns (append-only proof vs. policy-provenance realism) don't couple.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `tg_audit_row` compared `TG_OP` to lowercase literals, so `before_value`/`after_value` were always NULL**
- **Found during:** Task 1, first run of `audit_trigger.test.sql`
- **Issue:** The schema draft's own `case when tg_op in ('update','delete') then to_jsonb(old) end` / `case when tg_op in ('insert','update') then to_jsonb(new) end` compares `TG_OP` to lowercase strings, but PL/pgSQL's `TG_OP` is always uppercase (`'INSERT'`/`'UPDATE'`/`'DELETE'`) -- confirmed against the same draft's own `tg_append_only`, which correctly uses `tg_op = 'UPDATE'`. Left as drafted, every audit row would have both diff columns NULL on every table, defeating the entire point of a diff log and the D-19 redaction-evidence claim.
- **Fix:** Compared against `'UPDATE'`/`'DELETE'`/`'INSERT'` instead.
- **Files modified:** `packages/db/supabase/migrations/20260823000017_audit_log.sql`
- **Verification:** `audit_trigger.test.sql` assertions (4), (8), (9) directly check `after_value`/`before_value` are non-null where expected.
- **Committed in:** `60f2bf3`

**2. [Rule 1 - Bug] `tg_append_only`'s two carve-out guards crashed with 42703 when the shared trigger fired on a table lacking the OTHER carve-out's column**
- **Found during:** Task 2, first run of `append_only.test.sql`
- **Issue:** A naive single-expression guard per carve-out (`if tg_op = 'UPDATE' and tg_table_name = 'price_snapshots' and old.booking_id is null ... then` immediately followed by the `consent_log`/`customer_id` equivalent) raised `42703 record "old" has no field "customer_id"` (or `"booking_id"`) the moment the function fired on ANY of the seven attached tables, regardless of the `tg_table_name` guard placed earlier in the same `AND` chain. PL/pgSQL resolves every `OLD`/`NEW` record-field reference appearing anywhere in an expression by fetching its value BEFORE the combined boolean expression is handed to the SQL executor -- so the SQL-level short-circuit the table-name check appears to promise never protects the later field reference. This is empirically confirmed, not merely theoretical, and would have been equally present in the ORIGINAL single-carve-out draft (`price_snapshot_legs`/`audit_log` also lack a `booking_id` column).
- **Fix:** Restructured as nested `IF ... ELSIF` branches -- the table-name check is now its own outer PL/pgSQL statement, evaluated and dispatched BEFORE the field-referencing condition is ever reached, so a record field is only touched once execution has already entered that table's own branch.
- **Files modified:** `packages/db/supabase/migrations/20260823000019_append_only.sql`
- **Verification:** All 14 tables in `append_only.test.sql`'s section A (update/delete on all seven tables) pass; the trigger also correctly falls through to the raise on a `BEFORE TRUNCATE` statement trigger, where `OLD`/`NEW` are unbound.
- **Committed in:** `89c8cc1`

**3. [Rule 1 - Bug] `price_snapshots`' carve-out comparison always disagreed on the STORED generated column `is_chargeable`**
- **Found during:** Task 2, debugging assertion (B2) in `append_only.test.sql`
- **Issue:** Postgres does not populate a STORED GENERATED column's value in `NEW` during a `BEFORE ROW UPDATE` trigger -- it reads `NULL` there and is recomputed by the executor only after the trigger chain returns. So even a single-column, otherwise-legal carve-out bind (`booking_id` alone) failed the `to_jsonb(new) - 'booking_id' = to_jsonb(old) - 'booking_id'` equality check every time, since `NEW.is_chargeable` was `NULL` while `OLD.is_chargeable` held the real stored value. Diagnosed empirically by diffing `to_jsonb(new)`/`to_jsonb(old)` key-by-key inside a scratch trigger.
- **Fix:** `new.is_chargeable := old.is_chargeable;` immediately before the comparison, inside the SAME function invocation (confirmed the same assignment made in an earlier, separate trigger does not survive being read by a later one). The final stored value is unaffected -- Postgres recomputes `is_chargeable` correctly from the real `total_rappen`/`rate_version_is_live` once the trigger returns, overwriting whatever this assignment set.
- **Files modified:** `packages/db/supabase/migrations/20260823000019_append_only.sql`
- **Verification:** Confirmed via raw `psql` that the bind succeeds, `is_chargeable` reads back `true` (correctly recomputed) after commit, and a reverse mutation still raises; `append_only.test.sql` (B1)-(B3) all pass.
- **Committed in:** `89c8cc1`

**4. [Rule 1 - Bug] `audit_trigger.test.sql`'s trigger-count assertion collided with `audit_log`'s own append-only triggers**
- **Found during:** Task 2, `pnpm db:test` after `...19_append_only.sql` landed
- **Issue:** Task 1's assertion `count(*) from pg_trigger where tgname like 'audit\_%'` correctly read 15 when only migration 017 existed, but `...19_append_only.sql` legitimately attaches `audit_log_append_only` and `audit_log_no_truncate` to the table literally named `audit_log` -- both names also start with `"audit_"`, since the append-only naming convention is `<table>_append_only`. The name-prefix LIKE pattern cannot distinguish "attached to `tg_audit_row`" from "the table happens to be named `audit_log`", pushing the count to 17 and breaking the full-suite gate.
- **Fix:** Filtered by the trigger's own function instead: `tgfoid = 'public.tg_audit_row()'::regprocedure`, which proves the intended claim regardless of table naming.
- **Files modified:** `packages/db/supabase/tests/audit_trigger.test.sql`
- **Verification:** `docker exec ... select count(*) from pg_trigger where tgfoid = 'public.tg_audit_row()'::regprocedure and not tgisinternal` returns `15`; full suite green.
- **Committed in:** `89c8cc1`

**5. [Rule 1 - Bug] `manage_booking_cancel`'s `booking_events.booking_leg_id` was hard-coded `NULL` regardless of `p_leg_seq`**
- **Found during:** Task 3, designing `manage_booking_mutation.test.sql`'s assertion that a single-leg cancel's event row carries the cancelled leg's id
- **Issue:** `...012_booking_access_tokens.sql` (Plan 02-05) inserted `booking_events` with a literal `null` for `booking_leg_id` in every case, including a `p_leg_seq`-scoped single-leg cancel -- contradicting the same table family's own documented convention (`price_snapshot_legs`/`booking_refunds`' sibling columns: "null = whole booking") and discarding exactly the fact `booking_leg_id` exists to carry.
- **Fix:** Added `v_leg_id uuid` and a lookup (`select l.id into v_leg_id from booking_legs l where l.booking_id = v.id and l.leg_seq = p_leg_seq`) run only when `p_leg_seq is not null`; the insert now uses `v_leg_id` instead of a literal `null`.
- **Files modified:** `packages/db/supabase/migrations/20260823000012_booking_access_tokens.sql`
- **Verification:** `manage_booking_mutation.test.sql` assertion (4i) checks the event's `booking_leg_id` equals leg 2's actual id.
- **Committed in:** `a3c8840`

**6. [Rule 1 - Bug] Two bare `booking_id` references in `manage_booking_cancel` were ambiguous against the function's own OUT parameter**
- **Found during:** Task 3, first real invocation of `manage_booking_cancel` (via `manage_booking_mutation.test.sql`)
- **Issue:** `returns table (booking_id uuid, refund_percent numeric)` makes `booking_id` a bare identifier visible inside the function body. Two single-table statements (the leg-cancelling `UPDATE public.booking_legs set status = ... where booking_id = v.id` and the roll-up `SELECT ... FROM public.booking_legs WHERE booking_id = v.id`) referenced `booking_id` unqualified, raising `42702 column reference "booking_id" is ambiguous` the first time the function actually ran -- this was never triggered before, since Plan 02-05's own test explicitly never called this function.
- **Fix:** Added a `bl` table alias to both statements and qualified every column reference (`bl.booking_id`, `bl.status`, `bl.leg_seq`).
- **Files modified:** `packages/db/supabase/migrations/20260823000012_booking_access_tokens.sql`
- **Verification:** `manage_booking_mutation.test.sql` (4a)/(5a) `lives_ok` assertions pass; the leg-cancel and roll-up behavior is exercised by (4b)-(4d) and (5b)-(5c).
- **Committed in:** `a3c8840`

**7. [Rule 1 - Bug] The status roll-up's `CASE` expression needed both an explicit cast and schema-qualification**
- **Found during:** Task 3, same invocation as #6, immediately after fixing it
- **Issue:** `update public.bookings set status = case when ... then 'cancelled' when ... then 'partially_completed' else 'partially_cancelled' end where id = v.id` raised `42804 column "status" is of type public.booking_status but expression is of type text` -- a `CASE` expression whose branches are all string literals resolves to `text` with no further context, and Postgres does not implicitly cast a computed `text` expression to an enum column on `UPDATE` (only a direct, unparenthesised literal gets that treatment). Adding `::booking_status` then raised `42704 type "booking_status" does not exist`, because this function runs `set search_path = ''` (binding note 2) and, unlike always-searched `pg_catalog` builtins, a project-defined enum only resolves via its full schema qualification.
- **Fix:** `(case ... end)::public.booking_status`.
- **Files modified:** `packages/db/supabase/migrations/20260823000012_booking_access_tokens.sql`
- **Verification:** `manage_booking_mutation.test.sql` (4d)/(5b) assert `bookings.status` reads back correctly.
- **Committed in:** `a3c8840`

---

**Total deviations:** 7 auto-fixed, all Rule 1 (bug fixes). Six were latent bugs in already-committed code (Plans 02-05 and 02-03's schema draft) that this plan's tests were the first to actually exercise; one (#4) was a test-assertion fragility this plan's own new migration exposed.
**Impact on plan:** Every fix was necessary for the migration set to apply and the full test suite to pass; none changes the intended schema shape, grants, or security posture -- each closes a gap between documented intent (D-16/D-17/D-18/F-02/F-09's own comments) and what the code actually did. No scope creep beyond what each task's own acceptance criteria required.

## Issues Encountered

None beyond the seven deviations above, all diagnosed and fixed inline during each task's per-file authoring loop before committing.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- `pnpm db:reset && pnpm db:test` green: `Files=15, Tests=321, PASS`; 19 migrations apply clean from zero; 29 tables in `public` (matches this plan's stated verification target).
- TRUNCATE denial proven for `service_role` on every evidence table, and for `postgres` (table owner) via the trigger layer where the grant no longer bites.
- The consent redaction carve-out (`customer_id -> NULL`) proven to work in isolation while every other `consent_log` UPDATE/DELETE still raises.
- Plan 02-08 can now: (a) remove `settings_versions` from the dispatcher working-set CRUD grant and add its admin-only restrictive INSERT policy (F-02's remaining half); (b) write RLS policies over `booking_events`/`audit_log`/`consent_log` knowing the grant layer already fails closed for every client-facing role; (c) grant `vamos_staff` SELECT-only on the ledger tables.
- Phase 10 has both the `consent_log` erasure carve-out (usable now) and an explicit, scoped-out flag for the `audit_log` pre-redaction-PII half, which needs counsel's sign-off before a routine is written against it.
- No blockers.

---
*Phase: 02-data-schema-rls-staff-auth-foundations*
*Completed: 2026-08-24*

## Self-Check: PASSED

All 9 created/modified files verified present on disk; all 3 task commits (`60f2bf3`, `89c8cc1`, `a3c8840`) verified present in `git log`.
