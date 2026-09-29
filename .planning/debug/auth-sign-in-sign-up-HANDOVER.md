# Hand-over — sign-in and sign-up fix (vamostaxi.site + dashboard)

- Branch: `fix/auth-sign-in-sign-up`, folder `/Users/koss/Developer/vamos-wt/auth-fix`
- Cut from `af93fc8e`; `origin/main` `34af1552` merged in (clean, no conflicts).
- Not pushed, no PR, not deployed. For the control session.
- New migrations: **none**. Nothing touches the database schema or existing rows.
- Live Supabase was only read (selects and auth logs). No auth user, setting or row was changed.

## Root causes

| # | Cause | Where | Evidence |
|---|---|---|---|
| 1 | The Send Email Hook answered `200` with an empty body and no `Content-Type`. Supabase rejects that (`hook_payload_invalid_content_type`) and rolls back the sign-up or token **after** the mail has gone out, so every e-mailed link was dead. This covered sign-up, e-mail link, reset, invite and e-mail change. | `apps/web/app/api/auth/email-hook/route.ts` | Live auth log, 2026-09-29 12:12 UTC: `/signup` returned 400 after the hook ran. Both clicks at 12:13 got "One-time token not found". The only hook run in 24 h failed. Reproduced on a local Worker build: `auth.users` = 0 after sign-up. |
| 2 | The PKCE code-verifier cookie (sign-up, e-mail link, forgot) and the callback's session cookie were set through `next/headers` only. On the Worker they never reached the browser, so a link could not sign anyone in, even without cause 1. | `app/api/auth/route.ts`, `app/api/auth/callback/route.ts` | Unit tests plus the Worker end-to-end run. |
| 3 | A failed or used link sent the user to `/sign-in?error=1`, and the live page ignored `?error`, so the form was blank. On the dashboard, the query was lost in the redirect to `/login`. | `app/pages/AuthForm.dc.html`, `app/ops/AuthForm.dc.html`, `middleware.ts` | Code. |
| 4 | Dashboard Settings: changing the password or e-mail always failed. The route demanded a name that the screen does not send. | `app/[locale]/(ops)/api/staff/profile/route.ts` | Test fails on old code. |
| 5 | The dashboard e-mail link used `shouldCreateUser: true`, so any address typed there created a customer account. The link option was also hidden until a wrong password. | `lib/auth/run.ts`, ops AuthForm | Test. |
| 6 | A customer who signed in on the dashboard host stayed signed in there, was bounced to `/login` and saw no message. | `app/api/auth/route.ts` | Test plus e2e. |
| 7 | Sign-in shared the quote limiter (4 per minute per IP). The 5th try said "That email and password don't match". | `app/api/auth/route.ts`, `wrangler.jsonc` | e2e: old build returns 429 from the 5th try. |
| 8 | Sign-in labels and validation strings were missing de/fr/ar: 6 named ones plus 8 more. | `app/vamos-i18n-dict.js` | Dict scan test. |
| 9 | Auth cookies had no `Secure` on https. | `lib/supabase/server.ts`, `lib/supabase/middleware.ts` | Test. |
| 10 | An unconfirmed address was told "wrong password", with no way to resend the link. | route plus both AuthForms | e2e 6. |
| 11 | Sign-up consent was never recorded, because it needed a session that does not exist until the e-mail is confirmed. This is an nFADP gap. | route, new `lib/auth/signup-consent.ts` | e2e 1b: `consent_log` = 1 after confirmation. |
| 12 | The e-mail showed a 6-digit code that no page accepted. Owner decision: add a code box on both sites. | both AuthForms, `verify-code` mode | e2e 4. |
| — | A password sign-up posted to the dashboard host created a customer account. | route | Test plus e2e 8. |

**Owner decisions (question form, 2026-09-29):**
- Add an e-mail code box on both sites.
- Sign-in gets its own limit of 10 per minute per network.

