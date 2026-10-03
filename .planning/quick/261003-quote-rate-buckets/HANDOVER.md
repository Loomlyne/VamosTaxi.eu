# HANDOVER — quick 261003 quote rate buckets

Branch `fix/quote-rate-buckets`, cut from `origin/main` e165b18f. Job session; nothing on main, nothing deployed, live database not touched.

**A fresh reviewer session, not this builder, must read this diff before the controller ships it. It changes abuse protection (rate limits) on the money path.**

## The bug

Live, 2026-10-03, iPhone: home ZRH → Zurich Main Station, then /checkout step 1 shows "Too many prices in a short time — wait a moment and try again". The customer cannot book.

## Cause (confirmed)

1. `lib/abuse/guards.ts`: `wireRateLimitGuard` (geo suggest/retrieve/reverse, flight) and `wireQuoteAbuse` (quote, reprice, checkout price) passed the **same** bindings, `QUOTE_RATE_LIMITER` 8/60 and `QUOTE_RATE_LIMITER_BARE` 4/60, with the **same** key (`ip:subject`, or just `ip`).
2. Live has **no `VAMOS_QS_SECRET`**. Checked read-only on 2026-10-03: `wrangler secret list --env staging` (names only) does not list it, and `GET /checkout` and `GET /` on vamostaxi.site send no `vamos_qs` Set-Cookie. So every live visitor is on the **4/60 per-IP** bucket.
3. Home (`app/home/home.dc.html`) calls `/api/geo/suggest` 160 ms after each keystroke. Typing two addresses spends the 4 calls before /checkout loads. /checkout then calls `/api/geo/retrieve` and `POST /api/quote` on load, and the quote gets 429 `rate_limited`.
4. Even with the secret set, home would stay on the bare bucket: middleware serves DC pages (home) and returns before the `vamos_qs` mint (`middleware.ts`, DC branch ~line 680 vs mint ~line 765).

/checkout fires on load: 1 geo retrieve, 1 `POST /api/quote`, then `POST /api/checkout/price` per class, extra or voucher change. The price route spends the limiter only for a voucher that is not yet in the lock. React strict-mode double effects are not a factor in production: both mount effects are guarded by `started` refs.

## Fix

| Counter | Routes | Verified (`ip:subject`) | Bare (`ip`) | Namespaces |
|---|---|---|---|---|
| quote (unchanged) | `POST /api/quote` | `QUOTE_RATE_LIMITER` 8/60 | `QUOTE_RATE_LIMITER_BARE` 4/60 | 1001 / 1002 |
| price (new) | `POST /api/quote/reprice`, voucher check in `POST /api/checkout/price` | `PRICE_RATE_LIMITER` 12/60 | `PRICE_RATE_LIMITER_BARE` 8/60 | 1007 / 1008 |
| lookup (new) | `/api/geo/suggest`, `/retrieve`, `/reverse`, `/api/flight/[no]` | `LOOKUP_RATE_LIMITER` 60/60 | `LOOKUP_RATE_LIMITER_BARE` 40/60 | 1005 / 1006 |

Why these numbers (also in the `RateCounter` comment in `guards.ts` and in `wrangler.jsonc`):
- **Quote.** The numbers stay as they were: each call can bill Mapbox Directions. Namespaces 1001/1002 also hold the prefixed write keys (contact, review, consent, account, auth e-mail code), so raising them would loosen those limits too. One booking spends 1–2 quotes.
- **Price.** No Directions call. The limit guards against voucher guessing; the bare limit is 8, up from the shared 4. One booking spends 1–4 (voucher, flight edit).
- **Lookup.** "ZRH" plus "Zurich Main Station" is about 25 suggest calls, plus 2 retrieves, 1 reverse, a few flight lookups and the checkout retrieve: about 30–35 in a minute. Mapbox spend stays capped by the daily breaker (pipeline step 4), not by this counter.

The new bindings are in **both** `ratelimits` blocks (`env.staging` = Worker `vamos`, and `env.production`). A missing binding fails open, the same as the quote pair today (`passLimiter`).

