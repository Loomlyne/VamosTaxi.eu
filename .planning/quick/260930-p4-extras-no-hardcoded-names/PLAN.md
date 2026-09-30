# P4 — extras: the row decides, never the name. Plan for the owner's signature

**Job:** own branch `gsd/26.2-p4-extras`, cut from origin/main. Lane given by the control session.
**Reads:** `RESEARCH.md` (every claim with file and line) and `DECISIONS.md` (his answers) in this folder.
**State:** plan only. No code is written before his signature. Each part that changes a screen
gets a design with pictures at 1440, 1024, 768 and 390, in English and Arabic, signed before code.

## The rule after this job

| What he sets on Pricing | What the customer sees on /checkout | What is charged |
|---|---|---|
| An extra with a price above 0 | A tick box, off | The price, when ticked |
| An extra with a price above 0 and "Customer can choose a number" on, maximum he types | A number picker, 0 up to his maximum | Price × number |
| An extra at CHF 0 | "Included", ticked; the customer can untick it | Nothing |
| A deleted extra | Nothing, anywhere | Nothing |

The name of an extra never changes any of this. No list of names stays in the code.

**One example he can check on /pricing (his own live figure):** "Child seat" is CHF 10.00 today.
Before: one tick, CHF 10.00, however many seats. After part C, with the switch on and maximum 3:
a customer who picks 2 pays 2 × CHF 10.00 = CHF 20.00; the confirmation, the e-mail and the
dashboard say "2 × Child seat". An extra he names "Ski" today answers with an error and is not
saved; after part A it is saved as "Ski" and is a tick box at the price he types.

## Why it must be done carefully

On the live site the child seat is a tick box only because the dashboard stores the extra's rule
in a wrong form and the fare engine reads that as "no rule". Correcting only the stored form would
add the child seat to every booking and remove it from checkout. So the reader and the writer are
changed in the same ship, and the live price book (row 18) is not touched at all.

## Parts, in this order

### Part A — the row decides (no change to the checkout design)

| # | Work | Visible change |
|---|---|---|
| A1 | The save route writes one rule for every extra ("chosen by the customer"), in the right form. The reader treats the old wrongly stored form as the same rule. Both in one ship. | None for the child seat. "Ski", "Waiting", "Night", "Weekend", "Holiday" now save and are ordinary tick boxes; "Night/Weekend/Holiday" no longer block Publish. |
| A2 | The tick-box list on /checkout is decided by that rule alone, not by a name list. | None. |
| A3 | Delete the name lists and the renaming (`lib/ops/surcharge-codes.ts`) and the dead name-based helpers in `lib/checkout/extras-catalog.ts`. | None. |
| A4 | Delete the leftover automatic waiting code in the fare engine and the "extra wait" figure on the dashboard booking detail. No automatic night, weekend, holiday or waiting charge exists. | The "extra wait" figure leaves the booking detail (it is always empty today). Picture for his signature. |
| A5 | Pricing page: the words "Meet and greet stays on", "Free airport wait", "Extra wait" and the type list behind them go, in four languages. | Pricing page. Picture for his signature. |
| A6 | Deleting an extra also deletes its four-language names. | None on screen. Old bookings keep the name inside their own record. |

Needs from the control session: one migration number for A6 (a delete of the names row is not
possible for staff today) and, optional, one for the old trigger that still lists seven names.
Tests first for every row of the table in RESEARCH "Answer 4" (the ten names).
Old bookings: the readers that print old extras on old receipts and e-mails stay; they decide
nothing for new bookings.

### Part D — remove the extra stop

There is no stop on the way in this product. The unused code goes: the stop fields of the quote
request, the stop branch of the fare engine, the "at most one stop" setting and its reads.

| Point | How |
|---|---|
| Open quotes at the moment of the ship | A quote is held for a short time and is signed. The signed form loses its stop fields. For the length of one hold the server accepts both forms, so no customer on /checkout loses a price during the ship. |
| The setting column in the database | Stays for now and is no longer read. Dropping the column is its own small migration later, on his word. |
| The Mapbox count fix of hand-over 2 (re-price with a changed stop) | Goes with the stop code. |

No screen changes: no screen has a stop field today.

### Part B — free extras are "included"

| # | Work | Visible change |
|---|---|---|
| B1 | An extra at CHF 0 is shown on /checkout as "Included", ticked. Unticking removes it. | New row on /checkout. **Design with pictures for his signature.** |
| B2 | A free extra that stays ticked is saved on the booking with amount 0 and its four names. | Confirmation page, confirmation e-mail, pay-link e-mail, booking page, dashboard booking detail and New trip show "… included". Pictures for his signature. |
| B3 | The word "Included" in four languages. | — |

Waits for the class-cards session: it is building in the same checkout files and styles now.

### Part C — a number per extra

| # | Work | Visible change |
|---|---|---|
| C1 | Pricing page, per extra: switch "Customer can choose a number" and a field "Maximum". | Pricing page. **Design with pictures for his signature.** |
| C2 | Database: the extra's row stores the maximum (empty means one tick). New migration, number from the control session. Safe on paid bookings: a new column, no row of a booking changes. | — |
| C3 | /checkout: a number picker for such an extra; price × number, server-side. | **Design with pictures for his signature.** Touch targets 44 px, 54 px on the booking fields. |
| C4 | The number is saved and shown: confirmation, e-mails, booking page, dashboard booking detail; New trip on the dashboard can set it too. | "2 × Child seat". |
| C5 | Refunds and edits keep working with a number (Phase 20 owns refunds by hand; nothing is changed there without that session). | — |

## What this job does not do

- No automatic charge by clock or calendar. He chose to delete those.
- No stop on the way.
- The airport fee stays inside the fare, as he chose.
- No price, rate or legal line is invented. The agent never presses Publish.
- Old price books and old bookings are not rewritten.

## Proof before each hand-over

Tests that fail first; the full check set run once by the lead; from-zero database replay and
pgTAP on the isolated local stack when a migration is in the part; for every part that touches
/checkout: one 4242 payment by the owner after the ship, then `booking_payments` read by status.
Hand-over per part, small.

## Owner gates

| Gate | State |
|---|---|
| Discuss (DECISIONS.md) | Answered through the question form, 2026-09-30 |
| This plan and the order A → D → B → C | **Signed by the owner, question form, 2026-09-30** ("Signed, order A D B C") |
| Designs for A4, A5, B1, B2, C1, C3 | After the plan is signed, before code of that part |
| UAT and Ship per part | His word |
