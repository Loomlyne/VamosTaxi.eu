# 20-10 refunds by hand — second independent review

Branch `fix/phase-20-refunds-by-hand` at c41cdff8, worktree `/Users/koss/Developer/vamos-wt/phase-20`. Read-only; no tests run.

## Verdicts

| # | Point | Verdict |
|---|---|---|
| 1 | B1 closed, no cancel reaches Stripe | PASS WITH NOTES |
| 2 | B2 retry key: no second refund | PASS WITH NOTES |
| 3 | Dashboard vs server contract | PASS WITH NOTES |
| 4 | Account refund row (B4) | PASS |
| 5 | Owner rules and earlier Phase 20 fixes | PASS WITH NOTES |

**No blockers found.**

## 1. B1 — closed

- `lib/ops/bookings-write.ts:183-195`: the `auto_full` → `applyStripeRefund` branch is gone. It is replaced by `if (row.paid === true) await finishPaidCancel(env, {..., stripe_payment_intent_id: null})`.
- `lib/lifecycle/paid-cancel.ts:143-159`: `finishPaidCancel` only sends mail (`notifyPaidCancelMails`); it never calls Stripe. `applyStripeRefund` is deleted (-112 lines). Guest (`paidCancelGuest`, :161) and signed-in (`paidCancelCustomer`, :185) cancels both end in `finishPaidCancel`.
- `ops_cancel_booking` (MIG:355-364) returns `v_comp.refund_mode`, so a cancel more than 24 h ahead gets `auto_full` → `full_captured` (T4). Inside 24 h it gets `pending_ops` → T5. That matches owner answer 6. The staff route (`[id]/route.ts:84`) sends no second mail.

Every remaining `createRefund` / `refunds.create` caller in apps/web (`applyStripeRefund` is gone):

| Caller | Who triggers it |
|---|---|
| `lib/ops/refund.ts:399` | Admin click, POST …/refund (`withAdmin`) |
| `lib/checkout/settle.ts:230` (via `deps.refund` → :616) | Automatic: paid Checkout session with no booking (`booking_missing`) |
| `lib/checkout/settle.ts:405` (via :616) | Automatic: `row.refund_required` (double payment, paid after cancel). Kept automatic per owner answer 7 |
| `lib/ops/edit-request.ts:286` | Staff accepts a cheaper paid edit (`acceptPaidEdit`, `edit-accept` route is **`withStaff`**, not admin); `sk_live_` guard at :128 |

No customer or staff cancel path reaches Stripe.

## 2. B2 — no second refund of the same intent

Code: `refund.ts:387-407`. `stripe.ts:242-256`. SQL plan returns `'refund-intent:'||id`, `attempts`, `resumed` (MIG:621-634, 754-762).

- **Search matches create.** Create sets `metadata: { vamos_intent: String(intentId) }` (refund.ts:406). Search matches `r.metadata?.vamos_intent === String(intentId)` (stripe.ts:253). The search ignores the idempotency key, so it finds refunds made under the base key or any bumped `:N` key.
- **Search runs before create** whenever `resumed || attempts > 0`. Every retried or resumed intent is covered.
- **Stripe accepted, response lost.** Error has no `statusCode`, so it is stored as `transport:` and attempts goes up by 1. The next press uses the same key and runs find first, which finds the refund. Fine.
- **Stripe accepted, then `ops_refund_intent_sent` failed** (refund.ts:437-458). The intent stays `intended` and the booking stays `processing`. The next press gets `resumed = true` (MIG:629), and find finds the refund before any create. Fine (c3984e3f pins it).
- **Stripe refused** (`statusCode`) → stored as `stripe:`. The next key is `refund-intent:<id>:<attempts>`. Find returns null (it ignores failed and canceled refunds), then create runs. Correct.
- **Key falls back to the base key.** Sequence: `stripe:` refusal on K, then `transport:` on K:1, then the next press uses the base K again. Stripe replays the stored refusal and the next press bumps the key again. This costs one extra press. It never double-refunds, because find runs first.
- **Concurrent presses** read the same `attempts`, so they use the same key. Stripe dedups, or answers a 409 in-flight conflict, which is recorded as `stripe:` failed. The winning `ops_refund_intent_sent` still settles, and find catches the rest. No double refund.
- **Refund fails at Stripe after we recorded it as sent** (note only). Nothing handles this. `money-events.ts:151` skips non-`succeeded` refunds, and there is no `refund.failed` / `charge.refund.updated` handler. The `booking_refunds` row stays, `refund_status` stays `refunded`, and the customer has already received "Refund issued". The money never went, and no screen shows it. Owner answer 8 does not cover this. Worth a line in the D.3 sandbox proof list.

## 3. Dashboard (app/ops/OpsDetail.dc.html)

Bodies the page can post, checked against `parseRefundBody` (refund-map.ts:150-200) and `checkRequest` (refund.ts:270-310):

- Full tier: `{percent:100}` or `{paymentId, percent:100}` (:1030). Accepted.
- Decided tier, %: `{percent}` or `{paymentId, percent}`, integer 0-100. 0 opens the Decline dialog instead of posting.
- Decided tier, CHF: `{amountRappen}` or `{paymentId, amountRappen}`. The CHF switch is hidden while "All payments" is chosen with ≥2 payments (`exactAllowed`). Percent and amount are never sent together.
- Retry: `{retry:true}` alone (:1252).
- Post-trip accept: `{postTrip:true}`.
- Legacy Refund button: `{}` (:1361).

