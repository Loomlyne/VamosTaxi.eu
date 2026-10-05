# Hand-over: sign-up safety (S5 Turnstile on sign-up and forgot-password, S9 unchanged, no name in the sign-up mail)

Work session (not control), 2026-10-05. Owner decisions: `.planning/decisions/2026-10-05-signup-safety.md` (question form).

- Branch `fix/signup-safety`, cut from `origin/main` `16f1cfa7`; `origin/main` then moved to `cc0c9c6d` (planning files only, no overlap) and is merged in with no conflict.
- No commit on `main`, no push of `main`, no deploy, no write to the live database, Cloudflare or Supabase Auth. One migration file, written for the review follow-up (item 4): `20261007330000_staff_reset_recipient.sql`, not applied anywhere but a test lab. No message keys added (`db:seed:gen` not needed; `db:seed:check` clean).
- Test labs `su-s5` and `su-s6` were built from this branch, used, and destroyed. Build output removed.
- After the Fable review of `2921fe79` the controller asked for two fixes (items 4 and 5 below), each its own commit with tests.

## Items

### 1. "Verify you are human" on sign-up and forgot-password (owner decision 1)

**Cause.** Nothing on the public sign-up and forgot-password asked for a human check; the first thing they spent was the per-address bucket.
- `apps/web/app/api/auth/route.ts` on `origin/main`: forgot-password `:619-623` (straight to `perAddressAllowed("forgot")`), password sign-up `:677-683`, link sign-up `:731-739`.
- `apps/web/lib/auth/actions.ts` on `origin/main`: `signUpAction` `:114`, `requestPasswordResetAction` `:182`. This file is `"use server"`, so both can be posted at any Next route with a `Next-Action` header. Proved on the lab before the fix: a sign-up mail went out for a typed address with no token at all (`evidence/actions-probe.txt`). This was not in the brief; it is the same two operations and would have made the check decorative, so it is fixed here.

**Fix.**
- Server, `/api/auth` (`route.ts:238` `challengePassed()`, used at `:664` forgot, `:713` password sign-up, `:773` link sign-up, `:685` the existing checkout link). It verifies the token with `verifyTurnstile` (action `account`, the same hostname binding the contact form uses), refuses an empty token or one over 2048 characters without asking Cloudflare, and fails closed with `403 { ok:false, reason:"challenge-failed" }`. Order: schema, tick of the box (400), **check (403)**, per-address bucket (429), agreement record, mail. A bot with no token cannot use up a real person's address bucket. The dashboard host is unchanged (sign-up there answers "sent" without any check, forgot-password is not asked for a token). Sign-in (password, code, link) has no check.
- Server, actions (`actions.ts:90` `challengePassed(token)`, `:154` sign-up, `:228` forgot-password). Third argument `challengeToken`. Missing, oversized or refused: neutral `{ stage: "sent" }`, log reason `challenge-failed`, no agreement record, no mail.
- Page `app/pages/AuthForm.dc.html` (the customer /sign-in and /sign-up, served as the DC mock) with `app/vamos-consent.js` (`VamosConsent.turnstile` got `opts.action`, `opts.language`, `opts.onInteractive`, default unchanged for the booking). The widget is managed: it warms up unseen when the page opens, a suspicious visitor sees the small box (opens in view, closed again after the answer), tick sends the sign-up. Submit and "Send another link" ask for a fresh token each time and send `turnstileToken` plus `idempotencyKey`. The widget is asked for the page language (`ar-eg` for Arabic). If the check cannot run or is refused, the form shows the existing line "Could not send the link. Try again." (already in de/fr/ar) and sends nothing. The closed box takes no room: the 390 px form is byte-identical to before (`screens/before-signup-390.png` and `after-signup-390.png`, same SHA-256).
- Four languages: no new visible string. The two existing lines are used. Pre-existing gap found and fixed in the same pass: `VamosLocale.coverage` listed the placeholders `Anna` and `Keller` on the sign-up name fields (also on `origin/main`); they now have identity rows in `app/vamos-i18n-dict.js`. The address echoed on the sent page is marked `data-vt-no-i18n` with `vt-dir-keep`.

