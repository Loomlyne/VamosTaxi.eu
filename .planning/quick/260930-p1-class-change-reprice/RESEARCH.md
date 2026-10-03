# Quick 260930-p1 — Class change on a paid trip must be saved and re-priced — Research

**Researched:** 2026-09-30
**Domain:** dashboard booking edit, paid-edit machine, price snapshots, Stripe extra payment and refund
**Folder / branch read:** `/Users/koss/Developer/vamos-wt/phase-26.2`, `gsd/26.2-p4-extras` at `c628d404` (no code changed, nothing committed, no test suite run, no database touched)
**Confidence:** HIGH for what the code does today (every row below was read in this worktree and carries file:line). MEDIUM for the recommended design (it depends on owner answers and on two other sessions). See "Not verified" at the end.

All paths are relative to the worktree root. Short names:

- `MIG` = `packages/db/supabase/migrations/20260910175309_booking_edit_requests.sql`
- `ER` = `apps/web/lib/ops/edit-request.ts`
- `DETAIL` = `app/ops/OpsDetail.dc.html`
- `BW` = `apps/web/lib/ops/bookings-write.ts`

Every claim with a file:line was verified by reading that file in this session. Claims without one are in "Assumptions" or "Not verified".

---

## Summary

A machine for "change a paid trip and settle the price difference" already exists in the database and the Worker (phase 08, `booking_edit_requests`). It has three outcomes: same price → apply; higher → Stripe page for the difference, trip unchanged until paid; lower → refund the difference. The payload already has a class field and the apply function already writes the class. The dashboard already shows a pending edit with Accept / Refuse, "Open Stripe payment page" and "Copy payment link".

But no screen has ever sent a class through it, and the part that would produce the new price for a class change is wrong for today's pricing: it compares the new class NET (no extras, no VAT) with what the customer PAID (extras and VAT included). Five more weak points sit in the same path (difference measured against the first payment only; the cheaper-inside-24-h branch never applies; the 24 h line is typed in SQL; the new snapshot keeps the old class and loses the receipt lines; the staff-made branch reads a table the system role may not read on live).

Separately, `updateBooking` (the PATCH the Edit form uses) would overwrite the class in place with no price, no event and no mail if the form sent it. It does the same today for pickup, drop-off, date and time, which the form does send.

**Primary recommendation:** Option A. Route a staff class change through the existing paid-edit machine as a staff-made request, with a new price step built from the booking's own saved snapshot, one new migration, and the class removed from the in-place PATCH. Do not build a second money path. Sequence the cheaper-class branch behind the security session's refunds-by-hand work (plan 20-10 and P2).

---

## User constraints (from the control session's brief; there is no CONTEXT.md for this job)

### Locked decisions

- Owner, question form, 2026-09-30: "Work as intended, make the change work and fix the problem." A class change on a paid trip must be saved AND re-priced.
- Classes are Economy, Business, Van luxury. Live slugs: `saden`, `mercedes-benz-v-class`, `van-luxury`.
- V1 is one-way only. The charge is always CHF.
- Never invent a price, a rate or a rule. The plan must ask the owner what happens to the price difference in both directions.

### Earlier owner decisions that already cover part of this (the plan should confirm, not re-ask from zero)

| Decision | Text | Where |
|---|---|---|
| 08 D-66 | Ops can change anything on a paid trip. Reprice with the same quote engine. | `.planning/phases/08-ops-dispatch-live-board-assignment-account-surfaces/08-CONTEXT.md:112` |
| 08 D-67 | Higher: extra pay-link / card for the difference only. Trip stays as-is until that extra is captured. | same file `:113` |
| 08 D-68 | Lower: difference refund. More than 24 h before pickup → refund immediately on accept. Inside 24 h → ops must click Refund. | `:114` |
| 08 D-69 | Dashboard Income stays the original capture. Extra capture and difference refund are their own money lines. | `:115` |
| 08 D-70 | Unpaid in ops: no edit. Cancel and create a new trip. | `:116` |
| 08 D-75 | A paid edit that breaks the assigned chauffeur (overlap / capacity) is "must-fix"; not auto-cancelled. | `:121` |
| Refunds by hand, 2026-09-30, decision 1 | "Refunds are made by hand … Nothing goes to Stripe without his click." | `.planning/decisions/2026-09-30-refunds-by-hand.md` on main `ac01b413` (one commit ahead of this worktree) |
| Refunds by hand, decision 3 | A booking with more than one payment: the admin chooses which payment to refund and how much. | same file |

08 D-68 ("refund immediately") and today's refunds-by-hand decision 1 point in different directions. The plan must ask which one holds for a cheaper class (owner decision 4 below).

### Out of scope

- Return trips, a second currency, live GPS, a driver app.
- Re-pricing a change of pickup, drop-off, date or time. The same gap exists there (section 2), but the owner's decision today is about the class. It is listed as an open question, not built here.

## Project constraints (from CLAUDE.md, .claude/CLAUDE.md, CLAUDE.local.md)

- A shown control must be live through UI, backend, database and ops. No fake control: the class field either works end to end or is not an editable field.
- Never invent a colour, font, radius or shadow; compose from design-system components (`Select`, `Button`, `Alert`). No glow. No tinted yellow.
- Four languages in the same pass (en, de, fr, ar; Swiss German "ss"). `DETAIL` keeps its own four-language table (`DETAIL:533-700`), pinned by `apps/web/lib/ops/ops-detail-i18n.test.ts:162-184`.
- Amounts through the money formatter; never a typed CHF figure; never an invented rate. Tests use synthetic 1-rappen figures (`packages/db/supabase/tests/booking_edit_requests.test.sql:3-5`).
- Desktop → tablet → phone in the same pass; 44 px touch targets.
- The live database has real paid bookings: never wipe, never `db push`. Migrations are new files only; hosted SQL is applied by the control session.
- One job, one branch; only the control session commits to main, pushes and deploys. After a deploy that touches checkout or payment: one 4242 test payment, then read `booking_payments`.
- Owner choices go through the question form, one decision per question, plain words, one example.
- `apps/web/public/app/` is gitignored; twin tests need `node scripts/sync-dc-mock-to-public.mjs` first (`apps/web/package.json:11`).

---

## 1. What exists today for changing a PAID booking

### 1.1 One machine, several doors

