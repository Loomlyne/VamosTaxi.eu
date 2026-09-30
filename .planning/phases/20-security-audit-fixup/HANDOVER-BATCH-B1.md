# Phase 20 hand-over, batch B1

**Branch:** `fix/phase-20-batch-b1`, from origin/main, main merged at `61e74844` (includes 26.5 and the 26.2 hand-over 1).
**Not deployed, no hosted SQL.** Needs the owner's Ship.

## Commits, one finding each

| Finding | Commit | What |
|---|---|---|
| F6 | `12db5bea` | `GET /api/checkout/return`: per-visitor limit (existing `INTENT_RATE_LIMITER`, 8 per 60 s, own key `return:<ip>`) before the Stripe read. Refused = the same 303 to `/checkout?pay=unknown`, no Stripe call; the webhook still settles a real payment. No new binding. |
| F8 | `d36282cf` | `lib/checkout/intent.ts`: on reuse or re-attach of an open unpaid booking, a requester who does not own it gets the Stripe URL only — no manage token, no cookie, no detail overwrite. The owner's device is unchanged. |
| F14 | `67e7bf56` | `/api/quote`, `/api/quote/reprice`, `/api/checkout/price`, `/api/checkout/intent`: explicit 503 `temporarily_unavailable` when `QUOTE_LOCK_SECRET` is empty. |
| G27 | `d0f3638f`, `07b94021` | `PATCH /api/staff/tickets/:id` refuses a body with `reply` (400 `read-only`) before any database or mail call; the reply send path in `tickets-write.ts` is removed. Close, reopen, note, phone, booking ref unchanged. |
| G20 | `8af4f2e7` | Staff booking edit: a present `email` must be a trimmed, non-empty, valid address (checkout's rule, max 254) or 400 `invalid-email`, no write. Absent key = untouched. Since 26.2 the dashboard form sends `email`, so the check applies to it. |
| G2 | `d480c762` | Migration `20261005120000_reviews_column_grants.sql`: whole-table SELECT on `reviews` revoked from anon, authenticated, vamos_public; 14 public columns granted back; authenticated also gets `booking_id` (the account list's `exists` needs it). `rating_chauffeur`, `rating_company`, `rating_overall`, `photo_path`, `external_ref`, `locked`, `updated_at` are no longer readable by those roles. Two existing pgTAP tests adapted. |

Merge conflict with 26.2 (it removed the unused `rejectStaffReply`): resolved by keeping the helper, which G27 now uses.

## Checks on `61e74844`

| Check | Result |
|---|---|
| typecheck, lint, lint:css, i18n:check, check:legal-claims, check:numbers, check:public-env, check:db-fences, db:seed:check, build | all exit 0 |
| Unit tests, full run once | 2754 pass, 1 skipped, 0 fail (276 files) |
| pgTAP on an isolated stack (before the merge of 26.2) | 83 files, 1919 tests, 0 fail; new `reviews_column_grants.test.sql` 24 assertions: 13 failed before, 24 pass after |
| types | generated types identical to `database.types.ts` |
| New tests, each failed first | F6 1, F8 2, F14 4, G27 3, G20 9 |

## Migration

`20261005120000_reviews_column_grants.sql`: revoke and grant only, no row, no policy. Safe on live.
**After applying, before anything else:** `GET https://vamostaxi.site/api/reviews` must still return
the 5 published reviews, and a signed-in customer's Bookings list must load (a missing column
grant shows as an empty list, not an error). Live drift is possible: read back
`has_column_privilege` for `vamos_public` on the 14 columns.

## Not built, with the reason

- **F14, settle re-checks amount and currency.** The expected amount is only returned by the same
  database call that marks the booking paid, so a check in the Worker comes too late; a real check
  needs a change to `checkout_payment_settle`, and Stripe reports the amount in two shapes when the
  customer pays in another currency, which cannot be told apart without real sessions. The price is
  already fixed by the server when the payment page is created and a trigger refuses a charge that
  differs from the saved price. Recommendation: accept as is. Owner question.
- F8, the double-click path (`winner`) still issues a token: same customer, no cookie yet.
- `lib/ops/edit-request.ts:155,464` still has `QUOTE_LOCK_SECRET || ""` (staff path; fails closed).
- Name and phone in the staff edit: an empty string would blank the value; the dashboard form
  now leaves emptied fields out (26.2), the API itself does not guard.

## F3 on live (26.5), re-probed

Per visitor: works, but loose — about 19 requests passed before the first 429 (Cloudflare's
limiter is approximate). Per price: `checkout_note_pay_press` is live and refuses at 5; not
exercised, because checkout shows a Turnstile box and this session completes no bot check.

## NOT verified

- Nothing on live. No real Worker request for F6, F8, F14 (logic and source-order tests only).
- The dashboard signed in (G27, G20).
- pgTAP was run before main's 26.2 merge; 26.2 added no migration, so it was not re-run.

## Owner UAT after the Ship

1. vamostaxi.site → book a test trip, pay with 4242 4242 4242 4242. Expected: you land on the Booked page. (Checkout code changed, so this comes first.)
2. vamostaxi.site home → the reviews section shows the reviews as before.
3. Sign in on vamostaxi.site → Bookings. Expected: your bookings list loads.
4. Dashboard → a booking → Edit → change the e-mail to `abc` → Save. Expected: "Could not apply edit". Change it to a valid address → Save. Expected: saved.
5. Dashboard → Support → open a ticket → Close, then Reopen. Expected: both work.
6. vamostaxi.site/checkout → on one price press PAY six times, ticking a different extra each time. Expected: the sixth shows the limit message.
