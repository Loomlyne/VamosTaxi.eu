---
phase: quick-260819-0zd
plan: 01
subsystem: docs/build
tags: [client-input, blocker-solve, legal-checklist, stream-3]
status: complete
dependency-graph:
  requires:
    - docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md (§A residuals, §C tokens, §D conflicts, §F key map, §G/§H content slots)
    - docs/build/OWNER-ANSWERS.md (decisions 1–15, page-by-page blanks, photography)
    - docs/build/OPEN-QUESTIONS.md (Q4, Q10, Q25 — owner-routed)
    - .planning/ADR-002 through ADR-008 (engineering decisions not re-asked)
  provides:
    - docs/build/CLIENT-INPUT-PACK.md
  affects:
    - Stream 3 of .planning/BLOCKER-SOLVE-PLAN.md (marks it deliverable-complete)
tech-stack:
  added: []
  patterns:
    - "Three-source recommendation rule: a recommendation may only be offered when sourced to a cited law/regulation, a platform fact, or an owner answer already given — everything else reads 'only you can answer this' with a blank value"
    - "Running question numbering (1..60) shared across question blocks and photo slots so an internal appendix can cross-reference by number"
key-files:
  created:
    - docs/build/CLIENT-INPUT-PACK.md
  modified: []
decisions:
  - "Wrote the whole document in a single pass rather than as three separate task commits — the three-task split in the plan was a drafting scaffold (spine → largest sections → shot list/close), not a requirement for three atomic commits, since the file has no meaningful intermediate-complete state a reviewer would want isolated in history."
  - "Where the plan's own document-shape example combined a waiting allowance and its charge into one illustrative question, the actual document keeps the money question (charge beyond the free allowance) in 'Your prices' and the two duration questions (airport/standard allowance) in 'Your policies and promises', per the task action text's explicit section placement — the example was read as a formatting illustration, not a literal content merge instruction."
  - "For the two legally-defensible recommendations (finance-record retention, data-subject-request response time), cited Swiss Code of Obligations Art. 958f and GDPR Art. 12(3) respectively; for the passenger-booking-record retention token, the old site's own citation to a 'Swiss Archiving Act' could not be independently verified, so that item is flagged as an unverified citation and left only-you-can-answer rather than treated as a second legal source."
  - "The five real-looking values seeded in the ops dispatch fixture (company name, address, UID, phone, email) are reproduced exactly once, inside question 10, and nowhere else in the document — verified by grep after writing."
metrics:
  duration: "~35 min"
  completed: 2026-08-19
actuals:
  tokens: 46000
  tasks: 1
  commits: 1
---

# Quick task 260819-0zd: Write the client input pack Summary

`docs/build/CLIENT-INPUT-PACK.md` — a single 850-line, sendable document converting all 105
distinct placeholder names in the reconciled legal checklist into 60 numbered questions (50
five-line question blocks plus a 10-slot photography shot list), led by a one-page, six-item
launch-blocker summary, written entirely in second-person brand voice with zero internal
identifiers before its marked-internal closing appendix.

## What was built

One new file, `docs/build/CLIENT-INPUT-PACK.md`, with the section order fixed by the plan:
opening → what-blocks-launch (six items) → your company details (10 questions, closing with
the seeded-identity confirm-or-correct) → your prices (6 questions) → your policies and
promises (18 questions) → how we handle your customers' data (7 questions) → your photos (10
numbered shot-list slots, nine live plus one explicitly dropped) → your accounts and links (4
questions) → three things only you can decide (webfont licence, staff seed, phone/social
sign-in — 3 questions) → quick confirmations (cash-to-driver, Business capacity — 2 questions)
→ what we are handling ourselves → what needs translating once you answer → internal appendix
(a question→placeholder cross-reference table plus a 48-token exclusions table with a named
reason each).

No file besides `docs/build/CLIENT-INPUT-PACK.md` was created or modified. The checklist,
`OWNER-ANSWERS.md` and `OPEN-QUESTIONS.md` were read only, never rewritten.

## Verification — gates run and their actual output

All gates were run against the finished file with `grep`/`awk`/`comm`, not asserted:

- **Gate 1 (no invented currency amount)** — `sed 's/CHF 000//g'` then a currency-word/digit
  regex: **PASS**, zero matches.
