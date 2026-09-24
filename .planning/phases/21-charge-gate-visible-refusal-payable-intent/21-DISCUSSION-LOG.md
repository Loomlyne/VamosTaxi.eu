# Phase 21: Charge gate + visible refusal + payable intent - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-22
**Phase:** 21-charge-gate-visible-refusal-payable-intent
**Areas discussed:** When the refusal appears, Blocked Pay screen, Requote, Token page vs checkout Pay

---

## Gray-area picker

| Option | Description | Selected |
|--------|-------------|----------|
| Let's talk about all of them | All four areas | ✓ |
| When the refusal appears | | |
| What the blocked Pay screen looks like | | |
| I trust you — skip discussion | | |

**User's choice:** Let's talk about all of them

---

## When the refusal appears

| Option | Description | Selected |
|--------|-------------|----------|
| The moment they land on Pay — no Stripe, no card fill | Backstop on Pay | ✓ |
| After they tap Pay or Email a pay link | Recreates the live bug | |
| Banner on land, and refuse the click too | | |

**User's choice:** The moment they land on Pay — no Stripe, no card fill
**Notes:** Follow-up: Select must already be off so they never reach Pay if unpriced. “it should be never unpriced” = Select off, not invent fares.

| Option | Description | Selected |
|--------|-------------|----------|
| Select is already off — they never reach Pay | | ✓ (free-text confirm) |
| They can go through details; Pay is where it stops | | |
| Home/trip shows CHF 000 but Select still works until Pay | | |

**User's choice:** confirm Select is already off and they never reach Pay if unpriced; should be never unpriced

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse as soon as the clock hits zero — no refresh needed | | ✓ |
| Refuse on the next navigation or tap | | |
| Only refuse if they reload the page | | |

**User's choice:** Refuse as soon as the clock hits zero — no refresh needed

| Option | Description | Selected |
|--------|-------------|----------|
| Show it as CHF 000, Select off — they never reach Pay | | ✓ |
| Hide it until the class is priced | | |
| Show it, Select off, and Pay still refuses if they deep-link | | |

**User's choice:** Show it as CHF 000, Select off — they never reach Pay

| Option | Description | Selected |
|--------|-------------|----------|
| Silent — Select off, CHF 000, no extra copy | | ✓ |
| Show why — pricing not live, same four languages | | |
| Show why only if they tap the disabled Select | | |

**User's choice:** Silent — Select off, CHF 000, no extra copy

| Option | Description | Selected |
|--------|-------------|----------|
| Still show the cards, every Select off | | ✓ |
| Block the quote — they never leave home | | |
| Show the cards and a single page-level refusal | | |

**User's choice:** Still show the cards, every Select off

---

## Blocked Pay screen

| Option | Description | Selected |
|--------|-------------|----------|
| Alert + Requote only — no card fields | | |
| Keep the DC card layout, disabled, no Stripe | | |
| DC pay screen with an Alert on top, fields still visible | | |

**User's choice:** Alert + Requote only — with card fields don’t remove it but hide it or make not usable
**Notes:** Then locked visible-but-dead, cannot type.

| Option | Description | Selected |
|--------|-------------|----------|
| Visible but dead — they can see the form, cannot type | | ✓ |
| Hidden — layout keeps the slot, they don't see the form | | |
| Visible but dead, and Pay / Email a pay link disabled | | |

**User's choice:** Visible but dead — they can see the form, cannot type

| Option | Description | Selected |
|--------|-------------|----------|
| DC dummy inputs — look like the mock, not Stripe | | |
| Empty slots — labels stay, no inputs | | |
| Keep Stripe mounted but disabled | | ✓ then narrowed |

**User's choice:** Keep Stripe mounted but disabled — **then** land-already-expired: Don’t mount — dummy DC fields, Alert + Requote. Do not create a session just to show Stripe.

---

## Requote

| Option | Description | Selected |
|--------|-------------|----------|
| Home — wipe, new quote | | ✓ |
| Stay on checkout trip — pick another class | | |
| Home for checkout; token payer has no Requote | | |

**User's choice:** Home — wipe, new quote

| Option | Description | Selected |
|--------|-------------|----------|
| No Requote on the token page — expired copy only | | ✓ |
| Requote still goes Home | | |
| Requote tells them to contact the traveller | | |

**User's choice:** No Requote on the token page — expired copy only

| Option | Description | Selected |
|--------|-------------|----------|
| The moment they tap Requote | Unpaid dies immediately | ✓ |
| When Home loads and wipes | | |
| Only after they start a new quote on Home | | |

**User's choice:** The moment they tap Requote

---

## Token page vs checkout Pay

| Option | Description | Selected |
|--------|-------------|----------|
| Keep the trip recap, Alert, dummy dead fields | | ✓ |
| Alert only — hide recap and fields | | |
| Keep recap, hide fields, Alert | | |

**User's choice:** Keep the trip recap, Alert, dummy dead fields

| Option | Description | Selected |
|--------|-------------|----------|
| Nobody — lock is dead, quote again from Home | | ✓ |
| Traveller can still pay in checkout until the lock dies | | |
| Traveller pays in checkout; token is dead but checkout is not | | |

**User's choice:** Nobody — lock is dead, quote again from Home
**Notes:** Token TTL = quote lock 24h (already locked in milestone). They die together.

---

## Claude's Discretion

- Alert tone (not accent / tinted yellow)
- Dummy DC markup matching PaymentPanel
- Expiry timer internals (must fire at zero without reload)
- Confirm whether live Select is already off; make it true
- mahaha session reuse (ROADMAP SC 3)
- i18n key reuse vs new Alert strings (four langs same sitting)

## Deferred Ideas

- Phase 22 card + webhook wait
- Phase 23 wallets
- Phase 24 dual-payer / pay-link VAT / mail split
- Phase 25 /bookings unpaid + secret-swap runbook
- Owner Publish four-class sheet
