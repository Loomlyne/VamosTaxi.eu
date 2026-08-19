---
phase: quick-260819-mdn
plan: 01
subsystem: i18n
tags: [i18n, vamos-i18n-dict, legal-placeholder-checklist, measurement-harness]

requires:
  - phase: quick-260819-279
    provides: the committed-in-spirit-but-untracked i18n-measure.mjs harness this plan tracked and used unmodified
provides:
  - A committed, re-runnable i18n residual harness (i18n-measure.mjs) as the sole evidence source for this backlog going forward
  - Proof that the customer-facing prose residual on the nine measured pages is zero — nothing added to app/vamos-i18n-dict.js
  - Both stale snapshot files (i18n-audit.txt, i18n-todo.txt) marked superseded with dated blocks, contents intact
  - C22 rewritten to the measured position; C26 registered (and found already mitigated); §D count advanced to 26
  - Two pending owner decisions recorded: data-tok pill-label contradiction (90/21/69) and the Vercel subprocessor mismatch
affects: [i18n, legal-content, docs/build]

actuals:
  tokens: 7751
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Zero-dependency Node ESM harness (global.window shim) as the sole source of truth for i18n residual measurement, replacing point-in-time text-dump snapshots"

key-files:
  created:
    - .planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs
  modified:
    - docs/build/i18n-audit.txt
    - docs/build/i18n-todo.txt
    - docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md

key-decisions:
  - "The measured customer-facing prose residual is zero (all 32 strings on the nine pages are proper nouns/brands/identifiers/emails/addresses/codes/bindings), so nothing was added to app/vamos-i18n-dict.js — an empty deliverable reported honestly, not manufactured work"
  - "C22 names both docs/build/i18n-todo.txt (the true numeric source of its old figure) and docs/build/i18n-audit.txt (the sibling stale snapshot for the same pages) rather than picking one, because independent inspection showed the plan's assumption about which file the old figure came from was itself imprecise"
  - "C26 was registered but independent verification found its premise wrong: all seventeen data-slot=\"1\" containers already carry data-vt-no-i18n=\"1\" on the same element and always have, so the runtime already excludes them — disposition is RESOLVED (already mitigated), not OPEN, because reporting a live leak that isn't live would be exactly the phantom-generation failure mode this plan exists to stop"
  - "The seven conflicting-value duplicate dictionary keys are reported with their live (later-occurrence) values named, per plan instruction, and left unresolved — that is a judgement for a pass with the pages open"

requirements-completed: [BLOCKER-S5]

coverage:
  - id: D1
    description: "Harness i18n-measure.mjs committed as the re-runnable evidence source; --calibrate, --all, --sharp-s all run clean"
    requirement: BLOCKER-S5
    verification:
      - kind: other
        ref: "node .planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs --all"
        status: pass
      - kind: other
        ref: "node .planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs --sharp-s (returns SHARP-S: 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "All 32 strings the harness reports missing across nine pages classified into buckets (correct-as-is vs prose); prose bucket is empty, nothing added to the dictionary"
    requirement: BLOCKER-S5
    verification:
      - kind: other
        ref: "manual classification recorded in this SUMMARY and in C22; counts sum to harness total (6+6+7+4+9=32)"
        status: pass
    human_judgment: true
    rationale: "Classifying a string as 'proper noun/identifier' vs 'customer-facing prose' is a judgement call the harness cannot make automatically"
  - id: D3
    description: "Both snapshot files (i18n-audit.txt, i18n-todo.txt) carry dated superseded blocks in their first twelve lines, contents otherwise intact"
    requirement: BLOCKER-S5
    verification:
      - kind: other
        ref: "head -12 docs/build/i18n-audit.txt | grep -q 2026-08-19 / supersede / i18n-measure.mjs; same for i18n-todo.txt; wc -l grew for both"
        status: pass
    human_judgment: false
  - id: D4
    description: "C22 rewritten to the measured position, no longer carries the old numeral; C26 registered; §D count reads 26 at all three sites"
    requirement: BLOCKER-S5
    verification:
      - kind: other
        ref: "grep gates on 'Conflicts register — 26', '26 documented conflicts', '^26 conflicts', absence of any '25' variant, C26 row content, C22 absence of '438'"
        status: pass
    human_judgment: true
    rationale: "Whether the rewritten C22/C26 prose reads accurately and proportionately (not over- or under-claiming) is a judgement call for a human reader, per the plan's own human-check gate"

