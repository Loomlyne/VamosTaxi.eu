# Phase 26.5 hand-over: checkout guest / sign in / create account

Branch `gsd/phase-26.5-checkout-account`, folder `/Users/koss/Developer/vamos-wt/phase-26.5`. Nothing pushed, nothing deployed, no hosted SQL, no live writes.

**Code state:** `ecbb7984` (merge of origin/main `ec1beed5`; main is frozen). Every result below was produced on a tree built from it. The commit(s) after it only add documents under `.planning/phases/26.5-checkout-guest-account/`. The final commit id is in the reply that accompanies this file (`git log -1`). Folder clean.

## What the customer gets
Section 2 of `/checkout` starts with three options: continue as guest, sign in, create an account. Sign in works in place (e-mail link, code as a second way) and returns to the same checkout with trip, class and extras. Create has the owner-approved tick box (Text 1); PAY is never disabled, pressing it unticked names what is missing. Guest with the switch on shows Text 2 and gets an account made from the e-mail after payment; with the switch off a guest checkout is exactly today's (D-09). A pasted checkout link opens with the trip only and an empty form; an unpaid booking is never continued on another device (D-16). `/privacy` carries the approved "Your account" paragraph in four languages (D-17). The 24-hour reminder goes to paid bookings only (D-18). Two Pay limits (D-20).

## Migrations (apply file-verbatim, in this order, read back after each; never `db push`)
1. `20261001100000_account_agreement_records.sql` adds `settings.guest_accounts_live boolean default false`, the append-only table `account_agreement_records` (no rights for anon/authenticated) and five definer functions. Safe on paid bookings: additive; no existing row, grant, policy or function is changed; the new column defaults to false, so behaviour is unchanged until the control session sets it.
2. `20261001110000_customer_hide_unpaid_bookings.sql` adds one RESTRICTIVE select policy on `bookings` for role `authenticated`: hides quote rows and `pending` rows that have no pay link. Safe on paid bookings: it only narrows what a signed-in customer can read; paid, confirmed, assigned and pay-link rows are untouched; no data or grant changes; staff, guest, checkout and system roles are not named. Turn it off with `drop policy`.
3. `20261001120000_reminder_24h_paid_only.sql` replaces `reminder_24h_candidates`: one changed line (status filter now confirmed or assigned). Same signature, columns, window, grants (vamos_system only). Safe: paid bookings are still reminded; unpaid ones are no longer.
4. `20261001130000_checkout_pay_press_cap.sql` adds table `checkout_pay_presses` (quote id, idempotency key, time; no personal data; RLS on, no table rights) and one definer function for `vamos_checkout` (D-20, 5 presses per price). Safe: additive. The table has no cleanup job.

They sort before Phase 20's `20261005100000` and `20261005110000`. The two groups touch different objects (checked: neither redefines anything the other defines), so applying the 26.5 block after Phase 20 on live is order-independent; only the filename order was replayed from zero (115 migrations, 0 errors).

## Setting, binding, secret
- `settings.guest_accounts_live` ships false. The control session sets it true with one hosted SQL update at ship, once the owner says guests get accounts from day one, and reads it back. Off again is the same line.
- `apps/web/wrangler.jsonc`: new rate-limit binding `INTENT_RATE_LIMITER`, namespace 1004, 8 per 60 s, in both `ratelimits` blocks (D-20a, per IP, own bucket). Confirm it exists on Worker `vamos` after deploy; also `AUTH_RATE_LIMITER` (1003) and `QUOTE_RATE_LIMITER` (1001) must be bound: a missing `AUTH_RATE_LIMITER` makes the account mail and the PAY-time check fail closed. A missing INTENT binding is logged and allowed.
- `SUPABASE_SERVICE_ROLE_KEY` is already on the Worker (since 2026-09-29 23:56). Control session: list secret NAMES only, confirm it and `SUPABASE_URL`. Without the key Create and guest accounts hide themselves and checkout works as today. Turnstile uses the existing site key, new action `account`.

