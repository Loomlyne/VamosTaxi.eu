# Hand-over: dashboard screen files under /app/ops need a staff session (fix/ops-asset-gate)

Job session (sign-in / security lead), worktree `.claude/worktrees/agent-a27c298ece3746d96`, 2026-10-04 18:11–19:25 +04.
Owner, in the controller's chat about 18:00: "do the ops sign-in gate job too in parallel".

- Branch: `fix/ops-asset-gate`, cut from `origin/main` `f9295639`. `origin/main` merged in twice (`a4b32434` at `6c240d4b`, `49cee07d` at `1cef12b2`), no conflict: main touched none of this job's files.
- Code: `79225cf8` (the change) + `c55bebb9` (test typing). Tip: `git log -1 origin/fix/ops-asset-gate` (this hand-over is the last commit; everything after `c55bebb9` is merges and planning).
- `git diff --stat origin/main HEAD -- apps app`: 12 files, +744/−86, all listed below. No migration, no database change, no connector call, no deploy, nothing on live.

**This changes sign-in (who may read the dashboard's files, and how the dashboard pages load). A fresh reviewer session must read it before it ships.**

## Facts (before the change, `origin/main` `f9295639`)

1. **Who answers `/app/ops/*` on `dashboard.vamostaxi.site`.** Gateway `vamos-dashboard`: `dashboard-gateway.ts:70-72` sends `/app/ops*` to `env.APP` = Worker `vamos`, entrypoint `Dashboard` (`worker.ts:85-89`) → `handleFetch` → `routeFetch` (`worker.ts:60-67`): `guardOpsAsset` (`lib/dc-mock-urls.ts:252-258`, null on the dashboard host) → `isOpsAssetRequest` (`:240-243`) → `serveOpsAsset(surfaced, env.ASSETS)` (`:274-286`). This runs before OpenNext, so `middleware.ts` (the staff gate) never saw these requests. **Answer: the file, to anyone, no cookie read.**
2. **Public host.** Worker `vamos` default fetch; `wrangler.jsonc:14` runs the Worker first for `/app/ops/*`; the host is pinned to the apex (`lib/security/pin-sni.ts:56-68`); `guardOpsAsset` answers an empty 404, `private, no-store`. Unchanged.
3. **What `/login` needs before sign-in.** The page is `ops-login.dc.html`, which `serveOpsDc` (`middleware.ts:163-191`, called at `:412-414`) fetched over HTTP and inlined. Its helmet loads `./support.js` (`app/ops/ops-login.dc.html:8`) and it imports one component, `<dc-import name="AuthForm">` (`:53`). `AuthForm.dc.html` imports no component; its helmet loads `./support.js` (`:6`, already loaded) and four files outside `/app/ops` (`:29-32`). The runtime fetches components lazily as `./<Name>.dc.html` (`support.js:1644`) and re-reads `location.href` (`:157`, i.e. `/login`). In the lab, signed out, the browser requested exactly `/app/ops/support.js` and `/app/ops/AuthForm.dc.html` (G1, X3).
4. **How the dashboard pages decide "signed-in staff".** `dashboardHostMiddleware`, `middleware.ts:377-402`: `getUser()` (the auth server verifies the token and returns the factor list), `getSession()`, role = hook-minted `app_metadata.vamos_role` from the access token, AAL from the token, `effectiveNextLevel` (`lib/ops/staff-gate.ts:63-70`: a verified factor ⇒ aal2 required), `passkeyGateInputs` (amr only), `staffGateDecision` (`staff-gate.ts:50-54`), `inConsole = role === "admin" && gate === "allow"`. No staff-row read per request in the middleware: the access-token hook mints the role only from an active, accepted `public.staff` row (`20260901000001_staff_invitation_acceptance_gate.sql:34-53`); SQL `app.is_staff()` / `app.is_admin()` (`:9-29`) re-check the row on every staff query. The rule **cannot** be judged from the token alone: whether an authenticator app is enrolled (the aal2 requirement) is only in `getUser()`'s server answer.
5. **What `x-vamos-dc-asset: 1` unlocked.** Set by the two middleware self-fetches (`middleware.ts:124` public pages, `:170` dashboard page files). Read only in `gatePublicRequest` (`lib/dc-mock-urls.ts:216`, `if (isInternalAsset(request)) return null;`), before every check except `/api`. Any client sending it on a document navigation skipped the Worker gate's leftover 404s (`/login`, `/login/confirm`, `/ops`, `/ops/*`, `/become-a-partner`) and the 308/404 for raw mock files (`/app/pages/*`, `/app/home/*`, `/dev*`); the raw `.dc.html` was then served as a page. It never unlocked `/app/ops/*` (handled before that line), which on the dashboard host was open anyway. From code reading, plus the unit mutation below (putting the line back fails the new test).

## Files

| File | What |
|---|---|
| `apps/web/lib/ops/session.ts` | new `dashboardConsoleAllowed(supabase)`: the lines of `middleware.ts:377-402` moved verbatim into one function |
| `apps/web/middleware.ts` | `dashboardHostMiddleware` calls it (`const inConsole = await dashboardConsoleAllowed(client.supabase …)`); `serveOpsDc` reads `ops.dc.html` / `ops-login.dc.html` with `getCloudflareContext().env.ASSETS.fetch(…)`; `serveDcHtml` self-fetch sends no header; `INTERNAL_ASSET_HEADER` import gone |
| `apps/web/lib/ops/asset-gate.ts` | new: `OPS_LOGIN_ASSETS` allow-list, `opsAssetSession`, `serveGatedOpsAsset` |
| `apps/web/lib/supabase/request.ts` | new: `createRequestSupabaseClient(request, {url, anonKey})` for a plain Worker `Request` (no `next/*`): same cookie name and attributes (`authCookieOptions`), same Cookie-header reading as the route client (`cookieListFromHeader`); every cookie Supabase writes comes back as a ready `Set-Cookie` line |
| `apps/web/worker.ts` | `/app/ops/*` after `guardOpsAsset` → `serveGatedOpsAsset(surfaced, {ASSETS, SUPABASE_URL, SUPABASE_ANON_KEY})`; no path serves an `/app/ops` file around it |
| `apps/web/lib/dc-mock-urls.ts` | `INTERNAL_ASSET_HEADER`, `isInternalAsset` and the bypass line removed; `opsAssetNotFound()` = the public host's 404, shared |
| `apps/web/lib/ops/asset-gate.test.ts` | new, 15 tests (real `@supabase/ssr` + supabase-js on real `vt-auth` cookies; Auth's HTTP answers and ASSETS are stand-ins) |
| `apps/web/lib/ops/serve-ops-dc-assets.test.ts` | new, 6 tests (real middleware): documents read from ASSETS, no HTTP self-fetch; documents and screen files give the same verdict for six sessions |
| `apps/web/lib/ops/staff-gate.test.ts`, `tests/unit/ops-dashboard-host.test.ts`, `lib/security/ops-assets.test.ts`, `lib/dc-mock-urls.test.ts` | source contracts follow the moved rule; the header test now proves the header changes nothing |

Not changed: `dashboard-gateway.ts`, `wrangler.dashboard.jsonc`, `wrangler.jsonc`, every `.dc.html`, the database.

## What changed

1. **The gate.** On the dashboard host, `/app/ops/<file>`:
   - an allow-listed sign-in file → served as before (no session check, its own cache header, today `public, max-age=300`);
   - anything else → `dashboardConsoleAllowed` on the request's `vt-auth` cookie, the same function the dashboard documents now call. Allowed: the file, `cache-control: private, no-store`, security headers, `noindex`. Refused (signed out, customer, dispatcher, admin at aal1 with an authenticator app, forged or revoked token, Auth unreachable, credentials missing): `opsAssetNotFound()`, byte-for-byte the public host's 404 (no body, `private, no-store`, security headers). A signed-out visitor cannot tell a gated file from a missing one.
   - If Supabase refreshed an expired session during the check, the new `vt-auth` cookies ride on the answer (allowed or refused), as the middleware does on documents. Dropping them would leave the browser on a refresh token Supabase already rotated.
2. **Cost.** No cookie: no network call. With a session: one `GET /auth/v1/user` to Supabase Auth per gated file (no Postgres query from the Worker), plus a refresh when the token expired. Lab counts per page view: `/dashboard` 3 gated files, `/bookings` 3, a booking detail 3; the document itself already makes 2 such calls (gate + `updateSession`). Worker bundle: +43 KiB raw, +10 KiB gzip (4,617.7 → 4,627.9 KiB gzip, `wrangler deploy --dry-run`).
3. **No self-fetch.** `serveOpsDc` reads the two page files from the assets binding. Locally this also removes the self-fetch that hung `/login` through the gateway in the auth-cookie job (GW3: 55 ms).
4. **The header.** `x-vamos-dc-asset` is no longer read anywhere. `serveDcHtml` still self-fetches public mock files over HTTP, without the header: those fetches carry no `sec-fetch-dest`, so the gate passes them as it always did (P2, P4 prove public pages and `/login/confirm` still render).

## Allow-list (exact paths, `lib/ops/asset-gate.ts`)

- `/app/ops/support.js`
- `/app/ops/AuthForm.dc.html`

Nothing else, including `ops-login.dc.html` (read server-side, never by the browser). Case, trailing slash, `%41…`, `.map` and prefix variants are not on it (unit test).

## Forged `x-vamos-dc-asset`

- Before: skipped the Worker gate's leftover/mock 404s and 308s on document navigations (fact 5).
- Now: same answer with or without it. Unit: 7 paths × host. Lab curl, public host: `/login`, `/dev`, `/ops/bookings`, `/become-a-partner` 404 both ways (same 151,655 B page); `/app/pages/terms.dc.html`, `/app/home/home.dc.html` 308 both ways, same `location`; `/app/ops/ops.dc.html` 404 both ways; dashboard host: mock files 308 both ways, `/app/ops/*` 404 both ways (G4, GW2, P3).

## Checks (final code `c55bebb9`, re-run after the last merge `49cee07d` where marked)

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | pass |
| `node scripts/sync-dc-mock-to-public.mjs` | pass: 20 pages, comments stripped from 115 files |
| `pnpm typecheck` | pass (also after `49cee07d`) |
| `pnpm lint` | pass: 0 errors, 6 old warnings (also after `49cee07d`) |
| `pnpm lint:css` | pass |
| `pnpm check:public-env` | pass, built client bundle scanned (with `.open-next`), and again without build output after `49cee07d` |
| `pnpm check:db-fences` | pass 8/8 (1,196 files after `49cee07d`) |
| `pnpm i18n:check` | pass, 2,709 keys |
| Vitest: `lib/supabase`, `lib/security`, `tests/unit/auth`, `lib/dc-mock-urls`, and every test importing `worker.ts`, `middleware`, `dc-mock-urls`, `ops/session`, `supabase/request`, `asset-gate`, `dashboard-gateway` | **78 files, 777 tests pass**. One earlier run had `public-no-internal-ids` "served dashboard screens are stripped" fail at 5.3 s (vitest's 5 s limit, Mac load 35–42); alone 21/21, and the full list again 78/777 at load 9 |
| After merge `49cee07d`: the gate, auth, security, supabase suites + main's new `dc-icons-vendored` | 44 files, 322 tests pass |
| Mutation checks (each reverted, green again) | gate decision forced to allow → 10 tests fail (asset-gate + parity); `worker.ts` serving `serveOpsAsset` directly → source test fails; `OpsDetail.dc.html` added to the allow-list → 10 fail; the header bypass put back in `gatePublicRequest` → the header test fails |
| `pnpm --filter web run build` | pass, once. `.next`, `.open-next`, `.wrangler` removed afterwards; no `.next-*` |

## Local Worker proof

Lab `gate` (native Supabase, no Docker, slot 1: stack 45121/45122, Workers 4710/4711, fakes 4717), destroyed at the end (`PASS | destroy`).

1. **Browser, headless Chromium** (`vamos-tester`, Sonnet; brief `TEST-BRIEF.md`, reply `RESULT.md`, scripts and screenshots `evidence/`), build of `79225cf8`:
   - Signed out `/login`: 200, form shown; `/app/ops` requests = `support.js` 200 + `AuthForm.dc.html` 200, nothing else. Eight screen files (`ops.dc.html`, `ops-login.dc.html`, `ops.html`, `OpsDetail`, `OpsBoard`, `OpsSettings`, `OpsSidebar`, `OpsTable`): 404, empty, `private, no-store`; same with the forged header.
   - Admin sign-in → `/dashboard` (5 `/app/ops` requests, all 200), `/bookings` (3, all 200), booking detail `/bookings/VT-26-0003` (3, all 200: `OpsSidebar`, `OpsDetail`, `ActionsMenu`), 390 px sign-in and dashboard (all 200). Signed in, `OpsDetail.dc.html` and `ops.dc.html` 200, `private, no-store`.
   - Sign-out from the profile menu → `/login`; the eight files 404 again; `vt-auth` emptied.
   - Public host: `/app/ops/*` 404 (allow-listed files too); `/` and `/terms` 200; `/login/confirm` on the dashboard 200.
   - **Console errors: not 0.** Every one is outside `/app/ops` and not from this change: 404 `/photos/site/ops-login-bg.jpg` (R2 photo; the lab bucket is empty), 401 `GET /api/staff/me` (AuthForm's signed-out step-up probe, `AuthForm.dc.html:340`, by design), and on the booking detail 404 `/assets/icons/route.svg` (missing in that build; main added it in `d2fc3310`, merged here after the run). With `/photos/**` stubbed, the only response ≥ 400 on `/login` and the 390 px sign-in is the 401 probe (X3).
2. **Two Workers, as live: unchanged gateway `dashboard-gateway.ts` in front of this branch's Worker** (`wrangler dev -c evidence/wrangler.gw.local.jsonc -c wrangler.e2e.jsonc`, port 4719; `evidence/gateway-pair-probe.mjs`, `gateway-pair-results.json`), build of the merged tree: **9/9 PASS**. Signed out: 5 screen files 404 `private, no-store`, sign-in files 200; forged header 404; `/login` 200 in 55 ms with `<base href="/app/ops/">` (no self-fetch hang); admin password sign-in through the gateway `ok`, `/dashboard` and `/bookings` shells 200, every screen file 200 `private, no-store`; a customer's `vt-auth` (signed in on the public host, cookie replayed on the dashboard) → screen files 404, `/dashboard` 307; after sign-out, no cookie and the old cookie replayed → 404.
3. **Auth e2e on the Worker build** (`apps/web/tests/e2e-worker/run.sh`, lab stack, Workers 4710/4711, `evidence/auth-e2e-run2.txt`): **54 PASS, 1 FAIL, 1 N/A.** PASS includes 1a0–1b sign-up and confirm, 2 password sign-in/out, 3–3i link and finish, 4 e-mail code, 5 reset, 6 unconfirmed, 7 rate limit, **8 dashboard host refuses a customer (403 not-staff, no token cookie)**, **9 cookie attributes (22 sets, 0 violations, Secure)**, other-device, confirm-link 0–9, e-mail change 0–6, finish-account browser F1–F5. FAIL a3 (forged quote lock): 503 `temporarily_unavailable`, run.sh's phase-1 config has no quote-lock secret, the same line failed in the auth-cookie job. N/A d2 (no Stripe key in the local Worker). Phase 2 (`checkout-account`, `checkout-german`) did not start: its setup collides with the lab's own live price book (`rate_versions_one_live`), as in the auth-cookie job. The first run (`gate`) lost its Worker after 1a0 (`ECONNRESET`, Mac load 35); the second run (`gate2`) is the one counted.
4. Path variants (curl, both lab hosts): `/app/ops%2FOpsDetail.dc.html`, `/app/%6Fps/…`, `/app//ops/…` answer 307 to `/app/ops/OpsDetail.dc.html`, which is gated (404 signed out); `/app/ops/./…`, `…/AuthForm.dc.html/../OpsDetail.dc.html`, `%2E`, `%44` variants 404.

## NOT verified

- Nothing on the live hosts. Live Cloudflare's asset layer may normalise encoded paths differently from `wrangler dev` (point 4): the controller's live check 6 covers it.
- The authenticator-app (aal2) step in a browser: the lab admin has none. Covered by unit tests (aal1 + verified factor → 404, aal2 → 200, the parity test on the real middleware) and by the rule being one shared function.
- A refreshed session (expired access token) in a browser: unit tests only (refresh call, then `/user`; new `vt-auth` on the answer, Secure, Lax, no Domain). Parallel screen-file loads with an expired token each refresh once; GoTrue's reuse interval accepts that, as it does today for parallel `/api/staff/*` calls. Not load-tested.
- Dashboard screens other than dashboard, board and booking detail (pricing, settings, fleet, customers, support, reviews, content, profile, new trip) were not opened in a browser. They load through the same gate; with an admin session every `/app/ops` file answered 200 in GW7 (`OpsSettings`, `OpsBoard`, `OpsDetail`, `ops.dc.html`, `OpsSidebar`, `OpsTable`, `ActionsMenu`).
- The phase-2 checkout e2e (not started, lab price book) and the full `test:unit` (shared Mac; the controller runs the full gates).
- `vamos-ops-changes` (the undeployed review Worker that serves the console without sign-in): the gate applies there too, so its screens would 404 without a staff session. It has no routes and is not deployed; nothing done.

## Deploy order

**Worker `vamos` only** (`pnpm --filter web run deploy -- --env staging`). `dashboard-gateway.ts` and `wrangler.dashboard.jsonc` are unchanged: the gateway already forwards `/app/ops*` with its Cookie header to `Dashboard`. Pairs during the ship:

| gateway | vamos | state | tested |
|---|---|---|---|
| live (= this branch's source) | old | today | live |
| same | new | after the deploy | locally, two Workers (proof 2): 9/9 |

No migration, no secret, no database step. Everyone stays signed in (cookie name and session unchanged).

## Live checks after deploy (controller, signed out, read-only)

1. `curl -sI https://dashboard.vamostaxi.site/app/ops/OpsDetail.dc.html` → `404`, `cache-control: private, no-store`, `content-length: 0` (or no body). Same for `/app/ops/ops.dc.html`, `/app/ops/ops-login.dc.html`, `/app/ops/OpsSettings.dc.html`, `/app/ops/OpsBoard.dc.html`, `/app/ops/ops.html`.
2. `curl -sI https://dashboard.vamostaxi.site/app/ops/support.js` and `…/app/ops/AuthForm.dc.html` → `200`.
3. Check 1 again with `-H 'x-vamos-dc-asset: 1'` → still `404`.
4. `curl -s https://dashboard.vamostaxi.site/login` → `200`, HTML containing `<base href="/app/ops/">` and `dc-import name="AuthForm"`.
5. `https://vamostaxi.site/app/ops/support.js` → `404` (unchanged); `https://vamostaxi.site/` and `/terms` → `200`; `https://dashboard.vamostaxi.site/login/confirm` → `200`.
6. Encoded paths on both hosts must not return the file: `curl -s -o /dev/null -w '%{http_code} %{size_download}\n' -L --path-as-is` for `/app/ops%2FOpsDetail.dc.html`, `/app/%6Fps/OpsDetail.dc.html`, `/app//ops/OpsDetail.dc.html` on `https://dashboard.vamostaxi.site` and `https://vamostaxi.site` → a final `404` with 0 bytes each.

## Live check the owner does (signed in)

1. Open `https://dashboard.vamostaxi.site` and sign in the way he always does, including the authenticator-app code if his account has one. Expected: the dashboard opens.
2. Open the trips board. Expected: the board shows his trips.
3. Open one booking. Expected: the booking detail shows, with its reference and actions.

A blank screen or a screen that never fills in on any of these = roll back (below).

## Rollback

Revert the squash commit on main and deploy `vamos` only. No cookie, database or gateway step: the gate, the shared rule function and the ASSETS read go back together, and the old self-fetch returns.
