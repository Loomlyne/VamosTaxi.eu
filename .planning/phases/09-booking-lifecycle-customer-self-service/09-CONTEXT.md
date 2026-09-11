# Phase 9: Booking Lifecycle & Customer Self-Service - Context

**Gathered:** 2026-09-12
**Status:** Ready for planning
**Source:** Owner discuss 2026-09-12 (replaces 2026-08-25 research-express CONTEXT). Phases 7 and 8 are closed. Do not treat 7/8 as unexecuted.

<domain>
## Phase Boundary

A paid booking (Phase 7) that Ops can assign (Phase 8) now lives the rest of its life: customer cancel + Stripe refund, guest manage-booking + signed-in ticket, time-change (Ops confirm), flight-number edit, 24h reminder + assignment mail, Ops-marked complete/no-show, review request, OpsDash refunds on Income/Expenses/Net.

Return is out of V1 (one-way). No driver app. No auto-dispatch. No AeroDataBox. No SMS. Legal cancellation numbers in this phase are the locked windows below — not invented CHF, not leftover TBC for these windows.

Requirements: LIFE-01 … LIFE-08. LIFE-02 tiers from ADR-014 (100/75/0) are **superseded** by the 24h / 6h windows in D-02.

**In scope:**
- Same ticket chrome at `/manage-booking?token=` (guest) and `/confirmation/{ref}` (signed-in)
- Cancel + Stripe refund + refund states + OpsDash money
- Time-change request/confirm; flight-number edit
- Reminder + assignment + cancel/time/flight/refund-failed mail
- Review form + request mail + profile notification + Ops publish
- Ops marks Completed / No-show (no auto no-show sweep)
- Status roll-up still this phase’s SQL (U21) where missing

**Out of scope:**
- AeroDataBox auto flight track (later)
- Chauffeur app / auto-dispatch / Phase 17 chauffeur profile
- Phases 10–11, 13–16
- Creating the `bookings@vamostaxi.site` inbox (use the address; do not provision MX unless owner asks)
- Invented legal beyond the locked cancel windows
- Live `vamostaxi.eu` DNS / live Stripe keys (Phase 11)
</domain>

<decisions>
## Implementation Decisions

### Cancel + refund
- **D-01:** Customer Cancel lives on the open ticket only — both guest manage-booking (email token) and signed-in `/confirmation/{ref}`. Not on the `/bookings` list row. Legal `/cancellation` is real policy matching these windows (never fake). Actual Cancel control is the ticket, not a second legal form.
- **D-02:** Windows vs original pickup **Europe/Zurich** (not shifted time, not phone TZ):
  - **> 24h:** trip cancelled immediately; **automatic full Stripe refund** of captured amount.
  - **24h–6h:** trip cancelled immediately; refund **Pending Ops**; default **100%**; Ops may change % or CHF.
  - **6h through pickup:** trip cancelled immediately; **0 refund**; honest warning on the confirm sheet; Ops can still refund anyone anytime.
  - **After pickup (not Completed):** they can still Cancel; **0 refund**; warning; driver does not pick up / goes home; Ops can still refund.
  - **Completed:** hide customer Cancel. Ops-only refund.
  - **No-show (Ops-marked):** hide customer Cancel. Ops-only refund.
