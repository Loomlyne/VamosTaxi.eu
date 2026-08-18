---
phase: quick-260818-wxa
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md
autonomous: true
requirements: [BLOCKER-S1]
mode: quick

estimate:
  tokens: 58000
  raw_tokens: 58000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Reading §A tells you, per decision A1–A15, whether it is closed and by which dated owner answer."
    - "The headline counts at the top of the file match what is actually in app/ (121 data-tok pills, 90 unique pill labels) instead of the stale 173 / 73 / 18-slot figures."
    - "The file states that FIVE residuals survive the 13 Aug answers, names each one with its owner and what it blocks, and says plainly that BLOCKER-SOLVE-PLAN.md predicted three."
    - "Conflict 16 (imprint bilingual vs Law 03) and the two value-TBC conflicts (#7, #15) still read as open — nothing is closed by inference."
    - "Five new conflicts C19–C23 are registered with severity and file:line evidence."
    - "Every live data-tok label either maps to a §F key or is listed explicitly as keyless, and the two duplicate-wording label pairs are collapsed to one fact each per §F rule 1."
    - "The mock sites the 13 Aug answers contradict are listed by file and line in a new §I — and no file under app/, design-system/ or assets/ was modified."
  artifacts:
    - "docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md — reconciled in place, sections A–H preserved, §I appended"
  key_links:
    - "§A residual register → Stream 3 (Client Input Pack): the five residuals plus the page-by-page blanks are that pack's item list"
    - "§I contradicted-mock list → the separate copy-edit pass: §I is that pass's work order"
    - "§D C19–C23 → Law 04 enforcement in app/: C19/C20/C21 are live consumer promises asserted as fact while their tokens are open"
---

<objective>
Reconcile `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` against `docs/build/OWNER-ANSWERS.md`
(the owner's authoritative answers, 13 Aug 2026, plus the 17 Aug 2026 engineering scoping
notes carried in the same file), so the checklist stops showing as open what is in fact
settled, and stops showing as settled what is in fact still a gap.

Purpose: Stream 1 of `.planning/BLOCKER-SOLVE-PLAN.md`. Stream 3 (the Client Input Pack) can
only be written once this file states the true remaining gaps. Today the file predates the
answers, so its headline counts, its §A decisions and its §D conflicts register are all stale
— and five conflicts that exist in the mocks are not registered anywhere.

Output: one modified file, `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md`, with a reviewable
diff: dispositions added in place inside the existing tables, a residual register after §A,
five new rows on the §D table, and one appended §I.

**This is a DOCS-ONLY pass.** Nothing under `app/`, `design-system/` or `assets/` may be
touched. Where an answer contradicts mock copy, the file and line are *listed* in §I; editing
them is a separate, reviewable pass.

**Never invent a value.** No CHF figure, policy number, capacity, address, company detail or
date may be introduced. Every number written into this file must be quoted from
`OWNER-ANSWERS.md` or already present in the checklist as an archive reference. A residual gap
stays a gap and gains a named owner plus what it blocks — never a guess.
</objective>

<execution_context>
@$HOME/.claude/gsd-core/workflows/execute-plan.md
@$HOME/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.claude/CLAUDE.md
@.planning/STATE.md
@.planning/BLOCKER-SOLVE-PLAN.md
@docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md
@docs/build/OWNER-ANSWERS.md
</context>

<disposition_vocabulary>
One vocabulary is used for every marking in this pass. Task 1 defines it; tasks 2 and 3 reuse
it verbatim. Markers are bold-literal in the file so they are greppable:

- `**RESOLVED**` — closed by a dated owner answer.
- `**RESOLVED (residual)**` — answered, but a named gap survives inside the answer.
- `**RESOLVED (mocks stale)**` — the decision is made; the mocks still say the old thing.
- `**CLOSED BY DESIGN**` — settled before 13 Aug 2026 by the design work itself. Not an owner
  answer, and must not be credited to one.
- `**OPEN**` — not closed. Includes "structure settled, value still TBC".

Rule: every `**RESOLVED…` marking carries its evidence inline — the owner decision number and
its date, `13 Aug 2026` for the answer sheet, `17 Aug 2026` for the engineering-scoped
follow-ups (decisions 5, 11, 14 and Q14/Q16/Q18/Q19/Q21/Q22). A marking without a date is a
claim without a source and the gate rejects it.
</disposition_vocabulary>

