---
phase: quick-260819-uoq
plan: 01
subsystem: legal-content
tags: [adr, i18n, data-tok, subprocessor, gdpr, dictionary, arabic, documentation-fix]

requires:
  - phase: quick-260818-wxa
    provides: "reconciled §D conflicts register (C1–C26) and the two pending, unnumbered items this pass closes"
  - phase: quick-260819-mdn
    provides: "the 90/21/69 data-tok pill-label measurement and the 13-duplicate-key dictionary baseline this pass classifies"
provides:
  - ".planning/ADR-010-privacy-subprocessor-list-cloudflare.md — accepted Q21 decision, four cited mock sites, missing AeroDataBox processor row"
  - ".planning/ADR-011-data-tok-labels-stay-english.md — pill-label translation settled on provenance and mechanism, runtime enforcement recommendation"
  - ".planning/ADR-012-dictionary-duplicates-and-product-names.md — 13 duplicate keys classified, Arabic vehicle-class names decided"
  - "C27 registered in docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md §D; §D count advanced 26 → 27; both pending items closed against their ADRs"
  - ".claude/CLAUDE.md and .planning/codebase/CONVENTIONS.md — data-tok pill wording corrected to match design-system/readme.md §9 (orchestrator-widened scope)"
affects: [phase-1-design-system-port, legal-privacy-page, legal-cookies-page, i18n-runtime]

actuals:
  tokens: 11800
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "ADR provenance tracing: when two instruction files disagree, check git blame/log for which is generated-from-which before treating it as a live tie to arbitrate"
    - "Node + window-shim load of vamos-i18n-dict.js (not regex) to get exact key/duplicate counts past its escaped-apostrophe and brace-token content"

key-files:
  created:
    - .planning/ADR-010-privacy-subprocessor-list-cloudflare.md
    - .planning/ADR-011-data-tok-labels-stay-english.md
    - .planning/ADR-012-dictionary-duplicates-and-product-names.md
  modified:
    - docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md
    - .claude/CLAUDE.md
    - .planning/codebase/CONVENTIONS.md

key-decisions:
  - "ADR-010: swap Vercel for Cloudflare at all four occurrences (not the two previously recorded — both CookieBanner.dc.html per-folder duplicates were missing), add AeroDataBox as a new privacy-page processor row (needs de/fr/ar translation, unlike the bare-proper-noun swap), leave region and cookie-duration data-tok gaps open"
  - "ADR-011: data-tok pill labels stay English everywhere — the .claude/CLAUDE.md sentence contradicting this is a flattening artifact (dropped **Never:** heading from the codebase-mapper's CONVENTIONS.md output on 2026-08-17), not a second authored rule; corroborated by the CSS-generated TBC suffix being unreachable by the translation runtime and by the bound design system's own vendored _ds_bundle.js already treating [data-tok] as an automatic skip selector. Recommended fix: add [data-tok] to the three existing opt-out checks in app/vamos-locale.js"
  - "ADR-011/orchestrator scope widening: corrected the contradictory sentence directly in .claude/CLAUDE.md:371 and .planning/codebase/CONVENTIONS.md:363 (plus the adjacent garbled 'Product names vary' bullet in CONVENTIONS.md) rather than only recording the defect, since they are the root cause and were in scope for this pass by orchestrator instruction"
  - "ADR-012: of 13 duplicate dictionary keys, 6 are identical (dedupe for hygiene), 5 are conflicts where the later/live value is already correct (delete the dead earlier entry only), and 2 (Economy, Business) are conflicts where both Arabic values are wrong — disagreeing transliterations of an untranslated product name. Decided: Economy/Business/Van render as Latin script in Arabic (never-translate-product-names rule + existing .vt-dir-keep LTR-island mechanism), flagged to the owner as a visible brand consequence rather than assumed"
  - "ADR-012: found the 'First' vehicle-class dictionary entry (line 1135, not a duplicate, so invisible to the duplicate-key scan) carries a genuine Arabic translation rather than even a transliteration — routed its deletion to the existing decision-13 removal already listed in checklist §I rather than performing it"

