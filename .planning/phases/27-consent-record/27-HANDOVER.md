# Phase 27 hand-over: consent record

Read this first. One gate is red and it is ours.

## BLOCKER (ours, stated first)

`apps/web/tests/integration/auth-flows.spec.ts` and `auth-confirm-email.spec.ts` do not pass as committed.

- Cause: since 27-15 (D-03a) a sign-up first writes the agreement record through the database. `next dev` has no database binding in `apps/web/wrangler.jsonc` (the top level has no `hyperdrive` block; `getPlatformProxy` returned `undefined` for both bindings). So under `next dev` every sign-up answers 503 `signup-unavailable` and the page says "Could not send the link. Try again." This is the same fail-closed rule that is right on the live Worker.
- Proof it is only the missing binding: with a temporary top-level Hyperdrive block pointing at the port 59322 stack (reverted afterwards, not committed), the tick and the record work in a real browser.
- The specs also hard-code ports 54322 and 54324 and expect mail in Mailpit. This worktree may not touch those ports, and the 59322 stack sends mail through the hook (not Mailpit). So I ran temporary copies with the ports, the hook and the binding changed. The copies are deleted. What is committed was never run as it stands.
- Not a one-line fix. It needs a decision by the control session: give `next dev` a dev database binding, or point these two specs at a stub for the record. The Worker e2e (row 17) is unaffected and proves D-03a on a real Worker build.
- Three more faults in the same two specs are older than Phase 27 (main has the same code and the same page): `getByLabel("Password")` matches the show/hide eye button too (strict-mode error; the eye is on main), the button is now "CREATE ACCOUNT" (confirm-email still looks for "Create an account"), and the sent page says "Send another link" (confirm-email looks for "Send a new link"). With those three swapped in the temporary copy the confirm-email test passes. The D-09 German test has the same eye clash.
- The tests are also flaky under `next dev`: the form is filled before the page has hydrated and the fields are cleared. With `--retries=3` every test in `auth-flows` passed at least once, one run needed retries.

Result of the temporary copies (component-1440, one worker): auth-flows 11 of 11 passed across attempts (two flaky, D-09 only after the selector swap); auth-confirm-email 1 of 1 passed after the three selector swaps.

## Final commit

- Branch: `gsd/phase-27-consent-record` in `/Users/koss/Developer/vamos-wt/phase-27`.
- Code tip before this hand-over: `e6c606cb` (the merge of origin/main). The hand-over commit is the tip of the branch (`git log -1`).
- origin/main merged: `3b4f86d826829c7f7031e95624c1e6876b3a7a4a` (`git merge-base --is-ancestor origin/main HEAD` exits 0 after a fetch).
- Ship day: 2026-09-30 (Zurich). `CONSENT_POLICY_VERSION` and `CONSENT_UPDATED` are both `2026-09-30`. If the ship slips, change both, the test enforces equality.
- 85 commits ahead of origin/main. Nothing pushed, deployed or applied to the hosted database.

## Checks

Run once, on the merged tree, by this plan only. Stack: local port 59322 only. Docker, port binds and the browser needed the sandbox off. All commands from `/Users/koss/Developer/vamos-wt/phase-27`.

