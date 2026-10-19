---
phase: 28-pixel-pageview
plan: 05
requirements: [META-09]
---
# Phase 28 Plan 05: save the two Meta ids at the Pay press

`lib/meta/click-ids.ts` (`readMetaClickIds`, `metaClickIdsToSave`, the two format regexes) and a best-effort
block at the top of the route's existing `afterBooking` closure. `intent.ts` is not touched (the
fare-lines job edits it); `afterBooking` already runs on the owner paths only, after `setBookingDetails`.

Saved only when: both code flags are on, the request Origin is the public site (the dashboard Origin shares
the owner's own `.vamostaxi.site` cookies and gets nulls), a consent subject cookie exists, and
`readConsentChoice` under `asAnon` says marketing is on under the current version at that moment. Values
must match Meta's format (same patterns as the DB CHECK; a test reads the migration file and compares).
Duplicate cookies must agree. Otherwise nulls are written, which clears values from an earlier press.
A failure logs the SQLSTATE only and never changes the Pay answer. Flags are off, so today the block does nothing.

Verified: `vitest run lib/meta lib/checkout/intent.test.ts` 343 passed; `pnpm typecheck` passes; no change under
`lib/checkout`, `app/checkout`, `app/confirmation`, `lib/quote`.
Not verified here: a full Pay press needs Stripe; the SQL call is proven by 28-01's Worker-client test, and the
end-to-end proof is the controller's 4242 payment after deploy.
