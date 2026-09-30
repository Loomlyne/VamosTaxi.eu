---
phase: 27-consent-record
plan: 08
subsystem: consent-banner-hosts
tags: [consent, banner, shell, checkout]
requires: [27-07]
requirements: [META-04]
completed: 2026-09-30
---

# Phase 27 Plan 08: Banner on every customer route Summary

The Next banner now renders wherever the footer renders (checkout, confirmation, pay link, error and not-found, home); ops, the dashboard host and /dev still skip it. The footer link only opens the sheet, and the sticky PAY bar and contact button sit above the banner.

## Commits
- 1759b560 feat(27-08): banner on every non-ops shell route
- 326f173f feat(27-08): footer only opens the sheet; PAY bar and FAB ride above the banner

## What was built
- `SiteShell.tsx`: `{isHome ? banner : null}` became `{banner}`; the ops/dev early return is unchanged.
- `app/[locale]/layout.tsx`: cookie read (`hasConsent`, `cookies`, `readConsentSubject` imports) removed; `showBanner = !onDashboard`. The banner decides visibility from the state GET.
- `SiteFooter.tsx`: `CookiePrefsListener` import and mount removed; comment updated. `CookieBanner.tsx`: inert export deleted.
- `checkout.css` `.vt-co__bar`: `inset-block-end: var(--vt-ck-reserve, 0px)`. `ContactFab.css`: `calc(24px + var(--vt-ck-reserve, 0px))`. One line each.
- Tests: `banner-hosts.test.ts` (SiteShell render matrix, 16 cases incl. dashboard cookie and host), `reserve-and-footer.test.ts` (source pins), `banner-contract.test.ts` updated (hosts test, listener pin now an absence check).

## Commands and results
- Red first: hosts matrix 7 failed / 9 passed before the SiteShell change; green after.
- `vitest run components/consent`: 3 files, 29 tests passed.
- `vitest run lib/meta/legal-gate.test.ts lib/live-no-tbc.test.ts`: 10 passed.
- `pnpm lint:css` exit 0. `pnpm check:db-fences`: 8 checks passed.
- Greps: `isHome ? banner` none; `hasConsent` none; `showBanner = !onDashboard` one line; `CookiePrefsListener` appears only in test files asserting absence.
- `git diff --numstat` on checkout.css and ContactFab.css: 1/1 each.
- `tsc --noEmit`: no errors in files touched by this plan.

## Deviations
- Commit trailer is `Co-Authored-By: Claude Sonnet 5.5` (session attribution instruction), as in 27-02 and 27-07.
- SiteFooter keeps a now single-child fragment wrapper around `<footer>`; left to keep the diff minimal.

## Not verified
- No browser run: the banner above the PAY bar at 390x844, the footer link opening the sheet on a Next page, and the reserve variable in practice are 27-12 (Playwright).
- Full visual suite not run (known red: SiteFooter default, RouteSummary x8; SiteHeader at 390 is a macOS effect).

## Known Stubs
None.

## Self-Check: PASSED
Commits 1759b560 and 326f173f exist; the two new test files are in them.