| # | Command | Result | On origin/main too? |
|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | pass, already up to date | n/a |
| 2 | `pnpm test:unit` | pass: web 290 files passed, 1 skipped, 2914 tests passed, 1 skipped; emails 9 files, 138 tests; db 2 files, 13 tests | n/a |
| 3 | `bash scripts/local-stack-27.sh reset` (from-zero replay) | pass: 118 migrations applied in order, seed loaded | n/a |
| 4 | `bash scripts/local-stack-27.sh test` (full pgTAP) | pass: 85 files, 1938 tests, "Result: PASS". `signup_agreement_grant`, `account_agreement_records`, `consent_choice_reader` ok. `extensions.test.sql` ok too (role passwords were unset at that point) | n/a |
| 5 | `VAMOS_LOCAL_DB_PORT=59322 pnpm --filter @vamos/db exec vitest run test/local/consent-reader.test.ts test/local/signup-agreement.test.ts test/local/checkout-account.test.ts` | consent-reader and signup-agreement pass (6 tests). checkout-account: 3 tests fail with `password authentication failed for user "vamos_edge"`, run before the role passwords were set. Local-only, known (27-01, 27-15) | local-only: the roles have no password by design |
| 6 | `pnpm typecheck` | pass | n/a |
| 7 | `pnpm lint` | pass, 0 errors, 6 warnings (unused eslint-disable lines in files 27 did not add, plus `vamos-consent.test.ts:12`) | n/a |
| 8 | `pnpm lint:css` | pass | n/a |
| 9 | `pnpm check:numbers` | pass | n/a |
| 10 | `pnpm check:legal-claims` | pass (3 checks) | n/a |
| 11 | `pnpm check:public-env` | pass | n/a |
| 12 | `pnpm check:db-fences` | pass (8 checks, 966 files) | n/a |
| 13 | `pnpm i18n:check` | pass (2673 keys) | n/a |
| 14 | `pnpm db:seed:check` | pass, no drift, so no seed regeneration and no count change | n/a |
| 15 | `node_modules/.bin/supabase gen types typescript --local --schema public --workdir /tmp/vamos-sb27 \| diff -q - packages/db/database.types.ts` | pass, identical (not `pnpm db:types:check`) | n/a |
| 16a | `pnpm build` | pass | n/a |
| 16b | `pnpm --filter web exec opennextjs-cloudflare build` | pass, `.open-next/worker.js` built | n/a |
| 17 | `apps/web/tests/e2e-worker/run.sh /Users/koss/Developer/vamos-wt/phase-27 /tmp/vamos-sb27 <hook-secret-path> p27` (with `SB_API_PORT=59321 SB_DB_PORT=59322 SB_DB_CONTAINER=supabase_db_vamos-taxi-270` and a `supabase` wrapper on PATH) | pass: 50 PASS, 0 FAIL, 1 N/A (d2: no Stripe key on the local Worker, expected). 1a0 pass: sign-up without the tick refused, no account, no record. 1a pass: exactly 1 agreement record, matching. 1b pass: confirm link gives a session, 0 consent_log rows (D-01). 3b pass: unknown address on the sign-in link, same answer, no mail, 0 accounts (D-36). 3 and 4 pass: known address gets a session. Also pass: checkout scenarios 7a-7d, 8-11b, German G1-G8 | n/a |
| 18a | `pnpm exec playwright test tests/integration/consent-banner-27.spec.ts --project=component-390 --workers=1` | pass, 9 of 9 | n/a |
| 18b | `pnpm exec playwright test tests/integration/signup-agreement-27.spec.ts` (all four projects) | pass, 56 of 56 | n/a |
| 18c | `auth-flows.spec.ts` and `auth-confirm-email.spec.ts` | FAIL as committed, see BLOCKER. Passed only as temporary modified copies | the three selector faults are on main; the missing binding is ours |
| 19 | must-not greps, added lines of `git diff origin/main...HEAD` | pass: `sk_live_`, `vamostaxi.eu`, `1595596972063765`, `fbq(` appear only in planning documents that forbid them; `fbevents` appears in planning documents and in one test assertion that forbids it (`vamos-consent.test.ts`). No code line | n/a |
| 20 | `git grep` `META_LEGAL_GATE_OPEN = false as const` in `apps/web/lib/meta` | pass, still false (`legal-gate.ts:6`) | n/a |
| 21 | `git grep` `record_consent\|recordConsent` in `apps/web/lib/auth`, `apps/web/app/api/auth` (no tests) | pass, empty | n/a |
| 22 | `git grep` `signup_consent` in `apps/web/lib`, `apps/web/app` (no tests) | pass, empty | n/a |
| 23 | `git diff --numstat origin/main...HEAD` on quote, checkout, stripe webhook, pricing, checkout page, confirmation, checkout components | pass, exactly `1 1 apps/web/app/[locale]/checkout/checkout.css` and nothing else | n/a |

Two things I changed to get a clean run, both ignored build output, nothing committed:

- `apps/web/lib/supabase/service-role-laws.test.ts` walks every `.js` file under `apps/web` except a short skip list. Leftover Next build folders (`.next-consent-27-*`, `.next-locale-follow`, `.next-pay-link-visual`, 4 MB pages) made one regex spin forever and the whole unit run hung. I deleted those folders; the test then passed. Any executor that runs Playwright leaves them behind again. The test should skip `.next-*`. Not fixed here (not one line in a Phase 27 file).
- Playwright rewrites `apps/web/tsconfig.json` and `apps/web/next-env.d.ts`; both restored.

