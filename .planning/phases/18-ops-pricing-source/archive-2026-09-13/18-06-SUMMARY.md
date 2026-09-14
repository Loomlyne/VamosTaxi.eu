---
phase: 18-ops-pricing-source
plan: 06
subsystem: pricing
tags: [D-02, D-05, D-07, D-09, D-10, D-18, D-27, D-28, D-29, D-30, D-31, D-32, D-33, dual-dc, OpsPricing]

requires:
  - phase: 18-ops-pricing-source
    provides: Overlay Save writes draft kinds; preview/test unpaid/discard/clone staff APIs
  - phase: 18-ops-pricing-source
    provides: Publish-only public_chf + vat_rate_bps in one asStaff tx
provides:
  - Five-tab OpsPricing fare book (Fixed routes · Distance rules · Surcharges & extras · Coupons · History)
  - Header Discard draft + Publish fare book; rail VAT + draft preview recap
  - /coupons gone; dispatcher /pricing is not found
  - VamosOps publish/discard/preview/createTestUnpaid/cloneIntoDraft wired to 18-05 routes
affects: [18-07, 18-08, 18-10]

tech-stack:
  added: []
  patterns:
    - Dual-DC: edit app/ops or app/vamos-ops-data.js then cp byte-equal to apps/web/public/app
    - Overlay Save stays PUT /api/staff/rate-book; Publish is header POST only
    - Failed writes return { ok:false, code } and keep overlay / dialog open

key-files:
  created: []
  modified:
    - app/ops/OpsPricing.dc.html
    - app/ops/OpsSidebar.dc.html
    - app/ops/ops.dc.html
    - app/ops/OpsCoupons.dc.html
    - app/vamos-ops-data.js
    - apps/web/lib/ops/ops-pricing-source.test.ts

key-decisions:
  - "dashboard.vamostaxi.site/pricing is the only fare-book chrome; /coupons is gone"
  - "Dispatcher /pricing is not found, not a disabled editor"
  - "Preview recap is the only draft CHF; never Stripe and never public preferDraft"
  - "VAT rail stays on the draft; Publish extra carries vat_rate_bps; no settings PATCH"

patterns-established:
  - "Five tabs + header Discard/Publish + rail VAT/preview is the OpsPricing layout contract"
  - "VamosOps draft verbs invalidate the rate-book cache only on ok:true"

requirements-completed: [D-02, D-05, D-07, D-09, D-10, D-18, D-27, D-28, D-29, D-30, D-31, D-32, D-33]

duration: 29min
completed: 2026-09-14
---

# Phase 18 Plan 06: Pricing DC Summary

**OpsPricing is a five-tab fare-book editor with Discard/Publish in the header and VAT plus draft preview in the rail; /coupons is gone and dispatcher /pricing is not found.**

## Performance

- **Duration:** 29 min
- **Started:** 2026-09-13T22:56:20Z
- **Completed:** 2026-09-13T23:25:35Z
- **Tasks:** 3 completed
- **Files modified:** 6 git-tracked (public dual copies stay gitignored and byte-equal)

## Accomplishments

- Rebuilt `OpsPricing.dc.html` from 18-UI-SPEC: five tabs, header Discard draft then Publish fare book, rail VAT % (8.1 / 81 bps) plus Start · Kilometres · Bands · Region % · Extras · VAT · Total, Create test unpaid. No charcoal placeholder, no minFare, no EUR/USD columns, no `PATCH /api/staff/settings` for VAT. T en/de/fr/ar same sitting.
- Dropped NAV_BOTTOM `/coupons` and the ops `/coupons` route. Dispatcher `/pricing` renders the existing not-found Card. `OpsCoupons.dc.html` is a comment-only leftover; coupon fields live in the Pricing Coupons tab.
- `VamosOps` now exposes `publish` / `discard` / `preview` / `createTestUnpaid` / `cloneIntoDraft` against the 18-05 staff routes. Failed writes stay `{ ok:false, code }` and do not bust the rate-book cache. Wave 0 + 18-06 `ops-pricing-source.test.ts` is green; VAT field test stays green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rebuild OpsPricing layout per UI-SPEC** - `55560e8` (feat)
2. **Task 2: Drop /coupons and dispatcher /pricing** - `86e9321` (feat)
3. **Task 3: Wire vamos-ops-data to draft APIs and i18n** - `c870036` (feat)

