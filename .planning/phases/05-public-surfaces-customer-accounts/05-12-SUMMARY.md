---
phase: 05-public-surfaces-customer-accounts
plan: 12
subsystem: email
tags: [resend, webhooks, i18n]

requires:
  - phase: 05-01
    provides: AUTH_LOCALE_METADATA_KEY
  - phase: 05-03
    provides: auth email keys
provides:
  - renderAuthEmail
  - POST /api/auth/email-hook
affects: [05-16]

tech-stack:
  added: []
  patterns: ["Send Email Hook + escaped templates, no React Email"]

key-files:
  created:
    - packages/emails/src/auth.ts
    - apps/web/app/api/auth/email-hook/route.ts
    - packages/emails/src/auth.test.ts
    - apps/web/tests/integration/email-hook.spec.ts
  modified:
    - packages/emails/package.json
    - apps/web/package.json

key-decisions:
  - "No @react-email. Shared catalogue via apps/web/i18n/messages JSON."
  - "process.env.SEND_EMAIL_HOOK_SECRET fallback so next dev can 401-verify"

requirements-completed: [AUTH-01, AUTH-02]

duration: 25min
completed: 2026-08-28
---

# Phase 05: 05-12 auth emails

**packages/emails + /api/auth/email-hook. Unit 14/14. unsigned POST 401.**

## Task Commits

1–3. `113c345` feat(05-12)

## Verification

- emails typecheck + vitest 14 passed
- web typecheck, db-fences
- email-hook unsigned 401

## Self-Check: PASSED
