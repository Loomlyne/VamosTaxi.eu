# Phase 27 hand-over: consent record

Read this first. One gate is red and not ours: Worker e2e `a3` (see the table, row 17). The auth specs (18c) are closed, see the section below.

## Blocker closed: the two auth specs (was: red as committed)

`auth-flows.spec.ts` and `auth-confirm-email.spec.ts` now pass as committed on this worktree's own stack (port 59322, Mailpit 59324). Cause and fix:

- Cause: since 27-15 (D-03a) a sign-up writes the agreement record through `asSystem` -> `env.HYPERDRIVE_NOCACHE`, and `next dev` read only the top-level wrangler config, which has no hyperdrive block. Every sign-up answered 503 `signup-unavailable`. The fail-closed rule is right on the live Worker and stays.
- Fix: `apps/web/next.config.ts` passes `{ environment: process.env.VAMOS_DEV_WRANGLER_ENV }` to `initOpenNextCloudflareForDev` only when that variable is set (dev only; unset is the old call). Both specs start Next with `VAMOS_DEV_WRANGLER_ENV=staging`, whose env declares HYPERDRIVE and HYPERDRIVE_NOCACHE. Ports are overridable: `VAMOS_TEST_DB_PORT` (default 54322), `VAMOS_TEST_MAIL_PORT` (default 54324), `VAMOS_TEST_SUPABASE_WORKDIR` (for `supabase status`). When `VAMOS_TEST_DB_PORT` is set the two `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_*` variables point the bindings at that port. Shared code: `apps/web/tests/support/dev-binding.ts`.
- Mail: the stack script has a new subcommand `bash scripts/local-stack-27.sh start-mailpit` (same stack, send_email hook off, so auth mail lands in Mailpit on 59324). Stop and start again to switch back to `start`.
- Selector faults fixed (same code on main): the Password field is `getByRole("textbox", { name: "Password" })` (the show/hide eye also matched the label; the same clash in the D-09 German test in `auth-flows`), the button is "CREATE ACCOUNT", the sent page says "Send another link".
- Other test-side faults found on the way, fixed in the two specs: `auth-confirm-email` had no project guard (it ran once per viewport project on one port); the staging env adds `AUTH_RATE_LIMITER` (10 auth posts per 60 s per IP), so each test now presents its own `cf-connecting-ip`; `next dev` starts the Worker bindings without awaiting them, so the first request can get a 500 (probe `waitForDevBindings` before the tests); pages are warmed and sign-up waits for `networkidle` because fields filled before the page re-renders are cleared (the old hydration flake).
- Run the two files one after the other (`--workers=1`). Together in parallel they start two `next dev` in the same `apps/web/.next` and one of them never becomes ready (seen once: confirm-email "did not become ready"). Not changed here.
- Also verified after the change: `pnpm typecheck`, `pnpm lint` (0 errors, 6 warnings as before) and `pnpm build` (passes; the init is gated on `NODE_ENV=development`, so a build never selects the staging env).

## Final commit

- Branch: `gsd/phase-27-consent-record` in `/Users/koss/Developer/vamos-wt/phase-27`. The hand-over commit `docs(27-14): gate run after the 2026-10-01 merge` is the tip (`git log -1`); the code tip before it is `46ab9d1e` (merge of origin/main `f37cc0b4`).
- origin/main merged: `f37cc0b4373cf6c0cfbdd63aebe896529a2c199e`, no conflict (`git merge-base --is-ancestor origin/main HEAD` exits 0 after a fetch).
- Ship day: 2026-10-01 (Zurich). `CONSENT_POLICY_VERSION` and `CONSENT_UPDATED` are both `2026-10-01` (b69d0593). `LEGAL_UPDATED` stays `2026-09-30`. If the ship slips, the control session moves both constants; a test forces them equal.
- Lenis merge note: main removed Lenis from every mock and the Next pages (561d1647, native scrolling). The merge had no conflict in Phase 27 files. The banner still shows on mock /about: `consent-banner-27.spec.ts` case D passes in the browser, and so does case G (/de/about).
- 78cb0e1b dev-binding note: `next.config.ts` passes the `staging` wrangler env to `initOpenNextCloudflareForDev` only when `VAMOS_DEV_WRANGLER_ENV` is set (opt-in, dev only; the default call is unchanged; `pnpm build` never selects it). The two auth specs set it. Pending the control session's yes or no to keep it.
- Nothing pushed, deployed or applied to the hosted database.

