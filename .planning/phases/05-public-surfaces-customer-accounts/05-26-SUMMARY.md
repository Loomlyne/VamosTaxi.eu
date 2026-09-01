---
phase: 05-public-surfaces-customer-accounts
plan: 26
status: checkpoint
---

# Plan 05-26 Summary

## Commits

- `f64f7ec68bf0dce725efa279a729cda5f26a475b` — `feat(contact): add durable delivery and DC submission`
- `27bcd3a5b7caa9a120bf1d2d38382337feef9be7` — `fix(footer): remove unverified address and add TikTok`
- Final correction checkpoint — removes the residual unverified response-time/TBC placeholder from the DC contact copy.

## Delivered

- Added a private contact delivery outbox migration, trigger, claim/finalize RPCs, and pgTAP coverage. Existing contact rows are backfilled without duplicating PII.
- Remediated the stuck-`sending` failure mode: each channel claim now persists a fresh opaque UUID lease and a five-minute expiry. Only expired `sending` rows can be atomically reclaimed; every accepted/failed transition requires the exact unexpired current lease, so an older worker cannot mutate a reclaimed or terminal delivery.
- Kept `contact:<submission>:<channel>:v1` as the immutable provider idempotency identity on every reclaimed retry. The route carries the claim token through both finalize and fail RPC calls, and reports success only after both fenced finalizations have accepted.
- Reworked `/api/contact` to verify Turnstile before schema/DB/delivery work, persist through the existing RPC, claim durable delivery states, use provider idempotency identities, and return success only after both messages finalize accepted.
- Added locale-specific contact acknowledgement/support email renderers for `en`, `de`, `fr`, and `ar`; HTML/text render and Arabic RTL are covered.
- Replaced the DC contact timeout/case-reference success path with `/api/contact` POST handling, an idempotency key, and Turnstile widget integration. It retains inputs and uses the failure alert on non-success.
- Removed footer address/hourly items, retained telephone and WhatsApp, added exact TikTok URL, and added reduced-motion-aware React Back to top behavior.
- Ran `scripts/sync-dc-mock-to-public.mjs`; generated public assets remain ignored by git.

## Verification-gap corrections

- Both canonical DC footers now force static email/phone/TikTok link hover and social-glyph hover to `var(--vt-accent)` with `!important`, which is required to override their inline colours. No Maps destination or address was added.
- The DC contact form preserves its idempotency key after server/network delivery failure, clears the consumed token, and resets the existing Turnstile widget (or renders it when no widget exists) for a fresh retry challenge. No gallery/sample sent-state control was reintroduced.
- The DC contact source now exposes only telephone, WhatsApp, and the confirmed visible `info@vamostaxi.eu` email in its direct-contact card. It removes the unverified office, unsupported live chat, and default social-slot block; official footer social links remain unchanged.
- Removed dead review-switcher methods and their sample customer details, plus the named form/reference sample placeholders. Cookie-banner review state remains independent.
- Removed the residual `Response time`/`data-tok` TBC UI from both the form introduction and delivered-message state. Both now direct time-sensitive requests to the confirmed public telephone without claiming a response interval.
- Added a database-free static-source regression test that fails if the removed unsupported strings, placeholder social URLs/state, sample review data, or response-time/TBC placeholder returns; it also requires each known working direct-contact destination.

## Test evidence

- RED: `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest run lib/footer-source.test.ts` — failed because neither DC footer contained `[data-ft-link]:not([data-split]):hover{color:var(--vt-accent)!important}`.
- GREEN: the same command — 1 file, 1 test passed after the minimal CSS changes.
- RED: `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest run lib/contact-source.test.ts` — failed because `retryTurnstile = () => {` did not exist.
- GREEN: `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest run lib/footer-source.test.ts lib/contact-source.test.ts` — 2 files, 2 tests passed.
- Focused regression: `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest run lib/forms/contact-delivery.test.ts ../../packages/emails/src/contact.test.ts lib/footer-source.test.ts lib/contact-source.test.ts` — 3 files, 5 tests passed (the web Vitest config intentionally excludes package email tests).
- `pnpm --filter @vamos/emails test` — 2 files, 34 tests passed.
- `node scripts/sync-dc-mock-to-public.mjs` completed; generated `public/app/home/SiteFooter.dc.html` and `public/app/pages/SiteFooter.dc.html` each contain both forced-hover rules.
- Follow-up RED: `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest run lib/contact-source.test.ts` — 1 of 2 tests failed because the source did not render the confirmed visible email address.
- Follow-up GREEN: `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest run lib/contact-source.test.ts lib/footer-source.test.ts` — 2 files, 3 tests passed.
- Follow-up generated-output check: after `node scripts/sync-dc-mock-to-public.mjs`, static assertions verified both `public/app/pages/contact.dc.html` and `public/app/pages/contact.html` contain 4 confirmed direct-contact values and none of 22 forbidden address, chat, social-slot, placeholder, or sample-review values.
- Response-time TBC RED: `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest run lib/contact-source.test.ts` — 1 of 3 tests failed because the canonical contact source still contained `Response time`.
- Response-time TBC GREEN: the same command — 1 file, 3 tests passed after the minimal canonical copy/CSS removal.
- Response-time generated-output check: `node scripts/sync-dc-mock-to-public.mjs` completed; static assertions verified both generated public contact outputs contain neither `Response time` nor `data-tok`, and retain the time-sensitive call direction.
- Lease remediation RED: `/Users/koss/Developer/VamosTaxi.eu/apps/web/node_modules/.bin/vitest run lib/forms/contact-delivery.test.ts` from the 05-26 worktree — 5/5 tests failed before implementation because the old delivery gateway had neither structured lease claims nor fenced finalize arguments.
- Lease remediation GREEN: the same main-checkout Vitest binary — 1 file, 5 tests passed. It covers recovery before provider send and provider-accepted-before-finalize, verifies the renewed fence token is passed to finalization, and verifies retries preserve `contact:<submission>:<channel>:v1`.
- `git diff --check` passed. Focused web TypeScript checking has no lease-related error; the command remains blocked by three inherited read-only `process.env.NODE_ENV` test mutations in `lib/ops/invite.test.ts` (TS2704/TS2540), outside this plan's scope.
- Full web Vitest was attempted with the main checkout binary from this isolated worktree: 37 files / 373 tests passed; it could not complete because the worktree deliberately has no dependency tree, leaving `fast-check` and `@vamos/db/identity` unresolved. Its two resolved-test failures are inherited: `lib/ops/chauffeurs.test.ts` expects `ops.language.*` but data uses `ops.spoken.*`, and `lib/pricing/rateBook.test.ts` expects null `night_window_tz` but receives the established `Europe/Zurich` fallback. Neither path was modified.

## Deviations / open gates

- Local Supabase was not started. The updated focused pgTAP suite (lease/fence columns plus the fenced RPC signature and grants) was deliberately not run; it remains owner-gated and must be run from this worktree's `packages/db` only when the shared local stack is already available.
- No provider email was sent, deployed resource provisioned, or UAT claimed.
- The plan browser integration/Playwright responsive checks remain required before UAT. The isolated worktree cannot load Playwright TypeScript specs from the main binary because its package resolution treats them as CommonJS; no configuration change was made outside this plan to work around that environment limitation.
- Owner must still verify staging Turnstile hostname/site key, verified Resend sender and monitored recipient/reply-to, Worker secret bindings, real inbox delivery, replay behavior, controlled provider failure, and evidence retention.
- The reviewed 05-26 plan remains an untracked local planning artifact. This corrected SUMMARY is committed with the code fix.
