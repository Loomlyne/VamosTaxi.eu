# Hand-over: manage-booking price, payment and driver (quick task 260929-mbp)

**Branch:** `fix/26.3-manage-booking` in `/Users/koss/Developer/vamos-wt/fix-26.3-manage`, cut from `fix/26.3-account-link` ba68caf6. No push, no PR, no deploy, no live writes.

## Page
The confirmation e-mail's "manage booking" button opens `/{locale}/manage-booking?token=...`, the DC page `app/pages/manage-booking.dc.html`.

## Migration
`packages/db/supabase/migrations/20260930190000_manage_booking_money_driver.sql` (after 20260930180000). One additive column, one write function, four read functions, one trigger function replaced. No data changed. Apply file-verbatim with the Worker deploy, read back and compare. Never db push.

## Behaviour
- Money: saved snapshot lines only, shown when they add up to the charge; else the total alone.
- Payment method: recorded at settle for new payments. Old payments read "Paid online".
- Driver: first name, phone (tap to call), model and plate. Nothing else leaves the database. Until assigned: "No driver assigned yet. We will show your driver here once assigned."

## Not verified
No real Stripe method lookup, no real signed-in browser session (see SUMMARY.md).

## Owner UAT (phone first)
1. After deploy, open the confirmation e-mail of VT-26-0738 on your phone and tap "manage booking". Expected: "What you paid" with the fare, total and "Paid online" (old payment); "No driver assigned yet. We will show your driver here once assigned."
2. In the dashboard, assign a chauffeur and vehicle to that booking, reload the page. Expected: chauffeur first name, phone you can tap to call, vehicle model and plate; no photo, no surname.
3. Pay a new test booking with 4242 4242 4242 4242 including a child seat. Open its manage link. Expected: the child seat by the name you gave it, VAT, "Paid with Card".
4. Switch the page to German, French, Arabic. Expected: labels translated, the extra in your own name for that language.
