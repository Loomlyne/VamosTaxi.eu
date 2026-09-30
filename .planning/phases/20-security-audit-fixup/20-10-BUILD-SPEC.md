# 20-10 BUILD SPEC — refunds by hand

Read at `/Users/koss/Developer/vamos-wt/phase-20`, branch `fix/phase-20-refunds-by-hand` = `origin/main` `ac01b413`.
Sources: `.planning/decisions/2026-09-30-refunds-by-hand.md`, `origin/gsd/phase-20-security-check:.planning/phases/20-security-audit-fixup/20-10-PLAN.md` (incl. the signed picker note).
Nothing was edited, run, built or queried. Every `file:line` below was read, unless listed in D.4 "not verified".

Paths are relative to the repo root. `MIG/` = `packages/db/supabase/migrations/`.

---

## A. What happens today

### A.0 Shared pieces

| Piece | Where | What it does |
|---|---|---|
| Tier | `MIG/20260928150000_refund_review_tiers.sql:107-179` `compute_cancellation_refund` | `> 24 h` → `refund_mode 'auto_full'`, `refund_rappen` = sum of captured `charged_rappen`, percent 100 (157-168). Otherwise, with something captured → `'pending_ops'`, amount and percent `null` (169-172). Nothing captured and ≤ 24 h → `'none'`. **Note:** `> 24 h` with nothing captured also returns `'auto_full'` with 0 (line 158 is tested before the basis). |
| Customer cancel body | `MIG/20260911234758_booking_lifecycle_cancel_refund.sql:122-281` `app.apply_customer_cancel` (only definition) | Cancels legs, recomputes status, then 211-223: `refund_owed_rappen := refund_rappen`; `refund_status := 'pending_ops'` only for mode `pending_ops`, **else `'none'`** ("auto_full stays none until Worker sets processing"). Writes `booking.status_changed` with `refund_mode` in the payload (249-270). |
| Staff cancel body | `MIG/20260928110000_unpaid_cancel_session_expiry.sql:228-392` `ops_cancel_booking` | Same rule at 315-329. Returns `refund_mode`, `refund_rappen`, open checkout session ids. |
| Columns | `MIG/20260911234758…:7-9` | `bookings.refund_status` (check: `none, pending_ops, processing, refunded, failed, declined` — `MIG/20260928150000…:39-40`), `refund_owed_rappen`, `refunded_rappen`. There is **no** `bookings.refund_percent` and no `bookings.refund_rappen`; those names exist only as function outputs and on `booking_refunds`. |
| Refund rows | `MIG/20260823000014_payments_refunds.sql:142-161` `booking_refunds` | One row per refund, `payment_id not null`, `stripe_refund_id text unique` (nullable), plus `payout_country`, `available_on` (`MIG/20260911234758…:21-22`). **Append-only**: update/delete raise (`MIG/20260823000019_append_only.sql:113`, 98-101). |
| Customer-path recorder | `MIG/20260911234758…:508-648` `record_booking_refund` | Records against the **first** captured payment, reason `customer_cancel`, stores payout facts, sets `refund_status 'refunded'`. |
| Admin recorder | `MIG/20260928150000…:201-432` `ops_refund_record` | Idempotent on `stripe_refund_id` (254-275). Against ONE payment; remainder = that payment's `charged_rappen` − its refunds (303-311); above remainder → `refund-exceeds-remaining` (314-316). Always sets `refund_status 'refunded'`; when the status was `pending_ops`, `refund_owed_rappen := refunded` (409-418). Does not store payout facts. EXECUTE `vamos_system`. |
| Decline / reject | `MIG/20260928150000…:457-563` `ops_refund_decide` | `decline` needs `refund_status = 'pending_ops'` (497); sets `declined`, owed 0. Admin only. |
| Stripe-side mirror | `MIG/20260928120000_stripe_refund_dispute_events.sql:80-…` `stripe_charge_refunded_record` | `charge.refunded` for an app refund (`metadata.vamos_source=app`) raises `app_refund_pending` until the app's own row lands (153-158); a Stripe-dashboard refund is recorded as `stripe_dashboard`. |
| Stripe call | `apps/web/lib/checkout/stripe.ts:204-235` `createRefund` | `refunds.create` on the PaymentIntent with metadata `vamos_source, booking_id, payment_id, reason` and the caller's idempotency key. |

### A.1 Guest cancel, more than 24 h before pickup

1. `POST /api/manage/cancel` — `apps/web/app/api/manage/cancel/route.ts:26-62` → `paidCancelGuest` (`apps/web/lib/lifecycle/paid-cancel.ts:353-371`).
2. SQL `manage_booking_cancel` (`MIG/20261005100000_manage_token_purpose.sql:33-83`) → `app.apply_customer_cancel`. Booking is cancelled, `refund_status 'none'`, `refund_owed_rappen` = captured. Returns `refund_mode 'auto_full'`.
3. `finishPaidCancel` (`paid-cancel.ts:289-351`): with `sk_live_` → marks refund failed, mails ops, returns `stripe-test-only` (309-313). Otherwise loads the **first** captured payment (315, `booking_captured_payment`, `MIG/20260930210000…:39-49`), marks `processing` (326), and **calls Stripe itself**: `applyStripeRefund` (196-269) → `createRefund` (217, key `refund:{booking}:{payment}:customer-cancel`, line 333) → `retrieveRefund` → `record_booking_refund` (247-258).
4. Mail: `notifyPaidCancelMails` (155-194) → `notifyCancellation` (`apps/web/lib/lifecycle/notify-lifecycle.ts:137-157`): customer, a copy to the ops address, the chauffeur when assigned. Refund line `full_captured` (`paid-cancel.ts:145-149`) → `cancellation.refundFullCaptured` (`packages/emails/src/CancellationEmail.tsx:24-28`).
5. Response `refundStatus 'refunded'`, payout facts. A Stripe failure → HTTP 502 although the cancel is committed (`route.ts:21,52`); the mock then says "Could not cancel this booking." (`app/pages/manage-booking.dc.html:1009-1013`).

Two captured payments: `refund_rappen` is the sum of both, but the refund is sent against the first PaymentIntent only → Stripe refuses an amount above that charge → `failed`.

### A.2 Signed-in customer cancel, more than 24 h

`POST /api/account/bookings/paid-cancel` → `paidCancelCustomer` (`paid-cancel.ts:377-420`): ownership read as the customer (391-401), then `customer_paid_cancel` (`MIG/20260911234758…:354-402`, refuses an unpaid booking with `unpaid_use_hard_delete`) → same `apply_customer_cancel` → same `finishPaidCancel`. Identical from step 3 of A.1. The Next page uses it at `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx:534-565`.

### A.3 Staff cancel of a paid booking, more than 24 h