<tasks>

<task type="tracer">
  <name>Task 1: Header counts, the disposition vocabulary, and §A + §H decisions end to end</name>
  <files>docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md</files>
  <precondition>`git status --porcelain -- app design-system assets` is empty at the start of this task — the docs-only gate in every task compares against a clean tree for those three directories, so a pre-existing dirty file there would make the gate meaningless. Halt and report if it is not empty.</precondition>
  <read_first>
    `docs/build/OWNER-ANSWERS.md` in full (94 lines — the Decisions table, the Photography
    block and the page-by-page blanks), and `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md`
    lines 1–48 (header + §A + §B) and 319–354 (§H).
  </read_first>
  <action>
Establish the vocabulary and prove it on §A before it is applied to 18 conflicts and 90 tokens.

**1. Header block (lines 1–13).** Add a `**Reconciled:**` line under `**Built:**` recording
that this file was walked against `docs/build/OWNER-ANSWERS.md` on 18 Aug 2026 — 13 Aug 2026
answers plus 17 Aug 2026 engineering scoping. Then rewrite the `**Total open items:**` line so
every count is true:

- Tokens: keep `90 tokens` as the catalogue total (§C 73 + §G 9 + §H 8 = 90 — it is correct)
  and add the measured live figure beside it: `121 data-tok pills in app/, 90 unique pill
  labels (89 distinct facts + 1 dynamic binding, `{{ shareLabel }}` at
  `app/pages/manage-booking.dc.html:557`, which resolves to three shares already counted)`.
- Add a one-line note killing the `173` figure that circulates: it counts 121 pills plus 41
  `[data-tok]` CSS selector lines plus 8 `data-tok-fig="1"` plus 3 `[data-tok-fig]` selectors,
  so it is a grep artifact, not a content count.
- State plainly that the catalogue's 90 and the live 90 are **not proven to be the same 90**:
  §F carries 82 keys and 8 live pill labels have no key at all (task 3 fixes that side), so the
  two sets have not been matched item by item and this pass does not claim they have.
- Legal-text slots: the header says `18`, §B's own heading and its table say `17` (Terms 8 +
  Privacy 2 + Cancellation 3 + Imprint 4 + Cookies 0). Correct the header to `17`.
- Conflicts: `23 documented conflicts` — the original 18 plus C19–C23 registered in task 2.
  Drop `(1 reopened)`: conflict 13 is closed by decision 13.
- Decisions: `15 blocking decisions — 10 resolved, 4 resolved with a named residual, 1 open`.
- Add the photography line from `OWNER-ANSWERS.md`: 10 slots listed, every one blank; 1 of them
  ("First" class) is moot after decision 13, so 9 are live.

**2. The legend.** Immediately after the header block add a single line starting at column 0
with `Legend:` that defines all five markers from `<disposition_vocabulary>` on that one line.
One line, because the date gate excludes exactly the line that starts `Legend:`.

**3. §A table (lines 20–32, rows A1–A12).** Add a disposition to each row in place — append it
to the existing `Why it blocks` cell rather than adding a column, so the diff stays readable
and the table shape is unchanged. Per `OWNER-ANSWERS.md`:

- A1 `**RESOLVED**` — decision 1, 13 Aug 2026: Carrier, directly liable. Archive liability
  disclaimer must not be carried over.
- A2 `**RESOLVED (residual)**` — decision 2, 13 Aug 2026: 100% more than 24 h before pickup,
  75% inside 24 h, nothing for a no-show. Residual: the refund share when *our* driver fails to
  show (`{DRIVER_NOSHOW_SHARE}`) is still blank on the owner sheet.
- A3 `**RESOLVED (residual)**` — decision 3, 13 Aug 2026: "Zürich, Switzerland". The two-address
  conflict is dead — neither archive address is authoritative. Residual: street and postcode.
- A4 `**RESOLVED**` — decision 4, 13 Aug 2026: `contact@vamostaxi.eu`. Note that six mock sites
  still ship `info@vamostaxi.eu`; they are listed in §I.
- A5 `**RESOLVED (residual)**` — decision 5, 13 Aug 2026 + 17 Aug 2026: Visa, Mastercard, Apple
  Pay, Google Pay, TWINT. PayPal out of V1 (Stripe has no CH PayPal support). Residual:
  cash-to-driver is absent from the accepted list, so it reads as out, and needs one word of
  owner confirmation before the mock option is removed.
