---
phase: 02-data-schema-rls-staff-auth-foundations
verified: 2026-08-24T16:55:32Z
status: passed
score: 5/5 success criteria; 6/6 requirements (AUTH-05 hosted hook activation owner-attested 2026-08-24, functional proof lands in Phase 6)
overrides_applied: 0
owner_attested:
  - item: "U15 — Custom Access Token Hook enabled on the hosted dashboard (project yaumjzvylngfjhtuffqs), 2026-08-24"
    attested_by: owner
    dashboard_path: "Authentication -> Hooks -> 'Customize Access Token (JWT) Claims hook' (the dashboard's name for the Custom Access Token Hook) -> Postgres function public.custom_access_token_hook"
    machine_verified: "The hook FUNCTION and its `grant execute ... to supabase_auth_admin` are confirmed live on the hosted project (migration 20260823000006 among 24/24 synced). The dashboard toggle itself has no read-only CLI or SQL surface: `supabase config` exposes only `push`, which would overwrite remote auth settings with local dev values, and the alternative proof would require creating a real auth user + staff row on the hosted project. Neither was run."
    residual_proof_point: "The first hosted staff sign-in in Phase 6 is the true functional proof that a minted JWT carries app_metadata.vamos_role. If that claim is absent there, re-check this toggle first."
    note: "MFA Verification Attempt / Password Verification Attempt hooks require a Team or Enterprise plan and are NOT used by this design — D-05 enforces aal2 in SQL policies, middleware and at invite-claim, so no paid hook is required."
superseded_human_verification:
  - test: "Enable the Custom Access Token Hook on the hosted Supabase dashboard (project yaumjzvylngfjhtuffqs) and confirm TOTP MFA is enabled for the project (D-33/U15)"
    expected: "Authentication -> Hooks (path may differ from docs -- Beta label implies drift) shows the Custom Access Token Hook enabled and pointed at public.custom_access_token_hook; a staff member who completes TOTP actually receives app_metadata.vamos_role in their minted JWT"
    why_human: "Owner-held dashboard and database credentials; no CLI/SQL surface can toggle this Beta dashboard setting. Plan 02-10 (the plan that owns this step) is autonomous:false and has not been executed -- no 02-10-SUMMARY.md exists and its ROADMAP checkbox is unticked."
---

# Phase 2: Data Schema, RLS & Staff Auth Foundations Verification Report

**Phase Goal:** Postgres holds the full `VamosOps`-mirrored schema with row-level security
enforced on every table, and staff can only reach it through an invited, MFA-verified session.
The versioned price/policy snapshot shape (Phase 4/9) and the driver double-booking exclusion
constraint (Phase 8) are designed into the schema here, not retrofitted.
**Verified:** 2026-08-24T16:55:32Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Method

All commands below were run live against the local Supabase stack (started fresh with
`pnpm db:start`), not copied from SUMMARY.md. Every SQL fact quoted (row counts, RLS coverage,
policy counts) was queried directly against the reset database with `docker exec
supabase_db_vamos-taxi psql`. Every "F-NN applied" claim was independently grepped against the
shipped migration files, not taken from the SUMMARY narrative.

