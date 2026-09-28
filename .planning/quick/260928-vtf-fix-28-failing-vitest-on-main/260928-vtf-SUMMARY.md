---
phase: quick-260928-vtf
plan: 01
subsystem: web-tests
tags: [vitest, ci, dc-mock-sync, checkout, pay-link, reviews, icons, i18n]
key-files:
  created:
    - apps/web/tests/support/sync-public.global-setup.ts
  modified:
    - apps/web/vitest.config.ts
    - apps/web/app/[locale]/checkout/CheckoutClient.tsx
    - apps/web/i18n/messages/{en,de,fr,ar}.json
    - app/home/Reviews.dc.html
    - app/home/home.dc.html
    - 11 test files (listed below)
---

# Summary

`apps/web` vitest went from 28 failures in 19 files (the same set on `origin/main` and
in CI) to 0, with 1636 tests passing in 168 files. The fix has four parts.

## 1. Generated public copies were missing in CI (14 tests)

Suites read `apps/web/public/app/**`. That folder is gitignored output of
`scripts/sync-dc-mock-to-public.mjs`, which only runs as predev/prebuild. CI runs
`test:unit` before build, so the reads failed with ENOENT and the "copies byte-equal"
tests failed.

- **Fix:** a vitest `globalSetup` runs the same sync once before the suites.

## 2. Stale source-text assertions (10 tests); the code change was deliberate

| Test | What changed in code |
|---|---|
| `sqlstate` | `OPS_SQLSTATE` gained `exclusion: 23P01`, which assign/edit-request use |
| `fleet-http` | Unknown SQLSTATE → plain copy "The chauffeur could not be saved."; the code stays in `code` |
| `respond` ×2 | `Cache-Control: private, no-store` (the house header after the Phase 20 audit) |
| `publish-public-chf` | Envelope is built by `jsonFail` → `jsonErr(code, status, { gaps })` |
| `ops-dashboard-host` | The only rewrites are the public-host 404s to `/__vamos_gone`; the test is now scoped to `dashboardHostMiddleware` |
| `ops-dc-finalize` | A failed invite claim is swallowed, then `location.replace('/dashboard')` |
| `ops-dc-settings` ×2 | The console moved from `#hash` routes to path URLs (`pushState` + `popstate`); the page transition is retired (05154ca) |
| `ops-write-contract` | The fill table is `width:max-content;min-width:100%` (5a4b0eb) |
| `pay-land` ×2 | The intent-effect locator moved; the Stripe key goes through `stripeBrowserKey()` |

## 3. Pay-link failures were silent (owner decision: restore a visible error)

- **Problem:** `sendPayLink` showed nothing for an unmapped error or a network error.
  Phase 21 required a visible fallback. The old generic key, `payCouldNotStart`, says
  "Try Pay and continue again", which is wrong in the pay-link flow (checkout-comments
  test).
- **Fix:** a new `checkout.payLinkNotSent` in EN/DE/FR/AR is the pay-link-only fallback.
  `email_failed` still resolves to `emailFailed`.

## 4. Hand-drawn SVGs in `Reviews.dc.html` (owner decision: restore the kit Icon)

- **Problem:** 92d6af1 had inlined the review-link and verified-badge SVGs, which breaks
  CLAUDE.md ("never hand-drawn SVG").
- **Fix:** both use `Icon` again: `external-link`, and `shield-check` to match the Next
  port. `home.dc.html` now declares `external-link`.
- **Check:** rendered at 1440 and 390 in EN and AR with stubbed review rows. Both icons
  paint through the kit mask and nothing scrolls sideways.

## Gates

vitest 1636/1636 (from a clean `public/`), `pnpm typecheck`, `pnpm lint:css`,
`pnpm i18n:check` and `pnpm lint` all exit 0. The 5 eslint warnings are pre-existing
and in untouched files.

## Not browser-tested

The pay-link refusal needs a live quote lock and a failing `/api/checkout/pay-link`,
which a local stack without a database can't produce.