**Not a defect:**
- The only auth user is the admin, and the token hook gives the role from `public.staff`. It ran successfully on every sign-in in the live log.
- Staff have no `customers` row by design. Why the admin never had one could not be determined, and it is harmless.
- The 3 erased customers are guest rows erased on 2026-09-09.

**`text[]`:** no auth or sign-in code passes or reads an array across the database boundary.

**Auth mail is sent through the Worker's `EMAIL` (Cloudflare Email) binding, not Resend.** Resend shows no auth mail, which is expected.

## Paths — before / after

Before = live and `af93fc8e`. After = this branch on a local Worker build.

| Path | Before | After | Evidence (after) |
|---|---|---|---|
| Public: sign up, mail, link, confirmed, `customers` row | BROKEN (sign-up rolled back) | WORKS | e2e 1a/1b: user row, 303→302→200, signed in, `customers`=1 |
| Public: password sign-in | WORKS for existing users | WORKS | e2e 2 |
| Public: e-mail link | BROKEN | WORKS | e2e 3 |
| Public: e-mail code | NOT OFFERED | WORKS | e2e 4 |
| Public: reset password | BROKEN | WORKS | e2e 5: new password works, old refused |
| Public: sign out | WORKS | WORKS | e2e 2 |
| Stay signed in after reload / closing the tab | WORKS (cookies 400 days) | WORKS | cookie attributes e2e 9; closing a real tab NOT TESTED |
| `/checkout` "Have an account? Sign in" returns with details | password: WORKS; link: BROKEN | password: WORKS; link: WORKS by code path | NOT TESTED in a browser; owner UAT 6 |
| `/account`, `/bookings` after sign-in | WORKS | WORKS (not changed here) | code map |
| Unconfirmed e-mail | Misleading "wrong password"; no leak | Clear message plus resend | e2e 6 |
| Dashboard: password | WORKS | WORKS | unchanged path; e2e 8 for non-staff |
| Dashboard: e-mail link | BROKEN and hidden | WORKS, visible | e2e 3 path; hosted allow-list, see owner step 1 |
| Dashboard: e-mail code | NOT OFFERED | WORKS | same `verify-code` path |
| Dashboard: passkey | WORKS | WORKS (unchanged) | NOT TESTED against the live origin; UAT 11 |
| Dashboard: TOTP asked once enrolled | WORKS | unchanged | unit tests |
| Dashboard: re-sign-in, then password change | BROKEN ("Couldn't save") | WORKS | unit test; UAT 12 |
| Dashboard: sign out | WORKS | WORKS | — |
| Customer cannot enter dashboard | Kept out, no message, session left on the host | 403 `not-staff`, session cleared, message | e2e 8 |
| Staff and customer sessions separate | WORKS (host-only cookies) | WORKS (no `Domain`) | e2e 9 |

## Checks — merged tree `adddb31b`

| Check | Result |
|---|---|
| Unit tests (apps/web vitest) | 235 files, 2360 passed, 1 skipped. The skip is `system-reads.local.test.ts` without a DB; run separately against my DB: passed. |
| New tests fail on `af93fc8e`, pass on the branch | Yes. Each fix commit has one; `tests/unit/auth/*`, `lib/ops/auth-ui-dc.test.ts`. |
| End-to-end on a real Worker build with a real local Supabase and the hook on | old: 8 of 10 lines FAIL; merged branch: 10 of 10 PASS. Rerun: `docs/runbook/auth-worker-e2e.md`. |
| pgTAP | 76 files, 1754 tests, PASS |
| From-zero migration replay | 109 migrations, PASS (own stack `vamos-taxi-auth`, ports 573xx) |
| `packages/db` local tests (Worker client options) | 26 passed |
| typecheck | pass |
| lint | pass |
| lint:css | pass |
| check:numbers | pass |
| check:legal-claims | pass |
| check:public-env | pass |
| check:db-fences | pass (`signup-consent.ts` added to `force_dynamic_exempt`; called only by the force-dynamic callback) |
| i18n:check | pass |
| seed:check | pass |
| types:check | no drift |
| build (`next build`) | pass; OpenNext Worker build pass |
| Visual (local, server answers stubbed) | Checked: public sign-in `?error` at 1440 en; code box sent-step and wrong code at 1440 en and 390 ar (RTL, no sideways scroll); unconfirmed banner at 768 de; dashboard login with banner at 1024 de; not-staff at 1440 en. Not every width × language combination; French not viewed. |