```
pnpm db:start                    -> stack up
pnpm db:reset                    -> 24/24 migrations + seed apply clean from zero (twice, byte-identical row counts)
pnpm db:test                     -> Files=23, Tests=484, Result: PASS (re-run after the second reset, still PASS)
pnpm db:seed:check               -> "generate-seed --check: no drift."
pnpm db:types:check              -> clean diff, no drift
pnpm i18n:check                  -> "i18n:check passed — 1508 keys checked ... 0 problems"
pnpm typecheck                   -> apps/web typecheck: Done
```

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Every `VamosOps` table exists as a versioned migration with RLS on; a customer's query returns only their own bookings | VERIFIED | `select count(*) from pg_tables where schemaname='public'` = 29; `select count(*) from pg_tables t join pg_class c on ... where c.relrowsecurity=true` = 29 (all 29, zero without RLS). All 13 roadmap-named tables present (bookings, booking_events, customers, chauffeurs, vehicles, vehicle_classes, coupons, fixed_routes, distance_rates, surcharges, reviews, content_strings, settings) plus 16 forward-designed tables. `bookings_customer_rls.test.sql` (8/8 pass): customer A sees only A's bookings/legs/snapshots, zero of B's, and an authenticated session with no bound identity sees zero rows via a RESTRICTIVE policy (`bookings_require_identity`), not merely an unmatched permissive one. `customer_columns.test.sql` (10/10) and `fail_closed.test.sql` (43/43) prove the D-02 fail-closed baseline and F-01's column-scoping. |
| 2 | A guest can open a booking using a valid manage token and nothing else | VERIFIED | `bookings_manage_token_rls.test.sql` (13/13): valid hash returns exactly one booking; expired token, revoked token, and a hash matching no token all return zero rows; an unset GUC returns zero rows, never someone else's booking. `manage_token_shape.test.sql` (12/12) and `manage_booking_mutation.test.sql` (29/29) prove the D-15/D-16 shape end to end (atomic `FOR UPDATE` check-and-act, one `booking_events` row per mutation, F-09's past-pickup guard). |
| 3 | A staff query is authorized by a role claim in the JWT; a customer session cannot reach ops data | VERIFIED | `ops_role_rls.test.sql` (29/29): a dispatcher at `aal1` sees zero chauffeur/staff rows (assertions 2/4), the same dispatcher at `aal2` sees them; an inactive staff row sees zero rows even at `aal2`; `rate_versions`/`audit_log`/`staff` writes are admin-only (`staff_admin_write`, `rate_versions_admin_write` — both `AS RESTRICTIVE`). `ops_write_denied.test.sql` (13/13) proves the six/seven-table ledger is SELECT-only for staff. `fail_closed.test.sql` proves `authenticated`/`vamos_guest` sessions get `42501` on every ops table. |
| 4 | Seeding a fresh environment loads vehicle classes, settings, content strings and the existing reviews | VERIFIED | Local DB after `pnpm db:reset`: `vehicle_classes`=3 (economy 3/3, business 3/3, van 8/8, no `first`), `settings`=1, `settings_versions`=1, `content_strings`=1516, `reviews`=5, `service_zones`=8, `rate_versions`=1 (draft, not live), `distance_rates`=3, `surcharges`=8 — exact match to the hosted-project counts recorded in 02-09-SUMMARY.md's post-execution fix. Double `pnpm db:reset` produces byte-identical `pg_stat_user_tables` row counts (verified directly in this session, not merely asserted by the SUMMARY). `seed_idempotent.test.sql` (37/37) proves a second in-transaction `__seed_apply()` call changes zero rows. |
| 5 | A staff account can only be created by invitation and must complete a second factor before reaching ops data | VERIFIED (schema/local proof) — hosted activation open | `staff_admin_write` (restrictive `FOR ALL`, `using/with check ((select app.is_admin()))`) is the only write path into `public.staff`; no client role (`anon`/`authenticated`/`vamos_guest`) holds any grant on `staff` at all (D-02 baseline) — a staff row can only be created by an already-admin session or `service_role`, never self-service. `app.is_staff()`/`app.is_admin()` both require `coalesce(app.jwt()->>'aal','aal1') = 'aal2'` (customers_and_staff.sql:67,74) — fails closed to `aal1` when the claim is absent. `staff_hook_claim.test.sql` (18/18) proves the F-19-hardened hook strip/re-add; `ops_role_rls.test.sql` assertions (2)/(4)/(6) prove the `aal1`-vs-`aal2` and inactive-staff gates directly. **Open item:** the hosted Supabase Auth server's Custom Access Token Hook enablement (D-33/U15) is unconfirmed — Plan 02-10 (the owner-gated plan that closes this) has not executed (no `02-10-SUMMARY.md`, ROADMAP checkbox unticked). Without it, no staff member's hosted JWT would ever carry `app_metadata.vamos_role`, so the mechanism is proven correct but not yet live in production. See Human Verification below. |

