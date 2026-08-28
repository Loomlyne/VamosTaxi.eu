---
phase: 05-public-surfaces-customer-accounts
plan: 07
subsystem: ui
tags: [auth, forms]

requires:
  - phase: 05-01
    provides: signOutAction
  - phase: 05-03
    provides: i18n keys
provides:
  - AuthForm
  - ResetForm
  - isVerifiedPath
affects: [05-16]

tech-stack:
  added: []
  patterns: ["controlled auth presentation, no supabase"]

key-files:
  created:
    - apps/web/components/auth/types.ts
    - apps/web/components/auth/AuthForm.tsx
    - apps/web/components/auth/ResetForm.tsx
    - apps/web/app/[locale]/dev/auth/page.tsx
    - apps/web/tests/visual/auth-forms.spec.ts
  modified: []

key-decisions:
  - "Passkey/verifying not ported; ops surface not ported; registered banner gallery-only"
  - "isVerifiedPath = mode === signin || method === magic (D-06)"
  - "AuthFormProps/AuthSubmitPayload/ResetFormProps as PLAN interfaces"

requirements-completed: [AUTH-01, AUTH-02]

duration: 25min
completed: 2026-08-28
---

# Phase 05: 05-07 auth form presentation

**AuthForm + ResetForm. 60 snapshots. 74 passed.**

## Task Commits

1–3. `b8282ec` feat(05-07)

## Verification

- typecheck, i18n, lint:css green
- auth-forms 74 passed

## Self-Check: PASSED
