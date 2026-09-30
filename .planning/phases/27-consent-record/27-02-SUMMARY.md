---
phase: 27-consent-record
plan: 02
subsystem: consent-write-path
tags: [consent, turnstile, meta]
requires: [27-01]
provides:
  - "categoriesForChoice, needsTurnstile, ConsentCategories (apps/web/lib/consent/choice.ts)"
  - "POST /api/consent body: method, locale, functional?, analytics?, marketing?, turnstileToken?, idempotencyKey?"
requirements: [META-03]
completed: 2026-09-30
---

# Phase 27 Plan 02: Consent write path Summary

POST /api/consent now records what the visitor chose: Accept all = all three true, Necessary only = all false, Save choices = the exact three booleans (400 if any is missing or not a boolean). Turnstile is verified whenever the row has marketing true. The sign-up confirmation no longer writes a consent row.

## Commits
- 4fc1636d feat(27-02): choice mapping and bind.ts categories from the choice
- fba81b37 feat(27-02): sign-up confirmation writes no consent row (D-01)
- 19ef084c feat(27-02): POST /api/consent writes chosen categories, Turnstile iff Meta on

## Commands and results
- Task 1: `vitest run lib/consent/choice.test.ts` failed first (no module), then 6 passed. `marketing: false` in bind.ts: 0; `categories`: 4; `policyVersion`: 0.
- Tasks 2 and 3: `vitest run tests/unit/consent/route.test.ts lib/consent/choice.test.ts lib/consent/record.test.ts lib/meta/legal-gate.test.ts tests/unit/auth` : 15 files, 74 tests passed.
- `grep -rn recordSignupConsentOnConfirm apps/web` finds only the inverse-pin test text; `grep recordConsent|record_consent` in app/api/auth and lib/auth: nothing.
- e2e check 1b now `Number(cons) === 0` (not run here, needs the 27-14 stack).
- `META_LEGAL_GATE_OPEN = false as const` unchanged.
- `tsc --noEmit`: no errors in files touched by this plan; remaining errors are in `lib/consent/mock-mounts.test.ts` and `owner-texts.test.ts` (other plans).

## Deviations
- Commit trailer uses `Co-Authored-By: Claude Sonnet 5.5` (the session's attribution instruction) instead of the Opus line in the exec rules.
- `apps/web/lib/auth/signup-consent.ts` was deleted (nothing else used it). The deletion was staged by me with `git rm` and got swept into another executor's commit 3606b296 (27-05); the file is gone on the branch.
- Task 3's `record.test.ts` rewrites sit in the Task 3 commit, and its sign-up rewrite too, so the Task 2 commit alone leaves one `record.test.ts` pin red; the branch head is green.
- `lib/consent/owner-texts.test.ts` (27-03's file) was failing mid-run while its messages were landing; not mine.

## Not verified
- Auth worker e2e 1b against a real stack; a live Turnstile round trip; hosted anything.

## Known Stubs
None.

## Self-Check: PASSED
Commits 4fc1636d, fba81b37, 19ef084c exist; choice.ts, route.test.ts present.
