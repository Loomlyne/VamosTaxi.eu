---
phase: 07-checkout-payment
plan: 13
subsystem: checkout
tags: [pay-link, company, stripe]

requires:
  - phase: 07-checkout-payment
    provides: checkout intent + webhook settle
provides:
  - D-34…D-38 company + pay-link + whoever-first
affects:
  - 07-15 deploy/UAT
  - 07-14 guest/finish-payment

key-files:
  created:
    - packages/db/supabase/migrations/20260907000002_checkout_company_paylink.sql
    - packages/db/supabase/tests/checkout_paylink.test.sql
    - packages/emails/src/PayLinkEmail.tsx
    - apps/web/lib/checkout/pay-link.ts
    - apps/web/app/api/checkout/pay-link/route.ts
    - apps/web/app/api/checkout/pay-link/open/route.ts
    - apps/web/app/[locale]/checkout/pay/[token]/page.tsx
  modified:
    - apps/web/lib/checkout/intent.ts
    - apps/web/app/[locale]/checkout/CheckoutClient.tsx
    - apps/web/lib/checkout/notify.ts

key-decisions:
  - "Whoever pays first: attachPayment on unique quote. One success payment."
  - "pay_link_sent_at coalesce — resend does not restart 24h."
  - "Hosted SQL not applied. Charge gate source untouched."

patterns-established:
  - "Pay token purpose=pay, hashed at rest, locale path /checkout/pay/{token}."

requirements-completed: [D-34, D-35, D-36, D-37, D-38]

duration: 90min
completed: 2026-09-07
---

# Plan 07-13 Summary

Company billing + pay-link + whoever-first on `phase-7`.

## What shipped
- Additive booking columns and RPCs (set pay-link, attach payment, lookup by hash).
- Email pay-link to passenger + payer. Copy + WhatsApp after send.
- Card box stays. First successful webhook wins.
- Confirmation also mails payer when different.

## Verification
- `pnpm i18n:check` passed (2362 keys).
- vitest: pay-link, steps, intent, create-booking — 32 passed.
- emails package: 53 passed.
- Hosted SQL **not** applied. Docker down — pgTAP file only.

## Self-Check: PASSED (with follow-up)
- [x] Charge gate not relaxed
- [x] No invent CHF
- [x] No deploy
- [ ] Hosted migration apply — owner-gated
---