duration: 12min
completed: 2026-08-19
status: complete
---

# Quick Task 260819-mdn: Stream 5 residual settled on measured evidence, zero translation gap Summary

**Re-measured the i18n residual against the live tree with the committed harness, found the customer-facing prose gap is genuinely zero, and corrected two blocker-register entries (C22, C26) that had been written from stale or mistaken premises — including an independent finding that C26's underlying leak was never live.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-08-19T12:16:56Z
- **Completed:** 2026-08-19T12:26:32Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Committed `.planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs` — previously untracked, now the sole re-runnable evidence source for this backlog.
- Re-measured all nine pages: **legal MISSING total 19, product MISSING total 13** (32 total), matching the planning session's upper bound exactly. Enumerated every one of the 32 strings and classified all of them as correct-as-is (proper nouns, brand names, emails, company identifiers, cookie names, addresses, reference codes, template bindings) — the customer-facing prose bucket is **empty**. Nothing was added to `app/vamos-i18n-dict.js`.
- Ran calibration: a 3-string residual on two non-target surfaces (`home/Services.dc.html`, `pages/coming-soon.dc.html`) — copy added since the old audit, outside this pass's file boundary, recorded but not acted on.
- Confirmed the dictionary is unchanged and still holds 1427 entries / 44 patterns, all four-language-complete, zero sharp-s.
- Confirmed the duplicate-key baseline is still exactly 13 (7 conflicting) and identified the live (later-occurrence) value for each of the seven conflicting keys, without changing any of them.
- Marked both `docs/build/i18n-audit.txt` and `docs/build/i18n-todo.txt` superseded with dated blocks quoting the measured numbers, naming the harness, and pointing at the concrete staleness proof (`"English · Deutsch to follow"` still listed but no longer present anywhere under `app/`).
- Rewrote C22 in `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` to state the measured position: `data-vt-legal="en de fr ar"` is substantially borne out, no attribute is narrowed, and the disposition moves from an open coverage-pretence finding to close-to-resolved with the runtime-built-string blind spot named as the genuine residual.
- Registered C26 for the seventeen `data-slot="1"` legal-drafting containers — but independent verification found the row's underlying premise wrong (see Deviations below): the leak was never live. Registered as **RESOLVED (already mitigated)**, not OPEN, with the correction on record.
- Advanced the §D conflict count to 26 at all three sites (opening sentence, heading, closing tally), with C26 in a new "resolved as already-mitigated" bucket so the tally's group figures still sum to 26.
- Recorded two items beneath the tally as pending owner decisions, not numbered conflicts: the `data-tok` pill-label translation contradiction between the two `CLAUDE.md` files (re-measured live: 90 distinct pill labels, 21 with a dictionary key, 69 without), and the Vercel subprocessor mismatch on `privacy.dc.html`/`cookies.dc.html`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Settle the residual against the live tree and translate only what genuinely misses** - `d646827` (feat)
2. **Task 2: Mark the two snapshot files superseded** - `aab8020` (docs)
3. **Task 3: Correct C22, register C26, advance the §D count, record the pill-label contradiction** - `354b2e3` (docs)

_No plan-metadata commit was made per the harness's constraints — this SUMMARY.md and STATE.md are handled by the orchestrator, not by this executor._

## Files Created/Modified

