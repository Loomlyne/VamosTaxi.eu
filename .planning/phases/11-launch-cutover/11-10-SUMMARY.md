---
phase: 11-launch-cutover
plan: 10
subsystem: ui
tags: [extract, imprint, about, faq, contact, terms, privacy, i18n, d-27]

requires:
  - phase: 11-launch-cutover
    provides: Wave 0 extract-no-invent locks, D-06 mailbox, D-07 phone
provides:
  - English .eu copy in existing .site routes (no partner, no .eu mailbox)
  - de/fr/ar same-pass for every new or changed English string
  - LEGAL_LANGUAGES.imprint en/de/fr/ar (D-27)
affects: [11-03]

tech-stack:
  added: []
  patterns:
    - .eu wins over PendingSlot TBC only when the field has a real value
    - contact facts from D-06/D-07, never info@vamostaxi.eu
    - CH-020.4.077.792-7 stays commercial register, never UID

key-files:
  created: []
  modified:
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json
    - apps/web/lib/legal-languages.ts
    - apps/web/app/[locale]/imprint/page.tsx
    - apps/web/app/[locale]/about/page.tsx
    - apps/web/app/[locale]/terms/page.tsx
    - apps/web/app/[locale]/privacy/page.tsx

key-decisions:
  - ".eu imprint has Bleicherstrasse 16, 8953 Dietikon — filled; UID/CHE-MWST absent — PendingSlot TBC (D-26 D-28)"
  - ".eu FAQ states driver details 6 hours before pickup — filled; 24h-sooner request kept"
  - ".eu imprint does not say German is binding — sentence dropped, not invented"
  - "D-27: LEGAL_LANGUAGES.imprint = en/de/fr/ar after extract + same-pass translation"
  - "PayPal, cash, hourly, corporate invoice, 48,350+ routes, become-a-partner, .eu mailbox not ported"

patterns-established:
  - Fill existing i18n keys and page slots only; leave class-dependent or Connecto-residue numbers TBC
  - Four languages in the same plan as the English extract

requirements-completed: [LAUNCH-07]

duration: 15min
completed: 2026-09-13
---

# Phase 11 Plan 10: Extract .eu copy Summary

**Live vamostaxi.eu copy extracted into existing .site routes, four languages same pass, no partner and no .eu mailbox**

## Performance

- **Duration:** 15 min
- **Started:** 2026-09-12T23:20:26Z
- **Completed:** 2026-09-12T23:33:29Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- Filled imprint street/postcode/postal from .eu (Bleicherstrasse 16, 8953 Dietikon ZH); UID stays TBC
- Filled terms registered name `Vamos Taxi` and driver-details lead time `6 hours`; dropped hourly from terms standfirst
- Filled privacy DSR window `30` days from .eu; extracted About CEO letter without Europe marketplace claims
- Contact standfirst uses the .eu form blurb; mailbox stays `info@vamostaxi.site`; phone/WhatsApp unchanged
- de/fr/ar translated in the same plan; `LEGAL_LANGUAGES.imprint` is `en/de/fr/ar` (D-27)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract English from live .eu into existing pages** - `76ac034` (feat)
2. **Task 2: Translate de/fr/ar and set imprint four-language coverage** - `93f3fc3` (feat)
3. **Task 3: extract-no-invent / leak-gate** - no file change (tests already green; not weakened)

## .eu fields that stayed TBC

| Slot | Why TBC |
| --- | --- |
| Imprint UID / CHE-MWST | .eu has no UID; CH-020.4.077.792-7 is commercial register, not UID |
| Imprint licence, dispute body, disclaimer | Not on .eu imprint |
| Imprint / terms / privacy effective date and version | LegalPage PendingSlots; this plan does not edit `LegalPage.tsx` (.eu terms dated 04.03.2024, privacy 13 March 2024) |
| Photography / brand / build credits | Not on .eu |
| About support languages | Not listed on .eu about |
| Payment methods | .eu lists PayPal — not copied (D-24) |
| Extra stop fee, waiting rates, city stay, oversize, case dimensions | No CHF invented |
| Airport waiting / Standard waiting | .eu says “up to 60 min depending on class”, not a single slot value |
| Noshow call attempts, refund payout days, complaint window days | Not a single extractable number |
| DPO, EU representative, archiving years, supplier regions | Not on .eu |
| Contact hours PendingSlot | .eu contact page has no hours |
| Become-a-partner | Out of scope (D-25) |

## Decisions Made

- .eu wins over TBC only when the field has a real value (D-26)
- Contact facts from D-06/D-07, never `info@vamostaxi.eu` / `vamostaxizurich@gmail.com`
- Did not expand product to a Europe marketplace because .eu says 48,350+ routes
- Did not add JSON-LD, cookie lists, PayPal, cash, hourly, or corporate invoice

## Deviations from Plan

- `faq/page.tsx` and `contact/page.tsx` needed no JSX edits (copy lives in existing i18n keys)
- Task 3 had no code change: `extract-no-invent.test.ts` was already green; did not weaken it; no empty commit
- `scripts/check-legal-language-claims.mjs` still asserts D-12 imprint `["en","de"]` and is **out of this plan’s `files_modified`**. D-27 in `legal-languages.ts` now claims four languages; a later plan must update that checker or CI `check:legal-claims` stays red
- Visual imprint `data-tok` count will drop (street/postcode/postal filled); spec not in this plan

**Total deviations:** 4 (scope/files, not extra product)
**Impact on plan:** Extract and four-language coverage landed as specified. Checker/visual follow-ups are outside 11-10 files.

## Issues Encountered

None that blocked extract. `web_extract` billed out earlier; live pages were fetched with curl (2026-09-13).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Existing legal/info routes carry extracted .eu facts without a partner route or .eu mailbox
- UID/licence/fees/hours still TBC where .eu had no value
- Update `check-legal-language-claims.mjs` Check 1 before merge if that gate is required green

---
*Phase: 11-launch-cutover*
*Completed: 2026-09-13*
