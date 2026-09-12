---
phase: 11-launch-cutover
plan: 04
subsystem: api
tags: [public_chf, publish, asStaff, D-18, rate-versions]

# Dependency graph
requires:
  - phase: 11-launch-cutover
    provides: Wave 0 publish-public-chf.test.ts source contract (red until this plan)
  - phase: 11-launch-cutover
    provides: public_chf column on public.settings + quote_rate_book JSON
provides:
  - DC POST /api/staff/rate-versions/:id/publish flips public_chf in the same asStaff tx as status=live
  - publishRateVersion mirrors that SQL
  - quote-publish.md documents Publish-as-flip; PRICING_PREVIEW is not the flip
affects: [11-05, 11-06, 11-07, 11-11, 11-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Publish-as-flip is the DC staff POST path, not only the unused-by-DC server action
    - Completeness 409 incomplete still runs before any UPDATE; no VAT in the gap list

key-files:
  created: []
  modified:
    - apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts
    - apps/web/app/[locale]/(ops)/ops/pricing/actions.ts
    - docs/runbooks/quote-publish.md

key-decisions:
  - "OPS Publish is the only public-CHF switch: same asStaff tx sets status=live and public.settings public_chf=true where id=1"
  - "DC POST path is the live path; dual-mount re-export still re-exports POST"
  - "PRICING_PREVIEW must not appear in the UPDATE; hosted id 5 live is not the flip"

patterns-established:
  - "Staff publish asStaff callback: rate_versions status=live then settings public_chf=true"
  - "jsonOk / jsonFail envelopes; no err.message; withAdmin stays"

requirements-completed: [LAUNCH-06]

# Metrics
duration: 3min
completed: 2026-09-13
---

# Phase 11 Plan 04: Publish-as-flip on DC POST path Summary

**OPS Publish POSTs `/api/staff/rate-versions/:id/publish` and, in one asStaff transaction, sets `rate_versions.status='live'` and `public.settings.public_chf=true`; completeness still 409s before any write**

## Performance

- **Duration:** 3 min
- **Started:** 2026-09-12T23:47:36Z
- **Completed:** 2026-09-12T23:50:36Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- DC staff POST (the click OpsPricing already uses) updates `public.settings set public_chf = true where id = 1` in the same `asStaff` callback as `status = 'live'`
- Completeness gaps still return `jsonFail("incomplete", 409)` before any UPDATE; `withAdmin` unchanged; no public flip API
- `publishRateVersion` mirrors the same SQL so the unused-by-DC action cannot drift
- Runbook: one switch, id 5 live is not the flip, `PRICING_PREVIEW` must not set `public_chf`, public amounts stay CHF 000 until this click

## Task Commits

Each task was committed atomically:

1. **Task 1: GREEN DC POST Publish-as-flip** - `48a4ed7` (feat)
2. **Task 2: Same SQL on publishRateVersion + runbook** - `43febf5` (feat)

**Plan metadata:** (this commit)

_Note: TDD tests already lived in `publish-public-chf.test.ts` from 11-01 (Wave 0). RED was 3 failed / 3 passed before Task 1; GREEN is 6 passed / 6._

## Files Created/Modified

- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts` - asStaff tx also sets `public_chf = true`
- `apps/web/app/[locale]/(ops)/ops/pricing/actions.ts` - same SQL in `publishRateVersion`
- `docs/runbooks/quote-publish.md` - Publish-as-flip (D-18); forbids `PRICING_PREVIEW` as the flip

Unchanged: `apps/web/app/api/staff/rate-versions/[id]/publish/route.ts` still `export { POST }` from the locale ops route. DC `publish()` URL unchanged.

## Decisions Made

- Flip `public_chf` on the DC POST path (not only `actions.ts`) so the owner click is not a no-op
- Completeness still blocks; do not add VAT to the gap list
- No second owner CLI; no `wrangler secret put`; Stripe stays test

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed
**Impact on plan:** None

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Owner Publish click is the public-CHF switch (D-18). Completeness still blocks. D-23: existing live row without this UPDATE still not public CHF
- Ready for remaining Phase 11 plans. Do not apply SQL. Do not deploy. Do not wrangler secret. Stripe stays test

## TDD Gate Compliance

- RED: `publish-public-chf.test.ts` already on branch from 11-01; run before implementation: 3 failed | 3 passed (6)
- GREEN: after both tasks: 6 passed (6)
- No separate `test(11-04)` commit — Wave 0 owned the failing assertions

## Self-Check: PASSED

- FOUND: `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts`
- FOUND: `apps/web/app/[locale]/(ops)/ops/pricing/actions.ts`
- FOUND: `docs/runbooks/quote-publish.md`
- FOUND: `48a4ed7` feat(11-04): flip public_chf on DC publish POST
- FOUND: `43febf5` feat(11-04): same public_chf SQL on publishRateVersion
- Vitest: 6 passed (6) via main `apps/web/node_modules/.bin/vitest run lib/ops/publish-public-chf.test.ts` (cwd worktree `apps/web`)

---
*Phase: 11-launch-cutover*
*Completed: 2026-09-13*
