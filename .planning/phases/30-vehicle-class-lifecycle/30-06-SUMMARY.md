---
phase: 30-vehicle-class-lifecycle
plan: 06
subsystem: ops-console-client
tags: [vamos-ops-data, OpsTable, class-lifecycle, pickers]
requires:
  - phase: 30-01
    provides: signed decision 6 (empty seats and bags), sheet-11a and sheet-11b signed 2026-10-12
provides:
  - retireClass as PATCH {id, status:'retired', reason}; deleteClass removed from the store
  - liveClasses() lists only classes whose server status is live; names still maps every class
  - Empty seats and bags stay null through the rate-row clean (numOrNull, rates.blank gives null/null)
  - OpsTable props footDelete, actionsGap, tapArea
affects: [30-07, 30-08]
key-files:
  created: [apps/web/lib/ops/ops-dc-class-pickers.test.ts, apps/web/lib/ops/ops-dc-table-allow-empty.test.ts]
  modified: [app/vamos-ops-data.js, app/ops/OpsTable.dc.html, apps/web/lib/ops/ops-pricing-tabs.test.ts, apps/web/lib/ops/ops-dc-editor-foot.test.ts]
requirements-completed: [CLS-04, CLS-07, CLS-14]
completed: 2026-10-12
---

# Phase 30 Plan 06: Client contract layer Summary

Every class state change in the ops store is now a PATCH, the client DELETE call is gone, staff pickers read the server `status` (Live only), and OpsTable has the three props the Pricing class table needs.

## Tasks

| Task | Commit | Notes |
|------|--------|-------|
| 0 sheet 11 signature gate | - | satisfied: 30-DESIGN-SIGNED.md lines 53-54 record sheet-11a and sheet-11b signed 2026-10-12 |
| 1 ops store: PATCH retire, Live-only pickers, null seats/bags | 878f7bda | `loadLiveClasses` keeps live-book classes whose `status === "live"`; failed GET still gives status "failed" |
| 2 OpsTable props | a00cbf4d | foot Delete is the plain word again (`deleteBtnLabel` removed); `footDelete={false}` hides the slot; `actionsGap`; `tapArea` adds `[data-vt-tap44] button::after{inset:-6px}` |

The sheet-11 prototype (`allowEmpty`, `f.stepValue`, retire-unassigned keys) from 6888c7ac was kept untouched and is now covered by `ops-dc-table-allow-empty.test.ts`.

## Verification

- `vitest run lib/ops/ops-dc-class-pickers.test.ts lib/ops/ops-pricing-tabs.test.ts`: 2 files, 18 tests pass.
- `vitest run lib/ops/ops-dc-editor-foot.test.ts lib/ops/ops-dc-table-allow-empty.test.ts`: 2 files, 12 tests pass.
- Wider regression over every `lib/ops` test whose name mentions table, pricing or class: 16 files, 150 tests pass.
- `node scripts/check-i18n-coverage.mjs`: passed (2699 keys). No new visible strings in this plan.
- Acceptance greps: no DELETE on vehicle-classes in the store, no `deleteClass:`, one `status: "retired"`, two `=== "live"`, three `numOrNull`, no `deleteBtnLabel` in OpsTable, no physical left/right properties in added lines.

## Deviations from Plan

**1. Acceptance criterion not applicable** - the plan asks for `--vt-shadow-accent:none` in `OpsTable.dc.html`. The file never had it at HEAD (it is a component imported by pages; the page files carry the law lines). Nothing was added; no glow or tint was introduced.

**2. Interim behaviour in OpsPricing** - `OpsPricing.dc.html` still calls `ops.deleteClass` behind an `!ops.deleteClass` guard (lines ~1000 and ~1063). With the store method gone, the old delete path falls back to `ops.rates.remove` and the guarded hide path returns early. 30-08 replaces this; OpsPricing was not touched here (not in files_modified).

## Not verified

No browser run, no Worker build; the DC logic is exercised in a vm with stubbed DCLogic only. The Pricing screen's use of the new props arrives in 30-08.

## Known Stubs

None.

## Self-Check: PASSED

Files and commits 878f7bda, a00cbf4d exist.