### Known reds that are not ours

| Red | Evidence |
|---|---|
| visual "SiteFooter default" and RouteSummary x8 | owner-ruled, not run |
| SiteHeader 390 | macOS effect, not run |
| `locale-follow-26-3.spec.ts:164` "DC pages still 308 away from a locale prefix" | not fixed on main: the spec on main still expects 308 from `/de/about`, and main's SEO ship (`1fd43a51`) made `/de/about` a real address. Not run here |
| `packages/db/test/local/checkout-account.test.ts` (3 tests) | `vamos_edge` has no password until set by hand; local-only |
| `auth-confirm-email.spec.ts` three selectors, `auth-flows.spec.ts` D-09 eye clash | same code on main, see BLOCKER |

I could not run these on origin/main (no second stack allowed), so "on main too" rests on the unchanged code and the reasons above.

## Owner-text promises, one test each

| Promise (Meta texts, sections 1-3) | Test |
|---|---|
| The three owner texts are used word for word | `apps/web/lib/consent/owner-texts.test.ts` |
| "If you accept, Meta may measure": Accept writes marketing true | `apps/web/tests/unit/consent/route.test.ts` |
| "You can refuse": Necessary only writes everything off, no Turnstile | `apps/web/tests/unit/consent/route.test.ts` and the mock banner pin (e) in `apps/web/lib/consent/mock-banner.test.ts` |
| "Change your choice at any time in Cookie preferences": the footer opens the sheet, Save writes a new row | `apps/web/components/consent/reserve-and-footer.test.ts`, `banner-contract.test.ts`, pgTAP `consent_choice_reader.test.sql` R4; browser: `consent-banner-27.spec.ts` case C |
| "Withdraw at any time": a later Necessary only wins, and a choice as of a time is read correctly | pgTAP `consent_choice_reader.test.sql` R3, R5, R6 |
| "Set only after you accept", page-view and Purchase lines | NOT built in this phase (28 and 29). Proof that nothing is sent: `apps/web/lib/meta/legal-gate.test.ts` "no fbevents.js" and "flag off"; `META_LEGAL_GATE_OPEN` is false |

## Not verified

- Owner UAT below, on staging.
- No lawyer has read the texts (decision file `.planning/decisions/2026-09-30-meta-wording.md`).
- The two committed Playwright specs `auth-flows` and `auth-confirm-email` (see BLOCKER).
- The three tests in `packages/db/test/local/checkout-account.test.ts` were red in this run (role passwords). Those functions are covered by pgTAP and by the Worker e2e.
- Hosted database: nothing read or written.
- D-03a: built by 27-17 (grant), 27-15 (server) and 27-16 (page). Proven by unit tests, pgTAP, the Worker e2e (1a0, 1a, 1b) and `signup-agreement-27.spec.ts` (56 of 56). D-36: built by 27-18, proven by unit tests, the Worker e2e (3b) and, in the modified copy, the browser test for an unknown address.
- Known over-description between the 27 and 28 ship: the privacy text says Meta records page views after Accept while no pixel loads yet. Nothing is sent. 28 makes it true.
- `VamosLocale.coverage` was not run in a browser by this plan; 27-16 ran it in `signup-agreement-27.spec.ts` (Arabic case D) and it passed.
- The real timing floor of the sign-in link was measured on the Worker e2e (known 1323 ms, unknown 1233 ms), not against hosted.
- Right-hand hero photo missing in static serving (older, unrelated, noted by 27-16).
- The review gallery `?ck-gallery=1` on the cookies page is reachable on the live site. It shows the six banner states with labels. It writes nothing. Decide whether to keep it after the owner has signed the UAT.

## Not in this phase

- D-37 (owner, 2026-09-30): a person who verifies a sign-in link without an account lands on a finish-your-account step (first name, last name, optional phone, the account notice and the tick). The Sign up form also asks for an optional phone number. This is a follow-up job right after the 27 ship, with its own UI-SPEC for the owner to sign. Until then D-36 holds: the sign-in link for an unknown address sends nothing and makes no account, and the person uses Sign up.
- The Meta pixel, `_fbp` and `_fbc`, and opening the legal gate: phase 28.
- The server Purchase event: phase 29.

## Migrations

Both are new files; both are safe on real bookings.

