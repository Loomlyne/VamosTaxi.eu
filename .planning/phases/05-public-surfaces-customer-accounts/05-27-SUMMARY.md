---
phase: 05-public-surfaces-customer-accounts
plan: 27
subsystem: contact-delivery
status: executed-awaiting-uat
completed: 2026-09-02
---

# Plan 05-27: Contact delivery security remediation — execution summary

## Delivered

- Bound server-side Turnstile acceptance to `success`, `action === "contact"`, and a configured non-empty hostname allowlist. Missing/malformed action or hostname now fails before payload normalization, idempotency lookup, SQL, or provider work.
- Added a Worker-only `vamos_system` identity path for contact outbox claim/finalize. Additive migration revokes those RPCs from public roles and only permits `vamos_system`.
- Repaired static/DC contact behavior: late Turnstile scripts keep retrying until a widget mounts; recoverable failures reset the challenge without changing the idempotency key; a successful reset clears the widget and starts a fresh mount; accepted state requires exactly HTTP `200` plus `{ ok: true }`.
- Corrected static locale payloads through `VamosLocale.lang()`, stale rewrite representation headers, and canonical/static privacy/imprint support links.
- Added route-level controlled-gateway coverage for `/contact`, `/de/contact`, `/fr/contact`, and `/ar/contact`, including non-200 acceptance rejection and contact reset lifecycle.

## Commits

- `b9b771b` — reviewed Plan 05-27 artifact
- `99def0e` — static/DC middleware, locale, header, and factual-link remediation
- `c6b2a0d` — strict Turnstile and Worker-only outbox authorization
- Task-3 closeout changes are staged with this summary commit.

## Verification

Passed:

- `pnpm --filter @vamos/db exec supabase test db supabase/tests/contact_delivery_outbox.test.sql` — 26 pgTAP assertions
- `pnpm --filter @vamos/db exec vitest run test/local/identity-contract.test.ts` — 9 tests
- `apps/web/node_modules/.bin/vitest run lib/turnstile.test.ts lib/contact-source.test.ts lib/footer-source.test.ts lib/react-contact-source.test.ts` — 30 tests
- `apps/web/node_modules/.bin/playwright test tests/integration/contact-form.spec.ts tests/integration/contact-lifecycle.spec.ts --project=component-1440 --workers=1` — 6 tests
- `apps/web/node_modules/.bin/playwright test tests/visual/contact.spec.ts --workers=1` — 55 passed, 9 intentional viewport skips
- `pnpm run i18n:check` — 2,300 keys checked
- `pnpm run lint` — 0 errors; 5 pre-existing unused-disable warnings
- `pnpm run build` — passed; expected `ENVIRONMENT_FALLBACK` messages were emitted during static generation without failing the build

Inherited blocker, unchanged by this scoped plan:

- `pnpm run typecheck` exits 2 only in untouched `apps/web/lib/ops/invite.test.ts` because it mutates readonly `process.env.NODE_ENV` (TS2704/TS2540).

## UAT gate still required

No merge or production deploy occurred. Before staging UAT/ship, owner configuration and proof remain required:

1. A configured `CONTACT_TURNSTILE_ALLOWED_HOSTNAMES` value matching the staging public hostname.
2. Verified Resend sender/domain plus real monitored recipient/reply-to.
3. A genuine staging inbox arrival and consumed-token/idempotency replay proof.
4. Clean renewed Cursor Approval and Cursor Security results, plus ship-stage independent review and security pass.
