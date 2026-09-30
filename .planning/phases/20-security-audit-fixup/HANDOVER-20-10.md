# Phase 20 hand-over, plan 20-10: refunds by hand

**Branch:** `fix/phase-20-refunds-by-hand`, origin/main merged at `12c22322`. Not deployed, no hosted SQL.
Plan, the five texts, the answers and the picker design: signed by the owner 2026-09-30
(`.planning/decisions/2026-09-30-refunds-by-hand.md`, build spec section E). Needs his Ship.

## SHIP RULE — migration and Worker together

Apply `20261005140000_refunds_by_hand.sql` and deploy the Worker back to back. An old Worker on the
new database still refunds a customer cancel automatically once (never twice). The later live
migration `20261007100000` only changes grants, so the order is safe.
The three Next strings also live in the hosted `content_strings` table (keys
`legal.tier-full-refund-automatic`, `checkout.cancelSheetFull`,
`legal.automatic-full-refund-of-the-amount-we`): update them at ship, or the old wording can stay.

## What changes for people

| Who | Before | After |
|---|---|---|
| Customer cancels more than 24 h ahead | refunded automatically | booking shows "Refund due"; e-mail and pages say "You get a full refund; our team sends it" |
| Admin cancels a paid booking | refunded automatically, no customer mail | "Refund due", customer gets the cancellation e-mail at once |
| Admin Refund | one payment only; extra fare could never be refunded | pick a payment or all; % or exact CHF; full-refund bookings fixed at 100 % with no Decline |
| One of two refunds fails | "Refund failed", unclear what went | "CHF X refunded. CHF Y still due." + Try again; nothing sent twice |
| Customer Refund row | "Pending Ops" | "Full refund · sent by our team" / "Refund under review" |
| Double payment | automatic refund | unchanged (owner) |

## Commits (after the build spec)

Database `26503661`, `bf3afabd` · Worker `c0d0dd35`, `a98e89b3` · texts `c8b12492`, `4c4527ce`, `c2b26b7f` ·
review fixes `85a3a594` (staff cancel), `4067842b` (retry key), `f02ecaec` (account refund row) ·
tests `c3984e3f`, `06cb1c30`, `660fec9d`, `b812873d` · dashboard `c41cdff8` · mail once `6796032b`. Merge with main `12c22322`: one conflict in `lib/legal/privacy-account-paragraph.test.ts` (main kept the manage-booking "untouched" guard; resolved by removing it, as this plan is the approved change to that page).

## Checks

| Check | Result |
|---|---|
| typecheck, lint, lint:css, i18n:check, check:legal-claims, check:numbers, check:public-env, check:db-fences, db:seed:check, build | exit 0, re-run on the merged tree `12c22322` (lint:css after removing a stale generated `public/assets/lenis.css` left from before main removed Lenis) |
| Unit tests (merged tree) | 2867 pass, 0 fail |
| pgTAP (isolated stack) | 84 files, 2001 tests pass; new `refunds_by_hand.test.sql` 102 |
| DB-backed Worker test (`refund-by-hand.local.test.ts`, real client options) | green on an isolated stack |
| Texts | byte-identical to the decisions file in all four languages (pinned by `lib/legal/refund-texts-20-10.test.ts`) |
| Independent reviews | first: 4 blockers, all fixed; second: no blocker (`20-10-REVIEW.md`, `20-10-REVIEW-2.md`) |
| Dashboard | screenshots at 1440/1024/768/390, de and ar in `20-10-screens/` |

## Migration `20261005140000_refunds_by_hand.sql`

Adds one empty table (`booking_refund_intents`, RLS forced, no public grant) and replaces the
cancel and refund functions. No row changes. Bookings cancelled before keep their state; old
`failed` rows without intents answer "nothing to retry" to Try again (use Refund instead).

## Kept as is

- The `sk_live_` block on the admin Refund (`refund.ts`) and edit-accept stays until the proof below.
- Edit-accept (a cheaper edit refunds the difference) can be pressed by any staff member, not only
  the admin — older than 20-10; owner question.
- A refund Stripe fails later, after we recorded it as sent, is not noticed (the webhook skips
  non-succeeded refunds). Note for later.

## Proof before lifting the live-key block (spec D.3)

On the sandbox: one 4242 booking, customer cancels more than 24 h ahead, admin refunds by hand;
a two-payment booking refunded one payment at a time; a Stripe refusal, fix, Try again within the
hour; read back `booking_refunds`, `booking_refund_intents` and Stripe.

## NOT verified

Nothing on live; no real Stripe refund through the new path; the dashboard against a real Worker
(fixtures only); refunds after the trip still use Accept without the %/CHF switch.

## Owner UAT after the Ship

1. vamostaxi.site → book a trip more than 2 days ahead, pay with 4242 4242 4242 4242. Expected: Booked page.
2. Open the manage link in the confirmation e-mail → Cancel. Expected: the sheet says "This trip will be cancelled. You get a full refund; our team sends it."; after cancelling the Refund row says "Full refund · sent by our team". No refund arrives at Stripe yet.
3. Cancellation e-mail. Expected: "You will get a full refund of the amount you paid. Our team sends it; …".
4. Dashboard → that booking. Expected: "Refund due … Nothing is sent until you confirm.", "Full refund: CHF …", one Confirm refund, no Decline.
5. Press Confirm refund. Expected: "Refund issued"; one "Refund issued" e-mail; Stripe shows one refund.
6. vamostaxi.site/cancellation, section 01. Expected: "Refunded in full to the payment method you used. Our team sends the refund after you cancel; …".
