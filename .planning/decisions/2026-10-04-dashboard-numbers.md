# Dashboard numbers — owner decisions (2026-10-04, question form)

Owner: "now i want to fix the dashboard because it not reading or calculating anything".
His screenshot (Today, ~21:35 +04): Income/Net/Average CHF 100.39 and Business CHF 100.39 (correct, VT-26-0753); Expenses CHF 000; Bookings 0; Pickups 0; Chauffeurs 0/1; Unassigned 0, Awaiting payment 0, Pending edits 0.

Live rows read-only at the time: 1 booking created today, 15 in 7 days, 43 total; no pickup today; 3 paid upcoming trips with no driver; no pay link outstanding; Stripe fee NULL on all 16 captured payments; the one chauffeur is status `off` with no shift hours.

| # | Question | Answer (verbatim choice) |
|---|---|---|
| 1 | Bookings tile ("Taken in this period"): which bookings? | "Booked in the period (Recommended)": count by booking date. Today 1, 7 days 15 |
| 2 | Needs attention, Unassigned bookings: which trips? | "All upcoming trips (Recommended)": every paid trip from now on with no driver, whatever the period; Awaiting payment and Pending edits follow the same rule |
| 3 | Expenses: Stripe fee never recorded | "Record it from Stripe (Recommended)": each payment saves the fee Stripe actually took; the 16 past payments filled in from Stripe; Expenses and Net include it; a separate reviewer reads it before it ships |
| 4 | Chauffeurs on shift | "The status I set (Recommended)": rule unchanged; he sets On shift in Fleet |

Jobs: 1 and 2 in `fix/ops-dash-numbers` (quick 261004-ops-dash-numbers). 3 in its own job `fix/stripe-fee-record` (money: Opus lead, fresh reviewer, backfill of live rows only by the controller).