Table `booking_edit_requests` (`MIG:21-35`): one row per request, at most one pending per booking (`MIG:43-45`).

| Door | Who | Route | What it can carry | Evidence |
|---|---|---|---|---|
| Customer time change | signed-in customer or guest with the manage link | `POST /api/account/bookings/time-change`, `POST /api/manage/time-change` | new pickup date and time only | `apps/web/app/api/manage/time-change/route.ts:47-59`, `ER:527-545`, `app/vamos-manage-ticket.js:147-161`, `app/pages/manage-booking.dc.html:432, 982-985` |
| Customer full edit (server door, no screen uses it) | customer or guest | `POST /api/account/bookings` | name, e-mail, phone, note, pickup text, drop-off text, flight, time, pax, bags, **class**, plus a quote `lock` | `apps/web/app/api/account/bookings/route.ts:87-105, 140-145` |
| Staff accept / refuse of a pending request | any staff | `POST /api/staff/bookings/:id/edit-accept`, `POST …/edit-request` with `action: 'refuse'` | the request id | `DETAIL:1060-1096`, `edit-accept/route.ts:34-81`, `edit-request/route.ts:37-101` |
| Staff edit made and accepted in one call | any staff | the same two routes, called WITHOUT `requestId` | same fields as the full edit, **class included**, plus `lock` | `ER:143-207`, `edit-accept/route.ts:50-68` |
| Customer flight number | customer or guest | `/api/manage/flight`, `/api/account/bookings/flight` | flight number; written at once, no accept, no price | `ER:618-657` |

Who really uses them:

- Customer pages send only a time change and a flight number. The modify view has one field, the date/time picker (`app/pages/manage-booking.dc.html:432`); `app/vamos-manage-ticket.js:147-177`; `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx:569`.
- The dashboard calls `edit-accept` only with `{ requestId }` for a request the customer made (`DETAIL:1065-1067`) and `edit-request` only to refuse (`DETAIL:1087-1090`). The "staff edit in one call" branch has no caller.

**Can a class change be part of an edit request today?** On the server, yes: `vehicle_class_slug` is a payload field (`apps/web/lib/ops/edit-request-map.ts:8-21`), the three routes map `klass` / `vehicle_class_slug` into it (`edit-accept/route.ts:54, 66`, `edit-request/route.ts:73, 86`, `apps/web/app/api/account/bookings/route.ts:103`) and the apply function writes `vehicle_class_id` from it (`MIG:127, 141-147`). On screen, no: nothing sends it. The class path is built and has never been driven. No test covers it (section 7).

### 1.2 The flow, step by step

1. **The request is stored.** `booking_edit_request_upsert` refuses an unpaid booking (`MIG:469-476`), marks an earlier pending request of the same booking `superseded` (`MIG:478-489`) and inserts a row with status `requested`, the wanted changes and a `quote_snapshot_id` (`MIG:491-496`). The trip is not touched (`ER:436-441`).
2. **The "new price" is a copy of the old snapshot with a new total.** `booking_edit_clone_quote_snapshot(booking, new_total, quote_id)` copies the booking's bound snapshot — same price book id, same settings id, same class id, same distance — and sets the total to the number it is given (`MIG:313-417`). No number given → same total, and the existing snapshot id is returned (`MIG:339-350`). The copy has ONE line, "transfer = total"; extras, coupon and VAT lines are not carried; surcharges and discount are written 0 (`MIG:391-407`). The SQL never calculates a price.
3. **Where the new number comes from.** Only from a signed quote lock sent with the request: the server verifies the lock and takes `class_totals[slug].total_rappen` (`ER:153-170` staff, `ER:462-479` customer). No lock → new total = old total. A customer time change sends no lock (`ER:539-544`), so **a time change is never re-priced today**.
4. **Staff press Accept.** `booking_edit_request_accept` (`MIG:523-672`) computes `difference = new snapshot total − amount of the FIRST captured payment` (`MIG:579-586, 601`):

| Difference | Outcome | In the database | In the Worker |
|---|---|---|---|
| 0 | `applied` | Payload applied to the trip; request → `accepted` (`MIG:626-639`) | Nothing more (`ER:256-265`). |
| higher | `extra_required` | Trip NOT changed. A "difference" snapshot is made whose total is only the extra (`MIG:640-654`, `MIG:205-300`). | A Stripe-hosted Checkout Session for the difference only, product name "Fare difference", open 24 h, id stored on the request (`ER:323-400`, 24 h at `ER:374`). |
| lower, more than 24 h before pickup | `refund_immediate` | Trip not yet changed (`MIG:655-656`). | Stripe partial refund of the difference on the original payment FIRST (`ER:278-298`), then `booking_edit_refund_record` writes the refund row, the event and applies the payload (`ER:299-312`, `MIG:822-874`). |
| lower, 24 h or less before pickup | `refund_click` | Nothing. Request stays `requested` (`MIG:657-658`). | Dashboard says "Use Refund for the difference." (`DETAIL:562, 1073`). Nothing applies the edit afterwards (W3). |

5. **The customer pays the extra.** On the pending edit the dashboard shows "Open Stripe payment page" and "Copy payment link" (`DETAIL:233-237, 1330-1335`); both read the open session URL from `POST /api/staff/bookings/:id/extra-pay` (`extra-pay/route.ts:36-43`, `ER:667-689`). Staff type the card on the Stripe page, or paste the link to the customer by hand. No e-mail carries this link.
6. **Stripe says paid.** The settle path sees `metadata.kind = "extra"` and calls `checkout_extra_payment_settle` (`apps/web/lib/checkout/settle.ts:540-556`). In one transaction: a second `booking_payments` row bound to the difference snapshot, payload applied to the trip, request → `accepted`, payment linked (`MIG:1003-1075`). Booking status untouched (`MIG:1077`).
7. **Refuse.** The pending request is superseded; the trip stays as booked (`ER:551-567`).

"Take card" and "Send pay-link" (`apps/web/lib/ops/phone-booking.ts:117-242`) are for UNPAID bookings only; a paid booking is refused with `already-paid` (`phone-booking.ts:83`). For a paid booking the only payment tool is the extra-fare session above.

### 1.3 What "apply" writes

`booking_edit_apply_payload` (`MIG:67-190`):

