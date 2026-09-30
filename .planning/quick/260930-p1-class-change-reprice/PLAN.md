# P1 — a class change on a paid trip works and is re-priced. Plan for the owner's signature

**Job:** own branch `gsd/26.2-p1-class-change`, cut from origin/main. Lane given by the control session.
**Reads:** `RESEARCH.md` (file and line for every claim) and `DECISIONS.md` (his answers) in this folder.
**State:** plan only. No code before his signature. Every screen and every new e-mail wording
comes to him first: pictures at 1440, 1024, 768 and 390 in English and Arabic; texts in four languages.

## What staff and the customer will see

Example: Anna Keller paid for Economy. She phones and wants Business.

| Step | Dashboard (dashboard.vamostaxi.site, booking detail) | Anna |
|---|---|---|
| 1 | Staff press Edit. "Vehicle class" is a list: Economy, Business, Van luxury. It shows her class, not the assigned car as today. A class that cannot take her passengers or bags cannot be chosen, with a clear message. | — |
| 2 | Staff pick Business. A box shows: paid so far, new total, difference. The Business fare comes from the price book that is live today; her extras stay at what she paid; her coupon applies as it did. | — |
| 3 | Staff confirm. Dearer: the booking stays Economy and shows "waiting for payment of the difference". | She gets an e-mail with a link to pay the difference. Staff can also copy the link or type her card while she is on the phone. |
| 4 | She pays within 24 hours: the booking becomes Business by itself. If a driver was assigned, the trip goes back to unassigned and the driver gets the existing "trip taken off" e-mail. | She gets her confirmation again, with Business and the new total. |
| 5 | She does not pay within 24 hours: the request ends; the booking is still Economy; staff can start again. | Nothing changes for her. |

A cheaper class (Business to Economy): the class changes when staff confirm; the booking shows
"Refund due" with the difference, and the admin presses Refund. That is the refunds-by-hand rule;
the refund button and its texts are built by the security session (plan 20-10). Until that has
shipped, the dashboard refuses a cheaper class with a plain message, so no money is ever owed
without a way to send it.

Same price: the class changes when staff confirm; she gets her confirmation again.

## Rules I put in the plan without a separate question (say so if one is wrong)

| Point | Rule in this plan |
|---|---|
| An unpaid booking | No class change. As today: cancel it and make a new trip. |
| A customer's own change request is waiting on the booking | The class change is refused until staff have answered that request. Today a new request would silently replace it. |
| Who may do it | The same staff who can use Edit today. |
| A second class change later | Allowed. The difference is always measured against everything paid so far, minus refunds. |
| The old silent path | The Edit form can no longer change the class without a price. |
| Live Stripe key | The change machine refuses a live key today (a known pre-launch item of the security session). Not lifted by this job. |

## What is built

| # | Work | Migration |
|---|---|---|
| 1 | Edit form: the class list, the price box, the confirm step. Design first. | no |
| 2 | Price step on the server: the new class's fare from today's live price book for the same trip (the distance, time and places saved on the booking; no new address search), plus her saved extras, her coupon, VAT. It first works out her current class the same way as a check. | no |
| 3 | The staff class change goes through the change machine that already exists for customer requests (request, accept, pay the difference), instead of writing the class in place. | no |
| 4 | Database: the new price record carries the new class and the full lines (fare, extras, coupon, VAT), so the receipt stays whole; the difference is measured against everything paid. New migration, number from the control session. Safe on paid bookings: new functions, no booking row is rewritten. | **yes** |
| 5 | New e-mail "pay the difference" with the link, four languages, his wording. | no |
| 6 | After the change: confirmation sent again; assigned driver unassigned and told. | no |
| 7 | Cheaper class: "Refund due" through the security session's refund-by-hand flow. | theirs |
| 8 | Tests that fail first for each rule above; database tests for the new functions. | — |

## Found on the way, not part of this job (one question later)

Edit also changes pickup, drop-off, date and time of a paid trip in place, with no new price, no
record of the change and no e-mail to the customer. A customer's time change is never re-priced
either. Same treatment as the class, or leave? I ask once this job is signed.

## What it depends on

| Waits for | Why |
|---|---|
| Hand-over 2 on main | Same dashboard files. |
| The security session's batch B1 | It changes the same booking Edit route. |
| The security session's refunds by hand (plan 20-10) | The cheaper-class branch. The dearer-class branch does not wait for it. |
| P4 extras, part C (a number per extra) | The saved extras then carry a number; the price step reads it. Whichever ships second adapts. |

## Proof before hand-over

Tests that fail first; the full check set once by the lead; from-zero database replay and pgTAP on
the isolated local stack; after the ship: one class change on a test booking with a 4242 payment
of the difference by the owner, then `booking_payments` read by status.

## Owner gates

| Gate | State |
|---|---|
| Discuss (DECISIONS.md) | Answered through the question form, 2026-09-30 |
| This plan | **Waiting for his signature** |
| Designs (Edit form, price box, confirm step, waiting state) and the e-mail wording | After the plan is signed, before code |
| UAT and Ship | His word |
