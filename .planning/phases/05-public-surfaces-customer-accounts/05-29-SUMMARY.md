---
phase: 05-public-surfaces-customer-accounts
plan: 29
subsystem: public-reviews
status: executed
completed: 2026-09-04
---

# Plan 05-29: Public published-only reviews GET — execution summary

## Delivered

- Added `GET /api/reviews` (`apps/web/app/api/reviews/route.ts`) plus `loadPublishedReviews` (`apps/web/lib/public/reviews.ts`) over `publicSql`. SQL is `where r.published = true`. Response envelope `{ ok: true, data }` omits `locked`.
- POST/PATCH/DELETE return 405. Route does not import `withStaff` / `asStaff`.
- Public home hydrates `GET /api/reviews`. Ops host (`dashboard.*`) still lists/writes `/api/staff/reviews`.
- `#reviews` is wrapped in `sc-if hasReviews`. Zero published rows hide the block. Pending-notice markup and placeholder `sc-for` count 5 are gone.

## Commits

- This summary lands with the 05-29 code commit.

## Verification

Passed:

- `pnpm --filter web exec vitest run tests/unit/public-reviews-route.test.ts` — 4 tests
- Route source has no `withStaff` / `asStaff`

Not run (plan forbade): full `pnpm run lint` / `typecheck` / `build`. No staging deploy.

## Self-check

- `apps/web/app/api/reviews/route.ts` exists.
- `app/vamos-reviews.js` hydrates `/api/reviews` off ops host.
- `app/home/Reviews.dc.html` has no `data-rv-note` markup; `hasReviews` gates `#reviews`.
