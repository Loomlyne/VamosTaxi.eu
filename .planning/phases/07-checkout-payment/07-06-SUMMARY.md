---
phase: 07-checkout-payment
plan: 06
subsystem: emails
tags: [resend, react-email, ics, i18n]

requires:
  - phase: 07-checkout-payment
    provides: notification_claim / notification_settle RPCs
provides:
  - ConfirmationEmail in en/de/fr/ar
  - sendConfirmation SendOutcome
  - CONFIRMATION_TEMPLATE_VERSION confirmation@2026-09-05-1
  - buildInvite via ics createEvent
affects: [07-07]

tech-stack:
  added:
    - resend@6.26.0
    - "@react-email/components@1.0.12"
    - "@react-email/render@2.1.0"
    - ics@3.12.0
  patterns:
    - react: send payload plus text
    - EmailEnv is RESEND_API_KEY only

key-files:
  created:
    - packages/emails/src/ConfirmationEmail.tsx
    - packages/emails/src/lib/ics.ts
    - packages/emails/src/lib/send.ts
    - packages/emails/src/lib/render.ts
    - packages/emails/src/messages/en.json
    - packages/emails/src/messages/de.json
    - packages/emails/src/messages/fr.json
    - packages/emails/src/messages/ar.json
  modified:
    - packages/emails/package.json
    - packages/emails/README.md
    - pnpm-lock.yaml

key-decisions:
  - "U-05: resend@6.26.0 types include react on the send payload. sendConfirmation uses react + text. @react-email/render is for snapshots and renderConfirmation.html."
  - "CONFIRMATION_TEMPLATE_VERSION is confirmation@2026-09-05-1."
  - "@react-email/components@1.0.12 is npm-deprecated as of install day; repo still github.com/resend/react-email. Recorded, not swapped."

patterns-established:
  - "This package has no postgres and no @vamos/db. Claim/settle live in 07-07."

requirements-completed: [PAY-04]

completed: 2026-09-05T19:50:00Z
---

# Plan 07-06 Summary

Confirmation email in four languages, calendar invite, Resend send that always returns a settle-shaped outcome.

## Task 1 — provenance

Developer approved **@react-email/render 2.1.0** and **ics 3.12.0**. Live npm: render repo `github.com/resend/react-email`, maintainers zenorocha / bukinoshita / gabrielmfern; ics repo `github.com/adamgibbons/ics`, maintainer adamgibbons, ISC. Neither has `postinstall`.

## Task 2 — template

npm view at install: resend **6.26.0**, @react-email/components **1.0.12**, @react-email/render **2.1.0**, ics **3.12.0**.

Coverage helper is this package's `i18n:check`. Amount is `CHF 000` when `totalRappen` is null. Arabic `dir="rtl"`. Hexes from `design-system/tokens/colors.css` only. No ß in German.

## Task 3 — invite + send

`buildInvite` wraps `createEvent`. Zurich wall-clock via Intl. Fallback duration 60 minutes when estimated duration is null.

`sendConfirmation` constructs Resend per call, attaches `<reference>.ics` base64, catches everything.

### BookingForEmail fields

`reference`, `contactName`, `contactEmail`, `locale`, `displayCurrency`, `totalRappen`, `legs[]` (`legSeq`, `direction`, `pickupText`, `dropoffText`, `scheduledLocal`, `scheduledAt`, `flightNo`, `vehicleClassLabel`, `pax`, `bags`, `estimatedDurationMinutes`), `manageUrl`.

## Verification

- `pnpm --filter @vamos/emails exec vitest run` — 53/53
- `pnpm typecheck` — pass

## Commits

- `f88431d` feat(07-06): confirmation email template in four languages
- `8ae42fb` feat(07-06): calendar invite and Resend confirmation send
