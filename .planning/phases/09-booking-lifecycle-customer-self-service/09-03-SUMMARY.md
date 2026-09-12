---
phase: 09-booking-lifecycle-customer-self-service
plan: 03
subsystem: database
tags: [postgres, pgtap, supabase, booking-lifecycle, reviews]

# Dependency graph
requires:
  - phase: 09-booking-lifecycle-customer-self-service
    provides: Wave 0 review_submission pgTAP + 09-02 cancel/refund SQL
  - phase: 06-ops-dashboard
    provides: reviews table + ops publish/hide
provides:
  - reviews.booking_id unique nullable + star columns + photo_path
  - submit_review (vamos_guest) and submit_review_customer (vamos_system)
  - D-18/D-19/D-21 local-green pgTAP
affects: [09-04, 09-12]

# Tech tracking
tech-stack:
  added: []
  patterns: [SECURITY DEFINER review insert, forever token hash+not-revoked, unique booking_id no customer UPDATE]

key-files:
  created:
    - packages/db/supabase/migrations/20260912000719_booking_lifecycle_reviews.sql
  modified:
    - packages/db/README.md
    - packages/db/supabase/tests/review_submission.test.sql

key-decisions:
  - "D-18: allow when booking_payments.status = succeeded AND bookings.status NOT IN (quote, pending, cancelled, partially_cancelled)"
  - "D-21: submit_review does not check booking_access_tokens.expires_at; revoked/miss = P0002 not_found"
  - "Second submit raises already_reviewed P0001; unique booking_id is the real gate"
  - "Customer submits: source manual, published false, verified true, rating = overall"
  - "Hosted apply is 09-04; this plan is local SQL only"

patterns-established:
  - "app.insert_customer_review shared body; token vs JWT wrappers"
  - "booking_events.kind extended additively with review.submitted"

requirements-completed: [LIFE-08]

# Metrics
duration: 8min
completed: 2026-09-12
---

# Phase 09 Plan 03: reviews.booking_id + submit_review SQL Summary

**Local migration adds unique `reviews.booking_id` and three 1–5 star columns; `submit_review` / `submit_review_customer` insert one unpublished verified row. Hosted apply is 09-04. pgTAP review_submission green (26 tests).**

## Performance

- **Duration:** 8 min
- **Started:** 2026-09-12T00:04:14Z
- **Completed:** 2026-09-12T00:12:14Z
- **Tasks:** 2
- **Files modified:** 1 created, 2 modified

## Accomplishments

- `reviews.booking_id` uuid nullable unique, ON DELETE RESTRICT; imported seed stays null
- `rating_company` / `rating_chauffeur` / `rating_overall` smallint 1–5 nullable for imported; required on customer submit
- `photo_path` optional R2 key; `rating` kept and copied from overall; do not drop `rating`
- `submit_review` EXECUTE `vamos_guest`; `submit_review_customer` EXECUTE `vamos_system`; revoke public; no anon EXECUTE
- D-18: unpaid and cancelled (including cancelled+refunded) raise `not_reviewable`; paid/confirmed/assigned/completed/no_show including after ops refund succeed
- D-21: expired manage token still submits; revoked token is generic `not_found` P0002; second submit `already_reviewed`
- `booking_events.kind` CHECK additively includes `review.submitted`

## Task Commits

Each task was committed atomically:

1. **Task 1: reviews.booking_id and star columns** - `027b6d0` (feat)
2. **Task 2: submit_review RPCs + pgTAP green** - `4c6e2c1` (feat)

**Plan metadata:** (this SUMMARY commit)

## Files Created/Modified

- `packages/db/supabase/migrations/20260912000719_booking_lifecycle_reviews.sql` - columns + RPCs + event kind
- `packages/db/README.md` - Phase 9 table row; hosted apply is 09-04
- `packages/db/supabase/tests/review_submission.test.sql` - D-18/D-19/D-21; eight-key policy; slug `first`

## Decisions Made

Followed 09-CONTEXT D-18/D-19/D-20/D-21. Token path does not check `expires_at`. Worker owns JWT ownership for `submit_review_customer`. No customer UPDATE whitelist. GET `/api/reviews` unchanged (09-12).

## Deviations from Plan

### Auto-fixed Issues

**1. Wave 0 fixture slug failed `vehicle_classes_slug_check`**
- **Found during:** Task 2 pgTAP
- **Issue:** `slug = 'lc9-review'` is outside `('economy','business','first','van')`
- **Fix:** Use `first` (same as 09-02 d02 / roll-up fixtures)
- **Files modified:** `packages/db/supabase/tests/review_submission.test.sql`
- **Verification:** pgTAP exit 0
- **Committed in:** `4c6e2c1`

**2. Wave 0 `policy = '{}'` would fail `price_snapshots_policy_shape`**
- **Found during:** Task 2 (known from 09-02)
- **Issue:** eight keys required
- **Fix:** eight-key `jsonb_build_object` like cancellation_refund_d02; charge gate untouched (`session_replication_role = replica`)
- **Files modified:** `packages/db/supabase/tests/review_submission.test.sql`
- **Verification:** pgTAP exit 0
- **Committed in:** `4c6e2c1`

---

**Total deviations:** 2 auto-fixed (fixture vs existing CHECKs)
**Impact on plan:** No product-SQL scope creep. Charge gate untouched.

## Issues Encountered

Local supabase was already healthy. Did not start Docker. Did not `supabase start`. Applied with `pnpm --filter @vamos/db run reset` (exit 0), then pgTAP.

pgTAP:

```
review_submission.test.sql .. ok
All tests successful.
Files=1, Tests=26
Result: PASS
```

Command: `pnpm --filter @vamos/db run test:db supabase/tests/review_submission.test.sql`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 09-04 hosted apply is still BLOCKING and was not run
- 09-12 owns photo upload + GET `/api/reviews` published-only route change
- Do not treat local apply as hosted

## Self-Check: PASSED

- Migration exists: `packages/db/supabase/migrations/20260912000719_booking_lifecycle_reviews.sql`
- Commits: `027b6d0`, `4c6e2c1`
- pgTAP exit 0 (26 tests)
- anon EXECUTE denied (function_privs_are)

---
*Phase: 09-booking-lifecycle-customer-self-service*
*Completed: 2026-09-12*
