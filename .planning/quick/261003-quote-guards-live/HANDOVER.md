# HANDOVER — quick 261003 quote guards live

Branch `fix/quote-guards-live`. Job session: nothing on main, nothing deployed, live database not touched, no secret read or set.

**Base.** The brief said to stack this on `fix/quote-rate-buckets`. That branch was already shipped (709c51aa, Worker 74521422) and archived (`archive/fix-quote-rate-buckets`; its code is identical to main). So this branch is cut from `origin/main` **befb6e54**, which is still the tip. No merge was needed, and it ships on its own, on top of main. History was not rewritten after the review started: the review fixes are added commits.

**Review.**
- A fresh reviewer read tip 5e110fbc and said **FIX FIRST**.
- Items 1, 2, 4 and 5 are fixed on this branch; items 3, 6 and 8 are in this file. Details are in "Review fixes" below.
- This change sits next to security and sign-in: the challenge, the visitor cookie, a staff-session exemption and session cookies. **The reviewer must re-read the review commits before it ships.**

## Owner decisions carried out (2026-10-03)

### A. Anti-bot check on prices

Before this change there were two faults on live:
1. The quote guard read `env.TURNSTILE_SECRET`, which live does not have, so the challenge never enforced.
2. The guard read the token from the `cf-turnstile-response` **header**, but `/checkout` sends it in the JSON **body** (`turnstile_token`). Renaming the secret alone would have broken checkout: from the 3rd price in a minute the customer would get a challenge that could never pass.

The change:
- **Secret.** `quoteTurnstileSecret()` (`lib/abuse/guards.ts`) reads `TURNSTILE_SECRET_KEY`, the secret live has. The old `TURNSTILE_SECRET` is read only when the new key is absent.
- **Token.** `turnstileTokenOf()` reads the body `turnstile_token`, with the header as a fallback.
- **Dashboard New trip.** `OpsNewTrip.dc.html` posts `/api/quote` and has no widget.
  - `app/api/quote/route.ts` lets a staff session on the dashboard host through without a challenge (`requestHasStaffSession`, the same gate as `/api/staff/*`).
  - The staff check runs only when the challenge would refuse.
  - Rotated session cookies are copied onto the answer (review 2).
- **Counting.** The challenge applies only in `POST /api/quote`. No check on the 1st and 2nd quote in a 60 s window; enforced from the 3rd.
  - The count is kept by a Workers rate-limit binding, `TURNSTILE_ATTEMPT_LIMITER` (ns 1011, 2 per 60 s, fixed window), keyed on IP, or IP plus visitor once the cookie exists.
  - The old KV counter is used only if the binding is missing (review 5).
- **Grace.** After a **passed** challenge, that IP or IP-plus-visitor is not challenged again for **10 minutes** (KV pass mark, review 4).
- **The page customers use.** That is `/checkout`, the React `CheckoutPage`. Home is the DC mock and never POSTs `/api/quote`. The page already had widgets in the class list, the trip editor and the pay bar, with messages in en/de/fr/ar. **No new UI and no new strings.**
- **Client.**
  - A refused token keeps the same widget mounted. The next try needs a click (TRY AGAIN in the class list, UPDATE PRICES in the trip editor), so it cannot loop.
  - `CheckoutPage.tsx` differs from main by a comment only (c0f11e8c).
  - `TripEditor.tsx` is fixed (review 1).
  - The pay-bar widget never re-mounted, so it needed no change.

### B. Signed visitor cookie

- `middleware.ts` `appendVisitorCookie()` runs in the DC-page branch (home returned before the old mint) and in the Next branch (`/checkout`).
- When `VAMOS_QS_SECRET` is set and the request has no cookie that verifies, it appends `vamos_qs=<id>.<hmac>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`.
- A response that mints the cookie is `Cache-Control: private, no-store`, so no shared cache hands one visitor's cookie to another. A returning visitor keeps the public marketing cache.
- **No secret means exactly today's behaviour.** The dashboard host never mints the cookie.
- **No rotation support (review 8).** The cookie is verified with `VAMOS_QS_SECRET` only; `verifiedSubject`'s `previousSecret` is never wired. If the secret is ever changed, every visitor's cookie stops verifying at once. Their API calls fall to the bare per-IP buckets (4 quotes a minute) until the next page view mints a new cookie. Rotate at a quiet hour, or add a `VAMOS_QS_SECRET_PREVIOUS` first (not done here).