| Written | Evidence |
|---|---|
| name, e-mail, phone, note on `bookings`; `bookings.price_snapshot_id` = the new snapshot | `MIG:106-113` |
| pickup text, drop-off text, flight, date/time, pax, bags and `vehicle_class_id` (from `vehicle_class_slug`) on the first leg | `MIG:127-149` |
| An unknown class slug keeps the old class, silently | `MIG:141-147` |
| Refuses with `capacity` if the ASSIGNED vehicle has fewer seats or bags than the new pax/bags | `MIG:156-164` |
| Does not check that the assigned vehicle is of the new class | `MIG:156-164` (seats and bags only) |
| Event `booking.modified` with the payload | `MIG:166-176` |
| Event `price.repriced` with the new snapshot id | `MIG:178-188` |

### 1.4 What is recorded and which e-mails go out

| Thing | Recorded / sent | Evidence |
|---|---|---|
| `booking_edit_requests` | payload, `quote_snapshot_id`, `extra_snapshot_id`, `extra_session_id`, `extra_payment_id`, status, actor | `MIG:21-35` |
| `price_snapshots` | a copy with source `modification` (new full total); a difference snapshot with one `extra_fare` line | `MIG:388, 399-407`, `MIG:271, 282-290` |
| `booking_payments` | a second `succeeded` row for the extra, bound to the difference snapshot; one success per snapshot | `MIG:1011-1039`, `MIG:12-19` |
| `booking_refunds` | reason `modification_credit` (only in the more-than-24-h branch) | `MIG:822-847` |
| `booking_events` | `booking.modified`, `price.repriced`, `refund.issued` (via `edit_difference`), `payment.failed` (kind extra) | `MIG:166-188, 849-860, 973-981` |
| Dashboard money | original capture, extra capture and total captured are read apart | `apps/web/lib/ops/bookings.ts:141-151` |
| Mail: time change applied | "time change confirmed" to customer, bookings@ and the assigned chauffeur | `ER:585-612`, `edit-accept/route.ts:70-72` |
| Mail: refuse | "time change refused" to the customer, on every refuse whatever the request held | `edit-request/route.ts:50-53` |
| Mail: extra fare needed | none | `ER:323-410` |
| Mail: extra paid | none; the confirmation mail is skipped for `kind=extra` | `apps/web/lib/checkout/settle.ts:445` |
| Mail: class / place / pax change applied | none; mail goes only when the pending request held a time and the outcome is `applied` | `edit-accept/route.ts:49, 70-72`, `ER:569-583` |
| Mail: overlap or capacity failure | internal "must fix" mail | `ER:245-252`, `settle.ts:595-603` |

Existing templates (`packages/emails/src/`): Confirmation, TimeChange, FlightNumber, AssignmentCustomer, ChauffeurAssign, ChauffeurUnassign, Cancellation, RefundFailed, Reminder24h, ReviewRequest, PayLink, OpsMustFix. There is no "your booking changed" or "please pay the difference" template. `TimeChangeEmail.tsx` does not mention the class. The dashboard can resend the confirmation mail: `POST /api/staff/bookings/:id/voucher` (`voucher/route.ts:28-35`).

### 1.5 Weak points in the existing machine

| # | Finding | Evidence | Effect on a class change |
|---|---|---|---|
| W1 | The lock's `class_totals` are the class NET: no ticked extras, no VAT. The customer paid net + extras − coupon, then VAT on top. `acceptPaidEdit` compares the two directly. | `apps/web/lib/checkout/checkout-charge.ts:1-8, 41-42`; `apps/web/lib/checkout/intent.ts:444-496`; `apps/web/app/api/checkout/intent/route.ts:197-206`; `ER:163-168`; `MIG:601` | A class change priced through a lock would compare "new class without extras and VAT" with "old class with extras and VAT". The difference comes out too low. **The lock path cannot be reused as it is.** |
| W2 | The difference is measured against the FIRST captured payment, not against everything paid so far. | `MIG:579-586, 601` | A second paid change on the same booking charges the first extra again or refunds too little. |
| W3 | `refund_click` leaves the request pending; the Refund route knows nothing about edit requests. | `MIG:657-658`, `ER:267-276`; the only source files that mention `booking_edit` are `settle.ts`, `bookings.ts`, `edit-request.ts`, the routes and `system-reads` | A cheaper class inside 24 h is never saved. |
| W4 | The 24 h line is typed in SQL, not read from Settings. `settings.modification_deadline_hours` exists and is copied into each snapshot's policy, but nothing compares against it. | `MIG:655`; `packages/db/supabase/migrations/20260823000004_settings.sql:60`; `apps/web/lib/checkout/lock-to-rpc.ts:97, 118`; a search of `apps/web/lib` and `apps/web/app` finds only places that read or store it | The owner's setting has no effect on any edit today. |
| W5 | The copied snapshot keeps the OLD class id and one "transfer" line. | `MIG:383, 399-407` | After a class change the booking's snapshot would still name the old class; the receipt (`apps/web/lib/checkout/confirmation-receipt.ts:188-189`) and the manage-booking money block (`apps/web/lib/checkout/manage-money.ts:5-6`) are built from snapshot lines, so extras, voucher and VAT rows would vanish. |
| W6 | `acceptPaidEdit` refuses when the Stripe key is a live key (`stripe-test-only`). | `ER:128-131` | The whole accept path is off for live money. Known pre-launch item; belongs to the security session (section 6). |
| W7 | No customer mail for "pay the difference" or "your class changed". | 1.4 | Owner decision 12. |
| W8 | The staff-made branch looks the booking up with a plain `select … from public.bookings` inside `asSystem`. The system role has no table rights on live (42501). | `ER:104-116, 146`; `packages/db/supabase/migrations/20260930210000_system_role_narrow_reads.sql:3-8`; the staff-safe lookup already exists: `apps/web/lib/ops/resolve-booking-id.ts:1-23` | The branch Option A needs would fail on live until the lookup is swapped. Read from code, not run. |
| W9 | The routes pass `klass` straight into `vehicle_class_slug` without turning "Business" into `mercedes-benz-v-class`. | `edit-accept/route.ts:54, 66`; `MIG:141-147`; the translator exists: `apps/web/lib/ops/class-slug.ts:32-35` | A display name would be ignored without a word. |

---

## 2. What `updateBooking` does today on a PAID booking

Source: `BW:187-270`, called from `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts:111-129`.

