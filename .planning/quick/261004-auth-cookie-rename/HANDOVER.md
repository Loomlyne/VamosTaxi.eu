# Hand-over: sign-in cookie renamed to `vt-auth` (fix/auth-cookie-rename)

Owner decision 2026-10-04 (question form): "Rename it, own job". Job session, worktree `.claude/worktrees/agent-ad892723ff45e1689`,
branch `fix/auth-cookie-rename` cut from `origin/main` 7c4818ec, origin/main 6737c53c merged in. No PR. Not deployed. Nothing touched on live.

**A fresh reviewer session must read this before it ships: it changes sign-in (customer and dashboard).**
Fresh review of bd2ed798: SHIP with conditions F1-F6. F2, F3, F4, F5, F6 are done on this branch (see "Review conditions" at the end).
F1 stays open until `fix/hide-internal-ids` is final.

## Ship order (F1)

This branch must **not** ship before `fix/hide-internal-ids` (it edits the `/cookies` page). Order:

1. `fix/hide-internal-ids` is final (the controller says so).
2. This job session merges that branch into `fix/auth-cookie-rename` and sets the `/cookies` "Sign-in" row's technical name to `vt-auth`
   in `app/pages/cookies.dc.html` and `apps/web/app/[locale]/cookies/page.tsx` (one commit, i18n/tests run), pushes, updates this file.
3. Then the controller ships `fix/hide-internal-ids` and this branch (or this branch alone if it already contains the other), deploys `vamos`.

Until step 2 the `/cookies` page on this branch still shows the old name on purpose.

## What changed

| File | Change |
|---|---|
| `apps/web/lib/supabase/cookies.ts` | `AUTH_COOKIE_NAME = "vt-auth"`; `authCookieOptions()` now passes `name`, so `@supabase/ssr` uses it as the storage key: session `vt-auth` (chunks `vt-auth.0`, `vt-auth.1`…), PKCE verifier `vt-auth-code-verifier`. New `LEGACY_AUTH_COOKIE_RE`, `legacyAuthCookieExpiry()`, `withLegacyAuthCookiesExpired()` |
| `apps/web/lib/supabase/server.ts` | server client already used `authCookieOptions`; the cookie-less re-auth client also gets the name (writes nothing, never names the project) |
| `apps/web/lib/supabase/middleware.ts` | unchanged source; both clients use `authCookieOptions`, so they follow |
| `apps/web/worker.ts` | `handleFetch` (public default export and the `Dashboard` entrypoint) wraps every answer: if the request still carries any `sb-<ref>-auth-token*` cookie (`.0/.1`, `-code-verifier`, flow verifiers), the answer gets `Set-Cookie: <name>=; Path=/; Max-Age=0; Expires=1970…; [Secure]; SameSite=Lax` for each, and a public cache header turns `private, no-store`. No old cookie → the very same response object |
| `apps/web/middleware.ts` | D-25 "auth cookie → private, no-store" now matches `vt-auth(.N)` and, for the one transition answer, the old names |
| tests | fixtures renamed (`sb-x-auth-token` / `sb-test-auth-token` → `vt-auth`), `secure-cookies` expects `name: "vt-auth"`, new cases in `lib/supabase/cookies.test.ts`; e2e Worker runners (`auth-worker`, `checkout-common`, `confirm-link`, `other-device`) match `vt-auth` |

Not changed, on purpose: `dashboard-gateway.ts` / `wrangler.dashboard.jsonc` (the gateway never reads, writes or strips cookies; grep clean),
no browser Supabase client exists, no DC mock reads or clears the auth cookie, CSP has no cookie rule. `/cookies` copy is NOT changed here
(branch `fix/hide-internal-ids` owns that page).

## /cookies page: exact text (set by this job session in ship-order step 2)

"Sign-in" row, Name column (both `app/pages/cookies.dc.html` line ~216 and the Next twin `apps/web/app/[locale]/cookies/page.tsx` line ~106):

`vt-auth`

(Optional detail if the row lists variants: `vt-auth`, `vt-auth.0`, `vt-auth.1`, `vt-auth-code-verifier`.) The name stays inside
`data-vt-no-i18n` as today.

## In-flight e-mail links (magic link, reset, sign-up confirm, e-mail change)

