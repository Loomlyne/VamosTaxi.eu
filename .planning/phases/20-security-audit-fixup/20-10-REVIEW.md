# Review 20-10 "refunds by hand" — branch fix/phase-20-refunds-by-hand (HEAD bf3afabd)

Read-only review. Nothing run except grep/read and one read-only text-compare script. No tests, no DB, no network.
Paths are relative to /Users/koss/Developer/vamos-wt/phase-20. MIG = packages/db/supabase/migrations/20261005140000_refunds_by_hand.sql.

## Verdicts

| # | Area | Verdict |
|---|---|---|
| 1 | Worker ↔ database contract | PASS WITH NOTES (no mismatch found) |
| 2 | Cancel path | FAIL (B1 staff cancel still automatic on the branch; B4 signed-in page) |
| 3 | Money safety | PASS WITH NOTES for "never twice"; FAIL on Retry (B2) |
| 4 | Full-tier rule | PASS in SQL and Worker; FAIL on the dashboard as shipped (B3); bypass through staff cancel until B1 is fixed |
| 5 | Texts | PASS (byte-identical, 57/57 places) WITH NOTES |
| 6 | Test quality | PASS WITH NOTES |
| 7 | Un-applied patches | PASS WITH NOTES (correct; must be applied before ship) |

## BLOCKERS

### B1 — Staff cancel still sends the refund to Stripe by itself
- apps/web/lib/ops/bookings-write.ts:150-168 still calls `applyStripeRefund` for `auto_full` (idempotency key `refund:<booking>:<payment>:ops-cancel`), then `record_booking_refund` (lib/lifecycle/paid-cancel.ts:174-247). Against owner decision 1 and answer 6 (no mail is sent to the customer either).
- With the new SQL it is worse than before: `ops_cancel_booking` now leaves `pending_ops` + owed (MIG:305-317). One payment: Stripe refund goes out with no click. Two payments: the old code asks the first PaymentIntent for the sum, Stripe refuses, `bookings_set_refund_failed` sets `failed` with no intent. In that state `v_full` is false (MIG:668 needs `pending_ops`), so the full-tier rule no longer applies to that booking (50 % would be accepted), and the dashboard's "Try again" posts `{rappen: owed}` (app/ops/OpsDetail.dc.html:1028), which the Worker refuses as `invalid-body` for two payments (refund.ts:260).
- Smallest fix: apply the three scratchpad patches in the order of 20-10-bookings-write.NOTE.md (reviewed in area 7, correct). 20-10 must not ship without them (the spec says the same, B.3).

### B2 — "Retry" re-sends the same Stripe idempotency key, so it gets the stored refusal back for 24 hours
- refund.ts:369 always uses `intent.idempotency_key` = `refund-intent:<id>` (MIG:626, 759), also on a retry of a `failed` intent.
- Stripe stores the first answer for an idempotency key, errors included, once the request was executed (e.g. insufficient balance, the usual refund refusal on a young account). For 24 h every Retry gets that same stored error back, even after the cause is fixed. Owner decision 4 ("shows what went and what is still due, with Retry") is then a button that cannot succeed until the next day. Source: Stripe's documented idempotency behaviour; not checked against the sandbox (no network here) — proof step D.3.4 should include "refusal, fix the cause, Try again within the hour".
- Related, same place: `findRefundByIntent` (lib/checkout/stripe.ts:247-248) returns a refund of any status. If the intent's refund exists at Stripe with status `failed` or `canceled`, refund.ts:364-376 takes it as `existing`, throws, marks failed again, and never creates a new one: permanently stuck.
- Smallest fix: (a) in `findRefundByIntent` ignore refunds with status `failed` / `canceled`; (b) refund.ts:369 `idempotencyKey: attempts > 0 ? `${key}:${attempts}` : key`. Safe because a retry looks at Stripe for the intent's own refund first (refund.ts:360-363) and concurrent presses read the same `attempts`. To stay strict against a first request still in flight, bump the key only when the stored failure was an answer from Stripe (error has `statusCode`), not a timeout.

