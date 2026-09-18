---
phase: 17-ops-chauffeur-profile-shift-roster-two-driver-vehicles
plan: 04
subsystem: ops-fleet
tags: [dc, fleet-desk, i18n]

requires:
  - plan: 17-03
provides:
  - OpsFleet desk DC
  - ops.dc.html loads OpsFleet
  - four-lang copy

key_files:
  - app/ops/OpsFleet.dc.html
  - app/ops/ops.dc.html
  - app/ops/OpsTable.dc.html

key_decisions:
  - "Live import is OpsFleet, not OpsFleetBoard"
  - "Add overlay pins UUID so double Add is one row"
  - "Empty live/past copy is UI-SPEC two-line"

patterns-established:
  - "Morning/Night named seats replace chauffeurIds multi"

requirements-completed: [D-01, D-07, D-10, D-14]

completed: 2026-09-18
---

# Phase 17 Plan 04 Summary

Ops shell loads OpsFleet. Desk has Morning/Night, overlay verbs, empty live/past, past bookings. Four langs.
