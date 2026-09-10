---
phase: 08-ops-dispatch-live-board-assignment-account-surfaces
plan: 09
subsystem: ops
tags: [ops, emails, resend, assign, must-fix, chauffeur]

requires:
  - phase: 08-ops-dispatch-live-board-assignment-account-surfaces
    provides: assign RPCs (08-04), fleet PATCH (08-03), paid-edit extra-accept (08-07)
provides:
  - Chauffeur assign and unassign mail after ops_assign_leg / ops_unassign_leg
  - Ops must-fix mail on workshop off-road (D-55) and extra-accept overlap (D-75)
affects: [08-10, 08-UAT]

tech-stack:
  added: []
  patterns: [server-after-RPC Resend, SUPPORT_EMAIL must-fix, chauffeurEmailLocale]

key-files:
  created:
    - packages/emails/src/ChauffeurAssignEmail.tsx
    - packages/emails/src/ChauffeurUnassignEmail.tsx
    - packages/emails/src/OpsMustFixEmail.tsx
    - packages/emails/src/lib/chauffeur-locale.ts
    - apps/web/lib/ops/must-fix-mail.ts
  modified:
    - packages/emails/src/lib/send.ts
    - packages/emails/src/index.ts
    - packages/emails/src/messages/en.json
    - packages/emails/src/messages/de.json
    - packages/emails/src/messages/fr.json
    - packages/emails/src/messages/ar.json
    - apps/web/lib/ops/assign.ts
    - apps/web/lib/ops/fleet-write.ts
    - apps/web/lib/ops/edit-request.ts
    - apps/web/lib/checkout/settle.ts
    - apps/web/app/[locale]/(ops)/api/staff/vehicles/[id]/route.ts

key-decisions:
  - "FROM Vamos Taxi <noreply@vamostaxi.site>. Locale = first of de,fr,ar,en in chauffeurs.languages else en."
  - "Assign/unassign mail after RPC ok in assign.ts. Best-effort. No notification_claim. No Gmail API. No WhatsApp. No driver-app CTA. No invented CHF."
  - "Off-road = vehicles.status workshop. Upcoming assigned trips emailed to SUPPORT_EMAIL (info@vamostaxi.site). Trip not auto-cancelled."
  - "D-75 overlap mail from edit-request accept must-fix and checkout_extra_payment_settle 23P01. Trip stays."
  - "Hosted schema STILL UNPUSHED. Task 3 waits owner apply. No MCP apply_migration. No supabase db push."

patterns-established:
  - "Chauffeur dispatch mail: load trip+email in asSystem, send after result.ok."
  - "Ops must-fix: sendOpsMustFix to SUPPORT_EMAIL from staff PATCH / extra-accept, never OpsFleet JS."

requirements-completed: [DATA-08, OPS-03]
duration: 20min
completed: 2026-09-10
---

# Phase 08 Plan 09: Assign/unassign + must-fix emails Summary

**Chauffeurs get assign and unassign mail in fleet language. Ops gets must-fix mail on workshop off-road and paid-edit overlap. Hosted schema is STILL UNPUSHED — waiting owner apply.**

## Performance

- **Duration:** ~20 min production (Tasks 1–2)
- **Started:** 2026-09-10T18:45:00Z
- **Completed:** 2026-09-10T19:03:58Z
- **Tasks:** 2 of 4 (stopped before Task 3 hosted apply)
- **Files modified:** 27

## Accomplishments

- Assign and unassign templates copy the PayLink envelope. Sent from `assign.ts` after `ops_assign_leg` / `ops_unassign_leg` success. FROM `Vamos Taxi <noreply@vamostaxi.site>`. Locale first of de,fr,ar,en on `chauffeurs.languages`, else en. No CHF, driver-app CTA, WhatsApp, Gmail API, or `notification_claim`.
- Off-road (D-55): staff vehicle PATCH → `updateVehicleRow` when status becomes `workshop` and upcoming assigned trips exist → `sendOpsMustFix` to `SUPPORT_EMAIL` (`info@vamostaxi.site`). Bookings are not cancelled.
- Paid edit overlap (D-75): extra-accept path emails ops on `must-fix` (23P01 / capacity) from `acceptPaidEdit`, and on extra settle `23P01` from `checkout_extra_payment_settle`. Trip stays.
- Four-language templates. No legal invention.

## Task Commits

1. **Task 1: Chauffeur assign and unassign emails** - `6344e8c` (feat)
2. **Task 2: Ops must-fix emails (off-road + overlap edit)** - `c9d1538` (feat)
3. **Task 3: [BLOCKING] hosted schema apply** - not started
4. **Task 4: Readback hosted objects; regenerate types** - not started

