# HANDOVER — quick 261003 quote rate buckets

Branch `fix/quote-rate-buckets`, cut from `origin/main` e165b18f. Job session; nothing on main, nothing deployed, live database not touched.

**Review.** A fresh reviewer read 59815ea6 and said SHIP, with follow-ups. Follow-ups 1–5 are done on this branch (commits b2e6a85a, 8aa00cf4, 84392168, 67a7973c and this handover). The controller should glance at the follow-up commits; they change limiter numbers and keys.

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
| lookup (new) | `/api/geo/suggest`, `/retrieve`, `/reverse` | `LOOKUP_RATE_LIMITER` 60/60 | `LOOKUP_RATE_LIMITER_BARE` **30/60** | 1005 / 1006 |
| flight (new) | `/api/flight/[no]` | `FLIGHT_RATE_LIMITER` 10/60 | `FLIGHT_RATE_LIMITER_BARE` 6/60 | 1009 / 1010 |

**Limiter keys.** Every key is built with `limiterIp()` (`lib/abuse/rate-limit.ts`, used in `bucketFor`):
- IPv4 stays as it is.
- IPv6 is cut to its **/64**, because one subscriber usually holds a whole /64 and could rotate through it.
- The geo session bucket and the Turnstile attempt counter still use the full address.
- The write limiters (contact, review, consent, account, auth code) still key the full address. They are out of scope here.

Why these numbers (also in the `RateCounter` comment in `guards.ts` and in `wrangler.jsonc`):
- **Quote.** The numbers stay as they were: each call can bill Mapbox Directions. Namespaces 1001/1002 also hold the prefixed write keys, so raising them would loosen those limits too. One booking spends 1–2 quotes, or 2 more on the place_unresolved path (see below).
- **Price.** No Directions call. The limit guards against voucher guessing; the bare limit is 8, up from the shared 4. One booking spends 1–4 (voucher, flight edit).
- **Lookup.** Home asks suggest only once 2 characters are typed. "ZRH" plus "Zurich Main Station" is about 20 suggest calls; with 2 retrieves and the checkout retrieve, that is about 20–25 in a minute, which fits 30.
- **Mapbox breaker.** Plainly: "capped by the breaker" means **the whole site stops pricing for the rest of the day**. The daily Mapbox breaker (`MAPBOX_DAILY_UNIT_SENTINEL` 5000, pipeline step 4) is site-wide. When it trips, every quote on vamostaxi.site answers `temporarily_unavailable` until **midnight UTC**. One IPv4 address or IPv6 /64 sending lookups non-stop at the bare 30/min reaches 5000 in about 170 minutes. The lookup counter only slows that down; it does not stop it. A real cap per client per day would need a separate change (not in this job).
- **Flight.** AeroDataBox bills every call and a `not_found` answer is never cached, so flight gets its own small counter. Home and checkout ask 900 ms after typing stops, so one flight number costs 1–3 calls.

The new bindings are in **both** `ratelimits` blocks (`env.staging` = Worker `vamos`, and `env.production`). A missing binding fails open, the same as the quote pair today (`passLimiter`).

**Automatic retry on /checkout.** After a `rate_limited` refusal, `/checkout` asks for the price once more by itself, 61 s later. The decision lives in `lib/checkout/rate-limit-retry.ts`; `CheckoutPage.tsx` wires it.
- Pressing **TRY AGAIN cancels the automatic retry for good**: after that the customer is in control, and a second refusal waits for them.
- A trip edit (a newer quote) skips a pending retry.
- A priced result cancels it, and leaving the page clears the timer.
- It never repeats. No new strings.

**place_unresolved path (review item 5).** When a shared or old link carries a stale Search Box session, the first `POST /api/quote` is refused with `place_unresolved` after the limiter step. The page then looks both addresses up again (2 lookup tokens) and posts a second quote. That costs **two quote tokens for one price**.

Not counting the second POST is not safe. The server cannot tell a genuine re-ask from a forged one, and an uncounted "retry" flag would give anyone a free Directions call. So it stays counted, with a comment in `lib/checkout/checkout-quote.ts`. A fresh home → /checkout hand-off normally does not take this path.

## Files changed