### B3 — The dashboard on this branch does not follow the owner's full-refund rule (P4 is not built)
- app/ops/OpsDetail.dc.html:839 treats every `pending_ops` as the inside-24 h review: title/body "Cancelled inside 24 hours of pickup. Set the percentage to refund.", % field empty, and a live "Decline refund" button (:1019-1020). For a booking cancelled more than 24 h ahead the server now answers 409 `full-refund-only` to Decline and to anything under 100 (MIG:712-715, 1131-1133; refund.ts:274-277, 492), and the page only shows the generic "refund failed" toast (:877-880, 893-896). Owner answer 1/4: "there is no Decline button", amount fixed at 100 %.
- No payment picker, no %/CHF switch (decision 3, answer 5 not reachable by the admin); `refund-partial` (502) is not handled (:874 only knows `stripe-failed` / `network`); GET …/refund has no caller.
- Not a money fault (the server refuses correctly) but a shown control that is dead and a wrong text. Smallest fix: ship P4 with P1–P3, or at least hide Decline and prefill 100 when `refundStatus === 'pending_ops' && refundOwedRappen > 0`, and treat `refund-partial` like `stripe-failed`.

### B4 — Signed-in customer: the refund row and box vanish after a reload
- app/vamos-manage-ticket.js:85 `fromAccount` hard-codes `refundStatus: "none"` and carries no `refundOwedRappen`; `/api/account/bookings` and `/api/account/bookings/details` return no refund field (lib/account/bookings.ts has none). `refundFull` / `refundLine` therefore show "Full refund · sent by our team" on booking-detail only straight after the cancel click (booking-detail.dc.html:984-989), never after a reload. Owner answer 2/3 names the booking detail page.
- Guest path is fine: apps/web/app/api/manage/booking/route.ts:184-186 returns `refundStatus`, `refundOwedRappen`, `refundedRappen`; `loadGuest` passes the booking through unchanged (vamos-manage-ticket.js:55-57).
- Pre-existing gap (spec D.4), but the approved wording is promised for that page. Smallest fix: return `refundStatus` and `refundOwedRappen` from `/api/account/bookings/details` and copy them onto `booking` in `loadAccount` (vamos-manage-ticket.js:120-126). If the signed-in booking page that is live is the Next `confirmation/[ref]` page instead, this drops to a note (see N10).

## 1. Worker ↔ database contract — PASS WITH NOTES

| Call | Where | Role | Args vs definition | Result columns read |
|---|---|---|---|---|
| `ops_refund_plan` | refund.ts:327-335 | asSystem (grant MIG:776-779 vamos_system) | 7 positional: uuid, uuid, int8, numeric, text, bool, int — same order and types as MIG:540-548 (`::int` → int4) | intent_id, payment_id, stripe_payment_intent_id, amount_rappen, idempotency_key, state, attempts, resumed = MIG:549-558 |
| `ops_refund_intent_sent` | refund.ts:407-413 | asSystem (grant MIG:986) | int8, text, fee uncast (resolves to `public.rappen`, single overload), text, timestamptz = MIG:793-799 | all 13 columns of MIG:800-814 |
| `ops_refund_intent_failed` | refund.ts:391 | asSystem (grant MIG:1071) | int8, text, bool = MIG:1001-1005 | result not read |
| `ops_refund_decide` | refund.ts:497 | asStaff (grant MIG:1200 vamos_staff, `app.is_admin()` inside) | uuid, text | booking_id, refund_status, reference |
| picker read | refund.ts:104-135 | asStaff | bookings, booking_payments, booking_edit_requests (grant 20260910175309:53), booking_refunds, booking_refund_intents (SELECT grant MIG:429, policies 431-436) | — |