**Score:** 5/5 truths structurally VERIFIED; 1 of them (Truth 5 / AUTH-05) carries an unresolved hosted-activation dependency that is honestly not yet observable, hence overall `status: human_needed` rather than `passed`.

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `packages/db/supabase/migrations/*.sql` (24 files) | Every VamosOps table + forward-designed shapes, RLS enabled everywhere | VERIFIED | `ls ...migrations/*.sql \| wc -l` = 24; `pnpm db:reset` applies all 24 clean from zero, twice, in this session |
| `packages/db/supabase/tests/*.sql` (23 files, pgTAP) | One file per DATA-0x claim per 02-CONTEXT.md | VERIFIED | `pnpm db:test` — Files=23, Tests=484, Result: PASS (re-confirmed twice in this session) |
| `packages/db/supabase/seed.sql` (generated) | Idempotent, nine seed targets, zero CHF literals | VERIFIED | 1760 lines, generated via `pnpm db:seed:gen`, `pnpm db:seed:check` reports no drift; every `*_rappen`/`percent` column confirmed `NULL` in every row (see Law 04 checks below) |
| `packages/db/seed/generate-seed.mjs` | Deterministic generator, `--check` drift mode | VERIFIED | 659 lines; reads `apps/web/i18n/messages/{en,de,fr,ar}.json` + `app/vamos-reviews.js`'s `SEED` via `vm.runInContext`; non-stub, exercised live by `pnpm db:seed:check` |
| `packages/db/database.types.ts` | Committed, drift-checked TS types | VERIFIED | 1904 lines, `pnpm db:types:check` clean diff |
| `packages/db/README.md` | Role-password procedure, migration numbering, hosted-push checklist | VERIFIED (content) / gap noted | 138 lines, substantive. The "Before the first hosted push" checklist still reads as pending/owner-gated for all three probes even though U1 and U3 were empirically resolved during 02-09's post-execution fix — see Documentation Drift below |
| `.github/workflows/{pr,deploy-staging,deploy-production}.yml` | Secret-free CI schema gate; gated hosted migration push | VERIFIED | `pr.yml`'s `database` job runs `db:start` -> `db:reset` -> `db:test` -> `db:seed:check` -> `db:types:check` with zero secrets, pinned `supabase/setup-cli@ab058987...` (v1.7.1) at version `2.115.0`. `deploy-staging.yml`/`deploy-production.yml` gate `supabase db push --include-seed` behind the three owner-held secrets. All three files pass `YAML.load_file` |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `authenticated` session | `public.bookings`/`booking_legs`/`price_snapshots` | RLS policy `bookings_select_own` + column-scoped GRANT | WIRED | Grant excludes `note`, `idempotency_key`, `quote_id`, `erased_at` (F-01); policy filters by `customer_id in (select ... where user_id = app.uid())`; proven by `bookings_customer_rls.test.sql` |
| `vamos_guest` session (manage token) | `public.bookings` (read) | `app.booking_has_manage_token()` SECURITY DEFINER helper, never inline subquery | WIRED | `bookings_manage_token_rls.test.sql` (13/13); `vamos_guest` holds zero grant on `booking_access_tokens` itself (D-16) |
| `vamos_guest` session (manage token) | `booking_legs.status` (cancel) | `public.manage_booking_cancel()` SECURITY DEFINER RPC, `FOR UPDATE` + state machine + `booking_events` write, one transaction | WIRED | `manage_booking_mutation.test.sql` (29/29); F-09 past-pickup guard confirmed at `...012:126,135-137,155` |
| `vamos_staff` session (`aal2`) | ops working-set (17 tables) + read-only ledger (6 tables) | column/table-scoped GRANT + `app.is_staff()`/`app.is_admin()` policies | WIRED | `ops_role_rls.test.sql` (29/29), `ops_write_denied.test.sql` (13/13); `authenticated` explicitly dropped from the per-table revoke arrays that would otherwise strip customer access (F-05, confirmed at `...23:65,89`) |
| `custom_access_token_hook` | `auth.users` JWT mint | `[auth.hook.custom_access_token]` in `config.toml`, local auth container | WIRED (local only) | `staff_hook_claim.test.sql` (18/18); **hosted equivalent unconfirmed** — see Truth 5 |
| `packages/db/package.json` scripts | hosted project `yaumjzvylngfjhtuffqs` | `pnpm db:link && pnpm db:push` (owner-held `SUPABASE_ACCESS_TOKEN`/`SUPABASE_DB_PASSWORD`) | WIRED (already exercised once) | 02-09-SUMMARY.md's post-execution fix documents a real `supabase db push --include-seed` against the hosted project succeeding after the Supavisor single-statement fix, with row counts confirmed via `supabase inspect db table-stats --linked`. This happened ad hoc during 02-09, not through the formal Plan 02-10 checkpoint — see Documentation Drift |

### Data-Flow Trace (Level 4)

Not applicable in the UI sense (no rendered component reads this data yet — that is Phase 3/4).
The equivalent check for a schema phase is "does the seed put real, non-empty, ADR-014-sourced
values into the tables the RLS layer serves reads from" — verified directly:

| Table | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `settings_versions` | 12 D-35/ADR-014 policy columns | `generate-seed.mjs` hard-coded ADR-014 §5 values | Yes — `free_cancel_hours=24`, `airport_waiting_minutes=60`, `city_waiting_minutes=15`, `min_advance_minutes=180`, `manage_link_validity_days=30`, `round_trip_discount_percent=10.00`, `night_window_start/end/tz='20:00'/'06:00'/'Europe/Zurich'`, `quote_lock_minutes=30`, `checkout_window_minutes=30` (all confirmed by direct query in this session) | FLOWING |
| `settings` | `chauffeur_turnaround_minutes`, `accepts_cash` | seed | Yes — `30`, `false` (confirmed by direct query) | FLOWING |
| `vehicle_classes` | `slug`, `passenger_capacity`, `luggage_capacity` | seed, D-36 | Yes — economy 3/3, business 3/3, van 8/8, no `first` row (confirmed by direct query) | FLOWING |
| `content_strings` | 1516 leaf keys x locale | `apps/web/i18n/messages/{en,de,fr,ar}.json` via `flatten()` | Yes — count matches i18n:check's own 1508 call-sites-worth of coverage (content_strings carries all leaf keys including ones with no call site yet) | FLOWING |
| `distance_rates`/`fixed_routes`/`surcharges`/`bookings`/`price_snapshots`/etc (every `*_rappen`/`percent` column) | priced amounts | D-34 owner blocker — deliberately NULL | Zero non-null rows confirmed directly for all 17 rappen/percent columns across 9 tables | STATIC (by design — Law 04) |

## Applied Adversarial Fixes (20 of 22 findings)

Per `research/adversarial-findings-triage.md`: 20 findings NEEDS-PLAN-EDIT, 1 ALREADY-CLOSED
(F-15, folded into D-35/D-36 before the triage ran), 1 DISPUTED/deferred to Phase 7 (F-14). All
20 applied findings were independently re-grepped against the shipped migrations in this
session — not read from the SUMMARY narrative.

| Finding | Fix | File:evidence | Status |
|---|---|---|---|
| F-01 | Column-scope `bookings`/`booking_legs` grants to `authenticated`/`vamos_guest`, excluding `note` | `...021_rls_customer.sql:27-46` (explicit column lists, `note`/`idempotency_key`/`quote_id`/`erased_at` absent) | PRESENT |
| F-02 | Move `settings_versions` into the append-only set + admin-only INSERT policy; remove from staff working-set array | `...019_append_only.sql:127,155,192`; `...023_rls_staff.sql:105-112` (`settings_versions_admin_write`) | PRESENT |
| F-03 | `revoke ... truncate` from `service_role` + 9 `BEFORE TRUNCATE` statement triggers | `...019_append_only.sql:132,151-157` | PRESENT |
| F-04 | `tg_rate_version_insert_draft` BEFORE INSERT trigger forcing `status='draft'` | `...008_rate_versions.sql:121-137` | PRESENT |
| F-05 | Drop `authenticated` from the `...23` working-set/ledger revoke arrays | `...023_rls_staff.sql:65,89` (`revoke all ... from anon, vamos_edge, vamos_public[, vamos_staff]` — no `authenticated`) | PRESENT |
| F-06 | Bind charge gate to `bookings.price_snapshot_id`; `booking_payments_one_success` partial unique index | `...014_payments_refunds.sql:92-94` (binding check), `:111` (unique index) | PRESENT |
| F-07 | `tg_coupon_redemption_caps` with `FOR UPDATE` lock | `...015_coupon_redemptions.sql:44-82` | PRESENT |
| F-08 | Column-scope `booking_access_tokens` grant to `vamos_staff`, excluding `token_hash` | `...023_rls_staff.sql:123-131` | PRESENT |
| F-09 | Past-pickup guard in `manage_booking_cancel` | `...012_booking_access_tokens.sql:126,135-137,155` (`raise exception 'not_cancellable' P0001`) | PRESENT |
| F-10 | `consent_log.customer_id -> NULL` erasure carve-out in `tg_append_only` | `...019_append_only.sql:87` (`elsif tg_op='UPDATE' and tg_table_name='consent_log'`), `:141` (`grant update (customer_id) ... to service_role`) | PRESENT |
| F-11 | Column-scope `stripe_events` (exclude `payload`); extend `service_role` revoke to `delete, truncate` | `...023_rls_staff.sql:138-145`; `...019_append_only.sql:178-180` | PRESENT |
| F-12 | 3x `BEFORE INSERT` freeze triggers on `distance_rates`/`fixed_routes`/`surcharges` | `...008_rate_versions.sql:274,276,278` | PRESENT |
| F-13 | `alter default privileges` for functions (public+app) and `revoke create on schema public` | `...002_roles_and_helpers.sql:108-129` | PRESENT |
| F-16 | Dual `EXECUTE` grant (`service_role, vamos_staff`) on `next_booking_reference()` | `...010_bookings.sql:69` | PRESENT |
| F-17 | `rappen` domain non-negativity CHECK | `...003_types.sql:65` (`create domain rappen as integer check (value >= 0)`) | PRESENT |
| F-18 | `app.rate_version_published(bigint)` SECURITY DEFINER helper replacing broken inline EXISTS | `...023_rls_staff.sql:40-47,184-192` | PRESENT |
| F-19 | Unconditional strip, then conditional re-add, of `app_metadata.vamos_role` in the hook | `...006_customers_and_staff.sql:168-177` | PRESENT |
| F-20 | `set search_path = ''` on the six/seven listed trigger functions | Confirmed individually on all seven: `...008:239,59`, `...011:140`, `...013:120`, `...014:47,125`, `...019:58` | PRESENT |
| F-21 | Document the `vamos_edge` password = full staff-impersonation trust assumption | `...002_roles_and_helpers.sql:90` + `docs/build/GSD-LAUNCH.md:252` | PRESENT |
| F-22 | pgTAP assertion of the `postgres`-role BYPASSRLS dependency for definer write paths | `packages/db/supabase/tests/append_only.test.sql:287,304-305` | PRESENT |

