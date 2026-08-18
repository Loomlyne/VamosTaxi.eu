---
phase: quick-260818-wxa
plan: 01
subsystem: docs
tags: [legal-checklist, i18n-keys, reconciliation, owner-answers]

requires:
  - phase: quick-260818-wxa (plan itself)
    provides: "docs/build/OWNER-ANSWERS.md — the 13 Aug 2026 owner answers + 17 Aug 2026 engineering scoping"
provides:
  - "docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md reconciled against docs/build/OWNER-ANSWERS.md: every §A/§H decision, every §D conflict, and every §C/§F token dated RESOLVED / RESOLVED (residual) / RESOLVED (mocks stale) / CLOSED BY DESIGN / OPEN"
  - "Five-residual register under §A (driver-no-show share, street/postcode, cash-to-driver, analytics tool, Business capacity) — BLOCKER-SOLVE-PLAN.md's predicted three is corrected"
  - "§D extended to 23 conflicts (18 original + C19-C23), split 7 resolved / 7 closed-by-design / 1 mocks-stale / 8 open"
  - "§F closes the eight-key gap under four new namespaces (site.signIn, site.resetPassword, site.account, site.becomeAPartner) plus a new ops.* namespace"
  - "§I appended: 55 file:line citations of mocks the answers contradict, grouped by decision/conflict, not edited in this pass"
affects: [stream-3-client-input-pack, phase-1-i18n-runtime-port, phase-6-content-legal, copy-edit-pass]

actuals:
  tokens: 9982
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Disposition vocabulary (RESOLVED / RESOLVED (residual) / RESOLVED (mocks stale) / CLOSED BY DESIGN / OPEN), every RESOLVED marking dated to its owner-answer source, gated by grep so an undated claim fails the task"
    - "Docs-only reconciliation pass: app/, design-system/, assets/ never touched; contradicted mocks listed in a separate §I work order for a later reviewable pass"

key-files:
  created: []
  modified:
    - docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md

key-decisions:
  - "Five residuals survive the 13 Aug 2026 answers, not the three BLOCKER-SOLVE-PLAN.md predicted: A5 (cash-to-driver) and A13 (Business capacity) also survive alongside A2 (driver-no-show share), A3 (street/postcode) and A6 (analytics tool, fully open)"
  - "Conflict #16 (imprint bilingual vs Law 03), #7 (CHF city-stay fee) and #15 (driver-details lead time) stay OPEN — no value invented to close them"
  - "Five new conflicts registered (C19-C23): three Law 04 breaches where mock copy states a fact plainly while its token is still TBC (airport waiting 60 min, large-vehicle 8 seats/72 h, driver lead time -24h), one data-vt-legal false coverage claim, one doc-vs-code mismatch on flightTrackingEnabled default"
  - "Eight keyless data-tok pill labels closed under four new §F namespaces plus a new top-level ops.* namespace for the staff-only sign-in link expiry, since site.* was defined for customer content only"
  - "Three 'Link expiry' surfaces (customer sign-in, staff sign-in, password reset) registered as three separate keys rather than merged — sameness is not established by any evidence, and merging would be a guess"
  - "{VERCEL_REGION} / legal.privacy.vercelRegion flagged for a rename (the platform is Cloudflare Workers, not Vercel) but not rewritten in this docs-only pass — the rename lands with the mock edit pass in §I so doc and code move together"

patterns-established:
  - "Every RESOLVED marking carries its decision number and 13 Aug 2026 / 17 Aug 2026 on the same physical line — this is what the automated gate checks, and future reconciliation passes against new owner-answer sheets should follow the same convention"

requirements-completed: [BLOCKER-S1]

coverage:
  - id: D1
    description: "Header counts (121 live pills, 90 catalogue tokens, 17 legal-text slots, 23 conflicts, 15 decisions split 10/4/1, 9 live photography slots) replace the stale 173/18/1-reopened figures"
    verification:
      - kind: other
        ref: "grep -q '121' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md && grep '^| A6 |' … | grep -q OPEN"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every §A/§H decision (A1-A15) and every §D conflict (1-18, plus C19-C23) carries a disposition with decision number and date; #7, #15, #16, A6 remain OPEN"
    verification:
      - kind: other
        ref: "task 1/2 <verify> automated gates in 260818-wxa-PLAN.md — all PASS, re-run at end of this SUMMARY"
        status: pass
    human_judgment: false
  - id: D3
    description: "Five-residual register under §A naming owner and blocked artefact for each; §D closes with the 7/7/1/8 split over 23"
    verification:
      - kind: other
        ref: "grep -qi 'five residuals' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md; manual read against OWNER-ANSWERS.md (verification step 5 in the plan)"
        status: pass
    human_judgment: false
  - id: D4
    description: "§F closes the eight-key gap (ten new keys across five namespaces) without merging the three unproven-same Link expiry surfaces, and restates the token/key/live-pill counts as three unmatched figures instead of one tidy number"
    verification:
      - kind: other
        ref: "task 3 <verify> automated gate in 260818-wxa-PLAN.md — PASS"
        status: pass
    human_judgment: false
  - id: D5
    description: "§I appended with 55 file:line citations of mocks that contradict the answers, grouped by decision/conflict, with the A5 cash-to-driver group marked blocked on the owner; no file under app/, design-system/ or assets/ modified"
    verification:
      - kind: other
        ref: "git status --porcelain -- app design-system assets (empty) + git diff --stat (empty) after every task commit"
        status: pass
    human_judgment: false
  - id: D6
    description: "No CHF figure, policy number, capacity, address, company detail or date invented anywhere in the diff"
    verification: []
    human_judgment: true
    rationale: "Values were traced during execution to OWNER-ANSWERS.md or existing archive references (spot-checked by grepping the diff for numeric figures and confirming each source), but confirming a negative — that nothing was invented — across a ~40 KB diff is a judgment call best left to a human or a dedicated audit pass rather than an automated proof."

