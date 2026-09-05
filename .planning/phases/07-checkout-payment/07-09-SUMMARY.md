---
phase: 07-checkout-payment
plan: 09
subsystem: web
tags: [checkout, confirmation, i18n, playwright]

requires:
  - phase: 07-checkout-payment
    provides: /checkout Next page (Payment Element, no mock radios)
provides:
  - /confirmation/{VT-YY-####} poller + voucher
  - GET /api/checkout/status/{ref}
affects: [apps/web]

files-created:
  - apps/web/lib/checkout/booking-read.ts
  - apps/web/lib/checkout/booking-read.test.ts
  - apps/web/lib/checkout/booking-status.ts
  - apps/web/app/api/checkout/status/[ref]/route.ts
  - apps/web/app/api/checkout/invite/[ref]/route.ts
  - apps/web/app/[locale]/confirmation/[ref]/page.tsx
  - apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx
  - apps/web/app/[locale]/confirmation/[ref]/confirmation.css
  - apps/web/tests/integration/confirmation-poll.spec.ts
  - apps/web/tests/visual/confirmation.spec.ts
files-modified:
  - apps/web/lib/checkout/manage-token.ts
  - apps/web/i18n/messages/en.json
  - apps/web/i18n/messages/de.json
  - apps/web/i18n/messages/fr.json
  - apps/web/i18n/messages/ar.json
  - .gitignore
key-files:
  - apps/web/lib/checkout/booking-read.ts
  - apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx

decisions:
  - "Return URL shape is /confirmation/{VT-YY-####} (PaymentPanel + stripe.test). 07-05 SUMMARY did not pin it."
  - "asGuest is the only identity. Cookie hashed with hashManageToken. Missing/unknown cookie → { visible: false }."
  - "Poller is read-only. TWINT/3DS may never return to this tab."
  - "Amounts stay CHF 000. price_total_rappen is not rendered."
  - "Give-up is 30s. Queue max_retries=8 still settles; copy says wait for email."
  - "Local next without Hyperdrive: cookie present → processing, never 500."
---

# Plan 07-09 Summary

`/confirmation/{ref}` is the Next page. Guest cookie `vt_manage` + `asGuest` is the gate. Status poll is GET `/api/checkout/status/{ref}`. Calendar file is GET `/api/checkout/invite/{ref}` via `buildInvite`.

Vitest 8/8. Playwright poll 4/4 and visual 2/2 on `component-1440`.

## Not done here

Stripe test e2e (07-10). `STRIPE_WEBHOOK_SECRET`. No PR.
