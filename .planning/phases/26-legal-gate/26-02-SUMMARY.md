---
phase: 26-legal-gate
plan: 02
subsystem: ui
tags: [meta, consent, pending-slot, cookies, privacy]

requires:
  - phase: 26-01
    provides: Hard-false META_LEGAL_GATE_OPEN and the red slot pins
provides:
  - Empty Meta banner line, Meta cookie row, and Meta privacy line slots
  - Green slots exist and no sentence pins without a legal sentence
affects: [phase-28-pageview, phase-29-purchase]

tech-stack:
  added: []
  patterns:
    - "Meta blanks are PendingSlot labels, not dictionary keys and not sentences"
    - "Banner slot unmounts with the existing hidden return"

key-files:
  created: []
  modified:
    - apps/web/components/consent/CookieBanner.tsx
    - apps/web/components/consent/CookieBanner.css
    - apps/web/app/[locale]/cookies/page.tsx
    - apps/web/app/[locale]/privacy/page.tsx
    - apps/web/components/legal/LegalPage.css

key-decisions:
  - "Labels are Meta banner line, Meta cookie row, and Meta privacy line. laws.css appends TBC. The label does not contain TBC."
  - "META_LEGAL_GATE_OPEN stays the literal false. CONSENT_POLICY_VERSION stays 2026-09-12."
  - "No legal sentence was written in en, de, fr, or ar."

patterns-established:
  - "One wrapper class per surface: vt-ck-meta, vt-legal-blank--row, vt-legal-blank"
  - "Cookies Meta pill sits after the table, not in a rows entry"

requirements-completed: [META-01, META-02]

duration: 4 min
completed: 2026-09-23
---

# Phase 26 Plan 02: Empty Meta slots Summary

**Three empty Meta TBC slots on the banner, cookies page, and privacy page; the slot pins are green and the measurement flag stays false**

## Performance

- **Duration:** 4 min
- **Started:** 2026-09-23T21:09:01Z
- **Completed:** 2026-09-23T21:13:26Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Banner keeps `t("necessary-cookies-only")` and adds one empty `Meta banner line` slot between the title and the body.
- Cookies page keeps the three duration pills and adds one `Meta cookie row` pill after the necessary table, not inside it.
- Privacy page adds one `Meta privacy line` between the strictly-necessary paragraph and the cookie-policy link. Date pills stay blank.
- `lib/meta/legal-gate.test.ts` is 7 passed, 0 failed. The regression files named in the plan also passed. Neither test file was edited.

## Task Commits

Each task was committed atomically:

1. **Task 1: Banner slot beside Necessary cookies only** - `8600db22` (feat)
2. **Task 2: One cookies row pill and one privacy slot** - `1b55fd7d` (feat)
3. **Task 3: Full pin green, and the files this phase must not touch** - verification only, no product diff

**Plan metadata:** pending docs commit

## Files Created/Modified

- `apps/web/components/consent/CookieBanner.tsx` - Named `PendingSlot` import and one banner slot. No flag import. No script.
- `apps/web/components/consent/CookieBanner.css` - `.vt-ck-meta` only. Logical margin. No transition.
- `apps/web/app/[locale]/cookies/page.tsx` - One row pill after the table. Duration pills unchanged.
- `apps/web/app/[locale]/privacy/page.tsx` - One privacy slot inside section cookies. No new import.
- `apps/web/components/legal/LegalPage.css` - `.vt-legal-blank--row` and `.vt-legal-blank`. `.vt-legal-meta` unchanged.

## Decisions Made

- Followed the locked labels. Did not invent legal copy. Did not type TBC into a label.
- Did not edit `legal-gate.ts`, `legal-gate.test.ts`, `policy.ts`, `bind.ts`, `PendingSlot.tsx`, `laws.css`, or i18n.
- Did not add a pixel id, `fbevents.js`, a noscript image, a Purchase send, or a Graph call. Did not read `META_CAPI_ACCESS_TOKEN`.
- Did not deploy. Did not push. Did not update STATE.md or ROADMAP.md. Did not mark the phase done.

## Deviations from Plan

None - plan executed exactly as written.

Vitest ran with `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest` and cwd this worktree's `apps/web`. The worktree has no `node_modules`. `pnpm install` was not run. Each verify command still started with `test -f`.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 26-02 is done. The three slots are empty names. `slots exist` and `no sentence` pass because the wrappers exist, not because the pins were loosened.
- Do not mark this phase done. Do not set `META_LEGAL_GATE_OPEN` to true. Necessary cookies only remains. An Accept under `2026-09-12` still records marketing false.
- Pageview and Purchase stay later phases. There is no owner sentence to place.

## Self-Check: PASSED

- FOUND: apps/web/components/consent/CookieBanner.tsx
- FOUND: apps/web/components/consent/CookieBanner.css
- FOUND: apps/web/app/[locale]/cookies/page.tsx
- FOUND: apps/web/app/[locale]/privacy/page.tsx
- FOUND: apps/web/components/legal/LegalPage.css
- FOUND: 8600db22
- FOUND: 1b55fd7d
- legal-gate.test.ts: 7 passed, 0 failed
- regression named files: 34 passed, 0 failed
- META_LEGAL_GATE_OPEN is still the literal false
- No legal sentence added

---
*Phase: 26-legal-gate*
*Completed: 2026-09-23*