requirements-completed: [BLOCKER-S1, BLOCKER-S5]

coverage:
  - id: D1
    description: "ADR-010 exists, records an accepted (not proposed) Q21 decision dated 2026-08-17, cites all four occurrence sites read live from the tree, states cost of being wrong in both directions, and closes with a mock-copy implications section; C27 registered in the checklist's C19–C26 row format with severity/disposition derived from its own evidence"
    requirement: BLOCKER-S1
    verification:
      - kind: other
        ref: "Task 1 automated gate: file existence, 'cost of being wrong', implications-section heading, all four cited file:line strings, C27 row, ADR pointer, all three §D count sites reading 27 and none reading 26 — all confirmed via grep"
        status: pass
      - kind: manual_procedural
        ref: "Re-read all four cited sites and the wxa-SUMMARY.md:40 citation directly from the live tree before writing; tally arithmetic (7+7+1+1+11=27) checked by hand"
        status: pass
    human_judgment: false
  - id: D2
    description: "ADR-011 and ADR-012 exist, each dated 2026-08-19, cite evidence read from the live tree (vamos-locale.js line numbers, laws.css TBC/vt-dir-keep rules, design-system/readme.md §9, vamos-i18n-dict.js keys), state cost of being wrong in both directions, and close with implications sections naming exact edits"
    requirement: BLOCKER-S1
    verification:
      - kind: other
        ref: "Task 2 automated gate: both files exist, cost-of-being-wrong + implications-section + 2026-08-19 present in both, vamos-locale.js/laws.css/readme.md cited in ADR-011, vamos-i18n-dict.js/vt-dir-keep cited in ADR-012 — all confirmed via grep"
        status: pass
      - kind: manual_procedural
        ref: "Spot-checked 5+ file:line citations directly (vamos-locale.js:55/216, laws.css:65/57, vamos-i18n-dict.js:1707/585) — all resolved to what the ADR claims"
        status: pass
    human_judgment: false
  - id: D3
    description: "Both formerly-pending §D entries closed against ADR-011 and ADR-010/C27, with the corrected 4-site Vercel count and the preserved 90/21/69 pill-label evidence; preamble no longer claims the register is fixed at a superseded total"
    requirement: BLOCKER-S5
    verification:
      - kind: other
        ref: "Task 3 automated gate: both ADR pointers present, all three §D count sites read 27, git diff --name-only limited to ADR files + checklist — all confirmed via grep/diff"
        status: pass
      - kind: manual_procedural
        ref: "Read the rewritten block start to finish — preamble rewritten, both entries name their ADR, measured evidence intact"
        status: pass
    human_judgment: false

duration: ~3min commit span (research/verification preceding the commits took considerably longer — extensive live-tree investigation, including a Node-based dictionary key-collision scan and provenance tracing across three commits)
completed: 2026-08-19
status: complete
---

# Quick Task 260819-uoq: Record Three Decided Items as ADRs Summary

**Wrote ADR-010 (Vercel → Cloudflare subprocessor fix, C27 registered), ADR-011 (data-tok pills
stay English, traced to a documentation flattening defect and corrected it), and ADR-012
(dictionary duplicate keys classified, Arabic vehicle-class names fixed to Latin script) — moving
three decisions that existed only as unread prose into the numbered decision record, with the
conflicts register advancing from 26 to 27 and both pending items closed.**

## Performance

- **Commit span:** 2026-08-19T22:24:39+04:00 to 22:27:38+04:00 (~3 min between commits; the
  investigation preceding them — re-reading every cited site live, a Node script to find the 13
  duplicate dictionary keys past the file's escaped-apostrophe content, tracing the
  `.claude/CLAUDE.md` sentence back through two commits to its `CONVENTIONS.md` source, and
  discovering the bound design system's own vendored `[data-tok]` skip logic in
  `_ds_bundle.js` — took substantially longer than the commit timestamps alone suggest)
- **Tasks:** 3/3
- **Files touched:** 6 (3 ADRs created, 3 files edited: the checklist, `.claude/CLAUDE.md`,
  `.planning/codebase/CONVENTIONS.md`)
