---
phase: 27-consent-record
plan: 14
subsystem: verification
tags: [gates, hand-over, consent]
requirements: [META-03, META-04, META-05]
key-files:
  created:
    - .planning/phases/27-consent-record/27-HANDOVER.md
  modified: []
metrics:
  completed: 2026-09-30
---

# Phase 27 Plan 14: full gate set and hand-over Summary

PARTIAL: every gate ran on the merged tree; all pass except two committed Playwright specs (`auth-flows`, `auth-confirm-email`), which fail under `next dev` because sign-up now needs a database binding that `next dev` does not have. Blocker returned to the control session; see 27-HANDOVER.md.

## Task 1

- Gate met: 27-13 "PRECONDITION MET", 27-17/15/16 "COMPLETE: D-03a built", 27-18 "COMPLETE: D-36 built".
- `git log -3`: e6c606cb (merge of origin/main), 4ede17a1, e5d76ec4. origin/main `3b4f86d826829c7f7031e95624c1e6876b3a7a4a`, already an ancestor (no new merge).
- Ship day 2026-09-30: `CONSENT_POLICY_VERSION` and `CONSENT_UPDATED` both already `2026-09-30`; `ACCOUNT_NOTICE_VERSION` 2026-09-29 unchanged. No file changed, no commit.
- `pnpm db:seed:check`: no drift, no regeneration.

## Task 2

Every gate with command and result is in the "Checks" table of 27-HANDOVER.md. Highlights: unit 2914 web tests pass; pgTAP 85 files / 1938 tests pass; from-zero replay of 118 migrations; typecheck, lint, lint:css, five check scripts, i18n, seed, types, both builds pass; Worker e2e 50 PASS, 0 FAIL (1a0, 1a, 1b, 3b included); consent-banner 9/9 at 390; signup-agreement 56/56; must-not greps clean; numstat exactly `1 1 checkout.css`. Stack stopped, `docker ps | grep -c vamos-taxi-270` is 0, no process left in the worktree.

## Task 3

27-HANDOVER.md written with all sections.

## Deviations from Plan

- [Rule 3 - Blocking] The unit run hung: `service-role-laws.test.ts` walks leftover ignored Next build folders and a regex spins. Deleted the ignored folders `.next-consent-27-*`, `.next-locale-follow`, `.next-pay-link-visual` (generated output, not tracked). Test fixed by the delete, not by a source change.
- `auth-flows.spec.ts` and `auth-confirm-email.spec.ts` could not run as committed (hard-coded ports 54322/54324, forbidden here; mail via hook, not Mailpit; no `next dev` database binding). Ran temporary copies with ports, hook off and a temporary Hyperdrive block (all reverted or deleted). Not weakening: failure stated first in the hand-over.
- The local stack was restarted once with the mail hook switched off in the scratch config `/tmp/vamos-sb27` (never in the repo) for those two specs, then stopped.
- Role passwords for `vamos_edge` and `vamos_public` were set on the 59322 container only, after pgTAP.

## Not verified

See "Not verified" in 27-HANDOVER.md.

## Self-Check: PASSED

27-HANDOVER.md exists; no push, deploy or hosted write.

## Follow-up (2026-10-01)

The two auth specs now reach the database through the `staging` dev binding (`VAMOS_DEV_WRANGLER_ENV`), ports come from `VAMOS_TEST_*` variables, and the three selector faults are fixed. Gate 18c passes 12 of 12 on the 59322 stack, five runs in a row. Details in the "Blocker closed" section of 27-HANDOVER.md. Commit: `test(27-14): auth specs reach the database through the staging dev binding`.