**Cookies page.** The owner approved the `vamos_qs` row ("Approve as written", question form, 2026-10-03).
- It is recorded in `.planning/decisions/2026-10-03-vamos-qs-cookie-row.md` and added verbatim (5dc6a331) to:
  - `app/pages/cookies.dc.html`: the live page, Strictly necessary table, after `cf_clearance`;
  - `app/vamos-i18n-dict.js`: de/fr/ar;
  - the React twin with message keys `cookies.qs-cookie-purpose` and `cookies.qs-cookie-duration`. The duration key is in `$meta.noParamKeys`, with the reason that it equals `Max-Age 86400`.
- The seed was regenerated, and `seed_idempotent.test.sql` is re-pinned to 2707 keys and 98 no-param keys.
- The table still does not list `vt_manage` or `NEXT_LOCALE` (noted only).

## Commits

| Commit | What |
|---|---|
| 7434be06 | A: secret name, body token, dashboard staff exemption, unit tests |
| 372b6974 | B: `vamos_qs` on DC pages and `/checkout`, private cache on mint, middleware test |
| c0f11e8c | Class list: no loading state after a token (no loop), comment only |
| 9f2b3660 | Tools and first evidence |
| 5e110fbc | First handover (the reviewed tip) |
| 5dc6a331 | Owner-approved `vamos_qs` row on /cookies, 4 languages, seed |
| 58b7ccde | Review 1: trip editor keeps the widget mounted while a token is checked |
| cb88232b | Review 2: staff check cookie sink, rotated cookies copied onto the quote answer |
| 23cabd99 | Review 4 + 5: attempt count on a rate-limit binding; 10 min grace after a pass |
| (this commit) | Review evidence and this handover |

## Review fixes (fresh review of 5e110fbc, FIX FIRST)

1. **Trip editor loop: fixed (58b7ccde).** `retryWithToken` no longer clears the refusal before posting, so the interaction-only widget stays mounted and does not mint a new token by itself.
   - **Chromium, always-fail secret** (`evidence/editor-review1/`):
     - the 3rd quote from the editor is challenged and the token is refused;
     - quote count 4 after 25 s and still 4 after 40 s, with 1 token post;
     - pressing UPDATE PRICES again makes exactly +2 quotes (no token, then one token), then nothing more.
   - In a first run the second click was simply priced, because the fixed 60 s window had rolled over. That is correct, and the assertion now allows it.
2. **Staff check cookie sink: fixed (cb88232b).** `requestHasStaffSession(request, factory, sink)` gives the Supabase client a sink. `/api/quote` copies each cookie with `copyAuthCookies` onto every answer it builds (priced, refused, error). Unit test: `lib/ops/staff-origin-cookies.test.ts`.
   - Not done: `/api/checkout/price` and `/api/checkout/intent` call the same check without a sink (from quick 261003 rate buckets, already on main). Same fix if wanted; not in this job's files.
3. **Secret before deploy.** See "Ship order": set `VAMOS_QS_SECRET` **before or in the same step as** the deploy, and the reason.
4. **Grace after a passed challenge: fixed (23cabd99).** `kvPassStore` writes `quote:turnstile-pass:<ip[:visitor]>` for 600 s after a passed siteverify.
   - It is read only at or above the threshold. A refused token leaves no mark.
   - Unit tests: `lib/abuse/turnstile-grace-and-count.test.ts`.
   - Chromium: after the pass, two more `/checkout` loads were priced with no challenge (`evidence/interactive/*-5.png`). Local KV holds the two pass marks (`evidence/interactive/local-kv-prefixes.txt`).
5. **Plan and KV quota (read-only).**
   - **Plan: not confirmed live.**
     - The `cf` CLI on this Mac is signed in to the ALMAR account only, so I did not use it on Vamos.
     - Wrangler (Vamos account, `koussayzayeni@gmail.com`) has no plan or usage command.
     - The repo (`docs/build/CLOUDFLARE-RESOURCES.md`, 2026-08-25) and project memory (2026-09-29) say **Workers Free**: 1,000 KV writes a day, account-wide.
   - **Live `QUOTE_ABUSE` now:** 3 keys, all `quote:mapbox-budget:*` (key names listed read-only, no values).
   - **KV writes per quote before this fix:** 1 for the Turnstile attempt counter on every `/api/quote`, live today already.
   - **Implemented (small):** the attempt count moved to the rate-limit binding `TURNSTILE_ATTEMPT_LIMITER`. A quote now writes nothing to KV for counting. The only new KV write is the pass mark, once per passed challenge. Local KV after the browser run shows no `quote:turnstile:` keys.
   - **Listed, not done (bigger):** other KV writes still on the booking path are `countMapboxUnit` (one `get` + `put` per Mapbox call, including every suggest keystroke) and `rememberSession` (`geo:session:*`). On Workers Free, roughly 40–50 address-typing visitors a day would use up the 1,000 writes. After that:
     - the Mapbox breaker stops counting;
     - geo sessions are not remembered, and retrieve then fails closed, which breaks pricing.
   - Options for that: move the Mapbox unit count to Analytics Engine or a Durable Object; drop `rememberSession` for visitors with a verified `vamos_qs`; or buy Workers Paid ($5/month, 1 M writes). This is the owner's decision; it needs its own job.
