---
phase: quick-261013-pricing-staff-policies
plan: 02
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 (database)
  - packages/db/supabase/migrations/20261012250000_pricing_staff_policies.sql   # deleted (withdrawn, never live)
  - packages/db/supabase/migrations/20261012250000_pricing_lock_check.sql
  - packages/db/supabase/migrations/20261012300000_pricing_drop_bands_premiums_rules.sql
  - docs/runbook/pricing-remove-bands-premiums.sql
  - docs/runbook/pricing-remove-bands-premiums.md
  - scripts/pricing-remove-bands-local-proof.sh
  - packages/db/supabase/tests/pricing_staff_policies.test.sql                  # deleted
  - packages/db/supabase/tests/distance_bands.test.sql                          # deleted
  - packages/db/supabase/tests/pricing_lock_check.test.sql
  - packages/db/supabase/tests/vehicle_class_delete_hide.test.sql
  - packages/db/supabase/tests/vehicle_class_lifecycle.test.sql
  - packages/db/database.types.ts
  # Task 2 (server + engine)
  - apps/web/lib/pricing/bands.ts                                               # deleted
  - apps/web/lib/pricing/bands.test.ts                                          # deleted
  - apps/web/lib/pricing/lines.ts
  - apps/web/lib/pricing/types.ts
  - apps/web/lib/pricing/rateBook.ts
  - apps/web/lib/ops/pricing.ts
  - apps/web/lib/ops/rate-book.ts
  - apps/web/lib/ops/draft-preview.ts
  - apps/web/lib/quote/lock.ts
  - apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts
  - apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts
  - apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/discard/route.ts
  - apps/web/lib/ops/rate-book-fork-bands-rules.local.test.ts                   # deleted
  - apps/web/lib/ops/rate-book-clone-retired.local.test.ts
  - apps/web/lib/ops/publish-quote-lock.local.test.ts
  - apps/web/lib/ops/rate-book-draft.test.ts
  - apps/web/lib/ops/rate-book-live-row-id.test.ts
  - apps/web/lib/ops/rate-book-extra-rule.test.ts
  - apps/web/lib/ops/rate-book-clone-retired.test.ts
  - apps/web/lib/ops/rate-book-jsonb-writers.test.ts
  - apps/web/lib/ops/rate-book-stored-codes.test.ts
  - apps/web/lib/ops/pricing.test.ts
  - apps/web/lib/ops/publish-public-chf.test.ts
  - apps/web/lib/ops/booking-change.test.ts
  - apps/web/lib/ops/booking-change-price.test.ts
  - apps/web/lib/ops/booking-trip-change.test.ts
  - apps/web/lib/ops/trip-change-facts.test.ts
  - apps/web/lib/ops/trip-change-retired-class.test.ts
  - apps/web/lib/ops/draft-preview-lines.test.ts
  - apps/web/lib/ops/draft-preview-unpaid.test.ts
  - apps/web/lib/ops/ops-pricing-264.test.ts
  - apps/web/lib/pricing/d15-recipe.test.ts
  - apps/web/lib/pricing/priceQuote.test.ts
  - apps/web/lib/pricing/priceQuote.property.test.ts
  - apps/web/lib/pricing/public-board.test.ts
  - apps/web/lib/pricing/eligibility.test.ts
  - apps/web/lib/pricing/lines.test.ts
  - apps/web/lib/pricing/party-van-luxury-12.test.ts
  - apps/web/lib/pricing/one-form-fare-parts.test.ts
  - apps/web/lib/quote/engine.test.ts
  - apps/web/lib/quote/pipeline.test.ts
  - apps/web/lib/quote/no-extra-stop.test.ts
  - apps/web/lib/checkout/extra-wait-no-offsession.test.ts
  - apps/web/lib/checkout/party-intent-van-luxury-12.test.ts
  - docs/build/OWNER-ANSWERS.md
  # Task 3 (dashboard UI)
  - app/ops/OpsPricing.dc.html
  - app/vamos-ops-data.js
  - app/vamos-i18n-dict.js
  - apps/web/lib/ops/ops-pricing-lock-field.test.ts
  - apps/web/lib/ops/ops-pricing-tabs.test.ts
  - apps/web/lib/ops/ops-dc-p4.test.ts
  - apps/web/lib/ops/ops-dc-class-lifecycle.test.ts
  - .planning/quick/261013-pricing-staff-policies/tools/lock-field-browser.mjs
  - .planning/quick/261013-pricing-staff-policies/HANDOVER.md
autonomous: true
requirements: [DEC-2026-10-13-9, DEC-2026-10-13-10, DEC-2026-10-13-12, DEC-2026-10-13-13, DEC-2026-10-13-14, DEC-2026-10-13-15]

must_haves:
  truths:
    - "Km bands, region % and the Rules list no longer exist anywhere: no table after Part B, no engine code, no route, no dashboard collection, no DC string"
    - "A pricing row (distance_rates, fixed_routes, surcharges) can never be moved out of a live or retired price book, by anyone, and still cannot be moved into one; an availability-only toggle on a published row still works"
    - "Pricing › Distance rules shows one field 'Price stays valid for [24] hours' above the class table, in en/de/fr/ar, and Save writes rate_versions.quote_lock_minutes on the draft"
    - "Publish keeps the draft's quote_lock_minutes (1440 when the draft has none) on the live book and on the new settings_versions row"
    - "The Publish dialog shows no Km band / Overlapping km band line and no band-overlap warning"
    - "The currently live code keeps working with Part A applied and before Part B (deploy order: Part A, deploy, owner delete script, Part B)"
    - "Part B refuses to run (clear message, nothing changed) while any band, premium, rule row or surcharges.rule_id link exists"
  artifacts:
    - path: "packages/db/supabase/migrations/20261012250000_pricing_lock_check.sql"
      provides: "tg_pricing_row_frozen with the move-out refusal; quote_rate_book without distance_bands/region_premiums"
      contains: "create or replace function public.tg_pricing_row_frozen()"
    - path: "packages/db/supabase/migrations/20261012300000_pricing_drop_bands_premiums_rules.sql"
      provides: "guard function + call, two function rewrites, drop surcharges.rule_id, drop the three tables"
      contains: "app.pricing_assert_bands_premiums_rules_gone"
    - path: "docs/runbook/pricing-remove-bands-premiums.sql"
      provides: "Owner/controller delete script: preview, count guards, backup schema, one transaction, triggers off/on by name"
      contains: "backup_pricing_20261014"
    - path: "packages/db/supabase/tests/pricing_lock_check.test.sql"
      provides: "pgTAP: lock check on three tables, quote_rate_book keys, Part B shape, guard proof"
      contains: "select plan("
    - path: "apps/web/lib/ops/publish-quote-lock.local.test.ts"
      provides: "Real-DB proof: lock save path and Publish keeping the draft's minutes"
      contains: "quote_lock_minutes"
    - path: "app/ops/OpsPricing.dc.html"
      provides: "Signed lock field on Distance rules; band warning and band/rule gap kinds gone"
      contains: "data-lock-field"
  key_links:
    - from: "app/ops/OpsPricing.dc.html saveLock"
      to: "app/vamos-ops-data.js saveDraftQuoteLock"
      via: "window.VamosOps.saveDraftQuoteLock(hours)"
      pattern: "saveDraftQuoteLock"
    - from: "app/vamos-ops-data.js saveDraftQuoteLock"
      to: "PUT /api/staff/rate-book kind rule, ruleKind quote_lock"
      via: "api('PUT', '/api/staff/rate-book', { kind: 'rule', ruleKind: 'quote_lock', quoteLockHours })"
      pattern: "ruleKind: \"quote_lock\""
    - from: "rate-book route quote_lock branch"
      to: "public.rate_versions.quote_lock_minutes"
      via: "update ... where id = draft and status = 'draft'"
      pattern: "set quote_lock_minutes"
    - from: "publish route"
      to: "rate_versions.quote_lock_minutes + settings_versions.quote_lock_minutes"
      via: "row.quote_lock_minutes ?? QUOTE_LOCK_MINUTES"
      pattern: "QUOTE_LOCK_MINUTES"