**Tests (fail before, pass after).**
- `apps/web/tests/unit/auth/signup-turnstile.test.ts` (route, 20): token passes, no token / empty / oversized / refused = 403 and nothing recorded, counted or mailed, dashboard unchanged, sign-in has no check.
- `apps/web/tests/unit/auth/signup-turnstile-real.test.ts` (real helper, stubbed siteverify, 9): fails closed on a Cloudflare error, action and host binding.
- `apps/web/tests/unit/auth/signup-actions-turnstile.test.ts` (actions, 11): 10 fail on `origin/main`'s `actions.ts`, all pass now.
- `apps/web/lib/auth/signup-challenge-mock.test.ts` (the AuthForm logic run in a VM against a fake Turnstile, 17) and `apps/web/lib/consent/vamos-consent-turnstile.test.ts` (helper options, 3).
- Seven existing route tests got the Turnstile fake and a token in their bodies (they post sign-up or forgot-password).

### 2. No typed name in the sign-up confirmation mail (owner decision 2)

**Cause.** `packages/emails/src/auth.ts` on `origin/main`: `:71` `escapeHtml(data.name.trim())`, `:81` text lead `email-hello`, `:85` body params. The hook (`apps/web/app/api/auth/email-hook/route.ts`, name from `user_metadata.full_name`) passes the name typed at sign-up, before the address is confirmed.

**Fix.** `auth.ts:71` `NO_GREETING = ["signup"]`; `:79` the name is empty for that kind. The sign-up mail has no "Hello {name}." in en/de/fr/ar, same layout as the sign-in mail without a name, no new wording. The link sign-up for a new address is also kind `signup` (Supabase sends the confirmation), so it is covered too.

**Tests.** `packages/emails/src/auth-signup-greeting.test.ts` (signup mail identical with and without a name in four languages; name and greeting absent; recovery, code and email-change still greet), `apps/web/app/api/auth/email-hook/signup-no-greeting.test.ts` (hook route end to end). `packages/emails/src/layout.test.ts` pinned the old en text ("Hello Amira."): updated, footer lines unchanged.

**Other mails with the same risk (reported, not changed).**
- Recovery, code (OTP) and secure email-change greet by the stored `full_name`, which is whatever was typed at sign-up. If someone signs up another person's address with a hostile name and that person later confirms and then asks for a recovery or a code, the mail greets by the stranger's typed name. Not tested against Supabase's own rules for unconfirmed accounts (it may send the sign-up confirmation instead).
- `account_signin` (the checkout sign-in link, existing customers only) greets by the stored name as well.
- The dead message keys `email-signup-body` / `email-hello` were not touched (seed unchanged).

### 3. S9 (two manage links): no change, as decided.

### 4. Token replay (review, Medium): the Turnstile idempotency key is made on the server

**Cause.** Cloudflare answers the same success for a token re-verified with the same `idempotency_key` for 300 s. The key came from the browser's body, so one solved token could be posted for many addresses from many IPs. `apps/web/app/api/auth/route.ts:249` (`challengePassed()`, used by sign-up, link sign-up, forgot-password and the checkout sign-in link) and `apps/web/lib/checkout/account-gate.ts` (`accountGateDeps().verifyTurnstile`, the checkout "account" check, key from `input.account.idempotency_key`).

**Fix (commit `247b9daa`).** Both send `crypto.randomUUID()` and ignore the body's key, as `lib/auth/actions.ts` already did. A second use of the same token is then refused by Cloudflare as a duplicate.