| Field | What happens | Evidence |
|---|---|---|
| Unpaid booking | Refused with `unpaid`, HTTP 409. Nothing written. | `BW:204-211`, `route.ts:126` |
| Name, e-mail, phone, note | Written in place on `bookings`; an absent value keeps the stored one. | `BW:213-222` |
| Pickup text, drop-off text, flight | Written in place on the first leg. Text only: no address lookup, no new distance. | `BW:224-226, 235-240` |
| Date and time | `scheduled_local` and `scheduled_at` written in place (Zurich wall clock). | `BW:229-231, 241-245` |
| Class (`klass`) | `liveClassSlug()` turns a display name or slug into the live slug; `vehicle_class_id` is overwritten in place. Unknown text or "First" keeps the stored class, silently. | `BW:227-228, 246-252`; `apps/web/lib/ops/class-slug.ts:9-16, 32-35` |
| Passengers, bags | Written in place; no capacity check. | `BW:232-233, 258-267` |
| Re-price | None. Snapshot and payments untouched. | `BW:187-270` |
| Event | None. No `booking_events` row. | `BW:187-270` |
| E-mail | None. The route answers `jsonOk({ id })`; its only mail is the review request after complete / no-show. | `route.ts:34-54, 111-129` |
| Role | `asStaff`, direct table writes. | `BW:195` |

Plain words: if the dashboard sent `klass`, a paid Economy trip would become Business (or the reverse) at the old price, with no entry in the history and no mail. The form already sends pickup, drop-off, date and time, and those are changed the same way today.

---

## 3. What the Edit form sends today and what the class field is bound to

| Point | Today | Evidence |
|---|---|---|
| Who sees Edit | Paid and not cancelled. An unpaid trip shows "Unpaid trip — Cancel and create a new trip." | `DETAIL:83-84, 243, 558-560, 1041-1042` |
| Control | A free-text `Input`. There is no options list. | `DETAIL:200` |
| Label | "Vehicle class" / "Fahrzeugklasse" / "Classe du véhicule" / "فئة المركبة" | `DETAIL:200, 533, 577, 651, 700, 972` |
| Value | `edit.klass` | `DETAIL:200` |
| Pre-fill | `booking.vehicle || booking.klass || ''` — the assigned fleet vehicle wins. | `DETAIL:787` |
| `booking.vehicle` | `"<plate> · <model>"` of the assigned vehicle | `apps/web/lib/ops/bookings-map.ts:347-350, 395` |
| `booking.klass` | Economy / Business / Van luxury | `apps/web/lib/ops/bookings-map.ts:128-132, 362, 394`; `class-slug.ts:18-25` |
| On change | writes `state.edit.klass` | `DETAIL:779-782, 1102` |
| On Save | PATCH with customer, email, phone, pickup, dropoff, dateIso, time, pax, bags, flight. `klass` is not in the body. | `DETAIL:1112-1130` |
| After Save | Board reload, form closed. Nothing says the class was dropped. | `DETAIL:1130-1137` |

The "pre-fills with the assigned fleet vehicle" claim is true. On an assigned booking the field shows plate and model; sent as `klass`, that text would not be recognised and the class would stay (`class-slug.ts:32-35`). The read-only view is right: class at `DETAIL:910`, fleet vehicle apart at `DETAIL:925`.

A class select already exists on New trip: design-system `Select` with `classOptions` (`app/ops/OpsNewTrip.dc.html:45, 127-135, 415`).

---

## 4. How a price for another class on the same trip can be obtained server-side, without the customer

| Source | What it gives | Which price book | Ready today? | Evidence |
|---|---|---|---|---|
| S1. The booking's own saved snapshot, `shown_alternatives` | The NET total of every class for this exact trip (same route, time, pax, bags, voucher), as the customer saw it when booking. Shape `[{ slug, total_rappen }]`; `null` = the class could not take that pax/bags. | The book of the booking day | The data is there for bookings made through the normal flow. No code reads it for this purpose yet. | written at `apps/web/lib/checkout/lock-to-rpc.ts:278` from the lock's `class_totals` (`apps/web/lib/quote/lock.ts:141`); passed to SQL at `packages/db/supabase/migrations/20260827000003_checkout_rpc.sql:124`; copied onto edit snapshots at `MIG:409`. Dashboard New trip goes through the same intent route (`app/ops/OpsNewTrip.dc.html:375`). |
| S2. The same snapshot's lines | The extras the customer ticked with their amounts, the voucher and its rule, the VAT rate | The book of the booking day | Yes, in `price_snapshots.lines` and `policy.extras` | `lock-to-rpc.ts:196-233, 274-277`; line shapes at `apps/web/lib/checkout/checkout-charge.ts:123-152` |
| S3. A fresh quote, as New trip does it | A new lock with all class nets (`POST /api/quote`), then the full charge for lock + class + extra codes (`POST /api/checkout/price`) | TODAY's live book and today's extras list | Yes for a new trip. For an existing booking it needs the two places again, and the quote has a minimum-advance gate that can refuse a trip close to pickup. | `app/ops/OpsNewTrip.dc.html:286, 307`; `apps/web/lib/checkout/price-route.ts:1-6`; gate at `apps/web/lib/quote/pipeline.ts:64, 642-650` |
| S4. The price kernel called directly | `priceQuote(book, settings, input)` returns every class for a trip described by distance, duration, zones, time, pax, bags, extras, voucher | Any book: a staff loader takes a version id (`apps/web/lib/ops/rate-book.ts:437-446`) | Partly. `priceDraftPreview` does exactly this but loads the newest DRAFT book first, so it cannot be used as is. The booking stores zone ids and coordinates on the leg and distance and duration on the snapshot. | `apps/web/lib/ops/draft-preview.ts:115-136, 271-307`; `apps/web/lib/ops/rate-book.ts:823-841`; `packages/db/supabase/migrations/20260823000011_booking_legs.sql` (columns `pickup_lat … dest_zone_id`); `lock-to-rpc.ts:286-287` |
| The quote "reprice" pipeline | Re-signs a lock after a flight number or voucher change | live | Not useful here: it starts from a customer's lock | `apps/web/lib/quote/pipeline.ts:857-1018` |