- **Commits:** 3, one per task

## Accomplishments

- **ADR-010.** Verified all four Vercel occurrences live (`privacy.dc.html:233`,
  `cookies.dc.html:223`, and both per-folder duplicates of `CookieBanner.dc.html:105`) — two more
  than the checklist's previous pending note recorded. Confirmed zero occurrences of "Vercel" in
  `vamos-i18n-dict.js`, so the swap needs no dictionary edit; confirmed the two surrounding
  processor-description strings are already translated. Found and cited a second, previously
  unregistered defect: AeroDataBox is missing from the privacy page's processor table even though
  the page collects flight numbers (`privacy.dc.html:198`). Registered C27 in the checklist's
  established row format, advanced all three §D count sites from 26 to 27, and verified the
  tally's five buckets sum to 27.
- **ADR-011.** Traced the `.claude/CLAUDE.md:371` sentence that contradicts root `CLAUDE.md` and
  `design-system/readme.md` §9 to its exact source: it is a flattened copy of
  `.planning/codebase/CONVENTIONS.md`'s codebase-mapper output (commit `ba0e3e5`, 22:06) written
  into `.claude/CLAUDE.md` by a later same-day commit (`68574a4`, 23:41) that dropped every
  subheading from the Copy Voice section, including the `**Never:**` heading that made the
  sentence parse correctly. Corroborated the decision two further ways: the `TBC` suffix
  (`laws.css:65`) is CSS generated content the DOM-walking runtime cannot reach, so translating a
  pill's own words can only ever produce a mixed-language chip; and the bound design system's own
  vendored copy of the locale runtime, inlined in `design-system/_ds_bundle.js`, already treats
  `[data-tok]` as an automatic skip selector (`:582`, `:740`) — a third, independent source
  pointing the same direction, superseded at runtime only because `app/vamos-locale.js` loads
  after it and reassigns `window.VamosLocale`. Measured 90 distinct pill labels (114 raw
  occurrences), 21 keyed / 69 unkeyed — reproduced the plan's cited figures exactly via an
  independent Node-based extraction. Found one confirmed dual-use dictionary key
  (`Registered firm name`, pill at `terms.dc.html:185`, ordinary bilingual copy at
  `imprint.dc.html:188`) as the concrete reason the 21 existing keys are not deleted wholesale.
- **ADR-012.** Loaded the dictionary through Node with a `window` shim to get an exact count past
  its escaped-apostrophe and brace-token content: 1440 literal key lines, 1427 distinct keys, 13
  duplicates. Classified all 13: 6 identical (dedupe only), 5 conflicts where the later/live value
  is already correct (delete the dead earlier entry, matching the plan's five stated reasons
  exactly — closed German compound, imperative button label, French legal register, idiomatic
  overflow phrasing, no-definite-article label form), and 2 conflicts (`Economy`, `Business`)
  where both Arabic values are disagreeing transliterations of an untranslated product name.
  Found `Van`'s two copies agree with each other (`ar: 'فان'` both times) — identical, so invisible
  to a same-value duplicate check, but carrying the identical underlying defect. Decided all three
  vehicle-class names render as Latin script in Arabic, using the existing `.vt-dir-keep`
  LTR-island mechanism (`laws.css:57`) already used for flight numbers and CHF figures, and
  flagged the visible consequence to the owner rather than assuming it away. Found the `'First'`
  entry (line 1135, not a duplicate) carries a genuine Arabic *translation* — routed its deletion
  to the existing decision-13 removal already listed in checklist §I.
- **Scope widening applied.** Per the orchestrator's instruction, corrected the contradictory
  sentence directly in `.claude/CLAUDE.md:371` and `.planning/codebase/CONVENTIONS.md:363` (plus
  the adjacent garbled "Product names vary" bullet in `CONVENTIONS.md`, repaired without changing
  which items it names), each with a one-line pointer to ADR-011, rather than only recording the
  defect as the plan's original task action specified.