On the client, `/checkout` now asks for the price once more by itself, 61 s after a `rate_limited` refusal (`CheckoutPage.tsx`). It skips this if the customer already pressed TRY AGAIN or changed the trip, and it never repeats. No new strings.

## Files changed

- `apps/web/lib/abuse/guards.ts`: `RateCounter`, `counterBindings`; `wireQuoteAbuse(env, request, counter = "quote")`; `wireRateLimitGuard` now uses the lookup counter
- `apps/web/lib/abuse/rate-limit.ts`: comment on `RateLimitBindings` slots only
- `apps/web/app/api/quote/reprice/route.ts`, `apps/web/app/api/checkout/price/route.ts`: pass `"price"`
- `apps/web/lib/env.d.ts`: four optional bindings
- `apps/web/wrangler.jsonc`: four new ratelimits in each env block
- `apps/web/app/[locale]/checkout/CheckoutPage.tsx`: one automatic retry
- `apps/web/lib/abuse/rate-counters.test.ts`: new
- `.planning/debug/quote-rate-buckets.md`, this file, `tools/probe.mjs`

## Tests run (2026-10-03, this worktree)

- `vitest run lib/abuse/ lib/checkout/intent-limits.test.ts`: 9 files, 77 tests passed
- `vitest run lib/abuse/rate-counters.test.ts lib/checkout/`: 101 files passed, 3 skipped; 1206 tests passed, 7 skipped
- `vitest run` on callback-redirect, lock-secret, dashboard-new-trip-origin, public-chf and `lib/quote/`: 14 files, 266 tests passed
- `tsc --noEmit` (apps/web): clean
- `eslint` on `lib/abuse`, the touched API routes and `CheckoutPage.tsx`: clean
- **Local Worker** (`opennextjs-cloudflare build`, `mkcfg.mjs … phase2`, `wrangler dev --local` on 127.0.0.1:4861, no database, no `VAMOS_QS_SECRET` so all calls are bare like live). Script: `tools/probe.mjs`.
  - 10 + 25 `GET /api/geo/suggest` from one IP all answered 200. Then `POST /api/quote` ×6 answered 403 `retrieve_without_suggest` ×4 and 429 `rate_limited` ×2. The first 4 passed the rate-limit step (the refusal comes at resolve_coordinates, by design of the probe body); the 5th was refused by the unchanged 4/60.
  - In the next window: 41 suggest calls gave 40 × 200 then 429, and quotes again gave 4 through, then 429.
  - The Worker and its build output were removed afterwards.

## Not verified

- No run on live or on a deployed Worker. Cloudflare applies rate limits per colo and they are eventually consistent; only the local miniflare simulator was used.
- No "before" run on the local Worker with the old code. The unit tests and the code path show the old sharing.
- No full browser click home → /checkout on the local Worker with a Mapbox stand-in.
- The automatic retry is covered by a source-shape test only. The repo has no DOM test harness, and the retry was not seen firing in a browser.
- Not covered: carrier NAT, where one IPv4 is shared by strangers. They can still use up the 4/60 `/api/quote` bare bucket together.
- The full `test:unit` suite was not run (shared Mac). Only the touched suites listed above were run.

## For the controller / owner (not done here, needs his word)

- **`VAMOS_QS_SECRET` is not set on Worker `vamos`.** The per-visitor bucket and the signed cookie are therefore off on live. Setting it is a secret: one numbered step in his own terminal. It is not needed for this fix. Even with it set, home (a DC page) never mints the cookie (cause point 4), so lookups from home stay bare.
- The quote route reads `TURNSTILE_SECRET`, but live only has `TURNSTILE_SECRET_KEY` (the contact form's). The quote Turnstile step is therefore not enforced on live. This is outside this job; noted only.

## Rollback

Revert the two code commits (`git revert 1e26666a 8070308b`) and deploy. Old Workers ignore the extra namespaces; nothing in the database changed.

## Ship check

After the deploy, on vamostaxi.site from one phone:
1. Type both addresses on home.
2. Continue to /checkout.
3. Step 1 shows class prices, not the rate-limit message.

Per CLAUDE.local.md rule 8, checkout is touched, so run one 4242 test payment and read `booking_payments`.
