# Adversarial findings triage — 2026-08-23

Triaged against all ten `02-0N-PLAN.md` files (not just the schema draft), `02-CONTEXT.md`
D-01…D-38, and ADR-014. `02-08-PLAN.md` was read twice — once mid-pass, once last, per
instruction, because another agent was concurrently adding staff-write-denial pgTAP assertions to
it. **It did change between the two reads**: `ops_role_rls.test.sql`'s description gained a
`staff_admin_write` proof (`insert into staff` denied for a dispatcher / `lives_ok` for an admin,
`update staff set active = false` denied), and the acceptance criteria gained two matching `grep`
counts. That addition is unrelated to every finding below — it proves `staff_admin_write`, not the
`…23_rls_staff.sql` working-set/ledger revoke arrays (F-05), the `booking_access_tokens` grant
(F-08), the `settings_versions` working-set membership (F-02) or the `_admin_update` dead policy
(F-18) — so none of my conclusions rest on text that could still move.

None of the plans' own pgTAP suites, as specified, would catch most of the findings below, because
the plans copy the draft's defective DDL "verbatim" by explicit instruction in the same breath that
they copy its correct DDL — the review pass folded into the draft (ADR-014, D-29, D-35/D-36,
the `settings_versions` column additions, `staff_admin_write`, the ledger SELECT-only fix) did not
re-run against the newer adversarial review, because the adversarial review is dated *after* all
ten plans.

## Summary

| Status | Count | Findings |
|---|---|---|
| ALREADY-CLOSED | 1 | F-15 |
| NEEDS-PLAN-EDIT | 20 | F-01, F-02, F-03, F-04, F-05, F-06, F-07, F-08, F-09, F-10, F-11, F-12, F-13, F-16, F-17, F-18, F-19, F-20, F-21, F-22 |
| DRAFT-ONLY | 0 | — |
| DISPUTED | 1 | F-14 |

Every plan copies the draft "verbatim" by design (that is how ADR-014's corrections landed —
D-35/D-36 are explicit deviations called out in the plan prose). Where the adversarial review
found a defect that no D-decision in `02-CONTEXT.md` happens to correct, the plan inherits it
unchanged. F-15 is the one finding a D-decision (D-35/D-36) already fully closes. F-14 is disputed
on scope, not on fact.

## Must fix before execution

Ordered by the plan/wave that must carry the fix, then by how directly it breaks a Phase 2
success criterion. Nothing has executed yet (`supabase/migrations` holds only the two empty
baseline files D-38 already schedules for deletion), so "before execution" means: land the edit in
the `02-0N-PLAN.md` prose (or brief the executor as a deviation) before that plan's wave runs.

