# Phase 30 hand-over: vehicle class lifecycle (Draft, Live, Retired)

For the controller (T3 thread `0fbbf0c1-980e-4de3-9345-e3c8fe69811b`). Written by the Phase 30 work session on 2026-10-13. This session did not push `main`, did not deploy, did not apply a migration anywhere but its own lab, and did not read or write the live database.

## 1. Branch

- Branch `phase-30-vehicle-class-lifecycle`, pushed. Last commit: the one that adds this file (`git log -1` on the branch); all gates ran at `d2040ff0`, and nothing after it changes code (planning files only).
- `origin/main` merged in: `440e05eb` (merge of `origin/main` at `71e3b326`, checked again 2026-10-13 17:00 +04: `origin/main` is still `71e3b326` and is contained in the branch).
- Plans done: 30-01 to 30-11 (11 of 11). Per-plan commits are in `30-10-SUMMARY.md`.

## 2. Live order (decision 1, signed 2026-10-12: alternative)

The update changes no class row. It refuses with `p30-test-classes-present` while any of the five test classes exists. So the order is fixed. No work session runs any of it.

(a) Removal script, Koss runs it himself, first, on today's schema (before any Phase 30 change):
1. The controller exports the rows of the five test classes (business, economy, first, van, mahaha) and the reviews rv-1 to rv-5, read-only, and pushes them under the tag `archive/p30-test-classes-20261012` on GitHub.
2. A different model (the Sonnet `reviewer` agent) checks `docs/runbook/p30-remove-test-classes.sql` against live read-only facts. The controller also counts published reviews that are not rv-1 to rv-5 and writes the number here.
3. Koss runs the script per `docs/runbook/p30-remove-test-classes.md` (preview first, then the whole script once).

(b) The controller runs these READ-ONLY queries on live (Supabase MCP, select only) and STOPS, applying nothing, unless each answer is exactly as stated:
- b1: `select slug from public.vehicle_classes where slug in ('business','economy','first','van','mahaha');` returns 0 rows.
- b2: `select slug, name, active, hidden_at, passenger_capacity, luggage_capacity from public.vehicle_classes order by sort_order, slug;` returns exactly three rows, named Economy Sedan, Economy Van and Luxury Van, each `active = true`, `hidden_at` null and both counts set. Their slugs are not in the repo (they were made on the dashboard): the controller writes the three slugs it reads here: ____, ____, ____.
- b3: `select count(*) from public.vehicle_classes where active = false and hidden_at is null;` returns 0 (no class waiting as a Draft).
- Any other answer: stop, apply nothing, and tell Koss which rows differ.

(c) Migrations, in this order, each applied verbatim by the controller through the Supabase MCP after Ship, then read back and compared:
1. `20261012200000_class_lifecycle.sql` (file md5 `553eb1fc1f53253512b885a30beb9ef5`)
2. `20261012210000_assign_refuses_retired_class.sql` (file md5 `ecde234c29fbaa30f646ba204121a489`)
3. `20261012220000_edit_request_retired_class.sql` (file md5 `e91b66e982c950788c2ad7b57e07a755`), added in 30-10: the decision 8 check on Accept read three tables inside `asSystem`, which has no table grants on live (42501 for every paid edit request); it now calls the SECURITY DEFINER `public.booking_edit_request_class_retired(uuid)`, EXECUTE to `vamos_system` only. After apply, check whether live gave `service_role` a default EXECUTE on it (memory note "Live service_role default EXECUTE"); the repo pattern does not revoke it.

All three use Phase 30's number block (`20261012200000` onward). Read back: `pg_get_functiondef` md5 of each new or changed function against the file, and the CHECK `vehicle_classes_live_has_seats_bags` present on `public.vehicle_classes`. The first file refuses with `p30-test-classes-present` if step (a) did not run, and writes no class row. After the apply, run b2 again: the same three rows, unchanged.

