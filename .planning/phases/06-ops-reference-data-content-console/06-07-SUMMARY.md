---
phase: 06-ops-reference-data-content-console
plan: 07
subsystem: ops
tags: [pricing, rate_versions, sqlstate, completeness, publish]
requires:
  - phase: 06-ops-reference-data-content-console
    provides: "06-04 admin/dispatcher fixtures and role-gate; 06-02 requireAdminClaims / asStaff; 06-03 nav hides Pricing from dispatcher"
provides:
  - "mapSqlState / OPS_SQLSTATE shared by every later console Server Action (06-08…06-17)"
  - "loadRateVersions + loadCompleteness mirroring tg_rate_version_transition"
  - "admin /ops/pricing draft→publish with completeness checklist and two-step Dialog"
  - "publishRateVersion UPDATE status = 'live'; createDraftVersion insert without status"
affects: [06-08, 06-09, 06-10, 06-11, 06-12, 06-13, 06-14, 06-15, 06-16, 06-17]
tech-stack:
  added: []
  patterns:
    - "Console Server Actions branch on err.code via mapSqlState, never err.message"
    - "Publishing is UPDATE rate_versions SET status = 'live', never INSERT live"
    - "NULL priced columns render through money(null) / formatAmount as CHF 000"
key-files:
  created:
    - apps/web/lib/ops/sqlstate.ts
    - apps/web/lib/ops/sqlstate.test.ts
    - apps/web/lib/ops/pricing.ts
    - apps/web/lib/ops/pricing.test.ts
    - apps/web/app/[locale]/(ops)/ops/pricing/page.tsx
    - apps/web/app/[locale]/(ops)/ops/pricing/actions.ts
    - apps/web/components/ops/PricingVersionList.tsx
    - apps/web/components/ops/PricingCompleteness.tsx
    - apps/web/components/ops/PricingPublishDialog.tsx
    - apps/web/tests/integration/ops-pricing-publish.spec.ts
  modified:
    - apps/web/components/ops/index.ts
    - apps/web/tests/integration/ops-role-gate.spec.ts
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
key-decisions:
  - "Task 1: option-a (version rail + completeness checklist + two-step publish). Parent-locked. Mock per-row live toggle is not built (D-11)."
  - "Publish failure SQLSTATE is 23001 (restrict_violation), not 23514 or P0001 — corrected against 20260823000008_rate_versions.sql"
  - "D-31: draft/live/retired = Badge inverse / outline / danger (charcoal / white-hairline / semantic). No yellow pills."
requirements-completed: [OPS-06]
duration: 90min
completed: 2026-09-01
---

# Phase 06 Plan 07: Pricing rate_versions draft→publish

**Admins see what is still unpriced, cannot publish the seeded draft, and every DB failure maps from SQLSTATE `err.code` — never from message text.**

## Performance

- **Duration:** ~90 min across Task 2 TDD + Task 3 screen
- **Completed:** 2026-09-01
- **Tasks:** 3
- **Files modified:** production files listed above + this SUMMARY

## Accomplishments

- Shared `mapSqlState` / `OPS_SQLSTATE` for every later ops Server Action.
- `loadCompleteness` copies `tg_rate_version_transition`'s three predicates exactly. If that trigger gains a fourth check, this reader must gain it too.
- `/ops/pricing` is admin-only (`requireAdminClaims` + `notFound()` on `not-admin`). Dispatcher nav already hides the item; the route 404s.
- Completeness panel names unpriced classes/surcharges/routes. Publish is disabled while any gap remains; the action also refuses with mapped `23001` and re-queries names.
- Amounts stay `number | null` and render through `money(null)` → placeholder `000`. No CHF figure in fixtures, tests, or seed.

## Task Commits

1. **Task 1: Design review (option-a)** — recorded here; parent-locked before execute. No code commit.
2. **Task 2: SQLSTATE map + completeness reader (TDD)** — `d4d2e20` (test) → `702a847` (feat)
3. **Task 3: Pricing screen + two-step publish** — `dcfceef` (feat)

**Plan metadata:** this commit

## Task 1 decision

**Select: option-a.** Version rail + completeness checklist + two-step publish Dialog.

Confirmation copy (en, translated in de/fr/ar):

> This becomes the price of every new quote; it cannot be edited afterwards, only superseded.

## SQLSTATE map (import this from 06-08…06-17)

| code | kind | i18n key |
|------|------|----------|
| `23001` | restrict | `ops.pricing.failure-restrict` |
| `23505` | unique | `ops.pricing.failure-unique` |
| `23514` | check | `ops.pricing.failure-check` |
| `42501` | privilege | `ops.pricing.failure-privilege` |
| `P0002` | no-data | `ops.pricing.failure-no-data` |
| other | unknown | `ops.pricing.failure-unknown` |

**Correction vs 06-CONTEXT / 06-RESEARCH:** publish / illegal-transition / frozen-row / append-only raises use `errcode = 'restrict_violation'` → **`23001`**. `23514` is check_violation (published stamp / rappen domain). `P0001` is never used on these paths.

`grep -c message apps/web/lib/ops/sqlstate.ts` → 0. Call sites pass `err` (or `{ code }`) into `mapSqlState`; they never read `err.message`.

## Reciprocal note for `tg_rate_version_transition`

`apps/web/lib/ops/pricing.ts` `loadCompleteness` mirrors the three completeness predicates in `packages/db/supabase/migrations/20260823000008_rate_versions.sql`. Changing one without the other makes the checklist disagree with the publish gate.

## Decisions Made

- option-a (D-11). Not the mock's per-row live toggle.
- Badge tones for version status: inverse (draft / charcoal), outline (live / white-hairline), danger (retired). `StatusBadge` is booking-lifecycle only and cannot render draft/live/retired.
- Empty child set is complete per the trigger (no available/active/live rows still NULL). The fully-priced spec proof inserts such a version inside a rolled-back transaction and writes **no** rappen (D-32).

## Deviations from Plan

- **StatusBadge vs Badge.** Plan Task 3 named `StatusBadge` charcoal/success/muted. That component's union is booking statuses only. Implemented with `Badge` inverse/outline/danger to satisfy parent D-31 (charcoal / white-hairline / semantic danger-success) and the no-yellow-pill rule.
- **`ops-role-gate.spec.ts` un-fixme.** Not in `files_modified`, but Task 3 action requires un-fixme of the 06-04 parked admin `/ops/pricing` assertion.
- **Playwright / `pnpm lint:css` not executed in this worktree.** Executor must not start Docker / `db:start`. `ops-pricing-publish.spec.ts` throws with `pnpm db:start && pnpm db:reset` when local auth is down (no `test.skip`). Unit vitest (12) and `node scripts/check-i18n-coverage.mjs` passed. No CSS files added.

**Total deviations:** 3 (component mapping, required un-fixme, inherited live-stack gate)
**Impact on plan:** no scope creep; D-11/D-13/D-14/D-32 hold.

## Issues Encountered

Worktree has no `node_modules`. Vitest ran via main `apps/web/node_modules/.bin/vitest` with worktree cwd (vamos-gsd-execute). Project `tsc -p` not run here (inherited worktree constraint). `packages/db/supabase/seed.sql` unchanged.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 06-08…06-17 should `import { mapSqlState, OPS_SQLSTATE } from "@/lib/ops/sqlstate"` rather than invent a second map.
- 06-15 owns editing draft child rows under the tabs; this plan only shows unpriced rows as completeness chrome.
- Publish stays inert until the owner matrix lands (every seed priced column is NULL).

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
