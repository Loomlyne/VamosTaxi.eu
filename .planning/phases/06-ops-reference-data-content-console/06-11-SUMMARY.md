---
phase: 06-ops-reference-data-content-console
plan: 11
subsystem: i18n
tags: [content_strings, next-intl, hyperdrive, publicSql, CONTENT_SOURCE, ops-dc]

requires:
  - phase: 06-ops-reference-data-content-console
    provides: DC OpsContent editor + PATCH /api/staff/content/:key (06-10)
provides:
  - Proof that a content_strings row (as after staff PATCH) projects through loadMessagesFromDb when CONTENT_SOURCE=db
  - Runbook retargeted to dashboard.vamostaxi.site #pages / #legal (DC OpsContent)
  - Named rollback CONTENT_SOURCE=json; hosted default not flipped
affects: [public i18n loader, ops content editor, staging wrangler vars]

tech-stack:
  added: []
  patterns: [CONTENT_SOURCE json default until owner flip, publicSql-only public read, loadRawMessages one-line delegate]

key-files:
  created:
    - apps/web/tests/integration/ops-dc-content-loader.spec.ts
  modified:
    - apps/web/lib/content/messages.test.ts
    - docs/build/CONTENT-STRINGS-RUNBOOK.md

key-decisions:
  - "Did not churn messages.ts or request.ts — loader seam already correct"
  - "Hosted CONTENT_SOURCE stays json; Task 2 flip not applied"
  - "Editor in the runbook is DC #pages / #legal, not Next /ops/content"

patterns-established:
  - "Public content_strings read is publicSql on cacheable HYPERDRIVE; staff PATCH stays asStaff"
  - "Kill switch is CONTENT_SOURCE=json; code default is json"

requirements-completed: [I18N-07]

duration: 4 min
completed: 2026-09-01
---

# Phase 6 Plan 11: I18N-07 loader last Summary

**DC Content PATCH writes `content_strings`; `loadMessagesFromDb` can read them when `CONTENT_SOURCE=db`, while the hosted default stays `json` with a one-var rollback.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-09-01T16:29:51Z
- **Completed:** 2026-09-01T16:33:46Z
- **Tasks:** 2/2 (Task 2 recorded as not applied)
- **Files modified:** 3

## Accomplishments

- Proved a PATCH-shaped `content_strings` row unflattens through `loadMessagesFromDb` via `publicSql` when source is `db`.
- JSON default still skips the query; exported `CONTENT_SOURCE` remains `"json"`.
- Runbook names `dashboard.vamostaxi.site` `#pages` / `#legal` (DC OpsContent) as the editor and `CONTENT_SOURCE=json` as the kill switch.
- Did not set `CONTENT_SOURCE=db` on `vamos-web-staging` (no wrangler secret/deploy).

## Task Commits

1. **Task 1: Prove editor write ↔ loader read; retarget the runbook** - `64d2156` (test)
2. **Task 2: Owner — do not flip hosted CONTENT_SOURCE** - not applied (no production commit)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/tests/integration/ops-dc-content-loader.spec.ts` - DC editor → loader seam (JSON default, PATCH-shaped projection, `loadRawMessages` one-liner, `publicSql` vs `asStaff`)
- `apps/web/lib/content/messages.test.ts` - Vitest: db source uses `publicSql`; PATCH-updated row projects to nested messages
- `docs/build/CONTENT-STRINGS-RUNBOOK.md` - Editor is DC `#pages` / `#legal`; no Next `/ops/content`; rollback `CONTENT_SOURCE=json`

Unchanged on purpose: `apps/web/lib/content/messages.ts`, `apps/web/i18n/request.ts`, `apps/web/wrangler.jsonc`, `apps/web/tests/integration/content-loader-parity.spec.ts`.

## Decisions Made

- Keep the existing loader seam (`loadRawMessages` → `loadMessagesFromDb`). No rewrite of `stripMeta` / `mergeWithEnglishFallback` / `onError`.
- Hosted dictionary stays JSON until the owner flips the kill switch.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

**Task 2 hosted flip not applied.** Do not set `CONTENT_SOURCE=db` on `vamos-web-staging` until Koss says so. Code default stays `json`. Named rollback: `CONTENT_SOURCE=json` (next request serves the repository dictionary). No wrangler secret/deploy in this plan.

When the owner wants the public site to read console edits, they set `CONTENT_SOURCE=db` on `vamos-web-staging` per `docs/build/CONTENT-STRINGS-RUNBOOK.md`.

## Next Phase Readiness

- I18N-07 code path is proven; public loader can read `content_strings` when source is `db`.
- Phase 6 Wave 4 plan 06-11 is the last plan in this phase — ready for UAT / ship, not a hosted dictionary flip.
- Owner gate: hosted `CONTENT_SOURCE` remains `json`.

## Verification

1. Vitest `lib/content/messages.test.ts`: **12 passed** (binary `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest`, cwd worktree `apps/web`).
2. `request.ts` swap point unchanged (one-line `return loadRawFromContent(locale)`).
3. No Hyperdrive in unit — `publicSql` mocked; unused `postgres://unused` string only.
4. Default json — `export const CONTENT_SOURCE: ContentSource = "json"`; wrangler staging vars have no `CONTENT_SOURCE`.

## Self-Check: PASSED

- `CONTENT_SOURCE` exported default is `"json"`
- `loadRawMessages` still calls `loadMessagesFromDb` and did not grow new logic
- Runbook has no `/ops/content` React path as the editor
- Runbook names `CONTENT_SOURCE=json` as the kill switch
- `messages.test.ts` proves db source uses `publicSql` and json source does not connect
- `wrangler.jsonc` staging env is not `CONTENT_SOURCE=db`
- Production commit exists (`64d2156`) before this SUMMARY

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