- A6 `**OPEN**` — decision 6 left blank 13 Aug 2026. Vercel Analytics is off the table with the
  stack change; the live choice is Cloudflare Web Analytics (cookieless) vs PostHog
  (consent-gated). Blocks `{ANALYTICS_COOKIE}` `{ANALYTICS_PROVIDER}` `{ANALYTICS_DURATION}`
  `{ANALYTICS_REGION}`, cookies 05 and the banner.
- A7 `**RESOLVED**` — decision 7, 13 Aug 2026: Zürich.
- A8 `**RESOLVED**` — decision 8, 13 Aug 2026 + Q14: chat, WhatsApp or email, additive to the
  self-serve button, not a replacement.
- A9 `**RESOLVED**` — decision 9, 13 Aug 2026: owner deferred to engineering; engineering answer
  is yes, consent is logged server-side, adding a `consent_log` table. A browser-only cookie
  cannot prove consent to a Swiss nFADP or GDPR regulator.
- A10 `**RESOLVED**` — decision 10, 13 Aug 2026: crash reporting is strictly necessary and
  always on, moved out from under the Analytics toggle, with the recorded caveat that Sentry
  transmits IP and URL data. Toggle lives in `settings`.
- A11 `**RESOLVED**` — decision 11, 13 Aug 2026, scoped 17 Aug 2026: live chat is a WhatsApp
  deep link, not a third-party widget and not an in-house build.
- A12 `**RESOLVED**` — decision 12, 13 Aug 2026: build `become-a-partner` for launch. The
  unlink branch is dead; the four blanks on that page stay open (see §C/§F work in task 3).

**4. §H decisions table (lines 326–330, rows A13–A15).** Same treatment:

- A13 `**RESOLVED (residual)**` — decision 13, 13 Aug 2026 + Q5/Q6: three classes, Economy 3/3,
  Van 8/8, `first` does not ship. This closes the §D conflict-13 reopening: §G's confirmed 8/8
  stands and §H's 7/8 fixture is superseded. Residual: Business passenger and bag capacity.
- A14 `**RESOLVED**` — decision 14, 13 Aug 2026, scoped 17 Aug 2026 to autofill plus
  delay-aware pickup, not live ops-board tracking. Correct this row's parenthetical claim that
  `flightTrackingEnabled` is "default on": `app/home/home.dc.html:505` declares `"default":false`.
  Mark that as conflict C23 (registered in task 2) and state the doc was wrong, not the code.
- A15 `**RESOLVED**` — decision 15, 13 Aug 2026: no hourly mode, remove the tab,
  `hourlyEnabled=false`. The mock change is authorised by the owner but is out of scope for
  this docs pass; it is listed in §I.

**5. The residual register.** Immediately after the §A table, add a short block headed
`### What actually survives — five residuals`. State plainly that `.planning/BLOCKER-SOLVE-PLAN.md`
predicted three (A3, A6, and the driver-no-show share inside A2) and that the true count is
**five residuals**, because A5 and A13 also survive. Then one row each, with owner and what it
blocks — and no guessed value anywhere:

| residual | inside | owner | blocks |
| driver-no-show refund share | A2 | owner | `{DRIVER_NOSHOW_SHARE}`, cancellation 01, refund logic |
| street and postcode | A3 | owner | imprint, privacy 01, `{UID_NUMBER}` neighbourhood |
| cash-to-driver: in or out | A5 | owner (one word) | checkout payment options, `{PAYMENT_METHODS}` |
| which analytics tool | A6 | owner, engineering can recommend | four analytics tokens, cookies 05, banner |
| Business passenger and bag capacity | A13 | owner | `{BUSINESS_PAX}` `{BUSINESS_BAGS}`, About, booking flow |

Do not merge this register with the page-by-page blanks in `OWNER-ANSWERS.md` — those are data
gaps that were never decisions. These five are the residue of decisions that *were* answered,
which is exactly what Stream 3 needs to see separated.
  </action>
  <verify>
    <automated>test -z "$(git status --porcelain -- app design-system assets)" && test "$(grep -c '\*\*RESOLVED' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" -ge 14 && test "$(grep '\*\*RESOLVED' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md | grep -v '^Legend:' | grep -Evc '1[37] Aug 2026')" = 0 && grep '^| A6 |' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md | grep -q 'OPEN' && grep -qi 'five residuals' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md && grep -q '121' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md && echo PASS</automated>
  </verify>
  <done>The header counts are true (121 live pills, 90 catalogue tokens, 17 legal-text slots, 23 conflicts, 15 decisions split 10/4/1, 10 photography slots of which 9 live); a one-line `Legend:` defines all five markers; every row A1–A15 carries a disposition with its decision number and date; A6 reads `**OPEN**`; and a five-row residual register sits under §A stating five, not three, and naming an owner and a blocked artefact for each. `git status` shows one modified file.</done>
