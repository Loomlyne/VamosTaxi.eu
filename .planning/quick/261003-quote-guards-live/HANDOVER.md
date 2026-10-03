# HANDOVER — quick 261003 quote guards live

Branch `fix/quote-guards-live`. Job session: nothing on main, nothing deployed, live database not touched, no secret read or set.

**Base.** The brief said to stack this on `fix/quote-rate-buckets`. That branch was already shipped (709c51aa, Worker 74521422) and archived (`archive/fix-quote-rate-buckets`; its code is identical to main). So this branch is cut from `origin/main` **befb6e54**, which was still the tip when this was written. No merge was needed. It ships on its own, on top of main.

**Review.** This change is next to security and sign-in: the challenge, the visitor cookie, and a staff-session exemption. A **fresh reviewer session must read it before it ships**.

## Owner decisions carried out (2026-10-03)

### A. Anti-bot check on prices

Before this change there were two faults on live:
1. The quote guard read `env.TURNSTILE_SECRET`, which live does not have, so the challenge never enforced.
2. The guard read the token from the `cf-turnstile-response` **header**, but `/checkout` sends it in the JSON **body** (`turnstile_token`). Simply renaming the secret would have broken checkout: from the 3rd price in a minute the customer would get a challenge that could never pass.

The change:
- **Secret.** `quoteTurnstileSecret()` in `lib/abuse/guards.ts` reads `TURNSTILE_SECRET_KEY`, the secret live has. The old `TURNSTILE_SECRET` is a fallback, read only when the new key is absent. That is harmless: live has neither old nor duplicate.
- **Token.** `turnstileTokenOf()` reads the body `turnstile_token`, with the header as a fallback.
- **Dashboard New trip.** `OpsNewTrip.dc.html` posts `/api/quote` and has no challenge widget. So `app/api/quote/route.ts` passes a staff check, and only on the dashboard host: `requestHasStaffSession`, the same gate as `/api/staff/*`. It is asked only when the challenge would refuse. Without it the owner would be locked out of New trip from his 3rd quote in a minute.
- **Where the challenge applies.** The guard runs only in `POST /api/quote`. Reprice and `/api/checkout/price` never ran it. `challengeDecision` is unchanged: no check on the 1st and 2nd quote, enforced from the 3rd. The KV counter is keyed on IP, or IP plus visitor once the cookie exists, and lives 60 s. The window slides: each attempt renews it.
- **The page customers use.** That is `/checkout`, the React `CheckoutPage`. Home is the DC mock and never POSTs `/api/quote`. The page already had widgets in three places: the class list, the trip editor and the pay bar, with messages in en/de/fr/ar (`quote.error.turnstile_required`). **No new UI and no new strings.**
- **Client.** `CheckoutPage.tsx` changed by one comment only against main. I tried a loading state after a token and reverted it (c0f11e8c): a refused token then re-mounted the widget, which posted again by itself in a loop. Now a refused token leaves the message and TRY AGAIN, and each new try needs a click.

### B. Signed visitor cookie

- `middleware.ts` has `appendVisitorCookie()`. It runs in the DC-page branch (home, which returned before the mint) and in the Next branch (`/checkout`).
- When `VAMOS_QS_SECRET` is set and the request has no cookie that verifies, it appends `vamos_qs=<id>.<hmac>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`.
- A response that mints the cookie is set to `Cache-Control: private, no-store`, so a shared cache never hands one visitor's cookie to another. A returning visitor whose cookie verifies keeps the public marketing cache.
- The cookie goes on a middleware response, not a hand-built `Response.json()`, so the OpenNext cookie note does not apply. The local Worker shows the header arriving (below).
- **No secret means exactly today's behaviour:** no cookie and the same cache headers. Unit test plus local Worker.
- The dashboard host never mints the cookie.

**Cookies page.** `vamos_qs` is **not listed** on `/cookies` (`app/pages/cookies.dc.html`, Strictly necessary table). It is a strictly necessary security cookie (rate limiting and bot defence, 24 h, Vamos Taxi). **The owner must decide the row's wording.** I did not write legal copy. The same table also does not list `vt_manage` or `NEXT_LOCALE` (noted only).

