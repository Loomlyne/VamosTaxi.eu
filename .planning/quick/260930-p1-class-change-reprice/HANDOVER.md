# P1 hand-over — a class change on a paid trip is re-priced and works

Branch `gsd/26.2-p1-class-change` (folder `/Users/koss/Developer/vamos-wt/phase-26.2-p1`), origin/main
`083b50ab` merged in. Plan signed by the owner 2026-09-30; P1 signed 2026-10-01 with two additions
(Withdraw change; the customer's refund line), both built and **signed on pictures 2026-10-01**
(`sheet-withdraw.png`, `sheet-refund-line.png`; question form: "Signed"). Branch pushed; no PR, no
deploy, no hosted SQL. Full detail: `BUILD-RECORD.md`; pictures: `screens/` (sheets `sheet-*.png`).

## What changes

**Dashboard, booking detail (dashboard.vamostaxi.site)**
- Edit: "Vehicle class" is a list of the classes of today's live price book (Economy, Business, Van
  luxury), the booking's class preselected — not the car any more. Picking another class shows a box:
  class now, new class, paid so far, new total, difference. A class that cannot take the passengers or
  bags, or a trip whose saved price cannot be worked out again, says so and cannot be confirmed.
- Continue opens a confirm step ("Change the class?"); nothing is written before "Change the class".
  - Dearer: the booking keeps its class and shows "Waiting for payment of the difference" with Open /
    Copy the Stripe page. The customer gets your approved e-mail (four languages) with a 24-hour link.
    Paid: the class changes by itself, a driver on the trip is taken off and gets "trip taken off", the
    customer gets the confirmation again with the new class and total. Not paid in 24 h: the request
    ends, the booking is untouched.
  - Cheaper: the class changes at once; "Refund due" shows the difference; you press Confirm refund
    (refunds by hand — exactly the difference, nothing automatic). Confirmation sent again.
  - Same price: changes at once; confirmation sent again.
- ACTIONS > "Withdraw change" (only while a dearer change waits): confirm, then the Stripe page closes
  and the request ends; nothing charged, booking unchanged. If she pays in the same second, the answer
  says so and the change applies (she gets what she paid for).
- Edit can no longer change the class without a price (the old in-place write is gone).

**Customer booking page (vamostaxi.site, manage link and account view)**
- After a cheaper class, until the refund is sent: your approved line under the status, four
  languages, word for word (decision file, second section). It goes once the refund is sent.

**Also fixed on the way (same machine)**
- Customer time-change requests: the payload write failed on live with 23514 for every request
  (proven on a real Postgres); now written as JSON, and a string payload is read as its object.
- Accepting a request never takes fields from the browser; the automatic Stripe refund of the old
  machine is gone (refunds by hand).

## Migration `packages/db/supabase/migrations/20261007140000_class_change_reprice.sql`

Apply on the hosted database before the Worker that calls it (verbatim, then read back and compare).
It was amended after the sign-off (withdraw) and has never been applied anywhere hosted.

| Kind | Objects |
|---|---|
| New functions (EXECUTE vamos_system only, SECURITY DEFINER, search_path '') | `booking_staff_change`, `booking_change_withdraw`, `booking_change_mail_facts` |
| New internal helpers (no grant) | `app.edit_payload_object`, `app.booking_paid_net`, `app.booking_change_settle_credit`, `app.booking_change_mint_snapshot` |
| `create or replace` (same signatures and grants) | `booking_edit_apply_payload`, `booking_edit_request_upsert`, `booking_edit_request_accept`, `ops_refund_plan`, `app.refund_intents_settle` |
| `drop + create` (same arguments, more result columns, grant re-applied) | `checkout_extra_payment_settle` — the deployed Worker reads its old columns by name, so the old Worker keeps working |
| Widened CHECKs (existing rows still pass; validation scans, no rewrite) | `booking_edit_requests.status` + `withdrawn`; `booking_refund_intents.tier` + `credit`; `booking_refund_intents.reason` + `modification_credit` |