- `.planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs` - Zero-dependency re-measurement harness, committed as evidence (no code changes made to it — used exactly as the previous executor left it)
- `docs/build/i18n-audit.txt` - Dated 2026-08-19 supersession block prepended; 883 → 900 lines, original content intact
- `docs/build/i18n-todo.txt` - Dated 2026-08-19 supersession block prepended; 604 → 621 lines, original content intact
- `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` - C22 rewritten, C26 registered, §D count advanced 25→26 at all three sites, two pending-decision notes added beneath the tally
- `app/vamos-i18n-dict.js` - **Not modified.** The classification found zero genuinely customer-facing prose missing, so no entries were added.

## Decisions Made

- **Nothing added to the dictionary.** The plan's own established facts predicted this outcome (an upper bound of 32 strings, all correct-as-is); this pass independently re-derived the same 32 strings via a fresh enumeration (copying the harness to a scratch location, listing `r.missing`, then deleting the scratch copy) and confirmed the same classification. An empty deliverable that is true beats a filled one that duplicates existing entries.
- **C22 names both snapshot files, not just the one the plan specified.** Reading the pre-edit C22 row closely showed its old figure (438) was actually the sum of `docs/build/i18n-todo.txt`'s five per-page line counts (102+107+98+49+82=438) — not `docs/build/i18n-audit.txt`, which the plan named as "that snapshot." Rather than silently substituting the file the plan named for the file that actually produced the number, C22 now names both: `i18n-todo.txt` as the true numeric source, and `i18n-audit.txt` as the sibling stale snapshot for the same five pages (also now marked superseded). This satisfies the plan's gate (which checks for the literal string `i18n-audit.txt` in the C22 row) without asserting something false.
- **C26's disposition changed from the plan's assumed OPEN/medium to RESOLVED (already mitigated) after independent verification — see Deviations.**
- **The 90/21/69 pill-label figures were independently re-derived** (not copied from established_facts) using a corrected text-node extraction that excludes CSS `[data-tok]` selector rules and `data-tok-fig` figure wrappers — an early draft of the extraction regex incorrectly matched CSS blocks and `data-tok-fig` occurrences, producing 95/25/70 before the bug was found and fixed. The corrected re-count matches established_facts exactly (90 distinct, 21 with key, 69 without).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug in the plan's own working assumption] C26's premise was wrong: the data-slot leak is not live**