Nothing breaks. Since F12 (34c726db, 2026-10-01) every mailed sign-in / reset / confirm / e-mail-change link is the site's confirm page with a
`token_hash`; its button calls `verifyOtp`, which needs no PKCE verifier cookie. The verifier cookie is still written by `signInWithOtp`
but never read for these links. Only a pre-F12 `?code=` link would need the old verifier; OTP expiry is 3600 s, so none can still be valid.
The two remaining `/auth/v1/verify` types (staff invite, reauthentication) do not use the browser verifier either. **No fallback that reads
the old verifier name was added: there is nothing for it to rescue.** Proven: e2e scenarios 3 (magic link), 5 (reset), 1b, 3b-3h and the
confirm-link/e-mail-change suites pass on the new name, with the verifier cookie now named `vt-auth-code-verifier` (scenario 1a).

## What the owner and customers will see

Everyone signed in (customers and the owner on the dashboard) is signed out once, on the first request after the deploy, and signs in
again. No error page: an old cookie is simply ignored and expired (checked: public pages, `/account`, `/api/*`, dashboard `/login`).
A booking in progress is not affected (`vamos_qs`, `vt_manage`, `consent_subject`, `NEXT_LOCALE` are untouched).
The owner's dashboard sign-in methods (password, link, code, passkey, authenticator app) are unchanged; after the deploy he signs in once more.