</task>

<task type="auto">
  <name>Task 2: §D conflicts register — dispositions for 1–18, and five new conflicts C19–C23</name>
  <files>docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md</files>
  <read_first>
    `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` lines 100–121 (the §D table). The five new
    conflicts and their file:line evidence are given in full below — you do not need to
    re-derive them, though you may spot-check any line you cite.
  </read_first>
  <action>
Apply the task-1 vocabulary to §D, then extend the register. Add each disposition to the
existing `Handled` cell in place; do not renumber rows, do not add a column, do not reorder.

**1. Settled by the 13 Aug answers — 7 rows, `**RESOLVED**` with decision number and date:**
#1 (decision 2, tiers) · #2 (decision 7, Zürich venue) · #3 (decision 3, "Zürich,
Switzerland" — neither archive address is authoritative; street and postcode remain the A3
residual) · #5 (decision 1, carrier) · #6 (decision 5, payment list, cash-to-driver the A5
residual) · #13 (decision 13, Van 8/8 — this also retires the `**reopened**` note in that
cell and the `(1 reopened)` in the header) · #14 (decision 8 + Q14, additive channels).

**2. Handled by design before the answers — 7 rows, `**CLOSED BY DESIGN**`:**
#8, #9, #10, #11, #12, #17, #18. These were never waiting on the owner. Mark them so, with a
half-line saying what closed them (the existing `Handled` cell already says: not carried over
· privacy 05 slot note · revFADP · GDPR stamp · not carried over · cookies 08 flag +
`CookieBanner` · terms 02 scope statement · lifted to privacy). Do **not** date these
13 Aug 2026 and do not credit them to an owner answer — that would inflate what the answers
achieved.

**3. Structure settled, value still TBC — 2 rows, `**OPEN**`:**
#7 (`{CITY_STAY_FEE}` — the €15 archive figure is deliberately not carried over; the CHF value
is open) and #15 (`{DRIVER_DETAILS_LEAD_TIME}` open; archive 6 h is evidence, not the answer).
Say explicitly that the *shape* is fixed and only the number is missing, so nobody re-litigates
the structure.

**4. Answered, mocks stale — 1 row:** #4 `**RESOLVED (mocks stale)**` — decision 4,
13 Aug 2026 chose `contact@vamostaxi.eu`, yet `info@vamostaxi.eu` still ships in six places.
Point at §I.

**5. Still a real conflict — 1 row:** #16 stays `**OPEN**`. Its current `Handled` cell says
"imprint is bilingual, DE leading", which contradicts the four-languages-same-pass law in
`CLAUDE.md` (Law 03). Rewrite the cell to say the bilingual answer is not available under Law
03 and the imprint ships in en/de/fr/ar like every other surface, or carries `data-vt-legal`
naming the languages the text actually exists in. Do not mark this resolved.

**6. Register five new conflicts.** Append rows C19–C23 to the same §D table, keeping the
column shape (`#` · `Conflict` · `Severity` · `Handled`), each `**OPEN**` with its file:line
evidence. None of these is in the existing 18:

- **C19 · critical · The 60-minute airport-waiting allowance is promised as fact while its
  token is TBC.** `{AIRPORT_WAITING}` is an open `data-tok` pill on terms and cancellation, and
  `OWNER-ANSWERS.md` leaves free airport waiting time blank — yet plain copy asserts 60 minutes
  at `app/home/home.dc.html:759` and `:791` (en), `:817` and `:849` (de), `:875` (fr);
  `app/home/HowItWorks.dc.html:205`; `app/pages/account.dc.html:255`;
  `app/vamos-i18n-dict.js:180`, `:314`, `:316`, `:1321`; `app/vamos-ops-data.js:298`. Same
  failure mode as conflict 1: a live consumer promise contradicting the page that owns the fact.