`PATCH /api/staff/bookings/:id {status:'cancelled'}` (`apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts:82-91`) → `cancelBooking` (`apps/web/lib/ops/bookings-write.ts:53-181`): unpaid → erase (65-90); paid → `ops_cancel_booking` (104-123), expire open sessions (129-148), then for `auto_full` **refunds automatically** (150-168: first captured payment, `applyStripeRefund`, key `…:ops-cancel`). The result of that call is ignored. It never sets `processing`; with `sk_live_` `applyStripeRefund` returns at line 200-202 without marking anything, so the booking stays `cancelled / none / owed 100 %`. **No mail goes to the customer on a staff cancel** (the route returns right after `cancelBooking`).

### A.4 Cancel inside 24 h (also inside 6 h, and after pickup)

Same entry points. SQL sets `refund_status 'pending_ops'`, owed `null`. `finishPaidCancel` returns at 298-307 with no Stripe call; mail line `pending_ops` → the customer reads **"Pending Ops."** (`packages/emails/src/messages/en.json:82`, same English words in de/fr/ar). Staff cancel: line 150-151, nothing.

### A.5 Admin percent refund

Dashboard `app/ops/OpsDetail.dc.html`: `reviewNeeded = admin && paid && refundStatus === 'pending_ops'` (839) shows the info Alert `reviewTitle/reviewBody`, the % Input (starts empty), Confirm and Decline (298-309). Confirm → `POST /api/staff/bookings/:id/refund {percent}` (1011-1015, 860-879).
Route `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts:48-85` (admin only, dual-mounted by `apps/web/app/api/staff/bookings/[id]/refund/route.ts`) → `refundBooking` (`apps/web/lib/ops/refund.ts:52-193`):
- `sk_live_` → `stripe-test-only` (61-64).
- Loads all captured payments (77-85) but keeps **only `pays[0]`** for the PaymentIntent and the per-payment remainder (88, 99-103); `chargedRappen` is the sum of all (87).
- Amount = `round(captured × percent / 100)` capped at the booking remainder (`refund-map.ts:81-100`); above the first payment's remainder → `refund-exceeds-remaining` (123).
- **Stripe first** (131-150, key `refund:{booking}:{payment}:{kind}:{amount}`), **then** `ops_refund_record` (152-192). If the record fails the route answers an error although the money left.
- On success the route mails "Refund issued" to contact and payer (65-77, `packages/emails/src/refund.ts`).

Cancelled, paid, `refund_status` not `pending_ops`/`declined`: the header shows a "Refund" button (`canFullRefund`, 841, 102-103) that posts `{}` = full remaining (1139), and the danger Alert "Refund due" (`showRefundDue`, 989, 286-288).

### A.6 Post-trip request accept

`postTripEligible` (840) → "Refund" opens the requested panel (310-317) → Accept posts `{postTrip:true}` (1022) → `refundBooking` checks the status (110-113), full remaining, reason `post_trip` (128-129), same Stripe-first order. Reject → `POST …/refund-decision {decision:'reject'}` → `decideRefund` (`refund.ts:204-231`).

### A.7 Retry after "Refund failed"

`refundFailedShown = admin && (local fail flag || refundStatus === 'failed')` (845). "Try again" (1023-1029) re-posts the body kept in component state; after a reload that body is gone and it posts `{rappen: refundOwedRappen}` or `{}`. So a 50 % decision that failed becomes "full remaining" after a reload when nothing was owed. Safety today rests only on the amount-based Stripe idempotency key (valid 24 h at Stripe).

### A.8 Extra-fare payment

A second `booking_payments` row of the same booking: own `stripe_payment_intent_id`, own `snapshot_id` (unique success per snapshot: `MIG/20260910175309_booking_edit_requests.sql:12-18`), linked from `booking_edit_requests.extra_snapshot_id` / `extra_payment_id` (line 30). There is no `kind` column; "extra" is derived by the join `booking_edit_requests.extra_snapshot_id = booking_payments.snapshot_id` (`apps/web/lib/ops/bookings.ts:141-150`). `refund.ts` sums all payments but refunds through the first only (A.5), so the extra fare can never be refunded from the dashboard and "100 %" of a two-payment booking is refused.

### A.9 Other automatic Stripe refunds (not cancel refunds)

`createRefund(` call sites: `paid-cancel.ts:217` (A.1–A.3), `refund.ts:137` (admin click), `apps/web/lib/ops/edit-request.ts:286` (admin accepts a cheaper edit: Stripe first, then record; guarded by `sk_live_` at 128-131), `apps/web/lib/checkout/settle.ts:616` (**automatic** refund of a duplicate / paid-after-cancel charge, no admin click, no `sk_live_` guard). See D.1 Q7.

---

## B. Target design

### B.1 How a > 24 h cancel is represented — decision

**Keep `refund_mode 'auto_full'` as the tier label. On cancel set `refund_status 'pending_ops'` with `refund_owed_rappen` = captured (100 %).** No new status value, no change to the check constraint, no change to `compute_cancellation_refund`.

