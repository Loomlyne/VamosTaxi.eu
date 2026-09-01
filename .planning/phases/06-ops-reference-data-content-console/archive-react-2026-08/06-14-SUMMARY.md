---
phase: 06-ops-reference-data-content-console
plan: 14
subsystem: ops
tags: [reviews, publish, hide, reorder, OpsPhotoField, asStaff, revalidatePath, i18n]
requires:
  - phase: 06-ops-reference-data-content-console
    provides: "06-04 staff session, MFA fixtures, ops shell; 06-06 OpsPhotoField + PHOTO_PREFIXES"
provides:
  - "Staff reviews publish/hide/reorder on public.reviews"
  - "Locked imported rows gated (ADR-008); dense reorder planner"
  - "ops.reviews-* keys in en/de/fr/ar"
key-files:
  created:
    - apps/web/lib/ops/reviews.ts
    - apps/web/lib/ops/reviews.test.ts
    - apps/web/app/[locale]/(ops)/ops/reviews/page.tsx
    - apps/web/app/[locale]/(ops)/ops/reviews/actions.ts
    - apps/web/components/ops/ReviewTable.tsx
    - apps/web/components/ops/ReviewTable.css
    - apps/web/components/ops/ReviewForm.tsx
    - apps/web/components/ops/ReviewOrderControls.tsx
    - apps/web/tests/integration/ops-reviews-publish.spec.ts
  modified:
    - apps/web/components/ops/index.ts
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
key-decisions:
  - "reviews.ts is a reader/planner/gate only — mutations live in server actions"
  - "Locked rows keep published/sort_order/verified/vehicle_class_id/avatar/route editable; author/body/rating/source/url stay read-only"
  - "HYPERDRIVE is the cacheable public path; wrangler.jsonc declares no max_age, so the screen does not invent a cache window"
patterns-established:
  - "Ops CRUD: requireStaffClaims → assert* → asStaff → revalidatePath; mapSqlState keys, never err.message"
  - "OpsPhotoField kind=review + PHOTO_PREFIXES.reviews; initials Avatar fallback, never a data URI"
requirements-completed: [OPS-08]
---

# Plan 06-14 Summary — Reviews publish / hide / reorder

**Staff reviews list on `dashboard.vamostaxi.site/ops/reviews`: publish, hide, dense reorder, OpsPhotoField avatars, locked imported copy left untouched.**

## Task commits

1. **Task 1 reader** — `0a98808` `feat(06-14): implement reviews reader, planner and locked-row gate`
2. **Task 2 screen** — `1730498` `feat(06-14): add reviews publish/hide/reorder screen`
3. **Task 3 spec** — `c2dd335` `feat(06-14): add OPS-08 reviews publish spec`

## ops.reviews-* keys added

`reviews-add`, `reviews-body`, `reviews-body-ph`, `reviews-cancel`, `reviews-class`, `reviews-class-none`, `reviews-close`, `reviews-delete`, `reviews-delete-body`, `reviews-duplicate`, `reviews-edit`, `reviews-empty`, `reviews-empty-body`, `reviews-error`, `reviews-external-ref`, `reviews-from`, `reviews-hidden`, `reviews-hidden-count`, `reviews-locked`, `reviews-locked-note`, `reviews-move-down`, `reviews-move-up`, `reviews-name`, `reviews-new`, `reviews-order-note`, `reviews-publish`, `reviews-published`, `reviews-published-count`, `reviews-rating`, `reviews-rating-dec`, `reviews-rating-error`, `reviews-rating-inc`, `reviews-remove`, `reviews-role`, `reviews-role-ph`, `reviews-route`, `reviews-save`, `reviews-sort-order`, `reviews-source`, `reviews-source-manual`, `reviews-subtitle`, `reviews-unpublish`, `reviews-unverified`, `reviews-url`, `reviews-url-ph`, `reviews-verified`.

No invented review copy or photos in the dictionary.

## Verification

- Vitest `lib/ops/reviews.test.ts`: 8 passed
- `i18n:check`: passed
- `stylelint` on `ReviewTable.css`: passed (logical properties, no width/height)
- Greps on `reviews.ts`: `postgres`/`@vamos/db` 0, `ADR-008` 2, insert/update/delete on reviews 0, `?? 0` / `?? ""` 0
- Greps on `actions.ts`: lowercase `locked` 0; `assertNotLocked` present; `revalidatePath` on `/`, `/dev/home/reviews`, `/ops/reviews`
- Yellow pills: `--vt-yellow-(50|100|200|300|600|700)` 0; `tone="warning"` 0
- Playwright `@ops-reviews` component-1440: **not run** (worktree has no `apps/web/node_modules`; executor must not `pnpm install`, start Docker, or run `next dev`). Spec throws `run pnpm db:start && pnpm db:reset from packages/db` when Postgres is down.
- `check:db-fences`: this plan's files clean; inherited red on coupons/content/customers/pricing/settings actions + coupons.test.ts
- `tsc --noEmit`: inherited red (`Cannot find type definition file for 'node'`) — no worktree `@types`

## Deviations

- `vehicleClassLabelKey` from 06-12 is not on this branch; the class column renders `slug` untranslated (ADR-012).
- Staging `HYPERDRIVE` is the cacheable public binding; wrangler.jsonc does not declare `max_age`. No cache-window copy was invented. Cached-path invalidation stays 06-16. Spec asserts through `vamos_public`, not Hyperdrive cache.
- Postgres-missing path **throws** the db:start message instead of `test.skip` (parent rule). Remaining `test.skip` is the component-1440 project filter only.
- `reviews.test.ts` is extra vs `files_modified` (colocated TDD, same as 06-08 coupons).
- Extra exports from `reviews.ts`: `ReviewInputError`, `ReviewLockedError`, `ReviewSource`, `ReviewInput`, `AssertedReviewInput`, `mapSqlState`.

## Self-Check: PASSED

Publish/hide/reorder against `vamos_public`: **not live-proven this sitting** (Playwright not run). Re-run `playwright test tests/integration/ops-reviews-publish.spec.ts --project=component-1440` from a tree with `apps/web/node_modules` after `pnpm db:start && pnpm db:reset` from `packages/db`.

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