The one function that turns a class net into the amount charged — net + ticked extras − voucher, then VAT — is `checkoutCharge` (`apps/web/lib/checkout/checkout-charge.ts:73-166`). It is pure and takes the extras list as an argument, so it can be fed the extras and amounts saved on the booking's snapshot (S2) or today's list. For a percentage voucher the saved class net is already after the voucher; checkout grosses it up before calling `checkoutCharge` (`apps/web/lib/checkout/intent.ts:475-481`). A class-change price must do the same.

**Answer:** yes, the saved snapshot already holds the totals of the other classes (S1), as nets. S1 + S2 + `checkoutCharge` give "what this customer would have paid for the other class on the day they booked" with no address lookup and no new pricing rule. "Today's prices" needs S3 or S4 and more code.

---

## 5. Design options

### Option A (recommended) — the staff class change becomes a staff-made paid-edit request

One money path, the one that exists. What must be built:

| # | Piece | Files | Migration? |
|---|---|---|---|
| A1 | Class field becomes a design-system `Select` with the three classes, pre-filled with the CLASS (not the vehicle). Values are the display names; the server maps them with `liveClassSlug`. | `DETAIL` (markup `:200`, `snapshotEdit :787`, render values), its four-language table `DETAIL:533-700` | no |
| A2 | Price step: a pure function "class change charge" built from the booking's saved snapshot (S1 + S2) through `checkoutCharge`. It first re-computes the CURRENT class the same way and refuses if that does not equal what is on the snapshot (old bookings, airport fee inside the fare line). Returns old amount, new amount, difference, new lines. | new file in `apps/web/lib/ops/`; imports (no edit) from `apps/web/lib/checkout/checkout-charge.ts` and `lock-to-rpc.ts` | no |
| A3 | Preview route for the dashboard: given booking and new class, answer old price, new price, difference, and why not when refused. Read-only. | new `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/class-change/route.ts` + the dual-mount re-export under `apps/web/app/api/staff/bookings/[id]/class-change/route.ts` (pattern: `apps/web/app/api/staff/bookings/[id]/edit-accept/route.ts`) | a narrow definer read for the snapshot if staff RLS cannot read what is needed (not checked) |
| A4 | Confirm step on the dashboard before anything is written: "Economy → Business, price then, price now, difference". Then one call that makes and accepts the staff request. | `DETAIL` `saveEdit :1112-1138` and a confirm sheet | no |
| A5 | `acceptPaidEdit`: look the booking up with `resolveStaffBookingId` (W8), map the class with `liveClassSlug` (W9), use A2 instead of the lock (W1). | `ER:143-207`; `edit-accept/route.ts` | no |
| A6 | New snapshot function that writes the NEW class id and the real lines, so the receipt stays whole (W5). New function name, new file; the old migration is not edited. | new migration after `20261007100000` | **yes** |
| A7 | `booking_edit_request_accept`: difference against everything paid so far minus refunds (W2); cheaper branches per owner decision 4 and 5 (W3, W4). `create or replace` in the new migration. | same migration | **yes** |
| A8 | The in-place PATCH stops changing the class: `klass` leaves `updateBooking` and the PATCH route. | `BW:42, 227-228, 246-252`; `route.ts:123` | no |
| A9 | Customer notice per owner decision 12. | `packages/emails/src/*`, `apps/web/lib/lifecycle/notify-lifecycle.ts` or a resend of the confirmation through `apps/web/lib/ops/voucher.ts:24` | no |
| A10 | Tests: section 7, "must change" and "missing" lists. | `apps/web/lib/ops/*.test.ts`, `packages/db/supabase/tests/booking_edit_requests.test.sql` | — |

What already works and is reused unchanged: the pending-edit panel with Accept / Refuse, "Open Stripe payment page", "Copy payment link" (`DETAIL:227-238`); the extra settle (`MIG:895-1090`, `settle.ts:540-556`); the dashboard counter "Pending edits" (`app/ops/OpsDash.dc.html:289, 327`); the money read that keeps original and extra apart (`apps/web/lib/ops/bookings.ts:141-151`); the must-fix mail.

Cost and risk: one migration, touches the security session's area on the cheaper branch (section 6), and the accept path is off for live keys until W6 is lifted by that session.

### Option B — direct staff re-price, class changes at once, money follows

A new route writes the class and the new snapshot immediately, then opens an extra-fare session or notes a refund.

| Must be built | Why |
|---|---|
| Everything in A1–A4, A6, A8–A10 | same price step, same screen, same snapshot problem |
| A new "amount still owed" state for a PAID booking: columns, board read, badge, reminder, what happens at pickup if unpaid | No such state exists. A paid booking is paid (`apps/web/lib/ops/bookings.ts:141-151`, `bookings-map.ts:352-361`); the machine avoids the state by not changing the trip until the extra is captured (`MIG:640-654`). |
| A second settle branch for an extra payment that is not tied to a pending request | `checkout_extra_payment_settle` finds the request by session id and applies its payload (`MIG:936-944, 1062-1069`) |
| A second refund-due path | duplicates plan 20-10 |

More new state, a booking that can be in Business with Economy money, and it contradicts 08 D-67 ("trip stays as-is until that extra is captured"). Only worth it if the owner wants the class to change before the customer pays (owner decision 1).

### Option C — what the code offers that is simpler

| Variant | What it is | Verdict |
|---|---|---|
| C1. "Cancel and create a new trip" | The rule the dashboard already shows for unpaid trips (`DETAIL:558-560`, 08 D-70). For a paid trip: cancel, refund by hand, book again in the new class through New trip, which prices, mails and takes payment with code that exists. No new pricing code. | Contradicts today's owner answer ("make the change work"). Useful only as the fallback for the cases the owner rules out or the price step refuses (old snapshot, no saved class totals, class that cannot take the pax). |
| C2. Class in place + money by hand | Send `klass` on the PATCH, add an event, and leave the difference to the admin: a cheaper class → the Refund button with an exact amount exists (`refund/route.ts:3-7`, admin only); a dearer class → there is NO tool to charge an extra on a paid booking outside the edit machine. | Half a feature, and not a re-price. Not recommended. |

### Owner decisions (one line each, plain words; each becomes one question with one example)

Already answered earlier and only to be confirmed are marked (confirm).