---

<objective>
PR #81 re-scope (owner decisions 2026-10-13 file, items 9-15; pictures signed 2026-10-14 ~03:25, SIGNED.md).
Remove km bands (`distance_bands`), region % (`region_premiums`) and the Rules list (`rate_version_rules`,
plus `surcharges.rule_id`) completely; add one book-level field "Price stays valid for [24] hours" that edits
`rate_versions.quote_lock_minutes` and that Publish keeps; add the lock check (no row ever leaves a live or
retired book). Two migrations (Part A before deploy, Part B after the owner delete script), the delete
runbook, tests.

Purpose: the three tables are blocked on live, never priced a customer since 2026-09-14, and the owner
replaced them with city/canton extras. The quote lock becomes an owner-set value instead of a hardcoded 24 h.
Output: 2 migrations, runbook .sql/.md + local proof script, engine/ops/route cleanup, Publish change, the
signed field wired live, tests, hand-over.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md
@.planning/quick/261013-pricing-staff-policies/SIGNED.md
@./CLAUDE.md
@.claude/CLAUDE.md

Signed markup source (copy verbatim): .planning/quick/261013-pricing-staff-policies/tools/render-bands.mjs
lines 31-60 (`warnLine` removed, `paneOpen`, `lockField`, `LOCK` T-table entries, renderVals names).

