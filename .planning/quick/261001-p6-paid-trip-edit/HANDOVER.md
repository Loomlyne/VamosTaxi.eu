# P6 hand-over — a place and time change on a paid trip is re-priced and works

Branch `gsd/26.2-p6-build` (folder `/Users/koss/Developer/vamos-wt/phase-26.2`), cut from origin/main
`3f0ba6b2`; the signed design draft is on it, the server step follows. Plan signed 2026-10-01,
decisions D1–D16 (`.planning/decisions/2026-10-01-p6-paid-trip-edit.md`), design signed (D10). Not
pushed; no PR, no deploy, no hosted SQL. Full detail: `BUILD-RECORD.md`; pictures: `screens/`.

**One thing stopped (your decision):** keeping a driver on two trips that overlap (D11). See
"Stopped on" — everything else is built.

## What changes

**Dashboard → booking → Actions → Edit booking (dashboard.vamostaxi.site)**
- Trip: pickup and destination from the address search, date, time, passengers, bags, class. The box
  shows each change old → new and the money; CONTINUE → "Change the trip?" → CHANGE THE TRIP. Nothing
  is written before that.
  - **Dearer** (a farther place): the trip keeps its places until the customer pays the difference.
    The customer gets your D14 e-mail (four languages, word for word) with the Stripe link for 24
    hours. Paid: the new place is written (text, map position, route duration), the price record
    carries the new distance, the confirmation goes again, a driver on the trip stays and gets the
    "trip assigned" e-mail with the new place. Not paid in 24 h: nothing changes. "Withdraw change"
    works as for a class.
  - **Cheaper**: written at once; "Refund due" with the full difference; you press Confirm refund.
  - **Date or time only, or passengers / bags the class takes**: no new price, written at once,
    recorded, the confirmation goes again; a driver on the trip stays and gets the existing
    time-change e-mail for a new time. Works until the pickup time.
  - **More passengers than the class takes**: the classes that fit are offered; one price for the
    whole change; the driver comes off (as for any class change) and is told.
  - **A place the site does not book** (outside the area the public site books, or no road route) is
    refused under its field; nothing changes.
  - **The new time clashes with another trip of the driver**: the box names it; "Take … off this
    trip" works (he gets "trip taken off"). "Keep … on this trip" answers "Reassign the chauffeur
    before this change can apply." until you decide D11 (below).
- Contact and note: name, e-mail, phone, note saved at once and recorded in the history, no e-mail.
  Flight number saved at once, recorded, the driver on the trip gets the existing flight-number e-mail.
- The old in-place save can no longer change places, date, time, passengers, bags or class of a paid
  trip (two old faults go with it: an emptied pickup was saved empty, an emptied passengers field
  failed the save).

**Customer pages (vamostaxi.site)**
- After a cheaper change of places or time, until the refund is sent: your D15 line under the status
  ("Your trip has changed. The difference of CHF … comes back …"), four languages; a cheaper class
  change alone keeps the P1 line.
- Cancel view: "Move it instead" keeps its title and button, the sentence is gone (D12).
- Signed-in booking view: "Request these changes" now sends the time change, as the manage link does
  (D13). Found on the way and fixed on both views: a new **day** was not sent (the booked day went
  with the new time), and a booking opened through the account could not be changed at all.

## Migration and order (control session)