(d) Worker deploy: both Workers (dashboard gateway and `vamos`), in the order the memory note "Two-Worker deploy order" gives, each pair tested locally first. Then live checks and the 4242 payment (section 8).

## 3. Decisions Koss signed

All nine 30-01 decisions were answered by Koss on 2026-10-12 (about 19:30 +04, in the question form, relayed by the controller):

1. The five old test classes right after the update: signed 2026-10-12: alternative (his removal script first; the update only checks they are gone and stops if not).
2. Retiring a class while a draft price book is open: signed 2026-10-12: recommended (retire also takes the class out of the draft book; unpublished draft prices for it are lost).
3. Paid trips with no chauffeur yet in a class you retire: signed 2026-10-12: recommended (one grey line in the Retire dialog, "1 paid trip ahead has no chauffeur yet").
4. A class you bring back and its old price: signed 2026-10-12: recommended (Go live needs a price published after the bring back).
5. A Draft class must not hold up a price change: signed 2026-10-12: recommended (its empty draft row is parked; Publish works for the others).
6. Seats and Bags in the Go live list: signed 2026-10-12: alternative (a new class starts with Seats and Bags empty; Go live waits for both).
7. The chauffeur editor when his class was retired: signed 2026-10-12: recommended (Class list offers Live classes only; the red line stays until a Live class is picked).
8. Bookings in a class you retire: signed 2026-10-12: recommended (pay links already sent still work; date, time and travellers changes refused).
9. What counts as a price for Go live: signed 2026-10-12: recommended (start fare and per-km in the live price book; a fixed route alone does not count).

Defaults taken by Koss on 2026-10-12: A, the old delete step stays in the database switched off (signed 2026-10-12: default taken); B, the unused About copy in the second About page and its four language files is left alone (signed 2026-10-12: default taken).

Pictures: sheet-11a (Seats and Bags empty, decision 6) and sheet-11b (the unassigned-trips line, decision 3), signed by Koss 2026-10-12 ~20:05 (+04); the lines are in `30-DESIGN-SIGNED.md` ("sheet-11a signed 2026-10-12 by Koss", "sheet-11b signed 2026-10-12 by Koss").

## 4. Removal script

- Files: `docs/runbook/p30-remove-test-classes.sql` and `docs/runbook/p30-remove-test-classes.md` (numbered owner steps). Proven on the lab only (`scripts/p30-local-proof.sh`, plan 30-09: "PASS | p30 proof | guard passes after script").
- Order (decision 1, signed: alternative): archive tag `archive/p30-test-classes-20261012` of the rows by the controller, Sonnet `reviewer` check of the SQL against live read-only facts, then Koss runs it per the runbook, first, before the migrations.
- Koss's steps, from the runbook: open the Supabase SQL editor for project `yaumjzvylngfjhtuffqs`, new query; run the STEP 0 preview (five classes with every `must_be_0_...` column at 0, five reviews rv-1 to rv-5); paste the script from `begin;` to `commit;` and run it once, unedited; expect the notice `P30 done: 5 classes, 5 reviews removed (...)`; on `P30 abort: ...` nothing changed, send the message; the backup stays in schema `backup_p30_20261012`; never run it a second time.
- R2: the class photos are swept by the next owner Publish (24 hour grace); the controller checks with `wrangler r2 object list` afterwards.
- For Koss to read before he runs it (runbook section "What the public site shows after rv-1 to rv-5 are gone"): if rv-1 to rv-5 are every published review, the header trust bar and the trust area under the booking card show "Guest reviews will show here once they are published.", the Trustpilot link in the booking bar disappears and the home Reviews section shows nothing. No score or count is invented.

## 5. Facts for Koss