1. **F-05 · Plan 02-08 Task 2, `…23_rls_staff.sql`** — protects **success criterion 1** ("a
   customer's query returns only their own bookings") and DATA-02 outright. The working-set DO
   block's per-table revoke — `revoke all on public.%I from anon, authenticated, vamos_edge,
   vamos_public` — runs over a 19-table array that includes `bookings`, `booking_legs` and
   `customers`; the ledger DO block's revoke — `... vamos_edge, vamos_public, vamos_staff` — runs
   over a 7-table array that includes `price_snapshots`, `price_snapshot_legs`. All five are
   exactly the tables `…21_rls_customer.sql` (Task 1, same plan) grants to `authenticated`. After
   `…23` runs, `authenticated` holds **no** grant on any of the five and every signed-in customer
   query raises `42501` — the plan's own `bookings_customer_rls.test.sql` (written in Task 1) is
   re-run against the full stack by Task 2's `pnpm db:test` and would fail on this. **Edit:** drop
   `authenticated` from both revoke lines (`from anon, vamos_edge, vamos_public` and `from anon,
   vamos_edge, vamos_public, vamos_staff`) — the `…21` baseline `revoke all on all tables in schema
   public from anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public` already
   fail-closes everything at the start of the wave, so removing `authenticated` from these two
   per-table loops is safe for the 14+5 other tables (no-op — they never had an `authenticated`
   grant) and load-bearing for the 5 that do.

2. **F-01 · Plan 02-08 Task 1 (`…21_rls_customer.sql`) and Task 2 (`…22_rls_guest.sql`)** —
   `grant select on public.bookings, public.booking_legs, ...` is table-wide to both
   `authenticated` and `vamos_guest`, so `bookings.note`/`booking_legs.note` (the dispatcher-only
   field — `app/ops/OpsDetail.dc.html:139` labels it "Dispatcher note … visible to dispatch only")
   reaches every customer and every emailed-manage-link holder. `customers.note` is correctly
   column-scoped out one paragraph earlier in the same task; `bookings`/`booking_legs` are not.
   **Edit:** column-scope both grants (Plan 02-05's schema has a single `note` column with no
   customer-facing counterpart, so no schema change is needed — just exclude `note` from the
   column list in both `…21` and `…22`).

3. **F-03 · Plan 02-07 Task 2, `…19_append_only.sql`** — protects the "append-only" claim behind
   DATA-08 and the phase's own evidence-tamper threat register row (T-02-08). `tg_append_only` is
   `before update or delete … for each row`; `TRUNCATE` never fires a row trigger in Postgres (and
   RLS, including `FORCE`, does not apply to `TRUNCATE` at all — both well-documented, not disputed
   here). The plan's revoke line — `revoke update, delete on <the six> from anon, authenticated,
   vamos_guest, vamos_staff, vamos_edge, vamos_public, service_role` — never mentions `truncate`,
   so `service_role` (Supabase's default-privilege bootstrap grants it `ALL` including `TRUNCATE`
   on every table) can erase the whole evidence set in one statement with no trigger firing.
   **Edit:** extend the same line to `revoke update, delete, truncate on <the six>, public.settings_versions,
   public.stripe_events, public.booking_notifications from ... service_role`.

4. **F-02 · Plan 02-07 Task 2 (`…19_append_only.sql`) + Plan 02-08 Task 2 (`…23_rls_staff.sql`)**
   — `settings_versions` is documented immutable (Plan 02-03: "an immutable dated history") but is
   a member of `…23`'s 19-table working-set array, which grants `vamos_staff` (any dispatcher, not
   just admin) `select, insert, update, delete` gated only by `app.is_staff()`, and is absent from
   `…19`'s six-table append-only set (D-18's truth explicitly lists six tables; `settings_versions`
   is not one of them). A dispatcher session can rewrite the cancellation tiers a booking's
   `price_snapshots.settings_version_id` points at, after the fact. **Edit:** remove
   `settings_versions` from `…23`'s working-set array; add it to `…19`'s append-only set (trigger +
   revoke + force RLS) with an admin-only restrictive `for insert` policy in `…23`, mirroring
   `rate_versions_admin_write`.

5. **F-04 · Plan 02-04 Task 1, `…08_rate_versions.sql`** — protects QUOTE-10's "cannot go live
   half-priced" claim, which the phase's own objective calls a trigger, not a checklist.
   `tg_rate_version_transition` is `before update` only; the only insert-time guard is the CHECK
   `status = 'draft' or published_at is not null`, satisfied by supplying `published_at`. An
   `insert into rate_versions (status, published_at, published_by) values ('live', now(), <uid>)`
   skips the completeness gate entirely. **Edit:** add a `before insert` trigger that forces
   `status = 'draft'` and nulls `published_at`/`published_by` on insert (reviewer's
   `tg_rate_version_insert_draft`, ~8 lines).

6. **F-12 · same file, same task** — compounds (5): `tg_pricing_row_frozen` is `before update or
   delete` only on `distance_rates`/`fixed_routes`/`surcharges`, so a priced row can be `INSERT`ed
   straight into a `live` version, bypassing the freeze the trigger otherwise enforces. **Edit:**
   three more `before insert` triggers reusing `tg_pricing_row_frozen` (its existing `tg_op =
   'UPDATE'` guard already makes an INSERT against a non-draft version fall through to the raise).

7. **F-08 · Plan 02-08 Task 2, `…23_rls_staff.sql`** — `booking_access_tokens` is in the same
   19-table working-set array, so every dispatcher gets table-wide `select` including `token_hash`
   — the bearer credential itself, not a verifier. **Edit:** remove `booking_access_tokens` from the
   generic array; grant `vamos_staff` a column-scoped `select (id, booking_id, purpose, created_at,
   expires_at, revoked_at, last_used_at, use_count)` plus `update (revoked_at)` only.

8. **F-06 · Plan 02-06 Task 2, `…14_payments_refunds.sql`** — `tg_payment_matches_snapshot` never
   checks `new.snapshot_id = bookings.price_snapshot_id`, and nothing stops two
   `status='succeeded'` payment rows on one booking. Both are within this phase's own "DB-level
   charge gate" deliverable. **Edit:** add the binding check inside the trigger, plus
   `create unique index booking_payments_one_success on booking_payments (booking_id) where status
   = 'succeeded'` and `create unique index price_snapshots_one_per_booking on price_snapshots
   (booking_id) where booking_id is not null`.

9. **F-07 · Plan 02-06 Task 2, `…15_coupon_redemptions.sql`** — `coupons.global_limit`/
   `per_user_limit` have a `>= 0` CHECK and nothing else; `coupon_redemptions` only unique-constrains
   `(coupon_id, booking_id)`. Two concurrent redemptions both succeed under READ COMMITTED.
   **Edit:** `tg_coupon_redemption_caps` — `select … from coupons where id = new.coupon_id for
   update` as the lock point, then count against both limits, `before insert on
   coupon_redemptions`.

10. **F-11 · Plan 02-06 (`stripe_events` table) + Plan 02-08 Task 2 (`…23` ledger loop) + Plan
    02-07 Task 2 (`…19` revoke line)** — the ledger loop's blanket `grant select` puts raw Stripe
    `payload` (cardholder name, billing address, email, card brand/last-four) in front of every
    dispatcher, and `service_role` keeps plain `DELETE` on `stripe_events` (the exact
    idempotency-drop replay attack the draft's own §14e prose warns about). **Edit:** column-scope
    `stripe_events`'s staff grant to exclude `payload`, add an admin-only restrictive `select`
    overlay for it; extend F-03's `service_role` revoke line to cover `stripe_events`,
    `booking_notifications` `delete` too (already folded into item 3's edit above).

11. **F-13 · Plan 02-02 Task 1, `…02_roles_and_helpers.sql`** — the three `alter default
    privileges … revoke all on {tables|sequences|functions} from vamos_edge, vamos_public, anon,
    authenticated` statements are a no-op for the case they claim to cover (Postgres grants new
    functions' `EXECUTE` to `PUBLIC`, not to named roles, and revoking from a role never touches
    the `PUBLIC` grant); there is no `alter default privileges in schema app` at all, and `CREATE`
    on schema `public` is never revoked. Not exploitable today (every SQL-callable function is
    individually revoked from `public` elsewhere), but the invariant a later migration will rely on
    doesn't exist. **Edit:** add `alter default privileges in schema public revoke execute on
    functions from public`, the schema-`app` equivalents, and `revoke create on schema public from
    public, anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public`.

12. **F-09 · Plan 02-05 Task 3, `…12_booking_access_tokens.sql`** — `manage_booking_cancel` ships
    live to `vamos_guest` in this phase with no cancellation-window check at all; a guest can
    cancel a leg after the driver is already at the kerb, silently freeing an assignment Phase 8
    believes is held. **Minimal edit now:** add the past-pickup guard (`raise 'not_cancellable'
    P0001` when `scheduled_at <= now()`) — cheap, self-contained. The full
    policy-derived-`refund_percent` read can stay Phase 9 work as the docstring already says, but
    the docstring's claim that it *already* reads the snapshot's policy is false and should be
    corrected to say so explicitly rather than silently promising more than the body does.

None of items 1–12 requires a schema redesign; each is a bounded addition to a trigger function,
a grant line, or a policy already being authored in that task. Items 13 onward (F-16, F-17, F-18,
F-19, F-20, F-21, F-22) are low-severity and cheap — see the full table — and can ride along in the
same tasks that already touch the relevant files, but do not block the wave on their own.

## Full triage

| ID | Sev | Status | Plan/Task | Evidence | Required edit (if any) |
|---|---|---|---|---|---|
| F-01 | high | NEEDS-PLAN-EDIT | 02-08 T1 (`…21`) + T2 (`…22`) | `grant select on public.bookings, public.booking_legs, ... to authenticated` / `to vamos_guest` is table-wide; no column list excludes `note`, unlike the adjacent `customers` grant | Column-scope both grants to exclude `note` (see "Must fix" #2) |
| F-02 | high | NEEDS-PLAN-EDIT | 02-07 T2 (`…19`) + 02-08 T2 (`…23`) | `settings_versions` is in the 19-table working-set array (full CRUD to any dispatcher); D-18's six-table append-only list excludes it; no admin-only overlay exists for it (only `rate_versions`/`staff` get one) | Move to the append-only set + admin-only insert policy (see "Must fix" #4) |
| F-03 | high | NEEDS-PLAN-EDIT | 02-07 T2 (`…19`) | Revoke line lists `update, delete`, never `truncate`; trigger is row-level (`for each row`), which Postgres never fires on `TRUNCATE`; RLS/FORCE RLS does not filter `TRUNCATE` | Add `truncate` to the `service_role` revoke (see "Must fix" #3) |
| F-04 | high | NEEDS-PLAN-EDIT | 02-04 T1 (`…08`) | `tg_rate_version_transition` is `before update` only, verbatim from draft; no insert-time gate beyond the `published_at is not null` CHECK | Add `tg_rate_version_insert_draft` before-insert trigger (see "Must fix" #5) |
| F-05 | medium (treated as critical — breaks success criterion 1) | NEEDS-PLAN-EDIT | 02-08 T2 (`…23`) | Working-set (19 tables) and ledger (7 tables) revoke arrays both include `authenticated`/tables `…21`/`…22` granted it; confirmed by counting the draft's §14c array (19 names) against the plan's literal "19 tables" phrasing — same array, not narrowed | Drop `authenticated` from both revoke lines (see "Must fix" #1) |
| F-06 | medium | NEEDS-PLAN-EDIT | 02-06 T2 (`…14`) | `tg_payment_matches_snapshot` verbatim — four of five draft checks, no `new.snapshot_id = bookings.price_snapshot_id` check, no unique index guarding one successful payment per booking | Add binding check + two unique indexes (see "Must fix" #8) |
| F-07 | medium | NEEDS-PLAN-EDIT | 02-06 T2 (`…15`) | `coupon_redemptions` unchanged except D-29's `payment_id` FK; `unique (coupon_id, booking_id)` is not a cap; no trigger reads `global_limit`/`per_user_limit` | Add `tg_coupon_redemption_caps` (see "Must fix" #9) |
| F-08 | medium | NEEDS-PLAN-EDIT | 02-08 T2 (`…23`) | `booking_access_tokens` is in the 19-table working-set array → table-wide `select` to `vamos_staff` includes `token_hash` | Column-scope the grant (see "Must fix" #7) |
| F-09 | medium | NEEDS-PLAN-EDIT | 02-05 T3 (`…12`) | `manage_booking_cancel` body is "verbatim from draft §8"; no `scheduled_at`/policy read anywhere in the plan's action text | Add past-pickup guard now; correct the docstring (see "Must fix" #12) |
| F-10 | medium | NEEDS-PLAN-EDIT (Phase 10 scoped, not a Phase 2 blocker) | 02-07 T2 (`…19`) | The carve-out inside `tg_append_only` only handles `price_snapshots.booking_id` NULL→non-NULL; no `consent_log.customer_id → NULL` carve-out exists; `tg_audit_row` on `customers` copies `to_jsonb(old)`/`to_jsonb(new)` whole with no redaction path | D-19 explicitly scopes the erasure *routine* to Phase 10, so this is not a Phase 2 execution blocker — but the fix is a ~5-line extension of the *existing* carve-out pattern, cheap enough to land now rather than as a future migration that has to re-open `…19`. Recommend adding it in `…19` while the file is open; flag both halves explicitly for Phase 10 either way |
| F-11 | medium | NEEDS-PLAN-EDIT | 02-06 (table) + 02-08 T2 (`…23` grant) + 02-07 T2 (`…19` revoke) | Ledger loop's blanket `grant select` includes `stripe_events.payload`; no `service_role` `delete` revoke on `stripe_events`/`booking_notifications` anywhere in the plan set | Column-scope + extend the revoke (see "Must fix" #10) |
| F-12 | medium | NEEDS-PLAN-EDIT | 02-04 T1 (`…08`) | `tg_pricing_row_frozen` triggers are "before update or delete" only, verbatim; acceptance criteria explicitly count `4` triggers (transition + 3 frozen), not 7 | Add 3 before-insert triggers (see "Must fix" #6) |
| F-13 | medium | NEEDS-PLAN-EDIT | 02-02 T1 (`…02`) | Default-privilege statements copied verbatim from draft §2; plan text confirms no `schema app` default-privilege statement and no `CREATE`-on-`public` revoke | Add the four missing statements (see "Must fix" #11) |
| F-14 | medium | DISPUTED | 02-06 T2 (`…14`) | Plan explicitly keeps `charged_currency = 'CHF'` CHECK and adds a comment scoping the FX/multi-currency column to Phase 7 ("Phase 7's column to add if needed") | See Disputed section — no Phase 2 edit; flag for the Phase 7 plan-checker instead |
| F-15 | medium | ALREADY-CLOSED | 02-03 T1 (`…04`, columns) + 02-09 T1 (seed) | `settings_versions` gains `round_trip_discount_percent`, `night_window_start/end/tz`, `manage_link_validity_days`, `quote_lock_minutes`, `checkout_window_minutes` (Plan 02-03, D-35 applied to schema); seed writes `60`/`15`/`180`/`30 days`/`10 %`/`20:00–06:00`, 3 vehicle classes with no `first` (Plan 02-09, D-35/D-36 applied to seed, with ~15 pgTAP assertions in `seed_idempotent.test.sql`) | none |
| F-16 | low | NEEDS-PLAN-EDIT | 02-05 T1 (`…10`) | `grant execute … to service_role` only; test explicitly asserts `42501` for `vamos_staff` too — yet Plan 02-08 grants `vamos_staff` `INSERT` on `bookings`, whose `reference` DEFAULT calls this function as the inserting role | `grant execute … to service_role, vamos_staff;` and drop `vamos_staff` from the test's 42501 list |
| F-17 | low | NEEDS-PLAN-EDIT | 02-02 T1 (`…03`) | `create domain rappen as integer;` verbatim, no CHECK; `bookings.price_total_rappen` (Plan 02-05) has no column-level check either | `create domain rappen as integer check (value >= 0);` (closes both at once) |
| F-18 | low | NEEDS-PLAN-EDIT | 02-08 T2 (`…23`) | `_admin_update`'s `exists (select 1 from rate_versions rv where ...)` subquery runs as `vamos_staff`, which `rate_versions_admin_write` (restrictive FOR ALL) hides from every dispatcher — the EXISTS is always false, the policy collapses to `is_admin()`; fails closed, so low severity, but the comment claiming a dispatcher carve-out is misleading | Replace the inline subquery with a `SECURITY DEFINER` helper `app.rate_version_published(bigint)` (reviewer's fix) |
| F-19 | low | NEEDS-PLAN-EDIT | 02-03 T2 (`…06`) | Hook sets `app_metadata.vamos_role` only `if v_role is not null`; plan's own test asserts "no staff row → claims unchanged" — i.e. an attacker-supplied `vamos_role` in the input JWT survives untouched when no `staff` row exists (defense-in-depth gap only; `app.is_staff()` still re-checks the `staff` row, so no live escalation today) | Strip `app_metadata.vamos_role` unconditionally before conditionally re-adding it; update the test to check stripping, not pass-through |
| F-20 | low | NEEDS-PLAN-EDIT | 02-04 (`tg_pricing_row_frozen`, `tg_rate_version_transition`), 02-05 (`tg_leg_snapshot_buffer`), 02-06 (`tg_snapshot_rate_version_flag`, `tg_payment_matches_snapshot`, `tg_payment_update_whitelist`), 02-07 (`tg_append_only`) | All six copied "verbatim"/"exactly as drafted" with no plan text adding `set search_path = ''`; every other function in the file pins it (the file's own stated convention) | Add `set search_path = ''` to each of the six function signatures |
| F-21 | low | NEEDS-PLAN-EDIT | 02-02 T1 (`…02`) | No plan text documents that holding the `vamos_edge` password ≡ full admin impersonation (via `SET ROLE` into `vamos_staff` + a forged `request.jwt.claims`) | Add the comment near the `vamos_edge` membership grants; add a line to the Phase 3/9 secrets matrix in `docs/build/GSD-LAUNCH.md` |
| F-22 | low | NEEDS-PLAN-EDIT | 02-07 T2 (`…19`) | `audit_log`/`consent_log` get `force row level security` with zero INSERT policy for any role; the plan never asserts or documents the `postgres`-role `BYPASSRLS` dependency that makes the definer-function write paths work | Add a `force_rls_write_paths.test.sql`-style assertion (see Recommended pgTAP additions) rather than a redundant policy |

## Disputed findings

### F-14 — `charged_currency = 'CHF'` vs ADR-014 §1

The reviewer is factually right that the schema's `check (charged_currency = 'CHF')` cannot accept
a EUR/USD/AED settlement, and that ADR-014 §1 says Stripe eventually charges in the customer's
chosen currency. I dispute that this is a **Phase 2** defect rather than a **Phase 7** one, on
three grounds:

1. Plan 02-06 Task 2's action text explicitly keeps the CHF-only CHECK and adds a code comment —
   "ADR-014 §1 lets Stripe charge in the customer's chosen currency via FX — the locked amount and
   this row stay CHF rappen; the Stripe-side presentment currency is Phase 7's column to add if
   needed" — so this is a documented, deliberate scoping decision, not an oversight the plan is
   unaware of.
2. Phase 2 never allows a real charge to happen: D-34 keeps every priced column NULL-seeded, no
   `rate_versions` row is ever seeded `live`, and the charge gate (`tg_payment_matches_snapshot`)
   refuses every insert in a fresh environment "by data, not by a UI conditional" (the draft's own
   phrase, reproduced in every plan's seed task). `booking_payments` cannot receive a non-CHF row
   in Phase 2 under any test the plan set writes, so the CHECK is not reachable-and-wrong within
   this phase's scope.
3. ADR-014 §1 itself defers the mechanics — "Not decided here (Phase 7): exact Stripe Checkout vs
   PaymentElement wiring, how a mid-Checkout currency change maps onto the locked CHF total" — so
   the shape of the fix (a `chf_total_rappen`/`fx_rate` split, as the reviewer proposes, or
   something else Stripe's actual API shape suggests) is genuinely Phase 7's call, not Phase 2's.

This is not a "the reviewer is wrong" dispute — it is a "this is correctly out of scope for Phase
2, and the plan already leaves the breadcrumb Phase 7 needs" dispute. The risk the reviewer names
("the fix under time pressure is to relax the charge gate") is real and worth carrying forward: I
recommend the Phase 7 plan-checker be handed this finding explicitly rather than letting it
resurface as a surprise, but no `02-0N-PLAN.md` edit is warranted now.

## Recommended pgTAP additions

Of the reviewer's proposed assertion files, these are worth adding once the corresponding DDL
fix lands — listed against the plan whose test file should carry them:

- **`grant_matrix.test.sql`-style assertions (F-01, F-05, F-08, F-11)** — add to Plan 02-08's
  `fail_closed.test.sql` or a new file in the same task: `table_privs_are('public','bookings',
  'authenticated', array['SELECT'])` restricted to the non-`note` column set, and the equivalent
  for `booking_legs`, `stripe_events` (excluding `payload`), `booking_access_tokens` (excluding
  `token_hash`) — this is the regression test that would have caught F-05 and F-01 immediately once
  the array fix landed, and prevents both from silently reopening in a future migration.
- **`truncate_denied.test.sql` (F-03)** — add to Plan 02-07 Task 2 alongside `append_only.test.sql`:
  `throws_ok($$ set role service_role; truncate public.audit_log $$, '42501')` for each of the
  (now nine, once F-02/F-11 land) protected tables.
- **`settings_versions_immutable.test.sql` (F-02)** — add to Plan 02-07 Task 2, mirroring
  `append_only.test.sql` exactly (dispatcher UPDATE/DELETE raises, admin INSERT succeeds, non-admin
  INSERT raises).
- **`rate_version_publish.test.sql` additions (F-04, F-12)** — add to Plan 02-04 Task 2: the
  `insert ... status='live'` bypass attempt now raises `P0001`; a priced-row `INSERT` against a
  live version raises the freeze trigger.
- **`charge_gate.test.sql` additions (F-06)** — add to Plan 02-06 Task 2: a payment citing a
  snapshot that isn't `bookings.price_snapshot_id` raises; a second `succeeded` row on the same
  booking raises `23505`.
- **`coupon_caps.test.sql` (F-07)** — add to Plan 02-06 Task 2: two sessions racing a
  `global_limit = 1` / `per_user_limit = 1` coupon, one succeeds, one raises `restrict_violation`
  (pgTAP's single-connection model means this needs two explicit transactions inside one test file
  serialised on the `FOR UPDATE` lock, not true concurrency — enough to prove the lock exists).
- **`force_rls_write_paths.test.sql` (F-22)** — add to Plan 02-07 Task 2: as the definer owner
  under `FORCE RLS`, `record_consent()` and an audited `settings` update each write exactly one
  row, so a future re-owning of either function away from a `BYPASSRLS` role fails this test
  instead of silently breaking the cookie banner / audit trail.

Not worth adding as new files: the reviewer's `erasure.test.sql` and `policy_seed.test.sql` are
already effectively covered — `policy_seed.test.sql`'s assertions are what `seed_idempotent.test.sql`
(Plan 02-09) already does in full; `erasure.test.sql` is Phase 10 work (F-10 is deferred there) and
premature until the erasure routine itself exists.
