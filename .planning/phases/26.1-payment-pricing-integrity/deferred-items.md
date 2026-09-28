# Deferred items — Phase 26.1

Out-of-scope discoveries found during plan execution. Not fixed by the plan
that found them (Scope Boundary rule) — listed here for the phase owner /
next plan to pick up.

## RESOLVED in wave 3 gate — `pnpm db:seed:check` fails — `price.line.airport_fee` missing from `seed.sql`

- **Found during:** 26.1-06, Task 1 verification (`pnpm db:seed:check`)
- **Cause:** commit `e413d456` (plan 26.1-04, already on this branch before
  26.1-06 started) added `price.line.airport_fee` to
  `apps/web/i18n/messages/{en,de,fr,ar}.json` but did not regenerate
  `packages/db/supabase/seed.sql` (`pnpm db:seed:gen`). The generator's
  `content_strings` count is 2502; the committed seed file still says 2501.
- **Scope:** `apps/web/i18n/messages/*.json` and `packages/db/supabase/seed.sql`
  are not in 26.1-06's `files_modified` list, and the gap predates 26.1-06's
  own first commit on this branch — not caused by this plan's changes.
- **Fix (for whichever plan/wave owns it):** `pnpm db:seed:gen` from a
  worktree with local Supabase running, then commit the regenerated
  `packages/db/supabase/seed.sql`.

## Rate-version labels accumulate " draft" words

- **Found during:** 26.1-14 live read-back (2026-09-28).
- **What:** live v18 and draft v19 labels read "Staging matrix — placeholder, not owner-approved draft draft draft …". The draft-copy/clone path appears to append " draft" to the label on every copy.
- **Impact:** cosmetic; the "placeholder, not owner-approved" wording is still present.
- **Fix:** find the clone path in `apps/web/lib/ops` (rate-book draft copy) and stop appending; the owner can reset the label text in the dashboard.

## Legacy zones typed 'other'

- **What:** `zrh-airport`, `gva-airport`, `zurich-city` have `zone_type = 'other'`.
- **Impact:** none on the airport fee (Mapbox/flight driven). City pairs created from ops now get Mapbox-typed zones (26.1-10).
- **Fix (optional):** retype via ops or owner SQL once the owner confirms.

## RESOLVED in 26.1-18 — Customer cancel copy still shows the old ≤6 h "no refund" window (26.1-17)

- **Found during:** 26.1-17 (D-24 SQL tiers).
- **What:** `apps/web/app/api/manage/booking/route.ts` `cancelWindow()` and `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx` `cancelWindowOf()` still classify ≤6 h (and after pickup) as `none`. ConfirmationClient hides the cancel confirm in that window (`canConfirmCancel = … windowKind !== "none"`) and shows `cancelSheetClose` copy. SQL now makes every paid cancel inside 24 h `pending_ops` (admin reviews).
- **Impact:** a customer inside 6 h is told there is no refund and cannot confirm the cancel from that screen, although the admin would now review it.
- **Fix:** 26.1-18 (refund UI) or a follow-up: align both helpers with D-24 (>24 h auto_full, else pending_ops for paid bookings) and review the copy in four languages. Owner signs the wording.

## RESOLVED in 26.1-18 — Refunds are now admin-only (26.1-17)

- **What:** `POST /api/staff/bookings/:id/refund` moved from `withStaff` to `withAdmin`. A dispatcher's Refund button in `app/ops/OpsDetail.dc.html` now answers 403 `not-admin`.
- **Fix:** 26.1-18 hides or disables the button for dispatchers and adds the percentage / decline / post-trip controls.

## RESOLVED in 26.1-19 — Confirmation page read does not carry refund facts (26.1-18)

- **Found during:** 26.1-18 Task 3.
- **What:** `guest_confirmation_read` / `customer_confirmation_read` (`20260924004100_confirmation_read.sql`) return no `refund_status`, `refund_owed_rappen` or `refunded_rappen`. The voucher's refund row (status word + amount, D-23a) is fed only by the cancel response on the same page view; after a reload it is absent. `/api/manage/booking` already carries all three.
- **Fix:** a migration that adds the three columns to both functions' `booking` object, plus `booking-read.ts` `VisibleBooking` fields. Needs the local Supabase (pgTAP), so it was not done in 26.1-18.
- **Resolved:** `20260928170000_confirmation_refund_facts.sql` adds `refund_status`, `refund_owed_rappen`, `refunded_rappen` to `confirmation_payload`'s `booking` object (both reads call it; grants unchanged). `VisibleBooking` maps them (`refundStatus`, `refundOwedRappen`, `refundedRappen`). pgTAP `confirmation_refund_facts.test.sql`, vitest `booking-read.test.ts`.

## Cancellation policy copy still describes the 6 h tier (26.1-18)

- **What:** `apps/web/i18n/messages/*.json` keys `24-hours-to-6-hours-before-pickup`, `6-hours-through-pickup-and-after-pickup` and `from-6-hours-before-pickup` (legal/policy table) still describe the pre-D-24 tiers. `checkout.cancelSheetClose` ("Too close to cancel here. Call us.") is no longer rendered.
- **Fix:** owner legal copy. Not rewritten by an agent.

## OPEN for 26.2 — The screen totals any priced extra; the server charges three kinds only (pre-Ship verification, 2026-09-28)

- **Found during:** pre-Ship verification at f966e25d (`26.1-VERIFICATION.md`, warning 2).
- **What:** the checkout total adds every selected amount-kind extra from the price book that the lock does not pin (`apps/web/lib/checkout/extras-catalog.ts` `extraRappenOutsideLock`). The intent body sends child seat, oversized luggage and extra stop only (`CheckoutClient.tsx` `quoteExtras`), and the server recognises those three only (`lockHasExtra`; `apps/web/lib/checkout/intent.ts:321-324`). A fourth kind of passenger extra with a price would show in the total and would not be charged or recorded.
- **State on live, read-only check 2026-09-28 22:45 (+04):** `GET /api/checkout/extras` returns one extra, `child-seat`. The gap cannot occur with today's price book.
- **Operating rule until fixed:** do not add a new kind of passenger extra in the dashboard.
- **Owner decision 2026-09-28:** deferred to 26.2, not part of the 26.1 Ship.
- **Fix:** the server prices every selected catalog extra from the price book (or the screen shows only the extras the server charges); tests on both sides.

## OPEN for 26.2 — Smaller checkout items from the pre-Ship verification (2026-09-28)

- A second tab that reprices the same quote leaves the first tab with an expired Stripe session until it is reloaded. Pay fails without a charge (`apps/web/lib/checkout/intent.ts:494-497`).
- A network error or timeout on the intent request still counts toward the six automatic attempts even when the lock changed during the request (`CheckoutClient.tsx` `startPayment`).
- The wiring of `CheckoutClient.tsx` is covered by source-assertion tests only; there is no component harness for that file. Owner UAT is the behavioural proof.
- A lock that pins a coupon the quote refused records a redemption when the coupon is valid at payment. Reachable only by a hand-built API request (`intent.ts:341-368`).
- A permanent settle error is acknowledged without an alert (`apps/web/lib/checkout/settle.ts:282-293`).