`packages/db/supabase/migrations/20261007150000_trip_change_reprice.sql` — new functions
`booking_staff_trip_change`, `booking_change_request_facts`, `booking_staff_contact_update`,
helper `app.booking_change_mint_trip_snapshot`; `create or replace` of `booking_edit_apply_payload`
(from P1's body) and `manage_money_for` (one key added). Only functions, grants, revokes and
comments: no row written, no column, no constraint. It touches nothing that the live
`20261007160000_assign_by_class.sql` touches.

1. Apply the file on the hosted database verbatim, then read back each function (`pg_get_functiondef`)
   and compare with the file, and the grants (EXECUTE `vamos_system` only on the three new ones).
2. Then deploy Worker `vamos` (the dashboard gateway already routes `…/change` and `…/change/preview`).
   The old Worker keeps working on the new database: the replaced functions keep their signatures,
   and `manage_money_for` only gains a key.

## Checks (once, final tree, after `node scripts/sync-dc-mock-to-public.mjs`)

| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm lint` | pass — 0 errors, 6 warnings, all in files this job did not touch |
| `pnpm lint:css` | pass |
| `pnpm i18n:check` | pass (2676 keys) |
| `pnpm check:numbers` | pass |
| `pnpm check:db-fences` | pass (8 checks, 1072 files) |
| `pnpm check:public-env` | pass (before and after the build; no `.open-next` bundle to scan) |
| `pnpm check:legal-claims` | pass (3 checks) |
| `pnpm db:seed:check` | no drift |
| `pnpm build` | pass; `…/bookings/[id]/change`, `…/change/preview`, `…/change/withdraw` in both mounts |
| `pnpm test:unit` | web 357 files / 3568 tests pass (6 local-DB files skipped without a port), emails 14 / 179, db 2 / 14 |
| From-zero replay + full pgTAP (`vamos-taxi-chauffeur`) | 126 migrations; 93 files / 2334 tests pass |
| Worker-client local tests (same replay) | 6 web files + `packages/db` `class-change-reprice` 3/3 pass |
| Build output after | `apps/web/.next` removed; no `.next-*`, no `.open-next`; `tsconfig.json` untouched |

## Not verified

- Nothing applied hosted; no real Mapbox, Stripe or Resend call (fakes); the Edit was not clicked
  against the running server (unit tests, the local Worker-client test and the signed pictures).
- How many live bookings carry a price record P1 cannot read: date / time / party still change on
  them; new places or a class answer "Cancel it and make a new trip".
- D14 / D15 in German, French and Arabic are your approved texts, not read by a native speaker.

## Stopped on

**D11 — keep a driver on two overlapping trips.** You answered "Keep him on both". The database
refuses one driver on two overlapping trips with a table rule (`booking_legs_chauffeur_no_overlap`),
checked at every write and at the end of every transaction. Honouring D11 needs that rule changed;
the brief said to stop there, so it is not done. Until you decide, Keep on a real overlap is refused
and Take off works.

## Open questions (one decision each)

1. **D11, how to allow it.** Example: Marco has VT-26-0807 at 10:30; you move Anna's trip to 10:00 and
   press "Keep Marco Rossi". Options: (a) change the table rule so a trip YOU marked "kept on purpose"
   is left out of the overlap check (ordinary Assign keeps refusing overlaps) — a new migration;
   (b) keep it as built: only "Take off" on a real overlap.
2. **Istanbul.** The public site books any two points inside its Europe box (longitude −31.5 to 40,
   latitude 27.5 to 72), so Zurich → Istanbul is bookable on vamostaxi.site today, and the Edit
   accepts it too. The Edit refuses Dubai or New York. Options: keep the site's rule (as built) ·
   narrow the area the site books (changes the public booking form too).
3. **Two more buttons on the signed-in booking view show success and send nothing** ("Save" of the
   flight number, "Resend email"). Example: Ben types LX 320, presses Save, sees "saved", and the
   number never reaches you. Options: fix both like the manage link (same routes and messages) · leave.

## Owner UAT (after the control session applied the migration and deployed)

Use test bookings paid with the Stripe test card. Payment first:

1. Dashboard: open a paid test booking → ACTIONS → Edit booking. Pickup: type "Zug", pick it from the
   list. Expected: "What changes: Pickup old → new", Paid so far, New total, DIFFERENCE TO PAY.
2. CONTINUE → "Change the trip?" → CHANGE THE TRIP. Expected: "The customer was e-mailed the link to
   pay CHF …. The trip changes when it is paid."; the booking still shows the old pickup and "Waiting
   for payment of the difference — Trip change".
3. Open the e-mail at the booking's address. Expected: subject "Your Vamos Taxi booking VT-…: pay the
   difference", heading "Your trip changes", text with "New pickup: …" and new total / paid /
   difference, button "Pay the difference".
4. Press the button and pay with 4242 4242 4242 4242 (any future date, any CVC). Expected: within a
   minute the booking shows the new pickup; the confirmation arrives again with the new pickup and
   total; a driver on the trip stays and gets the "trip assigned" e-mail with the new pickup.
5. Control session: read `booking_payments` of that booking by status. Expected: two `succeeded`
   rows (trip and difference); `booking_legs` pickup place id and position are the new place; the
   bound price record's `distance_km` is the new route.
6. Another paid test booking: Edit → Destination: pick a nearer place → CONTINUE → CHANGE THE TRIP.
   Expected: "Trip changed. Refund due: CHF …"; the Refund due panel shows exactly the difference;
   nothing sent to Stripe.
7. Open that booking's manage link (confirmation e-mail). Expected under the status: "Your trip has
   changed. The difference of CHF … comes back to the payment method you used; our team sends it."
   Switch to Deutsch, Français, العربية: your D15 text in each.
8. Dashboard: press Confirm refund. Expected: exactly the difference is refunded; after reload the
   customer line is gone. Control session: `booking_refunds` of that booking: one row, reason
   `modification_credit`, amount = the difference.
9. A paid test booking with a driver: Edit → Time: two hours later → CONTINUE → CHANGE THE TRIP.
   Expected: "No new price: the customer keeps the price paid."; after confirm "Trip changed. The
   customer got the confirmation again. … got the new details by e-mail."; the driver gets the
   time-change e-mail.
10. Give the same driver a second test trip one hour after the first; Edit the first to the second's
    time. Expected: "… has another trip at that time — VT-…, pickup at …" with Keep / Take off. Pick
    Take off → CONTINUE → CHANGE THE TRIP. Expected: trip unassigned; the driver gets "trip taken
    off". (Keep → "Reassign the chauffeur before this change can apply." until question 1.)
11. Edit → Mobile and Note only → SAVE CHANGES. Expected: "Saved. The change is in the history.";
    no e-mail to anyone.
12. Airport pickup with a driver: Edit → Flight number → SAVE CHANGES. Expected: "Saved. The driver
    gets the new flight number by e-mail."; the driver gets the flight-number e-mail.
13. vamostaxi.site, signed in → your test booking → Change this booking → pick another day and time →
    Request these changes. Expected: "Time-change requested. Pickup stays … until we confirm." and
    "Change requested" with the new day and time; the dashboard shows the request with Accept / Refuse.
14. Same page → Cancel this transfer. Expected: the "Move it instead" box with its title and button
    and no sentence under the title.

UAT and Ship are your word.
