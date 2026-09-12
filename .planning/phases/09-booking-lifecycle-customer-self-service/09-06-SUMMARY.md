---
phase: 09-booking-lifecycle-customer-self-service
plan: 06
subsystem: lifecycle
tags: [resend, email, notifications, i18n]

requires:
  - phase: 09-04
    provides: booking_notifications claim/settle RPCs
provides:
  - BOOKINGS_OPS_EMAIL = bookings@vamostaxi.site
  - Seven lifecycle Resend templates in en/de/fr/ar
  - sendCancellation sendRefundFailed sendReminder24h sendAssignmentCustomer sendTimeChange sendFlightNumber sendReviewRequest
  - notify-lifecycle claim-then-send (asSystem)
affects: [09-07, 09-10, 09-11]

tech-stack:
  added: []
  patterns: [claim-then-send via notification_claim then Resend then notification_settle]

key-files:
  created:
    - packages/emails/src/CancellationEmail.tsx
    - packages/emails/src/RefundFailedEmail.tsx
    - packages/emails/src/Reminder24hEmail.tsx
    - packages/emails/src/AssignmentCustomerEmail.tsx
    - packages/emails/src/TimeChangeEmail.tsx
    - packages/emails/src/FlightNumberEmail.tsx
    - packages/emails/src/ReviewRequestEmail.tsx
    - packages/emails/src/lib/lifecycle-mail.tsx
    - apps/web/lib/lifecycle/notify-lifecycle.ts
    - apps/web/lib/lifecycle/notify-lifecycle.test.ts
    - .planning/phases/09-booking-lifecycle-customer-self-service/09-06-SUMMARY.md
  modified:
    - apps/web/lib/contact-channels.ts
    - packages/emails/src/lib/send.ts
    - packages/emails/src/index.ts
    - packages/emails/src/messages/en.json
    - packages/emails/src/messages/de.json
    - packages/emails/src/messages/fr.json
    - packages/emails/src/messages/ar.json

key-decisions:
  - "FROM stays Vamos Taxi <noreply@vamostaxi.site>. SUPPORT_EMAIL stays info@ for public contact."
  - "D-30 ops copies use BOOKINGS_OPS_EMAIL (bookings@vamostaxi.site), never info@."
  - "D-07 payout copy: card issuer timing, no day count."
  - "D-23 confirmed vs refused are distinct timeChange copy keys."
  - "D-21 review request is /review?token= with no expiry copy."
  - "Did not edit paid-cancel.ts (09-07 ownership)."

patterns-established:
  - "Lifecycle mail reuses PayLink envelope via lifecycle-mail.tsx."
  - "notify-lifecycle: asSystem notification_claim; null skips send; else send; notification_settle with Resend id."

requirements-completed: [LIFE-05, LIFE-06, LIFE-08]

duration: 20min
completed: 2026-09-12
---

# Phase 09 Plan 06: Lifecycle Resend templates + claim-then-send

**Seven four-language lifecycle templates and a claim-then-send helper. Ops copies target bookings@vamostaxi.site. emails tsc clean. Vitest 7/7.**

## Performance

- **Duration:** ~20 min (implementation after research)
- **Started:** 2026-09-12T00:55:00Z
- **Completed:** 2026-09-12T01:13:23Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments

- `BOOKINGS_OPS_EMAIL = bookings@vamostaxi.site`. `SUPPORT_EMAIL` remains `info@vamostaxi.site`.
- Templates: Cancellation, RefundFailed, Reminder24h, AssignmentCustomer, TimeChange, FlightNumber, ReviewRequest — en/de/fr/ar same pass.
- D-07 cancel refund line uses “your card issuer's timing” with no day count. Refund line is pending_ops / full_captured / none.
- D-29 reminder omits chauffeur / vehicle / plate when unassigned; ops unassigned ping is a distinct copy path.
- D-23 TimeChange confirmed vs refused are distinct keys.
- D-21 ReviewRequest links `/review?token=` with no expiry copy.
- `send.ts` exports all seven `send*` functions. FROM is `Vamos Taxi <noreply@vamostaxi.site>`.
- `notify-lifecycle.ts`: asSystem `notification_claim`; null skips; else send; `notification_settle` with Resend message id.
- Recipients: cancel → customer + bookings@ + assigned chauffeur (urgent ops subject when assigned). Refund-failed → bookings@ only. Time confirmed → customer + bookings@ + chauffeur. Time refused → customer only. Flight → bookings@ + chauffeur. Review → customer.

## Task Commits

1. **Task 1** — `cecc60b` feat(09-06): BOOKINGS_OPS_EMAIL + cancel/refund-failed/reminder/assignment templates
2. **Task 2** — `0d98bcf` feat(09-06): time/flight/review templates + claim-then-send helper
3. **Plan metadata** — this file

## Files Created/Modified

- `apps/web/lib/contact-channels.ts` — `BOOKINGS_OPS_EMAIL`
- `packages/emails/src/lib/lifecycle-mail.tsx` — PayLink envelope
- `packages/emails/src/CancellationEmail.tsx` and three other Task 1 templates
- `packages/emails/src/TimeChangeEmail.tsx` / `FlightNumberEmail.tsx` / `ReviewRequestEmail.tsx`
- `packages/emails/src/lib/send.ts` / `index.ts` / `messages/{en,de,fr,ar}.json`
- `apps/web/lib/lifecycle/notify-lifecycle.ts` — claim-then-send wrappers
- `apps/web/lib/lifecycle/notify-lifecycle.test.ts` — source proofs

## Decisions

- Locale = booking locale (en|de|fr|ar).
- One claim row per kind; extra recipient copies share that claim.
- `notification_claim` builds `{bookingId}:{kind}:{coalesce(legId,'')}`. Time-change callers pass `booking_leg_id` (FK), not an edit-request id.
- No WhatsApp. No SMS. No new packages. No MX/DNS. Did not edit `paid-cancel.ts`.

## Deviations from Plan

- None on templates or helper shape.
- `booking_notifications.kind` CHECK still lists `confirmation, reminder_24h, assignment, cancellation, refund, review_request, manage_link_resend`. Plan kinds `refund_failed`, `assignment_customer`, `time_change`, `flight_no` are what the helper claims. Expanding the CHECK is SQL (not this plan). 09-07+ will need that migration before live claim succeeds for those kinds.

## Issues

- Kind CHECK vs plan kinds (above). Do not `supabase db push` from here.
- Did not start 09-07. Did not Docker, deploy, or provision MX.

## Verification

```
pnpm --filter @vamos/emails exec tsc --noEmit
pnpm --filter web exec vitest run lib/lifecycle/notify-lifecycle.test.ts
```

- emails tsc: exit 0
- Test Files  1 passed (1)
- Tests  7 passed (7)

`notify-lifecycle.ts` contains `notification_claim` and `bookings@vamostaxi.site`. No `info@vamostaxi.site` in that file.

## Next

09-07 wires reminder cron, assignment-customer, and cancel mails. Do not start it from this plan.