| # | Question | What the code does today / earlier decision |
|---|---|---|
| 1 | Dearer class: must the customer pay the difference BEFORE the booking shows the new class? | Yes today: trip unchanged until the extra is captured (`MIG:640-654`; 08 D-67). (confirm) |
| 2 | Dearer class: how does the customer pay — staff type the card on the Stripe page, staff copy a link and send it themselves, the site e-mails the link, or all of these? | First two exist (`DETAIL:233-237`). An e-mailed link does not exist. |
| 3 | Dearer class, not paid: how long does the payment stay open, and what then? | 24 h typed in code (`ER:374`); afterwards the request stays pending with a dead link and the class stays as booked. |
| 4 | Cheaper class: is the difference refunded by hand (admin presses Refund, as decided today for cancels), automatically when staff accept, or not at all? | Code: automatic when more than 24 h before pickup (`ER:278-298`, 08 D-68). Today's refunds-by-hand decision says nothing goes to Stripe without his click. The two disagree. |
| 5 | Cheaper class close to pickup: is there a point after which a cheaper class gives no money back? | Code: a 24 h line typed in SQL (`MIG:655`), and inside it the change is never saved (W3). |
| 6 | Which prices: those of the day the customer booked, or today's live price book? Example: booked in August at the August book; book changed since. | No rule in code. Booking-day prices are in the saved snapshot (S1, S2) and need the least code. Today's prices need S3 or S4. |
| 7 | Extras on the booking (child seat, …): stay on the booking at the amount already paid? And an extra the owner has deleted since? | No rule. With booking-day prices they stay as paid. P4 (deleted extras) is a separate job on this same branch. |
| 8 | Voucher on the booking: does it also apply to the new class? A percentage voucher then takes a different amount off; a fixed one the same. | No rule. The saved class totals are already after the voucher (`apps/web/lib/checkout/intent.ts:475-481`). |
| 9 | Unpaid booking: keep "Cancel and create a new trip", no class edit? | Yes today (`DETAIL:1041-1042`, `BW:204-211`, 08 D-70). (confirm) |
| 10 | A driver and vehicle of the old class are already assigned: refuse the change until staff unassign, unassign automatically and tell the driver, or keep the assignment and warn? | Code checks seats and bags only, never the class (`MIG:156-164`; assign: `packages/db/supabase/migrations/20260910164004_ops_assign_leg.sql:109-110`). An unassign mail exists (`packages/emails/src/ChauffeurUnassignEmail.tsx`). |
| 11 | The new class cannot take the passengers or bags (five people, Economy): refuse the change with a clear message? | The saved total for such a class is empty (`lock.ts:141`), so there is no price to offer. (confirm) |
| 12 | What does the customer receive: the confirmation again with the new class and price, a new short "your booking changed" mail (his wording, four languages), or nothing? And a mail asking for the difference? | Nothing is sent today for a class change, an extra request or an extra payment (1.4). |
| 13 | Is the driver told when the class changes and he stays assigned? | Only the time-change mail reaches the driver (`ER:599-611`). |
| 14 | Time limit: may staff change the class up to pickup, or only until the "modification deadline" in Settings? Does that limit bind staff or only customers? | The setting exists and nothing enforces it (W4). |
| 15 | Who may do it: every dispatcher, or admin only? | Accept is any staff (`edit-accept/route.ts:34`); Refund is admin only (`refund/route.ts`, `withAdmin`). |
| 16 | A customer's time-change request is waiting on the same booking: block the class change until it is accepted or refused? | Today a new request silently replaces the waiting one (`MIG:478-489`). |
| 17 | May the class be changed a second time after an extra was paid? | Allowed by code, priced wrongly (W2). |
| 18 | Separate question, not this job: pickup, drop-off, date and time are changed on a paid trip with no re-price today. Same treatment later? | Section 2. 08 D-66 said "reprice with the same quote engine". |

---

## 6. Files other sessions own, and where this job would touch them

| Area | Owner (per the brief and `.planning/prompts/04-phase-26.2-audit.md:19-30`) | Touched by this job? |
|---|---|---|
| Class cards (`VehicleCard`, `ClassSection`) | 26.4.2 / class-photo session | No. The dashboard uses the design-system `Select`, as New trip does (`app/ops/OpsNewTrip.dc.html:45`). |
| `apps/web/app/[locale]/checkout/checkout.css` | same | No. |
| consent, banner, `lib/meta` | Phase 27 | No. |
| `apps/web/tests` | 26.0 | **Yes, if specs must change or be added:** `apps/web/tests/integration/ops-detail-hosted-pay.spec.ts:119, 138` (pending edit with an open extra payment), `ops-dc-customers.spec.ts:105`. Unit tests next to the code in `apps/web/lib/ops/` are 26.2's own. Prefer unit tests; ask the control session before editing a spec. |
| `.github`, `middleware.ts`, `worker.ts`, `lib/seo`, `app/home` | 26.0 / SEO / 26.4.2 | No. A new staff route needs no allow-list entry: the existing ones are found only in their route files and tests. |
| `app/vamos-locale.js` | site-speed session | No. |
| `app/vamos-i18n-dict.js` | shared, append only | Probably no: `DETAIL` keeps its own table. Only if a new customer-facing string lands on a mock page (decision 12). |
| `apps/web/lib/checkout/*`, `apps/web/lib/pricing/*`, `apps/web/lib/quote/*` | 26.4.2 / 26.5, "report only, no edit" | **Imports only** in Option A (`checkoutCharge`, `snapshotLinesFromCharge`). An edit to `settle.ts` is not needed. If the owner picks "today's prices" (decision 6), S3/S4 may need changes here → control session first. |
| Refunds by hand, `apps/web/lib/lifecycle/paid-cancel.ts` | security session, plan 20-10 (worktree `vamos-wt/phase-20`, branch `fix/phase-20-refunds-by-hand`) | **Yes, in substance.** The cheaper-class branch is a refund: the automatic Stripe refund at `ER:278-298` is exactly what decision 1 of refunds-by-hand removes for cancels. `BW:13` imports `applyStripeRefund` from `paid-cancel.ts`. The "Refund due" state, the admin Refund button and P2 (refund across both payments, which W2 and decision 17 depend on) are theirs. Build the cheaper branch after 20-10 and P2 land, or hand them the SQL. |
| `sk_live_` refusal (`ER:128-131`) | security session (pre-launch item) | **Yes.** Not to be removed by this job. |
| Pay-token migrations (`20261005100000_manage_token_purpose.sql`, `fix/phase-20-erased-pay-link`) | security session | No, as long as the extra-fare link stays the Stripe session URL (`ER:667-689`). **Yes** if decision 2 asks for an e-mailed link through `/checkout/pay/<token>`. |
| `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts` | 26.2 area, but batch B1 of the security session (`fix/phase-20-batch-b1`, handed over, not yet on main) changes the same PATCH handler (e-mail check before `updateBooking`) | **Collision risk** with A8. Bring main in after B1 lands, before touching this file. |
| `packages/db/supabase/migrations` | database is report-only for 26.2; "a finding becomes a proposed new migration" | **Yes**, one new migration (A6, A7). Timestamp after `20261007100000`; the security session has `20261005120000` and `20261005130000` in flight. Applied on hosted by the control session only. |
| `packages/emails`, `apps/web/lib/ops`, `apps/web/app/[locale]/(ops)`, `app/ops/*.dc.html` | 26.2's own area | Yes, freely. |
| `app/pages/manage-booking.dc.html` | shared | Only if the customer must see "class change waiting for payment" there (decision 12). |