- No role mismatch: no system-role table read, no staff-role call to a system-only function. `app.refund_intents_settle` has no grant and is only called from the definer functions (fine).
- int8 / numeric / sum() come back as strings from postgres.js; every read goes through `n()` (refund.ts:96-99). No array parameter or result in the new functions.
- `resumed` is compared with `=== true` (refund.ts:361). Correct with the driver's built-in bool parser; see N2.
- Error mapping (refund-map.ts:44-61, 80-91): `full-refund-only`, `refund-exceeds-remaining`, `invalid-amount`, `not-found`, `not-paid`, `already-refunded`, `nothing-to-retry`, `invalid-reason`, `stripe-refund-id-required` are all in `NAMED`; P0002 → `not-found`; 42501 → `not-admin`; anything else → `unknown` (HTTP 400, not 500). Route statuses: 409 for not-paid / already-refunded / refund-exceeds-remaining / nothing-to-retry / full-refund-only, 400 for invalid-amount / invalid-reason (route.ts failStatus). Nothing unmapped.
- `ops_cancel_booking` still returns `stripe_checkout_session_ids text[]` (MIG:224) read by bookings-write.ts:147 — an array through the Worker client; unchanged by 20-10, pre-existing (N15).

## 2. Cancel path — FAIL (B1, B4)

- `finishPaidCancel` (paid-cancel.ts:255-271): no Stripe call. Reads `refund_mode` and `refund_rappen`, which is what `app.apply_customer_cancel` returns (MIG:41-49, 188-190; `refund_rappen` = captured sum for `auto_full`, null for `pending_ops`, from `compute_cancellation_refund`). Mail line: `full_captured` when `auto_full` and > 0 (T4), `pending_ops` inside 24 h (T5), `none` otherwise. Returns `pending_ops` + the owed amount. Matches the database state (MIG:126-137).
- Every Stripe refund caller left in apps/web (non-test):

| Caller | What | Verdict |
|---|---|---|
| lib/ops/refund.ts:366 | admin click | intended |
| lib/checkout/settle.ts:616 | double-payment safety net | stays automatic (owner answer 7) |
| lib/ops/edit-request.ts:286 | admin accepts a fare-lowering edit (`modification_credit`), `sk_live_` guard at :129 | admin click, untouched |
| lib/lifecycle/paid-cancel.ts:195 (`applyStripeRefund`) ← lib/ops/bookings-write.ts:160 | staff cancel | **B1** |

- No customer cancel reaches Stripe: `paidCancelGuest` / `paidCancelCustomer` end in `finishPaidCancel` only (paid-cancel.ts:290, 339).
- Guest manage page: owed is returned and shown (see B4 for the signed-in page).
- While a refund is `processing` or `failed` the customer's Refund row reads "Processing" / "Failed" (vamos-manage-ticket.js:186-188) with no body text (N8).

## 3. Money safety — walk-through

Hard cap: there is no cumulative constraint or trigger in SQL. The cap is (1) `ops_refund_plan` computing `left = charged − sum(booking_refunds of that payment)` under the booking and payment row locks (MIG:597-602, 674-697), (2) the unique open-intent index per payment (MIG:416-418) plus "open intents are only resumed" (MIG:614-636), (3) per row `refund_rappen <= basis_rappen` (20260823000014:160), (4) Stripe itself refusing more than the charge. `ops_refund_intent_sent` never refuses (by design). I found no path where the planned sum exceeds what was captured.

`sk_live_` guard: still at lib/ops/refund.ts:295-298 (before any read, plan or Stripe call) and at edit-request.ts:129. Still also in `applyStripeRefund` (paid-cancel.ts:110-112, 178) until the cleanup patch removes that function. Gone from the customer cancel path, which makes no Stripe call.

