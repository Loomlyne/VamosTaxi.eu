---
phase: 18-ops-pricing-source
plan: 05
subsystem: pricing
tags: [D-01, D-03, D-04, D-05, D-07, D-09, D-10, D-18, D-19, D-20, D-33, D-34, vitest, asStaff, withAdmin]

requires:
  - phase: 18-ops-pricing-source
    provides: D-11 live distance recipe (start + all-km per-km + per-class band extras)
  - phase: 18-ops-pricing-source
    provides: Publish-only public_chf + vat_rate_bps in one asStaff tx
provides:
  - Overlay Save writes draft kinds (band/region/rule/coupon) CHF-only with lock hours×60
  - Settings PATCH no longer writes vat_rate_bps; coupons/classes wait for Publish
  - Admin discard / clone / draft preview / test unpaid dual-mounted staff APIs
affects: [18-06, 18-07, 18-08]

tech-stack:
  added: []
  patterns:
    - Dual-mount staff APIs stay locale implementation + app/api/staff re-export
    - Draft preview calls priceQuote on an asStaff book; public engine preferDraft stays host-gated
    - Test unpaid uses createBooking without Stripe or mail; is_test turns Pay off

key-files:
  created:
    - apps/web/app/[locale]/(ops)/api/staff/rate-book/preview/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/rate-book/test-unpaid/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/discard/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/clone/route.ts
    - apps/web/lib/ops/draft-preview.ts
    - apps/web/lib/ops/draft-preview-unpaid.test.ts
    - apps/web/lib/ops/rate-book-draft.test.ts
    - apps/web/lib/ops/draft-vat-coupons.test.ts
  modified:
    - apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/settings/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/coupons/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts
    - apps/web/lib/ops/rate-book.ts
    - apps/web/lib/ops/coupons.ts
    - apps/web/lib/account/bookings.ts
    - apps/web/app/api/account/bookings/route.ts
    - packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql

key-decisions:
  - "quote_rate_book(true) still returns live after first Publish, so preview loads the draft id via asStaff"
  - "Test unpaid cites the live rate_version id for the charge gate; lines/totals come from draft priceQuote"
  - "Account mapper sets pay_url null / payable false when is_test so public Pay stays off"

patterns-established:
  - "Mutating overlay routes stay withAdmin; GET rate-book may stay withStaff"
  - "Preview never sets public engine preferDraft true and never creates a Stripe session"

requirements-completed: [D-01, D-03, D-04, D-05, D-07, D-09, D-10, D-18, D-19, D-20, D-33, D-34]

duration: 22min
completed: 2026-09-14
---

# Phase 18 Plan 05: Draft staff APIs Summary

**Overlay Save, VAT, coupons, and classes stay on the draft; admin preview/test unpaid call `priceQuote` on that book without Stripe, mail, or public `preferDraft`.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-09-13T22:31:29Z
- **Completed:** 2026-09-13T22:53:14Z
- **Tasks:** 3 completed
- **Files modified:** 24

## Accomplishments

- PUT/DELETE `/api/staff/rate-book` stay `withAdmin`. Kinds include band/region/rule/coupon. `moneyFromRappen` is CHF only. Quote-lock hours from the DC become `quote_lock_minutes` at the staff boundary.
- Settings PATCH no longer writes `vat_rate_bps`. Coupons attach `rate_version_id` of the writable draft (percent or amount rappen, trim). Vehicle-classes POST lands on the draft; DELETE 409s when snapshots reference the id.
- Discard / clone / preview / test unpaid are dual-mounted `withAdmin` routes. Preview recap order is start, km, bands, region, extras, VAT, total. Test unpaid inserts via `createBooking` with placeholder Stripe ids (no Checkout session, no mail) then sets `is_test`. Account list maps `is_test` to `pay_url: null` / `payable: false`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Overlay Save = draft kinds, CHF only, lock hours** - `db6c8a4` (feat)
2. **Task 2: Stop instant VAT; version coupons; POST class** - `a131232` (feat)
3. **Task 3: Discard, draft preview, test unpaid APIs** - `2289f19` (feat)

**Plan metadata:** pending this commit (docs: complete plan)

## Files Created/Modified

- `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` — draft kinds, CHF only, hours×60
- `apps/web/app/[locale]/(ops)/api/staff/settings/route.ts` — VAT stripped from PATCH
- `apps/web/app/[locale]/(ops)/api/staff/coupons/route.ts` — draft `rate_version_id`, amount rappen
- `apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts` — POST on draft; DELETE in-use
- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/discard/route.ts` — abandon draft, fork live
- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/clone/route.ts` — fork requested id
- `apps/web/app/[locale]/(ops)/api/staff/rate-book/preview/route.ts` — draft `priceQuote` recap
- `apps/web/app/[locale]/(ops)/api/staff/rate-book/test-unpaid/route.ts` — unpaid insert, `is_test`
- Matching `apps/web/app/api/staff/*` re-exports (`export { POST }` / GET PUT DELETE)
- `apps/web/lib/ops/rate-book.ts` — `loadDraftQuoteBookDoc` / `resolveWritableDraftId`
- `apps/web/lib/ops/draft-preview.ts` — parse + recap + `priceQuote`
- `apps/web/lib/account/bookings.ts` — `pay_url` / `payable` off when `is_test`
- `packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql` — grant `select(is_test)` (unapplied)