1. `20261002100000_consent_choice_reader.sql`: a read-only function. No table, no column, no data change, no grant on any table. Local `pg_get_functiondef` md5 is `e6bc2f771c9bdff2ab23ee636034d749` (27-01). After hosted apply, read back the same md5.
2. `20261002110000_signup_agreement_grant.sql` (27-17): one EXECUTE grant on `record_account_agreement` to `vamos_system`. No table grant, no DDL, no data change.

Hosted apply is the control session's job: the verbatim files, no other tool.

ORDER, in plain words: the grant migration goes on hosted BEFORE the Worker with this code serves traffic. Without it every sign-up on the site answers "Could not send the link. Try again." because the record fails closed. The grant is harmless before the code is live. Apply both migrations first, then deploy.

Main added later migrations (`20261005100000`, `20261005110000`, `20261007100000`). They replayed after ours with no conflict in the from-zero run.

## Pre-ship hosted read-only checks

For the control session, read-only SQL on the hosted project:

1. `select rolbypassrls from pg_roles where rolname = 'postgres'` must be true. If not, the reader returns 0 rows and the banner always asks (27-RESEARCH A1).
2. Before apply: `select count(*) from public.consent_log` and `select count(*) from public.account_agreement_records`. Write both numbers down.
3. After apply, the reader: `select has_function_privilege('anon','public.consent_choice(text,timestamptz)','EXECUTE')` must be true. `select has_function_privilege('authenticated','public.consent_choice(text,timestamptz)','EXECUTE')` must be false.
4. After apply, the grant:
   - `select has_function_privilege('vamos_system','public.record_account_agreement(text,uuid,text,text,text,text,text,inet)','EXECUTE')` true.
   - `select has_function_privilege('vamos_checkout','public.record_account_agreement(text,uuid,text,text,text,text,text,inet)','EXECUTE')` true.
   - `select has_function_privilege('anon','public.record_account_agreement(text,uuid,text,text,text,text,text,inet)','EXECUTE')` false.
   - `select has_function_privilege('authenticated','public.record_account_agreement(text,uuid,text,text,text,text,text,inet)','EXECUTE')` false.
5. After apply: both counts from step 2 are unchanged.

## New settings

- `CONSENT_POLICY_VERSION` = `2026-09-30` (`apps/web/lib/consent/policy.ts`) and `CONSENT_UPDATED` = `2026-09-30` (`app/vamos-legal-updated.js`). If the ship day differs, change both.
- `ACCOUNT_NOTICE_VERSION` stays `2026-09-29` (its text did not change). `LEGAL_UPDATED` for terms, cancellation and imprint stays.
- No new environment variable, no new secret.
- The Turnstile site key is now injected on every mock page.
- `META_LEGAL_GATE_OPEN` is still false.
- Planner choice, not an owner decision: the `signup_consent` metadata flag is no longer written (27-18). Nothing read it after 27-02, and the agreement is now recorded at the ticked submit. Old users keep the stored value. The owner can have it put back.
- Behaviour change by owner decision D-36: "Email me a link" on /sign-in no longer creates an account for an unknown address.

## Unused dictionary strings for the control session

This phase deleted nothing from `app/vamos-i18n-dict.js`. Nothing outside the dictionary uses these (line numbers at the 27-11 head; grep evidence in `27-11-SUMMARY.md`):

- 1813 `Reset my choice`
- 1816 `Resetting clears the record and brings the banner back, ...`
- 1834 `Nothing in this category is running today. It is here because ...`
- 1835 `Marketing - off, and currently unused`
- 295 `Measures which advert brought you here. Nothing in this category is running today.`
- 291 old banner body (`Strictly necessary cookies keep the booking flow working. ...`). The similar line 1784 is still used by `privacy.dc.html:300`; keep it.
- 1836 is still needed; do not remove.

## Control session after deploy

The banner now sits on checkout, so the payment path gets its own proof (CLAUDE.local.md rule 8).

1. Make one test payment with card 4242 4242 4242 4242 through /checkout on the deployed site. Do it twice: once with the banner answered by Necessary only, once with the banner left unanswered.
2. Read `booking_payments` grouped by status. The new payment must be there as paid.
3. Read `consent_log` read-only for the rows of step 1.
4. Make one sign-up on /sign-up with the tick. Read `account_agreement_records` read-only: one new row with surface sign-up, and no new `consent_log` row from it.

## Tests changed on purpose

