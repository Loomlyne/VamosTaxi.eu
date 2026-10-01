# P6 — place and time changes on a paid trip. Plan for the owner's signature

**Job:** branch `gsd/26.2-p6-paid-trip-edit`, migration number `20261007150000` (reserved). Built AFTER P1
and on P1's functions: one price step, one preview and confirm, one pay link for the difference, one
"Refund due". No second set. **Reads:** `RESEARCH.md`, `DECISIONS.md` in this folder.
Every screen change comes to him as pictures (1440, 1024, 768, 390; en and ar) before code ships.

## What he will see (dashboard booking detail, Edit)

| Change | What happens |
|---|---|
| Pickup or drop-off | The address search (as in New trip) finds the place. The box shows paid so far, new total, difference. Dearer: the trip keeps its old places until the customer pays the difference (e-mail with his approved pay-link text, 24 h). Cheaper: changes on confirm, "Refund due" with the full difference. A place the site cannot book is refused with a message. |
| Date or time only | No new price. Saved on confirm, recorded, the customer gets the confirmation again. Allowed until the pickup time. |
| Passengers or bags within the class | Saved at once, recorded, confirmation again. |
| More than the class takes | The Edit offers the classes that fit; one price for the whole change (P1's class change and this change together). |
| Name, e-mail, phone, note | Instant, recorded in the history, no e-mail. |
| Flight number | Instant, recorded; the assigned driver gets the existing flight-number e-mail. |
| An assigned driver | Stays on the trip and gets the trip e-mail with the new time and places; a clash with another of his trips is shown and he decides. |

On vamostaxi.site, "Change your booking" keeps only the time change; the five fields that do nothing
(pickup, destination, class, passengers, bags) go. Picture first.

## What is built

| # | Work | Migration |
|---|---|---|
| 1 | A "trip facts" step on the server: address search result → route (Mapbox, counted in the daily limit), airport or not, city and canton of each end; the facts travel signed from preview to confirm (no second Mapbox call, nothing taken from the browser at confirm). | no |
| 2 | P1's price step takes these facts as input; the preview and confirm routes are P1's, the change is one more field set. | no |
| 3 | The saving step also writes the new coordinates, place ids and trip duration and carries the new distance into the price record. | **yes** (`20261007150000`) |
| 4 | The in-place save stops touching places, time, passengers and bags on paid trips; the instant fields stay instant and are recorded. Two small bugs of today's form go (an emptied pickup saved empty; emptied passengers failed). | no |
| 5 | Customer page: the five fields go; texts stay four languages. | no |
| 6 | Tests that fail first; database tests on a real Postgres (isolated stack); pictures. | — |

## Depends on

P1 on main (same functions). The security session's refunds by hand (live). No other session's file
is touched except through the control session.

## Proof before hand-over

The full check set once by the lead; from-zero replay and pgTAP; after the ship his 4242 payment of a
difference on a test booking, then `booking_payments` read by status.

## Owner gates

| Gate | State |
|---|---|
| Discuss (DECISIONS.md) | Answered, question form, 2026-10-01 |
| This plan | **Signed by the owner, question form, 2026-10-01** ("Signed") |
| Designs (Edit with address search and price box; customer page without the five fields) | Before code ships |