- **D-03:** One confirm sheet with the refund rule for that window, then Cancel. No type-CANCEL. No undo — new booking if they still want the ride.
- **D-04:** 100% = **what Stripe captured** (fare + extras + VAT, after coupon). Example: 100 with 20% coupon → refund 80. VAT is refunded with the amount (not withheld).
- **D-05:** Refunds the **Stripe payer’s original payment method** (pay-link mum/son → mum’s card). Charge stays CHF.
- **D-06:** After success they stay on the **same ticket**, status **Cancelled**, plus refund line. Guest link still opens that cancelled ticket (not 404) with refund status: **Pending Ops → Processing Stripe → Refunded** (amount + payout time) or **Failed**.
- **D-07:** Stripe payout copy: card country if Stripe provides it, else Switzerland. Real Stripe rules, not invented days. V1 write: after `createRefund`, retrieve the Refund expanded; persist `charge.payment_method_details.card.country` (else `CH`) and `balance_transaction.available_on` on `booking_refunds`. Ticket prints those fields only — never invented day counts, never “3–5 business days”.
- **D-08:** Stripe refund fail: stay **Cancelled**, refund **Failed**, honest error, **email Ops**, Ops retries in Stripe. Never fake success. Never un-cancel the trip.
- **D-09:** Unpaid (never captured) **never occupies calendar**. Cancel **hard-deletes** it everywhere. Manage link after that: honest gone / not found. Paid booking at the same slot wins.
- **D-10:** Paid cancel **frees the Ops calendar/board slot**. Customer ticket remains Cancelled. Status word stays **Cancelled**; refund is a money line, not a `refunded` status.
- **D-11:** Mails on cancel: customer + `bookings@vamostaxi.site` + assigned chauffeur (email only). Language = **booking locale**.
- **D-12:** V1 Ops is **one admin**. Any admin who can open the booking can set amount, retry Failed, refund remaining captured amount **as many times as needed until 0**. No staff-role split.
- **D-13:** Ops dashboard cancel uses the **same money rules**. Ops can still refund any person at any time (including after pickup / completed).
- **D-14:** If they cancel while the assigned chauffeur is **On shift** for that trip: same rules + chauffeur mail + **urgent Ops ping**. V1 On shift = `assigned_chauffeur_id IS NOT NULL` (this booking). Assigned → chauffeur mail + Ops copy subject `URGENT`. Unassigned → non-urgent Ops copy, no chauffeur mail. No shift table in Phase 9 (Phase 17 roster deferred).
- **D-15:** Confirm-sheet copy set A (D-02). Language = booking locale.

### OpsDash money
- **D-16:** Existing Income / Expenses / Net. Income = captured fares. **Refunds sit in Expenses.** Net drops. Each refund line: customer, booking, amount. Period filter: **today / this week / this month / all time**.

### Reviews
- **D-17:** After Ops marks **Completed** or **paid no-show**, send review-request email immediately. Also: confirmation ticket once Completed; signed-in **profile notification**. Guest without account reviews from the email `/review` link. V1 profile notification is **not** a new inbox: `GET /api/account/bookings` adds `reviewState` (`none | requested | reviewed`) + `reviewHref`. `/account` and `/bookings` show a Review trip chip, then **Reviewed** that stays (D-21).
- **D-18:** They **can** review: paid, refunded, completed, paid no-show. They **cannot** review: unpaid, cancelled. V1: **cancelled never** (even after Stripe refund). Can = captured paid/confirmed/assigned, completed, paid no-show, and completed/no-show after an Ops refund.
- **D-19:** One form, one submit: **company + chauffeur + overall**, each stars (1–5 required) + optional comment. Completed bookings always have a chauffeur — all three rows always. Optional **one photo of the customer themselves**. V1: live `POST /api/reviews/photo` (hashed token or JWT) → `PHOTOS.put` under `reviews/` via `photos.ts` caps; submit stores that key. Not the staff upload route. Not a typed-in key.
- **D-20:** Ops publish/hide like today. Public home shows **overall stars + first name + optional comment + the photo if they added it**. Hidden: off the home, ticket still **Reviewed**.
- **D-21:** `/review` link valid **forever**, still one submit. After submit: thank you on `/review`; ticket shows Reviewed; profile notification becomes a **Reviewed** link (does not disappear).
- **D-22:** Form language = booking locale. No edit after submit.

### Flight delay / time / flight number
- **D-23:** Customer **and** Ops can enter a new pickup time. Customer request does **not** go live until Ops confirms on **ops booking detail** + Dashboard ping. Original time stays until confirm. If Ops refuses: stay original, mail the customer.
- **D-24:** Customer may request a time change **anytime**; always needs Ops confirm. A second request **replaces** the pending one.
- **D-25:** Confirmed time-change mail: customer + `bookings@vamostaxi.site` + assigned chauffeur. Chauffeur is mailed **only after confirm**, not on the request (urgent ping still if On shift cancel — not this path).
- **D-26:** **24h / 6h refund clocks stay on the original pickup** even after a confirmed shift.
- **D-27:** Customer may edit **flight number anytime**, no Ops confirm. Mail `bookings@vamostaxi.site`. Dashboard shows the edit. Assigned chauffeur is mailed.

