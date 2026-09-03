---
phase: 05-public-surfaces-customer-accounts
plan: 25
status: checkpoint
---

# Plan 05-25 Summary

## Delivered

- Replaced the simulated contact confirmation with truthful accepted-for-delivery wording. It does not claim a customer copy or external delivery.
- Replaced contact placeholders with owner-confirmed facts: reply within 12–24 hours, WhatsApp availability 24/7, language support in any language—mainly English, Swiss German, French, and Arabic—and `info@vamostaxi.site`.
- Propagated the public mailbox through the DC contact surface, both DC footers, React contact/channel/footer surfaces, privacy, and imprint mail links.
- Retained only verified Facebook, Instagram, YouTube, and TikTok destinations; removed the unknown/star social control and all fallback/dead social URLs.
- Made the DC FAQ control use the Design System light-button variant so its label is legible.
- Rebuilt current DC contact snapshots at 390/768/1024/1440 for en/de/fr/ar. The visual harness now waits for the DC page to paint, neutralizes the frozen page-transition cover, and explicitly selects the page locale before capture.
- Realigned visual assertions with the served DC contact page rather than the obsolete React-only selectors. Coverage now verifies mobile ordering and tap targets, callable phone/WhatsApp links, RTL chrome, translated labels/placeholders, and translated non-raw failure messages.

## Commits merged into `phase-5`

- `567af7a14bd85f9f88e0d14c4a648e3723b3cf97` — static/DC contact, both footers, dictionary, source regressions, and synchronized public assets.
- `4c0b37fe7e7ef9ad6756244e48a2a1ad38a87f55` — React channels/form/footer/legal links and four-language regression coverage.

## Verification evidence

- RED → GREEN static source assertions for confirmed mailbox/support facts/social destinations and FAQ contrast: `contact-source.test.ts` + `footer-source.test.ts` — 6 tests passed in the static executor.
- RED → GREEN React contact source and delivery coverage — 10 tests passed in the React executor.
- Focused merged suite: `pnpm --filter web exec vitest run lib/contact-source.test.ts lib/footer-source.test.ts lib/react-contact-source.test.ts lib/forms/contact-delivery.test.ts` — **16 passed**.
- `pnpm --filter @vamos/emails test` — **34 passed**.
- `pnpm run i18n:check` — passed: **2,300 keys** checked.
- Local database reset and local role configuration completed before API proof.
- `pnpm --filter web exec playwright test tests/integration/contact-form.spec.ts --project=component-1440 --workers=1` — **4 passed**: unavailable provider is not success, verified persistence occurs once, idempotency replay does not duplicate the submission, oversized input and failed Turnstile do not write.
- `pnpm --filter @vamos/db exec supabase test db supabase/tests/contact_delivery_outbox.test.sql` — **15 passed**.
- `pnpm --filter web exec playwright test tests/visual/contact.spec.ts --workers=1` — **55 passed, 9 project-scoped skips** across 390/768/1024/1440; inspected current desktop, mobile, and Arabic captures. Captures are nonblank; FAQ text is readable; the 390px layouts have no horizontal overflow; Arabic chrome is RTL.
- `pnpm run lint` — passed with 0 errors (5 inherited warnings).
- `pnpm run build` — passed. Expected `ENVIRONMENT_FALLBACK` during SSG was logged without failing the build.
- `git diff --check` — passed.

## Open gate: Task 4 owner UAT

No staging deployment, Worker secret inspection, real mailbox delivery, or external provider request was performed in this execution gate.

`pnpm run typecheck` remains blocked by three inherited errors in `apps/web/lib/ops/invite.test.ts`: one read-only `delete process.env.NODE_ENV` error and two read-only `NODE_ENV` assignment errors. No changed Phase 5 contact file appears in that output.

The owner must now perform the blocking staging UAT in 05-25-PLAN.md: verify authorised Turnstile and Resend configuration, use a monitored recipient, submit once, replay with a fresh challenge and the same idempotency key, confirm genuine delivery/no duplicate, and inspect all eight resolved contact elements on staging before ship review, push, or PR creation.
