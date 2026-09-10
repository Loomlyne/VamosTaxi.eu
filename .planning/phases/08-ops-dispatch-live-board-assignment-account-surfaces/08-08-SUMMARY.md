---
phase: 08-ops-dispatch-live-board-assignment-account-surfaces
plan: 08
subsystem: ops
tags: [ops, customers, account-bookings, poll, rls, hyperdrive]
requires:
  - phase: 08-ops-dispatch-live-board-assignment-account-surfaces
    provides: path routing (08-01), live board hydrate (08-02/08-03)
provides:
  - /customers/{email} from booking emails; empty list not Isolation
  - Account /bookings paid list with fleet chauffeur + vehicle or empty
  - AUTH-06 via JWT email = contact_email; no claim-guest dialog
  - Ops + account poll ~3s while visible; pause when hidden; no Realtime
affects: [08-09, 08-10]
tech-stack:
  added: []
  patterns: [asCustomer-list-asSystem-fleet, visibility-pause-poll]
key-files:
  created:
    - apps/web/lib/account/session.ts
    - apps/web/lib/account/bookings.ts
    - apps/web/app/api/account/bookings/route.ts
    - apps/web/lib/account/bookings.test.ts
  modified:
    - apps/web/lib/ops/customers.ts
    - app/ops/OpsCustomers.dc.html
    - app/ops/OpsTable.dc.html
    - app/pages/bookings.dc.html
    - app/vamos-ops-data.js
    - apps/web/lib/ops/ops-live-data.test.ts
key-decisions:
  - "Poll interval 3000ms while visible. Hidden tabs pause. visibilitychange + focus refetch."
  - "Realtime was not enabled. No supabase.channel. No ops table added to supabase_realtime."
  - "Account list is asCustomer + RLS. Fleet names join asSystem because authenticated has no chauffeur/vehicle grants."
  - "No claim-guest confirm dialog. Empty list when JWT email ≠ contact_email is correct."
patterns-established:
  - "Customer /bookings catch → []. Preview VT-4821 never becomes runtime rows."
  - "vehicle is fleet plate · model or empty — never classLabel(class_slug)."
requirements-completed: [SITE-03, AUTH-06, OPS-01]
duration: 20min
completed: 2026-09-10
---

# Phase 08 Plan 08: Customers, account fleet, poll Summary

**CRM is booking emails or empty. Signed-in matching email sees paid trips with real chauffeur/vehicle or blanks. Ops boards refresh in place via 3s poll + visibility, not Realtime.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-10T18:26:59Z
- **Completed:** 2026-09-10T18:43:17Z
- **Tasks:** 4
- **Files modified:** 10

## Accomplishments

- `/customers/{email}` opens that email’s contact and trips. Empty list stays empty. `upsertCustomer` still writes `contact_*`.
- Account `GET /api/account/bookings` is paid-only (`status not in ('quote','pending')`) via `asCustomer` RLS. Chauffeur name + fleet plate/model after assign; empty until then. No Isolation names. No claim-guest dialog.
- Ops bookings `restCollection` polls 3000ms while `document.visibilityState === 'visible'`; pauses when hidden; `visibilitychange` + `focus` refetch. Public `/bookings` same. No `supabase.channel`.
- File proofs: Isolation absent; empty chauffeur until assigned; no Realtime.

## Task Commits

1. **Task 1: /customers paths, empty list, write-through** - `9116e28` (feat)
2. **Task 2: Account /bookings chauffeur+vehicle from fleet; AUTH-06 no dialog** - `a410d61` (feat)
3. **Task 3: Poll + visibility refetch; no Realtime** - `abe5bdf` (feat)
4. **Task 4: File proofs — Isolation, account join, no Realtime** - `47a04a4` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/ops/customers.ts` — load by uuid or email; upsertCustomer write-through kept
- `app/ops/OpsCustomers.dc.html` — `/customers/{email}`; history `/bookings/{ref}`; no Isolation / hash
- `app/ops/OpsTable.dc.html` — history href `/bookings/{ref}`
- `apps/web/lib/account/session.ts` — `customerClaims()` JWT email; no `@/lib/db/identity`
- `apps/web/lib/account/bookings.ts` — mapper: chauffeur + fleet vehicle or empty
- `apps/web/app/api/account/bookings/route.ts` — asCustomer list + asSystem fleet join
- `app/pages/bookings.dc.html` — fetch `/api/account/bookings`; catch → `[]`; visibility poll
- `app/vamos-ops-data.js` — POLL_MS 3000; visibility pause; no Realtime
- `apps/web/lib/ops/ops-live-data.test.ts` — Isolation + visibility + no channel
- `apps/web/lib/account/bookings.test.ts` — empty until assigned; fleet join after

## Decisions Made

- Poll interval **3000ms**. Realtime **not** enabled.
- Fleet join runs as `asSystem` keyed by JWT email after `asCustomer` returns the RLS-gated list. Authenticated has no SELECT on `chauffeurs` / `vehicles` or assignment columns.
- `customerClaims` lives in `lib/account/session.ts` (Ban #5).

## Deviations from Plan

### Auto-fixed Issues

**1. Account files missing on this branch**
- **Found during:** Task 2
- **Issue:** `apps/web/lib/account/*` and `app/api/account/bookings` exist on `origin/main` but not on `gsd/phase-08-ops-dispatch` (behind, no merge main).
- **Fix:** Implemented mapper/route/session here. Did not merge main.
- **Files modified:** `apps/web/lib/account/bookings.ts`, `session.ts`, `apps/web/app/api/account/bookings/route.ts`
- **Committed in:** `a410d61`

**2. Fleet join cannot run inside asCustomer**
- **Found during:** Task 2
- **Issue:** Customer grants exclude `assigned_chauffeur_id` / chauffeur and vehicle tables.
- **Fix:** asCustomer SELECT of granted booking columns; asSystem attaches fleet names for the same email.
- **Files modified:** `apps/web/app/api/account/bookings/route.ts`
- **Committed in:** `a410d61`

**3. session.ts not in files_modified**
- **Found during:** Task 2
- **Issue:** Ban #5 forbids identity imports from a mapping lib; claims helper must exist.
- **Fix:** Added `apps/web/lib/account/session.ts`.
- **Committed in:** `a410d61`

**Total deviations:** 3 auto-fixed
**Impact on plan:** Required for AUTH-06 / D-50. No scope creep. Did not start 08-09/08-10.

## Issues Encountered

- This branch is behind `origin/main` (account unlock + Phase 12). Did not merge main.
- `20260910000001_bookings_select_by_contact_email.sql` is on origin/main, not this tree. Hosted policy already matches contact_email; no apply_migration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 08-09 is hosted SQL apply (blocking). 08-10 is customer paid-edit UI.
- Two-laptop live board UAT is 08-UAT, not this execute.
- Tests: `ops-live-data.test.ts` 16/16; `bookings.test.ts` 5/5.

---
*Phase: 08-ops-dispatch-live-board-assignment-account-surfaces*
*Completed: 2026-09-10*
