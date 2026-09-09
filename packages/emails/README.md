# @vamos/emails

Transactional renderers for Vamos Taxi. Four languages in the same pass.

## What this package is

- **Phase 5** — auth and contact mail (`index.ts`, `src/auth.ts`, `src/contact.ts`): escaped HTML strings, no React Email.
- **Phase 7** — one confirmation template (`src/ConfirmationEmail.tsx`) plus a calendar invite. That is the only booking `kind` this package sends.

The six other `booking_notifications.kind` values are out of this package. Do not add them here.

## Confirmation

`sendConfirmation(env, booking)` renders the template, attaches `<reference>.ics`, and talks to Resend. It returns `{ ok: true, providerMessageId }` or `{ ok: false, error }` — never throws.

It does **not** claim or settle the notification ledger. Plan 07-07's Queue consumer calls the definer RPCs (`vamos_system` only), then this send, then settle.

`RESEND_API_KEY` is a Worker secret (`wrangler secret put`), never `vars`, never `NEXT_PUBLIC_*`.

## Template version

`CONFIRMATION_TEMPLATE_VERSION` is `confirmation@YYYY-MM-DD-N`.

- Bump the trailing serial when rendered content changes.
- Bump the date when the template is rewritten.
- Never send the column's empty default.

## Adding the next template

New booking kinds wait for a later phase. Auth/contact stay as they are. Do not fold them into React Email in this package unless a later plan says so.