**Plan metadata:** (this commit)

## Files Created/Modified

- `packages/emails/src/ChauffeurAssignEmail.tsx` — assign template
- `packages/emails/src/ChauffeurUnassignEmail.tsx` — unassign wrapper
- `packages/emails/src/ChauffeurAssignEmail.test.tsx` — 13 tests
- `packages/emails/src/lib/chauffeur-locale.ts` — de,fr,ar,en else en
- `packages/emails/src/OpsMustFixEmail.tsx` — off-road + overlap template
- `packages/emails/src/OpsMustFixEmail.test.tsx` — 10 tests
- `packages/emails/src/lib/send.ts` — `sendChauffeurAssign` / `sendChauffeurUnassign` / `sendOpsMustFix`
- `packages/emails/src/index.ts` — exports
- `packages/emails/src/messages/{en,de,fr,ar}.json` — copy
- `apps/web/lib/ops/assign.ts` — mail after RPC ok
- `apps/web/lib/ops/assign.test.ts` — 10 tests
- `apps/web/lib/ops/must-fix-mail.ts` — SUPPORT_EMAIL sender
- `apps/web/lib/ops/fleet-write.ts` — workshop upcoming trips
- `apps/web/app/[locale]/(ops)/api/staff/vehicles/[id]/route.ts` — D-55 send
- `apps/web/lib/ops/edit-request.ts` — D-75 send on must-fix
- `apps/web/lib/checkout/settle.ts` — D-75 send on extra 23P01
- `apps/web/lib/ops/edit-request.test.ts` / `fleet-persist.test.ts` — file proofs

## Decisions Made

- Chauffeur mailbox is the dispatch channel. Browser does not send.
- Off-road is `vehicles.status = workshop` (OpsFleet `offRoadStay`), not an invented `off_road` column.
- Ops recipient is existing `SUPPORT_EMAIL`, not a new public address.
- Extra-accept overlap is both same-price accept `must-fix` and extra settle `23P01`.

## Deviations from Plan

### Auto-fixed Issues

**1. Extra-accept overlap also fires at extra settle**
- **Found during:** Task 2
- **Issue:** `booking_edit_request_accept` extra_required does not apply payload, so 23P01 happens in `checkout_extra_payment_settle`.
- **Fix:** Also send must-fix from settle.ts extra 23P01. edit-request.ts still sends on accept must-fix.
- **Files modified:** `apps/web/lib/checkout/settle.ts`
- **Verification:** `edit-request.test.ts` file proof
- **Committed in:** `c9d1538`

**Total deviations:** 1 auto-fixed
**Impact on plan:** Necessary for D-75 extra-accept. No scope creep.

## Issues Encountered

None.

## User Setup Required

**Hosted schema STILL UNPUSHED.** Waiting owner **apply** / **you apply**.

Task 3 is `checkpoint:human-action`. Do not MCP `apply_migration` until owner says apply. Do not `supabase db push`. Do not wrangler secret/deploy. Do not dummy-card. Do not live DNS. Do not push `main`. Do not start 08-10.

Owner apply verbatim: _(not said)_

Migration versions to apply after owner apply (08-04 / 08-05 / 08-07, timestamp order):

- `20260910164004_ops_assign_leg`
- `20260910170935_ops_refund_record`
- `20260910175309_booking_edit_requests`

Readback after apply: `list_migrations` + `to_regclass('public.booking_edit_requests')` + `ops_assign_leg` / `ops_unassign_leg` / `ops_refund_record` in `pg_proc`.

## Next Phase Readiness

- Emails wired server-side. Templates: `ChauffeurAssignEmail.tsx`, `ChauffeurUnassignEmail.tsx`, `OpsMustFixEmail.tsx`.
- **Blocker = Task 3 owner apply.** Phase 8 may not claim verify until hosted readback.
- 08-10 (customer paid-edit UI) must not start before that readback.

## Self-Check: Context for Next Phase

- Chauffeur assign/unassign: after RPC, Resend, fleet locale.
- Must-fix: SUPPORT_EMAIL, workshop PATCH, extra-accept overlap, no auto-cancel.
- Hosted SQL for 08-04/05/07 is not on `yaumjzvylngfjhtuffqs` yet.

---
*Phase: 08-ops-dispatch-live-board-assignment-account-surfaces*
*Completed: 2026-09-10 (Tasks 1–2 only)*
