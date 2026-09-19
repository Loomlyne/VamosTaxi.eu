---
phase: 17-ops-chauffeur-profile-shift-roster-two-driver-vehicles
plan: 06
subsystem: ops-fleet
tags: [desk, leak-gate, tdd]

requires:
  - plan: 17-05
provides:
  - Dedicated chauffeur desk Back button
  - No Vehicles/Chauffeurs Tags on desk
  - Save shift / Save leave persist
  - Document GET /api/staff/chauffeurs 308s to the list

key_files:
  - app/ops/OpsFleet.dc.html
  - app/vamos-ops-data.js
  - apps/web/lib/dc-mock-urls.ts
  - apps/web/lib/ops/staff-json.ts

key_decisions:
  - "Desk keeps /fleet/chauffeurs/{id}. List still has Vehicles/Chauffeurs Tags."
  - "Browser document nav to /api/staff/chauffeurs 308s to /fleet/chauffeurs. JSON fetch still hits the staff route."
  - "withStaff never runs the handler on sec-fetch-dest document."
  - "Deploy waits on owner continue. No push main."

patterns-established:
  - "Staff JSON is not a page. Address-bar visits must not paint JSON."

requirements-completed: [D-15, D-16, D-17, D-18]

completed: 2026-09-19
---

# Phase 17 Plan 06 Summary

Dedicated chauffeur page: Button All chauffeurs, no list Tags, working Save shift / Save leave. Staff API document leak gated. Staging deploy waits on **continue**.
