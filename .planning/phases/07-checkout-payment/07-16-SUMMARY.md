# 07-16 Summary — Display FX, charge CHF

Tasks 1–2 done. Task 3 authorized 2026-09-07 (owner: hosted, deployed, nothing waiting).

## Built
- `GET /api/fx` + integer half-up CHF rappen → EUR/USD/AED.
- Home class cards and checkout rail convert on header currency switch.
- Empty quote stays `000` (mark only).
- Checkout shows converted total + `1 CHF = x` + as_of when FX is up.
- FX down → keep CHF, honest copy. Never invent a rate.
- Stripe session `price_data.currency = chf`. Adaptive Pricing on. No presentment pin.
- `display_currency` on intent is presentational. Refunds/tax/books stay CHF.

## Verify
`pnpm test lib/fx/convert.test.ts lib/fx/fetchRates.test.ts lib/checkout/currency.test.ts lib/checkout/stripe.test.ts` — 19 passed.

## Task 3
`GET https://vamostaxi.site/api/fx` is 200 with live EUR/USD/AED (no invented rate). Charge remains CHF. Staging deploy of this sitting still required so checkout chrome + comment pack share one Worker version.