## Commits

| Commit | What |
|---|---|
| 7434be06 | A: secret name, body token, dashboard staff exemption, unit tests |
| 372b6974 | B: `vamos_qs` on DC pages and `/checkout`, private cache on mint, middleware test |
| c0f11e8c | Client: no loading state after a token (no loop), comment only |
| 9f2b3660 | Tools and evidence (this folder) |

## Proof on a local Worker build

Setup:
- Built with `scripts/test-lab/lab.sh up guards --no-dash`: own Supabase stack, slot 1, ports 4710/4711/4717/4719/9711/9712. Lab amounts are stand-ins, not prices.
- `tools/worker.sh` restarts the Worker with **Cloudflare's public Turnstile test keys**:
  - site key `1x…AA` always passes;
  - `2x…AB` always blocks;
  - `3x…FF` is an interactive checkbox;
  - secret `1x…AA` always passes; `2x…AA` always fails.
- In the browser the real widget script runs. The quote guard's siteverify goes to the **real** Cloudflare (`tools/ts-proxy.mjs` forwards JSON calls; log lines say `quote-siteverify-REAL`).
- The checkout account gate (not changed here) needs `action=account`, which Cloudflare test secrets never return, so its siteverify stayed on the lab stand-in.

**Lab harness fault found (not site code).** `scripts/test-lab/lab-browser.mjs` `open()` sends `cf-connecting-ip` on every request in the browser context, including Cloudflare's. Cloudflare then refuses the challenge, and no widget ever gets a token. My script sets the header only for the local Worker host. Worth fixing in the lab later.

| Run | Config | Result | Evidence |
|---|---|---|---|
| B probe | `VAMOS_QS_SECRET` set | `GET /` and `GET /checkout` each set a signed `vamos_qs`, `private, no-store`. A second visit with the cookie gets no new one and keeps `public, s-maxage=300`. **With the cookie, quotes 1–8 pass the limiter and the 9th is 429. Without it, 1–4 pass and the 5th–8th are 429.** | `evidence/qs-probe.json` |
| A pass | site key 1x, secret 1x, cookie | 1440 + 390: home → `/checkout` priced; reloads → 3rd quote `403 turnstile_required`; widget token → `200` priced (token in body, real siteverify `success:true`); Economy → traveller → PAY → intent 200, one fake Stripe session equal to the PAY label. 8/8. | `evidence/pass/` |
| A interactive | site key 3x, secret 1x, cookie | Same, with the visible "Verify you are human" box; a click gives prices and PAY. 8/8. | `evidence/interactive/*-2-challenge.png`, `*-3.png`, `*-4.png` |
| A interactive, no cookie | as above, **no** `VAMOS_QS_SECRET` (live today) | 8/8. Note: the token quote is the 4th, the last of the bare 4/60. | `evidence/interactive-no-qs/` |
| A secret fails | site key 1x, secret 2x | The refused token ends on "Confirm this request and try again" + TRY AGAIN, with no spinner. TRY AGAIN makes one new challenge round and no loop (one token per click). | `evidence/secretfail/` |
| A widget blocks | site key 2x | Message + TRY AGAIN, with no spinner. | `evidence/block/` |
| A languages | site key 3x | Challenge message in de/fr/ar at 390 and en at 768. `lang` set, Arabic `dir=rtl`, nothing scrolls sideways. | `evidence/langs/` |
| Dashboard | local dashboard Worker, admin signed in, no cookie | Signed-in owner: 4 quotes, none `turnstile_required`. No session on the dashboard host: the 3rd is `turnstile_required`. | `evidence/dashboard/` |

The text inside Cloudflare's own widget follows the visitor's browser language. Headless Chromium was in English.

## Tests