6. **Ship check 5** is now a real dashboard New trip with picked addresses giving a price (below).
8. **No `previousSecret` rotation:** noted under B above.

## Proof on a local Worker build

Setup:
- `scripts/test-lab/lab.sh up guards --no-dash`: own Supabase stack and slot 1. Lab amounts are stand-ins, not prices.
- `tools/worker.sh` restarts the Worker with **Cloudflare's public Turnstile test keys**:
  - site keys: `1x…AA` passes, `2x…AB` blocks, `3x…FF` is an interactive checkbox;
  - secrets: `1x…AA` passes, `2x…AA` fails.
- In the browser the real widget script runs. The quote guard's siteverify goes to the **real** Cloudflare (`tools/ts-proxy.mjs`).
- The checkout account gate (not changed here) needs `action=account`, which test secrets never return, so it stayed on the lab stand-in.

**Lab harness fault (not site code).** `scripts/test-lab/lab-browser.mjs` `open()` sends `cf-connecting-ip` on every request in the context, including Cloudflare's. Cloudflare then refuses the challenge, and no widget ever gets a token. My scripts set the header only for the local Worker host.

| Run | Config | Result | Evidence |
|---|---|---|---|
| B probe | `VAMOS_QS_SECRET` set | `/` and `/checkout` set a signed `vamos_qs`, `private, no-store`; a second visit with the cookie gets none and stays `public`. **With the cookie, quotes 1–8 pass the limiter and the 9th is 429. Without it, 1–4 pass and the 5th–8th are 429.** | `evidence/qs-probe.json` |
| A pass | 1x / 1x, cookie | 1440 + 390: priced; 3rd quote `403 turnstile_required`; token → `200` (real siteverify); Economy → traveller → PAY → one fake Stripe session equal to the PAY label. 8/8 (before review 4/5). | `evidence/pass/` |
| A interactive | 3x / 1x, cookie, **review build** | Same, with the visible checkbox, plus review 4 grace: two more loads priced with no challenge. 10/10. | `evidence/interactive/` |
| A interactive, no cookie | 3x / 1x, no `VAMOS_QS_SECRET` | 8/8 (before review 4/5). | `evidence/interactive-no-qs/` |
| A secret fails | 1x / 2x | Message + TRY AGAIN, no spinner; one challenge round per click. | `evidence/secretfail/` |
| A widget blocks | 2x | Message + TRY AGAIN, no spinner. | `evidence/block/` |
| A trip editor (review 1) | 1x / 2x, **review build** | One round per UPDATE PRICES, then quiet (see review 1). 3/3. | `evidence/editor-review1/` |
| A languages | 3x | Challenge message in de/fr/ar at 390 and en at 768; Arabic `rtl`; nothing scrolls sideways. | `evidence/langs/` |
| Dashboard | local dashboard Worker, admin signed in | Signed in: 4 quotes, none challenged. No session: the 3rd is `turnstile_required` (before review 2). | `evidence/dashboard/` |
| Cookies row | static `apps/web/public` | Row present and translated in en/de/fr/ar at 390 and 1440; `VamosLocale.coverage(#necessary)` 0; Arabic `rtl`; nothing scrolls sideways. 8/8. | `evidence/cookies-row/` |

The text inside Cloudflare's own widget follows the visitor's browser language.

## Tests

New:
- `lib/abuse/quote-turnstile-live.test.ts`
- `lib/abuse/visitor-cookie-middleware.test.ts` (runs the real middleware; two lines fail on the old one)
- `lib/abuse/turnstile-grace-and-count.test.ts` (review 4 + 5)
- `lib/ops/staff-origin-cookies.test.ts` (review 2)

Updated: `rate-counters.test.ts` (route shape, binding 1011).

Gates, run before the review fixes at 5e110fbc:
- `typecheck` passed; `lint`: 0 errors, 6 old warnings;
- `i18n:check`, `check:legal-claims`, `check:numbers`, `check:db-fences` and `db:seed:check` passed;
- apps/web vitest: 4352 passed; `test:scripts`: 20 passed.

Final gates after the review fixes: see the last section.

## Owner's step: VAMOS_QS_SECRET

