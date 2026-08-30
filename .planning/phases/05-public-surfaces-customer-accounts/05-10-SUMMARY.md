---
phase: 05-public-surfaces-customer-accounts
plan: 10
subsystem: ui
tags: [legal, cancellation, imprint, i18n, playwright]

requires:
  - phase: 05-04
    provides: LegalPage, LegalToc, PendingSlot
  - phase: 05-03
    provides: LanguageCoverageNotice, LEGAL_LANGUAGES.imprint ['en','de']
provides:
  - /cancellation through LegalPage
  - /imprint with honest two-language coverage notice
affects: [05-11, 05-23]

tech-stack:
  added: []
  patterns: [LegalPage shell, PendingSlot TBC, LanguageCoverageNotice]

key-files:
  created:
    - apps/web/app/[locale]/cancellation/page.tsx
    - apps/web/app/[locale]/imprint/page.tsx
    - apps/web/app/[locale]/imprint/imprint.css
    - apps/web/tests/visual/legal-cancellation-imprint.spec.ts
  modified:
    - apps/web/components/legal/LegalToc.tsx

key-decisions:
  - "Mock data-lang de|en|both toggle is not ported; [locale] is the only language selector"
  - "LEGAL_LANGUAGES.imprint stays ['en','de'] — registry read, not re-decided"
  - "Street and postcode remain PendingSlots (ADR-014 §7)"
  - "LegalPage still emits data-vt-legal from the registry; imprint is en de, never en de fr ar"

patterns-established:
  - "Four-language legal pages: LanguageCoverageNotice is a no-op; imprint is the page where I18N-08 bites"

requirements-completed: [SITE-05, SITE-06, SITE-07, SITE-02, I18N-08]

duration: 50min
completed: 2026-08-30
---

# Phase 05 Plan 10: Cancellation and imprint Summary

**`/cancellation` (9 sections, 20 English TBC pills) and `/imprint` (9 sections, 9 pills) through LegalPage; imprint declares en+de only under fr/ar.**

## Performance

- **Duration:** 50 min
- **Started:** 2026-08-30T13:55:17Z
- **Completed:** 2026-08-30T14:45:29Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `/cancellation` ports nine mock sections; refund tiers in `Table`; 20 `data-tok` pills (LegalPage date/version + body).
- `/imprint` ports nine sections as semantic `<dl>`; `LanguageCoverageNotice page="imprint"` above the list; street, postcode, UID, credits stay pills.
- 32 Playwright baselines (4 locales × 2 pages × 4 viewports). I18N-08: notice present on `/fr/imprint` and `/ar/imprint` naming English/German; absent on en/de imprint and all cancellation locales.

## Task Commits

1. **Task 1: cancellation page** - `e8448c4` (feat)
2. **Task 2: imprint page** - `2917e09` (feat)
3. **20th cancellation TBC pill** - `50021a0` (fix)
4. **Imprint dl CSS + home.disclaimer TOC** - `d4c5159` (fix)
5. **Task 3: proofs + 32 baselines** - `2e3664c` (test)
6. **Cancellation table overflow wrap** - `9871bb2` (fix)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/app/[locale]/cancellation/page.tsx` — cancellation & refund policy
- `apps/web/app/[locale]/imprint/page.tsx` — imprint
- `apps/web/app/[locale]/imprint/imprint.css` — dl 1-col <620px, `230px minmax(0,1fr)` above
- `apps/web/components/legal/LegalToc.tsx` — `home.*` title keys
- `apps/web/tests/visual/legal-cancellation-imprint.spec.ts` — proofs
- 32 snapshots under `legal-cancellation-imprint.spec.ts-snapshots/`

## Decisions Made

- Mock page-local language toggle (de / en / both) is not ported. SSR language is the `[locale]` segment; a second switch would contradict `lang` and hreflang. Parallel DE+EN is the header switcher; the coverage notice tells fr/ar readers the page exists in English and German only.
- `LEGAL_LANGUAGES.imprint` was read as `['en','de']`, not re-decided.
- Cancellation: 9 `<section id>` (tiers, how, modify, delays, driver, noshow, disruption, refunds, vouchers). Pills: 20.
- Imprint: 9 sections (register, kontakt, vertretung, mwst, aufsicht, dispute, haftung, urheberrecht, credits). Pills: 9.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Twentieth cancellation PendingSlot**
- **Found during:** Task 3 tok-count assertion
- **Issue:** 17 body + 2 LegalPage hero pills = 19 rendered `data-tok`
- **Fix:** extra `24 hours before pickup` PendingSlot on the measured-from paragraph
- **Files modified:** `apps/web/app/[locale]/cancellation/page.tsx`
- **Verification:** `[data-tok]` length 20 in Playwright
- **Committed in:** `50021a0`

**2. [Rule 2 - Missing Critical] Imprint dl CSS as a sibling file**
- **Found during:** Task 3 `grid-template-columns` at 1024
- **Issue:** inline `<style>` in the RSC did not apply; 1024 stayed one column
- **Fix:** `imprint.css` with `@media (min-width: 620px)` matching the mock (viewport width, not container)
- **Files modified:** `apps/web/app/[locale]/imprint/imprint.css`, `LegalToc.tsx` (`home.*`)
- **Verification:** 1024 columns start with `230px`; 390 does not
- **Committed in:** `d4c5159`

**3. [Rule 1 - Bug] LegalPage still emits `data-vt-legal`**
- **Found during:** Task 3
- **Issue:** Plan asked for no attribute in rendered HTML; 05-04 LegalPage always sets it from `LEGAL_LANGUAGES`
- **Fix:** assert imprint is `en de` (not the mock's false `en de fr ar`); page.tsx still does not emit the attribute
- **Files modified:** spec only
- **Verification:** Playwright `toHaveAttribute("data-vt-legal", "en de")` on imprint
- **Committed in:** `2e3664c`

---

**Total deviations:** 3 auto-fixed (2 missing critical, 1 bug)
**Impact on plan:** Extra CSS file and LegalToc `home.*` were required for SITE-06 / TOC; tok count and coverage assertions hold.

## Issues Encountered

- Four `next dev` instances in one Playwright run SIGKILL'd workers (OOM). Spec verified per viewport project `--workers=1`.
- Unprefixed `/imprint` after `/ar/imprint` kept the locale cookie and showed the notice. Tests use `/en/…` prefixes and `clearCookies`.
- Full `pnpm test:visual` not re-run in this sitting (same as 05-04). This spec's four projects passed when run one project at a time.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 05-11 FAQ. Five legal pages now share one shell.

## Self-Check: PASSED

- Cancellation: 9 section ids, ≥20 PendingSlot, no yellow, no force-dynamic
- Imprint: notice, ≥9 PendingSlot, `<dl>`, no `data-vt-legal`/`data-lang` in page.tsx, registry unread
- 32 snapshots on disk; I18N-08, tok identity, hreflang, RTL key column asserted

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-30*
