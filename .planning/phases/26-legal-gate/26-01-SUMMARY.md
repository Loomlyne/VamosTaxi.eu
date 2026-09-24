---
phase: 26-legal-gate
plan: 01
subsystem: consent
tags: [meta, vitest, consent, legal-gate]

requires:
  - phase: 05-consent
    provides: CONSENT_POLICY_VERSION 2026-09-12 and marketing false on Accept
provides:
  - Hard-false META_LEGAL_GATE_OPEN and metaMeasurementAllowed with no call site
  - Seven named pins in apps/web/lib/meta/legal-gate.test.ts
affects: [26-02, phase-28-pageview, phase-29-purchase]

tech-stack:
  added: []
  patterns:
    - "Measurement stays closed unless META_LEGAL_GATE_OPEN === true"
    - "Wave 0 pins read source; they do not scan pills or env"

key-files:
  created:
    - apps/web/lib/meta/legal-gate.ts
    - apps/web/lib/meta/legal-gate.test.ts
  modified: []

key-decisions:
  - "The flag is the literal false, not env, not a pill scan, not Accept"
  - "slots exist and no sentence stay red until 26-02 adds the empty wrappers"
  - "CONSENT_POLICY_VERSION stays 2026-09-12; no legal sentence was written"

patterns-established:
  - "metaMeasurementAllowed returns true only for META_LEGAL_GATE_OPEN === true"
  - "Pixel id may appear only as a forbidden needle inside legal-gate.test.ts"

requirements-completed: [META-01, META-02]

duration: 12 min
completed: 2026-09-23
---

# Phase 26 Plan 01: Hard-false legal gate Summary

**Hard-false measurement flag with seven source pins; the two slot pins stay red until the empty wrappers exist**

## Performance

- **Duration:** 12 min
- **Started:** 2026-09-23T20:51:14Z
- **Completed:** 2026-09-23T21:03:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- `META_LEGAL_GATE_OPEN` is the literal `false`, typed `as const`. `metaMeasurementAllowed()` returns true only when that constant is `=== true`.
- Five invariant pins pass: necessary-cookies-only remains, policy version unchanged, no fbevents.js, flag off, marketing stays false.
- `slots exist` and `no sentence` fail on a missing wrapper. That red is the done state of this plan. The phase is not green. The gate stays closed.

## Task Commits

Each task was committed atomically:

1. **Task 1: Hard-false flag and the five pins that already pass** - `b70fdd68` (test, RED) then `11595e7b` (feat, GREEN)
2. **Task 2: Slot pins that stay red until the empty slots exist** - `199fa60e` (test)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `apps/web/lib/meta/legal-gate.ts` - Fail-closed flag. No call site. No pixel id. No React import.
- `apps/web/lib/meta/legal-gate.test.ts` - Seven `it()` titles. Slot pins read source and fail while the wrappers are absent.

## Decisions Made

- Flag source is the literal false. Not `process.env`. Not a pill scan. Not Accept. Not `CONSENT_POLICY_VERSION`.
- No legal sentence in a slot, a dictionary, a test assertion message, or this plan's product files.
- Did not edit `policy.ts`, `bind.ts`, CookieBanner, cookies page, privacy page, i18n, PendingSlot, or CSS.
- Did not add a pixel id to product source, a loader, a noscript image, a Purchase send, or a Graph call.
- Did not open secret files or print a token.

## Deviations from Plan

None - plan executed exactly as written.

Vitest ran with the main checkout binary and this worktree as cwd. The worktree has no `node_modules`. `pnpm install` was not run. Each verify command still started with `test -f`.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 26-02. That plan must turn `slots exist` and `no sentence` green without weakening them, and without opening the flag.
- Do not mark this phase done. Do not set `META_LEGAL_GATE_OPEN` to true. An Accept under `2026-09-12` still records marketing false.

## Self-Check: PASSED

- FOUND: apps/web/lib/meta/legal-gate.ts
- FOUND: apps/web/lib/meta/legal-gate.test.ts
- FOUND: b70fdd68
- FOUND: 11595e7b
- FOUND: 199fa60e

---
*Phase: 26-legal-gate*
*Completed: 2026-09-23*
