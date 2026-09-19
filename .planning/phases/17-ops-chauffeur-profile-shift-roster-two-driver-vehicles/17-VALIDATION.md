---
phase: 17
slug: ops-chauffeur-profile-shift-roster-two-driver-vehicles
status: planned
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-18
---

# Phase 17 — Validation Strategy

> CONTEXT.md D-01…D-18 win. Host `dashboard.vamostaxi.site`. No `.eu`. No invented CHF.
> Agent does not `db push`. No driver app. No auto-dispatch.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (`apps/web`) + source-read tests |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `pnpm --filter web exec vitest run lib/ops/chauffeurs lib/ops/chauffeurs-duty lib/ops/vehicle-seats lib/ops/ops-chauffeur-desk lib/ops/fleet-http lib/ops/chauffeurs.test` |
| **Full suite command** | `pnpm --filter web exec vitest run lib/ops` + `pnpm run typecheck` |
| **Estimated runtime** | ~60 seconds |

Do **not** `vitest run tests/integration/*.spec.ts` unless a plan says so.

---

## Sampling Rate

- **After every task commit:** Vitest on files that task touched
- **After every plan wave:** quick command + typecheck
- **Before `/gsd:verify-work`:** full command green **and** live UAT checklist
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Nyquist: no three consecutive tasks without automated verify. Owner SQL apply is the only manual gate.

| Plan | Task | Automated verify |
|------|------|------------------|
| 17-01 | 1 Wave 0 source-read file | `test -f apps/web/lib/ops/ops-chauffeur-desk.test.ts` + `vitest run lib/ops/ops-chauffeur-desk.test.ts` (may stay red until 17-04) |
| 17-01 | 2 dutyStatus RED then GREEN | `vitest run lib/ops/chauffeurs-duty.test.ts` |
| 17-01 | 3 ignore client status | `vitest run lib/ops/chauffeurs.test.ts lib/ops/chauffeurs-duty.test.ts` |
| 17-02 | 1 seats refuse keys | `vitest run lib/ops/vehicle-seats.test.ts` |
| 17-02 | 2 duplicate email + idempotent id | `vitest run lib/ops/chauffeurs.test.ts lib/ops/fleet-http.test.ts` |
| 17-02 | 3 POST ON CONFLICT source-read | `vitest run lib/ops/ops-chauffeur-desk.test.ts lib/ops/chauffeurs.test.ts` |
| 17-03 | 1 git SQL unapplied | `rg` on the new `*_ops_chauffeur_desk.sql` |
| 17-03 | 2 readers/writers present seats+leave+shift | `vitest run lib/ops/chauffeurs.test.ts lib/ops/vehicle-seats.test.ts lib/ops/fleet-http.test.ts` |
| 17-03 | 3 dual-mount routes | `vitest run lib/ops/chauffeurs.test.ts` + typecheck |
| 17-04 | 1 ops.dc.html import OpsFleet | `vitest run lib/ops/ops-chauffeur-desk.test.ts` |
| 17-04 | 2 desk DC + overlay verbs + no status select | `vitest run lib/ops/ops-chauffeur-desk.test.ts lib/ops/ops-dc-finalize.test.ts` |
| 17-04 | 3 Morning/Night fields + i18n four langs | `vitest run lib/ops/ops-chauffeur-desk.test.ts` + typecheck |
| 17-05 | 1 dash/board KPI computed duty | `vitest run lib/ops/ops-chauffeur-desk.test.ts` |
| 17-05 | 2 dual-DC sync + no Board stale product | `vitest run lib/ops/ops-dc-finalize.test.ts lib/ops/ops-chauffeur-desk.test.ts` |
| 17-05 | 3 [BLOCKING] owner SQL apply | `test -f` migration; owner apply only |
| 17-06 | 1 desk source-read: no Tags on detail, Button All chauffeurs, saveShift/saveLeave not empty | `vitest run lib/ops/ops-chauffeur-desk.test.ts` |
| 17-06 | 2 persist shift + leave from desk PATCH | `vitest run lib/ops/chauffeurs.test.ts lib/ops/ops-chauffeur-desk.test.ts` |
| 17-06 | 3 dual-DC + four langs + typecheck | `vitest run lib/ops/ops-dc-finalize.test.ts lib/ops/ops-chauffeur-desk.test.ts` + `pnpm run typecheck` |

---

## Wave 0 Requirements

- [ ] Source-read: `app/ops/ops.dc.html` imports `OpsFleet` (or `app/ops/OpsFleetBoard.dc.html` exists as the edited source)
- [ ] Source-read: no chauffeur status `<select>` as duty switch in `OpsFleet.dc.html`
- [ ] Source-read: no `chauffeurIds` multi-select; Morning and Night fields present
- [ ] Source-read: overlay verbs `Save chauffeur` / `Save shift` / `Save leave`; dismiss `Keep editing`
- [ ] Source-read: empty live / past copy has a next step; no sample `VT-`
- [ ] `dutyStatus` fixtures: Zurich DST, overnight wrap, leave wins, empty weekdays → off
- [ ] Seat refuse keys: morning taken / night taken / both taken
- [ ] Duplicate email 409 includes `existingId`; idempotent insert same UUID → one row

---

## CONTEXT coverage

| ID | Plan |
|----|------|
| D-01 dedicated page | 17-04 |
| D-02 contents + past bookings | 17-04 |
| D-03 photo | 17-04 (existing control kept) |
| D-04 one-row Add | 17-02 + 17-04 |
| D-05 duplicate email open existing | 17-02 + 17-04 |
| D-06 phone/licence/email assign | existing + 17-04 copy |
| D-07 D-08 seats | 17-02 + 17-03 + 17-04 |
| D-09 D-10 D-11 clock | 17-01 + 17-03 + 17-04 |
| D-12 leave | 17-01 + 17-03 + 17-04 |
| D-13 board/assign | 17-05 |
| D-14 copy four langs | 17-04 |
| D-15 no list Tags on desk | 17-06 |
| D-16 Button All chauffeurs | 17-06 |
| D-17 persist Save shift / Save leave | 17-06 |
| D-18 Keep editing Dialog-only | 17-06 |
