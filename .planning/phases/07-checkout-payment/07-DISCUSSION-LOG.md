# Phase 7: Checkout & Payment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-07
**Phase:** 07-checkout-payment (remainder)
**Areas discussed:** 24h lock, three checkout URLs, account Finish payment, company / pay-link, guest without password

---

## 15 min expiry while still on payment (unpaid)

| Option | Description | Selected |
|--------|-------------|----------|
| Re-lock at live price, stay on payment, new 15 min, banner | | |
| Block pay and send them back to /checkout/trip | | ✓ (then superseded) |
| You decide | | |

**User's choice:** First picked bounce to `/checkout/trip`. Then removed 15 minutes entirely and set **one 24-hour rule** for card and pay-link.
**Notes:** Reduce rules. After 24h unpaid they start from home; pay-link is dead.

---

## Signed-in customer leaves for days

| Option | Description | Selected |
|--------|-------------|----------|
| This remainder: account Finish payment; trip kept; live price if lock dead | | ✓ |
| Phase 8 later: same-browser only | | |
| You decide | | |

**User's choice:** Finish payment in this remainder.

---

## Pay-link price lock

| Option | Description | Selected |
|--------|-------------|----------|
| Same 15 min as card | | |
| Longer window | | |
| No lock: live price when they open | | ✓ (then superseded) |

**User's choice:** First: no lock on the link. Then unified: **same locked price for 24h** for card and pay-link.

---

## When they see VT-

**User's choice:** Card: VT- only after pay. Pay-link: VT- logged when the link is sent; status unpaid vs paid. They can look up the reference.

---

## How the booker sends the pay-link

| Option | Description | Selected |
|--------|-------------|----------|
| Email field — we send | | |
| Copy / WhatsApp themselves | | |
| Both: email first + copy / wa.me | | ✓ |

**User's choice:** Email is required first so we can confirm it was sent. Then they may copy / WhatsApp.

---

## Payer email

| Option | Description | Selected |
|--------|-------------|----------|
| Extra field, prefilled from passenger | | ✓ |
| Always the details email | | |

---

## Unpaid pay-link dies

| Option | Description | Selected |
|--------|-------------|----------|
| Until pickup | | |
| 7 days | | |
| 24 hours | | ✓ |

**Notes:** Email must say the link dies after 24 hours.

---

## Card after pay-link sent

**User's choice:** Whoever pays first (after an A/B/C explain).

---

## Confirmation mail recipients

| Option | Description | Selected |
|--------|-------------|----------|
| Passenger + payer if different | | ✓ |
| Passenger only | | |
| + copy to info@ | | |

---

## What the payer opens

| Option | Description | Selected |
|--------|-------------|----------|
| Vamos page: trip + Stripe Element | | ✓ |
| Stripe-hosted | | |

---

## Resend pay-link

| Option | Description | Selected |
|--------|-------------|----------|
| Same VT-; 24h does not restart | | ✓ |
| Restart 24h | | |
| One email only | | |

---

## Company billing

| Option | Description | Selected |
|--------|-------------|----------|
| Payer email only | | |
| Company name optional | | |
| Full company billing (name, address, VAT) | | ✓ |

**Notes:** Payment is Individual (own details, card) or Company (company details, then card **or** pay-link). Not an invoice.

---

## Guest unpaid lookup

**User's choice:** Guest fills details like sign-up without a password. Saved, not an account. Later signup with same email + password claims bookings. Company pay-link emailed to passenger and company so both can pay.

---

## Claude's Discretion

- Deep-link to a later step without earlier data → bounce to first incomplete step
- VAT on voucher, not a Swiss e-invoice
- 24h clock starts at Continue lock (one clock)
- Four-language notice copy

## Deferred Ideas

- Ops board / dispatch / `#support` — Phase 8 / 12
- Full `/bookings` history — Phase 8 (Finish payment is in remainder)
- Invoice-on-account without Stripe — out
- Live Stripe keys / `vamostaxi.eu` — Phase 11