- `apps/web/lib/abuse/guards.ts`: `RateCounter` (quote, price, lookup, flight), `counterBindings`; `wireQuoteAbuse(env, request, counter = "quote")`; `wireRateLimitGuard(env, request, counter = "lookup")`
- `apps/web/lib/abuse/rate-limit.ts`: `limiterIp()` (IPv6 /64) used by `bucketFor`; comment on `RateLimitBindings` slots
- `apps/web/app/api/quote/reprice/route.ts`, `apps/web/app/api/checkout/price/route.ts`: pass `"price"`
- `apps/web/app/api/flight/[no]/route.ts`: pass `"flight"`
- `apps/web/lib/env.d.ts`: six optional bindings
- `apps/web/wrangler.jsonc`: six new ratelimits in each env block (1005–1010)
- `apps/web/lib/checkout/rate-limit-retry.ts` + `.test.ts`: the retry helper and its fake-timer tests
- `apps/web/app/[locale]/checkout/CheckoutPage.tsx`: wires the helper (load, TRY AGAIN, auto retry)
- `apps/web/lib/checkout/checkout-quote.ts`: comment only
- `apps/web/lib/abuse/rate-counters.test.ts`: new
- `.planning/debug/quote-rate-buckets.md`, this file, `tools/probe.mjs`

## Tests run (2026-10-03, this worktree)

After the review follow-ups (17:3x +04):
- `vitest run lib/checkout/ lib/abuse/`: 109 files passed, 3 skipped; 1275 tests passed, 7 skipped. This includes `rate-counters.test.ts`:
  - bare 30 lookups;
  - flight's own 6, then refused while geo and quote still pass;
  - IPv6 /64 sharing and separation;
  - both wrangler blocks 1001–1010.
- `rate-limit-retry.test.ts` (fake timers):
  - one retry only, after 61 s;
  - never a second automatic retry;
  - TRY AGAIN cancels it;
  - unmount clears the timer;
  - a trip change skips it;
  - stale or priced results do not arm it;
  - other errors never arm it.
- `vitest run lib/auth/callback-redirect.test.ts`: 22 passed. `lib/checkout/checkout-quote` tests: 13 passed.
- `tsc --noEmit` (apps/web): clean.
- `eslint` on `lib/abuse`, `lib/checkout/rate-limit-retry*`, `lib/checkout/checkout-quote.ts`, `CheckoutPage.tsx`, `app/api/flight`: clean.

Before the review (59815ea6):
- Quote suites (`lib/quote/`, lock-secret, dashboard-new-trip-origin, public-chf): 266 passed.
- **Local Worker** (`opennextjs-cloudflare build`, `mkcfg.mjs … phase2`, `wrangler dev --local` on 127.0.0.1:4861, no database, no `VAMOS_QS_SECRET`, so all calls were bare like live). Script: `tools/probe.mjs`.
  - 35 suggest calls from one IP, then `POST /api/quote` ×6: 4 passed the limiter, the 5th and 6th got 429.
  - With the old bare lookup limit of 40, the 41st lookup got 429.
  - The Worker and its build output were removed afterwards.

## Not verified

- The review follow-ups were **not re-run on a local Worker**: bare 30, the flight counter and the IPv6 /64 keys are covered by unit tests only. Locally, wrangler sets the client address, so /64 keying cannot be shown there.
- No run on live or on a deployed Worker. Cloudflare applies rate limits per colo and they are eventually consistent.
- No "before" run of the old code on the local Worker. No full browser click home → /checkout with a Mapbox stand-in.
- The automatic retry is tested as a helper with fake timers. Its wiring into `CheckoutPage.tsx` is covered by typecheck and lint only; the retry was not seen firing in a browser. The repo has no DOM test harness.
- Carrier NAT, where one IPv4 is shared by strangers, can still use up the 4/60 `/api/quote` bare bucket together.
- The full `test:unit` suite was not run (shared Mac). Only the touched suites listed above were run.

## For the controller / owner (not done here, needs his word)

- **`VAMOS_QS_SECRET` is not set on Worker `vamos`.** The per-visitor bucket and the signed cookie are therefore off on live. Setting it is a secret: one numbered step in his own terminal. It is not needed for this fix. Even with it set, home (a DC page) never mints the cookie (cause point 4), so lookups from home stay bare.
- The quote route reads `TURNSTILE_SECRET`, but live only has `TURNSTILE_SECRET_KEY` (the contact form's). The quote Turnstile step is therefore not enforced on live. This is outside this job; noted only.
- **Mapbox breaker.** One client can still close pricing for the day in about 170 min (see Fix). A per-client daily cap is a separate decision.

## Rollback

Revert the code commits, newest first, and deploy:

`git revert 67a7973c 84392168 8aa00cf4 b2e6a85a 1e26666a 8070308b`

Old Workers ignore the extra namespaces; nothing in the database changed.

## Ship check

After the deploy, on vamostaxi.site from one phone:
1. Type both addresses on home.
2. Continue to /checkout.
3. Step 1 shows class prices, not the rate-limit message.

Per CLAUDE.local.md rule 8, checkout is touched, so run one 4242 test payment and read `booking_payments`.