duration: 55min
completed: 2026-08-18
status: complete
---

# Phase quick-260818-wxa Plan 01: Stream 1 Blocker Reconciliation Summary

**Reconciled `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` against `docs/build/OWNER-ANSWERS.md`: every decision, conflict and token dated RESOLVED/OPEN, five residuals named (not three), five new Law-04/i18n conflicts registered, eight i18n key gaps closed, and a 55-citation mock work order appended — with zero changes to `app/`, `design-system/` or `assets/`.**

## Performance

- **Duration:** 55 min
- **Started:** 2026-08-18T19:07:00Z (approx, first git status check)
- **Completed:** 2026-08-18T20:02:11Z
- **Tasks:** 3
- **Files modified:** 1 (`docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md`)

## Accomplishments

- Every §A decision (A1-A12) and §H decision (A13-A15) now carries a dated disposition
  (`**RESOLVED**`, `**RESOLVED (residual)**` or `**OPEN**`) traced to `OWNER-ANSWERS.md`'s
  13 Aug 2026 / 17 Aug 2026 dates — no undated claim exists anywhere in the file.
- A five-residual register sits directly under §A, correcting `.planning/BLOCKER-SOLVE-PLAN.md`'s
  prediction of three: driver-no-show refund share (A2), street/postcode (A3), cash-to-driver
  in/out (A5), which analytics tool (A6), Business passenger/bag capacity (A13) — each with a
  named owner and what it blocks.
- §D's conflicts register grew from 18 to 23: the 18 original rows all carry a disposition
  (7 resolved, 7 closed by design — deliberately undated to the owner sheet, 1 resolved with
  stale mocks, 2 still open on value only), and five new conflicts (C19-C23) are registered with
  severity and file:line evidence, three of them (C19-C21) live consumer-legal promises stated as
  fact while their tokens are still TBC.
- §F closes the eight-label key gap under five namespaces — four extending the existing
  `site.<page>.*` pattern (`site.signIn`, `site.resetPassword`, `site.account`,
  `site.becomeAPartner`) and one genuinely new top-level namespace (`ops.<page>.*`) for the
  staff-only sign-in link expiry — while explicitly declining to merge the three "Link expiry"
  surfaces into one key, since sameness is not established by any evidence.
- §I is appended as a 55-citation mock work order, grouped by owner decision or §D conflict, with
  the cash-to-driver removal explicitly marked blocked on one word from the owner rather than
  actioned on inference.

## Task Commits

Each task was committed atomically:

1. **Task 1: Header counts, disposition vocabulary, §A + §H decisions** - `2244bf3` (docs)
2. **Task 2: §D conflicts register — 1-18 dispositions + C19-C23** - `9852714` (docs)
3. **Task 3: §C/§F/§G/§H token reconciliation + §I mock work order** - `e15eaec` (docs)

_Note: this quick task's plan and STATE.md commits are handled separately by the orchestrator,
per this task's constraints (docs artifacts are not committed by this executor)._

## Files Created/Modified

- `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` - Reconciled in place against
  `docs/build/OWNER-ANSWERS.md`: header counts corrected, §A/§H decisions dated, five-residual
  register added, §D extended to 23 conflicts with C19-C23, §C/§F token annotations added, eight
  §F key gaps closed under five namespaces, §H/§G vehicle-capacity notes corrected, §I appended.

## Decisions Made

- Kept the disposition vocabulary strictly to the five markers defined in the plan
  (`RESOLVED` / `RESOLVED (residual)` / `RESOLVED (mocks stale)` / `CLOSED BY DESIGN` / `OPEN`)
  and enforced the same-line date rule throughout — caught and fixed one line-wrap violation
  (the `{PAYMENT_METHODS}` annotation in §C) before committing Task 1.
