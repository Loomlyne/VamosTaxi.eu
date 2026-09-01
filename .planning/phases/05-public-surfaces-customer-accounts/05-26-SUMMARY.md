---
phase: 05-public-surfaces-customer-accounts
plan: 26
status: checkpoint
---

# Plan 05-26 Summary

## Commits

- `f64f7ec68bf0dce725efa279a729cda5f26a475b` — `feat(contact): add durable delivery and DC submission`
- `27bcd3a5b7caa9a120bf1d2d38382337feef9be7` — `fix(footer): remove unverified address and add TikTok`
- Current correction commit — `fix(contact): retry challenge and footer hover`

## Delivered

- Added a private contact delivery outbox migration, trigger, claim/finalize RPCs, and pgTAP coverage. Existing contact rows are backfilled without duplicating PII.
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
- Added a database-free static-source regression test that fails if the removed unsupported strings, placeholder social URLs/state, or sample review data return; it also requires each known working direct-contact destination.

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
- Full web Vitest was attempted with the main checkout binary from this isolated worktree: 37 files / 373 tests passed; it could not complete because the worktree deliberately has no dependency tree, leaving `fast-check` and `@vamos/db/identity` unresolved. Its two resolved-test failures are inherited: `lib/ops/chauffeurs.test.ts` expects `ops.language.*` but data uses `ops.spoken.*`, and `lib/pricing/rateBook.test.ts` expects null `night_window_tz` but receives the established `Europe/Zurich` fallback. Neither path was modified.

## Deviations / open gates

- Local Supabase was not started. The focused pgTAP test was written but not run; this remains an owner gate.
- No provider email was sent, deployed resource provisioned, or UAT claimed.
- The plan browser integration/Playwright responsive checks remain required before UAT. The isolated worktree cannot load Playwright TypeScript specs from the main binary because its package resolution treats them as CommonJS; no configuration change was made outside this plan to work around that environment limitation.
- Owner must still verify staging Turnstile hostname/site key, verified Resend sender and monitored recipient/reply-to, Worker secret bindings, real inbox delivery, replay behavior, controlled provider failure, and evidence retention.
- The reviewed 05-26 plan remains an untracked local planning artifact. This corrected SUMMARY is committed with the code fix.