**Tests.** `signup-turnstile-real.test.ts` (a fake siteverify with Cloudflare's rule: same token + same key repeats the success, any other key is refused; the same token posted for two addresses with the browser's key held equal: first 200, second 403, two different keys sent, neither is the browser's), `signup-turnstile.test.ts` (the three flows: same token twice gives two different UUID keys, "key-1" never sent), `checkout-route.test.ts` (the checkout link: key is not "k1"), `lib/checkout/account-gate.test.ts` (the real gate dep: two checks with the same browser key send two different UUIDs). 10 of them fail on the old code.

**Same pattern, not changed (listed as open).** `app/api/contact/route.ts:41`, `app/api/consent/route.ts:97` and `app/api/reviews/submit/route.ts:106` also pass the browser's key to siteverify.

### 5. Dashboard forgot-password: a reset link goes to active staff only (controller decision)

**Cause.** `route.ts` forgot branch skips the check on the dashboard host, so a reset mail could be sent to any customer address from `dashboard.vamostaxi.site`.

**Fix (commit `ffab6c6f`).** On the dashboard host the route asks the new read `public.staff_active_for_email(text)` (migration `20261007330000`: SECURITY DEFINER, empty `search_path`, boolean only, `vamos_system` only; anon, authenticated, PUBLIC and the other Worker roles hold nothing) through `staffActiveForEmail` in `lib/db/system-reads.ts`. Active staff row: the real address goes to Supabase as before. Anyone else, or a check that cannot be made (fails closed): the same Supabase call goes out with an address no account can have (`no-recovery-<uuid>@invalid.invalid`), so nothing is mailed and the answer, the verifier cookie and the work done are those of an unknown address. The real address is never sent to Supabase for a non-staff. Every dashboard answer is held to the sign-in branch's floor (1.2 s plus up to 0.15 s), so time says nothing either. Public-host recovery, dashboard sign-in and everything else are unchanged.

Why in the route and not in the mail hook: on the lab, Supabase replaces a `redirect_to` that is not on its Auth allow-list with the site URL, so a hook cannot always see that the request came through the dashboard host. I could not read the live allow-list (not reachable read-only). The route knows the host.

**Tests.** `tests/unit/auth/dashboard-forgot-staff-only.test.ts` (8; four fail on the old route): staff gets the real address once, any other address never reaches Supabase and gets the same body, status and cookies, decoy is new each time, a failed staff check fails closed, every dashboard answer is held to the floor and the public host is not, public host unchanged, sign-in never asks who is staff. `packages/db/supabase/tests/staff_reset_recipient.test.sql` (23): active admin and dispatcher, case and spaces, inactive, invited-not-accepted (counts, the person owns the address), customer, unknown, empty, null, live toggling, definer and `search_path`, grants (vamos_system only), refused for anon, authenticated and vamos_staff. `database.types.ts` has the one new line, written in the generator's format (the generator needs the standard-port stack; run `pnpm db:types:check` on the controller's stack).

**Lab proof (`run/dashboard-forgot.mjs`, `evidence/dashboard-forgot.json`).** Real Worker and local Supabase with the migration: public host, a customer's recovery mail still goes out. Dashboard host: the lab's active admin gets the recovery mail; a customer address gets none and the same `{"stage":"sent"}`; an unknown address gets none; staff, customer and unknown have the same status, body and Set-Cookie count and none comes back before the floor; password sign-in unchanged. Timing, four rounds each (`evidence/dashboard-forgot-timing.txt`): 1223 to 1359 ms for all three.

**Controller steps (database).** Apply `20261007330000_staff_reset_recipient.sql` verbatim and read back (`pg_get_functiondef`, `md5(prosrc)`, ACL: `postgres`, `service_role` default, `vamos_system`; nothing for anon, authenticated, PUBLIC). Apply it BEFORE the Worker that calls it: it only adds a function. If the Worker goes first, the dashboard's forgot-password mails nobody (fails closed, log reason `staff-check-failed`) until the migration lands; public-host recovery is not affected either way. The number is my pick (`310000` and `320000` are on `main`); I did not confirm it with you, renumber if another job holds it.