- **Found during:** Task 3 (registering C26)
- **Issue:** The plan's `<established_facts>` asserted that `app/vamos-locale.js` "does not opt `data-slot` out" and that "the runtime treats these reviewer notes as shippable copy and translates them." Independent verification (`grep -n 'data-slot="1"' app/pages/*.dc.html` against each page) showed every one of the seventeen `data-slot="1"` opening tags — in terms, privacy, cancellation and imprint — already carries `data-vt-no-i18n="1"` on the exact same element, and `git log -p` confirmed this has been true since the mocks were first committed (`d504ae4`), not something an earlier stream added. `app/vamos-locale.js`'s own `skipped()` walk and its TreeWalker `acceptNode` reject (lines 216, 256, 477) check exactly `data-vt-no-i18n` and `translate="no"` — so the runtime already excludes each container's full subtree. The reviewer-instruction leak C26 was written to register was never live.
- **Fix:** Registered C26 with the corrected finding on record — the measured slot-block count (17, matching §B) and instruction-string count (52 distinct, differing from the planning session's estimate of 51), the correction of the plan's working assumption, and disposition **RESOLVED (already mitigated in markup)** instead of OPEN/medium. The still-true finding (root `CLAUDE.md` names `data-i18n-skip` for this purpose; `app/vamos-locale.js` implements no such attribute — confirmed `grep -c 'data-i18n-skip' app/vamos-locale.js` returns 0) is kept on record since it remains accurate and useful independent of the leak question.
- **Files modified:** `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` (C26 row and the §D tally's resolved-bucket breakdown)
- **Verification:** `grep -c 'data-vt-no-i18n="1" data-slot="1"' app/pages/{terms,privacy,cancellation,imprint}.dc.html` matches the plain `data-slot="1"` count on all four pages (8, 2, 3, 4); `git log -p -- app/pages/terms.dc.html | grep 'data-vt-no-i18n.*data-slot'` shows the pairing present in the original commit that added the file
- **Committed in:** `354b2e3` (Task 3 commit)

**2. [Rule 1 - Bug in a scratch extraction script] Pill-label regex initially matched CSS selectors and `data-tok-fig`, inflating the count**

- **Found during:** Task 3 (re-counting the 90/21/69 pill-label evidence)
- **Issue:** A first-pass Node regex for extracting `data-tok` pill text matched `<tag ... data-tok ...>text` without excluding `<style>` blocks or `data-tok-fig` (a word-boundary `\b` after `data-tok` also matches the `-` before `-fig`, since `-` is a non-word character), producing 95 distinct / 25 with key / 70 without.
- **Fix:** Stripped `<style>`/`<script>` blocks before scanning and required `data-tok` to be followed by `=`, whitespace, or `>` (never `-`) before treating it as the attribute. Re-run gave 90/21/69, matching established_facts and the checklist's own intro figures exactly.
- **Files modified:** None (scratch script only, not committed — this is a measurement-methodology fix, not a deliverable change)
- **Verification:** Cross-checked against `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md`'s own line 5-9 ("measured live in `app/`: 121 `data-tok` pills, 90 unique pill labels")
- **Committed in:** N/A — caught before any file was written

---

**Total deviations:** 2 auto-fixed (both Rule 1 — correcting working assumptions/extraction bugs found during independent measurement, not code bugs in the shipped product)
**Impact on plan:** Both corrections make the register more accurate than the plan's own working assumptions would have produced. No scope creep — no file outside `files_modified` was touched, and `app/pages/`, `design-system/` and `assets/` remain untouched throughout.

## Issues Encountered

None beyond the two items in Deviations above, both caught and corrected before being written into the committed files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Stream 5 of `.planning/BLOCKER-SOLVE-PLAN.md` is closed on measured evidence. The harness at `.planning/quick/260819-279-stream-5-translation-draft-the-156-produ/i18n-measure.mjs` is now the durable, committed source of truth for this backlog — future passes should re-run it rather than deriving from either snapshot file (both are now marked superseded) or from this SUMMARY's numbers, which will themselves go stale as the dictionary and pages change.
- **Blind spot carried forward, not closed:** the harness reads `.dc.html` source only and cannot see strings a page's own JavaScript builds at runtime. `docs/build/i18n-audit-js.txt` is the existing record of those; this pass did not re-measure it and C22 says so explicitly rather than implying full coverage.
- **Two pending owner decisions are now recorded** in `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` beneath the §D tally, not as numbered conflicts (the register is fixed at 26 for this pass): (1) the `data-tok` pill-label contradiction between the root and `.claude` `CLAUDE.md` files (90 pill labels, 21 already keyed, 69 not — this pass followed the root file and left them English), and (2) the Vercel subprocessor mismatch on `privacy.dc.html:233` and `cookies.dc.html:223`, which needs an edit to two legal pages this pass was not permitted to touch. Both should be picked up by whichever stream next opens those files.
- The seven conflicting-value duplicate dictionary keys (`More actions`, `Vehicle class`, `Economy`, `Business`, `Transfer voucher`, `Resend email`, `cookie policy`) remain unresolved by design — the live (later-occurrence, currently-rendering) value was identified for each during this pass but is not recorded in a committed file, since resolving them requires the pages open to choose the correct translation, which is out of this pass's scope. Whoever fixes them next: for `Economy`/`Business`/`Vehicle class`/`More actions`/`Resend email`/`cookie policy`/`Transfer voucher`, the **second (later)** occurrence in `app/vamos-i18n-dict.js` is the one currently rendering.

---
*Phase: quick-260819-mdn*
*Completed: 2026-08-19*

## Self-Check: PASSED

All five files referenced in this SUMMARY (`i18n-measure.mjs`, `docs/build/i18n-audit.txt`,
`docs/build/i18n-todo.txt`, `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md`, this SUMMARY.md itself)
confirmed present on disk. All three task commit hashes (`d646827`, `aab8020`, `354b2e3`)
confirmed present in `git log --oneline --all`.