<process_rules>
Binding on every executor of every task:
1. Work only in /Users/koss/.t3/worktrees/VamosTaxi.eu/fix-pricing-staff-policies on branch fix/pricing-staff-policies. No push to main, no live database, no deploy, no wrangler against a remote, no `supabase db push`.
2. Run touched tests only (memory: parallel agents overload the Mac). vitest in this worktree: from apps/web, `./node_modules/.bin/vitest run <files>` (never `pnpm test:unit` here).
3. One local Supabase stack on the Mac at a time. Before `lab.sh up`: `ps -ax -o command | grep -c '[.]postgres-wrapped -D'` must print 0 (another session's lab, e.g. lab-p32, may be running: wait, never stop it). Lab name `pricing-pol`. Destroy it when the task is done: `bash scripts/test-lab/lab.sh destroy pricing-pol`.
4. Long runs (lab up, pgtap, db-lab, builds) run detached: `nohup zsh -c '<cmd>; echo exit=$?' > .planning/quick/261013-pricing-staff-policies/logs/<name>.log 2>&1 &`, then poll the log for `exit=`. Logs stay in that logs/ folder (gitignored), never /tmp. Never two builds at once; Playwright workers ≤ 2.
5. Never invent a price, amount, limit, rate or legal text. Test fixtures use synthetic integer rappen (0, 1, 10, 100). Never write `CHF` amounts into copy.
6. DC strings exist in en/de/fr/ar in the same pass (Swiss German, "ss" not "ß"); the four signed lock strings come from SIGNED.md verbatim.
7. Messages (apps/web/i18n/messages/*.json) change → `pnpm --filter @vamos/db run seed:gen` then `seed:check`. This plan removes no message key (see Task 2), so seed.sql must stay byte-identical.
8. Kill only processes you started, by PID/port. Never `pkill -f`.
9. Each task ends with one atomic commit; message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
10. postgres.js: catch SQL refusals around asStaff/asSystem, never inside (memory: begin() rethrows). JSON params via `tx.json(...)`, never `${JSON.stringify(x)}::jsonb`.
</process_rules>

<verified_facts>
Answers to the planner's VERIFY items (checked in this tree at 8e57e940):
- quote_rate_book latest body = 20261007310000 lines 578-~725. It has NO rate_version_rules reference; it returns `distance_bands` and `region_premiums` keys in two places (the null-version object and the main object). Grants on it: kept by `create or replace` (do not re-grant).
- Old (live) code tolerates the keys missing: apps/web/lib/pricing/rateBook.ts `mapList(doc.distance_bands, …)` returns [] for undefined (rateBook.ts:71-78, 254-255). lib/ops/rate-book.ts `quoteBookDocById` and `loadRateBook` read the tables directly (they exist until Part B). So Part A drops the two keys outright; no empty-array shim.
- No old or new code UPDATEs `rate_version_id` (every write filters `where id = … and rate_version_id = ${versionId}`); fork/clone only INSERTs into the draft. The lock check breaks no current path.
- tg_pricing_row_frozen live body = 20261007250000 (live md5 of pg_get_functiondef 39df856a4f7f191c1eacdfcd09b3b38a, read 2026-10-03). Not security definer; reads rate_versions as the caller. Used by distance_rates, fixed_routes, surcharges (stay) and distance_bands, region_premiums, rate_version_rules (go). On UPDATE it reads the status of COALESCE(new.rate_version_id, …) = the NEW book only: moving a row from a live/retired book into a draft passes today (the hole item 12 closes).
- Other function bodies referencing the three tables (latest definitions): `public.ops_vehicle_class_set_status` (20261012200000 lines 134-247: deletes draft distance_bands, nulls surcharges.rule_id, deletes draft city_pair rate_version_rules) and `public.ops_vehicle_class_delete_or_hide` (20260928160000 lines 31-110: distance_bands in the in-use check and a draft delete; no Worker caller since Phase 30 30-04, still granted to vamos_staff). plpgsql is not checked at drop time, so Part B MUST recreate both without those statements or they fail at run time. `tg_rate_version_transition` (latest 20260913180000) mentions bands only in a comment. app.p30_assert_test_classes_gone does not touch them.
- app.rate_version_published is still used by the admin_update policies of distance_rates, surcharges, fixed_routes (20260823000023 loop): keep it.
- Only FK into the three tables: surcharges.rule_id → rate_version_rules(id) on delete restrict. No audit trigger on the three tables. Their triggers: distance_bands_frozen(_ins), region_premiums_frozen(_ins), rate_version_rules_frozen(_ins).
- Lock save path today: TWO writers. (a) a generic pre-block in PUT (route ~774-787) writes quote_lock_minutes whenever ANY PUT body carries quoteLockHours; (b) `kind:"rule", ruleKind:"quote_lock"|"lock"` (~1092-1105) writes it AND inserts a rate_version_rules row. VAT also uses `kind:"rule", ruleKind:"vat"` (vamos-ops-data.js saveDraftVat ~1158). GET already returns `quoteLockHours` (~444). Nothing in app/ sends quoteLockHours today.
- Snapshot lines live in `public.price_snapshots.lines` (jsonb array; each line has `code` and `i18n_key`), plus `shown_alternatives` jsonb. The engine called buildRegionPremiumLine from 51cc47f6 (2026-09-09) to c5b5f4fe (2026-09-14), so a snapshot from that window can carry code `region_premium`. Decision: KEEP `price.surcharge.region_premium.{label,rule}` in messages and seed.sql (history label for old receipts); remove all engine code. Controller pre-ship read reports the count for the record.
- Types: `pnpm --filter @vamos/db run types` uses `--local` (default stack; CLI 2.115 needs Docker). Phase 30 (30-01-SUMMARY) edited database.types.ts by hand. Same here.
- pgTAP: `lab.sh pgtap <name>` = `supabase db reset` (all migrations incl. Part B, then seed) + `supabase test db`. In a fresh lab the three tables are already dropped, so no test may reference them except by creating a stand-in inside its own rolled-back transaction. Seeds (seed.sql, scripts/test-lab/seed-live-like.sql) never touch the three tables.
- Served DC copy apps/web/public/app/ is gitignored; `node scripts/sync-dc-mock-to-public.mjs` refreshes it (DC tests compare it to the stripped source).
- The Rules OpsTable left the template on 2026-09-14 (c5b5f4fe); its T keys are dead (0 uses each): colRule, addRule, editRule, saveRule, deleteRuleTitle, deleteRuleBody, emptyRulesTitle, emptyRulesBody, searchRules, nounRule, nounRules, kindWaiting, kindLock, kindFreeWait, kindServiceArea, fPayload, hRulePayload, regionPercentWarn, previewKicker, recapStart, recapKm, recapBands, recapRegion, recapExtras, recapVat, recapTotal (recap*/previewKicker exist in de/fr/ar only). Live keys to remove with their consumers: gapRule, gapBand, gapBandOverlap, bandOverlapWarn.
- Sheet 1 "after" stub showed a "Rule" gap line. With rate_version_rules dropped (item 13) that gap can never occur (live: 0 rule rows), so kind `rule` goes with the table. This is the only difference from sheet 1 and only in a state live cannot reach.
</verified_facts>

<interfaces>
Existing contracts the executors use (from this tree):
- apps/web/lib/ops/staff-json: `withAdmin`, `withStaff`, `jsonOk(data)`, `jsonErr(code, status, extra?)`.
- apps/web/lib/db/identity: `asStaff(env, claims, async (tx) => …)`; tx is postgres.js (`tx.json(obj)` for jsonb).
- rate-book route: `quoteLockMinutesFromHours(hours: unknown): number | null` (~95), `bookPayload(book, zones)` (~419), `resolveWritableVersionId(env, claims, raw)` (~465; forks the live book into a draft when none exists), `loadRateBook(env, claims, versionId)`, `loadServiceZones(env, claims)`.
- lib/ops/rate-book.ts `RateBook` type (~103-118): fields distanceBands, regionPremiums, rules go; `SurchargeRow.ruleId` (~63) and `SurchargeInput.ruleId` (~155) go; `quoteLockMinutes: number | null` stays.
- lib/quote/lock.ts: `export const QUOTE_LOCK_MINUTES = 1440;` stays as the default.
- lib/ops/pricing.ts `CompletenessKind` = "distance_rate" | "surcharge" | "fixed_route" | "coupon" after this plan.
- DC: VAT field markup OpsPricing.dc.html lines 156-167, logic loadVat/setVatPercent/saveVat ~997-1040, renderVals VAT names ~1650-1659. vamos-ops-data.js `saveDraftVat(bps)` ~1158, `api(method, path, body)` returns `{ ok, data | code }`.
- scripts/test-lab/lab-browser.mjs exports: start, finish, open({viewport, lang}), setLang, dashboardSignIn(s), step(id, title, fn), db(sql), coverage(page, selector).
- Local DB test analog: apps/web/lib/ops/publish-label.local.test.ts (vi.mock of @opennextjs/cloudflare, staff-json, rate-book; workerSql from packages/db/test/support/worker-client; calls the publish route's POST).
- P30 runbook style: docs/runbook/p30-remove-test-classes.sql/.md; P30 proof style: scripts/p30-local-proof.sh (holds migration files aside, lab.sh reseed, fixture, script run, restore, reseed full on exit).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Database — Part A lock check, Part B drop with guard, owner delete runbook and proof, pgTAP, types</name>
  <files>packages/db/supabase/migrations/20261012250000_pricing_staff_policies.sql (git rm), packages/db/supabase/migrations/20261012250000_pricing_lock_check.sql, packages/db/supabase/migrations/20261012300000_pricing_drop_bands_premiums_rules.sql, docs/runbook/pricing-remove-bands-premiums.sql, docs/runbook/pricing-remove-bands-premiums.md, scripts/pricing-remove-bands-local-proof.sh, packages/db/supabase/tests/pricing_staff_policies.test.sql (git rm), packages/db/supabase/tests/distance_bands.test.sql (git rm), packages/db/supabase/tests/pricing_lock_check.test.sql, packages/db/supabase/tests/vehicle_class_delete_hide.test.sql, packages/db/supabase/tests/vehicle_class_lifecycle.test.sql, packages/db/database.types.ts</files>
  <read_first>packages/db/supabase/migrations/20261007250000_pricing_row_frozen_restore.sql; 20261007310000_settle_processed_checkout_grants.sql lines 570-730; 20261012200000_class_lifecycle.sql lines 1-60 and 134-260; 20260928160000_vehicle_class_delete_or_hide.sql lines 31-120; docs/runbook/p30-remove-test-classes.sql + .md; scripts/p30-local-proof.sh; packages/db/supabase/tests/pricing_staff_policies.test.sql lines 1-80 (fixture + role-switch pattern, then delete it); vehicle_class_lifecycle.test.sql lines 40-80, 215-260, 330-350.</read_first>
  <behavior>
    - pgTAP L1-L3: as admin (set local role vamos_staff + admin claims), UPDATE distance_rates / fixed_routes / surcharges setting rate_version_id from a LIVE book to the draft → throws 23001 (restrict_violation) with the new message.
    - L4: same move out of a RETIRED book → 23001. L5: as the connecting superuser (no role switch) the move out is still refused (the trigger binds everyone).
    - L6: moving a draft row INTO the live book → 23001 (unchanged behaviour).
    - L7: in-place price change on a live row (same rate_version_id) → 23001 (unchanged).
    - L8: availability-only toggle on a live row (distance_rates.available, fixed_routes.live, surcharges.active; same rate_version_id) → lives_ok and the value changed.
    - L9: toggle + move out in one UPDATE → 23001 (the carve-out does not open the move).
    - L10: draft edits still work: in-place price change on a draft row lives_ok; insert into the draft lives_ok.
    - Q1: quote_rate_book(true) JSON has no key distance_bands and no key region_premiums (both branches: with a live book, and with no live/draft book → the null-version object); it still has distance_rates, fixed_routes, surcharges, coupons, zones.
    - B1-B4: to_regclass('public.distance_bands'|'public.region_premiums'|'public.rate_version_rules') is null; hasnt_column('public','surcharges','rule_id').
    - B5: pg_get_functiondef of ops_vehicle_class_set_status and ops_vehicle_class_delete_or_hide does not mention distance_bands, rate_version_rules or rule_id; both still exist with their old signatures and grants (vamos_staff execute; anon/authenticated none).
    - G1-G5: app.pricing_assert_bands_premiums_rules_gone() exists; anon/authenticated/vamos_staff cannot execute it; lives_ok on the real schema; inside the test transaction, `create table public.distance_bands (id int)` + one row → throws_like 'pricing-bands-premiums-rules-present%'; same with an empty stand-in table → lives_ok; `alter table public.surcharges add column rule_id bigint` + one draft surcharge with rule_id = 1 → throws_like; all rolled back.
    - Fixed suites: vehicle_class_lifecycle and vehicle_class_delete_hide pass with every band/rule/rule_id fixture and assertion removed (plan() counts adjusted); their retire/delete behaviour on distance_rates and fixed_routes is still asserted.
  </behavior>
  <action>
1. `git rm` the withdrawn 20261012250000_pricing_staff_policies.sql and its test pricing_staff_policies.test.sql (never applied on live, decision item 10 withdraws item 5). `git rm` packages/db/supabase/tests/distance_bands.test.sql.

2. Part A, new file 20261012250000_pricing_lock_check.sql (per decision items 10 and 12). Header comment: what and why, decision items, "applied by the controller BEFORE the deploy; the currently live code keeps working (mapList tolerates the missing keys; no code updates rate_version_id)", "no data change, no policy change, no amounts". Two statements:
   a. `create or replace function public.tg_pricing_row_frozen()` = the 20261007250000 body copied verbatim (same RETURNS/LANGUAGE/SET search_path TO '', NOT security definer), plus: a declared `v_old_status public.rate_version_status`; at the top of the begin block, when tg_op = 'UPDATE' and new.rate_version_id is distinct from old.rate_version_id, select the status of old.rate_version_id into v_old_status; if it is distinct from 'draft' (live, retired, or invisible to the caller → null) raise exception 'pricing rows cannot leave a published rate_version (%.% id=%)' with errcode restrict_violation and a hint "Copy the row into the draft instead; a live or retired book never loses a row." Keep the existing new-book check and availability carve-out unchanged after it. Comment the why (item 12: before this, the trigger only looked at the NEW book, so a row could be moved out of a live/retired book into the draft).
   b. `create or replace function public.quote_rate_book(p_prefer_draft boolean default false)` = the 20261007310000 body byte for byte except the two `'distance_bands', …` and two `'region_premiums', …` entries are removed (null-version object and main object). Comment: "20261012250000: km bands and region % removed (decision items 10); body otherwise 20261007310000". Do not re-grant or re-comment unless the existing `comment on function` text names bands (check 20260914190000 line ~152 and 20260913180000 line ~465; if it names bands, replace the comment with the same text minus the band/region words).
   No policy changes on distance_bands/region_premiums/rate_version_rules.

3. Part B, new file 20261012300000_pricing_drop_bands_premiums_rules.sql (items 10, 13). Header: "applied by the controller AFTER the new Workers are live and AFTER docs/runbook/pricing-remove-bands-premiums.sql ran on live; one transaction; aborts with nothing applied while any row or link exists". Order inside:
   a. `create or replace function app.pricing_assert_bands_premiums_rules_gone() returns void` — plpgsql, stable, security invoker, set search_path = '' — P30 guard pattern (20261012200000 lines 18-41). It must work whether or not the tables still exist: for each of public.distance_bands, public.region_premiums, public.rate_version_rules, if to_regclass(name) is not null, run `execute format('select exists (select 1 from %s)', name)` into a boolean; if surcharges still has a rule_id column (information_schema.columns / pg_attribute check), dynamically check `exists (select 1 from public.surcharges where rule_id is not null)`. On any hit raise exception 'pricing-bands-premiums-rules-present: % — run docs/runbook/pricing-remove-bands-premiums.sql first; nothing was applied' (name the table or "surcharges.rule_id") using errcode 'P0001'. `revoke all … from public`; comment "kept so pgTAP can prove it; EXECUTE: owner only". Then `select app.pricing_assert_bands_premiums_rules_gone();`.
   b. `create or replace function public.ops_vehicle_class_set_status(...)` = 20261012200000 body verbatim minus: the `delete from public.distance_bands …` statement, the surcharges `rule_id = null` update and its comment, the `delete from public.rate_version_rules …` statement. Keep everything else (including the comment "Decision 2: the class leaves every open draft price book"). No grant changes (create or replace keeps them).
   c. `create or replace function public.ops_vehicle_class_delete_or_hide(pg_catalog.uuid, pg_catalog.text)` = 20260928160000 body verbatim minus the `or exists (… distance_bands …)` clause and the `delete from public.distance_bands …` statement. Same signature, same language/security/search_path; grants unchanged.
   d. `alter table public.surcharges drop column rule_id;` (drops its FK constraint with it; this is not CASCADE).
   e. `drop table public.distance_bands; drop table public.region_premiums; drop table public.rate_version_rules;` — explicit, no `if exists`, no CASCADE (a surprise dependency must abort the apply). Their policies, triggers, grants and identity sequences go with the tables. Keep app.rate_version_published and public.tg_pricing_row_frozen (still used).
   Before writing d/e, run `git grep -n -E "distance_bands|region_premiums|rate_version_rules|rule_id" -- packages/db/supabase/migrations` and confirm no other latest function body (by most recent `create or replace` per function) references them; record the list in the commit body.

4. Delete runbook docs/runbook/pricing-remove-bands-premiums.sql in the P30 style (header "CONTROLLER RUNS THIS on the owner's word (memory: controller has Supabase control); never an agent in a work session"; STEP 0 commented-out read-only preview: per-table counts, the books holding them with status (expect 20 distance_bands, 5 region_premiums, all in retired books 1-5; 0 rate_version_rules; 0 surcharges with rule_id not null; also list any row in a draft or live book, expected none); STEP 1 `begin;` … `commit;`): temp params table (expected_bands 20, expected_premiums 5, expected_rules 0, expected_rule_links 0); a DO guard block aborting with 'PRICING abort: … Nothing was changed.' when any count differs or when schema backup_pricing_20261014 already exists or when any of the three tables is missing (Part B already applied); `create schema backup_pricing_20261014` with `create table … as select *` copies of all rows of the three tables and of `select id, rule_id from public.surcharges where rule_id is not null`; disable only `distance_bands_frozen` and `region_premiums_frozen` by name (and `rate_version_rules_frozen` only if expected_rules > 0 — with 0 expected, leave it); delete all rows of distance_bands and region_premiums (and rate_version_rules); re-enable the same triggers inside the transaction; an assert DO block (backup counts = expected, tables empty, both triggers tgenabled = 'O', raise notice with the counts). No CASCADE, no DROP (Part B drops). Plus docs/runbook/pricing-remove-bands-premiums.md in the P30 .md style: purpose (items 10 and 13), full order (1 controller archives the rows read-only to a file on tag `archive/pricing-bands-premiums-20261014`, giving the exact SELECT … json_agg export statements; 2 Part A applied verbatim with md5 read-back; 3 deploy both Workers in the two-Worker order; 4 this script STEP 0 then STEP 1; 5 Part B applied verbatim; 6 read-backs), expected NOTICE lines, what each abort means, rollback note (rows are in backup_pricing_20261014 and on the archive tag), read-back SELECTs after Part B (to_regclass nulls, rule_id column gone, the guard function exists).

5. Local proof script scripts/pricing-remove-bands-local-proof.sh modelled on scripts/p30-local-proof.sh (lab only, refuses without the throwaway marker role, header "never on live"): hold 20261012300000 aside (refuse if it has uncommitted changes), `lab.sh reseed pricing-pol` (schema = Part A), restore the file; fixture as superuser with frozen triggers disabled by name: two retired synthetic books, 20 distance_bands rows (per_km_rappen 1, synthetic) and 5 region_premiums rows (percent 1) across them, 0 rules; then (a) psql -v ON_ERROR_STOP=1 -f Part B → must FAIL with 'pricing-bands-premiums-rules-present' and the three tables must still exist; (b) run the runbook STEP 1 (extract from `begin;` to `commit;`) → must pass, NOTICE counts 20/5/0, backup schema counts 20/5/0, tables empty, triggers enabled; (c) run STEP 1 again → must abort ('backup … already exists' or counts) with nothing changed; (d) psql -f Part B → must pass; tables gone, rule_id gone; on EXIT always `lab.sh reseed pricing-pol` back to the full schema. Print PASS/FAIL lines and exit non-zero on any FAIL.

6. pgTAP packages/db/supabase/tests/pricing_lock_check.test.sql covering the behaviour list above (fixtures as the connecting superuser, then `set local role vamos_staff` + `set_config('request.jwt.claims', …)` admin claims like the deleted pricing_staff_policies test; synthetic rappen; `begin; select plan(N); … select * from finish(); rollback;`). Fix vehicle_class_lifecycle.test.sql (remove the rate_version_rules/surcharges.rule_id/distance_bands fixtures at ~52-73 and the assertions at ~219-256 that count them; keep every distance_rates/fixed_routes/surcharge-survives assertion; adjust plan()) and vehicle_class_delete_hide.test.sql (remove the band fixture ~62 and the band count ~219; adjust plan()).

7. database.types.ts by hand (Phase 30 precedent): delete the `distance_bands`, `rate_version_rules`, `region_premiums` table blocks (Row/Insert/Update/Relationships), the three `rule_id` fields in surcharges Row/Insert/Update and the `surcharges_rule_id_fkey` relationship. Optionally try `supabase gen types typescript --db-url "$LAB_DB_URL" --schema public` and diff only to confirm nothing else changed; commit the hand edit. Then `git grep -c -E "distance_bands|region_premiums|rate_version_rules|rule_id" -- packages/db/database.types.ts` must print nothing.

8. Run (process rules 3-4): `lab.sh up pricing-pol --no-dash`, `lab.sh pgtap pricing-pol` (whole suite: every file must pass, not only the new one), then `bash scripts/pricing-remove-bands-local-proof.sh pricing-pol`. Keep the lab up only if Task 2 runs next in the same session; otherwise destroy it.

Commit: "feat(pricing): lock check, drop km bands, region % and rules (Part A + Part B), delete runbook".
  </action>
  <verify>
    <automated>cd /Users/koss/.t3/worktrees/VamosTaxi.eu/fix-pricing-staff-policies && bash scripts/test-lab/lab.sh pgtap pricing-pol && bash scripts/pricing-remove-bands-local-proof.sh pricing-pol && test -z "$(git grep -l -E 'distance_bands|region_premiums|rate_version_rules|rule_id' -- packages/db/supabase/tests packages/db/database.types.ts | grep -v pricing_lock_check.test.sql)"</automated>
  </verify>
  <done>pgTAP PASS for the full suite (Files/Tests line recorded with the clock time in the summary); proof script PASS (Part B refused with rows present, script deletes 20/5/0 with backups, rerun aborts, Part B passes after); no test or type file outside pricing_lock_check.test.sql mentions the dropped names; md5 -q of both migration files recorded in the summary; one commit.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Server and engine — remove bands/premiums/rules code, lock save path, Publish keeps the lock, tests, docs</name>
  <files>apps/web/lib/pricing/bands.ts (git rm), apps/web/lib/pricing/bands.test.ts (git rm), apps/web/lib/pricing/lines.ts, apps/web/lib/pricing/types.ts, apps/web/lib/pricing/rateBook.ts, apps/web/lib/ops/pricing.ts, apps/web/lib/ops/rate-book.ts, apps/web/lib/ops/draft-preview.ts, apps/web/lib/quote/lock.ts, apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts, apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts, apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/discard/route.ts, apps/web/lib/ops/rate-book-fork-bands-rules.local.test.ts (git rm), apps/web/lib/ops/rate-book-clone-retired.local.test.ts, apps/web/lib/ops/publish-quote-lock.local.test.ts (new), tests: apps/web/lib/ops/{rate-book-draft,rate-book-live-row-id,rate-book-extra-rule,rate-book-clone-retired,rate-book-jsonb-writers,rate-book-stored-codes,pricing,publish-public-chf,booking-change,booking-change-price,booking-trip-change,trip-change-facts,trip-change-retired-class,draft-preview-lines,draft-preview-unpaid,ops-pricing-264}.test.ts, apps/web/lib/pricing/{d15-recipe,priceQuote,priceQuote.property,public-board,eligibility,lines,party-van-luxury-12,one-form-fare-parts}.test.ts, apps/web/lib/quote/{engine,pipeline,no-extra-stop}.test.ts, apps/web/lib/checkout/{extra-wait-no-offsession,party-intent-van-luxury-12}.test.ts, docs/build/OWNER-ANSWERS.md</files>
  <read_first>rate-book route lines 1-120, 296-450, 748-800, 880-1130, 1254-1415; publish route (whole, 217 lines); discard route lines 25-45; lib/ops/rate-book.ts lines 50-160, 360-640, 700-840, 895-960; lib/ops/pricing.ts (whole); lib/ops/draft-preview.ts lines 130-185; lib/pricing/types.ts lines 105-200; lib/pricing/rateBook.ts lines 25-40, 125-160, 210-260; lib/pricing/lines.ts lines 20-40, 130-145, 575-635; lib/quote/lock.ts lines 1-45; apps/web/lib/ops/publish-label.local.test.ts (whole, the local-test pattern).</read_first>
  <behavior>
    - PUT {kind:"rule", ruleKind:"quote_lock", quoteLockHours: 48} as admin → 200, draft rate_versions.quote_lock_minutes = 2880, response data.quoteLockHours = "48"; no rate_version_rules access anywhere in the code path.
    - PUT quote_lock with hours 0, -1, "", "x", 1.5, or > 35791394 → 400 invalid, quote_lock_minutes unchanged.
    - PUT quote_lock with no draft → forks the live book into a draft (resolveWritableVersionId, same as VAT) and writes the draft only; the live book's value is unchanged.
    - PUT {kind:"rule", ruleKind:"vat", …} unchanged behaviour. PUT kind "rule" with any other ruleKind (waiting, free_wait, service_area, city_pair, lock) → 400 invalid. PUT/DELETE kind "band" → 400 invalid. A PUT of another kind carrying quoteLockHours no longer touches quote_lock_minutes.
    - GET /api/staff/rate-book returns no bands, regionPremiums, rules keys; rates carry no cityPairId; surcharges carry no ruleId; quoteLockHours = String((book.quoteLockMinutes ?? QUOTE_LOCK_MINUTES) / 60) (never empty).
    - Publish of a draft with quote_lock_minutes 2880 → live row 2880 and the new settings_versions row 2880; draft with null → 1440 on both (QUOTE_LOCK_MINUTES).
    - Discard deletes coupons, surcharges, fixed_routes, distance_rates, the draft row; no statement on the three dropped tables.
    - loadCompleteness returns only distance_rate / surcharge / fixed_route / coupon gaps.
    - forkLiveRateVersion copies distance_rates, fixed_routes, surcharges (without rule_id), coupons, and the book fields (vat, quote_lock_minutes, service area, free_wait) — nothing else.
    - priceQuote / engine output unchanged for every existing fixture (bands and premiums were never read by priceQuote since c5b5f4fe).
  </behavior>
  <action>
Work bottom-up so the type checker leads (types → engine → ops lib → routes → tests):

1. lib/pricing (item 10): `git rm` bands.ts and bands.test.ts. types.ts: remove DistanceBandRow, RegionPremiumRow and the `distance_bands` / `region_premiums` fields of the rate-book type. rateBook.ts: remove the two imports, mapDistanceBand, mapRegionPremium, and the four fields (empty book ~221-222, mapped book ~254-255). lines.ts: remove buildRegionPremiumLine (~584-630), the `distanceBands?` arg of BuildFareLineArgs (~140) and both imports; nothing else in lines.ts changes (the generic `price.surcharge.${row.code}.label` rendering stays).

2. Messages: keep `price.surcharge.region_premium.{label,rule}` in apps/web/i18n/messages/{en,de,fr,ar}.json and seed.sql untouched — the engine priced region lines 2026-09-09 → 2026-09-14 (51cc47f6 → c5b5f4fe), so a past price_snapshots.lines entry can carry code region_premium and its receipt still needs the label. `pnpm --filter @vamos/db run seed:check` must stay clean.

3. lib/ops/pricing.ts: CompletenessKind loses "rule", "band", "band_overlap"; delete the rules, bands, bandOverlap queries and their spreads; fix the doc comment ("Extra TS-only gaps (coupon) …").

4. lib/ops/rate-book.ts: remove DistanceBandRow, RegionPremiumRow, RateRuleRow types; RateBook loses distanceBands, regionPremiums, rules; SurchargeRow and SurchargeInput lose ruleId (and every `ruleId: input.ruleId ?? null`); the loader drops the bands/regions/rules queries and `s.rule_id` from the surcharge select and mapper; cloneRateVersionFrom drops the rate_version_rules, distance_bands, region_premiums inserts and the rule_id column + subselect from the surcharges insert; quoteBookDocById drops the two JSON keys. Keep quote_lock_minutes everywhere it is copied.

5. lib/ops/draft-preview.ts recapForClass: remove the "bands" and "region" codes (both arrays) and the region_premium loop line; keep start, km, extras, vat, total. (No screen reads recap: OpsPricing never calls Preview.)

6. rate-book route (items 10, 13):
   - Header comment: PUT kinds route|distance|surcharge|rule|coupon, where `rule` now means a book setting: ruleKind `vat` or `quote_lock` only.
   - DRAFT_KINDS loses "band". Delete rulePayload, cityPairRuleFor, mockBands, mockRegionPremiums, mockRules; bookPayload loses bands, regionPremiums, rules; mockRates loses cityPairId; mockSurcharges loses ruleId. quoteLockHours becomes `String((book.quoteLockMinutes ?? QUOTE_LOCK_MINUTES) / 60)` (import QUOTE_LOCK_MINUTES from @/lib/quote/lock). freeWaitHours stays as is (out of scope).
   - Delete the generic quoteLockHours pre-block in PUT (~774-787): the one writer is the explicit branch below.
   - Distance branch: delete the hidden city_pair write (`hasOwnProperty(recBody, "cityPairId")` block ~903-930).
   - Surcharge branch: drop ruleId parsing (parseSurchargeInput ~598), the draftRowId "rule" remap and `rule_id` in the update/insert SQL.
   - Delete the `kind === "band"` branch. In the `kind === "rule"` branch keep the VAT sub-branch as is; replace the rest with: ruleKind `quote_lock` → parse hours from `recBody.quoteLockHours ?? recBody.quote_lock_hours ?? payload.hours`; valid only when it is a finite whole number ≥ 1 and hours × 60 ≤ 2147483647 (integer column; no business maximum is invented), else `jsonErr("invalid", 400)`; update `public.rate_versions set quote_lock_minutes = ${hours*60} where id = ${versionId} and status = 'draft'` under asStaff; return `jsonOk(bookPayload(next, zones))` like VAT. Any other ruleKind → `jsonErr("invalid", 400)`. quoteLockMinutesFromHours/minutesFromHours: keep only what the new branch uses (remove dead helpers).
   - DELETE: drop the distance_bands and rate_version_rules table mappings and branches (kind band/rule → 400 invalid). draftRowId loses the "band" and "rule" kinds.
   - Comment the why at the quote_lock branch: "Decision 2026-10-13 item 13 (signed 2026-10-14): Pricing › Distance rules 'Price stays valid for' edits the draft's quote_lock_minutes; Publish keeps it."

7. publish route (item 13, supersedes Phase 18 D-13): `const lockMinutes = asNullableInt(row.quote_lock_minutes) ?? QUOTE_LOCK_MINUTES;` use `${lockMinutes}` in the rate_versions UPDATE (instead of `${QUOTE_LOCK_MINUTES}`) and keep `coalesce(${lockMinutes}, sv.quote_lock_minutes)` in the settings_versions insert. checkout_window_minutes stays copied from sv (not part of the signed field). Update the header comment.

8. discard route: delete the three statements on rate_version_rules, distance_bands, region_premiums.

9. lib/quote/lock.ts: rewrite the header lines 7-10 and the QUOTE_LOCK_MINUTES doc: the quote lock length is the price book's quote_lock_minutes, set by the owner on Pricing › Distance rules ("Price stays valid for") and kept by Publish (decision 2026-10-13 item 13, supersedes Phase 18 D-13); QUOTE_LOCK_MINUTES (1440 = 24 h) is the default when a book has none. Keep the quote_lock_deadline() sentence (Postgres bakes the minutes at lock time). No code change in lock.ts.

10. docs/build/OWNER-ANSWERS.md: under the per-km/bands/region table (~185-196) add one dated line: "2026-10-14: km bands and region % removed from the product (decision 2026-10-13 items 10, 13); city/canton extras on Pricing replace them. This table is history." Leave docs/audit/** and docs/runbook/p30-* as history; leave scripts/p30-local-proof.sh untouched (it replays the pre-Phase-30 schema, where the tables still exist).

11. Tests:
   - `git rm` apps/web/lib/ops/rate-book-fork-bands-rules.local.test.ts.
   - rate-book-clone-retired.local.test.ts: remove the p30_clone_test_all policy hack (create/drop on both tables and its header paragraph), the band/rule fixtures and assertions; keep and still assert: a retired class's distance_rates/fixed_routes are not copied, live classes are.
   - Every other listed test: remove band/premium/rule/ruleId/cityPairId fixtures and assertions; drop `distance_bands: []` / `region_premiums: []` from RateBook fixtures (tsc catches the rest); invert source-scan tests that asserted those names exist into "not present" checks where that adds value (e.g. pricing.test.ts: CompletenessKind has no band/rule; route source has no rate_version_rules/distance_bands/region_premiums/rule_id). Keep d15-recipe / extra-wait-no-offsession "priceQuote does not call buildRegionPremiumLine" style checks valid (the symbol is now gone everywhere — assert absence repo-wide in lib/pricing instead).
   - New apps/web/lib/ops/publish-quote-lock.local.test.ts, modelled on publish-label.local.test.ts (skipped without VAMOS_LOCAL_DB_PORT; refuses without the throwaway marker role; cleans up its own books, leaves its staff row as publish-label does): (a) PUT quote_lock 48 → draft 2880 and data.quoteLockHours "48"; (b) PUT 0, -1, "x", 1.5 → 400, value unchanged; (c) PUT ruleKind "waiting" → 400; (d) Publish a draft holding 2880 → live row 2880 and newest settings_versions.quote_lock_minutes 2880; (e) Publish a draft with null → 1440 on both; (f) PUT kind "distance" carrying quoteLockHours 99 → quote_lock_minutes unchanged.
   - Run: `cd apps/web && ./node_modules/.bin/tsc --noEmit -p .` (or the repo's `pnpm --filter web typecheck` if that is the configured name), eslint on touched files, vitest on every touched unit test file; then with the lab up (Task 1's, or `lab.sh up pricing-pol --no-dash`): `VAMOS_LOCAL_DB_PORT=<port from LAB_DB_URL> ./node_modules/.bin/vitest run --no-file-parallelism lib/ops/publish-quote-lock.local.test.ts lib/ops/rate-book-clone-retired.local.test.ts lib/ops/publish-label.local.test.ts`. Then `pnpm i18n:check`, `pnpm check:numbers`, `pnpm --filter @vamos/db run seed:check`.
   - Final grep gate (non-test source): `git grep -n -E "distance_bands|region_premiums|rate_version_rules|rule_id|ruleId|regionPremiums|DistanceBandRow|RegionPremiumRow|classBandExtrasRappen|buildRegionPremiumLine|cityPair|band_overlap" -- apps/web ':!*.test.ts' ':!apps/web/public'` prints nothing except the kept message key `region_premium` lines in apps/web/i18n/messages (the pattern above does not match them).

Commit: "feat(pricing): remove km bands, region % and rules from the engine and routes; Publish keeps the price-valid hours".
  </action>
  <verify>
    <automated>cd /Users/koss/.t3/worktrees/VamosTaxi.eu/fix-pricing-staff-policies/apps/web && ./node_modules/.bin/tsc --noEmit -p . && ./node_modules/.bin/vitest run lib/ops lib/pricing lib/quote/engine.test.ts lib/quote/pipeline.test.ts lib/quote/no-extra-stop.test.ts lib/checkout/extra-wait-no-offsession.test.ts lib/checkout/party-intent-van-luxury-12.test.ts && cd ../.. && test -z "$(git grep -n -E 'distance_bands|region_premiums|rate_version_rules|rule_id|ruleId|regionPremiums|DistanceBandRow|RegionPremiumRow|classBandExtrasRappen|buildRegionPremiumLine|cityPair|band_overlap' -- apps/web ':!*.test.ts' ':!apps/web/public')" && pnpm --filter @vamos/db run seed:check</automated>
  </verify>
  <done>tsc clean; touched unit tests green; the three local tests pass on the lab (log with exit= and clock time); grep gate empty; seed.sql unchanged; i18n:check and check:numbers pass; one commit.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Dashboard — signed price-valid field wired live, band warning and dead rules/region strings gone, browser run on the local Worker</name>
  <files>app/ops/OpsPricing.dc.html, app/vamos-ops-data.js, app/vamos-i18n-dict.js, apps/web/lib/ops/ops-pricing-lock-field.test.ts (new), apps/web/lib/ops/ops-pricing-tabs.test.ts, apps/web/lib/ops/ops-dc-p4.test.ts, apps/web/lib/ops/ops-dc-class-lifecycle.test.ts, .planning/quick/261013-pricing-staff-policies/tools/lock-field-browser.mjs (new), .planning/quick/261013-pricing-staff-policies/HANDOVER.md</files>
  <read_first>.planning/quick/261013-pricing-staff-policies/tools/render-bands.mjs lines 27-60 (signed markup and names); SIGNED.md; OpsPricing.dc.html lines 150-182 (VAT field + Distance pane), 255-270 (Publish dialog gaps + warning), 430-520 (T.en), 820-860 (state), 960-1045 (recapLine, loadVat, saveVat), 1370-1440 (bandsOverlap, regionsOverlap, gapKind, paneForGap), 1540-1550, 1640-1700 (renderVals); vamos-ops-data.js lines 900-970, 1070-1171; apps/web/lib/ops/ops-pricing-vat-field.test.ts (test pattern); scripts/test-lab/lab-browser.mjs.</read_first>
  <behavior>
    - DC source scan (new ops-pricing-lock-field.test.ts, VAT-field-test pattern): both copies exist and the served copy equals the stripped source; markup contains `data-lock-field="1"` inside the isDistance pane before the class OpsTable, with the kit Input (label tLockLabel, value lockHours, onChange setLockHours, suffix tLockSuffix, inputMode numeric) and Button (onClick saveLock, variant lockSaveVariant, disabled lockSaveOff) and `<p class="vt-field__hint" style="margin:0">{{ tLockHint }}</p>`; T.en/de/fr/ar carry lockLabel, lockSuffix, lockHint, saveLock with exactly the SIGNED.md strings.
    - Logic (vm-run the DC class like the existing DC logic tests do, or source checks if no vm harness fits): GET answer quoteLockHours "24" → field shows "24", Save ghost + disabled; typing "48" → Save primary + enabled; typing "0", "", "1.5", "abc" → Save disabled; saveLock calls VamosOps.saveDraftQuoteLock("48"/48) once and on ok the saved value becomes 48 (Save back to ghost/disabled); on a failed answer the typed value stays and Save stays primary.
    - The template has no `data-price-warn` band warning, no bandWarnDisplay/tBandOverlapWarn/bandsOverlap/regionsOverlap/bandRowsRaw/recapLine/state.recap; gapKind/paneForGap know only distance_rate, surcharge, coupon, fixed_route (and class where it existed); none of the dead T keys listed in verified_facts remain in any language.
    - vamos-ops-data.js: no bands/regionPremiums/rules collections, no cleanBand/cleanRegion/cleanRule, no ruleId in the surcharge cleaner, resetAll list without the three; new saveDraftQuoteLock(hours) PUTs {kind:"rule", ruleKind:"quote_lock", quoteLockHours: hours}.
    - vamos-i18n-dict.js: 'Class floors, km bands, region %' and 'Class floors and km bands' removed (no consumer in app/ or apps/web/public after sync).
  </behavior>
  <action>
1. OpsPricing.dc.html (items 10, 13; pictures signed 2026-10-14):
   - Publish dialog: delete the line `<p data-price-warn="1" style="display:{{ bandWarnDisplay }}">{{ tBandOverlapWarn }}</p>`; renderVals loses tBandOverlapWarn and bandWarnDisplay; delete `bandRowsRaw`, bandsOverlap(), regionsOverlap(). gapKind loses the rule/band/band_overlap branches; paneForGap loses band/band_overlap/rule.
   - Distance rules pane: insert the signed `lockField` markup from render-bands.mjs lines 35-43 right after the pane's opening `<div data-price-pane="1" data-price-swipe="1" data-scroll-native="1">` inside `<sc-if value="{{ isDistance }}" …>`, verbatim except the Button gets `variant="{{ lockSaveVariant }}" disabled="{{ lockSaveOff }}"` (ghost → primary exactly like VAT's vatSaveVariant/vatSaveOff, as stated in the planning brief). No other markup, no new CSS (inline layout styles come from the signed markup; logical properties only).
   - T: add the four LOCK entries from render-bands.mjs line 47-50 (= SIGNED.md) before each language's vatLabel line. Delete the dead keys listed in verified_facts in every language, and gapRule, gapBand, gapBandOverlap, bandOverlapWarn. Before deleting each key, `grep -n "<key>" app/ops/OpsPricing.dc.html` must show only its definitions (colRule included — the surcharge column is `colAppliesWhen`; if any key turns out to be used, keep it and say so in the summary).
   - State: add lockHours: '' and lockSavedHours: '' (strings); delete recap: null and recapLine().
   - Logic: extend loadVat's existing GET /api/staff/rate-book answer handling to also set lockHours and lockSavedHours from `json.data.quoteLockHours` (server always sends a value since Task 2; if missing, leave '' — no literal default in the DC). setLockHours mirrors setVatPercent (accepts event or value). A private `lockHoursValue(text)` returns the integer when /^\d+$/ and ≥ 1, else null. saveLock: null → return; equal to saved → return; call `window.VamosOps.saveDraftQuoteLock(n)`; on `json.ok === true` set lockSavedHours to String(n) and lockHours to the server's `json.data.quoteLockHours` when present; on failure keep the typed value (Save stays primary) — no new copy (none was signed). renderVals: tLockLabel, tLockSuffix, tLockHint, tSaveLock, lockHours, setLockHours, saveLock, lockSaveVariant ('primary' when valid and different from saved, else 'ghost'), lockSaveOff (invalid or equal to saved).
   - Keep the platform laws: no glow, no tinted yellow, `--vt-shadow-accent:none` and `.vt-input--focus{box-shadow:none}` stay in the helmet.

2. vamos-ops-data.js: delete cleanBand, cleanRegion, cleanRule and the bands/regionPremiums/rules rateBookCollection entries (~1077-1079) and their names in resetAll (~1167); delete `ruleId: str(s.ruleId)` (~926). Add `saveDraftQuoteLock: function (hours) { return api("PUT", "/api/staff/rate-book", { kind: "rule", ruleKind: "quote_lock", quoteLockHours: hours }); }` next to saveDraftVat. Update the header comment's "Draft fare-book verbs" line to name saveDraftQuoteLock.

3. vamos-i18n-dict.js: `git grep -n "Class floors, km bands, region %\|Class floors and km bands" -- app` must show only the dict lines; then delete both entries.

4. `node scripts/sync-dc-mock-to-public.mjs` (served copy is gitignored; tests read it).

5. Tests: new ops-pricing-lock-field.test.ts (behaviour list); update ops-pricing-tabs.test.ts, ops-dc-p4.test.ts, ops-dc-class-lifecycle.test.ts for the removed collections/strings (assert absence where they asserted presence). Run `cd apps/web && ./node_modules/.bin/vitest run lib/ops/ops-pricing-lock-field.test.ts lib/ops/ops-pricing-tabs.test.ts lib/ops/ops-pricing-vat-field.test.ts lib/ops/ops-dc-p4.test.ts lib/ops/ops-dc-class-lifecycle.test.ts lib/ops/ops-pricing-264.test.ts lib/ops/ops-pricing-source.test.ts`, then `pnpm i18n:check`, `pnpm lint:css`, `pnpm check:numbers`.

6. Browser run on the local Worker (memory: a DC form step needs a Chromium run against the local Worker; green tests are not enough). Process rules 3-4: `lab.sh up pricing-pol --rebuild` (dashboard Worker on), `eval "$(bash scripts/test-lab/lab.sh env pricing-pol)"`. Write tools/lock-field-browser.mjs on lab-browser.mjs (start/open/dashboardSignIn/step/db/coverage/finish; evidence to .planning/quick/261013-pricing-staff-policies/screens/lock-field-run/): 
   a. Sign in to the dashboard, open Pricing › Distance rules at 1440 en: the field reads "Price stays valid for", value "24", suffix "hours", hint text exact; Save is ghost and disabled.
   b. Type 48 → Save enabled → click → db(): newest draft rate_versions.quote_lock_minutes = 2880; reload page → field shows 48.
   c. Type 0 → Save disabled. Type 24 back → Save → 1440.
   d. Set 48 again, open Publish (admin), Publish → db(): live book quote_lock_minutes = 2880 and newest settings_versions.quote_lock_minutes = 2880; Publish dialog text contains no "Km band"/"band" and no `[data-price-warn]` element. Then restore: set the new draft's value to 24 via the field and Publish again only if the lab needs it for later runs (lab data is disposable; say what was done).
   e. No-draft case: if after (d) there is no draft, Save 30 from the live book view → a draft appears with 1800 and the live book keeps 2880; note whether the Draft mark appears without reload (record behaviour; do not add a new refresh flow — VAT behaves the same).
   f. de, fr, ar at 1440 and 390: signed strings shown; `coverage(page, '[data-lock-field]')` returns [] (if it flags the T-rendered strings, add them to vamos-i18n-dict.js with the SIGNED.md translations and re-run); Arabic `dir="rtl"`, suffix and Save on the inline-end side, no sideways scroll at 390 (`document.documentElement.scrollWidth <= innerWidth`), Save ≥ 44 px tall. Screenshots per language/size. No glow on focus/hover (computed box-shadow none on the focused input).
   Run it detached with an exit= line; then `lab.sh destroy pricing-pol`.

7. Rewrite .planning/quick/261013-pricing-staff-policies/HANDOVER.md for this scope (the old content describes the withdrawn policy fix; keep it only as a "superseded" line at the top). Sections: what changed (3 commits), migration md5s, verified / not verified / failed with clock times, and "For the controller" with:
   - Pre-ship reads (read-only, live): md5 of pg_get_functiondef('public.tg_pricing_row_frozen()'::regprocedure) = 39df856a4f7f191c1eacdfcd09b3b38a and of quote_rate_book(boolean) vs the 20261007310000 body (memory: live-vs-files schema compare); counts: distance_bands 20, region_premiums 5, rate_version_rules 0, surcharges with rule_id not null 0; books holding them all retired; `select count(*) from public.price_snapshots s, jsonb_array_elements(s.lines) l where l->>'code' = 'region_premium'` plus the same over shown_alternatives (recorded only; the label key is kept either way).
   - Order: archive tag → Part A verbatim + read-back → deploy both Workers (two-Worker order, `--env staging`) → runbook STEP 0, STEP 1 → Part B verbatim + read-back → live checks (Pricing › Distance rules shows 24; Publish dialog has no band lines; one sandbox card payment per memory "real card payment before ship").
   - Risks: (1) old code + Part A — verified compatible (mapList tolerates missing keys; no code moves rows); (2) Part B before the delete script aborts by design with nothing applied; (3) price_snapshots region_premium label kept; (4) Phase 32 migrations 20261012260000–290000 sort before Part B in a from-zero replay: before applying Part B, `git grep` those files for the three table names and rule_id (must be none); (5) the field changes only quote_lock_minutes — the payment window (checkout_window_minutes, "This price is held for {hours} hours") still comes from Settings; (6) sheet 1's stubbed "Rule" gap line cannot occur after Part B (rules dropped, item 13).
   Commit: "feat(pricing): price-valid hours on Distance rules; km band warning and dead rules strings removed".
  </action>
  <verify>
    <automated>cd /Users/koss/.t3/worktrees/VamosTaxi.eu/fix-pricing-staff-policies && node scripts/sync-dc-mock-to-public.mjs && (cd apps/web && ./node_modules/.bin/vitest run lib/ops/ops-pricing-lock-field.test.ts lib/ops/ops-pricing-tabs.test.ts lib/ops/ops-pricing-vat-field.test.ts lib/ops/ops-dc-p4.test.ts lib/ops/ops-dc-class-lifecycle.test.ts) && pnpm i18n:check && test "$(grep -v '^\s*//' app/ops/OpsPricing.dc.html | grep -c -E 'bandWarnDisplay|tBandOverlapWarn|bandsOverlap|regionsOverlap|recapLine|gapBand|gapRule|hRulePayload|emptyRulesTitle')" = 0 && test "$(grep -c -E 'regionPremiums|cleanBand|cleanRule|ruleId' app/vamos-ops-data.js)" = 0 && grep -q 'exit=0' .planning/quick/261013-pricing-staff-policies/logs/lock-field-browser.log</automated>
  </verify>
  <done>DC tests green; i18n:check, lint:css, check:numbers pass; browser run exit=0 with screenshots for en/de/fr/ar at 1440 and 390 and the db read-backs (2880 on draft, live and settings_versions; 1440 default); lab destroyed; HANDOVER.md rewritten; one commit.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dashboard admin → PUT /api/staff/rate-book | hours value typed by a signed-in admin crosses into SQL |
| Publish route → settings_versions | the draft's minutes become the live quote lock for every new quote |
| controller → live database | delete script and Part B remove rows/tables on live |
| pricing rows ↔ rate_versions status | frozen-book invariant enforced in a trigger |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261013-01 | Tampering | PUT rate-book quote_lock branch | mitigate | withAdmin (unchanged); whole hours ≥ 1, minutes within int4, else 400; bound parameter; writes only `where status = 'draft'` |
| T-261013-02 | Tampering | tg_pricing_row_frozen | mitigate | refuse any UPDATE that moves a row out of a non-draft book (item 12); pgTAP L1-L10 prove it for admin and superuser |
| T-261013-03 | Denial of service / data loss | Part B drop | mitigate | guard function aborts while any row or rule_id link exists; explicit drops, no CASCADE; one-transaction apply |
| T-261013-04 | Repudiation / data loss | owner delete script | mitigate | archive tag first, backup schema copy, count guards, one transaction, triggers disabled by name and re-enabled inside, assert block; local proof script |
| T-261013-05 | Information disclosure | guard function | mitigate | revoke all from public; pgTAP checks anon/authenticated/vamos_staff cannot execute |
| T-261013-06 | Tampering | old receipts | accept | region_premium label key kept so past snapshots still render; no snapshot row is touched |
</threat_model>

<verification>
- Task 1: full pgTAP suite PASS on the lab; local proof script PASS.
- Task 2: tsc clean, touched vitest green, three local DB tests green on the lab, grep gate empty, seed:check clean.
- Task 3: DC tests green, i18n:check/lint:css/check:numbers pass, Chromium run on the local Worker exit=0 with read-backs.
- Before handing over: `pnpm gate:local` once (detached, exit= line) — lead runs it once, not per task.
</verification>

<success_criteria>
- No code, test (outside the guard test's stand-ins), type or DC string references distance_bands, region_premiums, rate_version_rules, surcharges.rule_id, ruleId, cityPairId, band gaps or the region line.
- The signed field shows and saves on the real Worker in four languages and at 390 px; Publish keeps the value (1440 when none).
- A row cannot leave a live or retired book.
- Part A is safe under the live code; Part B cannot run before the delete script; the delete script is proven on the lab.
- Out of scope untouched: rate_versions.free_wait_minutes, Settings › Booking policy waiting, service_area_geojson and its pipeline check, no paid extra waiting.
</success_criteria>

<output>
Create `.planning/quick/261013-pricing-staff-policies/261013-pricing-remove-bands-SUMMARY.md` when done (verified / not verified / failed, clock times from `date`, migration md5s, log paths).
</output>
