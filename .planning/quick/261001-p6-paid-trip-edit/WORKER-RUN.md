# P6 worker run — every changed DC form step in a real Chromium on the real local Worker and Supabase

**Final after the review fixes (lead, 2026-10-02 02:49 +04):** one uninterrupted run on the final tree `42f3a12c`
(origin/main `eb9128f3` in, the guest-cancel hotfix and review fixes 1–6 in, fresh OpenNext build): **39 lines,
39 PASS, 0 FAIL**. New line C8 (the wrong-booking cancel): booking A's tab after booking B's link → `409
wrong-booking`, "This page is for another booking. Open the link from its e-mail again.", A and B both still
confirmed; reopened from A's own link → A cancelled, B confirmed. (One earlier run had C8b answer `429
rate_limited`: C7's three writes and C8's two fell in one limiter minute; C8 now starts in a new window.)

**Final (lead, 2026-10-02):** one uninterrupted run on the merged tree `7f5b341e` (origin/main `dace2b1f` in, D20 and
D21 in, fresh OpenNext build) at 01:57 +04, and again on the final tree `09a97ca4` (origin/main `d575917e` in) at 02:06 +04:
**37 lines, 37 PASS, 0 FAIL, exit 0** both times, ports 4590/4591/9631/9632, fakes 4397.
New since the builder's run: O2c asserts the D21 trip line ("The trip was changed and costs less now. Nothing is sent
until you confirm.") and not the class line. Two earlier lead runs were cut short when a Worker runtime was stopped
from outside under a load average of 24–28 (no crash report; every cut line had passed before and passed again).
The first of them also hit another session's Worker on 4390; `p6-run.sh` now refuses busy ports and stops only
its own processes (`5f582461`).

Builder's run (below) — result: green. `p6-run.sh` (real OpenNext rebuild of this branch at 5dcb9e6c + 624af1de, then seed, start, browser run, stop)
printed 36 lines, 36 PASS, 0 FAIL, exit 0 (2026-10-02 01:09–01:11 Dubai).

Harness: `apps/web/tests/e2e-worker/p6-run.sh` (runner), `p6-browser.e2e.mjs` (Chromium script), `fakes.mjs` (Stripe, Turnstile,
Mapbox, Resend stand-ins), `mkcfg.mjs` (mode `p6`), seed `apps/web/lib/ops/trip-change-browser.local-seed.test.ts`. Nothing is stubbed in
the page or in the Worker; only the outside services are local stand-ins reached through a fetch rewrite of the built `worker.js`.
Own local Supabase `vamos-taxi-p6b` (62421/62422), Workers on 4390 (public) and 4391 (`dashboard.localhost`), fakes on 4397.
Screenshots (clipped to the changed region): `screens/worker-run/`.
Run by hand: `p6-run.sh <repo-tree> <supabase-workdir> <hook-secret-file> [label]` (modes `P6_MODE=up|seed|down`).

## Lines (dashboard O1–O8, public site C1–C7)

| Line | Evidence |
|---|---|
| S0, S1 passwords through the admin API; the admin signs in at the dashboard login page | landed on /dashboard |
| O1a Pickup "Zug": old -> new, paid so far, new total, difference | CHF 112.69 -> 148.69, difference CHF 36.00 |
| O1b Change the trip: pay link mailed, leg keeps OLD pickup, request waits | toast "e-mailed the link to pay CHF 36.00"; leg Zurich Oerlikon / mb-oerlikon; request requested, place mb-zug |
| O1c Stripe stand-in session for exactly the difference | open, amount_total 3600 |
| O1d D14 mail in German | "Ihre Vamos Taxi-Buchung VT-26-0182: Differenz bezahlen", "Neuer Abholort:" sentence with "Zug station" |
| O1e Withdraw change | request withdrawn, session expired, POST .../change/withdraw 200 |
| O1f no refund call reached Stripe | 0 |
| O2a Destination "Wallisellen": "Trip changed. Refund due: CHF 81.74"; leg carries the new drop-off | mb-wallisellen, lat 47.4148, 11 min |
| O2b price record has the new distance; Refund due is the full difference; no Stripe refund call | distance_km 6.21; refund_owed 81.74 = 112.69 - 30.95; pending_ops; refund calls 0 |
| O2c booking page shows the Refund due panel | "Difference to refund: CHF 81.74" |
| O3a time +2 h with driver b: "No new price", applied, driver kept | leg 12:00, driver b |
| O3b driver b gets the time-change mail, customer the confirmation again | "Abholzeit bestätigt" to driver b, "Gebucht" to the customer |
| O4a clash: Y moved onto driver a's trip X; the box names X with Keep / Take off | box names VT-26-0185, pickup 22:59 |
| O4b Keep -> Change the trip | Y keeps driver a, `overlap_kept_range = scheduled_range` |
| O4c Complete on trip X (the D17 fix) | PATCH 200, completed/completed |
| O4d ordinary Assign of driver a onto a third overlapping trip refused | POST .../assign 409 overlap; trip Z unassigned |
| O5 Mobile and Note saved at once, event row, no mail | "Saved. The change is in the history."; 1 booking.modified event; no mail |
| O6 flight number on airport pickup with driver | "Saved. The driver gets the new flight number by e-mail."; "Flugnummer aktualisiert" to driver c |
| O7 pickup "Dubai" refused under the field, nothing written | preview 409 place-not-served, field pickup; leg, requests, events unchanged |
| O8, O8b passengers 6 on Economy: classes that fit, one price; leaving wrote nothing | options "Economy · too small", "Business"; hint "Classes that fit: Business"; one difference CHF 42.92 |
| C1 D15 line in English, Deutsch, Français, العربية; Arabic page rtl; no sideways scroll at 390 and 1440 | all four lines found word for word with CHF 81.74 |
| C2a/b/c manage page: flight Save, Resend, another day and time | "Flight number saved."; "Sent. Check <address> ..." + "Gebucht" mail; request holds Fri 9 Oct 11:00 as shown (booked day 2030-01-08) |
| C3 cancel view: "Move it instead" keeps title and button, the sentence is gone | box "Move it instead / CHANGE INSTEAD" |
| C4a–d signed-in view: sign-in, flight Save, Resend, Change this booking -> Request | POST /api/account/bookings/flight 200, /resend 200, /time-change 200; request holds Sun 11 Oct 11:00 |
| C6 no sideways scroll at 1024 and 768, English and Arabic, C1/C2/C4 pages | all 0 px; Arabic pages rtl |
| C7a/b/c D20: cancel through the real manage page, then Resend email twice | booking cancelled; each press: exactly ONE mail to the booking address, subject "Buchung VT-26-0192 ist storniert", no "Gebucht" mail |
| C5a, C5b no page errors; no sideways scroll at 390 on every page visited | none; 0 px |

## Found and fixed during the run

1. Real bug, fixed in 5dcb9e6c (test first, red then green): guest **Confirm cancellation** sent no request. The e-mailed manage link is
   stripped to `/manage-booking` and the token moves into the HttpOnly `vt_manage` cookie (K100), so the page holds no token; `confirmCancel`
   only called `/api/manage/cancel` when it had one and otherwise showed "Could not cancel this booking." without any request. It now follows
   `authVia` like the time-change, flight and resend handlers. Both pages (`manage-booking`, `booking-detail`). Not caused by P6 (the guard
   is on `origin/main`), found by C7.
2. Harness faults (not product): a race with the 450 ms preview debounce (O3), an expected string built with "CHF" twice (C1), an expectation
   of January 2030 where the customer's date picker opens on the current month (C2c, C4d: now compared with the day the page showed), a
   case-sensitive match on CSS upper-cased text (C3), left-to-right isolates inside amounts and names (O8), the write limiter's four writes per
   minute per address (C7), a sign-in typed before the DC page had mounted, and a seeded admin row GoTrue could not read.

## Seen, not part of the expected lines (owner's call, nothing changed)

- After a destination change that made the trip cheaper, the Refund due panel said "The class was changed to a cheaper one. Nothing is sent
  until you confirm." (the P1 class text); the change was a place. **Owner answered D21 (2026-10-02); fixed in `71abdab4`, line O2c.**
- The Assign refusal on the dashboard prints the raw local time ("Overlaps VT-26-0185 at 2026-10-01T22:59") instead of "22:59".
- The customer's date picker opens on the current month (fixed base month in the page), not on the booked month.
- `manage-booking.dc.html` has `isCancelled: false` fixed, so its cancelled view and its "Resend confirmation" button are never shown; after
  cancelling (and on a fresh load) the page keeps the booking view, with "Change this booking" still offered. Resend on a cancelled booking is
  the "Resend email" row, which D20 serves.
- The Worker's `/api/fx` reaches open.er-api.com from the local run (not one of the stand-ins).

## Not verified here

- A real payment of the difference (Stripe webhook -> the new place written) is covered by `trip-change.local.test.ts`, not by this run.
- No real Mapbox, Stripe, Resend or Turnstile call; D14/D15 texts in German, French and Arabic are the approved texts, not read by a native speaker.