Nobody types the value into chat. He runs it himself, **before the deploy or as the deploy step itself** (see Ship order).

1. In Terminal, in `/Users/koss/Developer/VamosTaxi.eu/apps/web`, run `openssl rand -base64 48 | pnpm exec wrangler secret put VAMOS_QS_SECRET --env staging`. This makes a random value and pipes it straight into the Worker `vamos` secret, so the value is never shown.

## Ship order

1. `fix/quote-rate-buckets` is already live. This branch is next: one squash on main.
2. **Set `VAMOS_QS_SECRET` first (owner step above), then deploy with `--env staging`.**
   - **Why before:** this deploy turns the challenge on. Without the secret there is no visitor cookie, so the challenge counter and the grace mark are per IP. Strangers behind one carrier, hotel or office IP then share them: the 3rd quote from that IP in a minute challenges the next stranger too, and the bare 4/60 quote limit is shared as well.
   - Setting it first is safe on the live code: it already mints `vamos_qs` on Next pages such as `/checkout` and reads the secret in the guards. Visitors just get the larger verified bucket a little earlier.
   - **`wrangler secret put` publishes a new Worker version** of the code that is live at that moment. Note it on the board with its version id.
3. Then the deploy. The challenge **starts enforcing on live**, from a visitor's 3rd `/checkout` price inside a 60 s window, with 10 minutes' grace after a pass.
   - Live `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` are the contact form's pair (names checked read-only; values not read).
   - New binding `TURNSTILE_ATTEMPT_LIMITER` (ns 1011) deploys with the Worker; no dashboard step.

## Ship check (after deploy, live)

1. On a phone: home → ZRH → Zurich Main Station → `/checkout`. Prices show.
2. Reload `/checkout` twice: on the 3rd load the check appears in the class box. Solving it (usually it passes by itself) shows prices. Reload twice more: priced, with no new check (grace).
3. Economy → traveller → PAY. Checkout is touched, so per CLAUDE.local.md rule 8: one 4242 test payment, then read `booking_payments`.
4. `curl -sI https://vamostaxi.site/ | grep -i set-cookie` shows `vamos_qs=…; HttpOnly; Secure; SameSite=Lax`.
5. **Dashboard New trip.** Signed in on dashboard.vamostaxi.site, open New trip:
   - pick a From address and a To address from the suggestions, a date and time, and travellers;
   - a class price appears (a real `/api/quote` → `/api/checkout/price`);
   - change the To address and pick again twice within a minute: each time a price appears, and no check is asked for.
6. `/cookies` shows the `vamos_qs` row in the Strictly necessary table (switch to Arabic once).

## Rollback

- Code: revert the code commits newest first, then deploy: `git revert 23cabd99 cb88232b 58b7ccde c0f11e8c 372b6974 7434be06`.
- The cookies row (5dc6a331) is owner-approved content and can stay. Revert it only if the cookie itself goes.
- Nothing in the live database changed.
- Secret: `wrangler secret delete VAMOS_QS_SECRET --env staging` turns the visitor cookie off; cookies already sent then fail to verify (bare bucket).

## Not verified

- Nothing on live or on a deployed Worker. Cloudflare rate limits are per colo and eventually consistent there, and the 60 s attempt window is fixed, not sliding.
- The Cloudflare plan was not confirmed live (see review 5).
- The dashboard runs before review 2 and 4/5; review 2 is covered by a unit test only (no forced session refresh in a browser).
- The quote guard does not check the siteverify hostname or action (unchanged), so a token from the contact form widget would also pass a quote challenge. Tokens are single-use.
- The pay-bar challenge widget was not clicked through.
- The account gate with real Turnstile keys was not exercised.
- The DB-local suites (shared 54322 stack) were not run.

## Failed

- None open.

## Cleanup

- The lab stack `vamos-lab-guards` and `~/.vamos-scratch/lab-guards` are destroyed at hand-over (`lab.sh destroy guards`). `apps/web/.open-next` and `.wrangler/lab-guards*` are removed.

## Final gates after the review fixes (2026-10-03, this worktree, before the commit adding this file)

- `typecheck` passed; `lint`: 0 errors, 6 old warnings.
- `i18n:check` (2699 keys), `check:legal-claims`, `check:numbers`, `check:db-fences`, `db:seed:check` (no drift) and `check:public-env` passed.
- apps/web vitest: 405 files and **4363 tests passed**, 16 files and 31 tests skipped.
- `test:scripts`: 20 passed.
- Not run: the DB-local suites, including `seed_idempotent.test.sql` with the new pins 2707/98 (needs the shared 54322 stack).
