---
phase: 07-checkout-payment
plan: 15
subsystem: ui
tags: [confirmation, deploy]

requires:
  - phase: 07-checkout-payment
    provides: checkout URLs + pay-link
provides:
  - D-40 Next /confirmation
  - D-28 Worker vamos 8076eebc on vamostaxi.site
---

# 07-15 Summary

Unmocked confirmation. `/confirmation` is no longer a DC page. Bare `/confirmation` is hidden (no fake VT-). `/confirmation/{ref}` SSR-reads the booking; browser return does not confirm.

## Deploy

Owner said continue. `wrangler whoami` = koussayzayeni@gmail.com / e64b47deef83692806ab23279d53633e.

Worker **vamos** version `8076eebc-8934-4b07-84b5-6e30594a3656` at 100% (2026-09-07T14:01Z). Not vamos-web-staging. Not main. Hosted 24h + pay-link SQL still gated.

## Live fingerprint

- https://vamostaxi.site/checkout — Next (`x-opennext`, `/_next/`), no PayPal, no saveTrip, `guestNoPassword` in payload
- https://vamostaxi.site/checkout/trip — `data-checkout-step`
- https://vamostaxi.site/confirmation — Next, `data-confirmation`, notVisible, no VT-5xxx, no `<base href="/app/pages/">`
- Home Continue land `/checkout/trip` + `/api/quote`
- GET `/api/checkout/pay-link` 405 (route exists)
- dashboard OpsSidebar `#support` = 1, `#staff` = 0
- db-smoke `{"ok":true}`

Dummy-card E2E / `/gsd:verify-work 7` is UAT — not this plan.