## Decisions Made

- After a live row exists, `quote_rate_book(true)` still returns live. Preview loads the draft version id through `asStaff` (`loadDraftQuoteBookDoc`) and still keeps a `quote_rate_book(true)` fallback when no draft row exists.
- `checkout_create_booking` refuses a draft `rate_version_id` at the charge gate. Test unpaid therefore cites the live id on the snapshot and writes draft amounts from `priceQuote`. Before first Publish the route returns `not-live`.
- Public Pay for `is_test` is off in the account mapper now; 18-08 still refuses Checkout intent for `is_test`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Draft book after first Publish**
- **Found during:** Task 3 (preview)
- **Issue:** `quote_rate_book(true)` only falls back to draft when no live row exists, so a post-Publish preview would price the live book.
- **Fix:** `loadDraftQuoteBookDoc` selects the draft id via `asStaff` and builds the same JSON shape. RPC `quote_rate_book(true)` remains the empty-draft fallback.
- **Files modified:** `apps/web/lib/ops/rate-book.ts`, `apps/web/lib/ops/draft-preview.ts`
- **Verification:** `lib/ops/draft-preview-unpaid.test.ts` source-read for `priceQuote` / `quote_rate_book(true)` / no `preferDraft: true`
- **Committed in:** `2289f19` (Task 3)

**2. [Rule 2 - Missing Critical] Charge gate vs draft snapshot**
- **Found during:** Task 3 (test unpaid)
- **Issue:** `checkout_create_booking` raises 23001 when the snapshot cites a draft rate version, so a literal draft id cannot insert.
- **Fix:** Snapshot `rate_version_id` is the live row; amounts/lock come from draft `priceQuote` + `mintLockDeadline`. No Stripe session create. `not-live` 409 when never published.
- **Files modified:** `apps/web/app/[locale]/(ops)/api/staff/rate-book/test-unpaid/route.ts`
- **Verification:** source-read: `createBooking`, `is_test = true`, no `createCheckoutSession` / `sendConfirmation`
- **Committed in:** `2289f19` (Task 3)

**3. [Rule 3 - Blocking] Account `is_test` column grant**
- **Found during:** Task 3 (account mapper)
- **Issue:** `authenticated` / `vamos_guest` bookings SELECT is column-scoped; `is_test` would 42501 after the unapplied 18-03 migration.
- **Fix:** Additive `grant select (is_test)` on the same unapplied migration that adds the column. Did not apply / `db push`.
- **Files modified:** `packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql`
- **Verification:** mapper unit test `is_test` → `pay_url` null; account GET source contains `b.is_test`
- **Committed in:** `2289f19` (Task 3)

---

**Total deviations:** 3 auto-fixed (2 missing critical, 1 blocking)
**Impact on plan:** Required so preview prices the draft after Publish, test unpaid can insert, and the account list can read `is_test` once the migration is applied. No Stripe. No `public_chf`. No invented CHF.

## Issues Encountered

Plan verification `pnpm --filter web exec vitest run lib/ops …` still reports 12 pre-existing failures in 18-06 DC / settings / sqlstate tests (`ops-pricing-source`, `ops-dc-settings`, `customers-board`, `ops-dc-finalize`, `settings.test.ts` missing `vat_rate_bps` in `valid()`, `sqlstate.test.ts`). Out of scope for 18-05. Task 1–3 source-read files plus `lib/quote/engine.test.ts` and `lib/pricing/public-chf.test.ts` are green (54 passed in the Task 3 subset).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 18-06 (Pricing DC). Overlay writes are draft. VAT PATCH is not live. Preview/test unpaid are admin draft paths. `public_chf` still false. Stripe still test. Do not invent CHF. Do not apply migrations / `db push` / restore / click Publish / deploy.

## Self-Check: PASSED

- key-files.created/modified exist on disk
- `git log --grep=18-05` returns 3 task commits (`db6c8a4`, `a131232`, `2289f19`)
- Task 1–3 acceptance_criteria all PASS
- PUT remains withAdmin; rate-book source has no EUR/USD/AED keys; quote-lock hours×60 at staff boundary
- settings PATCH does not write `vat_rate_bps`; `couponInputFromDc` can produce amount rappen; vehicle-classes POST dual-mounted
- All four locale routes exist with matching `app/api/staff` re-exports
- test-unpaid source has no Stripe Checkout session create
- account mapper sets `pay_url` null when `is_test`
- clone route source calls fork with the requested version id
- preview source calls `priceQuote` and not public engine `preferDraft: true`
- `engine.ts` `preferDraft = dashboardHost && env.PRICING_PREVIEW === "true"` unchanged
- No migration apply / db push / restore / `public_chf true` / invent CHF / deploy / Publish click

---
*Phase: 18-ops-pricing-source*
*Completed: 2026-09-14*