**No applied fix was found missing or weaker than intended.** F-15 (already closed pre-triage,
folded into D-35/D-36) and F-14 (disputed/deferred to Phase 7) are correctly excluded from the
20-count and correctly out of Phase 2's scope — F-14 now has a concrete resolution path recorded
in `07-CONTEXT.md` (additive FX columns via a Stripe Checkout Session), confirming the deferral
was honored rather than dropped.

## Uncertainties (U1/U2/U3/U4/U15/U28)

| ID | Question | Status | Evidence |
|---|---|---|---|
| U1 (D-25) | Can managed Supabase's `postgres` grant `authenticated` to `vamos_edge`? | **RESOLVED — permitted.** | Migration `...002_roles_and_helpers.sql` runs `grant authenticated to vamos_edge with inherit false, set true;` unconditionally (no fallback branch taken). 02-09-SUMMARY.md's post-execution fix documents all 24/24 migrations, including `...002`, applying cleanly to the hosted project `yaumjzvylngfjhtuffqs` via `supabase db push --include-seed` — a refusal at `...002` would have failed the push outright (the plan's own D-25 text: "a failure at ...02's grant IS the U1 answer"). No `vamos_customer` role exists locally (`select rolname from pg_roles where rolname like 'vamos%'` returns only the four designed roles); the fallback code path was never triggered. Only documentary comments referencing the fallback remain in `...002:81-82` and `...021:6-7` — correctly inert, not dead code that executes. |
| U3 (D-27) | Does `supabase db push --include-seed` re-run the seed on every push? | **RESOLVED — no, it does not re-run.** | 02-09-SUMMARY.md's post-execution fix section documents a real second push (`{"upToDate":true,"seeds":[],...}` — empty `seeds` array vs. the first push's `["supabase/seed.sql"]`) with byte-identical row counts before/after, and identifies the mechanism (`supabase_migrations.seed_files` content-hash tracking). This was discovered while fixing a genuine production incident: the original 5-statement `seed.sql` (wrapped in `begin;`/`commit;`) was silently truncated by Supabase's Supavisor transaction-pool connection pooler mid-batch, causing `ERROR: function public.__seed_apply() does not exist` on the very first hosted push. The fix (collapsing to a single top-level `DO $do$ ... $do$;` block) is present in the current `generate-seed.mjs`/`seed.sql` and is what this session's local `pnpm db:reset`/`pnpm db:test` runs exercised. |
| U15 (D-33) | Is the Custom Access Token Hook actually invoked by the hosted GoTrue auth server? | **OPEN.** | Local `config.toml` has the hook enabled (`[auth.hook.custom_access_token] enabled = true`) and pgTAP proves the function's own logic (`staff_hook_claim.test.sql`, 18/18) — the SQL half is fully proven. No evidence anywhere in the repo (docs, SUMMARYs, or `SUPABASE-RESOURCES.md`'s probe table) that the hosted dashboard toggle has been enabled. Plan 02-10 Task 2 — the checkpoint that would produce this evidence — is `type="checkpoint:human-action"`, `autonomous: false`, and has not run (no `02-10-SUMMARY.md`; ROADMAP.md's Plan 02-10 checkbox is `[ ]`). |
| U28 (documentation drift) | Do the phase's own designated hosted-facts documents reflect the U1/U3 resolutions above? | **NOT SYNCED — WARNING, not a blocker.** | `docs/build/SUPABASE-RESOURCES.md`'s probe table still reads "owned by Plan 02-10" with no "observed"/"refused"/"permitted" text anywhere in the file; `packages/db/README.md`'s "Before the first hosted push" checklist still says "Plan 02-10 is where a human runs them." Both are stale relative to 02-09-SUMMARY.md's post-execution fix, which resolved U1 and U3 empirically against the hosted project during an unplanned incident-response detour, not through Plan 02-10's formal Task 1/3 flow. The underlying engineering fact is sound and independently verified in this session; only the phase's own bookkeeping artifacts have not caught up. |

## Requirements Coverage

| Requirement | Description (abridged) | Status | Evidence |
|---|---|---|---|
| DATA-01 | Schema mirrors the `VamosOps` contract | SATISFIED | 29 tables, all 13 roadmap-named entities present + 16 forward-designed tables; `database.types.ts` committed and drift-checked |
| DATA-02 | RLS on for every customer/operational table; customer reads only own bookings | SATISFIED | 29/29 tables RLS-enabled, 82 policies (39 restrictive); `bookings_customer_rls.test.sql`, `customer_columns.test.sql`, `fail_closed.test.sql` all green |
| DATA-03 | Guest opens a booking with a valid manage token and nothing else | SATISFIED | `bookings_manage_token_rls.test.sql`, `manage_token_shape.test.sql`, `manage_booking_mutation.test.sql` all green |
| DATA-04 | Staff reach ops data through a role claim; customers never can | SATISFIED | `ops_role_rls.test.sql`, `ops_write_denied.test.sql`, `settings_public.test.sql` all green; `fail_closed.test.sql` proves 42501 for non-staff |
| DATA-07 | Seed data loads vehicle classes, settings, content strings, reviews into a fresh environment | SATISFIED | Direct query confirms all counts; `seed_idempotent.test.sql` (37/37); double-reset byte-identical row counts reproduced live in this session |
| AUTH-05 | Staff sign in by invitation only, must pass a second factor | SATISFIED at the SQL/local layer; hosted activation (U15) unproven | Invitation-only enforced by `staff_admin_write` + zero client grants on `staff`; `aal2` gate proven in `app.is_staff()`/`app.is_admin()` and `staff_hook_claim.test.sql`/`ops_role_rls.test.sql`. REQUIREMENTS.md marks this "Complete," which is accurate for what Phase 2 can prove locally but slightly overstates the hosted-platform state — flagged rather than silently accepted |

`REQUIREMENTS.md` (lines 41-56, 198-210) currently marks all six as "Complete." Five of the six
are fully substantiated end to end including the hosted platform (DATA-01/02/03/04/07 — the
hosted push in 02-09's post-execution fix independently confirms the schema, RLS and seed are
live on `yaumjzvylngfjhtuffqs` with matching row counts). AUTH-05's SQL mechanism is equally
solid, but its production activation switch (the hosted Custom Access Token Hook) has not been
confirmed enabled — see Truth 5 and the Human Verification section.

No orphaned requirements: DATA-05/DATA-06/DATA-08/AUTH-01/AUTH-06 are correctly scoped to Phases
3/6/8 per `REQUIREMENTS.md`'s own table and are out of Phase 2's declared requirement set.

## Anti-Patterns Found

None. `grep -rn "TBD|FIXME|XXX"` and `grep -rn "TODO|HACK|PLACEHOLDER"` across every migration,
test, seed, generator, and `README.md` in `packages/db/` returned zero matches. No stub
functions, no `return null`/`return {}` short-circuits, no hardcoded-empty fixtures outside test
files. Every `*_rappen`/`percent` column is genuinely nullable with no numeric default anywhere
(Law 04 compliance, verified both by grep and by direct row inspection).

## Human Verification Required

### 1. Enable the Custom Access Token Hook on the hosted Supabase dashboard (D-33/U15)

**Test:** In the hosted project's dashboard (`yaumjzvylngfjhtuffqs`, Central Europe/Zurich),
navigate to Authentication -> Hooks (or wherever the live menu actually places it — the CONTEXT
doc flags likely drift from the "Beta" label), enable the Custom Access Token Hook pointed at
`public.custom_access_token_hook`, and confirm `[auth.mfa.totp]`-equivalent TOTP settings are
enabled for the project.

**Expected:** A staff member who signs in and completes TOTP receives `app_metadata.vamos_role`
in their minted JWT on the hosted project, matching the local, pgTAP-proven behavior.

**Why human:** The hosted dashboard and database password are owner-held; Claude has no
credentials to toggle a Beta dashboard setting. Plan 02-10 Task 2 is the formal checkpoint for
this and has not run.

### 2. Sync `docs/build/SUPABASE-RESOURCES.md` and `packages/db/README.md` with the already-resolved U1/U3 facts

**Test:** Update the probe table in `SUPABASE-RESOURCES.md` and the checklist in `README.md` to
record that U1 (grant permitted) and U3 (seed does not re-run) were empirically resolved during
02-09's post-execution fix, rather than leaving both marked as pending Plan 02-10 work.

**Expected:** The phase's own designated hosted-facts documents match what actually happened.

**Why human (or at minimum: not yet done):** Not a credentials issue — this is a documentation
task an executor could complete without owner access — but it is currently open and should not
be silently treated as closed. Included here for completeness rather than as a genuine
credential-gated item.

## Gaps Summary

No schema, RLS, or security-mechanism gap was found. All 24 migrations apply clean from zero
(verified twice, live, in this session), all 23 pgTAP files (484 assertions) pass, seed and
types drift-check clean, i18n and typecheck are green, and all 20 applied adversarial-review
fixes are present and correctly implemented in the shipped SQL — none missing, none weakened.

The phase is held at `human_needed` rather than `passed` for one honest reason: AUTH-05's
promise ("staff can only reach it through an invited, MFA-verified session") is fully built and
proven at the schema layer, but its hosted activation switch (the Custom Access Token Hook
enablement in the Supabase dashboard) has not been confirmed — Plan 02-10, the owner-gated plan
that would produce that evidence, has not executed. This is exactly the kind of gap the phase's
own planning anticipated (D-33/U15, `autonomous: false`) rather than an oversight, but it is
real and unproven, so it is reported honestly rather than waved through because the score is
otherwise 5/5.

### Gaps carried forward

| Item | Owning phase / plan | Note |
|---|---|---|
| Hosted Custom Access Token Hook enablement (U15) | **Phase 2 itself, Plan 02-10** (not a later phase — owner-gated, `autonomous: false`, unexecuted) | Blocks AUTH-05's full production guarantee until closed; local/SQL mechanism is proven |
| `SUPABASE-RESOURCES.md`/`README.md` probe-table sync for U1/U3 | **Phase 2 itself, Plan 02-10** (Tasks 1/3, or a standalone doc fix) | Documentation-only; the underlying facts are already correct and independently verified in this session |
| DATA-06 (no identity leak across a pooled Hyperdrive connection) | **Phase 3** | Explicitly out of Phase 2's scope per ROADMAP.md/REQUIREMENTS.md; Phase 2 only makes the proof possible (privilege-less `vamos_edge`, D-02 revoke-all baseline) |
| F-14 (`charged_currency='CHF'` vs. ADR-014 §1 multi-currency) | **Phase 7** | Deliberately deferred, disputed-not-disagreed in the triage; `07-CONTEXT.md` already records the resolution path (additive FX columns via Stripe Checkout Session) |
| CHF price matrix (every priced column NULL, no `rate_versions` row live) | **Owner blocker, no phase** | By design — D-34; not a Phase 2 defect. Confirmed: zero non-null rows across all 17 rappen/percent columns, zero `status='live'` rate_versions rows |

---

*Verified: 2026-08-24T16:55:32Z*
*Verifier: Claude (gsd-verifier)*