| Case | Stripe calls | DB writes | Result |
|---|---|---|---|
| (a) one payment, full tier, Confirm (`{percent:100}` or `{}`) | 1 `refunds.create`, key `refund-intent:N`, metadata `vamos_intent` | plan: 1 intent, status `processing`; sent: `booking_refunds` row, `refund.issued` event, `refunded_rappen +=`, intent `sent`, status `refunded` | ok, one mail |
| (b) 100 + 20, all payments | 2 creates (10000, 2000), in payment order | 2 intents one batch; after first sent `processing`, after second `refunded` | ok, one mail |
| (c) extra only, later the trip | 1 create of 2000; later 1 create of 10000 | after the first: no open intent, refunded < owed, tier `full` → back to `pending_ops`, owed stays (MIG:508-509); after the second `refunded` | correct; but "Refund issued" mail goes out twice (N3) |
| (d) inside 24 h, 50 % | 1 create per payment at `least(left, round(charged × 0.5))` | tier `decided`, owed := refunded + planned, then `refunded` | ok |
| (e) exact CHF 35, 70 left | 1 create of 3500 | `p_amount_rappen` on the one payment, capped (`refund-exceeds-remaining` above left, Worker refund.ts:272 and SQL MIG:695); then `refunded`, owed := refunded | ok; on a full-tier booking → `full-refund-only` |
| (f) Stripe refuses the second of two, then Retry | create 1 ok, create 2 error → `ops_refund_intent_failed` (failed, attempts 1), status `failed`; answer 502 `refund-partial` refunded 100 / due 20, no mail. Retry: plan returns only the failed intent (`resumed`), `refunds.list` first, then create with the **same key** | — | nothing sent twice; Retry itself blocked by **B2** |
| (g) Stripe accepts, `ops_refund_intent_sent` throws | 1 create | nothing recorded; intent stays `intended`, booking `processing`, `ops_refund_intent_failed` not called (refund.ts:423-425) | admin gets 502 `refund-partial`, part `unrecorded` (the current dashboard shows only a generic toast, B3). Next press: open intent → resumed → `findRefundByIntent` finds it by `metadata.vamos_intent` → recorded, no second create. Also safe after Stripe's 24 h key window, because the lookup does not depend on the key. Relies on `resumed === true` (N2) |
| (h) double click / two admins | both plans serialise on the booking lock; the second gets the same intents (`resumed`); both creates carry the same key → one refund at Stripe; `ops_refund_intent_sent` is idempotent on `stripe_refund_id` and on the intent (MIG:851-860, 943) | one `booking_refunds` row | money safe. The loser may get Stripe's "key in use" answer, mark the intent `failed` for a moment and show 502 although the refund went; the winner's `sent` overrides it. Two ok answers → two mails (N3) |
| (i) part already refunded by the old path | — | `left` counts every `booking_refunds` row of the payment, with or without intent | only the rest is planned; fully refunded → `already-refunded` |
| (j) old rows | `none` + owed > 0: refundable, **not** under the full-tier rule (by spec B.1). `failed` with no intent: `{retry:true}` → `nothing-to-retry`; `{}` or `{rappen}` (one payment) works; two payments + `{rappen}` → `invalid-body` (N5). `processing` with no intent whose old Stripe refund did go out: new create → Stripe `charge_already_refunded` → intent `void` → booking back to `pending_ops` + owed, shown as due for ever (N4) | | no double payment in any of them (Stripe refuses a second full refund) |
| (k) old Worker, new migration | old `finishPaidCancel` still calls Stripe once (key of the old path) and records through `record_booking_refund`; afterwards the hand path finds `left = 0` → `already-refunded` | | a cancel in the gap is refunded automatically once, never twice. Apply the migration and deploy the Worker back to back. New Worker on the old database: refund answers `unknown`, cancel sends nothing — also safe |

## 4. Full-tier rule — SQL and Worker PASS

- SQL: `v_full` = `pending_ops` and owed > 0 (MIG:668); any amount below a payment's remainder → `full-refund-only` (MIG:712-715); decline → `full-refund-only` (MIG:1131-1133).
- Worker: refund.ts:274-277 (percent < 100, exact amount < left), refund.ts:489-493 (decline).
- `{ amountRappen }` / legacy `rappen`: both become `amountRappen` (refund-map.ts:161-172), same checks. `{ postTrip: true }`: refused as `not-post-trip` for a cancelled booking (refund.ts:249), and `postTrip` is always "all that is left". One payment at a time stays 100 % each and the booking returns to `pending_ops` with the rest due.
- Other routes: `reject` needs a post-trip status and `refund_status none` (MIG:1136-1145). Edit-request accept refunds only a fare difference on an edit request; not a way to settle a cancelled booking for less.
- Holes: staff cancel until B1 is fixed (two-payment case ends `failed`, rule off); old rows (`none` + owed, `failed`) by design; the dashboard (B3).

