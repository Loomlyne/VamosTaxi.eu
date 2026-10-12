---
phase: 30
slug: vehicle-class-lifecycle
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-12
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: `30-RESEARCH.md` "Validation Architecture".

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.11 (unit, vm-loaded DC files); pgTAP through the native test lab; browser through a test-lab brief run by `vamos-tester` |
| **Config file** | `apps/web/vitest.config.ts` (includes `lib/**`, `tests/unit/**`) |
| **Quick run command** | `node scripts/sync-dc-mock-to-public.mjs && cd apps/web && ./node_modules/.bin/vitest run <touched test files>` (never `pnpm exec` in a worktree) |
| **Full suite command** | `pnpm gate:local` (lead only, once at phase end); DB: `scripts/test-lab/lab.sh pgtap p30` and `pnpm test:db-lab` |
| **Estimated runtime** | ~60 seconds touched files; ~15 minutes full gate |

---

## Sampling Rate

- **After every task commit:** run the touched test files only (parallel agents never run the full suite: it overloads the Mac).
- **After every plan wave:** `vitest run lib/ops lib/pricing lib/dc-mock-urls.test.ts`, plus `lab.sh pgtap p30` when SQL changed.
- **Before `/gsd:verify-work`:** `pnpm gate:local` once by the lead, `db:types:check`, then the test-lab brief.
- **Max feedback latency:** 120 seconds per task.

---

## Per-Task Verification Map

Requirement level (task IDs are filled by the planner in each PLAN.md `<verify>`; the plan checker checks continuity):

| Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|-------------|----------|-----------|-------------------|-------------|--------|
| CLS-01 | ADD CLASS (both creation paths) inserts a Draft (`active=false`); a Draft never reaches the public board | vitest + pgTAP | `vitest run lib/ops/vehicle-class-draft-birth.test.ts`; `lab.sh pgtap p30` | ❌ W0 | ⬜ pending |
| CLS-02 | Go live refused with the missing list; succeeds only with photo + live-book row; never writes `rate_versions`; non-admin 42501; bad transition refused | pgTAP + vitest | `lab.sh pgtap p30` (`vehicle_class_lifecycle.test.sql`); `vitest run lib/ops/vehicle-class-status-http.test.ts` | ❌ W0 | ⬜ pending |
| CLS-03 | DRAFT badge opens the Go live dialog; items from server `missing`; why-line order Photo, Seats, Bags, Price; GO LIVE disabled while anything is missing | vitest vm (OpsPricing) | `vitest run lib/ops/ops-dc-class-lifecycle.test.ts` | ❌ W0 | ⬜ pending |
| CLS-04 | Retire dialog: reason ≤ 140, count line, last-Live warning (Live, no other Live), RETIRE enabled; edit panel has no Delete | vitest vm | `vitest run lib/ops/ops-dc-class-lifecycle.test.ts lib/ops/ops-dc-editor-foot.test.ts` | partly | ⬜ pending |
| CLS-05 | Retired list hidden at 0; Bring back returns a Draft; sr-only announce | vitest vm + pgTAP | as CLS-03; `lab.sh pgtap p30` | ❌ W0 | ⬜ pending |
| CLS-06 | New price book (clone) skips retired classes; retire strips the class from an open draft book; frozen books keep rows | pgTAP + db-lab | `lab.sh pgtap p30`; `pnpm test:db-lab` | ❌ W0 | ⬜ pending |
| CLS-07 | `/api/quote` and the live board omit Draft and Retired; chauffeur class options are Live only | vitest | `vitest run lib/pricing/public-board.test.ts lib/ops/ops-dc-class-pickers.test.ts` | extend + ❌ W0 | ⬜ pending |
| CLS-08 | Chauffeurs: red flag, Live-only class select, WITH A CLASS counts Live only, editor keeps an untouched class, server refuses a retired class write | vitest | `vitest run lib/ops/ops-dc-chauffeur-class.test.ts lib/ops/chauffeur-class-keep.test.ts` | exist (update) | ⬜ pending |
| CLS-09 | `ops_assign_leg` refuses a retired-class chauffeur (`class-retired`, 409); picker hides them; left-out line replaces the false note | pgTAP + vitest | `lab.sh pgtap p30` (`assign_retired_class.test.sql`); `vitest run lib/ops/assign.test.ts` | ❌ W0 / extend | ⬜ pending |
| CLS-10 | Arabic count forms 1, 2, 3–10, 11–99, 100+ in the Retire and Assign lines | vitest | `vitest run lib/ops/ops-dc-arabic-count-lines.test.ts` | ✅ | ⬜ pending |
| CLS-11 | `/chauffeurs[/<id>]` serve the console; `/fleet…` forward (307); no `OpsFleet` left; no visible "fleet"/"vehicle" on the screen | vitest + grep | `vitest run lib/dc-mock-urls.test.ts lib/ops/ops-console-paths.test.ts` | ❌ W0 | ⬜ pending |
| CLS-12 | About title in 4 languages, both VehicleClasses copies byte-identical, dead strings gone, `i18n:check` | vitest + script | `vitest run lib/vehicle-classes-title.test.ts`; `pnpm i18n:check` | ❌ W0 | ⬜ pending |
| CLS-13 | One-off removal script: aborts on count mismatch or unlisted reference; deletes exactly 5 classes + 5 reviews; triggers re-enabled; backup copies | local proof (native lab only) | `bash scripts/p30-local-proof.sh` (refuses a non-local URL) | ❌ W0 | ⬜ pending |
| CLS-14 | State changes write `audit_log`; four laws (no glow, no tint, CHF 000, four languages); `VamosLocale.coverage` empty | pgTAP + vitest + test lab | `lab.sh pgtap p30`; `pnpm i18n:check`; test-lab brief | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/db/supabase/tests/vehicle_class_lifecycle.test.sql` — CLS-02, 04, 05, 06, 14
- [ ] `packages/db/supabase/tests/assign_retired_class.test.sql` — CLS-09 (do not weaken `assign_by_class.test.sql`)
- [ ] `apps/web/lib/ops/vehicle-class-status-http.test.ts`, `vehicle-class-draft-birth.test.ts` — CLS-01, 02
- [ ] `apps/web/lib/ops/ops-dc-class-lifecycle.test.ts` — CLS-03, 04, 05
- [ ] `apps/web/lib/ops/console-paths.ts` + `ops-console-paths.test.ts` — CLS-11
- [ ] `apps/web/lib/vehicle-classes-title.test.ts` — CLS-12
- [ ] `scripts/p30-local-proof.sh` + `docs/runbook/p30-remove-test-classes.{sql,md}` — CLS-13

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pricing, Chauffeurs, booking detail and About at 1440/1024/768/390 in en/de/ar | CLS-03…CLS-12, CLS-14 | Visual layout and RTL need a browser | Test-lab brief (`.planning/templates/TEST-BRIEF.md`) run by `vamos-tester` on lab data only |
| Removal script on live | CLS-13 | Live data; owner-run only | Koss runs the runbook after the archive tag and a different-model check |
| A card payment after deploy (4242) | all | Tests do not prove checkout | Controller/owner after deploy; read `booking_payments` |

---

## Validation Sign-Off

> `nyquist_compliant` stays `false` and these boxes stay unticked until the plan checker passes the revised plans; only then are they set.

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
