---
phase: quick-261013-pricing-staff-policies
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/db/supabase/migrations/20261012250000_pricing_staff_policies.sql
  - packages/db/supabase/tests/pricing_staff_policies.test.sql
  - apps/web/lib/ops/rate-book-fork-bands-rules.local.test.ts
autonomous: true
requirements: [DEC-2026-10-13-2]
must_haves:
  truths:
    - "A staff session (asStaff, vamos_staff, aal2, active staff row) reads distance_bands and rate_version_rules rows; before this migration it read zero"
    - "An admin staff session can insert a distance band and a city_pair rule into a draft price book"
    - "A dispatcher session is still refused on insert (admin-only restrictive policies untouched)"
    - "Rows of a published (live) price book still cannot be inserted, updated or deleted (frozen triggers untouched)"
    - "forkLiveRateVersion copies every distance band (class and class-less) and every rule of the source book into the new draft"
  artifacts:
    - path: "packages/db/supabase/migrations/20261012250000_pricing_staff_policies.sql"
      provides: "Two PERMISSIVE vamos_staff policies"
      contains: "as permissive for all to vamos_staff"
    - path: "packages/db/supabase/tests/pricing_staff_policies.test.sql"
      provides: "pgTAP: policy shape, staff read, admin draft write, dispatcher refusal, published book frozen"
      contains: "select plan("
    - path: "apps/web/lib/ops/rate-book-fork-bands-rules.local.test.ts"
      provides: "Real-DB proof through the Worker client that a fork copies bands and rules, with no temporary policy"
      contains: "forkLiveRateVersion"
  key_links:
    - from: "apps/web/lib/ops/rate-book.ts cloneRateVersionFrom"
      to: "public.distance_bands / public.rate_version_rules"
      via: "insert ... select under asStaff (role vamos_staff)"
      pattern: "insert into public\\.(distance_bands|rate_version_rules)"
    - from: "pricing_staff_policies migration"
      to: "20260823000023_rls_staff.sql distance_rates pattern"
      via: "restrictive is_staff gate + permissive using(true) with check(true)"
      pattern: "staff_read_write"
---

<objective>
Fix the owner-signed bug (decision `.planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md` item 2, finding D-30-03-1): `public.distance_bands` and `public.rate_version_rules` carry only RESTRICTIVE policies for `vamos_staff`. Postgres grants access only when at least one PERMISSIVE policy passes, so every staff session sees zero rows: Pricing cannot save a city-pair extra or a distance band, and `forkLiveRateVersion` silently copies none of them into a new draft.

