# P6 worker run — every changed DC form step in a real Chromium on the real local Worker and Supabase

Status: first results (work in progress). Harness: `apps/web/tests/e2e-worker/p6-run.sh` (runner),
`p6-browser.e2e.mjs` (Chromium script), `fakes.mjs` (Stripe, Turnstile, Mapbox, Resend stand-ins),
`mkcfg.mjs` (mode `p6`), seed `apps/web/lib/ops/trip-change-browser.local-seed.test.ts`.
Nothing is stubbed in the page or in the Worker; only the outside services are local stand-ins reached
through a fetch rewrite of the built `worker.js`. Stack: own local Supabase `vamos-taxi-p6b` (62421/62422),
Workers on 4390 (public) and 4391 (`dashboard.localhost`). Screenshots: `screens/worker-run/`.

## First full run (build before D20 was rebuilt)

| Line | Result | Evidence |
|---|---|---|
| S0 / S1 admin and customer passwords set through the admin API; admin signs in at the dashboard login page | PASS | landed on /dashboard |
| O4a clash: moving trip Y onto driver a's trip X names X with Keep / Take off | PASS | box names VT-26-0130, pickup 22:03 |
| O4b Keep, Change the trip | PASS | toast "Trip changed ... P6E Driver a got the new details by e-mail"; Y keeps driver a, `overlap_kept_range = scheduled_range`; POST .../change 200 |
| O4c Complete on trip X (D17 fix) | PASS | PATCH 200 status completed; database completed/completed |
| O4d ordinary Assign of driver a onto a third overlapping trip refused | PASS | POST .../assign 409 code overlap; trip Z still without driver |
| O1a Pickup "Zug": old -> new, paid so far, new total, difference | PASS | CHF 112.69 -> CHF 148.69, difference CHF 36.00 |
| O1b Change the trip: pay link mailed, leg keeps OLD pickup, request waits | PASS | toast "The customer was e-mailed the link to pay CHF 36.00"; leg still Zurich Oerlikon / mb-oerlikon; request requested, place mb-zug |
| O1c Stripe stand-in session for exactly the difference | PASS | open, amount_total 3600 |
| O1d D14 mail in German | PASS | subject "Ihre Vamos Taxi-Buchung VT-26-0127: Differenz bezahlen", "Neuer Abholort:" sentence with "Zug station" |
| O1e Withdraw change | PASS | toast "Change withdrawn..."; request withdrawn; session expired |
| O1f no refund call to Stripe | PASS | 0 |
| O2a Destination "Wallisellen": "Trip changed. Refund due: CHF 81.74" and the leg carries the new drop-off | PASS | place mb-wallisellen, lat 47.4148, 11 min |
| O2b price record carries new distance; Refund due = full difference; no Stripe refund call | PASS | distance_km 6.21; refund_owed 81.74 = 112.69 - 30.95; pending_ops; refund calls 0 |
| O2c booking page shows Refund due panel with the difference | PASS | "Difference to refund: CHF 81.74" |
| O3a time +2 h on a trip with driver b | FAIL (harness) | applied correctly (toast, leg 12:00, driver b kept); my check read the box while it said "Working out the prices..." |
| O3b driver b time-change mail, customer confirmation again | PASS | "Abholzeit bestätigt" to driver b, "Gebucht" to the customer |
| O5 Mobile and Note saved at once, event row, no mail | PASS | toast "Saved. The change is in the history."; phone and note in `bookings`; 1 booking.modified event; no mail |
| O6 flight number on airport pickup with driver | PASS | "Saved. The driver gets the new flight number by e-mail."; "Flugnummer aktualisiert" to driver c |
| O7 pickup "Dubai" refused under the field, nothing written | PASS | preview 409 place-not-served field pickup; leg, requests, events unchanged |
| O8 passengers 6 on Economy: classes that fit, one price | PASS | options "Economy · too small", "Business"; one difference CHF 42.92 |
| C2a manage page flight Save | PASS | "Flight number saved."; POST /api/manage/flight 200 |
| C2b manage page Resend | PASS | "Sent. Check <booking address> in a minute or two."; confirmation ("Gebucht") reached the Resend stand-in |
| C4a/b/c customer signs in; account booking view flight Save and Resend | PASS | POST /api/account/bookings/flight 200, /resend 200; "Gebucht" mail |
| C6 no sideways scroll at 1024 and 768, English and Arabic, C1/C2/C4 pages | PASS | all 0 px; Arabic pages rtl |
| C5b no sideways scroll at 390 | PASS | 0 px on every page measured |
| C5a no page errors | PASS | none |
| C1 D15 line in four languages | FAIL (harness) | the expected text was built as "CHF CHF 81.74" (amount prefixed twice); the page shows the approved line |
| C2c / C4d another day and time -> Request | FAIL (harness) | the requests hold 2026-10-09T11:00 and 2026-10-11T11:00, i.e. the day the page showed as new pickup; my check expected January 2030 |
| C3 cancel view | FAIL (harness) | page is right ("Move it instead" + "CHANGE INSTEAD", sentence absent); my regex was case-sensitive against upper-cased CSS text |
| C7 cancelled booking -> Resend confirmation | FAIL (open) | no POST /api/manage/cancel is sent after pressing "Confirm cancellation"; not understood yet; the D20 build is also not rebuilt yet |

## Failures and root-cause guesses

1. O3a: harness race. The page asks for new figures 450 ms after the last key; my wait looked for the busy marker before it appeared. Fix: wait out the debounce, then for the busy marker to go.
2. C1: harness typo in the expected string. Fix applied.
3. C2c / C4d: harness expectation. The customer's date picker opens on the current month (the page passes a fixed base month of 2026-08), not on the booked month (January 2030). The request correctly holds what was picked. Fix: compare the request with the day shown on the page. Product note, not P6: the picker should open on the booked month.
4. C3: harness regex. Fix applied.
5. C7: unknown. The Confirm cancellation click sends nothing. Next step: a debug run with request logging (a hung Chromium launch stopped the last attempt).

## Things seen that are not part of the expected lines

- After a place change that made the trip cheaper, the Refund due panel says "The class was changed to a cheaper one. Nothing is sent until you confirm." (the P1 class text). The change was a destination, so the sentence is wrong for it.
- The Assign refusal on the dashboard prints the raw local time ("Overlaps VT-26-0130 at 2026-10-01T22:03") instead of "22:03".
