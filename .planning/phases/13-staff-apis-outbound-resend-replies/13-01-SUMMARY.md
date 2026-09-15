---
phase: 13-staff-apis-outbound-resend-replies
plan: 01
subsystem: testing
tags: [vitest, resend, rfc-message-id, staff-tickets, wave-0]

requires:
  - phase: 12-ticket-schema-support-mock
    provides: patchTicket send-then-insert, overlay PATCH { reply }, rfc_message_id columns
provides:
  - Wave 0 tickets-write.test.ts send-path contract (empty/closed/8000/fail-closed/GET persist/BCC)
  - notify.test.ts GET-after-send cases; EMAIL fallback kept; toMatchObject results
  - ticket-mail.test.ts unminted threadHeaders (no Message-ID key)
  - rejectStaffReply inverted (D-12); overlay sendError four-language grep (D-07)
affects: [13-03 GET helper, 13-07 patchTicket, 13-09 overlay sendError]

tech-stack:
  added: []
  patterns:
    - asStaff + sendContactMessage vi.hoisted mocks (coupons/notify analog)
    - @/ specifier mocks so vitest can load tickets-write.ts without a path alias
    - toMatchObject on sendContactMessage results so 13-03 can add rfcMessageId/channel

key-files:
  created:
    - apps/web/lib/ops/tickets-write.test.ts
  modified:
    - apps/web/lib/forms/notify.test.ts
    - apps/web/lib/ops/ticket-mail.test.ts
    - apps/web/lib/ops/tickets-map.test.ts
    - apps/web/lib/ops/ops-live-data.test.ts

key-decisions:
  - "CONTEXT D-01…D-12 wins: From stays noreply@vamostaxi.site; Reply-To is plus-address; no minted Message-ID."
  - "Wave 0 is tests-only RED. GREEN is 13-03 (notify/ticket-mail), 13-07 (patchTicket), 13-09 (overlay + rejectStaffReply)."
  - "Do not import retrieveRfcMessageId until 13-03 exports it; assert GET identity through sendContactMessage."
  - "Overlay sendError lives in OpsSupportTicket T, not app/vamos-i18n-dict.js."

patterns-established:
  - "Staff write-path tests mock asStaff tagged sql (load then persist) and sendContactMessage; env.RESEND_API_KEY is re_test; EMAIL is unset."
  - "Stored thread id must match /^<.+@.+>$/ and must not equal providerId, suffixOf(12), or staffMessageId()."

requirements-completed: [RPLY-01, RPLY-02]

duration: 10min
completed: 2026-09-15
---

# Phase 13 Plan 01: Wave 0 web tests Summary

**Wave 0 Vitest files lock GET RFC identity, BCC `info@`, fail-closed staff send, unminted Message-ID, and overlay sendError before any send-path production edits.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-09-15T13:36:44Z
- **Completed:** 2026-09-15T13:46:41Z
- **Tasks:** 3/3
- **Files modified:** 5

## Accomplishments

- `tickets-write.test.ts` covers empty-reply, closed invalid-status, reply > 8000 invalid-reply, send-failed with no INSERT, GET `rfcMessageId` persist, From noreply / Reply-To plus-address / BCC `info@vamostaxi.site` / `allowEmailFallback: false` / no `Message-ID` header / idempotency `staff-reply/${ticketId}/${uuid}`.
- `notify.test.ts` Resend mock exposes `emails.get`; GET success, GET-empty retry, GET-still-empty fail-closed (no EMAIL); `options.from` copied onto the payload; every EMAIL fallback test kept; result asserts converted to `toMatchObject`.
- `ticket-mail.test.ts` expects `threadHeaders` without a `Message-ID` key; plus-address and parse tests kept.
- `rejectStaffReply({ reply: "hi" })` now expected false (D-12). Overlay grep expects `sendError` / `tSendError` / “Couldn’t send. Try again.” in the writer DC; dict must not contain overlay `sendError:`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create tickets-write.test.ts** - `3fb3f2e` (test)
2. **Task 2: GET-after-send and unminted threadHeaders** - `37e5f6e` (test)
3. **Task 3: Invert rejectStaffReply and overlay sendError grep** - `0a3475d` (test)

