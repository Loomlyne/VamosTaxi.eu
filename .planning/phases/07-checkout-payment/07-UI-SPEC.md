---
phase: 07
slug: checkout-payment
status: remainder
shadcn_initialized: false
preset: none
created: 2026-09-07
---

# Phase 7 remainder — UI Design Contract

> Not a redesign. `.dc.html` mocks + Vamos tokens are the spec. Remainder splits checkout into three URLs and adds Individual/Company + pay-link on payment.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | none (Vamos design system) |
| Preset | not applicable |
| Component library | bound kit (`Button`, `Card`, `Input`, `Tabs`, `StepIndicator`, `RouteSummary`, `PriceSummary`, `Alert`, `Radio`) |
| Icon library | Lucide via `Icon` |
| Font | Qurova display + Poppins UI |

No glow. No `--vt-shadow-accent`. No tinted yellow (`--vt-yellow-50`…`-300`, `-600`/`-700`). Amounts `CHF 000` until a live lock paints. Four languages same pass. Logical properties. 1440 / 1024 / 768 / 390.

---

## Screens

| URL | What they see |
|-----|----------------|
| `/checkout/trip` | Trip they typed on home (places, date/time, class cars). Editable. Not home. Step 1. |
| `/checkout/details` | Who is travelling. Guest (no password) or sign-in. Flight/extras as the mock. Step 2. Clicking Trip → `/checkout/trip`. |
| `/checkout/payment` | Individual **or** Company. Company: name, address, VAT. Card Stripe Element and/or send pay-link. Sticky price rail. 24h remaining. Live-price-changed notice if the book moved. Step 3. |
| Pay-link open | Vamos chrome: trip summary + Stripe Element. Not Stripe-hosted. |
| `/confirmation/{ref}` | Real `VT-`, route, time, vehicle, paid/unpaid status. Never `confirmation.dc.html`. |
| Account | **Finish payment** for signed-in unpaid checkout only. |

Deep-link to a later step without earlier data → bounce to the first incomplete step.

---

## Copy (en source; de/fr/ar same pass)

| Element | Copy |
|---------|------|
| Primary card CTA | PAY AND CONFIRM (self-pay) |
| Pay-link CTA | SEND PAYMENT LINK |
| Payer type | Individual / Company |
| 24h | This price is held for 24 hours. After that you start again. |
| Price changed | The live price changed. You still pay this locked price until the 24 hours end. |
| Pay-link mailed | We emailed the payment link. Whoever pays first confirms this booking. The link dies after 24 hours. |
| Unpaid VT- | Sent by link, not paid yet |
| Paid VT- | Confirmed, paid |
| Guest | Continue without a password. Add a password later with this email to see your trips. |

Do not invent CHF in source strings.

---

## Accent

Yellow `#FDC20B` only on primary buttons, badges, kickers. Charcoal `#1E1F1F` / grey `#DEDEDE` otherwise.
