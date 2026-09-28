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

## Customer cancel copy still shows the old ≤6 h "no refund" window (26.1-17)

- **Found during:** 26.1-17 (D-24 SQL tiers).
- **What:** `apps/web/app/api/manage/booking/route.ts` `cancelWindow()` and `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx` `cancelWindowOf()` still classify ≤6 h (and after pickup) as `none`. ConfirmationClient hides the cancel confirm in that window (`canConfirmCancel = … windowKind !== "none"`) and shows `cancelSheetClose` copy. SQL now makes every paid cancel inside 24 h `pending_ops` (admin reviews).
- **Impact:** a customer inside 6 h is told there is no refund and cannot confirm the cancel from that screen, although the admin would now review it.
- **Fix:** 26.1-18 (refund UI) or a follow-up: align both helpers with D-24 (>24 h auto_full, else pending_ops for paid bookings) and review the copy in four languages. Owner signs the wording.

## Refunds are now admin-only (26.1-17)

- **What:** `POST /api/staff/bookings/:id/refund` moved from `withStaff` to `withAdmin`. A dispatcher's Refund button in `app/ops/OpsDetail.dc.html` now answers 403 `not-admin`.
- **Fix:** 26.1-18 hides or disables the button for dispatchers and adds the percentage / decline / post-trip controls.
