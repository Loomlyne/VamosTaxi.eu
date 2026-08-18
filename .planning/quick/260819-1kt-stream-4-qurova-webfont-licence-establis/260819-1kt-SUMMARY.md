---
phase: quick-260819-1kt
plan: 01
subsystem: legal-content
tags: [licensing, fonts, ofl, i18n, gdpr, design-system]

requires:
  - phase: quick-260818-wxa
    provides: reconciled §D conflicts register (C1–C24) and OWNER-ANSWERS.md cross-references
provides:
  - "design-system/assets/fonts/OFL.txt — the verbatim SIL OFL 1.1 text with a scope header limiting it to Poppins"
  - ".planning/ADR-009-qurova-webfont-licence.md — costed, sourced Qurova licence decision record"
  - "docs/build/Owner Typeface Review.dc.html — rendered Qurova-vs-fallback comparison for the owner"
  - "C25 registered in docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md §D — Arabic fallback CDN hotlink"
  - "OPEN-QUESTIONS.md Q4 answer updated with corrected premise, price, cap and both foundry questions"
affects: [phase-1-design-system-port, ops-content-screen, legal-privacy-page]

actuals:
  tokens: 16174
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Licence text vendored verbatim via curl, never recited from memory, with a scope header separating it from the body's own licence conditions"
    - "Rendered side-by-side comparison page (.dc.html, static markup, no logic class) for a brand decision that is the owner's call, not engineering's"

key-files:
  created:
    - design-system/assets/fonts/OFL.txt
    - .planning/ADR-009-qurova-webfont-licence.md
    - "docs/build/Owner Typeface Review.dc.html"
  modified:
    - docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md
    - docs/build/OPEN-QUESTIONS.md

key-decisions:
  - "Recommend the $69 Prioritype Web Font licence for Qurova; the binding risk is the 100,000 monthly pageview cap and unstated licence duration, not the price — both are written questions for the foundry, not assumptions"
  - "Verified Outfit and Manrope's OFL 1.1 licence via the google/fonts GitHub source repository (ofl/outfit/OFL.txt, ofl/manrope/OFL.txt) because fonts.google.com/specimen/*/license renders client-side and returned no static licence text over curl — both sources cited on the review page with the date verified"
  - "C25 (Arabic fallback hotlinks a third-party font CDN before consent) is registered as a data-protection finding distinct from the Qurova licensing question, with its remedy recorded and explicitly not performed in this pass"

requirements-completed: [BLOCKER-S4]

coverage:
  - id: D1
    description: "design-system/assets/fonts/OFL.txt exists, holds the verbatim fetched OFL 1.1 body with the Poppins font files' own copyright line, and carries a scope header excluding Qurova"
    requirement: BLOCKER-S4
    verification:
      - kind: other
        ref: "Task 1 automated gate: file existence, byte length, canonical section markers, exact copyright line, Qurova/ADR-009 references in scope header — all confirmed via grep"
        status: pass
    human_judgment: false
  - id: D2
    description: ".planning/ADR-009-qurova-webfont-licence.md records Qurova's provenance, corrects the false premise, reproduces the vendor price list and terms with URLs, and states the Arabic display gap and C25 without solving them"
    requirement: BLOCKER-S4
    verification:
      - kind: other
        ref: "Task 1 automated gate: Context/Decision/Consequences headings, Status/Phase lines, both vendor URLs, $69/$3500 figures, 100,000 cap, 'duration is not stated', 'cost of being wrong', Arabic mention, review-page pointer — all confirmed via grep"
        status: pass
    human_judgment: false
  - id: D3
    description: "docs/build/Owner Typeface Review.dc.html renders the real Vamos hero headlines (EN/DE/FR), tagline, figure and label settings in Qurova and three verified candidates, states it never ships, explains the Arabic omission, and closes with a recommendation and per-candidate cost"
    requirement: BLOCKER-S4
    verification:
      - kind: other
        ref: "Task 2 automated gate: law tokens, exact mock strings (headlines, tagline, CHF 000, VT-4821), ADR-009/C25 references, fonts.googleapis.com, minmax()/clamp(), 2+ 'Open Font License' mentions, zero banned-yellow tokens, zero fixed pixel widths, zero coloured box-shadows — all confirmed via grep"
        status: pass
      - kind: manual_procedural
        ref: "Static-server resource resolution check (200 OK for the page, support.js, _ds_bundle.js, laws.css) — confirmed; full visual check at 1440/1024/768/390px was not possible in this environment (no headless browser available), so the responsive claims rest on the same clamp()/auto-fit minmax() patterns used elsewhere in this codebase rather than a rendered screenshot"
        status: unknown
    human_judgment: true
    rationale: "Visual/responsive rendering at the four breakpoints could not be automated in this environment (no Chrome/Playwright/Puppeteer available); the owner or a follow-up pass with browser tooling should confirm the page renders correctly before relying on it for the purchase decision"
  - id: D4
    description: "C25 registered in LEGAL-PLACEHOLDER-CHECKLIST.md §D with exact call site, missing subprocessor, data-protection classification, recorded-not-performed remedy, and OPEN disposition; all three count sites (header, §D heading, closing tally) reconciled to 25/10 open/C19–C25 with no stale figures"
    requirement: BLOCKER-S4
    verification:
      - kind: other
        ref: "Task 3 automated gate: C25 row, call-site line numbers, fonts.googleapis.com, ADR-009 pointer, §D heading, header/tally counts present, zero stale '24 documented conflicts'/'9 open'/'C19–C24' occurrences — all confirmed via grep"
        status: pass
    human_judgment: false
  - id: D5
    description: "OPEN-QUESTIONS.md Q4's answer replaced with the corrected premise, provenance, price, cap, two foundry questions, both pointers, and the two newly surfaced Arabic items — question body left untouched"
    requirement: BLOCKER-S4
    verification:
      - kind: other
        ref: "Task 3 automated gate: Q4 heading, ADR-009/review-page pointers, 100,000 cap, $69, prioritypeco.com URL — all confirmed via grep"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-08-19
