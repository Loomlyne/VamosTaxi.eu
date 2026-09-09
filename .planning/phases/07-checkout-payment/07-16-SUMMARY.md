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
Worker `vamos` `92995089` (2026-09-07 20:36Z). `GET https://vamostaxi.site/api/fx` 200 live EUR/USD/AED. Charge remains CHF. Hosted SQL applied (`checkout-lock-24h` 1440, `checkout_company_paylink`). Dummy-card UAT still needs a human home quote (Turnstile) + 4242.
