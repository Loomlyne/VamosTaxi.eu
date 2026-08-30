---
phase: 05-public-surfaces-customer-accounts
plan: 08
subsystem: database
tags: [postgres, pgtap, contact]

requires:
  - phase: 05-02
    provides: customers auth link
provides:
  - submit_contact_message
  - submit_partner_application
affects: [05-13]

tech-stack:
  added: []
  patterns: ["security definer RPC, no anon table grant"]

key-files:
  created:
    - packages/db/supabase/migrations/20260828000002_contact_forms.sql
    - packages/db/supabase/tests/contact_forms.test.sql
  modified: []

key-decisions:
  - "Mutation check: grant insert to anon made test 13 fail (extra INSERT). Removed; 32/32 green."
  - "Task 3 human-verify OPEN — do not self-approve"

requirements-completed: []

duration: 20min
completed: 2026-08-28
---

# Phase 05: 05-08 contact tables

**Tasks 1–2 done. Task 3 owner checkpoint open.**

## Task Commits

1–2. `8130888` feat(05-08)

## Verification

- db:reset applied `20260828000002_contact_forms.sql`
- contact_forms.test.sql 32/32 PASS
- Mutation: extra `grant insert ... to anon` → test 13 failed Extra privileges INSERT; restored, 32/32 PASS

## Self-Check: PARTIAL (Task 3 open)