## Proof

| Check | Result |
|---|---|
| Lab browser run `run/signup-browser.mjs` (Chromium, test lab `su-s5`, native stack plus the built Worker), 22 steps | 22 pass, 0 fail (`evidence/results.json`) |
| 1440 en: unseen check on sign-up, token sent, mail has no name and no greeting (`evidence/signup-mail-en.txt`) | pass |
| 390 en: form byte-identical to before with the box closed; no sideways scroll | pass |
| 390 en: suspicious visitor sees the small box in view, tick sends | pass |
| Check cannot run / Cloudflare refuses: nothing sent, "Could not send the link. Try again." | pass (1440 and 390) |
| "Sign up with a link instead", "Send another link" (token asked again), forgot-password (1440 and 390) | pass |
| Password sign-in sends no token and never loads the check | pass |
| de / fr / ar at 390: `VamosLocale.coverage` empty on the form, the failure line and the sent page; ar has `dir=rtl`; widget asked for de / fr / ar-eg | pass |
| API on the Worker: no token / refused token = 403, nothing mailed; good token = 200; no tick = 400 before the check; dashboard host unchanged | pass |
| Server actions posted at `/checkout` with `Next-Action` | before: mail sent with no token. After rebuild: no token and refused token send nothing, good token sends (`evidence/actions-probe.txt`) |

Before/after bare crops are in `screens/` (`before-signup-390.png`, `before-signup-1440.png`; `after-signup-390.png`, `after-signup-390-box-open.png`, `after-signup-390-refused.png`, `after-signup-1440-check-failed.png`, `after-forgot-390-box-open.png`, and the de, fr, ar crops).

## Gates (run on the branch tip before this hand-over)

| Gate | Result |
|---|---|
| `pnpm typecheck` (db, emails, web, isolation-probe) | pass |
| `pnpm lint` | 0 errors, 6 warnings ("unused eslint-disable") in files this branch does not touch |
| `pnpm i18n:check` | pass, 2684 keys, no key added |
| `pnpm check:numbers` | ok |
| `pnpm check:db-fences` | all 8 checks pass |
| `pnpm check:public-env` | pass (the built-bundle scan was skipped: build output removed) |
| `pnpm db:seed:check` | no drift |
| `pnpm test:scripts` | 40 of 40 |
| `packages/emails` tests | 263 of 263 (16 files) |
| `packages/db` unit tests | 14 of 14 |
| `apps/web` tests (whole suite, the touched folders `lib/auth`, `tests/unit/auth`, `app/api/auth`, `lib/checkout`, `lib/consent` included) | 454 files, 5369 tests pass; 20 files / 41 tests skipped (database specs that need a lab, as on `main`). No load flake seen |
| One full `pnpm test:unit` after the review fixes (tip before the merge) | exit 0 |
| Database, lab `su-s6`, `lab.sh pgtap` (whole suite, migration `20261007330000` included) | PASS, Files=109, Tests=3050; `staff_reset_recipient.test.sql` 23 of 23 |
| Earlier first full `pnpm test:unit` (before the review) | stopped at one failure in `packages/emails/src/layout.test.ts`: it pinned the old sign-up text with "Hello Amira.". That is decision 2, so the expectation was updated and the suite run again in full |

