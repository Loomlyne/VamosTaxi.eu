# Phase 31 deferred items

Out-of-scope findings logged by executors. Not fixed in the plan that found them.

## From 31-06 (2026-10-13)

- `packages/emails/src/lib/send.ts` `sendRefundMailAlert` (plan 31-04) calls `layoutText(body)` and
  `layoutHtml("en", …)` without a footer, so its internal info@ mail ends with the sign-in footer line
  "This link works once and expires after 1 hour." (the layouts' default `auth.email-footer-link`). The
  31-06 refund check mails pass the phone-only footer that `refund.ts` uses. Suggested fix (one line each, in
  31-04's file): pass `{ footer: ltrHtml(PHONE_DISPLAY) }` / `{ footer: PHONE_DISPLAY }`. For the 31-13 hand-over.
  - **FIXED in 31-13 (2026-10-13):** `sendRefundMailAlert` now passes `{ footer: ltrHtml(PHONE_DISPLAY) }` to
    `layoutHtml` and `{ footer: PHONE_DISPLAY }` to `layoutText`; pinned by `packages/emails/src/lib/send.test.ts`
    "ends with the phone-only footer, never the sign-in link line" (failed before the fix, 13/13 pass after).

## From 31-10 (2026-10-13)

- `app/pages/BookingRow.dc.html:251` (account bookings list, live) still shows "Cancelled by you. The refund is
  with our team for review." for a cancelled booking (dict `app/vamos-i18n-dict.js:1217`, twin
  `account.cancelled-by-you-the-refund-is-with-our-team-for`). It names no amount and no Stripe, so it does not
  break D-04, but it is not one of the signed W1-W3 lines and was not in the 31-10 plan. Owner question for the
  31-13 hand-over: keep it, or replace it with signed wording (no text proposed here; wording needs his signature).
