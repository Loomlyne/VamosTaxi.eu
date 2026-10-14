# Remove km bands, region % and the Rules list (decision 2026-10-13, items 10 and 13)

The controller runs this on your word. An agent in a work session never runs it and never touches the
live database for it.

Km bands (`public.distance_bands`), region % (`public.region_premiums`) and the Rules list
(`public.rate_version_rules`, plus the link column `public.surcharges.rule_id`) go completely. They are
blocked on live, have priced no customer since 2026-09-14, and you replaced them with city and canton
extras. The rows that are left (live, read-only 2026-10-14 05:28: no km band, because the Phase 30 removal
took all 95 and they sit in `backup_p30_20261012`; 25 region % rows, 5 in each retired price book 1 to 5;
no rule; no surcharge linked to a rule) are copied into a backup schema
`backup_pricing_20261014` and deleted in one transaction. Then Part B drops the three tables and the
column. No price is written anywhere.

Files:

- Part A: `packages/db/supabase/migrations/20261012250000_pricing_lock_check.sql` (lock check: no price
  row ever leaves a live or retired book; `quote_rate_book` stops returning bands and region %).
- The delete script: `docs/runbook/pricing-remove-bands-premiums.sql`.
- Part B: `packages/db/supabase/migrations/20261012300000_pricing_drop_bands_premiums_rules.sql`.
- Local proof (never on live): `scripts/pricing-remove-bands-local-proof.sh <lab>`.

## Order

1. **Archive (controller, read-only).** Export every row of the three tables and the rule links to a
   file and push it under the tag `archive/pricing-bands-premiums-20261014` on GitHub. Do not go on
   until the tag is on GitHub. Statements (role postgres, read-only):

   ```sql
   select coalesce(json_agg(b order by b.id), '[]'::json) from public.distance_bands b;
   select coalesce(json_agg(p order by p.id), '[]'::json) from public.region_premiums p;
   select coalesce(json_agg(r order by r.id), '[]'::json) from public.rate_version_rules r;
   select coalesce(json_agg(json_build_object('id', s.id, 'rule_id', s.rule_id) order by s.id), '[]'::json)
     from public.surcharges s where s.rule_id is not null;
   ```

2. **Part A**, applied verbatim in one transaction, then read back: `md5` of the file must match the
   hand-over, and `pg_get_functiondef('public.tg_pricing_row_frozen()'::regprocedure)` must contain
   `pricing rows cannot leave a published rate_version`. The live code keeps working with Part A (the
   engine tolerates the missing keys; nothing moves a price row between books).
3. **Deploy both Workers** in the two-Worker order (memory: two-Worker deploy order;
   `pnpm --filter web run deploy -- --env staging`). After this, no code reads the three tables.
4. **This script.** STEP 0 first (preview), then STEP 1 (see below).
5. **Part B**, applied verbatim in one transaction. Its first statement refuses to run, with nothing
   applied, while any band, region % or rule row or any `surcharges.rule_id` link is left
   (`pricing-bands-premiums-rules-present: <table> — run docs/runbook/pricing-remove-bands-premiums.sql
   first; nothing was applied`).
6. **Read-backs** after Part B (all read-only):

   ```sql
   select to_regclass('public.distance_bands'), to_regclass('public.region_premiums'),
          to_regclass('public.rate_version_rules');                       -- null, null, null
   select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'surcharges' and column_name = 'rule_id';   -- 0
   select to_regprocedure('app.pricing_assert_bands_premiums_rules_gone()') is not null;       -- true
   select pg_get_functiondef('public.ops_vehicle_class_set_status(uuid, text, text)'::regprocedure)
          ~ 'distance_bands|rate_version_rules|rule_id';                                       -- false
   select (select count(*) from backup_pricing_20261014.distance_bands),
          (select count(*) from backup_pricing_20261014.region_premiums),
          (select count(*) from backup_pricing_20261014.rate_version_rules);                   -- 0, 25, 0
   ```
7. **Message rows** (after the deploy; no live receipt carries the line, read 2026-10-14: 0
   `price_snapshots`). The two `price.surcharge.region_premium.*` keys left the message files and the
   seed in this PR, but the live `content_strings` table keeps rows until they are deleted. Preview,
   then delete with a backup in the same schema, one transaction:

   ```sql
   select key from public.content_strings where key like 'price.surcharge.region\_premium.%';   -- preview: .label, .rule
   begin;
   create table backup_pricing_20261014.content_strings as
     select * from public.content_strings where key like 'price.surcharge.region\_premium.%';
   delete from public.content_strings where key like 'price.surcharge.region\_premium.%';
   select count(*) from backup_pricing_20261014.content_strings;        -- same count as the preview
   commit;
   ```

## Step 4 in detail (the script)

1. Open the SQL editor (role postgres) for the live project and start a new query.
2. STEP 0: copy the block under "STEP 0 - PREVIEW", remove the `/*` and `*/` lines, and run it. Check:
   - 0 `distance_bands`, 25 `region_premiums`, 0 `rate_version_rules`, 0 `surcharges_with_rule_id`;
   - the per-book list shows only retired books;
   - the last query returns no row (nothing in a draft or live book).
   If a number differs, stop: the four numbers on the `create temporary table pricing_params` line must
   be confirmed with the owner before anything runs.
3. STEP 1: paste the whole script from `begin;` to `commit;` into a new query and run it once. Change
   nothing in it.
4. Expected messages (NOTICE lines):
   - `PRICING: 0 bands, 25 premiums, 0 rules, 0 rule links found (match expected), all in retired books`
   - `PRICING done: 0 bands, 25 premiums, 0 rules removed, 0 rule links; backup in backup_pricing_20261014; 0 rows left; triggers enabled`

## What each abort means (nothing was changed in every case)

- `PRICING abort: a table or surcharges.rule_id is missing (Part B already applied?)` - Part B already
  ran, or the schema is not the one this script was written for.
- `PRICING abort: schema backup_pricing_20261014 already exists (the script ran before)` - do not run
  it a second time.
- `PRICING abort: N distance_bands rows found, expected 0` (or region_premiums, rate_version_rules,
  rule links) - live differs from the preview read on 2026-10-14. Report the number; do not edit the
  expected numbers without the owner.
- `PRICING abort: N band, premium or rule rows sit in a book that is not retired` - a draft or live
  book holds a row; this script removes rows from retired books only. Report it.
- `PRICING abort: backup holds ...`, `... rows or links still present`, `... trigger(s) not enabled` -
  the self-check after the delete failed; the whole transaction rolled back, the backup schema included.

## Why it is safe

- One transaction: any failed check rolls back everything, the backup schema included.
- Count guards on all four numbers, a guard against a second run, a guard against a schema where Part B
  already ran.
- Only the frozen-row triggers `distance_bands_frozen` and `region_premiums_frozen` are switched off,
  by name, and switched back on inside the same transaction; `rate_version_rules_frozen` is touched only
  if rules were expected (0 today). The script checks that every one is enabled before it commits.
- No CASCADE, no DROP (Part B drops), no price written, `session_replication_role` not used.
- The script never edits a surcharge. If a surcharge ever carried a `rule_id`, the guard stops it; the
  script would need a reviewed change first.

## Rollback

Before Part B: the rows are in `backup_pricing_20261014` (one table per source table, same columns) and
on the tag `archive/pricing-bands-premiums-20261014`. Re-inserting them needs the frozen triggers off
by name for the insert, inside one transaction. After Part B the tables are gone; they would have to be
recreated from `20260906000001_distance_bands.sql` and `20260913180000_ops_pricing_source.sql` first.
Drop `backup_pricing_20261014` only on the owner's word.
