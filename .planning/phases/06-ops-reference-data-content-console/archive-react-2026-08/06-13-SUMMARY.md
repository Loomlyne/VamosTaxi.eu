---
phase: 06-ops-reference-data-content-console
plan: 13
subsystem: ops
tags: [chauffeurs, fleet, OpsPhotoField, asStaff, spoken-languages, licence-state]

requires:
  - phase: 06-03
    provides: ops shell, host gate, staff session
  - phase: 06-04
    provides: staff sign-in / MFA, ops fixtures, asStaff
  - phase: 06-06
    provides: OpsPhotoField, photoUrl, R2 photo prefixes
  - phase: 06-12
    provides: loadVehicleOptions, fleet chrome
provides:
  - Write-free chauffeur reader (list omits licence_number)
  - /ops/chauffeurs roster with Server Actions
  - Spoken-language chips + Zurich licence-state helper
affects: [06-16 content_strings, phase-08 assignment]

tech-stack:
  added: []
  patterns: [write-free lib/ops reader, mutations in route actions.ts, OpsPhotoField reuse]

key-files:
  created:
    - apps/web/lib/ops/chauffeurs.ts
    - apps/web/app/[locale]/(ops)/ops/chauffeurs/page.tsx
    - apps/web/app/[locale]/(ops)/ops/chauffeurs/actions.ts
    - apps/web/components/ops/ChauffeurTable.tsx
    - apps/web/components/ops/ChauffeurTable.css
    - apps/web/components/ops/ChauffeurForm.tsx
    - apps/web/components/ops/LanguageChips.tsx
    - apps/web/tests/integration/ops-chauffeurs.spec.ts
  modified:
    - apps/web/components/ops/index.ts
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json

key-decisions:
  - "SPOKEN_LANGUAGES: en de fr ar it es pt ru tr sq hr pl. Dictionary stem ops.spoken.* because ops.language is an existing string key."
  - "LICENCE_EXPIRING_WITHIN_DAYS = 60, computed on Europe/Zurich civil dates."
  - "List projection omits licence_number; detail is loaded by URL id only."
  - "Licence expiry field is Input type=date, not the booking DatePicker widget."
  - "user_id is never selected or written."

patterns-established:
  - "ON DELETE SET NULL on default_vehicle_id is proven through the vehicles screen, not a second query."

requirements-completed: [OPS-06]

duration: 40min
completed: 2026-09-01
---

# Phase 06 Plan 13: Chauffeur roster

**Dispatcher-writable chauffeur table at `/ops/chauffeurs`. Photos via 06-06, vehicles via 06-12 `loadVehicleOptions`. Licence numbers stay in the form.**

## What shipped

- `loadChauffeurs` / `loadChauffeur` via `asStaff`. List query has no `licence_number` column.
- `licenceState` against Zurich wall-clock; expired/expiring sort to the top of the active group and render `--vt-danger`.
- Five Server Actions: create, update, status, active, delete. `updated_at = now()` in the statement.
- Initials fallback (`Avatar`) is the zero-photo path (D-22). `OpsPhotoField kind="chauffeur"`.
- Language chips over the closed spoken list; ISO codes stay LTR.

## Verification

| Check | Result |
| --- | --- |
| `node scripts/check-i18n-coverage.mjs` | passed (2298 keys) |
| stylelint ChauffeurTable.css | passed |
| `node scripts/check-db-access-fences.mjs` | inherited fails on prior ops actions / nav.ts; chauffeurs files not in the fail list |
| `pnpm typecheck` | skipped — worktree has no `@types/node` |
| `ops-chauffeurs.spec.ts` | not run — no local Docker stack; spec skips with `run pnpm db:start && pnpm db:reset from packages/db` |

Acceptance greps: yellow 0, warning tone 0, licence_number in table 0, OpsPhotoField present, no data URI / PHOTOS.put, no user_id, no log(), loadVehicleOptions present, no audit_log writes.

## Deviations

- Spoken-language copy lives under `ops.spoken.*` not `ops.language.*` — `ops.language` is already the nav string `"Language"`.
- DatePicker from the booking widget is not used for licence expiry; a date input stores `YYYY-MM-DD` / NULL.