- A new class starts with Seats and Bags empty ("—"), and Go live waits for both, as it waits for the photo and the price (decision 6, signed: alternative; sheets 11a and 11b). Seats and Bags empty never reach the website or a quote. A Live class's seats and bags can be changed but not emptied.
- Two earlier statements were wrong and are corrected: the UI-SPEC line on where the seed classes come from, and the OpsFleet list in the picture spec, which was incomplete.
- The dashboard route that deleted a class is removed. The old database delete function stays in the database, unreachable from the app (default A).
- A paid upcoming trip with no chauffeur in a retired class: Bring the class back to assign them, then retire it again. The assignment stays. Moving a chauffeur to another class does not help, because Assign only offers chauffeurs of the trip's own class (decision 3).
- A trip in a retired class cannot be moved to another date or time, or have its number of travellers changed, until the class is brought back. The booking page says "This class is not offered for this trip." (decision 8). Accept on any customer edit request for a trip in a retired class, whatever it asks for, shows the existing "Could not apply edit" line until the class is brought back (or Koss refuses the request).
- A pay link already sent keeps working for its 24 hours after a retire, and a price shown on the site just before a retire lasts its few minutes (decision 8). If he does not want such a trip, he cancels the booking.
- The chauffeur screen is now `/chauffeurs`; `/fleet` and `/fleet/chauffeurs` forward there for a signed-in admin.

## 6. Gates and lab results

All logs are under `.planning/phases/30-vehicle-class-lifecycle/evidence/logs/`. Gates ran in a clean clone of the branch (`/Users/koss/.vamos-scratch/p30-clean`, `git clone --no-local`, `CI=true pnpm install --frozen-lockfile`), because this worktree's `node_modules` are links into the main checkout and its OpenNext bundle fails on `sharp` there (the same tree builds in the clean clone).

Final run, clean clone at `d2040ff0` (`logs/clean/summary.log`, ended `all-done 2026-10-13 18:34:18 +0400`):
- `pnpm gate:local` (check:public-env, typecheck, lint:css, lint, i18n:check, check:legal-claims, check:numbers, next build, test:unit, test:db-lab): `logs/clean/gate.log` `exit=0 2026-10-13 18:30:26 +0400`. apps/web 6162 passed, 53 skipped (the database tests, run in dbtests); packages/db 14; packages/emails 293; eslint 0 errors, 6 warnings (unused disable lines); `PASS | dbtests | packages/db test/local 76/76 | apps/web .local.test.ts 11/11 + 40/40`.
- `ops-dc-arabic-count-lines.test.ts` (whole file) and `ops-pricing-tabs.test.ts`: `logs/clean/vitest-extra.log` 20 passed, `exit=0 2026-10-13 18:30:28 +0400`.
- OpenNext build (includes the web build): `logs/clean/opennext.log` `exit=0 2026-10-13 18:34:18 +0400`.

pgTAP on the native lab `p30` (`scripts/test-lab/lab.sh pgtap p30`): first run `logs/pgtap.log` `PASS | pgtap | Files=119, Tests=3561`, `exit=0 2026-10-13 16:52:57 +0400`; after the third migration (commit `c23c7800`) `PASS | pgtap | Files=120, Tests=3574` (worker-deep run, quoted in `30-10-SUMMARY.md`). No database file changed after `c23c7800`.

Types: the exact `pnpm db:types:check` (pinned CLI 2.115) needs Docker and was not run. A normalised compare (native CLI 2.119 against lab p30, both files through prettier) shows only CLI-version noise (`NonNullable<Json>`, `never` for generated columns, `Record<PropertyKey, never>` args): `evidence/types/normalised-diff.txt`.

Earlier red runs, fixed in this task (Phase 30 causes only):
- `logs/gate.log` (worktree, 16:55): db-access fences: a module-scope `Set` in `apps/web/lib/ops/console-paths.ts` (30-05) and `sql.unsafe` in `rate-book-clone-retired.local.test.ts` (30-03). Fixed `91c038dc`.
- `logs/clean-run1/gate.log` (clean clone at `91c038dc`): `system-reads.test.ts` caught the decision 8 Accept check reading tables inside `asSystem` (a live 42501 for every paid edit request; fixed `c23c7800` with the third migration), and two dynamic icon bindings (fixed `3634855f`).
- `logs/clean-run2/` (clean clone at `c23c7800`): every step exit 0.

