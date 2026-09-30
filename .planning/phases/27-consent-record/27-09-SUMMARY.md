---
phase: 27-consent-record
plan: 09
subsystem: legal-mocks
tags: [consent, cookies, privacy, mock]
requires: [27-03, 27-05, 27-06]
provides:
  - "CONSENT_UPDATED + consentLabel in app/vamos-legal-updated.js"
  - "cookies and privacy mocks carry the owner's section 2 and 3 texts"
key-files:
  modified:
    - app/vamos-legal-updated.js
    - app/pages/cookies.dc.html
    - app/pages/privacy.dc.html
    - app/vamos-i18n-dict.js
    - apps/web/lib/legal-updated.test.ts
  created:
    - apps/web/lib/consent/legal-pages-27.test.ts
requirements: [META-03, META-04]
completed: 2026-09-30
---

# Phase 27 Plan 09: Cookies and privacy mocks Summary

/cookies and /privacy now show the owner's Meta texts (section 2 row, section 3 line) through `VamosMetaTexts.segments`, share one consent date, and the cookies panel reads the server record.

## Commits
- c9d45f72 feat(27-09): cookies page carries owner row, consent date, server-read panel, no Reset (tasks 1 and 2, one file, one commit)
- ff4bb9b5 feat(27-09): privacy section 04 carries owner text, consent date, pins (task 3)

## What was built
- `CONSENT_UPDATED = '2026-09-30'` (Zurich date today) and `consentLabel(lang)`; LEGAL_UPDATED line untouched. 27-10 sets the final value.
- cookies: date from `consentLabel`; section 06 lead removed, caption "Marketing", one `colspan=4` row with section 2 segments (bold, code); necessary row `consent_subject · vamosCookieConsent`, "1 year"; Reset button, its line and handler removed; poll and localStorage removed, panel uses `VamosConsent.state()` refreshed on `VamosConsent.onChange`, "Saved on" uses `recordedAt`.
- privacy: section 04 ends with section 3 (lead in `<strong>`), date from `consentLabel`.
- dict: one line `'1 year'` (de/fr/ar as decided). 'Marketing' already existed.

## Commands and results
- `node scripts/sync-dc-mock-to-public.mjs`, then `vitest run lib/legal-updated.test.ts lib/consent/legal-pages-27.test.ts lib/legal-text-hygiene.test.ts lib/live-no-tbc.test.ts lib/consent/owner-texts.test.ts`: 5 files, 56 tests pass.
- Task 1 and 2 greps: old date, lead, caption, old row name, Reset, resetConsent, setInterval, localStorage all absent; `git diff --numstat app/vamos-i18n-dict.js` = 1 insertion, 0 deletions.
- terms, cancellation, imprint: no diff, `consentLabel` count 0.

## Deviations from Plan
- Tasks 1 and 2 edit the same file and were done in one pass and one commit.
- The pin test checks `this.segs('cookiesRow')` / `this.segs('privacyLine'` plus the `VamosMetaTexts.segments(key, ...)` call, since the mocks wrap segments in a local helper.
- The onChange event has no `recordedAt`, so the panel refetches state on each consent event instead of using the event detail.
- The line "Read from this browser, so it is the real state, not an example." under section 02 is now stale wording; not changed (no new legal/copy allowed). Owner to decide.

## Not verified
- No browser check: the Marketing row layout, RTL, de at 1080, 390px card layout of a `colspan` row (mobile card `td` uses grid with no `data-l`), a real panel round trip against a running server.
- `VamosLocale.coverage(root)` on /cookies and /privacy.
- The `.dc.html` runtime handling of `sc-for` inside a table cell was modelled on the banner markup, not executed.

## Known Stubs
None.

## Self-Check: PASSED