status: complete
---

# Quick Task 260819-1kt: Stream 4 — Qurova Webfont Licence Established Summary

**Vendored the missing SIL OFL text, wrote ADR-009 recommending the $69 Prioritype Web Font
licence, built a rendered Qurova-vs-open-licence comparison page, and registered the Arabic
CDN-hotlink privacy finding (C25) — closing Stream 4 of `BLOCKER-SOLVE-PLAN.md`.**

## Performance

- **Duration:** ~25 min (commits span 2026-08-19T01:22:45+04:00 to 01:30:05+04:00; total
  includes network fetch/verification of licence text and Google Fonts sources before/after)
- **Started:** 2026-08-18T21:31:31Z
- **Completed:** 2026-08-18T21:30:05Z (last task commit, +04:00 local)
- **Tasks:** 3/3
- **Files modified:** 5 (3 created, 2 edited)

## Accomplishments

- Fetched the real SIL Open Font License 1.1 verbatim over HTTPS (`curl` against
  `openfontlicense.org`, the plan's primary source) and vendored it to
  `design-system/assets/fonts/OFL.txt` with only the copyright line set to match Poppins'
  own font-file name table, under a scope header stating Qurova is not covered.
- Wrote `.planning/ADR-009-qurova-webfont-licence.md`: Qurova's provenance from the font
  files' own name tables, the corrected premise (no licence file existed for either family
  before this pass), the full nine-tier Prioritype price list with source URLs, a
  recommendation to buy the $69 Web Font tier, the 100,000-monthly-pageview cap and unstated
  licence duration as the two written questions for the foundry, the Arabic display-face gap,
  and the C25 finding — all without inventing a single figure.
- Built `docs/build/Owner Typeface Review.dc.html`: a static, law-compliant review page
  rendering the real Vamos hero headlines (English, German, French), the "Choose your class"
  card title, the CHF/time/reference/distance figure voice, and uppercase button labels in
  Qurova plus three candidates (Poppins, Outfit, Manrope) at the mocks' real display-2 /
  heading-4 / figure / label token settings, each candidate's licence verified and cited.
- Registered conflict C25 in `LEGAL-PLACEHOLDER-CHECKLIST.md` §D (Arabic fallback hotlinks
  `fonts.googleapis.com` before consent, undisclosed subprocessor) and reconciled all three
  count sites in the file (header sentence, §D heading, closing tally) to 25 documented
  conflicts / 10 open / `C19–C25`, with the header sentence rewrapped so the count and
  "documented conflicts" sit on one line.
- Replaced `OPEN-QUESTIONS.md` Q4's answer with the corrected premise, Qurova's provenance,
  the priced recommendation, the two foundry questions, pointers to ADR-009 and the review
  page, and the two Arabic findings the original question never asked about — question body
  left untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Vendor the missing licence text and write the decision record** - `aa7e428` (feat)
2. **Task 2: Build the rendered fallback comparison the owner can decide from** - `1001bb0` (feat)
3. **Task 3: Register C25 and bring Q4's answer up to what is now known** - `b1c1cc9` (docs)