- **C20 · critical · Invented figures on a legal page.** `app/pages/cancellation.dc.html:208`
  states that vehicles over 8 seats work to a longer window of 72 hours, as plain fact inside
  `data-tok-fig` wrappers — which are typographic only and render no TBC suffix.
  `{LARGE_VEHICLE_SEATS}` and `{LARGE_VEHICLE_WINDOW}` are both open, and §C records archive
  values of 15 seats / 5 days, which those two figures match neither. Direct Law 04 breach on a
  consumer legal page.
- **C21 · high · Invented driver-assignment lead time.** `app/home/HowItWorks.dc.html:196`
  states a named driver is assigned at −24 h as fact; `{DRIVER_DETAILS_LEAD_TIME}` is open
  (archive 6 h). Ties to conflict 15.
- **C22 · high · `data-vt-legal` asserts language coverage that does not exist.** All five legal
  pages carry `data-vt-legal="en de fr ar"` (`app/pages/terms.dc.html:109`,
  `privacy.dc.html:117`, `cookies.dc.html:130`, `cancellation.dc.html:120`,
  `imprint.dc.html:124`) and `terms.dc.html:123` prints the four language names — while
  `docs/build/i18n-todo.txt` lists 438 untranslated legal strings (terms 102, privacy 107,
  imprint 98, cookies 49, cancellation 82). The attribute exists precisely to stop this
  pretence. Note that this one feeds Stream 5 and interacts with #16.
- **C23 · low · Doc contradicts code.** §H asserts `flightTrackingEnabled` has "default on";
  `app/home/home.dc.html:505` declares `"default":false`. The §H note is what Phase 2 would
  read. Corrected in §H by task 1; registered here so the correction is traceable.

