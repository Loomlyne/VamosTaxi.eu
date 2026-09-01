---
phase: 06-ops-reference-data-content-console
plan: 13
subsystem: ops-dc
status: executed-pending-uat
requires:
  - plan: 06-12
    provides: dashboard DC comment pack and scheduled digest baseline
provides:
  - In-place dashboard hash animation without document cover sheets
  - Restored straight Fleet hierarchy and full-width CHF BrandSelect root
  - Reload-safe canonical avatar URL mapping in Profile and Sidebar
  - Branded localized staff digest with guest-row rendering and escaped dynamic fields
key-files:
  modified:
    - app/vamos-page-transition.js
    - app/ops/OpsSidebar.dc.html
    - app/ops/OpsSettings.dc.html
    - app/ops/OpsProfile.dc.html
    - apps/web/lib/ops/digest.ts
    - apps/web/lib/ops/ops-dc-settings.test.ts
    - apps/web/tests/integration/ops-digest.spec.ts
    - apps/web/tests/integration/ops-staff-me.spec.ts
verification:
  - "Focused Vitest: 17 passed"
  - "node --check app/vamos-page-transition.js: passed"
  - "git diff --check: passed"
  - "pnpm run lint: passed with 5 pre-existing warnings"
  - "pnpm run typecheck: blocked by pre-existing readonly process.env mutations in apps/web/lib/ops/invite.test.ts"
  - "pnpm run build: passed; expected ENVIRONMENT_FALLBACK messages during static generation"
---

# Phase 6 Plan 13 Summary

## Delivered

- Dashboard hash changes use a 150ms in-place `#dc-root` transition; document navigation keeps the existing sheet transition, while hash changes never invoke it.
- Fleet returns to the pre-comment-pack straight rail / Vehicles / Chauffeurs hierarchy.
- The CHF `BrandSelect` root is explicitly `width:100%`; dashboard CHF host lock remains unchanged.
- Removed remaining account-delete wording from the Ops source surface while retaining avatar removal.
- Avatar persistence now preserves a previously valid avatar when a response does not expose `avatarPath`, and Profile plus Sidebar share canonical `/photos/...` URL mapping after reload.
- Digest output is branded, compact, recipient-language-aware, escaped in HTML, plaintext-equivalent, and supports guest rows without changing the Zurich 06:00 gate, claim-before-send ledger, or aggregate-only logs.

## Verification

- Focused source/unit proof: `apps/web/node_modules/.bin/vitest run apps/web/lib/ops/ops-dc-settings.test.ts apps/web/lib/ops/digest.test.ts` → **2 files, 17 tests passed**.
- `node --check app/vamos-page-transition.js` and `git diff --check` passed.
- `pnpm run lint` passed with five pre-existing unused-disable warnings.
- `pnpm run typecheck` remains blocked by `apps/web/lib/ops/invite.test.ts` attempting `delete process.env.NODE_ENV` and assignments to readonly `process.env.NODE_ENV` (TS2704 / TS2540 at lines 15, 16, 35).
- `pnpm run build` passed. Next emitted expected `ENVIRONMENT_FALLBACK` messages while generating static pages.
- The required Playwright integration invocation is currently blocked before test collection: `apps/web/tests/integration/ops-staff-me.spec.ts` errors `SyntaxError: Cannot use 'import.meta' outside a module` under the existing Playwright setup. No runner/config changes were made outside this plan.

## Scope and UAT

- Accepted items 6–10 were not changed.
- No UAT or ship approval is claimed. Staging deployment and live dashboard asset evidence follow this committed plan artifact.