Main is one commit ahead of this worktree (`ac01b413`, the refunds-by-hand decision file). Bring main in before planning text quotes it.

---

## 7. Tests that pin today's behaviour

| File | Test name | What it pins | Effect of Option A |
|---|---|---|---|
| `apps/web/lib/ops/bookings-write.test.ts:157-194` | "updateBooking class edit (D-14)" › "resolves Economy, Business and Van luxury to the live slugs", "accepts a live slug and keeps the stored class for First" | `updateBooking` writes the class in place | **Must change** (A8) |
| `apps/web/lib/ops/customers-board.test.ts:92-105` | "OpsDetail Cancel recaps then PATCHes cancelled; History tab is gone" | `saveEdit` uses PATCH and its text must NOT contain `edit-accept`; the mock equals its public twin | **Must change** if the class call lives inside `saveEdit` (A4) |
| `apps/web/lib/ops/ops-dc-u08.test.ts:225-262` | "OpsDetail edit form save" › "sends the contact under the names PATCH … reads", "an emptied contact field is left out…" | every key of the PATCH body is one the route reads; extracted by a regex on the `saveEdit` source | Regex breaks if `saveEdit` is restructured |
| `apps/web/lib/ops/class-slug.test.ts:6-46` | "liveClassSlug (D-14)", "classDisplayName (D-14)" | name ↔ slug mapping | Stays |
| `apps/web/lib/ops/class-labels.test.ts:41-49` | board rows read Economy / Business / Van luxury | `klass` display name | Stays |
| `apps/web/lib/ops/edit-request.test.ts:25-241` | "fareDifferenceRappen", "extraCheckoutMetadata", "unpaidFieldPatchRefused", "shouldExpireOldExtraSession", "mapEditSqlError", "08-09 must-fix mail", "08-07 file proofs" (`:83-118`, text matches on `ER`, `settle.ts`, `MIG`, `DETAIL`), "08-10 customer paid-edit request", "09-10 time-change request/confirm" | the machine's pure parts and file-text proofs | File-text proofs may need new patterns |
| `apps/web/lib/ops/edit-request-time.test.ts:41-58` | "requestCustomerTimeChange Zurich instant" | time conversion | Stays |
| `apps/web/lib/ops/staff-hosted-pay.test.ts:208-250` | "extra-fare payment on a hosted session" › "acceptPaidEdit creates a hosted kind=extra session for the difference…", "staffExtraPayUrl returns the open kind=extra hosted URL…", "…says no-session…" | extra session shape and URLs | Stays; extend |
| `apps/web/lib/ops/phone-booking.test.ts:95`, `apps/web/lib/ops/edit-request.test.ts:111` | `DETAIL` contains `'extra-pay'`, `edit-accept` | text presence | Stays |
| `apps/web/lib/ops/ops-detail-i18n.test.ts:162-184` | "OpsDetail T table stays in parity across en, de, fr, ar" | every new key in all four languages, no "ß" | New strings must pass |
| `apps/web/lib/checkout/settle.test.ts:777` | "never refunds an ops extra session or an unpaid one" | settle leaves an extra session alone | Stays |
| `packages/db/supabase/tests/booking_edit_requests.test.sql` (27 checks) | "unpaid upsert refused", "paid higher-fare upsert", "second upsert supersedes requested row", "accept higher fare → extra_required", "extra snapshot total_rappen is the difference (11-8)", "extra settle succeeds", "extra settle does not rewind pending→paid→confirmed", "same-price accept applies with no extra pay", grants | the SQL machine for higher and same price | Extend in the new migration's test |
| `apps/web/tests/integration/ops-detail-hosted-pay.spec.ts:119, 138` | "pending edit with an open extra payment shows the Stripe page and copy controls (lang)", "Open Stripe payment page asks the extra-pay route…" | dashboard pending-edit panel | Stays (26.0's folder) |

**Missing today (no test anywhere):** a class change through the edit machine (`vehicle_class_slug` is matched in no test of the machine); the cheaper branches `refund_immediate`, `refund_click` and `booking_edit_refund_record` (the word "refund" does not occur in `booking_edit_requests.test.sql`); a second edit after a paid extra (W2); the pre-fill of the class field.

### Validation map for the plan

| Behaviour | Test type | Command (touched files only; the lead runs the full gates once) |
|---|---|---|
| Class-change charge from a saved snapshot: dearer, cheaper, same, with extras, with a percentage and a fixed voucher, class not offered, snapshot that does not reconcile | unit (pure) | `pnpm --filter web exec vitest run lib/ops/<new-file>.test.ts` |
| PATCH no longer changes the class | unit | `pnpm --filter web exec vitest run lib/ops/bookings-write.test.ts` |
| Staff-made request: lookup as staff, slug mapping, outcome per difference | unit with the recording `sql` tag used in `staff-hosted-pay.test.ts` | `pnpm --filter web exec vitest run lib/ops/staff-hosted-pay.test.ts lib/ops/edit-request.test.ts` |
| Select pre-filled with the class; Save with a changed class asks for confirmation | unit on the mock source (pattern of `ops-dc-u08.test.ts`), after `node scripts/sync-dc-mock-to-public.mjs` | `pnpm --filter web exec vitest run lib/ops/ops-dc-u08.test.ts lib/ops/customers-board.test.ts lib/ops/ops-detail-i18n.test.ts` |
| New SQL: snapshot carries the new class and real lines; difference against all paid; cheaper branches | pgTAP, local stack on this worktree's own shifted ports | `pnpm --filter @vamos/db run test:db` (not run in this research: no Docker) |
| Real money | manual, after deploy | one 4242 payment for a dearer class, then read `booking_payments` by status (owner rule 8) |

---

## Pitfalls for the planner

1. **Do not reuse the lock path for the new price.** Net versus charged (W1). Compare like with like: both through `checkoutCharge`.
2. **Self-check before offering a price.** Re-compute the current class from the saved snapshot; if it does not equal the snapshot total, refuse and say why (old bookings, airport fee inside the fare line — control board "Known on live").
3. **Send the slug the SQL expects.** `booking_edit_apply_payload` keeps the old class without a word when the slug is unknown (`MIG:141-147`). Map with `liveClassSlug` and refuse `null`.
4. **No raw table SQL under `asSystem`.** Use `resolveStaffBookingId` or a definer function (W8).
5. **The snapshot's lines must sum to its total** (reconcile trigger, `lock-to-rpc.ts:189-191`); the voucher line is stored with amount null. Use `snapshotLinesFromCharge`.
6. **The PATCH route is changing on another branch** (batch B1). Bring main in first.
7. **Mock and public twin.** `customers-board.test.ts:94` compares `app/ops/OpsDetail.dc.html` with `apps/web/public/app/ops/OpsDetail.dc.html`; run the sync script.
8. **Nothing goes to Stripe without the owner's click** unless he answers decision 4 otherwise.
9. **Never a typed CHF amount** in a fixture a reviewer sees; synthetic rappen only.

## Security notes (ASVS level: what applies)

| Area | Applies | Control already in the codebase to keep |
|---|---|---|
| Access control | yes | `withStaff` / `withAdmin` on every staff route; SQL functions `security definer`, `search_path = ''`, EXECUTE to `vamos_system` only (`MIG:192-198`); RLS on `booking_edit_requests` (`MIG:47-60`) |
| Input validation | yes | the browser sends a class name, never an amount (as `price-route.ts:15` forbids amount fields); the server computes every number |
| Payment integrity | yes | one succeeded payment per snapshot (`MIG:14-16`); Stripe idempotency keys (`ER:289, 373`); settle verified by webhook signature (existing) |
| Audit | yes | `booking.modified` and `price.repriced` events in the same transaction as the change (`MIG:166-188`) — the PATCH path writes none, which is the gap |

| Threat | Mitigation |
|---|---|
| Staff client sends a price or a difference | never accepted; price step is server-side from the saved snapshot |
| Class changed with no payment (today's PATCH) | remove `klass` from the in-place write (A8) |
| Double charge of an extra on a second change | difference against all paid minus refunds (A7) |
| Refund sent without the owner's click | cheaper branch ends in "Refund due", not in a Stripe call (decision 4) |

## Package audit and environment

No new package is needed. Nothing to install, nothing to audit. Environment check skipped: the job uses only what the repo already has.

## Assumptions

| # | Assumption | Section | If wrong |
|---|---|---|---|
| A1 | Bookings made through the normal flow on live carry `shown_alternatives` with a total for each of the three classes. Read from code (`lock-to-rpc.ts:278`), not from live rows. | 4, Option A | The price step refuses those bookings; fallback C1 or S4. |
| A2 | Re-computing the current class from the saved snapshot through `checkoutCharge` reproduces the charged amount to the rappen, percentage vouchers included. Not run. | 5 A2 | The self-check refuses; vouchered bookings need their own rule. |
| A3 | Staff RLS lets `asStaff` read the snapshot fields the preview needs (the board read already selects `snap.lines`, `snap.policy`, `snap.coupon_code`: `apps/web/lib/ops/bookings.ts:96-98`). `shown_alternatives` is not selected there today. | 5 A3 | One narrow definer read in the migration. |
| A4 | The VAT rate of the new price is the rate saved on the booking's snapshot. | 5 A2 | Becomes owner decision 19. |
| A5 | The phase 08 decisions D-66 to D-75 still stand unless the owner says otherwise; the closure file closes phases, it does not withdraw their decisions. | User constraints | More questions for the owner. |

## Not verified

- Nothing was run: no unit test, no pgTAP, no local database, no Worker. Every statement about behaviour is from reading source and migrations.
- Live data was not read (no hosted SQL): whether real bookings carry `shown_alternatives`, how many have a voucher or extras, whether any `booking_edit_requests` row exists on live, whether any booking has two payments.
- W8 (42501 on the staff-made branch) is inferred from `ER:104-116` and the header of `20260930210000_system_role_narrow_reads.sql`; not reproduced.
- Whether the migrations on main after `c628d404` or on the security branches change any `booking_edit_*` function. At `c628d404` only `20260910175309` defines them; `20260911234512` adds a comment; `20260930210000` adds narrow reads beside them.
- The exact state of plan 20-10 and P2 in the security session's worktree (their branch has no code diff against main yet; only the decision file).
- The Stripe-side look of the extra-fare page and whether TWINT is offered on it.
- The 08-CONTEXT decisions were read at lines 109-121 only; the rest of that file was not read.
- `apps/web/lib/ops/refund.ts`, `refund-map.ts` and `paid-cancel.ts` were searched, not read in full.
- Layout of the confirm step at 1440 / 1024 / 768 / 390 and in Arabic: a design task, no UI-SPEC exists for it.

## Sources

All primary, all in this worktree at `c628d404` unless noted: the files cited inline; `.planning/CONTROL-BOARD.md:60, 105`; `.planning/prompts/00-common-rules.md`, `04-phase-26.2-audit.md`; `.planning/phases/26.2-codebase-audit-bug-fix-simplify/26.2-REVIEW-08.md:41`; `.planning/phases/20-security-audit-fixup/20-10-PLAN.md:1-40`; `.planning/decisions/2026-09-30-refunds-by-hand.md` (from main `ac01b413` via `git show`); `git diff main...fix/phase-20-batch-b1` for the PATCH route.

**Valid until:** the next ship that touches `apps/web/lib/ops/edit-request.ts`, the PATCH route, or a `booking_edit_*` function — in practice until batch B1, plan 20-10 or P2 lands. Re-check sections 5 and 6 then.
