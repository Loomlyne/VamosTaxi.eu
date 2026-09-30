---
phase: 27-consent-record
plan: 10
subsystem: legal-pages, consent
requirements: [META-03, META-05]
key-files:
  modified:
    - apps/web/app/[locale]/cookies/page.tsx
    - apps/web/app/[locale]/privacy/page.tsx
    - apps/web/components/legal/LegalPage.tsx
    - apps/web/next.config.ts
    - apps/web/lib/consent/policy.ts
    - apps/web/lib/meta/legal-gate.test.ts
    - apps/web/lib/legal-updated.test.ts
metrics:
  completed: 2026-09-30
---

# Phase 27 Plan 10: Next legal slots and consent version bump

The Next /cookies and /privacy pages now render the owner's texts (`cookies.meta-row`, `legal.meta-privacy-line`) in their Phase 26 slots. `CONSENT_POLICY_VERSION` is `2026-09-30`, equal to `CONSENT_UPDATED`.

## Commits
- f9f3c045 Task 1: slots, consent date, next.config `CONSENT_UPDATED_ISO`, `LegalPage consentDated`, pins rewritten
- 51b6e128 Task 2: version bump to 2026-09-30 and equality tests

## Results
- `vitest run lib/meta lib/legal-updated.test.ts lib/consent`: 12 files, 128 tests pass.
- `pnpm test:unit`: 261 files passed, 1 skipped, 2624 tests passed, 0 failed.
- `tsc --noEmit` clean.
- `grep 'label="Meta '` on both pages: no output. `"2026-09-12"` count in policy.ts: 0.
- `legal-gate.ts` untouched (`git diff --stat` empty); `META_LEGAL_GATE_OPEN = false`.
- `LEGAL_UPDATED` still `2026-09-30`, `CONSENT_UPDATED` `2026-09-30`: two separate constants. The equality test compares `CONSENT_POLICY_VERSION` with `CONSENT_UPDATED` only, and a second test asserts the two assignments are separate.

## Ship-day note
The version is the Zurich date of today (2026-09-30). If the ship day differs, change `CONSENT_POLICY_VERSION` in `apps/web/lib/consent/policy.ts` and `CONSENT_UPDATED` in `app/vamos-legal-updated.js` to the same date; the equality test fails otherwise. `LEGAL_UPDATED` does not move (D-31).

## Deviations
1. Commit trailer is `Co-Authored-By: Claude Sonnet 5.5` (this session's attribution instruction), not the `Claude Opus 5.5` line in 27-EXEC-RULES.md.
2. D-29/D-30 on the Next cookies page: the page has no marketing lead sentence ("Nothing in this category...") and no marketing table or `vamos:cookie-prefs` row, so nothing to remove. The consent row name now reads `consent_subject · vamosCookieConsent`. Its duration cell is the PendingSlot "Consent duration", left alone with its assertion, so key `cookies.duration-1-year` was not added and no message files changed. The plan's PendingSlot case, reported as instructed.
3. The cookies page previously had no date prop; it now passes `consentDated`. Privacy switched from `shipDated` to `consentDated` (D-31), so its date now equals the consent version.
4. The Meta slots now hold a `<p>` wrapping the `t.rich` call (wrapper div, class and data attribute unchanged).

## Not verified
- No browser/visual check of the Next pages (the Next build reaches no customer; live pages are the mocks).
- `pnpm db:seed:gen` is left to 27-11 (no message keys changed here).
- 27-EXEC-RULES.md is committed with this summary.
