---
phase: 07-checkout-payment
plan: 08
subsystem: web
tags: [stripe, checkout, i18n, playwright]

requires:
  - phase: 07-checkout-payment
    provides: POST /api/checkout/intent
provides:
  - /checkout Next page (Payment Element, no mock radios)
  - Playwright guest + chrome snapshots
affects: [apps/web]

files-created:
  - apps/web/tests/integration/checkout-guest.spec.ts
  - apps/web/tests/visual/checkout.spec.ts
files-modified:
  - apps/web/app/[locale]/checkout/page.tsx
  - apps/web/app/[locale]/checkout/CheckoutClient.tsx
  - apps/web/app/[locale]/checkout/PaymentPanel.tsx
  - apps/web/app/[locale]/checkout/checkout.css
  - apps/web/middleware.ts
  - apps/web/wrangler.jsonc
  - apps/web/i18n/messages/en.json
  - apps/web/i18n/messages/de.json
  - apps/web/i18n/messages/fr.json
  - apps/web/i18n/messages/ar.json
  - apps/web/i18n/key-map.json
key-files:
  - apps/web/app/[locale]/checkout/CheckoutClient.tsx
  - apps/web/app/[locale]/checkout/PaymentPanel.tsx
  - apps/web/middleware.ts

decisions:
  - "Removed /checkout from DC_PAGES so the Next port serves. Confirmation mock stays until 07-09."
  - "Payment Element appearance uses hex from colors.css. boxShadow is none. No yellow."
  - "confirm() only confirms the Stripe session. Booking status is the webhook. Navigate to /confirmation/{reference}."
  - "Publishable test key in wrangler vars (front/staging/ops-changes). Production still pk_test_placeholder. Secret key is wrangler secret, not vars."
  - "Playwright stubs /api/checkout/intent. Isolated TEST_DIST_DIR so guest and visual can run in parallel."
---

# Plan 07-08 Summary

`/checkout` is the Next page. Guest checkout POSTs quote_id + lock + contact + idempotency_key. No price in the body. Amounts stay `CHF 000`.

Charge line (en/de/fr/ar):

- en: You are charged in Swiss francs.
- de: Die Belastung erfolgt in Schweizer Franken.
- fr: Le débit est en francs suisses.
- ar: يتم الخصم بـ الفرنك السويسري.

## Not done here

Confirmation poll (07-09). Webhook signing secret and live test charge (07-10). `STRIPE_SECRET_KEY` is already on staging (owner terminal).