- `apps/web/lib/live-no-tbc.test.ts`: changed on purpose in this phase (see `27-11-SUMMARY.md` and the git log of the file for the exact pin).
- `apps/web/lib/legal-updated.test.ts`: consent date pinned equal to `CONSENT_POLICY_VERSION`.
- `apps/web/lib/meta/legal-gate.test.ts`: pins moved to the consent date and the flag-off rule; Meta needles built from parts.
- `apps/web/components/consent/banner-contract.test.ts`: new banner contract.
- `apps/web/lib/consent/record.test.ts`: the pending-flag pin is now "the flag is gone".
- `apps/web/tests/unit/auth/signup-consent.test.ts`: sign-up carries the tick.
- `apps/web/lib/auth/run.test.ts`: changed for 27-18 (the sign-up path no longer writes the flag).
- `packages/db/supabase/tests/account_agreement_records.test.sql`: "record: no other role" no longer lists `vamos_system`.
- `apps/web/app/api/auth/checkout-route.test.ts`: the sign-in link case expects no account (D-36).
- `apps/web/tests/unit/auth/dashboard-no-signup.test.ts`, `cookies-dropped.test.ts`: sign-up bodies carry the tick.
- Worker e2e `1a0`, `1a`, `1b`, `3b`.
- `auth-flows.spec.ts` (tick the box; the sign-in link test uses an existing account) and `auth-confirm-email.spec.ts` (tick the box). See BLOCKER.
- `packages/db/supabase/tests/seed_idempotent.test.sql`: counts follow the regenerated seed (27-11). No drift now, so no change in this plan.

## Owner UAT

Run on staging after the control session deploys. Use a private window each time. Do each numbered check at 1440, 1024, 768 and 390 wide, in English, then German, then Arabic. If a step fails, tell the control session the step number.

1. Open vamostaxi.site/about. Expect: the banner shows your banner text and a "Cookie policy" link.
2. Press ACCEPT ALL. Expect: the banner closes. Reload. It stays closed.
3. Click "Cookie preferences" in the footer. Expect: the sheet opens with Marketing on. Switch Marketing off, press SAVE CHOICES. Expect: the sheet closes.
4. Open /cookies. Expect: "Your current choice" shows Marketing off and today's date. No "Reset my choice". Section 06 shows your Meta row.
5. Open /privacy. Expect: section 04 ends with your Meta line.
6. In a new private window start a booking and go to /checkout at 390 wide. Expect: the banner shows, and PAY is fully visible above it.
7. Open a pay link at 390 wide. Expect: the banner shows, and PAY can be scrolled above it.
8. Open the dashboard. Expect: no banner.
9. Switch to Arabic. Expect: the banner sits on the start side, text runs right to left, and `_fbp` and `_fbc` read left to right.
10. Switch to German at 768 wide. Expect: nothing is cut off and nothing scrolls sideways.
11. The control session reads `consent_log` read-only. Expect: your Accept row (marketing true), then your Save row (marketing false), both under the new version.
12. Open vamostaxi.site/sign-up. Expect: under the fields a tick box reads the same sentence as "Create an account" on checkout, with Terms and Privacy notice as links.
13. Fill the fields, leave the box empty, press CREATE ACCOUNT. Expect: nothing is sent, and the line "Tick the box to accept the Terms and confirm the Privacy notice." shows under the box.
14. Tick the box, press CREATE ACCOUNT. Expect: "Check your email". The control session reads `account_agreement_records` read-only: one new row, surface sign-up, and no new `consent_log` row from the sign-up.
15. On /sign-up press "Sign up with a link instead". Expect: the same tick box is there and is needed.
16. Open the Sign in tab and the dashboard sign-in. Expect: no tick box.
17. Open /sign-up in German and in Arabic at 390 wide. Expect: the sentence wraps, nothing is cut, nothing scrolls sideways.
18. On /sign-in press "Email me a link instead", type an address that has no account, press EMAIL ME A LINK. Expect: the same "Check your email" page as always, no mail arrives, and the control session finds no account for that address.
19. Do the same with your own existing address. Expect: the mail arrives and the link signs you in.

If a step fails: steps 1-11 the banner (this phase, 27-04 to 27-12), steps 12-17 the sign-up tick (27-16, 27-15), steps 18-19 the sign-in link (27-18). The control session fixes on a new job branch.
