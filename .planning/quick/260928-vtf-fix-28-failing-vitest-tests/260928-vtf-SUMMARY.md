---
phase: quick-260928-vtf
plan: 01
subsystem: web-tests
tags: [vitest, ci, dc-mock-sync, stale-tests, icon-regression]
key-files:
  modified:
    - apps/web/package.json
    - app/home/Reviews.dc.html
    - app/home/home.dc.html
    - apps/web/lib/checkout/email-failed.test.ts
    - apps/web/lib/checkout/pay-land.test.ts
    - apps/web/lib/ops/fleet-http.test.ts
    - apps/web/lib/ops/sqlstate.test.ts
    - apps/web/lib/ops/ops-dc-finalize.test.ts
    - apps/web/lib/ops/ops-dc-settings.test.ts
    - apps/web/lib/ops/ops-write-contract.test.ts
    - apps/web/lib/ops/publish-public-chf.test.ts
    - apps/web/lib/ops/reviews-json.test.ts
    - apps/web/lib/quote/respond.test.ts
    - apps/web/tests/unit/ops-dashboard-host.test.ts
---

# Summary

`apps/web` vitest went from 28 failing tests on main to 0 (1631/1631), run
from a clean `public/app` through CI's own entry point, `pnpm test:unit`.

## 1. Missing DC mock sync (14 tests)

Tests read the generated copies in `apps/web/public/app/`. That folder is
gitignored and only written by `scripts/sync-dc-mock-to-public.mjs`, which runs
on `predev`/`prebuild`. CI runs the tests before any build, so the files were
missing (ENOENT) or stale.

Fix: `"pretest"` runs the same sync. Removing `public/app` reproduces exactly
CI's 28 failures; with the sync in place the count drops to 14.

## 2. Stale tests: code changed on purpose (13 tests)

Each test keeps its intent. Only the exact source match was updated.

| Test | Changed by |
|---|---|
| email-failed | b2af7ce: an unknown pay-link code sets no refusal |
| pay-land, gate | b2af7ce: payCouldNotStart only after the retry cap |
| pay-land, Stripe key | b2af7ce: stripeBrowserKey(env, prop) |
| fleet-http | 0f35aab: Phase 20 drops the Postgres code from the message text |
| sqlstate | exclusion 23P01 added |
| respond ×2 | 0f35aab: `private, no-store` |
| ops-dashboard-host | rewrites only go to /__vamos_gone, never into Next ops |
| ops-dc-finalize | invite claim lands on /dashboard |
| ops-dc-settings ×2 | path nav (/pricing, popstate); page transition retired (05154ca) |
| ops-write-contract | 5a4b0eb: fill is max-content with min-width 100% |
| publish-public-chf | envelope now built by the shared jsonErr |
| reviews-json, name block | 92d6af1: div with data-vt-no-i18n |

## 3. Real regression (1 test)

92d6af1 swapped the design-system `Icon name="external-link"` on the review
card for a hand-written inline `<svg>`. CLAUDE.md forbids hand-drawn SVG for
icons. The `Icon` is restored, and `external-link.svg` is declared in the
home.dc.html meta list.

Checked with a stubbed /api/reviews at 1440 and 390: the mask loads
`/assets/icons/external-link.svg` (200), the icon is 16px charcoal inside a
44px target, and no inline svg remains.

## Also checked

- typecheck, lint, lint:css and i18n:check pass.

## Not fixed: already failing on main, owner decisions

- `check:legal-claims`: LEGAL_LANGUAGES.imprint lists 4 languages, and D-12 says
  it must be ["en","de"].
- `check:numbers`: CHF figures in fx/convert, ops-pricing-tabs, rappen and
  rate-book-draft tests, and in migration 20260913180000.

Both run after the test step in CI, so CI never reached them before.
