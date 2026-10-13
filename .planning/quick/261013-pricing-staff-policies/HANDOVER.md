# Hand-over: quick 261013 pricing staff policies

Work session (not control). Branch `fix/pricing-staff-policies`, cut from origin/main aa85e5ec, merged origin/main 4b541e3f (planning note only). Owner decision: `.planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md` item 2. No push to main, no PR, no live write, no deploy.

## What changed

| Commit | What |
|---|---|
| 51f5a39e | Migration `packages/db/supabase/migrations/20261012250000_pricing_staff_policies.sql` + pgTAP `packages/db/supabase/tests/pricing_staff_policies.test.sql` |
| 2c03b7ef | Real-DB test `apps/web/lib/ops/rate-book-fork-bands-rules.local.test.ts` (forkLiveRateVersion through the Worker client, no temporary policy) |
| ee69f536 | Review follow-ups: pgTAP C9–C12 (dispatcher on a published book), local test deletes its books and classes |

Migration md5 (`md5 -q`): **`76fd48c84744f52a9c4bd4e0244cfb67`**

The migration adds exactly two policies, nothing else (no grant, no data, no type change):

- `distance_bands_staff_read_write`: `as permissive for all to vamos_staff using (true) with check (true)`
- `rate_version_rules_staff_read_write`: same

Each is `drop policy if exists` then `create`, so it can run twice. Every existing restrictive policy stays: `*_staff_all` (is_staff gate), `*_admin_insert/_update/_delete`, and the frozen triggers. This is the `distance_rates` shape from 20260823000023.

## Verified (clock +04)

Logs named below are gitignored (`*.log`): they exist only in this worktree, `/Users/koss/.t3/worktrees/VamosTaxi.eu/fix-pricing-staff-policies/.planning/quick/261013-pricing-staff-policies/logs/`, until it is removed.


- 2026-10-13 23:45: `lab.sh pgtap pricing-pol` PASS, Files=118 Tests=3474 (first version, 25 assertions).
- 23:46:14: local test passes with the migration. 23:46:27: it **fails** with the two policies dropped on the lab (new draft had 0 bands). 23:46:33: it passes again after re-applying the file verbatim.
- 2026-10-14 00:08:14 → 00:11:05: `pnpm gate:local` exit=0 at edf958c5 (unit 5972 passed / 53 skipped; db-lab 76 + 11 + 40 passed; the new local test is picked up by the `*.local.test.ts` glob). Log: `logs/gate-local.log`.
- 00:12:34: `lab.sh pgtap pricing-pol` PASS, Files=118 Tests=3478 after C9–C12 (29 assertions in the new file). Log: `logs/pgtap4.log`.
- 00:13:26 and 00:13:27: the cleaned-up local test passes twice in a row on the same lab. Afterwards: 0 fork books, 0 fork classes left, and both policies read PERMISSIVE in `pg_policies`.
- 00:13:38: eslint and `tsc --noEmit` (apps/web) clean on the final test file.
- Independent review (reviewer agent, Opus, read-only) of 51f5a39e + 2c03b7ef: **approve**. It found that only `region_premiums` still has the restrictive-only shape.
- 00:13:55 → 00:14:34: `pnpm test:db-lab` on the final tree ee69f536 exit=0 (76 + 11 + 40 passed; its own throwaway stack removed). Log: `logs/db-lab-final.log`.

## Not verified

- Nothing on the live database. The migration is applied only on the lab.
- No browser click-through of Pricing (saving a city-pair extra, then forking) on a local Worker.
- PR review (`pr-review` / Grok 4.7): there is no PR yet; the controller opens it.

## Failed

- Nothing in the final state.
- While building: the first `lab.sh up` failed because `node_modules` was missing (`pnpm install --frozen-lockfile`, lockfile unchanged). The first pgTAP draft failed 10/25 on fixture mistakes. The first cleanup version failed because `audit_log` is append-only and references `staff`, so the staff user now stays (as `publish-label.local.test.ts` leaves its own).

## Behaviour notes the tests pin

- A dispatcher (non-admin staff) now **reads** both tables, like `distance_rates`. A dispatcher insert gets 23001: the frozen trigger reads `rate_versions` as the caller, a dispatcher sees no row there, so the book does not read as draft. Update or delete on a draft book affects 0 rows. Update on a published book gets 23001: the `*_admin_update` "or published" carve-out lets it through, then the trigger refuses it. Delete on a published book affects 0 rows.
- An admin reads and writes draft books. Insert, update or delete on a published book gets 23001 (frozen trigger).

## For the controller: read-back after applying on live (read-only)

1. Before applying: `md5 -q packages/db/supabase/migrations/20261012250000_pricing_staff_policies.sql` must print `76fd48c84744f52a9c4bd4e0244cfb67`.
2. After applying:

```sql
select tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename in ('distance_bands', 'rate_version_rules')
 order by tablename, policyname;
```