## Files changed outside checkout (from `git diff --stat ec1beed5...HEAD`, 140 files; grouped)
- Auth: `app/api/auth/route.ts`, `callback/route.ts`, `email-hook/route.ts`, `lib/auth/{run,redirect-target,schemas}.ts`, `lib/turnstile.ts` (action `account`), `components/forms/TurnstileWidget.tsx`.
- E-mail: `packages/emails/src/{auth,messages}.ts` (+ test): `account_ready` and `account_signin` in four languages.
- Legal/language: `app/pages/privacy.dc.html`, `apps/web/app/[locale]/privacy/page.tsx`, `app/vamos-i18n-dict.js`, `apps/web/i18n/messages/*.json`, `packages/db/supabase/seed.sql` (generated).
- Service-role key (D-14/D-15): `apps/web/lib/supabase/{service,service-role}.ts`, staff invite route, `scripts/check-next-public-allowlist.mjs`, `scripts/public-env-allowlist.json`, `scripts/db-access-fence-allowlist.json`.
- Payments/jobs: `lib/checkout/{intent,intent-schema,settle,pay-validate,...}.ts`, `lib/abuse/rate-limit.ts`, `lib/db/system-reads.ts`, `lib/lifecycle/reminder.ts`, `lib/env.d.ts`, `wrangler.jsonc`.
- Database side: the four migrations, their pgTAP files, `packages/db/database.types.ts`, `packages/db/test/local/checkout-account.test.ts`, two older pgTAP fixtures, `seed_idempotent.test.sql`.
- Small: `components/core/Icon.tsx` + two new Lucide icons, `playwright.config.ts`, `vitest.config.ts`, two older visual specs, `docs/runbook/auth-worker-e2e.md`, `apps/web/tests/e2e-worker/*`.

## Worker e2e (real OpenNext Worker build of `ecbb7984`, local Supabase `vamos-taxi-265`, one pass)
Result: 48 PASS, 0 FAIL, 1 N/A. Log kept at `/Users/koss/Developer/vamos-wt/.sb265/work/e2e-final.log`.
- Auth 1a, 1b, 2, 3, 4, 5, 6, 8, 9: PASS. Scenario 7 (rate limit): PASS. It flipped earlier because the local limiter counts in fixed windows aligned to the wall-clock minute and keeps its state in `.wrangler/e2e`, so a burst that crosses a minute boundary restarts the count (miniflare `ratelimit-object`). The test now waits for a window with 20 s left. Not a product defect.
- Other-device A0, a1-a3, b1-b5, c1-c3, d1: PASS. d2: N/A (the staff pay link is accepted, the run stops at the Stripe step in the auth-only Worker; the next block has a Stripe stand-in but d2 was not repointed).
- Checkout-account 1, 2, 3 (neutral sign-in, both answers 1.2 s+), 4, 4a, 4b (`account_signin` mail, link lands on the exact checkout path and query, 6-digit code signs in), 5, 6 (provisioned account sees nothing before the link, the paid booking after; `type=magiclink` verifies, no fallback needed), 7a-7d, 8-10, 11a, 11b: PASS. Guest PAY with the switch on: one `informed` row (surface checkout); create PAY with the tick: one `consent` row; unticked create refused; a known e-mail gets `sign_in_first`; no PAY answer sets a session cookie; no `consent_log` row from either; switch off writes nothing; Text 2 is on `/checkout` verbatim; 6th press on one price and 9th press per minute per IP are refused.
- German start (Chromium against the Worker) G1-G8: PASS. `/de` sets the language; panel, Text 1 and Text 2 are the approved German texts; a guest PAY by the page's own button writes locale `de`; sign-in by link from the German checkout returns to the same checkout, every trip parameter, German, signed in; `/de/privacy` shows the "Ihr Konto" paragraph.
- Stand-ins used, disclosed: Stripe and Turnstile are answered by `tests/e2e-worker/fakes.mjs` (a fetch rewrite is prepended to the built `worker.js` only); `/api/quote`, the challenge script and the redirect to Stripe are stubbed in the browser run. So "PAY works with real Stripe" is NOT shown by this.

## Checks run
- From-zero replay: 115 migrations applied, 0 errors. Full pgTAP: 82 files, 1895 tests, PASS, including `customer_hide_unpaid_bookings` and the resume path after Phase 20's `purpose='manage'` migration, `seed_idempotent`. `types:check`: `database.types.ts` identical to the generated file.
- Tests I changed: `vitest run lib/auth app/api/auth` 9 files, 150 tests PASS. `tsc --noEmit` (apps/web) exit 0.
- Client bundle: `grep` of the built client assets for the name `SUPABASE_SERVICE_ROLE_KEY`: 0 files. The sentinel-value scan (`check:public-env` with `VT_BUNDLE_SECRET_SENTINEL`) was NOT run.

## Not verified
Owner's scope cut: the full gate list (whole vitest run, lint, lint:css, check:numbers, check:legal-claims, check:public-env, check:db-fences, i18n:check, seed:check, build) was not run on the final commit; the control session runs it in a clean clone. Also not run: the Playwright visual specs, `packages/emails` tests, `packages/db` local tests on the final commit, any real Stripe payment, real Turnstile, real mail inboxes, hosted Supabase behaviour, the live Worker. Whether the Worker double-decoding of the request query (see d94b39e6) also happens on the live Worker is expected but not observed. Known red, not 26.5's: `lib/ops/bookings-write.test.ts` timing flake; `tests/visual/legal-privacy-cookies.spec.ts` "data-tok" expects 17; `tests/visual/checkout-page.spec.ts` "Edit trip: fields in home order" (stale since 26.4.2).

