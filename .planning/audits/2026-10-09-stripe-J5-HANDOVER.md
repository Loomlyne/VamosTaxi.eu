# J5 hand-over: return page and confirmation (payments review, 2026-10-09)

Branch `pay/j5-return-page` (worktree `.claude/worktrees/pay-j5-return-page`). **Stacked: base is `pay/j1-mode-guard`** (J1 is inside it). Builder: chain B. Findings: `2026-10-09-stripe-W3.md`.

## What changed, per finding

- **W3-01** The return route no longer sends a possibly-paid customer to the empty trip editor. Stripe unreadable (outage, refused key, rate limit, deadline) now goes to a database-only reference lookup: found, `/confirmation/<ref>?check=1` (polls, says "We are checking your payment", shows the reference); not found, `/confirmation?session=<cs>`. The checkout only receives `pay=` when there is nothing to look up (no env, no session id) and now renders every outcome: `PAY_OUTCOMES = unpaid | unknown | failed | cancelled` is the one list for the zod schema, the route's redirect builder and the notice map (`pay-outcome-notice.ts`, exhaustive `Record`); `unknown` used to parse to null. `/confirmation?session=` looks the session up itself and redirects to the booking when the reference is known.
- **W3-02** Every return failure is an error-level log (`checkout_return`, fixed `reason`, error name/type/code/status only; never message, session id, URL, cookie or contact data). Reasons: `return-retrieve-failed`, `-settle-failed`, `-lookup-failed`, `-deadline`, `-no-env`, `-limiter-missing`, `-unhandled`; the limiter refusal is `return-rate-limited` (also error level through the same helper).
- **W3-03** `?charge=refunded` with no readable booking (no cookie, no account) no longer polls or says "Payment received": it renders a refunded card (existing `payLinkRaceRefunded*` strings, reference, support line). A payer who can read the confirmed booking keeps the booking page with the notice.
- **W3-04** Poll budget `POLL_BUDGET_MS` = 5 minutes (`confirmation-phase.ts`; **the number is the agent's choice, the owner may change it**). Past it the phase is `stalled`: polling stops, the card stays and offers **Check again** (restarts the budget, refreshes the server read). Dead `PAY_LINK_POLL_*` constants and their test removed.
- **W3-05** PAY on a Back-from-Stripe resume asks `/api/checkout/resume` again (`freshResume`, which re-reads the Stripe session). Open: go there. Paid meanwhile: its confirmation. Anything else (expired, purged, network error, non-Stripe URL): the stored URL is dropped and a new payment opens (with `supersedes`). I did not clear `resume` on `pageshow persisted`: the re-check at PAY covers the Back loop, and clearing would lose the valid same-booking shortcut.
- **W3-06** FINISH PAYMENT on an unpaid booking now links to `/checkout?resume=<quote_id>` (locale-aware via `localePath`). When the quote id cannot be named (account-only reader, older Worker/DB) the button is not shown (no dead control). Needs the migration below.
- **W3-10** The `ref` query value is gone from the return route; the reference is database-derived, then the session's own metadata.
- **W3-11** Return route deadlines: Stripe read 4 s with no retries (`retrieveCheckoutSession(..., { timeout, maxNetworkRetries: 0 })`), settle 6 s, lookup 3 s (`withDeadline`). Worst case about 13 s, was about 30 s. A settle that hits the deadline sends the payer on as paid (Stripe said paid) and logs `return-deadline`; the webhook is the durable path.
- **W3-15** The static `/confirmation?session=` page no longer says "Payment received" and is never a dead end (looks up, redirects, "Check again", support address).

## Files

`app/api/checkout/return/route.ts`, `lib/checkout/return-settle.ts`, `lib/checkout/stripe.ts` (optional request options on retrieve), `lib/checkout/trip-url.ts`, `lib/checkout/pay-outcome-notice.ts` (new), `lib/checkout/pay-flow.ts`, `lib/checkout/confirmation-phase.ts`, `lib/checkout/resume-quote.ts` (new), `lib/checkout/pay-client-states.ts`, `app/[locale]/checkout/CheckoutForm.tsx`, `.../sections/PaymentSection.tsx` (TopNotice), `app/[locale]/confirmation/page.tsx`, `.../[ref]/page.tsx`, `.../[ref]/ConfirmationClient.tsx`, i18n `en/de/fr/ar.json`, `packages/db/supabase/seed.sql` (generated), `seed_idempotent.test.sql` (count 2692 to 2699), tests (below), `packages/db/database.types.ts`.

## Migration (one)

`packages/db/supabase/migrations/20261009120000_guest_resume_quote.sql`: new function `public.guest_resume_quote(reference, token_hash) returns uuid` (security definer, empty search_path, revoked from public/anon/authenticated, EXECUTE vamos_guest). Returns the quote id only for an active manage token of that booking, only while the booking is `pending`. No existing function replaced. **J5 had no timestamp assigned; I used `…120000` by the J6=13/J8=15 pattern. Controller: confirm or renumber.** pgTAP: `tests/guest_resume_quote.test.sql` (13 tests). `database.types.ts` edited by hand (4 lines, alphabetical, same shape as `guest_confirmation_read`); the pinned CLI needs Docker, the 2.119 CLI output is unformatted, so `db:types:check` was **not** run.

## i18n

Seven new keys in `checkout` (de/fr/ar in the same pass, Swiss German "ss"): `payUnknownNotice`, `payUnpaidNotice`, `payFailedNotice`, `payCheckingTitle`, `payCheckingBody`, `payCheckingStalledBody`, `payCheckingAgain`. **The wording is mine (operational, no legal claim, no amount); the review asked the owner which copy to use for "we could not confirm yet", so he should read the four versions.** Messages come from the JSON files (`CONTENT_SOURCE` default `json`); `seed.sql` regenerated (`db:seed:gen`, `db:seed:check` clean). `app/vamos-i18n-dict.js` is not used by these Next pages (checkout and confirmation are next-intl, `middleware.ts` serves no DC mock for them), so nothing was added there. No new CSS: existing `vt-confirmation__*` / `vt-co__notice` classes only (logical properties already); no glow, no tinted yellow, icons through `Icon` (`clock`).

## Tests and gates run (in `.claude/worktrees/pay-j5-return-page`)

- `apps/web`: `pnpm exec tsc --noEmit -p .` clean; `pnpm exec vitest run`: 464 files passed, 5524 tests passed, 41 skipped (20 files skipped). eslint on `app`, `lib/checkout`, `components/checkout`: clean. `pnpm i18n:check` passed (2691 keys); `check:db-fences`, `check:numbers`, `check:legal-claims` pass.
- New or changed tests: `return-settle.test.ts` (unknown/rate-limited/lookup failure targets, no `ref` input, server reference wins, log hook reasons, every emitted `pay=` is a `PayOutcome` and parses back, `withDeadline`, `errorLogFields` carries no message/id), `pay-outcome-notice.test.ts` (schema/renderer parity, four-language messages), `confirmation-phase.test.ts` (budget, stalled), `pay-flow-resume.test.ts` (resume expiry), `resume-quote.test.ts`, `components/checkout/confirmation-return.test.tsx` (SSR: check=1 copy, refunded card in all four languages, finish link, no dead button, poll stops at stalled), updates to `confirmation-booked`, `confirmation-unmock`, `pay-client-states` tests.
- pgTAP on the lab `pay-b` (native, own stack): full suite `Files=110, Tests=3063, Result: PASS`, including `guest_resume_quote.test.sql`. The lab's own post-run data restore step failed ("no keys"), irrelevant to the result.
- `lab.sh dbtests pay-b`: `packages/db test/local` 72 passed; `apps/web *.local.test.ts` 31 passed, **2 failed** in `lib/checkout/return-settle-superseded.local.test.ts` (fixture: `snap[0].id` undefined at the snapshot insert, line 111). That file's fixture is not touched by J5 and the failure is in test setup, not in the code under test; I did not check it against `pay/j1-mode-guard`. See Found, not fixed.

## NOT verified

- No browser run: the Worker was not built and none of the pages was looked at at 1440/1024/768/390 or in Arabic RTL. RTL is covered only by reuse of existing logical-property classes and the SSR tests. A lab visual pass is owed.
- Not exercised against Stripe or a real return (no live or sandbox call, as ordered). The 4 s / 6 s / 3 s deadlines are unit-tested on timers, not measured.
- `Stripe.RequestOptions` `{ timeout, maxNetworkRetries }` on `sessions.retrieve`: the SDK type accepts it and tsc is clean; I did not run it against the SDK's HTTP layer.
- `db:types:check` (see above).

## Deviations

- A migration was needed (W3-06), see above. The review text left the target open ("resume the Stripe page or the pay link"); I chose the checkout resume (the page refills the booking and re-offers PAY, with the Stripe-session re-check from W3-05).
- Account-only readers (signed in, no manage cookie) get no FINISH PAYMENT button: the resume route needs the cookie.

## Found, not fixed

- `?charge=refunded` and `?check=1` are display hints any visitor can append to a confirmation URL (cosmetic; the booking data stays cookie-gated). W3-15's "show the refunded notice only when the server confirms" is not done: it needs a server read of the session's duplicate state or a signed hint.
- `return-settle-superseded.local.test.ts` fails in its fixture on the lab (above); possibly pre-existing.
- W3-07, 08, 09, 12 (J8); W3-13 (`localhost` in the origin allow-list), W3-14 (pay-link token in `cancel_url`), W3-16 (dead payment code and about ten unused i18n keys), W3-17 (two `success_url` builders), W3-18 (J8 W1-07): untouched.
- The settle call inside `settlePaidReturn` re-retrieves the session with the default client (10 s, 2 retries); only the outer 6 s deadline bounds it.
- `payCheckingBody` promises "this page keeps checking for a few minutes" and is shown while polling; if the owner changes `POLL_BUDGET_MS`, change the word "minutes" with it.

## Deploy order for the controller

1. Apply `20261009120000_guest_resume_quote.sql` verbatim to the hosted database, read back `select proname, prosecdef from pg_proc where proname='guest_resume_quote'` and `has_function_privilege('vamos_guest', ...)`. The Worker fails closed (no finish button) if it runs first, so order is not critical, but the button needs it.
2. Deploy the Worker. Then check `/en/confirmation?session=cs_test_x` renders "We are checking your payment" (a malformed id shows the card without "Check again") and that Worker logs show `checkout_return` lines only with fixed reasons.
3. The seed (`content_strings` +7) is not applied by anything automatic; the Worker reads the JSON.