Close §D with one line stating the split: 23 conflicts — 7 resolved by the 13 Aug answers, 7
closed by design before them, 1 resolved with stale mocks, 8 open (#7, #15, #16, C19–C23).
  </action>
  <verify>
    <automated>test -z "$(git status --porcelain -- app design-system assets)" && test "$(grep -cE '^\| C(19|20|21|22|23) \|' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = 5 && test "$(grep -cE '^\| ([1-9]|1[0-8]) \|.*(RESOLVED|CLOSED BY DESIGN|OPEN)' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" = 18 && grep '^| 16 |' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md | grep -q 'OPEN' && grep '^| 7 |' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md | grep -q 'OPEN' && test "$(grep '\*\*RESOLVED' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md | grep -v '^Legend:' | grep -Evc '1[37] Aug 2026')" = 0 && test "$(grep -c 'CLOSED BY DESIGN' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" -ge 8 && echo PASS</automated>
  </verify>
  <done>All 18 original rows carry a disposition; the 7 design-closed rows are not dated to the owner sheet; #7, #15 and #16 read `**OPEN**`; #16's cell no longer offers the bilingual answer; C19–C23 exist as table rows with severity and file:line evidence; and §D closes with the 7/7/1/8 split over 23. `git status` shows one modified file.</done>
</task>

<task type="auto">
  <name>Task 3: Token and key reconciliation (§C, §F, §G, §H) and the appended §I mock work order</name>
  <files>docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md</files>
  <read_first>
    `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` lines 49–98 (§C), 132–315 (§F), 332–353 (§H
    tokens) and 355–387 (§G).
  </read_first>
  <reversibility rating="costly">Introducing i18n key names in §F is cheap to write and expensive to undo — §F rule 3 says keys stay stable, and Phase 1 does a mechanical find-replace against this table. Follow the existing convention exactly and flag, rather than resolve, any case where the correct namespace is genuinely unclear.</reversibility>
  <action>
Bring the token catalogue into line with the answers, close the §F key gaps, and write the
work order for the separate mock pass.

**1. §C heading (line 49).** `## C. Tokens by page — 73` is a stale-looking subtotal, not a
wrong one: 73 is the slice-1 count. Relabel it so it reads as a subtotal — 73 in slice 1, 82
with §G's 9, 90 with §H's 8 — and cross-reference the header's live-pill figures. Do not
renumber or restructure the per-page tables.

**2. §C annotations — only what the answers establish.** Annotate in place, inline in the
existing cells or as a bracketed note on the token, each with decision number and date. Take
values only from `OWNER-ANSWERS.md`; do not pull numbers from any other document in this pass:

- `{PAYMENT_METHODS}` (terms, line 69) — decision 5, 13 Aug 2026 + 17 Aug 2026: Visa,
  Mastercard, Apple Pay, Google Pay, TWINT. PayPal out of V1. Cash-to-driver unconfirmed (A5
  residual).
- `{FULL_REFUND_SHARE}` / `{PARTIAL_REFUND_SHARE}` / `{NOSHOW_REFUND_SHARE}` (lines 73–74) —
  decision 2, 13 Aug 2026: 100% more than 24 h before pickup, 75% inside 24 h, nothing for a
  no-show. Map each token to the tier it now carries, and note that the archive's 75/25
  framing is superseded rather than confirmed.
- `{FREE_CANCEL_WINDOW}` (line 73) — decision 2 states "more than 24 h before pickup"
  verbatim, so 24 h is stated, not inferred. **But** the page-by-page blanks in the same file
  still list the free-cancellation window as unanswered. Record that as an internal
  inconsistency inside `OWNER-ANSWERS.md`, resolved in favour of the explicit decision, and
  flag it for a one-line owner confirmation. Do not silently drop either side.
- `{DRIVER_NOSHOW_SHARE}` (line 76) — stays `**OPEN**`; it is the A2 residual and is a
  different fact from `{NOSHOW_REFUND_SHARE}`. Say so on the row, because the two are one
  careless read apart.
- `{VERCEL_REGION}` (line 80) — the platform is Cloudflare Workers, not Vercel (Q21, answered
  17 Aug 2026; see `.planning/PROJECT.md` constraints). Naming Vercel on the privacy page is a
  false subprocessor disclosure. Flag the token and its key `legal.privacy.vercelRegion` as
  needing a rename, and state that the rename lands with the mock edit pass so the doc and the
  code move together — do **not** rewrite the key cell in §F now. The region *value* stays
  open: data residency is still with counsel per `.planning/STATE.md`.
- `{SENTRY_REGION}`, `{ERROR_COOKIE}`, `{ERROR_COOKIE_DURATION}` — decision 10, 13 Aug 2026:
  error monitoring is strictly necessary and always on, so these no longer sit under the
  Analytics toggle. Values still open.
- The four analytics tokens — blocked on A6, which is `**OPEN**`. Name the two candidates
  (Cloudflare Web Analytics, cookieless; PostHog, consent-gated) as the choice, not as an
  answer.
- Every other token in §C is untouched by the answers and keeps its current state. Do not add a
  disposition to a token the owner did not speak to.

**3. §F — close the eight key gaps.** Eight live pill labels have no §F key. Add them to the
right namespace table, following the existing convention (`common.*` when a fact appears on two
or more pages, `site.<page>.*` otherwise) and extending the convention prose where a new page
namespace is needed, saying so explicitly in §F rather than letting a new namespace appear
unannounced:

- `Link expiry` — `app/ops/AuthForm.dc.html`, `app/pages/AuthForm.dc.html`,
  `app/pages/ResetForm.dc.html`.
- `Code expiry` and `Code attempts` — `app/pages/PhoneVerify.dc.html`.
- `Password policy` — `app/pages/ResetForm.dc.html`.
- `Record retention` — `app/pages/account.dc.html`.
- `Required permits`, `Partner vehicle classes`, `Partner reply time` —
  `app/pages/become-a-partner.dc.html` (in scope per decision 12).

Where sameness across surfaces is not established by evidence — in particular whether the staff
sign-in link expiry in `app/ops/AuthForm.dc.html` is the same fact as the customer reset-link
expiry, and whether either is the guest manage-booking link expiry that `OWNER-ANSWERS.md`
lists separately — **do not merge them into one key**. Register a key per surface family and add
a one-line flag naming the open question. §F rule 1 collapses facts that are *known* to be the
same; it does not license a guess.

**4. §F — collapse the two duplicate-wording pairs.** Each is one fact wearing two labels,
which is the exact failure rule 1 exists to prevent:

- "Refund payout time" (`booking-detail`, `manage-booking`) and "Refund payout days" (`terms`,
  `cancellation`) → one fact, `common.refundPayoutDays`, which already exists.
- "Change deadline" (`manage-booking`, twice) and "Modification deadline" (`cancellation`) →
  one fact, `legal.cancellation.modificationDeadline`, which already exists.

Record both wordings against the single key in the `Appears on` column so the mock pass knows
which labels to normalise, and add them to §I.

**5. §F closing line (line 314).** `82 tokens · 82 keys · 12 of them shared` undercounts.
Recompute it after the eight additions and state it honestly as three separate figures: the §F
key total, the §H vehicle-class keys that sit outside §F, and the live unique pill labels
measured in `app/` (90, of which 89 are distinct facts). State in one line that the sets have
not been matched item by item, and that the difference is an open reconciliation item — do not
tidy it into a single number that implies a match nobody performed.

**6. §H (lines 338–339) and §G (lines 376–381).** §H's fixture note says Economy 3/3 and Van
7/8 "placeholders per A13". Decision 13 settles Economy 3/3 and Van 8/8, so mark the 7/8 fixture
superseded, cross-reference §D conflict 13 as closed, and leave §G's confirmed 8/8 standing.
§G's "Business capacity was never given" line is still true — mark it as the A13 residual and
link it to `{BUSINESS_PAX}` / `{BUSINESS_BAGS}`. Note that `first` does not ship, so the §H
four-token pattern applies to three classes, not four.

**7. Append §I — the mock work order.** New section at the end of the file, after §G, headed
`## I. Mocks the answers contradict — list only, not edited in this pass`. Existing section
letters are untouched. Open with one line stating this is a work order for a separate,
reviewable pass and that nothing under `app/` was modified here. Then group by cause, each item
with file, line and the decision or conflict that drives it:

- *Decision 13, vehicle lineup*: `app/home/home.dc.html:747` (the `first` class entry must go);
  `:748` (`van` cap 7 → 8); `:772` and `:831` plus the fr and ar label maps (`first:'First'` /
  `exFirst:…` entries).
- *Decisions 14 and 15, feature flags*: `app/home/home.dc.html:505` — `hourlyEnabled` default
  `true` → `false`; `flightTrackingEnabled` default `false` → `true`.
- *Decision 15, hourly copy*: `app/home/home.dc.html:753`, `:763`, `:781` and the de/fr/ar
  equivalents.
- *Decision 5, payment options*: `app/pages/checkout.dc.html:105`, `:168`, `:191`, `:274`,
  `:276`, `:277` — the PayPal radio and its strings. And, **conditional on the A5 residual**,
  `app/pages/checkout.dc.html:106`, `:169`, `:192`, `:275`, `:287` and
  `app/pages/confirmation.dc.html:122`, `:132`, `:154` — the cash-to-driver option. Mark that
  second group as blocked on one word from the owner; it must not be removed on inference.
- *Decision 2, cancellation promise*: `app/pages/checkout.dc.html:172`,
  `app/home/home.dc.html:769`, `:886`, `:920`, `app/pages/confirmation.dc.html:120`, `:130` —
  the hard-coded 24 h free-cancellation string. State clearly that the 24 h number is now
  confirmed by decision 2, so this is a maintainability change (make it settings-driven), no
  longer a Law 04 breach.
- *Q21, subprocessor naming*: `app/pages/privacy.dc.html` — the Vercel region pill becomes
  Cloudflare.
- *Decision 4, contact address*: `info@vamostaxi.eu` → `contact@vamostaxi.eu` at
  `app/home/SiteFooter.dc.html:136`, `app/pages/SiteFooter.dc.html:136`,
  `app/pages/contact.dc.html:233`, `app/pages/privacy.dc.html:182` and `:302`,
  `app/pages/imprint.dc.html:200`, `app/vamos-ops-data.js:321`.
- *Law 04 breaches from §D*: C20 at `app/pages/cancellation.dc.html:208` (the 8 seats / 72
  hours figures must become `data-tok` pills, not `data-tok-fig` wrappers); C21 at
  `app/home/HowItWorks.dc.html:196`; C19 at `app/home/HowItWorks.dc.html:205` and the full C19
  site list from §D.
- *§F label normalisation*: the "Refund payout time" / "Change deadline" wordings from step 4.

Close §I with one line: every item here is a copy or fixture change, none of it is in this
pass's diff, and the A5-conditional group is blocked on the owner.
  </action>
  <verify>
    <automated>test -z "$(git status --porcelain -- app design-system assets)" && grep -q '^## I\.' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md && test "$(sed -n '/^## I\./,$p' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md | grep -c 'app/')" -ge 25 && test "$(grep -cE 'Link expiry|Code expiry|Code attempts|Password policy|Record retention|Required permits|Partner vehicle classes|Partner reply time' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md)" -ge 8 && grep -q 'Refund payout time' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md && grep -q 'Change deadline' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md && sed -n '/^## I\./,$p' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md | grep -q 'contact@vamostaxi.eu' && test "$(grep '\*\*RESOLVED' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md | grep -v '^Legend:' | grep -Evc '1[37] Aug 2026')" = 0 && echo PASS</automated>
  </verify>
  <done>§C's heading reads as a subtotal and its answer-touched tokens carry dated annotations; the eight keyless labels are in §F with a stated namespace convention and an explicit flag where sameness is unproven; both duplicate-wording pairs resolve to one existing key each; §F's closing line states three separate figures and admits the sets are unmatched; §H's 7/8 fixture is marked superseded and §G's Business-capacity gap is tied to the A13 residual; and §I lists every contradicted mock site by file and line. `git status` shows one modified file.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| this checklist → `app/` legal pages | Values recorded here are what Phase 1 find-replaces into consumer-facing legal copy. A wrong value crosses into a document with legal effect. |
| `OWNER-ANSWERS.md` → this checklist | The only authority for a value in this pass. Anything written here that is not traceable to it (or to an archive reference already present) is fabricated. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-wxa-01 | Tampering | a `**RESOLVED**` marking with no source | high | mitigate | Every RESOLVED marking must carry its decision number and `13 Aug 2026` or `17 Aug 2026`; the automated gate in all three tasks fails the task if any RESOLVED line lacks one of those two dates. |
| T-wxa-02 | Information disclosure | inventing a value to close a gap (CHF figure, address, capacity, policy number) | critical | mitigate | Values may only be quoted from `OWNER-ANSWERS.md` or already-present archive references; the five residuals stay open with a named owner; #16, #7, #15 and C19–C23 stay `**OPEN**` and are gated by positive greps. |
| T-wxa-03 | Tampering | a docs pass silently editing mocks | medium | mitigate | `git status --porcelain -- app design-system assets` must be empty at the end of every task; the contradicted-mock list is §I, a work order, not a diff. |
| T-wxa-04 | Repudiation | crediting a design-closed conflict to an owner answer | medium | mitigate | Separate `**CLOSED BY DESIGN**` marker for the 7 pre-13-Aug conflicts, deliberately undated to the answer sheet, so the answers are not over-credited. |
</threat_model>

<verification>
Run at the end of the plan, from the repository root:

1. `git status --porcelain` lists `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` and nothing else.
2. `git diff --stat -- app design-system assets` is empty.
3. `grep -c '\*\*RESOLVED' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` is at least 22, and
   `grep '\*\*RESOLVED' … | grep -v '^Legend:' | grep -vc '1[37] Aug 2026'` is 0.
4. `grep -c 'OPEN' docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` is at least 9 (A6, #7, #15, #16,
   C19–C23).
5. Read the §A residual register and §D's closing split aloud against
   `docs/build/OWNER-ANSWERS.md`: five residuals, 23 conflicts split 7 resolved / 7 closed by
   design / 1 mocks-stale / 8 open.
6. Section letters A, B, C, D, E, F, H, G still appear in their original order, with I appended.
</verification>

<success_criteria>
- Stream 1's "done when" is met: the checklist states, per item, resolved-or-open with
  evidence, and the headline counts are correct rather than stale.
- The file says five residuals survive and names BLOCKER-SOLVE-PLAN.md's prediction of three as
  wrong — the count is not rounded down to match the brief.
- No CHF figure, policy number, capacity, address, company detail or date has been invented.
  Every value written traces to `OWNER-ANSWERS.md` or to an archive reference already in the
  file and still labelled as archive evidence.
- No file under `app/`, `design-system/` or `assets/` is modified.
- §I is complete enough to be handed to the copy-edit pass as its work order without a
  follow-up question, with the A5-conditional group clearly marked as blocked.
- The diff is reviewable: additions in place inside existing tables, one new block under §A,
  five new rows on the §D table, one appended section.
</success_criteria>

<output>
Create `.planning/quick/260818-wxa-stream-1-blocker-reconciliation-mark-eve/260818-wxa-SUMMARY.md` when done.

The summary must carry forward, for Stream 3 (the Client Input Pack): the five residuals with
their owners, the eight `**OPEN**` conflicts, and the note that C19–C21 are live consumer
promises asserted as fact — those are the items a copy pass must fix before launch, not after.
</output>