- **Task 3.** Rewrote the pending block beneath the §D tally: both items closed against their
  ADRs, the Vercel entry's occurrence count corrected from two to four, the 90/21/69 pill-label
  evidence preserved in place, and the preamble rewritten so it no longer claims the register is
  fixed at a total (26) it has since passed.

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ADR-010 — Vercel misdisclosure, registered as C27 | `18c9d79` | `.planning/ADR-010-privacy-subprocessor-list-cloudflare.md`, `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` |
| 2 | ADR-011 and ADR-012 — pill-label rule and dictionary findings | `1872633` | `.planning/ADR-011-data-tok-labels-stay-english.md`, `.planning/ADR-012-dictionary-duplicates-and-product-names.md`, `.claude/CLAUDE.md`, `.planning/codebase/CONVENTIONS.md` |
| 3 | Close the two pending entries against their ADRs | `c23a5a0` | `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` |

## Deviations from Plan

### Auto-fixed / scope-adjusted

**1. [Orchestrator scope widening] Corrected `.claude/CLAUDE.md:371` and
`.planning/codebase/CONVENTIONS.md:359–363` directly instead of only recording the defect**
- **Found during:** Task 2, while writing ADR-011's provenance tracing
- **Issue:** The plan's Task 2 action text said "neither is applied in this pass, because those
  files are outside its scope." The orchestrator's prompt widened that scope explicitly for these
  two lines, since they are the root cause ADR-011 exists to eliminate.
- **Fix:** Corrected the `data-tok` pill sentence in both files to read "deliberately not
  translated," matching `design-system/readme.md:659–661`; repaired the sibling "Product names
  vary" bullet in `CONVENTIONS.md` so the `**Never:**` list parses without the heading dependency
  it previously required; added a one-line pointer to ADR-011 in each spot.
- **Files modified:** `.claude/CLAUDE.md`, `.planning/codebase/CONVENTIONS.md`
- **Commit:** `1872633`

**2. [Rule 2 — evidence gap honestly reported] Named one confirmed dual-use dictionary key, not
two, for ADR-011's "several strings also occur as ordinary copy" claim**
- **Found during:** Task 2, verifying the plan's must-have that "several" of the 21 keyed pill
  labels also serve ordinary non-pill copy
- **Issue:** An exhaustive live-tree search (every one of the 21 keys, checked against every
  `.dc.html` file for a non-`data-tok` occurrence) found exactly one confirmed case:
  `Registered firm name` (pill at `terms.dc.html:185`, ordinary bilingual-toggle copy at
  `imprint.dc.html:188`). No second clean example was found despite broadening the search to ops
  screens, JS fixtures, and translatable-attribute contexts.
- **Fix:** ADR-011 states the one confirmed example precisely, with both citations, and phrases
  the non-deletion consequence around that one proven collision risk rather than asserting a
  second unverified example — consistent with "never invent a value."
- **Files modified:** `.planning/ADR-011-data-tok-labels-stay-english.md`
- **Commit:** `1872633`

No other deviations. All three ADRs, the checklist edit, and the two documentation corrections
were written and verified exactly as the (scope-widened) plan specified.

## Threat Flags

None found beyond what the plan's own threat model already covers. No new network endpoints,
auth paths, file access patterns, or schema changes were introduced — this pass is documentation
and legal-copy-decision records only.

## Known Stubs

None. This is a documentation-only pass with no rendered UI or data flow; nothing here is a
placeholder standing in for missing functionality.

## Self-Check: PASSED

- `.planning/ADR-010-privacy-subprocessor-list-cloudflare.md` — FOUND
- `.planning/ADR-011-data-tok-labels-stay-english.md` — FOUND
- `.planning/ADR-012-dictionary-duplicates-and-product-names.md` — FOUND
- Commit `18c9d79` — FOUND in `git log --oneline --all`
- Commit `1872633` — FOUND in `git log --oneline --all`
- Commit `c23a5a0` — FOUND in `git log --oneline --all`
- `git status --porcelain -- app/ design-system/ assets/` — empty (confirmed)
- `git diff --name-only` across all three commits — limited to the three ADR files, the checklist,
  `.claude/CLAUDE.md` and `.planning/codebase/CONVENTIONS.md` (confirmed, matches the hard file
  boundary exactly)