### Mails
- **D-28:** Assignment mail (name, vehicle, plate) **the moment Ops assigns**. Guest and signed-in get the same templates. Booking locale.
- **D-29:** 24h reminder vs **original pickup Zurich**. Skip if already cancelled/completed. If no chauffeur yet: still send customer reminder **without** driver details **and** remind Ops they have an unassigned booking. If a driver **is** assigned by that 24h mark, also send the driver-details mail. If assigned **after** the 24h reminder already went: send assignment mail now, **no extra 24h**.
- **D-30:** Ops copies of cancel / time / flight / refund-failed go to **`bookings@vamostaxi.site`** (not info@). Do not provision the inbox in this discuss.

### No-show / complete
- **D-31:** **Ops only** marks Completed and No-show. No chauffeur app. **No auto no-show sweep in V1.**

### Same ticket
- **D-32:** Guest manage-booking and signed-in confirmation are **the same ticket chrome**, two URLs. V1: keep both URLs. Guest stays `manage-booking.dc.html` as-is (wired live). Signed-in extends working-tree `BookingVoucher`. Same fields / copy / refund line — **not** one React component, **not** a third voucher, **not** leftover DC.

### Claude's Discretion
None — owner answered the money, mail, and status questions. Planner/researcher may choose SQL/Worker shapes that honour D-01–D-32.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product
- `.planning/REQUIREMENTS.md` — LIFE-01…LIFE-08 (LIFE-02 money windows superseded by D-02)
- `.planning/ROADMAP.md` — Phase 9 goal and success criteria
- `.planning/ADR-014-owner-sitting-2026-08-22.md` — cancellation sitting; windows now D-02
- `.planning/PROJECT.md` — quote → pay → confirmation; no invented CHF

### Schema / cancel RPC
- `packages/db/supabase/migrations/20260823000012_booking_access_tokens.sql` — `manage_booking_cancel`
- `packages/db/supabase/migrations/20260827000001_payment_fx.sql` — refund-tier comment
- `packages/db/supabase/migrations/20260823000010_bookings.sql` — U21 roll-up left for Phase 9

### Live surfaces
- `app/ops/OpsDash.dc.html` — income / expenses / net + refundRappen
- `apps/web/lib/dc-mock-urls.ts` — `/manage-booking`
- `apps/web/lib/ops/voucher.ts` — manage URL with token
- Confirmation ticket (Phase 7) — signed-in `/confirmation/{ref}`
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `manage_booking_cancel` — guest token cancel RPC; refund % still stub
- Confirmation ticket React + DC — signed-in surface for Cancel
- `OpsDash.dc.html` — money cards already subtract `refundRappen`
- Resend confirmation / pay-link mail — same locale + `booking_notifications.dedupe_key` pattern
- Reviews ops publish/hide — Phase 6 APIs; add `booking_id` + customer submit
- R2 photo pipeline (fleet) — one customer review photo

### Established Patterns
- Stripe outside the DB transaction (compute → Stripe → record append-only)
- Guest `vamos_guest` EXECUTE on manage RPC; signed-in uses JWT email / `asCustomer`
- No fixtures; GET fail is an error, not sample rows
- Email language = booking locale

### Integration Points
- `/manage-booking` + `/confirmation/{ref}`
- Ops booking detail (time confirm, flight edit banner, refund retry)
- OpsDash income/expenses/net
- Worker cron/queue for 24h reminder only (no no-show sweep)
- Stripe Refunds API (test mode on staging)
</code_context>

<specifics>
## Specific Ideas

- Coupon example locked: 100 − 20% → refund 80.
- Review photo is **the user themselves**, optional, at most one, public with the published review.
- “Find the name” for Ops copies → owner chose `bookings@vamostaxi.site`.
- Unpaid vs paid at 7pm: unpaid never blocks the calendar.
</specifics>

<deferred>
## Deferred Ideas

- AeroDataBox automatic delay (later; not 9)
- Auto no-show sweep / grace minutes (not V1)
- Phase 17 chauffeur full profile / shifts
- Phases 13–16 Support mail thread (parked)
- Phase 10 consent/Sentry; Phase 11 live DNS
- Provisioning MX for `bookings@` until owner asks
- SMS / WhatsApp transactional (V1 email only)
</deferred>