## Checks

Gate run 2026-10-01 (00:15 to 00:45 Zurich) on the tree after the merge of `f37cc0b4`, once, by this plan only. Stack: local port 59322 only. Docker, port binds and the browser needed the sandbox off. All commands from `/Users/koss/Developer/vamos-wt/phase-27`.

| # | Command | Result | On origin/main too? |
|---|---|---|---|
| 1 | `pnpm install --frozen-lockfile` | pass, already up to date | n/a |
| 2 | `pnpm test:unit` | pass: web 304 files passed, 1 skipped, 3009 tests passed, 1 skipped; emails 12 files, 151 tests; db 2 files, 13 tests | n/a |
| 3 | `bash scripts/local-stack-27.sh reset` (from-zero replay) | pass: 120 migration files applied in order, seed loaded | n/a |
| 4 | `bash scripts/local-stack-27.sh test` (full pgTAP) | pass: 87 files, 1975 tests, "Result: PASS" (run before role passwords were set) | n/a |
| 5 | `VAMOS_LOCAL_DB_PORT=59322 pnpm --filter @vamos/db exec vitest run test/local/consent-reader.test.ts test/local/signup-agreement.test.ts test/local/checkout-account.test.ts` | consent-reader and signup-agreement pass (6 tests). checkout-account: 3 tests fail with the `vamos_edge` password, run before the passwords were set. Known, local-only | local-only |
| 6 | `pnpm typecheck` | pass | n/a |
| 7 | `pnpm lint` | pass, 0 errors, 6 warnings | n/a |
| 8 | `pnpm lint:css` | pass | n/a |
| 9 | `pnpm check:numbers` | pass | n/a |
| 10 | `pnpm check:legal-claims` | pass (3 checks) | n/a |
| 11 | `pnpm check:public-env` | pass | n/a |
| 12 | `pnpm check:db-fences` | pass (8 checks, 985 files) | n/a |
| 13 | `pnpm i18n:check` | pass (2676 keys) | n/a |
| 14 | `pnpm db:seed:check` | pass, no drift | n/a |
| 15 | `node_modules/.bin/supabase gen types typescript --local --schema public --workdir /tmp/vamos-sb27 \| diff -q - packages/db/database.types.ts` | pass, identical | n/a |
| 16a | `pnpm build` | pass | n/a |
| 16b | `pnpm --filter web exec opennextjs-cloudflare build` | pass, `.open-next/worker.js` built | n/a |
| 17 | `apps/web/tests/e2e-worker/run.sh <tree> /tmp/vamos-sb27 /tmp/vamos-sb27/hook-secret.txt p27` (`SB_API_PORT=59321 SB_DB_PORT=59322 SB_DB_CONTAINER=supabase_db_vamos-taxi-270`, `supabase` wrapper on PATH, `vamos_edge` and `vamos_public` passwords set to their own names on the 59322 container first) | 49 PASS, 1 FAIL, 1 N/A. 1a0, 1a, 1b, 3b pass. FAIL `a3` (other-device.e2e.mjs): `POST /api/checkout/intent` answers 503 `quote_lock_secret_missing`, the script expects 4xx. Cause is main's 88e6b827 (Phase 20 B1, "lock-secret 503"): phase 1 of run.sh has no `QUOTE_LOCK_SECRET` (mkcfg.mjs sets it only for phase2). Harness fault on main's code, not Phase 27; not fixed (files outside Phase 27). N/A `d2`: no Stripe key on the local Worker, as before. A first run before the passwords were set showed 10 FAILs, all `password authentication failed for user "vamos_edge"` | a3: the 503 comes from main; the harness gap would show on main too |
| 18a | `pnpm exec playwright test tests/integration/consent-banner-27.spec.ts --project=component-390 --workers=1` | pass, 9 of 9 (case D: banner shows on mock /about without Lenis; G: /de/about) | n/a |
| 18b | `pnpm exec playwright test tests/integration/signup-agreement-27.spec.ts` (all four projects) | pass, 56 of 56 | n/a |
| 18c | `VAMOS_TEST_DB_PORT=59322 VAMOS_TEST_MAIL_PORT=59324 VAMOS_TEST_SUPABASE_WORKDIR=/tmp/vamos-sb27 pnpm exec playwright test <file> --workers=1`, `auth-flows.spec.ts` then `auth-confirm-email.spec.ts`, stack from `start-mailpit` | pass: 11 of 11, then 1 of 1 | n/a |
| 19 | must-not greps, added lines of `git diff origin/main...HEAD` | pass: `sk_live_`, `vamostaxi.eu`, `1595596972063765`, `fbq(`, `fbevents` only in planning documents that forbid them, plus one test assertion forbidding `fbevents` (`vamos-consent.test.ts`). No code line | n/a |
| 20 | `git grep` `META_LEGAL_GATE_OPEN = false as const` in `apps/web/lib/meta` | pass, still false (`legal-gate.ts:6`) | n/a |
| 21 | `git grep` `record_consent\|recordConsent` in `apps/web/lib/auth`, `apps/web/app/api/auth` (no tests) | pass, empty | n/a |
| 22 | `git grep` `signup_consent` in `apps/web/lib`, `apps/web/app` (no tests) | pass, empty | n/a |
| 23 | `git diff --numstat origin/main...HEAD` on quote, checkout, stripe, pricing, checkout page, confirmation, checkout components | pass, exactly `1 1 apps/web/app/[locale]/checkout/checkout.css` | n/a |