Lab brief: `30-TEST-BRIEF.md` (18 rows), result `evidence/RESULT.md` (4 runs, lab `p30c` from the clean clone, now destroyed). 16 rows PASS (S2b and S3 after two 30-08 fixes found by the run: the Go live dialog showed stale rows after a save, fixed `e115ec8e`; focus fell to the page after GO LIVE, fixed `774be80a`; both proven in the lab), S9 and S10 PASS with notes, S16 not verified in the browser (fixture limit; pinned by `trip-change-retired-class.test.ts`). A lab run is never proof for live.

## 7. Verified / not verified / failed

Verified (local only):
- Full gates green in a clean clone at `d2040ff0` (section 6), pgTAP green on the native lab with all three Phase 30 migrations.
- The removal script and the migration guard on the lab (30-09 proof).
- The lab brief rows listed as PASS in `evidence/RESULT.md`, including Draft with empty Seats and Bags, the four-item Go live list in order, Publish with a parked Draft row, Go live, Retire (counts, reasons, focus), the Retired list, Bring back needing a new published price, `/fleet` forwards, the chauffeur flag and WITH A CLASS count, the Assign left-out line, Arabic and four widths without sideways scroll.

Not verified:
- Anything on live: b1, b2, b3, the three migrations on the live database, both Workers, the live pages, and the 4242 payment after deploy (the real proof; read `booking_payments` by status).
- `pnpm db:types:check` with the pinned CLI (needs Docker; normalised compare only).
- S16 in a browser (date change refused on a real paid trip in a retired class); unit tests only.
- D-30-03-1 (`deferred-items.md`): on a database built from the migration files, `vamos_staff` sees no rows of `distance_bands` and `rate_version_rules` (restrictive policies only). The controller checks the live policies read-only before ship; if live has the permissive policies, nothing to do.
- Whether live gives `service_role` a default EXECUTE on `booking_edit_request_class_retired` (section 2).
- Screenshots were saved, not looked at by this session (PNG reading is off here): the visual check at 1440/1024/768/390 in four languages is Koss's UAT in Hermes on staging.
- `apps/web/tests/e2e/ops-dc-chauffeurs.spec.ts` (Playwright) was not run.

Failed:
- Nothing open in Phase 30 code. Outside Phase 30 (not changed here): `dashboardSignIn` in `scripts/test-lab/lab-browser.mjs` still waits for a password field the dashboard login removed on 2026-10-08, so every lab brief needs the `/api/auth` sign-in written in `30-TEST-BRIEF.md`; and on the dashboard booking detail in Arabic the booking reference has no bidi isolation (older `OpsDetail` code).

## 8. Ship order

1. PR from `phase-30-vehicle-class-lifecycle` to `main`, reviewed by a different model on the PR (Grok 4.7 per the owner's T3 rule, Sonnet `reviewer` as fallback; this phase touches money and the database, so also the extra `reviewer` pass). CI once on the PR, or the local-gate equivalent stated in the PR (section 6).
2. Koss's Ship (his own answer in the question form).
3. Then the order of section 2: removal script by Koss (archive tag and different-model check first); the controller's read-only b1, b2, b3 with the stop rule; the three migrations verbatim, in order, read back; both Workers per "Two-Worker deploy order"; live checks (`/pricing`, `/chauffeurs`, `/fleet/chauffeurs` forward, `/about` shows the three Live classes); one 4242 4242 4242 4242 payment on the live site, then read `booking_payments` by status.
4. Before ship: the controller checks the policy finding D-30-03-1 on live (section 7) and runs `db:types:check` on a default stack (section 7).