- **Gate 2 (every carried-over figure attributed on its own line)** — regex for the
  archive/settled-fact number patterns, excluding lines containing "old site", "you already" or
  "set by": failed on first run (one paragraph wrapped `100%`/`75%`/`24 hours` onto a physical
  line separate from its `you already` attribution); fixed by un-wrapping that bullet to one
  line; **PASS** on rerun, zero matches.
- **Gate 3 (no internal jargon in the client-facing body)** — regex for `{TOKEN}`, `data-tok`,
  `.dc.html`, `vamos-*`, dotted key paths, `app/`, `docs/`, `pricing_live`, `Phase N`, `i18n`,
  scoped to everything before `## Internal appendix`: **PASS**, zero matches.
- **Gate 4 (launch summary first, appendix last and unique)**: **PASS** — first `##` heading is
  "What blocks launch", last is "Internal appendix — cross-reference", appearing exactly once.
- **Gate 5 (only the deliverable touched)** — `git status --porcelain` filtered to anything
  outside `docs/build/CLIENT-INPUT-PACK.md` and `.planning/`: **PASS**, no other files.
- **Gate 6 (coverage — every checklist placeholder accounted for)** — `comm -23` between the 105
  distinct `{TOKEN}` names extracted from `LEGAL-PLACEHOLDER-CHECKLIST.md` and the set extracted
  from the pack's appendix section: **PASS**, empty diff — every one of the 105 tokens appears
  either in the question→field map (57 tokens across the 60 questions) or the exclusions table
  (48 tokens, each with a one-line reason).
- **Gate 7 (shot list — ten slots, one explicitly dropped)** — counted `**N.` blocks between
  `## Your photos` and `## Your accounts`: **PASS**, exactly 10.
- **Block-shape completeness** — for the 50 non-photo question blocks, counted occurrences of
  each of the four required line labels (`Our recommendation:`, `If you leave this blank:`,
  `Needs translating once given:`, `Your answer:`): **PASS**, 50 of each, matching `60 - 10`
  photo slots exactly.

## Attribution audit

Grepped every `Our recommendation:` line for anything other than "only you can answer this":
found exactly three — the cancellation-tier/free-cancellation-window confirmation (sourced to
"you already decided this on 13 August 2026 — decision 2"), the finance-record retention
recommendation (sourced to "the Swiss Code of Obligations, Article 958f"), and the data-subject
response-time recommendation (sourced to "Article 12(3) of the GDPR"). Every other one of the 50
questions reads "only you can answer this" with a blank value, consistent with the plan's
explicit list of items that may never carry a recommendation (all money, the driver-no-show
share, both waiting allowances, Business capacity, company identity, insurance, supervisory
authority, dispute body, agency credits, large-vehicle seats and window, driver-details lead
time, and support/chat/response commitments).

Grepped every `What your old site said:` line (50 of 50 present, matching the question count).
25 read "the old site never published this/these/a rate for this/etc."; the remaining 25 quote
an archive figure and, in each case, state in the same or an adjacent sentence that the figure
is what the old page claimed rather than evidence it is correct (either the literal phrase "not
evidence [it/the figure] is right", or an equivalent framing such as "which does not fit our
stack" or "your own answer has already ruled one of them out").

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Gate 2 line-wrap attribution failure**
- **Found during:** first verification pass, after writing the full document.
- **Issue:** the confirm-cancellation-tiers question (now question 34) wrapped its
  recommendation paragraph across three physical lines; the "you already decided this" phrase
  landed on the first line while `100%`, `75%` and `24 hours` landed on the second, so gate 2's
  same-line attribution check failed even though the paragraph as a whole was correctly sourced.
- **Fix:** reflowed the bullet to a single unwrapped physical line so every flagged figure
  shares a line with its attribution phrase.
- **Files modified:** `docs/build/CLIENT-INPUT-PACK.md`.
- **Commit:** folded into the single deliverable commit below (the fix was applied before the
  first commit, since the file was not yet committed).

No other deviations. The document was written in one pass rather than as three separate task
commits — see the "Wrote the whole document in a single pass" decision above for why that does
not change what was delivered or verified.

## Known Stubs

None. Every question either carries a sourced recommendation or explicitly reads "only you can
answer this" with a blank value — there is no placeholder content standing in for a real
recommendation anywhere in the document.

## Self-Check: PASSED

- `docs/build/CLIENT-INPUT-PACK.md` — FOUND (850 lines).
- Commit `39da7c7` — FOUND in `git log --oneline`.
- All 8 verification gates re-run against the file on disk and confirmed passing at the time
  this summary was written (see Verification section above for actual command output).