## Notes for the control session
- `d94b39e6` fix: on the Worker a route handler sees the request query already decoded once, so a sign-in link target `/checkout?from=Zurich%20Airport&...` reached the callback with a space, failed the return-path check and landed on `/checkout` with no trip. Any place name with a space did this. The target now travels as base64url (`nextb`). Found by e2e 4a. Older links using `next=` still work.
- D-19 / Phase 27: `record_account_agreement` can be called only by `vamos_checkout`; anon and authenticated cannot (pgTAP). Phase 27 adds its own EXECUTE grant by migration in `20261002…`.
- `apps/web/lib/auth/signup-consent.ts` still writes a `consent_log` `reject_all` row when a new customer confirms an e-mail (Phase 27's to remove). Checkout never writes `consent_log`.
- The claim function still links a pending booking to an account, but it stays hidden on every customer path (policy 2).
- `seed_idempotent.test.sql` re-pinned (`56eca1d8`). Two older pgTAP fixtures (`bookings_customer_rls`, `cross_claim`) now insert status `confirmed`; assertions unchanged.
- `checkout_pay_presses` has no cleanup job (D-20: 5 presses per price, 8 per minute per IP).
- `/privacy` flags (owner's legal copy, not rewritten): adviser placeholders remain; the page does not describe magic-link sign-in; the texts have not been read by a lawyer.
- The staff digest and staff invite still use the full service-role client, through the one module (D-15).
- Port-54322 incident: an earlier run of the whole `packages/db/test/local` folder (connection-reuse, no-begin, local-fixtures hard-code port 54322) may have written fixture rows to the default local stack; local only. Not run again.
- The Worker e2e runner now takes its ports from `E2E_PORT` (another session held 4290).

## Owner UAT, on https://vamostaxi.site after the control session ships (guest switch on)
1. Phone, signed out: start a booking from the home page, go to checkout. Expected: section 2 opens with the three options, guest selected, the grey line "We create an account for this email so you can see your booking later. No password needed. We send you a link to sign in.", no password field anywhere.
2. Same phone, choose Continue as guest, enter a name, a new e-mail and a phone, press PAY, pay with card 4242 4242 4242 4242. Expected: confirmation page; a booking confirmation mail; then a "Your Vamos Taxi account is ready" mail.
3. Before clicking that mail, open vamostaxi.site/account. Expected: not signed in, no booking. Click the mail button. Expected: the account shows the booking.
4. Phone: start a new booking, choose Create an account with another new e-mail, press PAY without the tick. Expected: a red line asks you to tick the box; PAY still pressable; nothing is sent to Stripe.
5. Tick the box (Terms and Privacy notice open their pages), PAY with 4242 4242 4242 4242. Expected: confirmation page and an "account ready" mail.
6. Second device (laptop): open the checkout, choose Sign in, type the e-mail from step 5, press "Email me a sign-in link". Expected: "Check your inbox — we sent a sign-in link". Open the mail on the laptop. Expected: back on the same checkout with trip, class and extras, "Signed in as …".
7. Laptop, still signed in: open Account. Expected: the paid booking is listed. Start a booking on the phone, stop before paying, then look at Account on the laptop. Expected: the unpaid booking is not there.
8. Copy a checkout link from the phone (unpaid) and open it in a private window on the laptop. Expected: route, date, time, class and extras are there; name, e-mail, phone, company, note, voucher are empty.
9. Optional, phone: on one checkout, press PAY, come back from the Stripe page with the Back button, and press PAY again, until the sixth press on the same price. Expected: the sixth is refused with "Too many tries. Get a new price and try again." and no Stripe page opens. (A press that repeats an earlier one exactly is a replay and is not counted; the control session can read the count in `checkout_pay_presses`. The limit is proven by the Worker e2e 11a.)
10. Open vamostaxi.site/de/privacy. Expected: the paragraph "Ihr Konto." in section 02.
11. Control session reads (read-only): for steps 2 and 5, `account_agreement_records` has one row each (step 2 choice guest, record_kind informed; step 5 choice create, record_kind consent; text_version 2026-09-29; your locale); no new `consent_log` row from either; `booking_payments` shows both 4242 payments settled; the 24-hour reminder job selects paid bookings only.

The stack vamos-taxi-265 is stopped.