Stack stopped (`docker ps | grep -c 270` is 0), `tsconfig.json` and `next-env.d.ts` restored, no process left in the worktree. Build folders under `apps/web` are ignored output; `service-role-laws.test.ts` now skips `.next-*` (73c394c3).

### Known reds that are not ours

| Red | Evidence |
|---|---|
| visual "SiteFooter default" and RouteSummary x8 | owner-ruled, not run |
| SiteHeader 390 | macOS effect, not run |
| `locale-follow-26-3.spec.ts:164` "DC pages still 308 away from a locale prefix" | not fixed on main: the spec on main still expects 308 from `/de/about`, and main's SEO ship (`1fd43a51`) made `/de/about` a real address. Not run here |
| `packages/db/test/local/checkout-account.test.ts` (3 tests) | `vamos_edge` has no password until set by hand; local-only |
| Worker e2e `a3` (other-device.e2e.mjs) | main's 88e6b827 makes a missing quote-lock secret a 503; run.sh phase 1 sets none. Test harness, not Phase 27 |
| `auth-confirm-email.spec.ts` three selectors, `auth-flows.spec.ts` D-09 eye clash | same code on main; fixed in the specs, see "Blocker closed" |

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
- The two Playwright specs `auth-flows` and `auth-confirm-email` were run only against the 59322 stack; never against the default 54322 stack (not allowed here). On that stack, with no `VAMOS_TEST_DB_PORT`, the bindings come from the staging `localConnectionString` in `wrangler.jsonc`, whose password is not the local role password, so a sign-up would answer 503 there. Set `VAMOS_TEST_DB_PORT=54322` to get the local role passwords.
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

- `CONSENT_POLICY_VERSION` = `2026-10-01` (`apps/web/lib/consent/policy.ts`) and `CONSENT_UPDATED` = `2026-10-01` (`app/vamos-legal-updated.js`). If the ship day differs, change both.
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
- `auth-flows.spec.ts` (tick the box; the sign-in link test uses an existing account) and `auth-confirm-email.spec.ts` (tick the box). See "Blocker closed".
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