Why this and not the alternatives:
- A new status (`due_full`) means a constraint change and a new branch in every reader below. Rejected.
- Leaving `'none'` + owed (today's SQL, only dropping the Stripe call) makes the dashboard work untouched, but the customer then sees no refund state at all, and the signed plan says the case "takes the review path with 100 % pre-filled". Rejected.
- Renaming `auto_full` touches SQL tests (`cancellation_refund_d02.test.sql:209-240`, `refund_review.test.sql:166-170`), `voucher-badge.test.ts:78-79`, the manage route's `cancelWindow`, and event payloads, for no behaviour. Rejected; the name is documented as "the full-refund tier".

The one discriminator, everywhere: **`refund_status = 'pending_ops'` and `refund_owed_rappen > 0` = "full refund due, the team sends it"; `pending_ops` and owed `null` = "the team decides".** The cancel response additionally carries `refundMode: 'auto_full'`.

SQL rule (both cancel bodies): `pending_ops` when mode is `pending_ops`, **or** mode is `auto_full` and `refund_rappen > 0`; otherwise `none` (covers the unpaid > 24 h edge in A.0).

Consequences for every reader of `refund_status` / `refund_mode`:

| Reader | Today | After | Package |
|---|---|---|---|
| `paid-cancel.ts:145-149, 298-350` | Stripe for `auto_full` | no Stripe; mail line from mode; returns `pending_ops` + owed | P2 |
| `bookings-write.ts:150-168` | Stripe for `auto_full` | branch removed | P2 (last task, 3 hunks) |
| `api/manage/cancel/route.ts:53-61`, `api/account/bookings/paid-cancel/route.ts:58-59` | pass through | unchanged; `stripe-failed` branches become unreachable, left in place | — |
| `api/manage/booking/route.ts:156-186` | passes status + owed | unchanged (owed is already returned) | — |
| `app/pages/manage-booking.dc.html:1014-1021, 1232` and `app/pages/booking-detail.dc.html:977-984, 1145` | `refundReview = pending_ops` → "Our team decides the refund…" | split on owed; keep `refundOwedRappen` from the cancel response | P3 |
| `app/vamos-manage-ticket.js:179-186` | `pending_ops` → "Pending Ops" | see B.6 | P3 |
| `lib/checkout/voucher-badge.ts:36-64`, `components/booking/BookingVoucher.tsx:276-295` | `pending_ops` → "Refund under review" + owed amount | unchanged code; wording question Q2 | — |
| `ConfirmationClient.tsx:530, 550-558` | `cancelSheetFull` for `auto_full` | T2 via the message key; `stripeFail` branch unreachable | P3 (text only) |
| `lib/ops/bookings.ts:88-89`, `bookings-map.ts:414-419`, `app/vamos-ops-data.js:671-673` | carry status, owed, captured, refunded | unchanged | — |
| `app/ops/OpsDetail.dc.html:839-845, 989` | `pending_ops` → review form, % empty | owed > 0 → title "Refund due", new body, % prefilled 100 | P4 |
| `ops_refund_decide` (decline needs `pending_ops`) | — | a full-tier refund can be declined (the signed note shows the Decline button) — Q1 | — |
| `ops_refund_record` | sets `refunded`, owed := refunded | kept for back-compat, no longer called by `refund.ts` | P1 |
| `stripe_charge_refunded_record` | — | unchanged | — |
| `record_booking_refund`, `bookings_set_refund_failed`, `booking_refund_processing_mark` | customer auto path | no caller left after P2; functions stay in the database | — |
| pgTAP `refund_review.test.sql:201-209`, `cancellation_refund_d02.test.sql` | assert modes and the inside-24 h state | stay green (neither asserts `none` after a > 24 h cancel) | — |

Rows that exist before the migration keep their state; no backfill. A cancelled, paid booking with `refund_status 'none'` (old rows, or a staff cancel whose automatic refund was skipped) keeps today's "Refund due" + "Refund" button path.

### B.2 Refund across payments — decision

`booking_refunds` is append-only, so "record first, then Stripe, then mark sent" cannot be one row that is updated. **New mutable table `booking_refund_intents` plus three functions.** `ops_refund_record` is left as it is.

Table `public.booking_refund_intents`: `id` identity, `booking_id`, `payment_id`, `batch_id uuid` (one admin click), `amount_rappen rappen > 0`, `reason`, `decided_percent numeric(5,2) null`, `state` in `intended | sent | failed | void`, `attempts int default 0`, `last_error text`, `stripe_refund_id text unique null`, `refund_id` → `booking_refunds`, `actor_id`, `created_at`, `updated_at`. Unique partial index on `(payment_id) where state in ('intended','failed')`. RLS on and forced; `vamos_staff` SELECT only with the same two policies as `booking_disputes` (`MIG/20260928120000…:55-70`); no grant to anon / authenticated / guest.

Functions, all `security definer`, `search_path ''`, EXECUTE `vamos_system` only (same trust model as `ops_refund_record`: the route is `withAdmin`, the Worker passes `claims.sub`). No array parameters or results (the Worker client cannot read arrays).

1. `ops_refund_plan(p_booking_id uuid, p_actor_id uuid, p_payment_id int8 default null, p_percent numeric default null, p_reason text default null, p_resume_only bool default false)` returns rows `(intent_id, payment_id, stripe_payment_intent_id, amount_rappen, idempotency_key, state, attempts, resumed)`.
   - Locks the booking row.
   - **If the booking has open intents (`intended` or `failed`) it returns exactly those and creates nothing** (`resumed = true`), whatever the arguments. This is what makes a second press and Retry safe.
   - Otherwise (and `p_resume_only` false): for each captured payment (or only `p_payment_id`), `left = charged − sum(booking_refunds of that payment)`; `amount = left` when `p_percent` is null, else `least(left, round(charged × p_percent / 100))`. Payments with amount 0 are skipped. Inserts one `intended` row per payment with a fresh `batch_id`.
   - Sets `refund_status 'processing'` and `refund_owed_rappen = greatest(coalesce(owed,0), coalesce(refunded,0) + sum(planned))`. So a full-tier booking keeps owing 100 % even when the admin refunds one payment first; a review-tier decision makes owed = what was decided.
   - Refusals (names already mapped in `refund-map.ts:23-37`): `not-found`, `not-paid` (no captured payment, or `p_payment_id` not a captured payment of this booking), `already-refunded` (nothing left), `invalid-amount` (percent ≤ 0 or > 100, or every amount 0), `invalid-reason`. New: `nothing-to-retry` (`p_resume_only` and no open intent).
   - `idempotency_key` = `'refund-intent:' || id`.
2. `ops_refund_intent_sent(p_intent_id int8, p_stripe_refund_id text, p_stripe_fee_rappen rappen default null, p_payout_country text default null, p_available_on timestamptz default null)` returns `(booking_id, refund_id, payment_id, refund_rappen, contact_email, payer_email, contact_name, locale, reference, open_intents, refunded_rappen, due_rappen, refund_status)`.
   - Idempotent: intent already `sent`, or a `booking_refunds` row with that `stripe_refund_id` exists → returns the existing facts.
   - Inserts the `booking_refunds` row itself (columns as `ops_refund_record` 343-372, plus `payout_country`, `available_on`; `decided_by` = the intent's actor; `tier_applied.source` `ops_full` when `decided_percent` is null else `ops_decided`), the `refund.issued` event (382-405), the fee (375-380), `refunded_rappen += amount`. **It never refuses for "exceeds remaining": the money has left, the row must land.**
   - Marks the intent `sent` from any state.
   - Booking status afterwards: open intents left → `failed` if any is `failed`, else `processing`; none left → `refunded` when `refunded_rappen >= refund_owed_rappen`, else back to `pending_ops` (still due).
   - `due_rappen = greatest(owed − refunded, 0)`.
3. `ops_refund_intent_failed(p_intent_id int8, p_error text, p_void bool default false)`: no-op when the intent is `sent`; else `attempts + 1`, `last_error`, state `failed` (or `void` when `p_void`), then the same status rule (`failed` while a failed intent is open).

Worker order per click (`refund.ts`):
1. `ops_refund_plan` (intent recorded, nothing sent yet).
2. For each returned intent, in `payment_id` order, independently (one failure does not stop the next payment):
   - `resumed` or `attempts > 0`: first look at Stripe (`refunds.list` on the PaymentIntent, match `metadata.vamos_intent = intent id`). Found → go straight to step c. This covers a retry after Stripe's 24-hour idempotency window.
   - a. `createRefund` with `idempotencyKey = intent.idempotency_key`, `amountRappen = intent.amount_rappen`, metadata `vamos_intent`.
   - b. Stripe refuses → `ops_refund_intent_failed` (`p_void` true when Stripe's code is `charge_already_refunded`).
   - c. Stripe accepted → payout facts (best effort, `payoutFactsFromRefund`) → `ops_refund_intent_sent`. **If this database call throws, the intent stays `intended` and the booking `processing` — never `failed`.** The part is reported as `unrecorded`; Retry finds the refund at Stripe and records it.
3. Answer:
   - every intent `sent` → `{ok:true, …, refundedRappen, dueRappen, parts}`; the route sends the "Refund issued" mail once (today's mail, unchanged).
   - otherwise `{ok:false, code: anySent ? 'refund-partial' : 'stripe-failed', refundedRappen, dueRappen, parts:[{paymentId, amountRappen, state}]}` with HTTP 502 (`jsonErr` already takes extra fields, `apps/web/lib/ops/staff-json.ts:30-32`). No mail until the batch is complete.

"Nothing sent twice" rests on three things: a press while intents are open only resumes them; each intent has one Stripe idempotency key; a retry checks Stripe for the intent's own refund before creating one. `booking_refunds.stripe_refund_id` is unique as the last line.

What the choices mean:
- **One payment:** exactly today's form. `{percent: N}` = N % of the captured amount, capped at what is left.
- **"All payments" at N %:** N % of each payment's charged amount, each capped at what is left of that payment, rounded per payment. (Chosen over "N % of each remainder" so that one payment behaves as today — `refund.test.ts:219` pins "40 % of captured". Q5 gives the example.)
- **`{}`:** every captured payment, all that is left. This fixes the 100 + 20 case.
- **`{paymentId, percent?}`:** that payment only.
- **`{postTrip:true}`:** all payments, all that is left, reason `post_trip`.
- **`{retry:true}`:** open intents only; none → 409 `nothing-to-retry`.
- `{rappen}` (legacy exact amount) is accepted only when the booking has a single captured payment and is converted to that payment; otherwise `invalid-body`.

Request body after P2: `{ paymentId?: number, percent?: number, postTrip?: boolean, retry?: boolean, rappen?: number }`.

Picker data: `GET /api/staff/bookings/:id/refund` (admin) → `{ payments:[{id, kind:'trip'|'extra', capturedAt, chargedRappen, refundedRappen, leftRappen, open:{amountRappen, state}|null}], owedRappen, refundedRappen, dueRappen }`. Read as staff from `booking_payments`, `booking_edit_requests` (extra = `extra_snapshot_id = snapshot_id`), `booking_refunds`, `booking_refund_intents`. Kept out of `loadBookings` so `bookings.ts` / `bookings-map.ts` / `vamos-ops-data.js` are not touched.

### B.3 Staff cancel

Same as the customer: a staff cancel of a paid booking more than 24 h before pickup leaves "Refund due" and sends nothing to Stripe. SQL: `ops_cancel_booking` gets the B.1 rule. Worker: `apps/web/lib/ops/bookings-write.ts` — delete line 13 (`applyStripeRefund` import), line 9 (`loadCapturedPaymentRow` import, its only use is 153), line 127 (`refundMode`), and lines 150-168 (the whole `if … else if` block). Nothing else in that file. `applyStripeRefund` then has no caller and is deleted with its tests.

**File conflict:** another session's hand-over changes `bookings-write.ts` (and `packages/emails/src/refund.ts`, which this plan does not touch). These three hunks are P2's last task in their own commit, made after that hand-over is on main, or handed to the control session as a patch. Until they land, a staff cancel still refunds by itself — **20-10 cannot ship without them.**

The staff cancel still sends the customer no mail (A.3). Not changed here; see Q6.

### B.4 The five texts — file by file

Each replaces exactly one sentence. New text = the decision file, verbatim (`.planning/decisions/2026-09-30-refunds-by-hand.md`, T1–T5). The executor copies from that file, not from this spec.

**T1** — current en: `Refunded automatically, in full, to the payment method you used. We send the refund when you cancel; your bank may take a few days to show it.`
| File | Place | Current de / fr / ar |
|---|---|---|
| `app/pages/cancellation.dc.html:198` | the `<p>` text | (English markup) |
| `app/vamos-i18n-dict.js:1748` | entry key (English) + `de`/`fr`/`ar` | de `Automatisch und vollständig auf das Zahlungsmittel zurückerstattet, mit dem Sie bezahlt haben. Wir veranlassen die Rückerstattung, sobald Sie stornieren; Ihre Bank braucht vielleicht ein paar Tage, bis sie sichtbar ist.` · fr `Remboursé automatiquement et intégralement sur le moyen de paiement utilisé. Nous lançons le remboursement dès votre annulation ; votre banque peut mettre quelques jours à l’afficher.` · ar `يُردّ المبلغ كاملًا وتلقائيًا إلى وسيلة الدفع التي استخدمتها. نُرسل الاسترداد فور إلغائك، وقد يستغرق بنكك بضعة أيام لإظهاره.` |
| `apps/web/i18n/messages/{en,de,fr,ar}.json:1602` | `legal.tier-full-refund-automatic` (key name stays) | same four strings |

**T2** — current en: `This trip will be cancelled. Refunded in full, automatically.`
| File | Place | Current |
|---|---|---|
| `app/pages/manage-booking.dc.html:554` | `<p>` inside `cancelFull` | English |
| `app/pages/booking-detail.dc.html:546` | same sentence (not named in the plan, same sheet for the signed-in customer) | English |
| `app/vamos-i18n-dict.js:1768` | key + de/fr/ar | de `Diese Fahrt wird storniert. Vollständig und automatisch zurückerstattet.` · fr `Ce trajet sera annulé. Remboursé intégralement, automatiquement.` · ar `ستُلغى هذه الرحلة. يُردّ المبلغ كاملًا وتلقائيًا.` |
| `apps/web/i18n/messages/{en,de,fr,ar}.json:572` | `checkout.cancelSheetFull` | same four |

**T3** — current en: `Automatic full refund of the amount we captured.`
| File | Place | Current |
|---|---|---|
| `apps/web/i18n/messages/{en,de,fr,ar}.json:1259` | `legal.automatic-full-refund-of-the-amount-we` | de `Automatische volle Erstattung des erfassten Betrags.` · fr `Remboursement automatique intégral du montant capturé.` · ar `استرداد تلقائي كامل للمبلغ المحصّل.` |
No `.ts`/`.tsx` renders this key today (grep: only the four JSON files and the seed).

**T4** — `packages/emails/src/messages/{en,de,fr}.json:83`, `ar.json:89`, key `cancellation.refundFullCaptured`. Current: en `A full refund of the captured amount is on the way. Timing follows your card issuer's timing.` · de `Eine volle Rückerstattung des erfassten Betrags ist unterwegs. Der Zeitpunkt folgt dem Timing Ihres Kartenherausgebers.` · fr `Un remboursement intégral du montant capturé est en cours. Le délai suit le timing de votre émetteur de carte.` · ar `استرداد كامل للمبلغ المحتجز في الطريق. التوقيت يتبع توقيت جهة إصدار بطاقتك.`

**T5** — `packages/emails/src/messages/{en,de,fr}.json:82`, `ar.json:88`, key `cancellation.refundPendingOps`. Current in all four: `Pending Ops.` New = the second sentence of `cancelSheetOps` (`apps/web/i18n/messages/*.json:573`), identical to dict line 1765:
- en `Our team decides the refund and tells you by email.`
- de `Unser Team entscheidet über die Rückerstattung und teilt sie Ihnen per E-Mail mit.`
- fr `Notre équipe décide du remboursement et vous en informe par e-mail.`
- ar `يقرّر فريقنا مبلغ الاسترداد ويُبلغك به عبر البريد الإلكتروني.`

Generated: `packages/db/supabase/seed.sql:653` (`checkout.cancelSheetFull`), `:1471` (T3 key), `:1714` (`legal.tier-full-refund-automatic`) — regenerate with `pnpm db:seed:gen`, never edit by hand.

Stale and unused, leave or delete (P3 decides, no customer reads it): `app/vamos-i18n-dict.js:1865` "Automatic full refund of the amount we captured. Or take the full value as a voucher instead — see section" (no mock uses the sentence).

### B.5 Dashboard strings that become wrong (internal, proposed wording)

All in `app/ops/OpsDetail.dc.html` (P4).

1. `refundBody` — 537 / 580 / 655 / 704, today `Cancelled inside the free window. The customer is emailed that a refund will be issued to their bank account. When you mark it issued, they get a second email.` Wrong twice: no such mail is sent at cancel, and "free window" is not a term on the site. Used for the full-tier state (`pending_ops`, owed > 0), under the title `refundTitle` "Refund due" (kept):
   - en `Cancelled more than 24 hours before pickup. The customer was told they get a full refund. Nothing is sent until you confirm.`
   - de `Mehr als 24 Stunden vor der Abholung storniert. Dem Kunden wurde die volle Rückerstattung zugesagt. Es wird nichts gesendet, bis Sie bestätigen.`
   - fr `Annulée plus de 24 heures avant la prise en charge. Le client a été informé d’un remboursement intégral. Rien n’est envoyé avant votre confirmation.`
   - ar `أُلغي قبل موعد الاستلام بأكثر من 24 ساعة. أُبلغ العميل بأنه سيستردّ المبلغ كاملًا. لا يُرسَل شيء قبل تأكيدك.`
2. New `dueLegacyBody`, for cancelled + paid + `refund_status 'none'` (old rows):
   - en `Cancelled and paid. Nothing has been refunded yet.` · de `Storniert und bezahlt. Bisher wurde nichts zurückerstattet.` · fr `Annulée et payée. Rien n’a encore été remboursé.` · ar `أُلغي وهو مدفوع. لم يُستردّ شيء بعد.`
3. `reviewTitle` / `reviewBody` (568 / 614 / 643 / 692) `Cancelled inside 24 hours of pickup. Set the percentage to refund.` — stays, now shown only when owed is null.
4. Existing fault to fix in the same pass: `showRefundDue` (989) is true for any cancelled booking that is not in review or declined, so **"Refund due" stays on screen after the refund was issued**; `isRefunded` (988) reads `booking.status === 'refunded'`, which the database never sets. After P4: "Refund due" only for the full-tier and legacy states; the success Alert `refundedTitle/refundedBody` when `refundStatus === 'refunded'`.
5. New picker and partial-failure strings:

| Key | en | de | fr | ar |
|---|---|---|---|---|
| `whichPayment` | Which payment? | Welche Zahlung? | Quel paiement ? | أي دفعة؟ |
| `allPayments` | All payments | Alle Zahlungen | Tous les paiements | كل الدفعات |
| `payTrip` | Trip | Fahrt | Trajet | الرحلة |
| `payExtra` | Extra fare | Aufpreis | Supplément | أجرة إضافية |
| `payLine` | refunded {a} · left {b} | erstattet {a} · offen {b} | remboursé {a} · reste {b} | مُستردّ {a} · متبقٍّ {b} |
| `partialTitle` | {a} refunded. {b} still due. | {a} erstattet. {b} noch offen. | {a} remboursé. {b} encore dû. | استُردّ {a}. ما زال {b} مستحقًا. |
| `partialBody` | Stripe did not accept one refund. Nothing was sent twice. | Stripe hat eine Rückerstattung nicht angenommen. Nichts wurde doppelt gesendet. | Stripe n’a pas accepté un remboursement. Rien n’a été envoyé deux fois. | لم تقبل Stripe أحد المبالغ المستردة. لم يُرسَل شيء مرتين. |
| `processingBody` | A refund was sent and is not recorded yet. Press Try again. | Eine Rückerstattung wurde gesendet und ist noch nicht verbucht. Drücken Sie «Erneut versuchen». | Un remboursement a été envoyé et n’est pas encore enregistré. Appuyez sur Réessayer. | أُرسل مبلغ مسترد ولم يُسجَّل بعد. اضغط «حاول مرة أخرى». |

Amounts through `VamosLocale.money`, inside `.vt-dir-keep`. `tryAgain` exists (573 / 619 / 648 / 697).

### B.6 What the customer reads after a > 24 h cancel, before the refund is sent

| Surface | Shown today for `pending_ops` | True for the full tier? |
|---|---|---|
| Cancel mail | T4 (after P3) | yes |
| `manage-booking.dc.html:604-608`, `booking-detail.dc.html:596-600` | box "Refund · waiting on review" + "Our team decides the refund and tells you by email." | **No** — contradicts T4 |
| Refund row, `vamos-manage-ticket.js:181` | the word **"Pending Ops"** (dict 1409: de `Wartet auf Ops`, fr `En attente Ops`, ar `بانتظار التشغيل`) | internal words, wrong for both tiers; the same fault T5 fixes in the mail |
| Next voucher, `voucher-badge.ts:38` → `checkout.refundPendingOps` "Refund under review" + the owed amount | label + `CHF` amount | the amount is right, "under review" is not |

None of the approved texts covers these three places. Proposal, **needs the owner's yes (Q2, Q3)** — until then P3 does only the part that adds no new wording:
- P3 now, no new wording: in both mocks split the box — `refundReview` only when owed is not > 0; for the full tier show the box with the label `Refund` (already in both mocks, line 334 / 326) and the **T4 sentence verbatim** (new dict entry with T4's de/fr/ar). Keep `refundOwedRappen` on the ticket after the cancel response (`result.body.refundRappen`).
- Waiting for Q3: the row word. Proposed: inside 24 h → "Refund under review" (already approved and live in the Next copy in four languages); full tier → a short label the owner picks.
- Waiting for Q2: the Next voucher label for the full tier (new message key).

---

## C. Tasks

Packages P1–P3 touch disjoint files and can run at the same time. P2 is written against P1's function signatures in B.2 (mocked in unit tests). P4 starts after the other session's hand-over is on main and P1–P3 are merged.

### P1 — database

Files: `packages/db/supabase/migrations/20261005140000_refunds_by_hand.sql` (new), `packages/db/supabase/tests/refunds_by_hand.test.sql` (new). No other file.

| # | Change | Test first (pgTAP, rolled back, synthetic rappen only) | Accept |
|---|---|---|---|
| 1.1 | `create or replace function app.apply_customer_cancel` — body of `MIG/20260911234758…:122-281` verbatim, lines 211-217 replaced by the B.1 rule. Same signature, grants re-stated. | 30 h paid booking, `manage_booking_cancel` → `refund_status 'pending_ops'`, `refund_owed_rappen` = captured, returned `refund_mode 'auto_full'`; same through `customer_paid_cancel`; 3 h booking → `pending_ops`, owed null (unchanged); 30 h **unpaid** → `none` | 4 assertions |
| 1.2 | `ops_cancel_booking` — body of `MIG/20260928110000…:228-392` verbatim with 319-323 replaced by the same rule. Follow that file's drop + create convention and re-grant `vamos_system`. | staff cancel at 30 h paid → `pending_ops`, owed = captured | 1 assertion |
| 1.3 | Table `booking_refund_intents`, index, RLS, grants (B.2). | `has_table`; state check refuses `'x'`; second open intent for one payment refused; `vamos_staff` SELECT only; `authenticated`, `anon`, `vamos_guest` no privilege | 5+ assertions |
| 1.4 | `ops_refund_plan` | one payment, null percent → one intent = remainder; 8000 + 2000, null → two intents 8000 and 2000; 50 % → 4000 and 1000; `p_payment_id` = the extra → one intent 2000; second call while open → same ids, `resumed`, no new rows; owed 10000 kept when only one payment is planned; review tier (owed null) → owed = planned; `already-refunded`, `not-paid`, `invalid-amount`, `nothing-to-retry`; EXECUTE only `vamos_system` | each an assertion |
| 1.5 | `ops_refund_intent_sent` | inserts one `booking_refunds` row on the intent's payment with `decided_by`, payout facts, `refund.issued` event; second call with the same ids → no second row; two intents, one sent → `processing`, `due_rappen` = the other; both sent → `refunded`; full tier, only one payment planned and sent → back to `pending_ops`, due = the rest; an amount above the remainder is still recorded | each an assertion |
| 1.6 | `ops_refund_intent_failed` | → intent `failed`, booking `failed`, attempts 1; on a `sent` intent → no change; `p_void` → `void`, no longer open, a new plan is possible | each an assertion |
| 1.7 | Comments on every function naming 20-10 and the rule. No CHF literal. `begin; … commit;` like the neighbours. | — | `refund_review.test.sql`, `cancellation_refund_d02.test.sql`, `ops_refund.test.sql`, `stripe_money_events.test.sql` still pass unchanged |

Hosted apply is the control session's step: the file verbatim, then read back and compare with local.

### P2 — Worker

Files: `apps/web/lib/lifecycle/paid-cancel.ts`, `paid-cancel.test.ts`; `apps/web/lib/ops/refund.ts`, `refund-map.ts`, `refund.test.ts`; `apps/web/lib/checkout/stripe.ts` (one new helper); `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts`; `apps/web/app/api/staff/bookings/[id]/refund/route.ts` (add `GET` to the re-export); last task only: `apps/web/lib/ops/bookings-write.ts`.
Not touched: `edit-request.ts`, `bookings.ts`, `bookings-map.ts`, `settle.ts`, the two customer cancel routes, anything under `packages/emails`.

| # | Change | Test first | Accept |
|---|---|---|---|
| 2.1 | `finishPaidCancel` (`paid-cancel.ts:289-351`): no Stripe. `fullDue = mode 'auto_full' && refund_rappen > 0`. Mail line: `full_captured` when `fullDue`, `pending_ops` for mode `pending_ops`, else `none`. Return `{ok:true, bookingId, refundMode, refundStatus: fullDue or pending_ops → 'pending_ops' else 'none', refundRappen: owed or 0}`. Drop the third parameter; callers 370 and 419. Remove 309-313, 315-350, `loadCapturedPayment` (271-279), `setRefundProcessing` (281-287), the `refundFailed` branch of `notifyPaidCancelMails` (181-190) and the now unused imports. | In `paid-cancel.test.ts`, mocked Stripe and SQL: `paidCancelGuest` with an `auto_full` row → `createRefund` called 0 times, result `pending_ops` + the owed amount, `notifyCancellation` called with `refundLine 'full_captured'`; the same with `STRIPE_SECRET_KEY: 'sk_live_x'` → still `ok:true`, 0 Stripe calls; `pending_ops` row → `refundLine 'pending_ops'`; `auto_full` with 0 → `none` | new tests red before, green after |
| 2.2 | `stripe.ts`: add `findRefundByIntent(stripe, paymentIntentId, intentId)` — `refunds.list({payment_intent, limit: 100})`, first with `metadata.vamos_intent === String(intentId)`, else null. `createRefund` unchanged (it already merges extra metadata). | unit test with a fake `refunds.list` | — |
| 2.3 | `refund-map.ts`: `parseRefundBody` accepts `paymentId` (positive integer), `retry` (boolean; alone), keeps `percent`, `postTrip`, `rappen`; `invalid-body` for `retry` with anything else and for `postTrip` with `paymentId`. Add `nothing-to-retry` to `NAMED`. New types `RefundPart`, `RefundPartial`. `RefundOk` gains `refundedRappen`, `dueRappen`, `parts`. `opsRefundAmount` stays. | extend `refund.test.ts:191-208` | — |
| 2.4 | `refundBooking` (`refund.ts:52-193`) rewritten to B.2's order. The `sk_live_` guard at 61-64 **stays**. Status read for `postTrip` stays as staff. `rappen` → only with one captured payment (read as staff), turned into a percent-free single-payment plan; otherwise `invalid-body`. Payout facts via `retrieveRefund` + `payoutFactsFromRefund` (kept in `paid-cancel.ts`, exported). New `loadRefundPicker(env, claims, key)` for the GET. `decideRefund` unchanged. | New tests (mocked `asSystem` / Stripe): (a) 100 + 20, `{}` → plan, then exactly two `createRefund` calls of 100 and 20 with keys `refund-intent:<id>`, two `ops_refund_intent_sent`; (b) second Stripe call throws → result `refund-partial`, `refundedRappen 100`, `dueRappen 20`, `ops_refund_intent_failed` called once for the second; (c) the same request again while the plan returns the failed intent as `resumed` → `findRefundByIntent` first, then one `createRefund` for the 20 only, 0 for the 100; (d) Stripe ok but `ops_refund_intent_sent` throws → part `unrecorded`, `ops_refund_intent_failed` **not** called; (e) pressing twice (plan returns the same intents) → same idempotency keys; (f) `charge_already_refunded` → failed with `p_void` true. Replace the source pins `refund.test.ts:67-79` (order is now plan → `createRefund(` → `ops_refund_intent_sent`; still `asSystem`, still `sk_live_`, still no insert as staff) and `:250-267` (`ops_refund_plan` receives `${reason}` and the percent; `not-post-trip` still before `createRefund(`). | all green |
| 2.5 | Route: `POST` passes the parsed body; 409 for `nothing-to-retry`; on `refund-partial` / `stripe-failed` → `jsonErr(code, 502, {refundedRappen, dueRappen, parts})`; the mail loop (65-77) only when `ok`. Add `export const GET = withAdmin(...)` → `loadRefundPicker`. Dual mount: `export { POST, GET }`. | `refund.test.ts:169, 269-286` extended: the route forwards `paymentId` and `retry`, GET is admin-only | — |
| 2.6 | **Last, own commit, after the other hand-over is on main:** `bookings-write.ts` lines 9, 13, 127, 150-168 as in B.3. Then delete `applyStripeRefund`, its types (30-47), `markRefundFailed` (119-127), `liveKeyRefused` (115-117) from `paid-cancel.ts`, and the tests `paid-cancel.test.ts:62-112` (source pins), `171-297` (mocked order, `refuses sk_live_`), `299-304` (the `notifyRefundFailed` pin). Rewrite `refund.test.ts:179-187` to: `bookings-write.ts` matches `ops_cancel_booking`, does not match `applyStripeRefund`, `createRefund`, `record_booking_refund`. | New pin: `createRefund(` appears under `apps/web/lib` and `apps/web/app` only in `checkout/stripe.ts`, `ops/refund.ts`, `ops/edit-request.ts`, `checkout/settle.ts` | `stripe-sandbox-only.test.ts` still green |

Note on decision 5: the refusal at `paid-cancel.ts:115-117` guards the automatic path only. It goes away with that path in 2.1 / 2.6 because no Stripe call is left in the file — it is not the removal decision 5 speaks of. The guards on the manual paths, `refund.ts:62` and `edit-request.ts:129`, stay until the proof in D.3.

Run only the touched test files; the lead runs the full gates once.

### P3 — texts

Files: `app/pages/cancellation.dc.html`, `app/pages/manage-booking.dc.html`, `app/pages/booking-detail.dc.html`, `app/vamos-manage-ticket.js`, `app/vamos-i18n-dict.js`, `apps/web/i18n/messages/{en,de,fr,ar}.json`, `packages/emails/src/messages/{en,de,fr,ar}.json`, `packages/db/supabase/seed.sql` (generated), one new test file `apps/web/lib/legal/refund-texts-20-10.test.ts`.

| # | Change | Test first | Accept |
|---|---|---|---|
| 3.1 | T1: `cancellation.dc.html:198`; dict 1748 (key and three values); `legal.tier-full-refund-automatic` ×4. | the new test hard-codes T1–T5 (copied from the decision file) and asserts each of the listed places contains the new text and none contains the old en/de/fr/ar text | red before, green after |
| 3.2 | T2: `manage-booking.dc.html:554`, `booking-detail.dc.html:546`, dict 1768, `checkout.cancelSheetFull` ×4. | same test | — |
| 3.3 | T3: `legal.automatic-full-refund-of-the-amount-we` ×4. | same test | — |
| 3.4 | T4 and T5: `packages/emails/src/messages/*.json` `cancellation.refundFullCaptured`, `cancellation.refundPendingOps`. Also the header comment of `packages/emails/src/CancellationEmail.tsx:3-4` is **not** touched (another package's file stays out). | same test: no `Pending Ops.` in the four mail files; T5 equals the second sentence of `checkout.cancelSheetOps` in each language | — |
| 3.5 | `pnpm db:seed:gen`, commit the regenerated `seed.sql` (expected diff: lines 653, 1471, 1714 only). | — | diff limited to those three rows |
| 3.6 | Cancelled view, both mocks: `refundReview` = `pending_ops` and owed not > 0 (`manage-booking.dc.html:1232`, `booking-detail.dc.html:1145`); new `refundFull` = `pending_ops` and owed > 0 → the same box with label `Refund` and the T4 sentence; add T4 en → de/fr/ar to the dict; set `refundOwedRappen: result.body.refundRappen || null` on `nextTicket` (`manage-booking.dc.html:1015-1021`, `booking-detail.dc.html:978-984`). Only after the owner's yes to Q2; without it, do 3.6 with `refundFull` showing no box. | source test: both mocks contain `refundFull`, neither shows "Our team decides the refund" when owed > 0; `VamosLocale.coverage` on both pages returns empty in de, fr, ar | checked in Arabic and at 1440 / 1024 / 768 / 390 |
| 3.7 | After the owner's answer to Q3 only: `vamos-manage-ticket.js:181` and dict 1409. | — | — |

Twin tests read `apps/web/public/app/`: run `node scripts/sync-dc-mock-to-public.mjs` before them. The live customer pages are the mocks; the Next copies reach nobody but must match.
If the live Worker reads strings from the `content_strings` table (`apps/web/lib/content/messages.ts:28`, default `json`), the three Next keys must also be updated in the hosted table at ship — D.4.

### P4 — dashboard, later

File: `app/ops/OpsDetail.dc.html` and `apps/web/lib/ops/ops-refund-review-dc.test.ts`. If the payment rows become a repeated pattern elsewhere, a `RefundPicker.dc.html` component with states (project rule); inside one screen a design-system `List` with radio rows is enough.

| # | Change | Test first | Accept |
|---|---|---|---|
| 4.1 | On opening a cancelled or post-trip paid booking as admin: `GET …/refund`. | source test: the DC requests `'GET'` on `/refund` | — |
| 4.2 | Full-tier state (`pending_ops`, owed > 0): danger Alert title `refundTitle`, body the new `refundBody` (B.5.1); % Input **prefilled 100**; Confirm; Decline as in the signed note. Review tier unchanged (% empty — `ops-refund-review-dc.test.ts:108-113` keeps its pin for that state). | new pins for the prefill and for the body key | — |
| 4.3 | More than one captured payment: "Which payment?" list — All payments (default), then one row per payment: `payTrip` / `payExtra`, date and time, amount, `payLine`. One payment: no list, exactly today's form. Confirm posts `{percent}` or `{paymentId, percent}`. | pins: `whichPayment`, `allPayments` in four languages; no list markup path when `payments.length === 1` | — |
| 4.4 | Partial / failed / processing: danger Alert `partialTitle` with amounts from the server (`refundedRappen`, `dueRappen` from the POST answer, and from the GET after a reload), `partialBody` or `processingBody`, "Try again" posts `{retry:true}`. Replaces `retryRefund` (1023-1029) and its `{rappen: owed}` fallback. | pins: `retry: true` body; no `rappen:` in the DC | — |
| 4.5 | Fix B.5.4: "Refund due" only for full-tier and legacy states; success Alert on `refundStatus === 'refunded'`; legacy body `dueLegacyBody`. | pin | — |
| 4.6 | All new keys in en, de (ss, no ß), fr, ar; amounts `VamosLocale.money` in `.vt-dir-keep`; logical properties; no glow, no tint; 44 px targets; 1440 / 1024 / 768 / 390; Arabic checked. | `ops-refund-review-dc.test.ts:64-92` extended with the new keys | screenshots in `.planning/…/screens` |

---

## D. Risks and open points

### D.1 Owner questions

1. **Decline on a full-refund booking.** The signed picture shows "Decline refund" next to "Confirm refund" for a cancel more than 24 h before pickup. Example: Mia cancels 3 days ahead, reads "You will get a full refund", then the admin presses Decline and she gets nothing. Keep the button there, or hide it for that case?
2. **Words on the booking page after such a cancel.** Today the page would say "Refund · waiting on review — Our team decides the refund and tells you by email." Example: on vamostaxi.site/manage-booking Mia would read that right after being promised the full amount. May the page show the approved mail sentence instead ("You will get a full refund of the amount you paid. Our team sends it; your bank may take a few days to show it.")?
3. **The word "Pending Ops" on the booking page.** Example: on vamostaxi.site/manage-booking the Refund row reads "Pending Ops" (German "Wartet auf Ops"). Replace it with "Refund under review" for a cancel inside 24 h, and which short words for the full-refund case (for example "Full refund — our team sends it")?
4. **Less than 100 % on a full-refund booking.** Example: the field is pre-filled with 100; the admin types 50. Allowed, or fixed at 100 for that case? (As built here: allowed, and the booking keeps showing "Refund due" for the rest.)
5. **What a percentage means when part was already refunded.** Example: trip payment CHF 100, CHF 30 already refunded, the admin types 50 %. This spec sends CHF 50 (50 % of the payment, at most what is left), as the single-payment form does today. The other reading would send CHF 35 (50 % of what is left).
6. **Staff cancel sends the customer no mail.** Example: the admin cancels VT-26-0101 on the dashboard; the customer gets nothing until the "Refund issued" mail. The dashboard text claimed a mail is sent. Send the cancellation mail there too, or leave it?
7. **The automatic refund of a double payment.** Example: a customer pays the same booking twice through an old pay link; the site refunds the second charge by itself and mails "automatically refunded". Does "nothing goes to Stripe without his click" cover this too, or does it stay automatic?
8. **A refund Stripe keeps refusing.** Example: the extra-fare payment is in a dispute and Stripe refuses the CHF 20 every time. As built here it stays "CHF 100 refunded, CHF 20 still due" with Try again, and only Stripe's "already refunded" answer clears it by itself. Should there be a "Stop this refund" button?

### D.2 Where the code contradicts the decisions or itself

- Staff cancel refunds automatically (`bookings-write.ts:150-168`) — against decision 1; fixed by 1.2 + 2.6, blocked on the other hand-over.
- `settle.ts:616` and `edit-request.ts:286` also send refunds; the first with no click (Q7), the second on an admin click but Stripe-first-then-record (same fault as A.5; out of this plan's scope, listed for batch B).
- Dashboard "Refund due" stays after the refund (B.5.4) and its body describes mails that are not sent.
- Customer reads "Pending Ops" on the manage page and in the mail (T5 fixes the mail only).
- A 502 from the cancel route after a failed automatic refund made the page say "Could not cancel this booking" although it was cancelled — disappears with 2.1.
- Two-payment bookings: today's automatic refund asks the first PaymentIntent for the sum of both and fails.
- `ops_refund_record` never stores payout country / date, so after any admin refund the customer reads "Refunded to your Switzerland card." whatever the card. The new `ops_refund_intent_sent` stores them.
- The cancel functions can be reached for an unpaid booking more than 24 h ahead through a manage link (mode `auto_full`, 0); today that ends in "refund failed" and an ops mail. B.1's rule makes it `none`.

### D.3 Proof before the `sk_live_` guards at `refund.ts:62` and `edit-request.ts:129` are removed

1. P1's pgTAP file and P2's unit tests green, in particular: customer cancel = 0 Stripe refund calls; admin refund = one call per payment; a second press = no second call; partial failure shows refunded and due; retry sends only the rest.
2. On the deployed Worker with the sandbox account: one booking paid with 4242 4242 4242 4242, cancelled by the customer more than 24 h ahead → dashboard shows "Refund due" with 100 → Confirm → read back `booking_refunds`, `booking_refund_intents`, `bookings.refund_status`, and the refund in Stripe.
3. The same with a second, extra-fare payment: "All payments" → two Stripe refunds, two rows.
4. One forced failure (for example the extra payment already refunded in the Stripe dashboard) → the dashboard shows what went and what is due; Try again sends nothing twice.
5. Then one separate commit removes the two guards, updates `refund.test.ts:76` (the `sk_live_` pin) and the memory note that the refusal is still owed. `edit-request.ts:129` guards the whole edit-accept function (extra charges too), not only its refund: removing it is a wider step than this plan proves — decide it separately.

### D.4 Not verified

- Whether the live Worker reads customer strings from JSON or from `content_strings` (`messages.ts:28` says the default is `json`, "live value is resolved per request").
- Whether the manage ticket object in the mocks carries `refundOwedRappen` after a normal load (the API returns it at `api/manage/booking/route.ts:185`; the mock's mapping between the API body and `ticket` was not read end to end). The signed-in fallback `fromAccount` hard-codes `refundStatus 'none'` (`vamos-manage-ticket.js:67-94`), so a signed-in customer may see no refund state at all on booking-detail.
- Which page is live for a signed-in customer's booking: the mock `booking-detail.dc.html` or the Next `confirmation/[ref]` page.
- What the other session's hand-over changes in `bookings-write.ts` and `packages/emails/src/refund.ts` (not on any branch read here); line numbers in B.3 are as of `ac01b413`.
- How many times the queue consumer retries `app_refund_pending` for a `charge.refunded` event before giving up; with B.2 an unrecorded app refund is healed by Retry, not by the webhook.
- Stripe behaviour was taken from the code's own comments (idempotency key, `charge_already_refunded`); no Stripe documentation or account was consulted.
- `customerCancelWindow` (`apps/web/lib/checkout/cancel-window.ts`) was not opened; it is assumed to keep returning `auto_full` for > 24 h (pinned by `voucher-badge.test.ts:78-79`).
- No test was run; "stays green" statements are from reading the assertions.
- The proposed internal dashboard wording in B.5 (de / fr / ar) is a draft, not reviewed by a native speaker.
