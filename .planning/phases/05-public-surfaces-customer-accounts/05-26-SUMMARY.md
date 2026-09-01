---
phase: 05-public-surfaces-customer-accounts
plan: 26
status: checkpoint
---

# Plan 05-26 Summary

## Commits

- `f64f7ec68bf0dce725efa279a729cda5f26a475b` — `feat(contact): add durable delivery and DC submission`
- `27bcd3a5b7caa9a120bf1d2d38382337feef9be7` — `fix(footer): remove unverified address and add TikTok`

## Delivered

- Added a private contact delivery outbox migration, trigger, claim/finalize RPCs, and pgTAP coverage. Existing contact rows are backfilled without duplicating PII.
- Reworked `/api/contact` to verify Turnstile before schema/DB/delivery work, persist through the existing RPC, claim durable delivery states, use provider idempotency identities, and return success only after both messages finalize accepted.
- Added locale-specific contact acknowledgement/support email renderers for `en`, `de`, `fr`, and `ar`; HTML/text render and Arabic RTL are covered.
- Replaced the DC contact timeout/case-reference success path with `/api/contact` POST handling, an idempotency key, and Turnstile widget integration. It retains inputs and uses the failure alert on non-success.
- Removed footer address/hourly items, retained telephone and WhatsApp, added exact TikTok URL, and added reduced-motion-aware React Back to top behavior.
- Ran `scripts/sync-dc-mock-to-public.mjs`; generated public assets remain ignored by git.

## Test evidence

- RED: `contact-delivery.test.ts` first failed because `./contact-delivery` did not exist.
- GREEN: `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest run lib/forms/contact-delivery.test.ts` — 1 file, 3 tests passed.
- `pnpm --filter @vamos/emails test` — 2 files, 34 tests passed.
- `pnpm --filter web run typecheck` remains red only on inherited `apps/web/lib/ops/invite.test.ts` readonly `process.env.NODE_ENV` errors (three TS errors). Contact/email type errors were resolved.

## Deviations / open gates

- Local Supabase was not started. The focused pgTAP test was written but not run; this is an executor owner gate.
- No provider email was sent, deployed resource provisioned, or UAT claimed.
- The plan's browser integration/Playwright responsive checks and full lint/build were not run in this checkpoint. They remain required before UAT.
- Owner must still verify staging Turnstile hostname/site key, verified Resend sender and monitored recipient/reply-to, Worker secret bindings, real inbox delivery, replay behavior, controlled provider failure, and evidence retention.
- The plan and this summary are gitignored planning artifacts and intentionally remain on disk rather than committed.
