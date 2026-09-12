---
phase: 10-hardening-performance-security-compliance
plan: 04
subsystem: ui
tags: [consent, cookie-banner, i18n, turnstile, nFADP]

requires:
  - phase: 10-hardening-performance-security-compliance
    provides: POST /api/consent asAnon record_consent + Turnstile action consent
  - phase: 05-public-site-i18n-legal-contact-auth
    provides: SiteShell + /cookies LegalPage + four-language messages
provides:
  - Two-button public CookieBanner (Accept/Dismiss)
  - Necessary-only /cookies page with settings_change
  - Four-language banner copy
affects: [10-08]

tech-stack:
  added: []
  patterns:
    - SSR hide banner via cookies() consent_subject; dashboard host omitted in layout
    - Footer vamos:cookie-prefs POSTs settings_change, never a prefs grid

key-files:
  created:
    - apps/web/components/consent/CookieBanner.tsx
    - apps/web/components/consent/CookieBanner.css
  modified:
    - apps/web/components/shell/SiteShell.tsx
    - apps/web/app/[locale]/layout.tsx
    - apps/web/app/[locale]/cookies/page.tsx
    - apps/web/components/shell/SiteFooter.tsx
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
    - apps/web/components/forms/TurnstileWidget.tsx
    - apps/web/components/legal/LegalPage.tsx
    - apps/web/vitest.config.ts

key-decisions:
  - "Two buttons only; Dismiss skips Turnstile; Accept uses data-action=consent"
  - "Dashboard host skipped in LocaleLayout so SSR cannot flash a banner"
  - "Withdrawal is settings_change new row; TBC pills stay TBC"

patterns-established:
  - "CookiePrefsListener on SiteFooter handles vamos:cookie-prefs without a toggle grid"
  - "banner-contract.test.ts is a source-read gate in components/consent"

requirements-completed: [SITE-08]

duration: 26min
completed: 2026-09-12
---

# Phase 10 Plan 04: Two-button CookieBanner + necessary-only /cookies Summary

**Public two-button Accept/Dismiss banner records consent through POST /api/consent; /cookies lists only language, auth session, and consent_subject; Cloudflare Web Analytics stays cookieless**

## Performance

- **Duration:** 26 min
- **Started:** 2026-09-12T15:00:00Z
- **Completed:** 2026-09-12T15:26:28Z
- **Tasks:** 3/3
- **Files modified:** 13 (2 created, 11 modified)

## Accomplishments

- CookieBanner is Accept + Dismiss only; Accept sends Turnstile `action=consent`; Dismiss writes without a token
- LocaleLayout reads HttpOnly `consent_subject` and dashboard host; SiteShell still skips ops/dev
- `/cookies` dropped the four-category grid; settings_change writes a new row; TBC pills stay
- en/de/fr/ar copy same pass; footer `vamos:cookie-prefs` POSTs settings_change
- `pnpm --filter web exec vitest run components/consent/banner-contract.test.ts` — 3 passed

## Task Commits

1. **Task 1: Two-button production banner on public shell** - `6accdbf` (feat)
2. **Task 2: Rewrite /cookies to necessary-only truth** - `21b8966` (feat)
3. **Task 3: Four-language banner copy + footer prefs event** - `dc879db` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/components/consent/CookieBanner.tsx` - two-button banner + settings_change helpers
- `apps/web/components/consent/CookieBanner.css` - `--vt-*` bottom sheet
- `apps/web/components/shell/SiteShell.tsx` - optional banner node; skipped on ops/dev
- `apps/web/app/[locale]/layout.tsx` - SSR cookie + dashboard host gate
- `apps/web/app/[locale]/cookies/page.tsx` - necessary-only table + withdrawal control
- `apps/web/components/shell/SiteFooter.tsx` - CookiePrefsListener
- `apps/web/i18n/messages/en.json` - banner/cookies strings
- `apps/web/i18n/messages/de.json` - same keys
- `apps/web/i18n/messages/fr.json` - same keys
- `apps/web/i18n/messages/ar.json` - same keys
- `apps/web/components/forms/TurnstileWidget.tsx` - action `consent` + `data-action`
- `apps/web/components/legal/LegalPage.tsx` - `cookies.` standfirst keys
- `apps/web/vitest.config.ts` - include `components/consent/**/*.test.ts`

## Decisions Made

- Dashboard skip is host check in the server layout plus SiteShell `isOps`, so the banner never SSR-paints on `dashboard.vamostaxi.site`
- Footer event POSTs `settings_change` instead of opening a prefs UI (D-05)
- 429 copy reuses existing `quote.error.rate_limited`; no new error strings

## Deviations from Plan

### Auto-fixed Issues

**1. Vitest include for Wave 0 banner contract**
- **Found during:** Task 1
- **Issue:** `banner-contract.test.ts` lived outside `lib/**` and `tests/unit/**`, so the plan command exited 0 with no tests
- **Fix:** include `components/consent/**/*.test.ts`
- **Files modified:** `apps/web/vitest.config.ts`
- **Verification:** 3 tests passed
- **Committed in:** `6accdbf`

**2. Turnstile action union + LegalPage cookies prefix**
- **Found during:** Task 1 / Task 2
- **Issue:** widget typed `contact | checkout`; LegalPage standfirst only resolved `common.` / `legal.`
- **Fix:** add `consent` action and `cookies.` key prefix
- **Files modified:** `TurnstileWidget.tsx`, `LegalPage.tsx`
- **Verification:** banner-contract green; cookies page uses `cookies.necessary-only-standfirst`
- **Committed in:** `6accdbf` / `21b8966`

---

**Total deviations:** 2 auto-fixed
**Impact on plan:** Required for the named verify command and standfirst truth. No four-toggle grid. No 10-08.

## Issues Encountered

- Comment text `Manage preferences` failed the source-read contract; reworded the banner header comment

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- SITE-08 UI is in code: two buttons, four languages, necessary-only `/cookies`, dashboard omitted
- Human check still owed: first visit vs dashboard host vs reload after Accept/Dismiss
- Sentry still off. Do not start 10-08 from this plan.

---
*Phase: 10-hardening-performance-security-compliance*
*Completed: 2026-09-12*
