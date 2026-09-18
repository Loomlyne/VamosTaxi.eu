---
phase: 13-staff-apis-outbound-resend-replies
plan: 04
subsystem: emails
tags: [resend, react-email, chrome, wordmark, layout]

requires:
  - phase: 13-02
    provides: lifecycle-mail tokens and Img wordmark analog
provides:
  - Shared chrome.ts hex/fonts/logo (216×30 wordmark)
  - layout.ts BODY_FONT envelope (auth/refund inherit)
  - ConfirmationEmail Img wordmark header
affects: [13-05-contact-staff-reply, 13-06-brand-pass]

tech-stack:
  added: []
  patterns: [shared email chrome tokens, HTML envelope on BODY_FONT, React Img wordmark]

key-files:
  created:
    - packages/emails/src/chrome.ts
  modified:
    - packages/emails/src/lib/lifecycle-mail.tsx
    - packages/emails/src/layout.ts
    - packages/emails/src/ConfirmationEmail.tsx
    - packages/emails/src/__snapshots__/ConfirmationEmail.test.tsx.snap

key-decisions:
  - "D-03 tokens live in chrome.ts; lifecycle-mail re-exports so existing imports keep compiling"
  - "layout.ts inherits chrome; auth.ts and refund.ts were not rewritten"

patterns-established:
  - "Pattern 4: CHARCOAL #1E1F1F, YELLOW #FDC20B, GREY #DEDEDE, MUTED #545756, WHITE #FFFFFF, LOGO 216×30, BODY_FONT Poppins stack, 4px yellow bar, no glow"

requirements-completed: [RPLY-01]

duration: 7 min
completed: 2026-09-17
---

# Phase 13 Plan 04: Shared email chrome Summary

**Shared chrome.ts tokens (charcoal #1E1F1F, yellow #FDC20B, 216×30 wordmark) wired into layout.ts BODY_FONT and ConfirmationEmail Img**

## Performance

- **Duration:** 7 min
- **Started:** 2026-09-17T21:35:52Z
- **Completed:** 2026-09-17T21:42:51Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Lifted locked hex/fonts/logo into `packages/emails/src/chrome.ts` (`LOGO_WIDTH` 216, `LOGO_HEIGHT` 30)
- `lifecycle-mail.tsx` imports and re-exports those names; 4px yellow bar unchanged
- `layout.ts` dropped Arial; wordmark and CTA/code use `BODY_FONT`; auth/refund inherit
- Confirmation voucher header is `<Img src={LOGO} width={216} height={30} alt="Vamos Taxi">`; snapshots include `wordmark-email.png`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add chrome.ts and re-export from lifecycle-mail (D-03)** - `5fe90aa` (feat)
2. **Task 2: layout.ts drops Arial and uses 216×30 wordmark (D-03)** - `c08ed43` (feat)
3. **Task 3: ConfirmationEmail Img wordmark (D-03)** - `33f81e8` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/emails/src/chrome.ts` - Shared CHARCOAL/YELLOW/GREY/MUTED/WHITE, DISPLAY_FONT, BODY_FONT, LOGO 216×30
- `packages/emails/src/lib/lifecycle-mail.tsx` - Import + re-export chrome tokens
- `packages/emails/src/layout.ts` - HTML envelope on chrome; no Arial
- `packages/emails/src/ConfirmationEmail.tsx` - Img wordmark header
- `packages/emails/src/__snapshots__/ConfirmationEmail.test.tsx.snap` - wordmark-email.png in all locale snaps

## Decisions Made

- Re-export chrome names from `lifecycle-mail.tsx` so `import { CHARCOAL, LOGO, LifecycleMail } from "./lib/lifecycle-mail"` keeps working
- Did not edit `auth.ts`, `refund.ts`, `contact.ts`, CancellationEmail, checkout, or tickets-write

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Worktree has no `node_modules`. Auth tests ran with MAIN vitest binary and cwd = worktree (`27 passed`). ConfirmationEmail needs `@react-email/render`; ran from MAIN `packages/emails` with `--dir` worktree (`12 passed`, then `39 passed` with auth). Vitest 4 flag is `-u`, not `--update-snapshots`. MAIN checkout was not modified.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 13-05 (contact staff-reply fields). Auth/refund inherit layout chrome. Do not start 13-05 from this executor.

## Self-Check: PASSED

- chrome.ts contains #1E1F1F, #FDC20B, #DEDEDE, wordmark-email.png, 216, 30; no box-shadow
- layout.ts has no Arial; imports `./chrome`; `width="${LOGO_WIDTH}"` / `height="${LOGO_HEIGHT}"`
- ConfirmationEmail.test.tsx 12 passed; snap contains wordmark-email.png
- auth.test.ts 27 passed (39 combined)

---
*Phase: 13-staff-apis-outbound-resend-replies*
*Completed: 2026-09-17*