Purpose: Pricing works again for the owner on the dashboard; new price books keep their bands and city-pair extras.
Output: one migration (number `20261012250000`, fixed by the owner's decision), one pgTAP file, one real-DB `*.local.test.ts`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md
@packages/db/supabase/tests/ops_write_denied.test.sql
@apps/web/lib/ops/publish-label.local.test.ts

Work session rules: branch `fix/pricing-staff-policies` in this worktree only. No push, no `main`, no live database, no deploy. Lab stack only (name `pricing-pol`). Do NOT `lab.sh destroy` it (the orchestrator destroys it after `gate:local`). No type regeneration, no seed change, no data change.

<interfaces>
Existing policies (do not touch any of them):

From packages/db/supabase/migrations/20260906000001_distance_bands.sql (lines 41-77):
- `distance_bands_staff_all` RESTRICTIVE for all to vamos_staff using/check `(select app.is_staff())`
- `distance_bands_admin_insert` RESTRICTIVE for insert, check `(select app.is_admin())`
- `distance_bands_admin_delete` RESTRICTIVE for delete, using `(select app.is_admin())`
- `distance_bands_admin_update` RESTRICTIVE for update, using/check `(select app.is_admin()) or app.rate_version_published(rate_version_id)`
- triggers `distance_bands_frozen` (before update or delete) and `distance_bands_frozen_ins` (before insert) -> `public.tg_pricing_row_frozen()`
- `region_premiums` has the identical policy set and the same bug. OUT OF SCOPE: do not change it; record it in the SUMMARY for the hand-over.

From packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql (lines 231-265):
- table `rate_version_rules(id bigint identity, rate_version_id bigint not null, kind text not null check (kind <> ''), payload jsonb not null default '{}')`
- `rate_version_rules_staff_all` RESTRICTIVE (is_staff); `rate_version_rules_admin_insert/_delete/_update` RESTRICTIVE, same shape as distance_bands
- triggers `rate_version_rules_frozen`, `rate_version_rules_frozen_ins` -> `public.tg_pricing_row_frozen()`

`distance_bands` columns: `rate_version_id bigint not null, vehicle_class_id uuid null, from_km, to_km, per_km_rappen` (+ identity id).

The working pattern to mirror, 20260823000023_rls_staff.sql (lines 66-72), applied to distance_rates and 16 other tables:
- `<t>_staff_gate` RESTRICTIVE for all to vamos_staff using/check `(select app.is_staff())`
- `<t>_staff_all` PERMISSIVE for all to vamos_staff `using (true) with check (true)`
Here the restrictive `*_staff_all` policies already play the gate role.

`public.tg_pricing_row_frozen()` (current body: 20261007250000_pricing_row_frozen_restore.sql): when the row's rate_version status is not 'draft' it raises errcode `restrict_violation` (SQLSTATE `23001`), except an UPDATE that changes only `live`/`available`/`active` (none of which exist on these two tables, so every update/delete/insert on a published book raises 23001).

rate_versions: `status rate_version_status` ('draft' | 'live' | 'retired'); insert must be 'draft' (trigger `rate_versions_insert_draft`); legal transitions only draft->live and live->retired (`tg_rate_version_transition`, latest body in 20260913180000_ops_pricing_source.sql lines 79-141; publishing checks distance_rates/surcharges/fixed_routes completeness, so a book with none of those publishes). Unique index `rate_versions_one_live`: retire the current live book first. Proven fixture pattern: packages/db/supabase/tests/amount_state_verify.test.sql lines 16-24 (`update public.rate_versions set status = 'retired' where status = 'live';` then insert draft, then `update ... set status = 'live' where slug = ...`).

staff: `public.staff(user_id, role staff_role ('dispatcher'|'admin'), active, accepted_at, full_name)`. Staff JWT claims: `{sub, role:'authenticated', aal:'aal2', app_metadata:{vamos_role:'admin'|'dispatcher'}}`.

From apps/web/lib/ops/rate-book.ts:
- `export async function forkLiveRateVersion(env: CloudflareEnv, claims: VamosClaims, source: { id: number; label: string }, tx?: StaffTx): Promise<number>` -> runs `cloneRateVersionFrom` under `asStaff`; slug of the new draft is `ops-draft-from-<sourceId>`; copies rate_version_rules (`insert ... select kind, payload ... order by id`) and distance_bands (`select vehicle_class_id, from_km, to_km, per_km_rappen`) with plain SQL, so RLS decides what it sees.
- `export async function loadQuoteBookDocForVersion(env, claims, versionId: number): Promise<unknown>` -> asStaff; the returned document has keys `rate_version`, `classes`, `distance_rates`, `distance_bands`, `region_premiums`, `fixed_routes`, `surcharges`, `coupons`, `zones` (no rules key).
- `asStaff` and `type VamosClaims` come from `apps/web/lib/db/identity` (`@/lib/db/identity`).

Real-DB test template: `git show origin/phase-30-vehicle-class-lifecycle:apps/web/lib/ops/rate-book-clone-retired.local.test.ts` (Phase 30, not on main yet). Copy its structure (marker role check `vamos_throwaway_test_stack`, `workerSql` superuser connection, `HYPERDRIVE_NOCACHE` = `postgres://vamos_edge:vamos_edge@127.0.0.1:${PORT}/postgres`, `vi.mock("@opennextjs/cloudflare")`, random `tag`, admin auth.users + staff rows) but WITHOUT its `p30_clone_test_all` temporary policy and WITHOUT its retired-class expectations (main's clone does not filter retired classes; this test uses only active classes).
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Migration with the two permissive staff policies, and its pgTAP test</name>
  <files>packages/db/supabase/migrations/20261012250000_pricing_staff_policies.sql, packages/db/supabase/tests/pricing_staff_policies.test.sql</files>
  <read_first>packages/db/supabase/migrations/20260906000001_distance_bands.sql lines 31-77, packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql lines 219-265, packages/db/supabase/migrations/20260823000023_rls_staff.sql lines 50-75, packages/db/supabase/tests/ops_write_denied.test.sql, packages/db/supabase/tests/amount_state_verify.test.sql lines 1-30</read_first>
  <action>
Migration (number 20261012250000 exactly, per decision item 2; confirm with `ls packages/db/supabase/migrations | grep 20261012250000` that no other file uses it):
- Header comment (SQL `--` lines): cite decision `.planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md` item 2 and finding D-30-03-1; explain that RESTRICTIVE-only policies give vamos_staff zero rows because Postgres needs at least one PERMISSIVE policy to pass; state that this mirrors distance_rates (20260823000023 `_staff_gate` + `_staff_all`); state that the existing restrictive `*_staff_all` is_staff gate, the admin-only insert/update/delete policies and the frozen triggers (`tg_pricing_row_frozen`, published books immutable) all stay and still apply; state no data change; state that region_premiums has the same shape and is deliberately not changed here (not in the signed scope).
- For `public.distance_bands`: `drop policy if exists distance_bands_staff_read_write on public.distance_bands;` then `create policy distance_bands_staff_read_write on public.distance_bands as permissive for all to vamos_staff using (true) with check (true);`
- Same for `public.rate_version_rules` with name `rate_version_rules_staff_read_write`.
- Nothing else: no grant/revoke changes (grants already exist), no other policy touched, no trigger touched.

pgTAP `packages/db/supabase/tests/pricing_staff_policies.test.sql` (begin; select plan(N); ... select * from finish(); rollback; set N to the real assertion count). Header comment: what it proves, rolled back, synthetic integer rappen only. Fixtures as the connecting superuser (postgres), modelled on amount_state_verify.test.sql:
- `update public.rate_versions set status = 'retired' where status = 'live';`
- one vehicle class (slug `psp-eco`, passenger_capacity 3, luggage_capacity 3).
- draft book slug `psp-draft`; second book slug `psp-pub` inserted as draft, given one band (class psp-eco, 0..50 km, per_km_rappen 10) and one rule (kind `city_pair`, payload `{"pairId":"psp-pub"}`) while still draft, then `update public.rate_versions set status = 'live' where slug = 'psp-pub';` (no distance_rates/surcharges/fixed_routes rows, so the publish check passes; if the transition trigger refuses, read its latest body and add a complete synthetic distance_rates row like amount_state_verify does, never disable triggers). Also seed one band and one rule into `psp-draft` as superuser.
- auth.users + staff rows for an admin (`role 'admin'`, active true, accepted_at now()) and a dispatcher (`role 'dispatcher'`, active true, accepted_at now()), fixed UUIDs in the `f0000000-...` range so they do not clash with other tests.

Assertions (ids in descriptions, numbered):
A. Shape, as superuser: `policies_are`-style checks via `pg_policies`: for each table, the `*_staff_read_write` policy exists with `permissive = 'PERMISSIVE'`, `roles = '{vamos_staff}'`, `cmd = 'ALL'`, `qual = 'true'`, `with_check = 'true'`; and the four restrictive policies (`*_staff_all`, `*_admin_insert`, `*_admin_delete`, `*_admin_update`) are still present with `permissive = 'RESTRICTIVE'` (one `results_eq`/`is` per table counting them = 4).
B. As admin: `set local role vamos_staff;` + `set_config('request.jwt.claims', ...admin..., true)` exactly as ops_write_denied.test.sql. `select count(*)` for each table restricted to the two psp books returns the seeded counts (non-zero); `lives_ok` insert of a band (class psp-eco, 50..200 km, per_km_rappen 7) and of a rule (kind `city_pair`, payload `{"pairId":"psp-new"}`) into `psp-draft`; `lives_ok` update of the draft band's per_km_rappen; `throws_ok` insert of a band and of a rule into `psp-pub` with `'23001'`; `throws_ok` update and delete of the `psp-pub` band and rule with `'23001'`. Before writing each expected code, run it once on the lab and assert the code actually raised (23001 from the frozen trigger is expected; if Postgres raises 42501 instead, assert 42501 and note why in the description).
C. As dispatcher (`reset role;` then `set local role vamos_staff;` + dispatcher claims, vamos_role `dispatcher`): select still sees the rows (count > 0); `throws_ok` insert of a band and of a rule into `psp-draft` with `'42501'` (restrictive admin_insert); update/delete of the `psp-draft` band by a dispatcher affects 0 rows (use `is((with u as (update ... returning 1) select count(*)::int from u), 0, ...)`), since admin_update/admin_delete hide the row.
D. Root cause, as superuser at the end (`reset role;`): inside the same rolled-back transaction `drop policy distance_bands_staff_read_write ...` and `drop policy rate_version_rules_staff_read_write ...`, switch back to vamos_staff with admin claims, and assert each table's count for the psp books is 0. This records why the migration exists. Then `reset role;`, finish, rollback.
  </action>
  <verify>
    <automated>bash scripts/test-lab/lab.sh up pricing-pol --no-dash && bash scripts/test-lab/lab.sh pgtap pricing-pol && eval "$(bash scripts/test-lab/lab.sh env pricing-pol)" && grep -E "pricing_staff_policies" "$LAB_STATE/logs/pgtap.log"</automated>
  </verify>
  <done>`lab.sh pgtap pricing-pol` prints `PASS | pgtap`; the log shows `pricing_staff_policies.test.sql .. ok`; the whole existing pgTAP suite is still green (any file that counts policies on these two tables and now fails must be reported, not silently edited: fix only if the expectation is a policy count that this migration legitimately changes, and say so in the SUMMARY). Migration file contains exactly two `create policy` statements.</done>
</task>

<task type="auto">
  <name>Task 2: Real-DB proof that forkLiveRateVersion copies bands and rules through the Worker client</name>
  <files>apps/web/lib/ops/rate-book-fork-bands-rules.local.test.ts</files>
  <read_first>apps/web/lib/ops/publish-label.local.test.ts, output of `git show origin/phase-30-vehicle-class-lifecycle:apps/web/lib/ops/rate-book-clone-retired.local.test.ts`, apps/web/lib/ops/rate-book.ts lines 690-870</read_first>
  <action>
Create the test from the Phase 30 template structure (see interfaces), with these differences:
- Header comment: what it proves (fork copies every band and rule; a staff session reads them), that it runs only when VAMOS_LOCAL_DB_PORT names a disposable lab stack, committed rows (one staff user, one private draft source book, one new draft book, two classes) on a throwaway stack only, synthetic integer rappen only, and that it uses NO temporary policy: it relies on migration 20261012250000. Do NOT write the words "seed-live-like" anywhere in the file (lab.sh dbtests sorts files by that string; this file must run in the "other" group).
- No `create policy` / `drop policy` anywhere in the file.
- beforeAll: marker role check, `ctx.env` with `HYPERDRIVE_NOCACHE`, insert auth.users + staff (role admin, active, accepted_at now(), full_name) for `adminId` (suffix `-0000-4000-a000-0000000000c2`).
- Fixture: two active vehicle classes (`fb-a-${tag}`, `fb-b-${tag}`); a private draft source book (slug `fb-src-${tag}`, label `Fork source ${tag}`); for each class one distance_rates row (base 100, per_km 10, min 100, max_pax 3, available), one distance_band (0..50, per_km 10) and one `city_pair` rule (payload via `su.json({ vehicleClassId: cls, pairId: \`fb-${tag}\` })`); plus one class-less band (null class, 50..200, per_km 7) and one non-city_pair rule (e.g. kind `waiting`, payload `{}`) so "every rule" is proven, not only city_pair.
- Act: `forkLiveRateVersion(env(), STAFF, { id: Number(src), label: \`Fork source ${tag}\` })` imported dynamically from `@/lib/ops/rate-book`.
- Assert (superuser reads): the new draft's bands equal the source bands (both class bands + the class-less band, ordered by from_km, cls nulls last); the new draft's rules (kind, payload) equal the source rules ordered by id; new draft id differs from source.
- Assert (staff reads, the bug itself): `loadQuoteBookDocForVersion(env(), STAFF, draftId)` returns a document whose `distance_bands` array has 3 entries; and a direct `asStaff(env(), STAFF, (tx) => tx\`select count(*)::int as n from public.rate_version_rules where rate_version_id = ${draftId}\`)` returns 3 (import `asStaff` from `@/lib/db/identity`). Keep counts as numbers (the Worker client has fetch_types false; cast in SQL).
- afterAll: `su?.end({ timeout: 5 })`. Rows stay (throwaway lab).

Run it against the lab, then prove it fails without the policies and passes with them:
1. `eval "$(bash scripts/test-lab/lab.sh env pricing-pol)"`; `export VAMOS_LOCAL_DB_PORT=$(printf '%s' "$LAB_DB_URL" | sed -E 's#.*:([0-9]+)/.*#\1#')`. If `vamos_edge` cannot log in (lab.sh pgtap nulls its password and data_steps restores it), read `cmd_dbtests` in scripts/test-lab/lab.sh around line 540-556 and set it the same way; never on any non-lab database.
2. `cd apps/web && pnpm exec vitest run --no-file-parallelism --testTimeout=60000 lib/ops/rate-book-fork-bands-rules.local.test.ts` -> pass.
3. Drop the two new policies on the lab only: run `drop policy distance_bands_staff_read_write on public.distance_bands; drop policy rate_version_rules_staff_read_write on public.rate_version_rules;` with `${LAB_PSQL:-psql} "$LAB_DB_URL"` (native) or `docker exec -i "$LAB_DB_CONTAINER" psql -U postgres -d postgres` (docker). Re-run step 2 -> must FAIL (bands/rules missing on the new draft, staff reads 0). Save both outputs' summary lines for the SUMMARY.
4. Re-apply the migration file verbatim on the lab (same psql route, `-v ON_ERROR_STOP=1 -f packages/db/supabase/migrations/20261012250000_pricing_staff_policies.sql`), re-run step 2 -> pass. Confirm with `select policyname, permissive from pg_policies where policyname like '%staff_read_write'` that both are back.
Then `pnpm typecheck` from the repo root.
  </action>
  <verify>
    <automated>cd apps/web && VAMOS_LOCAL_DB_PORT="$VAMOS_LOCAL_DB_PORT" pnpm exec vitest run --no-file-parallelism --testTimeout=60000 lib/ops/rate-book-fork-bands-rules.local.test.ts && cd ../.. && grep -c "create policy\|drop policy" apps/web/lib/ops/rate-book-fork-bands-rules.local.test.ts | grep -qx 0 && ! grep -q "seed-live-like" apps/web/lib/ops/rate-book-fork-bands-rules.local.test.ts && pnpm typecheck</automated>
  </verify>
  <done>Test passes on lab `pricing-pol` with the migration applied, fails with the two policies dropped (failure lines recorded), passes again after the migration is re-applied; the test file contains no policy DDL and no "seed-live-like"; typecheck green. The lab stack is left running (not destroyed). Work committed on `fix/pricing-staff-policies` (migration + pgTAP in one commit, local test in a second), not pushed. SUMMARY records: pgTAP pass line, the fail-then-pass evidence, that region_premiums has the same restrictive-only bug (out of scope, for the hand-over), and that once Phase 30 lands its `rate-book-clone-retired.local.test.ts` temporary `p30_clone_test_all` policy becomes redundant and can be removed in a follow-up.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dashboard staff session -> Postgres (role vamos_staff) | Staff JWT claims decide is_staff / is_admin; RLS is the last gate on pricing rows |
| public/customer roles -> pricing tables | anon, authenticated, vamos_edge, vamos_public, vamos_guest hold no grants on these tables |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261013-01 | Elevation of privilege | new permissive policies | mitigate | Policies are `to vamos_staff` only; the restrictive `*_staff_all` (is_staff: role claim + aal2 + active staff row) still ANDs over them; pgTAP C proves a dispatcher still cannot insert/update/delete |
| T-261013-02 | Tampering | published price book rows | mitigate | Frozen triggers untouched; pgTAP B proves insert/update/delete on a live book raise 23001 even for admin |
| T-261013-03 | Information disclosure | pricing rows to public roles | accept | No grant change; public roles still have `revoke all`; policies name only vamos_staff |
| T-261013-04 | Tampering | live database | mitigate | Lab stack only; no push, no live apply; the control session applies the migration verbatim with read-back after Ship |
| T-261013-05 | Elevation of privilege | region_premiums (same bug) | accept | Out of signed scope; recorded for the hand-over, no change here |
</threat_model>

<verification>
- `lab.sh pgtap pricing-pol` -> `PASS | pgtap`, `pricing_staff_policies.test.sql .. ok`
- Local test: pass -> (policies dropped) fail -> (migration re-applied) pass
- `git diff --stat origin/main` lists exactly the three files (plus this quick folder's SUMMARY)
- Migration has two `create policy` and two `drop policy if exists`, nothing else executable
</verification>

<success_criteria>
- Staff sessions read and admins write distance bands and city-pair rules on a draft book
- Dispatchers and published books stay locked exactly as before
- forkLiveRateVersion carries bands and rules into the new draft, proven on a real database through the Worker client with no temporary policy
</success_criteria>

<output>
Create `.planning/quick/261013-pricing-staff-policies/261013-pricing-staff-policies-SUMMARY.md` when done
</output>
