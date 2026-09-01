---
phase: 06-ops-reference-data-content-console
plan: 08
subsystem: api
tags: [ops, reviews, staff-json, photos, dc-mock]

requires:
  - phase: 06-ops-reference-data-content-console
    provides: withStaff / jsonOk / jsonErr dual-mount /api/staff/*; POST /api/photos/upload; lib/ops/reviews.ts moveReview setReviewPublished
provides:
  - GET/POST /api/staff/reviews dual-mounted at (ops) and app/api/staff/reviews
  - PATCH/DELETE /api/staff/reviews/:id (fields, published, move up/down)
  - window.VamosReviews remote store — empty until GET /api/staff/reviews
  - OpsReviews.dc.html file control POSTs /api/photos/upload kind=review
affects: [06-09, home Reviews, public reviews reader]

tech-stack:
  added: []
  patterns:
    - Staff reviews JSON via withStaff; PATCH { move: "up"|"down" } / { published } / fields
    - DC mock persistence is /api/staff/reviews; no localStorage seed
    - Avatar upload is mandatory file control → POST /api/photos/upload kind=review (key only)

key-files:
  created:
    - apps/web/app/[locale]/(ops)/api/staff/reviews/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/reviews/[id]/route.ts
    - apps/web/app/api/staff/reviews/route.ts
    - apps/web/app/api/staff/reviews/[id]/route.ts
    - apps/web/tests/integration/ops-dc-reviews.spec.ts
    - apps/web/lib/ops/reviews-json.test.ts
  modified:
    - app/vamos-reviews.js
    - app/ops/OpsReviews.dc.html

key-decisions:
  - "Empty list [] is the shipping state (D-35) — no invented quote text"
  - "Reorder is PATCH move up/down via existing moveReview — no drag library (D-25)"
  - "Avatar is POST /api/photos/upload kind=review; data: URIs render as none (D-22)"

patterns-established:
  - "Pattern: dual-mount staff JSON under [locale]/(ops)/api then re-export app/api with force-dynamic"
  - "Pattern: DC file control POSTs absolute /api/photos/upload with credentials include — never readAsDataURL"

requirements-completed: [OPS-08]

duration: 15min
completed: 2026-09-01
---

# Phase 6 Plan 08: Reviews publish/hide/reorder + mandatory photo Summary

**Staff reviews JSON (GET/POST/PATCH/DELETE `/api/staff/reviews`) dual-mounted for the DC mock, empty remote `VamosReviews` (no localStorage seed), arrows-only reorder, and a mandatory file control that POSTs `/api/photos/upload` `kind=review`.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-01T16:20:00Z
- **Completed:** 2026-09-01T16:34:23Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Dual-mounted GET/POST `/api/staff/reviews` and PATCH/DELETE `/api/staff/reviews/:id` wrap `createReview` / `updateReview` / `setReviewPublished` / `moveReview` / `deleteReview` with `withStaff` (JSON 401 when unauthenticated)
- `window.VamosReviews` hydrates from the staff API; `all()` is `[]` until rows exist — no fake quotes, no `localStorage`
- OpsReviews file control POSTs absolute `/api/photos/upload` (`credentials: include`, `kind=review`); no `readAsDataURL`; reorder is arrows only

## Task Commits

1. **Task 1: Reviews JSON** - `0cf6a07` (feat)
2. **Task 2: Empty remote VamosReviews + photo + mock bind** - `29aa137` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/app/[locale]/(ops)/api/staff/reviews/route.ts` - GET list + POST create
- `apps/web/app/[locale]/(ops)/api/staff/reviews/[id]/route.ts` - PATCH fields/published/move + DELETE
- `apps/web/app/api/staff/reviews/route.ts` - re-export GET, POST
- `apps/web/app/api/staff/reviews/[id]/route.ts` - re-export PATCH, DELETE
- `app/vamos-reviews.js` - remote empty store
- `app/ops/OpsReviews.dc.html` - arrows, empty copy, mandatory photo upload
- `apps/web/tests/integration/ops-dc-reviews.spec.ts` - 401 + empty list + mock contracts
- `apps/web/lib/ops/reviews-json.test.ts` - worktree-safe file-contract vitest

## Decisions Made

- Empty `[]` is shipping (D-35); home is not given invented review copy
- One PATCH endpoint for fields, `published`, and `move` up/down (D-25)
- Photo is the existing photos API; `data:` avatars do not paint

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Worktree-safe reviews JSON vitest**
- **Found during:** Task 2 verification
- **Issue:** `tests/integration/ops-dc-reviews.spec.ts` is excluded from vitest; importing `staff-json` from a unit test pulls `@supabase/ssr`, which is not in the worktree
- **Fix:** Added `lib/ops/reviews-json.test.ts` that asserts dual-mount, move/publish, empty store, and photo POST via file reads only
- **Files modified:** `apps/web/lib/ops/reviews-json.test.ts`
- **Verification:** main vitest binary, cwd worktree `apps/web`: 16 passed (`reviews-json` + `staff-json`)
- **Committed in:** `29aa137` (Task 2)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Needed so the unit gate can run in a worktree without `pnpm install`. No scope creep.

## Issues Encountered

- Worktree `tsc --noEmit` cannot resolve `next` / `@opennextjs/cloudflare` (no `node_modules`; install and symlink forbidden). Main `apps/web` `tsc --noEmit --pretty false` is inherited red: `lib/ops/invite.test.ts` TS2704/TS2540 `NODE_ENV` — not in this plan’s `files_modified`.
- Vitest: `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest run lib/ops/reviews-json.test.ts lib/ops/staff-json.test.ts` → **16 passed**.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ops can publish/hide/reorder reviews so the public home reader can change without a deploy
- Photo keys are the same photos API as fleet (06-04)

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