Safe on real paid bookings: no existing row is updated or deleted; no column added; no backfill. A
booking changes only when you confirm a change (or the customer pays a difference you asked for).
Cancelled bookings keep the 20-10 full-refund rule; the credit tier applies only to a trip that still
runs. One transaction: a failed apply rolls back whole.

Order on ship: migration → Worker `vamos` (and the dashboard gateway if its routing needs the three new
paths `…/bookings/:id/change`, `…/change/preview`, `…/change/withdraw`; checked on the local Worker
build? no — see "not verified").

## Checks (once, on the merged branch, after `node scripts/sync-dc-mock-to-public.mjs`)

| Check | Result |
|---|---|
| typecheck, lint (0 errors; 6 warnings in files P1 did not touch), lint:css, i18n:check, check:numbers, check:db-fences, check:public-env, check:legal-claims, db:seed:check | pass |
| test:unit | web 342 files / 3371 tests, emails 161, db 14 pass; the one failure (port guard on a default port in P1's local DB test) fixed and its guard re-run 5/5 |
| build | pass; the three new staff paths built in both mounts |
| pgTAP, all migrations replayed from zero on the isolated stack `vamos-taxi-p1` | 124 migrations; 91 files / 2176 tests pass |
| Local tests through the real Worker client (same stack) | class-change functions 3/3; end to end (dearer → paid, withdraw, cheaper → refund by hand) 1/1; refund-by-hand, assign, system-reads local suites pass |

## Not verified

- No real Stripe page, refund or Resend mail was made (stood in by fakes); Mapbox was not called.
- Live bookings were not read: a booking saved in an older price-record shape answers "Cancel it and
  make a new trip" (count unknown).
- The dashboard gateway's routing of the three new staff paths was not run on a Worker build.
- Pictures at 1440 and 390 only. On the Arabic customer page some older strings (not P1's) show in
  English in the pictures ("Opened from your confirmation email", "Cancel this transfer").
- A live Stripe key is refused by the class change and the withdraw (security session's pre-launch item).

## Owner UAT (after the control session applied the migration and deployed)

Use test bookings paid with the Stripe test card. Payment first:

1. Dashboard: open a paid Economy test booking → ACTIONS → Edit booking. Expected: "Vehicle class" lists Economy (current class), Business, Van luxury.
2. Pick Business. Expected: box with Class now Economy, New class Business, Paid so far, New total, DIFFERENCE TO PAY.
3. Press Continue → "Change the class?" → Change the class. Expected: notice "The customer was e-mailed the link to pay CHF …"; booking still Economy with "Waiting for payment of the difference".
4. Open the e-mail at the booking's address. Expected: subject "Your Vamos Taxi booking VT-…: pay the difference", your text with new total, paid, difference; button "Pay the difference".
5. Press the button, pay with 4242 4242 4242 4242 (any future date, any CVC). Expected: within a minute the booking reads Business; the confirmation arrives again with Business and the new total; a driver who was on it is taken off and gets "trip taken off".
6. Control session: read `booking_payments` of that booking by status. Expected: two `succeeded` rows (trip and difference).
7. Another paid Economy test booking: steps 1–3 again, then ACTIONS → Withdraw change → Withdraw change. Expected: "Change withdrawn. The payment link no longer works."; the e-mailed link opens Stripe's expired page; booking stays Economy.
8. A paid Business test booking: change to Economy and confirm. Expected: class Economy at once; "Refund due" with "Difference to refund: CHF …"; nothing sent to Stripe.
9. Open that booking's manage link from its confirmation e-mail. Expected under the status: "Your trip now runs in Economy. The difference of CHF … comes back to the payment method you used; our team sends it." Switch to Deutsch, Français, العربية: your approved text in each.
10. Dashboard: press Confirm refund. Expected: exactly the difference is refunded; the Refund due panel goes; after reload the customer page line is gone.
11. Control session: read `booking_refunds` of that booking. Expected: one row, reason `modification_credit`, amount = the difference.

UAT and Ship are your word.