All of these are accepted.

Error codes:
- `refund-partial` and `stripe-failed` → partial panel with Try again.
- `full-refund-only`, `refund-exceeds-remaining`, `invalid-*`, `already-refunded`, `not-paid`, `nothing-to-retry`, `stripe-test-only` → their own text.
- Everything else (`not-found`, `frozen`, `not-post-trip`, `not-admin`, `csrf`, `unknown`, `network`, and the decision codes) → "Could not refund VT-…" in the inline alert.

Screen rules:
- Full tier: no Decline (`declineShown: reviewNeeded`), no amount field (`decidedShown: reviewNeeded`), a fixed "Full refund: CHF x" line.
- The picker shows only when there are ≥2 captured payments (`pickerShown: multi`).
- Amounts go through `VamosLocale.money(..., 'CHF')`.
- All 20 new keys plus the rewritten `refundBody` exist in en/de/fr/ar and are non-empty.
- The new CSS uses only existing `--vt-*` tokens (all ten checked in design-system/tokens). No colour, shadow or glow; Alerts use `info` / `danger` only.

Notes:
- N-D1 (NOTE, :1035-1038 with `multi` from GET). If GET …/refund has not answered or failed, `payments = []`, so `multi` is false and the CHF switch is offered. On a two-payment booking the server then answers `invalid-body`, and the page shows "Enter a percentage from 0 to 100, or an amount above 0.", which is misleading. Smallest fix: map `invalid-body` to `exactNeedsPayment`, or hide the CHF unit until `rd` has loaded.
- N-D2 (NOTE, :1046). `failTitle` uses `partialTitle` even when nothing went, so it reads "CHF 0.00 refunded. CHF x still due." Cosmetic.
- N-D3 (NOTE, :895 `loadRefund`). The promise has no `.catch`. `VamosOpsApi.request` resolves `{ok:false, code:'network'}`, so this is harmless today.
- N-D4 (NOTE). `chfText` prints `CHF 1250.00` with no thousands mark. The rest of the ops page uses `chfFigure`-style text. Cosmetic.

## 4. B4 — closed

- `api/account/bookings/details/route.ts:17-19`: the email comes from the session (`customerClaims` → `claims.email`).
- :31-34: `customer_booking_extras` (definer) checks ownership by JWT email and returns 404 on a miss before the refund query runs.
- :38-44: the refund query runs as `authenticated`, filtered by `reference` plus `lower(contact_email) = lower(session email)`, and RLS `bookings_select_own` and `bookings_customer_hide_unpaid` still apply. The columns read are granted: `refund_status` and `refund_owed_rappen` by 20260911234758:29, `reference` and `contact_email` by 20260823000021:33.
- `vamos-manage-ticket.js:125-127` copies `refundStatus` and `refundOwedRappen` onto the booking.
- `refundLine` (:183-189): `pending_ops` with owed > 0 → "Full refund · sent by our team"; otherwise → "Refund under review". Same rule as `refundFull` in booking-detail.dc.html:1154 and manage-booking.dc.html:1241.
- After a decided-tier batch is sent, SQL sets owed = refunded and status `refunded` (MIG:497-501), so a partial decision never shows as "Full refund".

## 5. Owner rules and earlier fixes

- F1 (manage-token purpose): the guest cancel path is unchanged.
- F5: the details route derives the customer from the session.
- F8: ownership is checked twice (definer function plus the email filter under RLS). Refund routes are `withAdmin`. `lastErrorOf` reads as staff by a server-side intent id.
- No `sk_live_` guard was removed. No invented amount. `CHF` is the charge currency only.

Notes:
- N-5a (NOTE, owner-visible). `refund/route.ts:82-94` sends "Refund issued" ("The refund for {reference} has been issued") on every complete batch. On a full-tier booking with two payments, where the admin sends one payment at a time as answer 1/4 allows, the customer gets this mail after the first payment while the second is still due, then gets it again. Smallest fix: send only when `result.refundStatus === 'refunded'` (or `result.dueRappen === 0`).
- N-5b (NOTE). `edit-accept` is `withStaff`, so a non-admin dispatcher can send a Stripe refund by accepting a cheaper edit. This predates 20-10 and is not a cancel, but it is the one Stripe refund that does not need the admin's click. Ask the owner whether to make it `withAdmin`.
- N-5c (NOTE). Find is the only guard against a double refund once the key changes, and it reads one page (`limit: 100`, stripe.ts:247) with no pagination. That is safe in practice (well under 100 refunds per PaymentIntent).
- N-5d (NOTE). `refund-by-hand.local.test.ts` does not cover the resumed-after-`ops_refund_intent_sent`-failure path through the real Worker client. `resumed` must arrive as JS `true` (postgres.js parses bool by default, so it should). If it ever arrived as `'t'`, that path would skip find and rely on the 24 h key only. Cheap hardening: `intent.resumed !== false || attempts > 0`, or run find whenever the intent was not created in this same call.
