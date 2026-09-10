# Phase 8: Ops Dispatch — Live Board, Assignment & Account Surfaces - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-10
**Phase:** 8-Ops Dispatch — Live Board, Assignment & Account Surfaces
**Areas discussed:** Phone booking pay, Dashboard tiles, Board refresh, Assign, Ops refund, Phone booking screen, #customers, Edit after pay, URLs

---

## Phone booking pay

| Option | Description | Selected |
|--------|-------------|----------|
| Stripe like the site | Quote, then card or email pay-link; webhook confirms | ✓ |
| Also mark paid outside Stripe | Staff fake-confirm with snapshot + payment row | |
| Pay-link only | No card in ops | |

**User's choice:** Stripe like the site. Both: customer pay-link **and** take card in ops. Unpaid shows on the board. Send pay-link on click, not auto-save. Guest-style contact. Failed card stays unpaid. Same extras. Dispatcher picks mail language. Mapbox + same quote engine. Same company billing. Same optional flight. Resend pay-link = same Stripe session.

**Notes:** No mark-paid-outside-Stripe. Cash still out.

---

## Phone booking screen

| Option | Description | Selected |
|--------|-------------|----------|
| New trip on bookings | Same quote fields, then pay-link or card | ✓ |
| New trip on dashboard | | |
| From a customer row | | |

**User's choice:** New trip on bookings list. Land on that trip’s detail. Same card fields as public payment. Quote first, then Save.

---

## Dashboard tiles

| Option | Description | Selected |
|--------|-------------|----------|
| All tiles live | Nothing mock | ✓ |
| Operation counts only / TBC money | | |

**User's choice:** Always live data. Captured fares only for Income/average. Header Today/7d/30d: money by captured date, operations by pickup date. Needs attention = unassigned paid + unpaid. Income gross; Refund and Stripe fee are money-out; Net subtracts. Fleet from Phase 6 tables. Empty = CHF 000/0. Money-in by class. Tile click → filtered list. Always CHF. No fake expense labels.

**Notes:** Cost sheet requested (“make it exist”) — deferred to its own phase. Stripe fee: do not also subtract from Income (double-count).

---

## Board refresh

| Option | Description | Selected |
|--------|-------------|----------|
| Update in place, no full reload | Silent | ✓ |
| Stay until refresh | | |
| Update when tab focused | | |

**User's choice:** In-place everywhere ops is open, both laptops, detail included. Also signed-in customer `/bookings` + trip detail. No marketing sockets. No live GPS.

---

## Assign

| Option | Description | Selected |
|--------|-------------|----------|
| Chauffeur only, vehicle follows | DB refuses overlap | ✓ |
| Pick chauffeur + vehicle | | |
| Type a name | | |

**User's choice:** Chauffeur-only. Paid only. Unassign yes. Picker = capacity fit. Name the conflicting trip. One-step reassign. Frozen after completed/cancelled/refunded. Customer sees fleet name+vehicle. Email chauffeur on assign/unassign in chauffeur’s language. No email = cannot assign. Fleet Save must persist. Chauffeur page from fleet or assigned trip (read-only trips). Vehicle off-road → must-fix + ops email, not auto-cancel.

---

## Ops refund / cancel

| Option | Description | Selected |
|--------|-------------|----------|
| Full Stripe refund on Ops Refund | | ✓ |
| TBC policy math | | |
| Cancel paid auto-refunds | | |

**User's choice:** Refund and Cancel are two actions. Ops Refund = full Stripe; fail = stay paid. Unpaid cancel = drop. Refund mail to contact + company payer. Customer cancel: >24h auto full refund; inside 24h email ops, ops clicks Refund.

---

## Customers

| Option | Description | Selected |
|--------|-------------|----------|
| Every booking email | Guest or account | ✓ |
| Signed-up only | | |
| Paid only | | |

**User's choice:** Every booking email. Click → trips + contact. Empty list if none. One row per email (latest name). Edit contact writes through to trips.

---

## Edit after pay

| Option | Description | Selected |
|--------|-------------|----------|
| Anything + reprice | Difference pay-link or difference refund | ✓ |
| Contact/notes only | | |
| Never reprice | | |

**User's choice:** Ops can change anything on paid trips. Higher → extra for the difference, trip unchanged until captured. Lower → refund difference (>24h auto, else ops Refund). Unpaid ops = cancel + new trip. Customer unpaid = edit immediately + finish payment + cancel. Customer paid = **request**, ops must accept. Second extra edits merge to one extra payment. Same-price still waits for ops accept. Overlap after time change = reassign one of the trips.

---

## URLs

| Option | Description | Selected |
|--------|-------------|----------|
| Keep DC hashes | `#dashboard` etc. | |
| Real paths, no `#` | | ✓ |

**User's choice:** “I don’t want a `#` in any URL. Remove the hashtags in all URLs and let’s go for context.”

---

## Claude's Discretion

- Realtime vs poll vs visibility refetch as long as in-place updates hold.
- Exact path strings.
- Pixel layout of new-trip and chauffeur detail from neighbouring DC screens.
- Stripe extra-session shape for difference charges.
- Postgres assign RPC vs patch, as long as overlap is refused in DB.

## Deferred Ideas

- Cost sheet / expense categories (own phase).
- Driver app / chauffeur WhatsApp channel.
- Live GPS.
- Auto-dispatch.
- Phase 7 UAT tests 2–9 (other session).
