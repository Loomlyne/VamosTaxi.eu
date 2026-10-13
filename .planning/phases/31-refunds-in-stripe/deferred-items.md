# Phase 31 deferred items

Out-of-scope findings logged by executors. Not fixed in the plan that found them.

## From 31-06 (2026-10-13)

- `packages/emails/src/lib/send.ts` `sendRefundMailAlert` (plan 31-04) calls `layoutText(body)` and
  `layoutHtml("en", …)` without a footer, so its internal info@ mail ends with the sign-in footer line
  "This link works once and expires after 1 hour." (the layouts' default `auth.email-footer-link`). The
  31-06 refund check mails pass the phone-only footer that `refund.ts` uses. Suggested fix (one line each, in
  31-04's file): pass `{ footer: ltrHtml(PHONE_DISPLAY) }` / `{ footer: PHONE_DISPLAY }`. For the 31-13 hand-over.