**Plan metadata:** (this commit)

_Note: TDD plan is tests-only. RED is the deliverable. GREEN is later plans._

## TDD Gate Compliance

| Gate | Commit | Status |
|------|--------|--------|
| RED | `3fb3f2e`, `37e5f6e`, `0a3475d` | Pass — files exist; mixed red vs current production is intended |
| GREEN | — | Not in this plan (13-03 / 13-07 / 13-09) |
| REFACTOR | — | Not applicable |

## Files Created/Modified

- `apps/web/lib/ops/tickets-write.test.ts` — Wave 0 patchTicket send-path contract (RPLY-01, RPLY-02, D-05, D-06, D-10, D-11)
- `apps/web/lib/forms/notify.test.ts` — GET-after-send + `options.from`; EMAIL fallback kept (D-01, D-06, D-08)
- `apps/web/lib/ops/ticket-mail.test.ts` — unminted `threadHeaders`
- `apps/web/lib/ops/tickets-map.test.ts` — D-12 invert `rejectStaffReply`
- `apps/web/lib/ops/ops-live-data.test.ts` — D-07 overlay `sendError` four-language grep + dual-DC byte-equal + dict absence

## Decisions Made

- CONTEXT D-01…D-12 wins. From `Vamos Taxi <noreply@vamostaxi.site>` until replies domain verified; Reply-To is plus-address.
- No minted Message-ID. No npm packages. No `supabase db push`. No production send-path edits (`notify.ts`, `tickets-write.ts`, `ticket-mail.ts`, `OpsSupportTicket.dc.html`).
- Vitest include is `apps/web/lib/**/*.test.ts`. Tests stay under `lib/`, not `apps/web/tests/unit/`.
- Overlay `sendError` four-language grep may stay red until 13-09.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Mock `@/` specifiers so vitest can load `tickets-write.ts`**
- **Found during:** Task 1 (`tickets-write.test.ts`)
- **Issue:** `tickets-write.ts` imports `@/lib/db/identity` (and other `@/` paths). Vitest has no tsconfig path alias, so the suite died with `Cannot find package '@/lib/db/identity'` before any assertion ran.
- **Fix:** `vi.mock("@/lib/db/identity")` and `vi.mock("@/lib/forms/notify")` plus factory re-exports of `contact-channels`, `ticket-mail`, and `tickets-map` from relative paths. Did not edit `vitest.config.ts` or production files.
- **Files modified:** `apps/web/lib/ops/tickets-write.test.ts`
- **Verification:** 8 tests collected; 4 fail on contract (8000 / missing rfc / Message-ID / GET persist), 4 pass on already-true gates (empty, closed, no EMAIL env, accepted-false).
- **Committed in:** `3fb3f2e` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for the Wave 0 file to be a runnable RED suite rather than an import error. No production scope creep.

## Issues Encountered

None beyond the `@/` vitest resolve gap (handled as Rule 3).

## Authentication Gates

None.

## User Setup Required

None - no external service configuration required.

## Verification

Plan-level `vitest run` of the five files: **10 failed | 40 passed** (50). Failures are the intended RED contracts until 13-03 / 13-07 / 13-09. No production send/DC files in the 13-01 commits. Unrelated dirty files (`app/home/home.dc.html`, `apps/web/lib/pricing/home-fleet-from-quote.test.ts`) were left untouched.

## Next Phase Readiness

Ready for **13-02** (Wave 0 emails tests). Web Wave 0 files are on disk. Do not implement send-path production until 13-03+.

## Self-Check: PASSED

- [x] `apps/web/lib/ops/tickets-write.test.ts` exists
- [x] `apps/web/lib/forms/notify.test.ts` exists
- [x] `apps/web/lib/ops/ticket-mail.test.ts` exists
- [x] `apps/web/lib/ops/tickets-map.test.ts` exists
- [x] `apps/web/lib/ops/ops-live-data.test.ts` exists
- [x] `git log --oneline --grep="13-01"` returns 3 commits (`3fb3f2e`, `37e5f6e`, `0a3475d`)
- [x] No production send-path files edited

---
*Phase: 13-staff-apis-outbound-resend-replies*
*Completed: 2026-09-15*