What clearing does and does not do (F5): expiring the old cookie removes it from the browser only. It does **not** end the old session on
the server: the Supabase session and refresh token behind it stay valid until they expire on their own (access token 3600 s; the refresh
token until Supabase's session limits end it). Nobody can use them from that browser any more, because the cookie that held them is gone. To
end every old session at once would need a sign-out of all sessions on the Supabase side; that is not part of this job.

## Deploy order

One Worker: **`vamos` only** (`pnpm --filter web run deploy -- --env staging`). The gateway `vamos-dashboard` source is unchanged by this
branch, so it is not redeployed. Pairs that exist during the ship:

| gateway | vamos | state | tested |
|---|---|---|---|
| live (= this branch's `dashboard-gateway.ts`) | old | today | live |
| same | new | after deploy | locally: `wrangler dev -c <gateway cfg bound to lab Worker> -c wrangler.e2e.jsonc` (port 4719): `/api/auth/session` 200; admin password sign-in through the gateway with old cookies → `{"ok":true}`, `Set-Cookie vt-auth`, both old cookies expired, session `signedIn:true` |

Not verified locally: dashboard **pages** through the two-Worker pair. `GET /login` through the local gateway hangs with workerd
"routingHandler … overloaded" (the page's own `/app/ops/*` self-fetch inside one `wrangler dev` process). The wrapper cannot cause it: with
no old cookie it returns the inner response object unchanged, and the hang happens before any response exists. Dashboard pages were proven on the
lab's dashboard host (`dashboard.localhost:4711`, the same `Dashboard` code path minus the gateway's pass-through), and the gateway itself is
unchanged. After the deploy check live: dashboard `/login` 200, sign in, New trip opens.

## Proof (local, native Supabase lab `cookie`, no Docker)

- Unit: touched suites 28 files / 181 tests; full `pnpm test:unit`: web 415 files (4785 tests) pass, 16 skipped; emails 247; db 14.
- Gates: typecheck, eslint (changed), `pnpm lint`, `lint:css`, `i18n:check`, `check:numbers`, `check:db-fences`, `check:legal-claims`,
  `check:public-env`, `db:seed:check`, `test:scripts`: all pass. OpenNext build passes.
- Auth e2e on the local Worker build (`apps/web/tests/e2e-worker/run.sh`, lab stack 45121/45122, Workers 4710/4711): 79 PASS, 1 FAIL.
  PASS includes 1a-1b sign-up + confirm (`vt-auth` set), 2 password sign-in + sign-out (no token cookie left), 3 magic link, 4 e-mail code,
  5 reset, 8 dashboard host refuses a customer and leaves no token cookie, 9 cookie attributes (no Domain, Path=/, Lax, Secure), other-device
  b1-b5 (chunked `vt-auth.N` joined for the Data API), confirm-link 1-9, e-mail change 1-6, finish-account browser F1-F5, checkout-account and
  checkout-german (after the lab's own live price book was retired in the lab copy so the e2e fixture could go live).
  FAIL a3 (other-device forged lock): 503 `quote_lock_secret_missing` — run.sh's phase-1 Worker config has no quote-lock secret; unrelated to cookies.
- Browser (vamos-tester, brief `TEST-BRIEF.md`, reply `RESULT.md`, screenshots `evidence/`): C1-C6, D1-D4 PASS — old cookies cleared on
  public and dashboard hosts, customer password sign-in sets `vt-auth` only, `/account` works, sign-out clears it, 390 px no 500, lab admin
  dashboard sign-in, New trip form renders, a signed-in session survives old cookies being planted again.
- MFA: the lab admin has no authenticator app, so the aal2 step was not exercised in the browser. The aal2 gate reads the JWT, not the
  cookie name; `lib/auth/staff-mfa.test.ts` and the staff gate tests pass in the full unit run.

## Review conditions (fresh review of bd2ed798)

| item | status | commit |
|---|---|---|
| F1 ship after `fix/hide-internal-ids`; then merge it here and set `/cookies` Name to `vt-auth` | open, waits for the controller's word | — |
| F2 ready rollback that expires `vt-auth*` | done, branch `rollback/auth-cookie-rename` | `a380f5bf`, `181e6200` |
| F3 source test: `Dashboard.fetch` and `default.fetch` go through `handleFetch` | done, `apps/web/lib/supabase/worker-entry-cookies.test.ts` (4 tests) | `5d000385` |
| F4 live check includes the owner's authenticator-code step | done, live check 3 | this file |
| F5 clearing the cookie does not end the server session | done, "What the owner and customers will see" | this file |
| F6 stale `/^sb-/` diagnostic in `confirm-link.e2e.mjs:74` | done, counts `vt-auth(.N)` | `9b4f75b0` |

## Rollback

A plain revert is not enough: the old build would ignore `vt-auth`, and those cookies would stay in browsers holding a live session token.
The rollback is ready on branch **`rollback/auth-cookie-rename`** (pushed, tip `181e6200`, cut from this branch at `5d000385`):

1. `a380f5bf` revert(auth): back to the Supabase default cookie name. It reverts `490d1a51`, `9b4f75b0` and `5d000385`; `apps/` is then
   byte-identical to pre-rename main `7c4818ec` (checked with `git diff --quiet 7c4818ec a380f5bf -- apps`).
2. `181e6200` fix(auth): rollback. `withRetiredAuthCookiesExpired` in `apps/web/lib/supabase/cookies.ts`, wrapped around every answer in
   `apps/web/worker.ts` (default and `Dashboard`), expires `vt-auth`, `vt-auth.N`, `vt-auth-code-verifier` and the per-flow `vt-auth-…`
   verifier keys (`Max-Age=0`, Path `/`, Secure on https), and leaves `sb-*-auth-token`, `vt_manage`, `vamos_qs` alone.
   Test: `apps/web/lib/supabase/retired-cookies.test.ts` (expiry, untouched cookies, both Worker doors). Touched suites 27 files / 150 tests,
   typecheck and eslint pass. Not run on a Worker build.

How to use it: on main, cherry-pick `a380f5bf` and `181e6200` (or merge the branch if main has only this job on top), run the gates, deploy
`vamos` only. Everyone is signed out once more and signs in with the old name. No database or Supabase Auth setting is involved. If anything
other than this job has landed on main since, re-check that `a380f5bf` still reverts only these three commits.

## Live checks after deploy (controller)

1. `curl -sI -H 'Cookie: sb-<any>-auth-token.0=x' https://vamostaxi.site/` → a `Set-Cookie: sb-<any>-auth-token.0=; Path=/; Max-Age=0 …; Secure` line.
2. Customer sign-in in a browser → cookie list shows `vt-auth` (or `vt-auth.0`), nothing starting `sb-`.
3. Dashboard on the owner's own account (F4): sign in with his usual method **including the authenticator-code step** on his account (the lab
   admin had no authenticator app, so this step was never run before live). Expected: the code is accepted, the dashboard opens
   at full access (aal2), cookie list shows `vt-auth*` on `dashboard.vamostaxi.site` and nothing starting `sb-`. Then open New trip.
4. `/cookies` "Sign-in" row shows `vt-auth` (it ships with this branch after ship-order step 2).