Expected: 10 rows, verbatim as read back from the lab (2026-10-14 00:15) after the file was applied (`tablename | policyname | permissive | roles | cmd | qual | with_check`):

```text
distance_bands | distance_bands_admin_delete | RESTRICTIVE | {vamos_staff} | DELETE | ( SELECT app.is_admin() AS is_admin) | null
distance_bands | distance_bands_admin_insert | RESTRICTIVE | {vamos_staff} | INSERT | null | ( SELECT app.is_admin() AS is_admin)
distance_bands | distance_bands_admin_update | RESTRICTIVE | {vamos_staff} | UPDATE | (( SELECT app.is_admin() AS is_admin) OR app.rate_version_published(rate_version_id)) | (( SELECT app.is_admin() AS is_admin) OR app.rate_version_published(rate_version_id))
distance_bands | distance_bands_staff_all | RESTRICTIVE | {vamos_staff} | ALL | ( SELECT app.is_staff() AS is_staff) | ( SELECT app.is_staff() AS is_staff)
distance_bands | distance_bands_staff_read_write | PERMISSIVE | {vamos_staff} | ALL | true | true
rate_version_rules | rate_version_rules_admin_delete | RESTRICTIVE | {vamos_staff} | DELETE | ( SELECT app.is_admin() AS is_admin) | null
rate_version_rules | rate_version_rules_admin_insert | RESTRICTIVE | {vamos_staff} | INSERT | null | ( SELECT app.is_admin() AS is_admin)
rate_version_rules | rate_version_rules_admin_update | RESTRICTIVE | {vamos_staff} | UPDATE | (( SELECT app.is_admin() AS is_admin) OR app.rate_version_published(rate_version_id)) | (( SELECT app.is_admin() AS is_admin) OR app.rate_version_published(rate_version_id))
rate_version_rules | rate_version_rules_staff_all | RESTRICTIVE | {vamos_staff} | ALL | ( SELECT app.is_staff() AS is_staff) | ( SELECT app.is_staff() AS is_staff)
rate_version_rules | rate_version_rules_staff_read_write | PERMISSIVE | {vamos_staff} | ALL | true | true
```

Before applying, the same query on live should return the eight RESTRICTIVE rows only.

3. Count check:

```sql
select tablename, count(*) filter (where permissive = 'PERMISSIVE') as permissive,
       count(*) filter (where permissive = 'RESTRICTIVE') as restrictive
  from pg_policies
 where schemaname = 'public' and tablename in ('distance_bands', 'rate_version_rules')
 group by tablename order by tablename;
```

Expected: `distance_bands | 1 | 4` and `rate_version_rules | 1 | 4`.

4. If the live list before applying differs from the four restrictive rows per table above, stop and compare (see memory "Live vs files schema compare").

## Open items (need a word, not done here)

1. **`region_premiums` has the same bug** (outside the signed scope, not changed). Staff sessions read 0 rows, so every fork copies no region premium (`apps/web/lib/ops/rate-book.ts:778-783`). The dashboard reads none (:533, :893). Discard's `delete from region_premiums` (`api/staff/rate-versions/[id]/discard/route.ts:37`) affects 0 rows, so discarding a draft that has premiums would hit the foreign key. The fix is the same one-policy migration. It needs his word and a new migration number.
2. **Live price books may be missing what forks dropped.** Every fork copied 0 bands, 0 rules and 0 region premiums, and the copied surcharges got `rule_id` null. The controller's live facts (books 7–23 hold 0 bands, no book ever held a rule) fit that. This migration restores nothing. The bands must be re-entered on Pricing by him (he sets prices). A read-only compare of the live book against its source books first would show what was lost.
3. **Older than this job, found in review:** on UPDATE, `tg_pricing_row_frozen` (20261007250000 lines 20-21) checks only the new `rate_version_id`. An admin `update ... set rate_version_id = <draft> where rate_version_id = <live>` would move a row out of a published book. `distance_rates` already had this; now it is also reachable for these two tables through `asStaff`. A possible follow-up: refuse a change of `rate_version_id`, or check `old.rate_version_id` too.
4. **Phase 30 (PR #80):** once both land, the temporary `p30_clone_test_all` policy in `rate-book-clone-retired.local.test.ts` is redundant and can be removed. That hack exists only on the Phase 30 branch, not on main.
5. Merge order: this branch has 20261012250000. Phase 30's 200000/210000/220000 sort before it, so merging after Phase 30 needs no renumbering. If Phase 30 changes pricing files, merge origin/main and re-run `lab.sh pgtap` plus the local test.

## Lab

00:14:43–00:14:48: `lab.sh destroy pricing-pol` PASS; `lab.sh status pricing-pol` then reports no lab of that name. No local stack is left from this job. `node_modules` was installed in this worktree (removed with the worktree).