## Not verified

- Real inbox delivery on live through Cloudflare Email, and how the mail looks in Gmail or Outlook.
- The hosted Supabase redirect allow-list (owner step 1).
- Passkey on the live dashboard origin.
- The Cloudflare rate limiter on live. It counts per location, so it is not an exact 10.
- A real phone, and closing and reopening a real tab.
- The checkout sign-in round trip in a browser.
- Every width × language combination (see Visual above).

## Notes for the control session

- New Worker binding `AUTH_RATE_LIMITER` (`namespace_id` "1003", 10 per 60 s) in `apps/web/wrangler.jsonc`, staging and production. It is created by the deploy, so there is no secret to add. If the binding is missing, sign-in logs an error and allows the attempt.
- Live secrets already present (names checked only): `SEND_EMAIL_HOOK_SECRET`, `STAFF_REAUTH_SECRET`.
- `dashboard.vamostaxi.site` (Worker `vamos-dashboard`) forwards to Worker `vamos`. Only `vamos` needs a deploy.
- After deploy, the rule is still one 4242 test payment, because the checkout sign-in link path changed.
- Sign-up consent is recorded only for sign-ups made after this deploy.

## Owner steps

1. Supabase → your project → Authentication → URL Configuration → Redirect URLs. Check that both of these lines are in the list, and add any that is missing:
   - `https://vamostaxi.site/api/auth/callback**`
   - `https://dashboard.vamostaxi.site/api/auth/callback**`

   Then say "done".

No Resend or Stripe step.

## Owner UAT (after the control session deploys) — phone first

Use a fresh address you can read, for example a `+uat1` alias of your Gmail.

1. Phone, vamostaxi.site/sign-up: fill in your name, the fresh address and a password, then tap SIGN UP. Expected: "Check your email".
2. Phone, open that mail and tap the button. Expected: you land on vamostaxi.site signed in, and the header shows your account.
3. Phone, open the account menu and sign out, then go to /sign-in, tap "Email me a link instead", enter the same address and send. Expected: the sent screen also shows a 6-digit code box.
4. Phone, type the 6-digit code from the new mail and tap SIGN IN. Expected: signed in.
5. Phone, sign out, then open the link from step 3's mail again. Expected: the red notice "That link has expired or was already used. Ask for a new one below."
6. Computer, vamostaxi.site: start a booking up to /checkout, tap "Have an account? Sign in", sign in with your password. Expected: back on the same checkout with your details filled.
7. Computer, /sign-in, "Forgot password?", enter the address, open the mail, set a new password, then sign in with it. Expected: signed in. The old password is refused.
8. Computer, sign up a second fresh address, do not open its mail, then try to sign in with it. Expected: "Confirm your email first", with "Send the link again". Tap it: "Check your inbox. We sent a new link.", and a new mail arrives.
9. Computer, switch the language to Deutsch, then Arabic, on /sign-in. Expected: every label and message is translated, and Arabic reads right to left.
10. Computer, dashboard.vamostaxi.site/login. Expected: "Email me a link instead" is visible without a wrong password. Use it with your admin address, type the code. Expected: /dashboard.
11. Computer, dashboard login with your passkey. Expected: /dashboard. Then with your password: /dashboard.
12. Computer, dashboard → Settings, change your password (you are asked to re-sign-in). Expected: saved. Sign out, sign in with the new password: /dashboard.
13. Computer, dashboard.vamostaxi.site/login with the customer address from step 1 and its password. Expected: "This account can't open the dashboard. Use your staff sign-in." You stay on /login.
14. Computer, while signed in on the dashboard, open vamostaxi.site in another tab. Expected: the public site does not show you signed in as admin, and signing out there does not sign you out of the dashboard.
