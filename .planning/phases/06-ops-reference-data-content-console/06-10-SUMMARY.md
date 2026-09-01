---
phase: 06-ops-reference-data-content-console
plan: 10
subsystem: ops-content
tags: [content_strings, i18n, ops-dc, staff-json, pending_value]

requires:
  - phase: 06-02
    provides: withStaff JSON envelope and dual /api/staff mount
  - phase: 06-03
    provides: dashboard host /login so the DC mock can call staff JSON
provides:
  - GET /api/staff/content namespaces + paged keys + legal coverage via asStaff
  - PATCH /api/staff/content/:key language values and /flags three independent $meta fields
  - OpsContent.dc.html per-key editor (en/de/fr/ar) replacing the page-directory mock
affects: [06-11]

tech-stack:
  added: []
  patterns:
    - Dual-mount app/api/staff/* re-export of [locale]/(ops) handlers for DC <base href>
    - Flag PATCH merges omitted fields from the existing row so one boolean cannot clear the others

key-files:
  created:
    - apps/web/app/[locale]/(ops)/api/staff/content/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/content/[key]/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/content/[key]/flags/route.ts
    - apps/web/app/api/staff/content/route.ts
    - apps/web/app/api/staff/content/[key]/route.ts
    - apps/web/app/api/staff/content/[key]/flags/route.ts
    - apps/web/tests/integration/ops-dc-content.spec.ts
  modified:
    - app/ops/OpsContent.dc.html

key-decisions:
  - "Legal coverage is a query on GET /api/staff/content (always loads loadLegalCoverage); #legal stays a hash on ops.dc.html"
  - "Flag writes are PATCH /:key/flags with pendingValue, nonTranslatable, noParamReason — never a translatable boolean"
  - "Do not swap loadRawMessages (D-17 / 06-11); CONTENT_SOURCE remains json"

patterns-established:
  - "Partial flag PATCH loads the row via asStaff then setContentStringFlags with merged values"
  - "DC editor uses absolute /api/staff/content and encodeURIComponent on dotted keys"

requirements-completed: [OPS-09, I18N-07]

duration: 11 min
completed: 2026-09-01
---

# Phase 06 Plan 10: content_strings editor Summary

**OpsContent is a paged per-key `content_strings` editor (en/de/fr/ar plus three independent `$meta` flags) over dual-mounted `/api/staff/content`, with legal coverage on `#legal`.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-09-01T16:16:42Z
- **Completed:** 2026-09-01T16:27:58Z
- **Tasks:** 2/2
- **Files modified:** 8

## Accomplishments

- Staff JSON wraps `loadNamespaces` / `loadContentStrings` / `loadLegalCoverage` and the existing `updateContentString` / `setContentStringFlags` writers. Unauthenticated GET is JSON 401 via `withStaff`. Writes use `asStaff`, not `publicSql`.
- Flag PATCH cannot collapse D-15 into one translatable boolean: omitted fields are merged from the current row so a `pendingValue`-only body leaves `nonTranslatable` and `noParamReason` intact.
- OpsContent.dc.html is no longer a `*.dc.html` directory. Namespace rail, four language fields, three flag controls, charcoal pending chrome (no `--vt-yellow-50`), four-language chrome, legal coverage that names missing locales instead of inventing copy. Imprint TBC is an ordinary `pending_value` row. Become-a-partner is not listed.
- `loadRawMessages` is unchanged (JSON default until 06-11).

## Task Commits

1. **Task 1: Content JSON** - `f1e5547` (feat)
2. **Task 2: Redesign OpsContent.dc.html as the editor** - `1379ca7` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/app/[locale]/(ops)/api/staff/content/route.ts` — GET list + coverage
- `apps/web/app/[locale]/(ops)/api/staff/content/[key]/route.ts` — PATCH language values
- `apps/web/app/[locale]/(ops)/api/staff/content/[key]/flags/route.ts` — PATCH three flags
- `apps/web/app/api/staff/content/route.ts` — dual GET re-export
- `apps/web/app/api/staff/content/[key]/route.ts` — dual PATCH re-export
- `apps/web/app/api/staff/content/[key]/flags/route.ts` — dual flags re-export
- `app/ops/OpsContent.dc.html` — real editor inside the existing dc-import
- `apps/web/tests/integration/ops-dc-content.spec.ts` — 401 envelope, dual mount, three flags, no yellow, loader untouched

## Verification

1. `tsc --noEmit --pretty false` — our routes typecheck. Inherited red: `lib/ops/invite.test.ts` NODE_ENV (not in `files_modified`).
2. Editor talks to `/api/staff/content` (rg + spec).
3. `loadRawMessages` still JSON-default (06-11).
4. Playwright `tests/integration/ops-dc-content.spec.ts --project=component-1440`: **7 passed**.

## Decisions Made

- Nested `/flags` route so the interface path exists and a values PATCH cannot smuggle a single boolean.
- GET always calls `loadLegalCoverage` so D-18 is reachable without a second Next page.
- Pages hash auto-selects the first non-`legal` namespace; `#legal` pins `namespace=legal`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Missing critical] Nested flags route**
- **Found during:** Task 1
- **Issue:** Interface requires `PATCH /api/staff/content/:key/flags` but `files_modified` listed only `[key]/route.ts`.
- **Fix:** Added `[key]/flags/route.ts` plus dual re-export. Partial bodies merge against the existing row.
- **Files modified:** `apps/web/app/[locale]/(ops)/api/staff/content/[key]/flags/route.ts`, `apps/web/app/api/staff/content/[key]/flags/route.ts`
- **Verification:** spec asserts three optional fields and no `translatable?: boolean`
- **Committed in:** `f1e5547`

---

**Total deviations:** 1 auto-fixed (Rule 1).
**Impact on plan:** Required to keep the three `$meta` flags independent. No scope creep.

## Issues Encountered

- Worktree `tsc` / Playwright needed local `node_modules` after a `pnpm --filter web exec tsc` (not committed). Use the worktree `apps/web` Playwright binary so it does not mix with main.
- Inherited `invite.test.ts` typecheck errors — left untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 06-11 (`loadRawMessages` swap). Public loader is still JSON. Do not size remaining content work against ROADMAP's stale ~600-string figure.

## Self-Check: PASSED

- Key files exist on disk
- Production commits `f1e5547`, `1379ca7`
- Acceptance: 401 JSON; three-flag type; `loadLegalCoverage`; editor not a href directory; no `--vt-yellow-50`; four-language chrome

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
