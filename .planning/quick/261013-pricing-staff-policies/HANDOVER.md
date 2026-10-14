# Hand-over: PR #81, remove km bands, region % and the Rules list; "Price stays valid for" box

Work session, branch `fix/pricing-staff-policies` (PR #81). Head: see "Commits" (pushed). Merged origin/main
16df8fb9 (Phase 30 #80 and Phase 31 #82 included). No main, no live, no deploy. Owner decisions:
`.planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md` items 9–15; signature: `SIGNED.md` (2026-10-14
~03:25, "okay sign"). The withdrawn v1 (permissive staff policies) is kept as `*-v1-withdrawn.md`; its
migration file is gone from the tree (never applied on live).

## What changed

| Area | Change |
|---|---|
| Database A `20261012250000_pricing_lock_check.sql` | `tg_pricing_row_frozen` also refuses an UPDATE that moves a row OUT of a live or retired book (body otherwise the live one); `quote_rate_book` no longer returns `distance_bands` / `region_premiums`. No policy change, no data change. |
| Database B `20261012300000_pricing_drop_bands_premiums_rules.sql` | Guard (`app.pricing_assert_bands_premiums_rules_gone()`, raises while any band/premium/rule row or `surcharges.rule_id` link exists); Phase 30's `ops_vehicle_class_set_status` and `ops_vehicle_class_delete_or_hide` recreated without their band/rule statements (diffed: removals only); drops `surcharges.rule_id`, `distance_bands`, `region_premiums`, `rate_version_rules`. No CASCADE. |
| Owner delete script | `docs/runbook/pricing-remove-bands-premiums.sql` + `.md` (P30 style: STEP 0 preview, count guards 0/25/0/0 from the controller's live read 2026-10-14 05:28, a guard that aborts when any band, premium or rule row sits in a book that is not retired (Grok round 2), backup schema `backup_pricing_20261014`, one transaction, the frozen triggers disabled by name and re-enabled inside, abort messages). Local proof `scripts/pricing-remove-bands-local-proof.sh` on a fixture shaped like live (0/25/0/0). `scripts/p30-local-proof.sh` deleted (Phase 30 shipped; it wrote to the dropped tables). |
| Server + engine (d06e84a1) | Band and region-premium engine code removed (bands.ts, region line, types, mappers); Publish checklist has no band/rule gaps; fork, load, document, discard and preview touch none of the three tables or `rule_id`; rate-book route: `kind:"rule"` now only `vat` or `quote_lock`, the hidden `city_pair` write and `cityPairId` gone, band saves refused; **Publish keeps the draft's `quote_lock_minutes` (1440 when null)** and copies it to the new `settings_versions` row. `price.surcharge.region_premium.*` message keys removed in all four languages and from the seed (0 live snapshots carry the line, controller read 2026-10-14); the live `content_strings` rows go in runbook step 7. |
| Dashboard (e6f50220) | Pricing › Distance rules: "Price stays valid for [24] hours" above the class table (kit Input + Save ghost→primary like VAT), live through `VamosOps.saveDraftQuoteLock`; Publish dialog: no band lines, no overlap warning; 30 dead strings × 4 languages, `vamos-ops-data.js` bands/regionPremiums/rules collections and `ruleId`, two dead dictionary entries removed. |
| Tests | New pgTAP `pricing_lock_check.test.sql` (45); `distance_bands.test.sql` and the v1 policy test deleted; Phase 30 tests that named the tables fixed; new `publish-quote-lock.local.test.ts`, `ops-pricing-lock-field.test.ts`; `rate-book-clone-retired.local.test.ts` without the `p30_clone_test_all` hack; `rate-book-fork-bands-rules.local.test.ts` and `bands.test.ts` deleted. |

## md5 (`md5 -q`)

| File | md5 |
|---|---|
| `packages/db/supabase/migrations/20261012250000_pricing_lock_check.sql` (Part A) | `e8c8a3efc2a6310f3505e243229bb55a` |
| `packages/db/supabase/migrations/20261012300000_pricing_drop_bands_premiums_rules.sql` (Part B) | `7b12ff9a95fd4f4d454fa56d7deedb56` |
| `docs/runbook/pricing-remove-bands-premiums.sql` (owner delete script) | `6689f585f1d83ce08ffd04d017d8b1c1` (round 3; was 8c2cec24…) |

## Ship order (from the runbook; controller runs all of it)

1. Read live counts (expected 0 bands, 25 premiums (5 in each retired book 1–5), 0 rules, 0 `rule_id` links) and push the archive tag.
2. Part A verbatim, one transaction; read back: `select pg_get_functiondef('public.tg_pricing_row_frozen()'::regprocedure) ~ 'pricing rows cannot leave a published rate_version';` → true; `select public.quote_rate_book(false) ? 'distance_bands', public.quote_rate_book(false) ? 'region_premiums';` → false, false.
3. Deploy both Workers (two-Worker order, `--env staging`). Old code works with Part A applied (the engine maps missing keys to empty lists).
4. Delete script: STEP 0, then STEP 1 (runbook §"Step 4 in detail").
5. Part B verbatim, one transaction; read-backs (runbook step 6): the three `to_regclass` → null; `surcharges.rule_id` column count 0; guard function present; `ops_vehicle_class_set_status` body has no `distance_bands|rate_version_rules|rule_id`; backup counts 0 / 25 / 0.
6. Message rows (runbook step 7): preview, then delete the two `price.surcharge.region_premium.*` `content_strings` rows with a backup in `backup_pricing_20261014.content_strings`.
7. Live check: Pricing › Distance rules shows "Price stays valid for 24" (live book 22 holds 1,440); Publish dialog has no band line.

## Verified (clock +04, 2026-10-14)

- 02:30 / 03:30: signing pictures rendered pre- and post-Phase 30, all 12 frames PASS (`screens/signed-pre-p30`, `screens/post-p30`).
- 04:22:55: `lab.sh pgtap pricing-pol` PASS, 121 files / 3624 tests (after one test fix, c528887a: `rappen` cast).
- 04:23:02: `publish-quote-lock`, `rate-book-clone-retired`, `publish-label` local tests: 3 files / 4 tests passed on the lab.
- 04:23:40 (old fixture 20/5, superseded by round 3 below): delete-script proof all PASS: Part B refuses with rows present; wrong count aborts with nothing changed; script deletes 20/5/0 with backups 20/5/0/0 and the 6 frozen triggers re-enabled; second run aborts; Part B applies; the two class functions name no dropped object; backup survives.
- 04:33:52 (Task 3, stubbed server): the real field at 1440 en/de/fr, 390 en/ar, 33–35 checks per frame (contract body, 200/400 paths, "0"/"1.5" refused, 44 px, no glow, no sideways scroll, rtl, Publish dialog without band line).
- 04:45:15: **real browser run on the lab Worker + database** (`tools/lab-lock-field.mjs`), 7/7 PASS: sign-in; 24 shown, Save ghost and off; edit to 48, Save primary, PUT 200 with `{kind:"rule",ruleKind:"quote_lock",quoteLockHours:48}`, draft 2,880 min, "saved" line; reload shows 48; Publish 200; live book and newest `settings_versions` both 2,880; no band text, no `data-price-warn`. The seeded lab draft was made publishable first with `tools/lab-prep-publishable.mjs` (lab only: stand-in photo path, stand-in rappen 100/10 where empty, 10 incomplete seed surcharges switched off; never a price).
- After merging Phase 31 (merge 9ac2f9bb): 04:47:57–04:49:50 `check:public-env`, `typecheck`, `lint:css`, `lint` (0 errors; 6 warnings, none in files of this branch), `i18n:check`, `check:legal-claims`, `check:numbers`, `build`, `test:unit` (web 6,327 passed / 57 skipped, emails 360, db 14): exit 0. 04:50:15–04:54:09 `lab.sh pgtap` PASS 122 files / 3,679 tests and `pnpm test:db-lab` PASS (76 + 12 + 43). Together that is the full `gate:local` on the final tree, run in two parts so the stack lock was held only for the database part.
- Stack queue: lock `~/.vamos-scratch/stack.lock` held 04:20–04:23:54, 04:37:50–04:45:29, 04:46:51–04:47:35, 04:50:10–04:54:16; every lab destroyed; no stack of this job left.

### Round 3 (Grok round 2 notes + controller 05:30 and 12:22)

- 05:27: `i18n:check` PASS (2,696 keys), `seed:check` no drift; message tests 163 files / 2,125 passed.
- 12:15:46–12:17:40, no lock: `check:public-env`, `typecheck`, `lint:css`, `lint` (0 errors, 6 warnings, none in this branch), `i18n:check`, `check:legal-claims`, `check:numbers`, `build`, `test:unit` (web 6,327 passed / 57 skipped, emails 360, db 14): exit 0.
- Lock 12:19:10–12:24:32 (owner pr81):
  - 12:22:03 `pnpm test:db-lab` PASS (76 + 12 + 43).
  - 12:23:23 delete-script proof, fixture shaped like live 0/25/0/0, **all PASS**: Part B refuses (names `public.region_premiums`), nothing applied; wrong count (26) aborts `PRICING abort: 25 region_premiums rows found, expected 26. Nothing was changed.`; **new (a3):** one region % row in the draft book aborts `PRICING abort: 1 band, premium or rule rows sit in a book that is not retired. Nothing was changed.`, nothing changed; the script deletes 0/25/0 with backups 0/25/0/0, frozen triggers on; second run aborts; Part B applies; class functions name no dropped object; backup survives (0/25).
  - 12:24:21 `lab.sh pgtap` PASS 122 files / 3,679 tests (after the seed count fix below). Lab destroyed, lock released.
- The full `gate:local` ran on the final tree in two parts (no-stack part, then pgTAP + `test:db-lab` under the lock). The proof script and `seed_idempotent.test.sql` changed after the no-stack part; neither is read by those steps.

## Not verified

- Nothing on live. No live counts read by me (controller's step).
- Widths 1024 and 768; German/French at 390 (1440 checked).
- Phase 32's migrations (not on main yet) were not checked against the three dropped tables and `rule_id`; grep them before Part B if Phase 32 lands first.
- A different-model review: not run here (controller runs Grok on PR #81).

## Failed (all fixed, nothing failing now)

- 04:21: pgTAP `pricing_lock_check` 29/45: `is(rappen, integer)` type mismatch → cast (c528887a).
- 04:39–04:44: lab browser run: the shared `dashboardSignIn` helper needs a password form the login no longer shows → the run signs in with the emailed 6-digit code, minted via the lab's local admin API; Publish refused the seeded incomplete draft → lab-only prep script.
- 12:21 (round 3): proof check (a) still expected the refusal to name `distance_bands`; with 0 bands Part B names `region_premiums` first (correct behaviour) → check updated. pgTAP `seed_idempotent` test 33 pinned 2,706 content strings; the two removed keys make 2,704 → pin and note updated.
- 05:49: run died (network) while waiting for the stack lock; nothing was half-applied (no lab was up).
- 04:19: the stopped Task 1 agent's waiter started `lab-pricing-pol` without the queue (collided with PR #82); the agent was stopped at 04:20, the lock taken.

## Open items for the controller / owner

1. **New dashboard copy not in the signed pictures** (field states): en "Enter whole hours, 1 or more." / "Could not save. Try again." / "Saved in the draft." (de/fr/ar in `app/ops/OpsPricing.dc.html` T blocks, `lockError`, `lockSaveError`, `lockSaved`). Needs his word or a change.
2. **Message rows on live (resolved in code, one live step left):** controller read 0 snapshots with `region_premium` (2026-10-14), so the two `price.surcharge.region_premium.*` keys left en/de/fr/ar and the seed. Live `content_strings` still holds the two rows until runbook step 7 (preview, backup to `backup_pricing_20261014.content_strings`, delete). Kept on purpose: `docs/runbook/p30-remove-test-classes.*` (Phase 30's shipped record) and `docs/audit/2026-vamos-audit.md` (dated audit) still name the tables; pgTAP/unit tests name them only to assert they are gone.
3. **Customer wording vs the new hours:** checkout's "This price is held for {hours} hours" comes from Settings (checkout window), not from this field, so it stays 24 when he sets another value here. Say so to him; a follow-up could tie them.
4. Signed sheet 1's "after" showed one Rule gap line; with rules removed (item 13) no rule gap can appear, so the shipped dialog has none.
5. The shared `scripts/test-lab/lab-browser.mjs` `dashboardSignIn` still expects a password form; other lab runs will fail the same way (this job's script carries the code sign-in).

## Commits (branch, after origin/main 12dbd1aa / 16df8fb9 merges)

0ec5ee87 plan + signature + sheets · 216ca39a database · d06e84a1 server + engine · c528887a pgTAP fix · e6f50220 dashboard · 7c7079e9 task 3 notes · 8092b396 lab scripts · 9ac2f9bb merge origin/main (Phase 31) · 207d2489 hand-over · then round 3 (live counts 0/25/0/0, not-retired guard, region_premium keys removed, `scripts/p30-local-proof.sh` deleted, seed count pin, hand-over).