Not run here: Playwright e2e and visual specs (by hand only since the checks job change), `pnpm db:types:check` (needs the standard-port stack; the one new line in `database.types.ts` is in the generator's format).


## Not verified

- The Cloudflare widget itself. The lab uses a stand-in for `challenges.cloudflare.com` (the page cannot reach Cloudflare in the lab); how Cloudflare draws and decides on the real widget is only seen live. Whether the widget allows the host `vamostaxi.site` is a Cloudflare setting (owner step 1).
- Recovery, code and email-change mails with an untrusted name: read in code, not run.
- Whether Supabase's hosted Auth redirect allow-list holds `https://dashboard.vamostaxi.site/**` (not readable from here). Item 5 does not depend on it.
- Cloudflare's real replay answer (`timeout-or-duplicate`) for a token used with a second key: shown against a fake that follows Cloudflare's documented rule, not against Cloudflare.
- Live: nothing was deployed or applied.

## Failed

Nothing is failing now. Found and fixed on the way: the DC runtime passes only the props to `componentDidUpdate` and `vamos-consent.js` can land after the form mounts (the widget never warmed up in the first lab run); a synchronous answer inside `execute()` made a failure sticky; the lab's siteverify fake accepts an empty token (so the server now refuses an empty one itself); the server actions bypass (item 1).

## Owner steps (Cloudflare), no secrets

1. In the Cloudflare dashboard, account `e64b47de...`, Turnstile, open the widget whose site key the Worker `vamos` uses (`TURNSTILE_SITE_KEY`). Check that its hostnames include `vamostaxi.site` and that its mode is "Managed". Names of the Worker's secrets were read (`wrangler secret list`, names only): `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` and `CONTACT_TURNSTILE_ALLOWED_HOSTNAMES` are all set. Nothing to add.
2. After the controller deploys: on https://vamostaxi.site/sign-in sign up with a fresh address once and confirm the mail arrives and has no "Hello" line; try "Forgot password" once. If either says "Could not send the link. Try again." with a normal browser, step 1 is the cause (host not allowed on the widget).

## Open questions (plain words)

1. Resend of the confirmation mail (`runResendConfirmation`) has no check. It only re-sends to an account that already exists and is limited per address. Add the same check?
2. (Closed by item 5.) Forgot-password on the dashboard host still asks the visitor for no token, but now mails an active staff address only.
3. The sign-in link (not sign-up) can create an account for a new address (it is limited per address, has no check, by decision 1). Keep it that way? (The controller said to leave it while the owner is asked.)
4. The React twin `app/[locale]/sign-in/SignInClient.tsx` no longer sends sign-up or forgot-password (it passes no token, so the actions answer "sent" and send nothing). No customer reaches it (the DC mock serves /sign-in), so I left it. Delete it, or leave it?
5. Recovery, code and email-change mails still greet by the stored name (item 2, last list). Change them too?
6. Not a change by me, noticed: `Hello {name}` appears in the dead key `email-hello` only; the seed would need a regeneration if you remove it.
7. Same token-replay pattern as item 4, not changed: the contact form (`app/api/contact/route.ts:41`), the cookie banner (`app/api/consent/route.ts:97`) and the review form (`app/api/reviews/submit/route.ts:106`) take the Turnstile idempotency key from the browser too. One solved token can be replayed on each. Same one-line fix, one test each. Do it?
8. The check lives in our Worker. If Supabase's Auth endpoints (`/auth/v1/signup`, `/recover`, `/otp`) can be reached directly by someone holding the project's public key, they skip it. Supabase has its own CAPTCHA protection (Auth settings, Turnstile secret, and the page then passes a `captchaToken`) that would close that. I did not check whether the key is reachable from outside and I touched no Auth setting. Look at it?

## Close-out

- Files: `app/pages/AuthForm.dc.html`, `app/vamos-consent.js`, `app/vamos-i18n-dict.js`, `apps/web/app/api/auth/route.ts`, `apps/web/lib/auth/actions.ts`, `apps/web/lib/checkout/account-gate.ts`, `apps/web/lib/db/system-reads.ts`, `packages/emails/src/auth.ts`, `packages/db/supabase/migrations/20261007330000_staff_reset_recipient.sql`, `packages/db/database.types.ts` (one line), tests listed above, this folder (`run/` scripts, `evidence/`, `screens/`).
- Migration number `20261007330000` is now used by this branch (next free: `20261007340000`).