**Plan metadata:** pending this commit (docs: complete plan)

## Files Created/Modified

- `app/ops/OpsPricing.dc.html` — UI-SPEC five-tab fare book; dual-copied to `apps/web/public/app/ops/`
- `app/ops/OpsSidebar.dc.html` — no `/coupons`; NAV_ADMIN keeps Pricing & routes
- `app/ops/ops.dc.html` — no coupons route; dispatcher `/pricing` is not found
- `app/ops/OpsCoupons.dc.html` — folded into Pricing Coupons tab; not served as a page
- `app/vamos-ops-data.js` — draft publish/discard/preview/clone/test-unpaid; `rules` collection
- `apps/web/lib/ops/ops-pricing-source.test.ts` — dual-copy, five tabs, no `/coupons`, clone, CHF only

## Decisions Made

- Overlay Save stays PUT draft. Publish is the header confirm POST to `/api/staff/rate-versions/:id/publish`. Preview and test unpaid never create a Stripe session and never set public `preferDraft`.
- Dispatcher `/pricing` is not found (no disabled chrome). Admin keeps Pricing & routes in NAV_ADMIN.
- VAT on the rail is draft-side. Publish still sends `vat_rate_bps` in the publish extra. No settings PATCH from this page.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Draft VAT has no version-level PUT**
- **Found during:** Task 3 (wire VamosOps)
- **Issue:** OpsPricing already calls `saveDraftVat(bps)` so the rail survives reload, but 18-05 rate-book PUT has no `vat_rate_bps` on the version (only `quote_lock_minutes`). Settings PATCH must not write VAT.
- **Fix:** `VamosOps.saveDraftVat` PUTs `{ kind:"rule", ruleKind:"vat", vat_rate_bps, payload }` onto the draft. Publish still carries `vat_rate_bps` in the extra. Did not expand `rate-book/route.ts` (not in the 18-06 file list).
- **Files modified:** `app/vamos-ops-data.js`
- **Verification:** `ops-pricing-source.test.ts` and `ops-pricing-vat-field.test.ts` green; source has `vat_rate_bps` and `8.1`, not `7.7`; no `PATCH /api/staff/settings`
- **Committed in:** `c870036` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary so the VAT rail has a draft write path without settings PATCH or a new staff route. No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 18-07 (checkout extras from the published book). Dual-DC copies are byte-equal. `public_chf` still false. Stripe still test. Do not invent CHF. Do not apply migrations / `db push` / restore / click Publish / deploy. No React `/ops`.

## Self-Check: PASSED

- key-files.modified exist on disk
- `git log --grep=18-06` returns 3 task commits (`55560e8`, `86e9321`, `c870036`)
- Task 1–3 acceptance_criteria all PASS
- Dual copies byte-equal for OpsPricing, OpsSidebar, ops.dc.html, vamos-ops-data.js (`cmp` + vitest)
- `pnpm --filter web exec vitest run lib/ops/ops-pricing-source.test.ts lib/ops/ops-pricing-vat-field.test.ts` — 2 files, 12 tests passed
- Five tabs, Publish fare book, Discard draft present; no charcoal placeholder, no minFare
- OpsSidebar has no `href /coupons`; ops.dc.html has no `/coupons` route and dispatcher `/pricing` is not found
- Four-language T blocks; Clone into draft; overlap/region Publish warnings; no `\bEUR\b` / `\bUSD\b` in the DC
- vamos-ops-data.js contains `cloneIntoDraft` and POST `.../clone`; no `preferDraft: true`; no Stripe Checkout
- No React `/ops`; no home/checkout/confirmation layout edits
- No migration apply / db push / restore / `public_chf true` / invent CHF / deploy / Publish click

---
*Phase: 18-ops-pricing-source*
*Completed: 2026-09-14*
