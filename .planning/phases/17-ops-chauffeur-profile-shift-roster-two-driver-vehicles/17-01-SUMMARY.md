---
phase: 17-ops-chauffeur-profile-shift-roster-two-driver-vehicles
plan: 01
subsystem: ops-fleet
tags: [zurich, duty, vitest, chauffeurs]

requires: []
provides:
  - dutyStatus Europe/Zurich kernel
  - Wave 0 source-read file (red until 17-04)
  - assertChauffeurInput ignores client status
affects: [17-02, 17-03, 17-04, 17-05]

tech-stack:
  added: []
  patterns: [pure Zurich clock in chauffeurs-model]

key-files:
  created:
    - apps/web/lib/ops/ops-chauffeur-desk.test.ts
    - apps/web/lib/ops/chauffeurs-duty.test.ts
  modified:
    - apps/web/lib/ops/chauffeurs-model.ts
    - apps/web/lib/ops/chauffeurs.ts
    - apps/web/lib/ops/chauffeurs.test.ts

key-decisions:
  - "Leave ranges inclusive on Zurich civil dates win over the clock"
  - "end === start is 24h on the selected civil day"
  - "end < start wraps midnight on that civil weekday"
  - "assertChauffeurInput always stores status off; duty is computed on read"
---

# Plan 17-01 Summary

Zurich `dutyStatus` is a client-safe function in `chauffeurs-model.ts`. Client
`status: 'shift'` cannot become duty. Wave 0 DC assertions exist and stay red
until 17-04. No SQL apply. No `.eu`.