## 5. Texts — PASS WITH NOTES

- Compared with a script against the decisions file (T1–T4), the spec's T5 lines and the owner's row label: 57 of 57 places byte-identical — cancellation.dc.html (T1 en), manage-booking.dc.html and booking-detail.dc.html (T2, T4 en), vamos-i18n-dict.js (T1, T2, T4, T5, row label × 4 languages), apps/web/i18n/messages/*.json (`legal.tier-full-refund-automatic`, `checkout.cancelSheetFull`, `legal.automatic-full-refund-of-the-amount-we`), packages/emails/src/messages/*.json (`cancellation.refundFullCaptured`, `cancellation.refundPendingOps`), seed.sql (T1, T2, T3 × 4).
- "Pending Ops" / "Wartet auf Ops" / "En attente Ops" / Arabic: gone from every customer surface. Only left in the header comment of packages/emails/src/CancellationEmail.tsx:3 (not shown to anyone).
- No "automatic refund" promise left for a cancellation. Remaining "automatically" lines are the double-payment refund (stays automatic, answer 7), "No refund is sent automatically" (inside 24 h, true), and the unused dict entry app/vamos-i18n-dict.js:1867 (no mock uses it; delete later).
- Deleted test block (privacy-account-paragraph.test.ts, "manage-booking mock is untouched relative to origin/main"): it was a Phase 26.5 scope fence (26.5-09-PLAN.md:29, 66, 164; SESSION-HANDOFF.md:89): 26.5 must not touch manage-booking.dc.html "because the legal follow-up session owns its two refund sentences". 20-10 is that follow-up, so the fence has done its job and would fail on any legitimate edit. Nothing lasting is lost. What is missing instead: the spec's own text pin `apps/web/lib/legal/refund-texts-20-10.test.ts` (task 3.1) was not written — no test pins T1–T5 or the row label (N9).

## 6. Test quality — PASS WITH NOTES

apps/web/lib/ops/refund-by-hand.test.ts does assert behaviour, not only mocked returns: exact call order of plan / sent / failed (`calls` array), `createRefund` call count, amounts, idempotency keys and `metadata.vamos_intent`, the seven positional plan arguments, zero calls on `sk_live_`, `ops_refund_intent_failed` not called after an accepted refund, `p_void` true on `charge_already_refunded`. A wrong order, a second create or a wrong key would fail these.
Weak points: mocked rows are JS numbers and ISO strings (the driver returns int8 / sums as strings); every "resumed" case also has `attempts: 1`, so deleting the `resumed === true` half of refund.ts:361 would not fail any test; the route's mail rule is only a source-text pin.

Three most valuable missing tests:
1. Case (g) second press: plan returns `state intended, attempts 0, resumed true` and Stripe already has the refund → `createRefund` 0 calls, `sent` once. This is the one line that stops a double refund after the 24 h key window.
2. The contract against the real functions through the Worker's postgres client (string int8, no array types): plan → sent → settle on a local database, including `full-refund-only` and `refund-exceeds-remaining` raised by SQL and mapped by `mapRefundSqlError`.
3. Retry after a Stripe refusal (B2): same intent, second attempt must reach Stripe as a new request, and a Stripe refund with status `failed` found by `findRefundByIntent` must not be taken as sent.

## 7. Un-applied patches — PASS WITH NOTES

- 20-10-bookings-write.patch: removes `applyStripeRefund` / `loadCapturedPaymentRow`, calls `finishPaidCancel(env, {booking_id, refund_mode, refund_rappen, stripe_payment_intent_id: null})`. Matches `ops_cancel_booking`'s return (MIG:216-226: `refund_mode`, `refund_rappen int4`) and the new database state (`pending_ops` + owed for > 24 h paid, MIG:305-317). No Stripe call; mail line `full_captured` (T4) for `auto_full` > 0, `pending_ops` (T5) inside 24 h; mail is de-duplicated by `claimThenSend` (notify-lifecycle.ts:144-146) and best-effort. Correct against decision 1 and answer 6.
- Note: it mails on every staff cancel that reaches `ops_cancel_booking`, also an unpaid one (line "none"). The owner's answer is about a paid booking; guard with `if (row.paid)` unless that mail is wanted (N16).
- 20-10-bookings-write-test.patch: new staff-cancel-by-hand.test.ts asserts 0 `createRefund` calls and the mail line per tier; the pin in refund.test.ts flips to "no applyStripeRefund / createRefund / record_booking_refund in bookings-write.ts". Good.
- 20-10-paid-cancel-cleanup.patch: deletes `applyStripeRefund`, its types, `markRefundFailed`, `liveKeyRefused` and their tests. Right only after patch 1 (last caller). The guard at refund.ts:295 is not touched.

## NOTES

- N1 refund.ts:355-399: the `try` that ends in "mark failed" also covers `payoutFactsFromRefund` and the status check after Stripe accepted. A throw there marks an accepted refund `failed` (the next Retry finds it at Stripe, so no double payment). Move everything after a returned refund id out of that `try`.
- N2 refund.ts:361: use `intent.resumed !== false || attempts > 0` (or always look at Stripe first unless the intent was created in this very call). Today a non-boolean `resumed` would silently skip the lookup.
- N3 Mail: "Refund issued" is sent on every `ok` answer (route.ts POST), so once per payment when the admin sends two payments one at a time, and twice on a double click. Send only when `dueRappen === 0`, or de-duplicate per booking.
- N4 `charge_already_refunded` → `void` (refund.ts:387) records nothing. If the money did leave by another unrecorded way (old `processing` row), the booking shows "Refund due" for ever. No owner-approved "Stop" (answer 8); needs a hand fix when it happens.
- N5 P4 plan says "Try again posts `{retry:true}`": for an old `failed` row without intents that answers `nothing-to-retry`. Fall back to `{}`.
- N6 Old rows (`none` + owed > 0, `failed`) are outside the full-tier rule (spec B.1, no backfill). Say so to the owner if such rows exist on live.
- N7 `ops_refund_plan` does not look at `bookings.status`: the API refunds a booking that is neither cancelled nor finished. Same as before 20-10; the dashboard shows no button for it.
- N8 Customer row words "Processing" / "Failed" (vamos-manage-ticket.js:186-188) during an unfinished refund, right after "our team sends it". Not approved wording.
- N9 Missing `refund-texts-20-10.test.ts` (spec 3.1).
- N10 Next voucher (lib/checkout/voucher-badge.ts) still says "Refund under review" + amount for a full-tier booking; owner answer 2/3 label not applied there.
- N11 With `sk_live_` keys no refund is possible by any path (cancel sends none, admin refund answers `stripe-test-only`). The guard removal (spec D.3) must land before live keys.
- N12 Deploy order: migration, then Worker at once (case k).
- N13 After the hosted apply, read back `has_function_privilege('authenticated' / 'anon', …)` for the four new functions; the file only revokes from `public` (same convention as the neighbours, pgTAP checks it locally).
- N14 Unused dict entry app/vamos-i18n-dict.js:1867 still says "Automatic full refund…".
- N15 `ops_cancel_booking` returns `text[]` to the Worker client (pre-existing).
- N16 Staff-cancel patch mails unpaid cancels too.
- N17 `refund_owed_rappen` for the full tier is the sum of all captured payments, not net of earlier refunds; the `refunded >= owed` rule works because every refund writer also raises `refunded_rappen`.