_SUMMARY.md, STATE.md and PLAN.md are committed by the orchestrator, not this executor._

## Files Created/Modified

- `design-system/assets/fonts/OFL.txt` - Verbatim SIL OFL 1.1 text, Poppins copyright line, scope header excluding Qurova
- `.planning/ADR-009-qurova-webfont-licence.md` - Costed, sourced Qurova licence decision record
- `docs/build/Owner Typeface Review.dc.html` - Rendered Qurova-vs-fallback owner comparison page
- `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` - C25 registered; header/§D heading/closing tally reconciled to 25/10 open/C19–C25
- `docs/build/OPEN-QUESTIONS.md` - Q4 answer replaced with current, sourced facts

## Decisions Made

- Used `openfontlicense.org/documents/OFL.txt` as the primary licence source (per the plan's
  first choice) rather than the fallback `raw.githubusercontent.com/itfoundry/Poppins` copy,
  because the fallback's own copyright line was stale (2014–2019 Indian Type Foundry) and did
  not match the Poppins font files' own name table (2020 Poppins Project Authors) — using the
  primary's clean placeholder template avoided overwriting a wrong existing line.
- Verified Outfit's and Manrope's OFL 1.1 status via the `google/fonts` GitHub source
  repository (`ofl/outfit/OFL.txt`, `ofl/manrope/OFL.txt`) rather than solely the
  `fonts.google.com/specimen/*/license` page named in the plan, because that page is a
  client-rendered SPA that returns no static licence text to `curl`. Both the specimen page
  URL and the GitHub source are cited on the review page, same verification date, so the
  reviewer can check either.
- Kept the "uppercase button label" specimen row set in each candidate's *display* font
  rather than skipping it, with an explicit caption noting production actually sets button
  labels in the UI font (Poppins) regardless of the display choice — included because if
  Poppins is chosen, display and UI collapse into one voice and the row becomes directly
  relevant, and because it exercises German's ~30% growth at the label setting either way.

## Deviations from Plan

None — plan executed exactly as written. All three automated verification gates pass as
specified.

## Known Stubs

None. All three deliverables are complete, sourced content — no placeholder data, no
`data-tok` gaps introduced (the page's only amount is the existing project-wide `CHF 000.00`
placeholder form, not a new stub).

## Threat Flags

None beyond what the plan's own `<threat_model>` already anticipated and gated (T-1kt-01
through T-1kt-07), all of which the task verification gates cover.

## Issues Encountered

- `fonts.google.com/specimen/<Name>/license` renders client-side and returned no licence text
  over `curl` (194 KB of JS-app shell, no embedded JSON). Resolved by cross-verifying against
  the `google/fonts` GitHub repository's own `OFL.txt` files for Outfit and Manrope — same
  publisher, machine-readable, and organized by licence-type folder (`ofl/`), which is
  arguably more authoritative than scraping rendered HTML. Documented both sources on the
  review page per T-1kt-06's verification requirement.
- No headless browser (Chrome, Playwright, Puppeteer) is available in this environment, so the
  review page's responsive behaviour at 1440/1024/768/390px could not be visually confirmed —
  only that all its dependencies (design-system tokens, `_ds_bundle.js`, `support.js`) resolve
  correctly over a static server. Flagged in `coverage.D3` as needing a human/browser check
  before the owner relies on the page.

## Next Phase Readiness

- Stream 4 is closed: Qurova's licence question is now a costed, sourced recommendation
  (buy the $69 Web Font tier) with two named open questions for the foundry, a real licence
  file exists where the stylesheet has always pointed, and the owner has a rendered comparison
  to decide from if the purchase does not happen.
- **Gate carried forward:** Phase 1's font-copy step (copying `Qurova-*.ttf` into
  `apps/web/public/brand/`) must not run until ADR-009's status changes from Proposed — either
  the licence is bought or the owner picks the rendered fallback.
- **New open item, not blocking:** C25 (Arabic CDN hotlink) is registered OPEN with its remedy
  recorded but not performed; it belongs in the same reviewable pass as the other mock edits
  tracked in the checklist's §I, whenever that pass happens.
- **New open item, not blocking:** an Arabic display face is a separate open item — no
  vendored family (Qurova or Poppins) contains Arabic glyphs — recorded in ADR-009 but not
  assigned to any phase yet.

## Self-Check: PASSED

All created/modified files confirmed present on disk; all three task commit hashes (`aa7e428`,
`1001bb0`, `b1c1cc9`) confirmed present in `git log`.

---
*Phase: quick-260819-1kt*
*Completed: 2026-08-19*