- New: `lib/abuse/quote-turnstile-live.test.ts` (secret choice, body or header token, enforce from the 3rd, pass and fail tokens, exemption asked only on refusal, throwing check is no exemption, route wiring).
- New: `lib/abuse/visitor-cookie-middleware.test.ts` runs the real middleware for `/` and `/checkout`, with and without the secret, including forged cookies, cache headers and the dashboard host. Two of its lines fail on the old middleware.
- Updated: `rate-counters.test.ts` (route call shape).
- Full gates once, at the end, in this worktree:
  - `typecheck` passed.
  - `lint`: 0 errors, 6 old warnings.
  - `i18n:check`, `check:legal-claims`, `check:numbers` and `check:db-fences` passed.
  - apps/web `vitest run`: 403 files and **4352 tests passed**, 16 files and 31 tests skipped.
  - `test:scripts`: 20 passed.
- Not run: the DB-local suites, which need the shared 54322 stack.

## Owner's one terminal step: VAMOS_QS_SECRET

Nobody types the value into chat. He runs it himself, after this ships or before; both orders are safe (below).

1. In Terminal, in `/Users/koss/Developer/VamosTaxi.eu/apps/web`, run `openssl rand -base64 48 | pnpm exec wrangler secret put VAMOS_QS_SECRET --env staging`. This makes a random value and pipes it straight into the Worker `vamos` secret, so the value is never shown.

## Ship order

- `fix/quote-rate-buckets` is already live, so this is the next ship on main.
- Ship this branch as one squash on main and deploy with `--env staging`.
- **Secret before or after deploy: both are safe.**
  - **Before:** the current live code already mints `vamos_qs` on Next pages such as `/checkout` and reads the secret in the guards. Customers would just get the larger verified bucket a little earlier. Home starts minting only after this deploy.
  - **After:** this code with no secret behaves like today (unit test plus "interactive, no cookie" run).
  - `wrangler secret put` itself publishes a new Worker version of the code already live; say so on the board.
- **What changes for customers on deploy:** the challenge **starts enforcing on live**, from a visitor's 3rd `/checkout` price inside a sliding minute. Live `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are the contact form's pair (names checked read-only with `wrangler secret list`; values not read), so the widget hostnames should already include vamostaxi.site.

## Ship check (after deploy, live)

1. On a phone, home → ZRH → Zurich Main Station → `/checkout`: prices show.
2. Reload `/checkout` twice: on the 3rd, the check appears in the class box. Solving it (usually it passes by itself) shows prices.
3. Economy → traveller → PAY. Checkout is touched, so per CLAUDE.local.md rule 8: one 4242 test payment, then read `booking_payments`.
4. After the secret is set: `curl -sI https://vamostaxi.site/ | grep -i set-cookie` shows `vamos_qs=…; HttpOnly; Secure; SameSite=Lax`.
5. Dashboard New trip: price 3 trips within a minute; none asks for a check.

## Rollback

- Code: `git revert c0f11e8c 372b6974 7434be06`, then deploy. Nothing in the database changed.
- Secret: `wrangler secret delete VAMOS_QS_SECRET --env staging` turns the visitor cookie off again; cookies already sent then simply fail to verify (bare bucket).

## Not verified

- Nothing on live or on a deployed Worker. Cloudflare rate limits are per colo and eventually consistent there.
- Cloudflare test secrets answer `hostname: example.com`; the quote guard does not check hostname or action (unchanged), so a token from the contact form widget would also pass a quote challenge (tokens are single-use).
- The trip-editor and pay-bar challenge widgets were not driven in the browser; they use the same `fetchQuote` body token path that the class-list run proved.
- The account gate with real Turnstile keys was not exercised (lab stand-in, see above).
- Live widget hostnames for the site key were not read (Cloudflare dashboard setting).

## Failed

- None open.
- Fixed during the job: the first browser runs failed because of the lab harness `cf-connecting-ip` fault above.
- Reverted during the job: the loading state after a token (it looped).

## Cleanup

- The lab stack `vamos-lab-guards` and its state in `~/.vamos-scratch/lab-guards` are removed by `lab.sh destroy guards` (done at hand-over).
- The build output `apps/web/.open-next` in this worktree is gitignored.
