---
phase: 13-staff-apis-outbound-resend-replies
plan: 06
subsystem: emails
tags: [resend, contact-ack, rfc-message-id, email-fallback]

requires:
  - phase: 13-03
    provides: sendContactMessage returns providerId rfcMessageId channel
provides:
  - ContactDeliveryGateway.send optional providerId rfcMessageId channel
  - Contact ack inbound_form rfc_message_id is GET RFC on Resend, synthetic on EMAIL
  - Customer ack payload has no custom Message-ID header
affects: [13-07-tickets-write-staff-reply]

tech-stack:
  added: []
  patterns: [persist GET rfc only when channel is resend and angle-bracketed; skip minted id on Resend miss]

key-files:
  created: []
  modified:
    - apps/web/lib/forms/contact-delivery.ts
    - apps/web/lib/forms/contact-delivery.test.ts
    - apps/web/app/api/contact/route.ts

key-decisions:
  - "Customer send options are { replyTo } only; provider assigns Message-ID"
  - "Resend without rfc_message_id skips inbound_form update (wrong identity is worse)"
  - "EMAIL fallback on POST /api/contact remains (D-08)"

patterns-established:
  - "Ack parent id: channel resend + /^<.+@.+>$/ → GET rfc; channel email → contactMessageId; resend without rfc → skip"

requirements-completed: [RPLY-01]

duration: 2 min
completed: 2026-09-17
---

# Phase 13 Plan 06: Persist GET RFC on contact ack Summary

**Contact customer ack stores Resend GET Message-ID on inbound_form when Resend sent; Cloudflare EMAIL still stores synthetic contactMessageId; no custom Message-ID header**

## Performance

- **Duration:** 2 min
- **Started:** 2026-09-17T21:51:43Z
- **Completed:** 2026-09-17T21:53:38Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- `ContactDeliveryGateway.send` may return optional `providerId`, `rfcMessageId`, and `channel`; `finalize` still uses `providerSuffix` only
- Customer ack send is `{ replyTo }` only — no `Message-ID` header
- After `delivery.accepted`, Resend + angle-bracketed rfc writes that value; EMAIL writes `contactMessageId(submissionId)`; Resend without rfc skips the update
- GET miss after Resend accept does not fail HTTP success; `env.EMAIL` fallback remains

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread extra send fields through ContactDeliveryGateway** - `1dc6654` (feat)
2. **Task 2: Persist GET RFC on Resend customer ack; keep EMAIL fallback (D-08)** - `cc185dd` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/forms/contact-delivery.ts` - Optional GET identity fields on send result
- `apps/web/lib/forms/contact-delivery.test.ts` - Extra-fields send still accepted and finalizes suffix
- `apps/web/app/api/contact/route.ts` - Persist rfc by channel; drop custom Message-ID; keep EMAIL

## Decisions Made

- Do not mint `contactMessageId` as if Resend assigned it
- Capture customer `rfcMessageId` / `channel` / `accepted` in lets; skip update when send was not this request
- Staff tickets-write, inbound webhook, checkout, quote, notify.ts untouched

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 13-07. Public contact EMAIL fallback remains; staff path is not this file.

## Self-Check: PASSED

- `contact-delivery.test.ts` 6 passed (1 file)
- `route.ts` has no `Message-ID`; still passes `env.EMAIL`; writes GET rfc on resend; `contactMessageId` on EMAIL
- No tickets-write / ticket-inbound / webhook / checkout / quote / notify.ts edits
- No STATE.md / ROADMAP.md edits

---
*Phase: 13-staff-apis-outbound-resend-replies*
*Completed: 2026-09-17*
