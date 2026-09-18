---
phase: 17-ops-chauffeur-profile-shift-roster-two-driver-vehicles
plan: 02
subsystem: ops-fleet
tags: [seats, duplicate-email, vitest]

requires:
  - plan: 17-01
provides:
  - Morning/Night assertVehicleSeats
  - duplicate email 409
  - ON CONFLICT insert

key_files:
  - apps/web/lib/ops/vehicle-seats.ts
  - apps/web/lib/ops/chauffeurs.ts
  - apps/web/lib/ops/chauffeurs-write.ts
  - apps/web/lib/ops/fleet-http.ts

key_decisions:
  - "Third chauffeur on a plate is fleet-seat-both-taken"
  - "Same chauffeur cannot occupy Morning and Night"
  - "409 returns existingId so Confirm opens the row"

patterns-established:
  - "Seat keys are exact UI-SPEC copy via chauffeurErrorCopy"

requirements-completed: [D-04, D-05, D-07, D-08]

completed: 2026-09-18
---

# Phase 17 Plan 02 Summary

Morning/Night seats refuse with exact keys. Duplicate email 409. Double-Add INSERT is ON CONFLICT (id) DO NOTHING.
