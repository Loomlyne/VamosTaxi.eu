---
phase: 17-ops-chauffeur-profile-shift-roster-two-driver-vehicles
plan: 03
subsystem: ops-fleet
tags: [sql, persist, staff-api]

requires:
  - plan: 17-01
  - plan: 17-02
provides:
  - unapplied ops_chauffeur_desk SQL
  - desk persist + present
  - duplicate email on PATCH

key_files:
  - packages/db/supabase/migrations/20260918140000_ops_chauffeur_desk.sql
  - apps/web/lib/ops/chauffeur-desk.ts
  - apps/web/app/[locale]/(ops)/api/staff/chauffeurs/route.ts
  - apps/web/app/[locale]/(ops)/api/staff/chauffeurs/[id]/route.ts

key_decisions:
  - "Missing tables/columns do not 500 the existing fleet list"
  - "Duty is computed on GET; written on persist when schema exists"
  - "Owner applies SQL — agent does not db push"

patterns-established:
  - "isMissingDeskSchema 42703/42P01 fallback"

requirements-completed: [D-03, D-06, D-11]

completed: 2026-09-18
---

# Phase 17 Plan 03 Summary

Git SQL for shift/leave/seats. Worker persist + present. Schema missing is a no-op, not a 500.