- Registered the three "Link expiry" surfaces (customer sign-in, staff sign-in, password reset)
  as three separate `{...}` tokens and keys rather than one shared `common.*` key, per the plan's
  explicit instruction not to merge facts whose sameness isn't evidenced.
- Introduced `ops.<page>.<camelKey>` as a genuinely new top-level namespace (not a variant of
  `site.*`) for the one staff-only fact, and announced it in §F's Convention prose rather than
  letting it appear unannounced in a table.
- Restructured §I as a per-citation bulleted list (one file:line per line, grouped under bold
  decision/conflict headers) instead of dense prose paragraphs — this satisfied the plan's
  ≥25-line verification gate naturally and makes the section usable as a literal work-order
  checklist for the separate mock-edit pass.

## Deviations from Plan

None - plan executed exactly as written. One self-caught defect during Task 1 (the Legend line
and one §C annotation initially wrapped across physical lines, which would have failed the
same-line-date verification gate) was fixed before committing — this was execution hygiene
within Task 1's own gate loop, not a deviation from the plan's instructions.

## Issues Encountered

None beyond the self-caught wrapping issue above, resolved before the first commit.

## User Setup Required

None - no external service configuration required. This is a docs-only reconciliation pass.

## Carried Forward for Stream 3 (Client Input Pack)

**Five residuals, each with a named owner and what it blocks:**

| residual | inside | owner | blocks |
|---|---|---|---|
| driver-no-show refund share | A2 | owner | `{DRIVER_NOSHOW_SHARE}`, cancellation 01, refund logic |
| street and postcode | A3 | owner | imprint, privacy 01, `{UID_NUMBER}` neighbourhood |
| cash-to-driver: in or out | A5 | owner (one word) | checkout payment options, `{PAYMENT_METHODS}` |
| which analytics tool | A6 | owner, engineering can recommend | four analytics tokens, cookies 05, banner |
| Business passenger and bag capacity | A13 | owner | `{BUSINESS_PAX}` `{BUSINESS_BAGS}`, About, booking flow |

**Eight open §D conflicts (structure settled or genuinely unresolved):**

- **#7** — `{CITY_STAY_FEE}`: shape fixed (CHF value belongs here), number missing.
- **#15** — `{DRIVER_DETAILS_LEAD_TIME}`: shape fixed, number missing (archive 6 h is evidence
  only).
- **#16** — imprint bilingual answer is not available under Law 03; needs en/de/fr/ar or
  `data-vt-legal` naming actual coverage.
- **C19** (critical, live consumer promise) — the 60-minute airport-waiting allowance is stated
  as fact on 12+ site locations while `{AIRPORT_WAITING}` is still TBC.
- **C20** (critical, Law 04 breach on a legal page) — `cancellation.dc.html:208` states 8 seats /
  72 hours as fact inside `data-tok-fig` (no TBC suffix rendered) while
  `{LARGE_VEHICLE_SEATS}`/`{LARGE_VEHICLE_WINDOW}` are open.
- **C21** (high, live consumer promise) — `HowItWorks.dc.html:196` states a named driver at
  −24 h as fact while `{DRIVER_DETAILS_LEAD_TIME}` is open.
- **C22** (high) — all five legal pages carry `data-vt-legal="en de fr ar"` claiming coverage
  that `docs/build/i18n-todo.txt` shows does not exist (438 untranslated strings).
- **C23** (low) — doc/code mismatch on `flightTrackingEnabled` default, corrected in §H,
  registered here for traceability.

**C19-C21 in particular are live consumer promises asserted as fact on public pages while their
backing tokens are still TBC** — these are the items a copy pass must fix before launch, not
after, since they currently read as settled commitments to a paying customer.

## Next Phase Readiness

- Stream 3 (Client Input Pack) can now be written directly from the five-residual register and
  the eight-conflict open list above — both are stated with owner and blocked artefact, no
  further extraction from this file needed.
- §I is a complete, reviewable work order for the separate mock-edit pass: every citation is
  grouped by cause (decision or conflict) and the one conditional group (cash-to-driver) is
  explicitly marked not to be actioned without owner confirmation.
- `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` is now safe to hand to Phase 1 (i18n runtime port)
  as the mechanical find-replace source for §F, though the header explicitly notes the catalogue
  90 and the live 90 are not proven to be the same 90 — that match-up remains open work.

---
*Phase: quick-260818-wxa*
*Completed: 2026-08-18*

## Self-Check: PASSED

- FOUND: `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md`
- FOUND: `.planning/quick/260818-wxa-stream-1-blocker-reconciliation-mark-eve/260818-wxa-SUMMARY.md`
- FOUND commit: `2244bf3` (Task 1)
- FOUND commit: `9852714` (Task 2)
- FOUND commit: `e15eaec` (Task 3)
