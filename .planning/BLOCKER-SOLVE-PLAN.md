# Blocker solve — plan for a dedicated session

**Written:** 2026-08-17
**Purpose:** close every blocker that can be closed without the client, and reduce what
remains to one sheet the client answers in a single sitting — so Phase 1 starts with no
invented numbers anywhere.

## The honest split

Blockers are not one pile. They are three, and only two of them are solvable by a working
session.

| Kind | Count | Solvable in-session? |
|---|---|---|
| **Decisions** — someone must choose, the answer is not a fact about the world | 15 listed, **12 already answered** on 13 Aug | Yes, for the engineering-shaped ones |
| **Conflicts** — two documents assert different things | 18 registered | Yes, by applying the answers already given |
| **Data** — facts only the business has: UID, address, prices, photos, insurance | ~90 tokens, 18 legal-text slots, 10 photography slots | **No.** These get an instrument, not an answer |

Nothing below invents a CHF figure, a policy number, a capacity or a company detail. A gap
that cannot be closed keeps its `data-tok` pill and gains a named owner and a fallback.

---

## Stream 1 — Reconcile what is already answered

The owner answered 15 content decisions on 13 Aug. Those answers have not yet been pushed
back through the documents that were written before them, so the checklist still shows
conflicts that are in fact settled.

1. Walk `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` §A (15 decisions), §D (18 conflicts)
   and §C (73 tokens by page) against `docs/build/OWNER-ANSWERS.md`.
2. Mark each resolved item **resolved, with the answer and its date**. Leave genuinely open
   items open — do not close one by inference.
3. Produce the true remaining count. Expect roughly: A3 (full street address), A6 (analytics
   tool), and the driver-no-show share within A2.
4. Where an answer contradicts existing mock copy, list the file and line that must change —
   but **do not edit the mocks in this stream**. Editing copy is a separate, reviewable pass.

**Done when:** the checklist states, per item, resolved-or-open with evidence, and the
headline counts at the top of the file are correct rather than stale.

## Stream 2 — Decide every engineering-decidable question

Eleven questions in `docs/build/OPEN-QUESTIONS.md` are still blank. Most are engineering
choices wearing a question mark, and waiting on the client for them is wasted time.

Decide, record as a short ADR in `.planning/`, and fill the answer line:

| Q | Question | Who really decides |
|---|---|---|
| Q8 | Waiting allowances — seed NULL or 60/15 | Engineering. NULL keeps the TBC pill honest; 60/15 is an unverified archive figure |
| Q9 | Booking reference format | Engineering. `VT-####` runs out at 9999; changing it after launch leaves two formats in circulation |
| Q12 | Per-currency pricing — genuine or display-only | Engineering. `VamosLocale` swaps the mark and never the number, and Stripe charges CHF |
| Q15 | Hard-coded cancellation promise in checkout | Now answerable — the owner gave the tiers, so the string becomes settings-driven |
| Q17 | Corporate pay-by-invoice | **Already decided**: out of V1, hidden, kept in planning. Just record it |
| Q20 | Return trips — two one-ways, discounted round trip, or one booking with two legs | Engineering, and it is a schema decision that Phase 2 needs |
| Q24 | Data residency of edge processing | Needs counsel — but engineering proposes the default and states the cost of each option |
| Q26 | Review import | **Already decided**: post-launch, tracked as LATER-02 |

Leave for the owner, because they are visible or personal: **Q4** (Qurova licence — see
Stream 4), **Q10** (staff names and emails), **Q25** (phone verification and social sign-in
buttons — removing them changes a screen).

**Done when:** every one of those has either an answer line with a rationale, or an explicit
"owner must answer" with the reason it cannot be decided internally.

## Stream 3 — The Client Input Pack

This is the deliverable that actually unblocks the business. One document, written for a
non-technical reader, that converts ~90 scattered tokens into a sitting's work.

Rules that make it answerable rather than intimidating:

- **Group by what the client knows**, not by which page the token lives on. "Your company
  details" · "Your prices" · "Your policies" · "Your photos" · "Your accounts and links".
- **Every item carries a recommended default** where one is defensible, so the client
  approves or corrects rather than composes from nothing. Mark clearly where there is no
  defensible default and the answer must come from them.
- **State the consequence of leaving it blank** — which page shows a TBC pill, or which
  feature cannot go live. This is what converts "I'll get to it" into a decision.
- **Separate what blocks launch from what does not.** The CHF matrix blocks go-live. A
  Trustpilot URL does not.
- Include a **photography shot list** — 10 slots, each with what it is for and where it
  appears, so a single shoot covers all of them.
- Keep it in English (internal), and note which answers will need professional translation
  once given.

**Done when:** one file, sendable as-is, that a non-technical person can complete without a
follow-up call — plus a one-page summary of the four or five items that block launch.

## Stream 4 — Qurova webfont licence

Blocker 5, and the only one that can break the brand at deploy time. The sole licence on
file (`design-system/assets/fonts/OFL.txt`) covers Poppins.

1. Establish the actual provenance of the Qurova files in `design-system/assets/fonts/`.
2. Determine what a web licence for the intended traffic costs and whether one is already
   held.
3. Prepare the fallback **before** it is needed: which available display face preserves the
   brand at the sizes Qurova is used, with a rendered comparison. That is a visual change,
   so it is the owner's call — but the owner should be choosing between two rendered
   options, not being asked an abstract question under time pressure.

**Done when:** either the licence is confirmed, or a rendered fallback is on the table with
a recommendation.

## Stream 5 — Translation

604 lines of untranslated strings, mostly legal.

1. **Split the backlog**: product strings (buttons, hints, errors, empty states) versus
   long-form legal text. They have completely different pipelines.
2. **Draft the product strings** in DE, FR and AR. Swiss German — "ss", never "ß". These do
   not need a professional; they need care and consistency with the existing dictionary.
3. **Scope the legal package** for a professional translator: exact word count, which pages,
   which four languages, and the note that terms and privacy carry legal effect and should
   not be machine-translated.
4. Until legal text is professionally translated, the affected pages keep `data-vt-legal`
   and the runtime says so rather than pretending.

**Done when:** product strings are drafted and in the dictionary; the legal package is
specified and ready to send for a quote.

---

## Sequencing

Streams 1 and 2 first and in that order — Stream 1 tells Stream 3 what is genuinely still
missing, and Stream 2 removes questions that never needed the client. Stream 3 follows from
both. Streams 4 and 5 are independent and can run at any point.

## Definition of done for the whole session

1. Every `data-tok` pill traces to either **a real value**, or **a named owner plus a
   fallback plus what it blocks**.
2. Every question in `OPEN-QUESTIONS.md` has an answer or an explicit reason it cannot be
   answered internally.
3. The conflicts register shows no conflict that the 13 Aug answers already settle.
4. One client-ready input pack exists, sendable without editing.
5. **No CHF figure, policy number, capacity, address or company detail has been invented** —
   anywhere, including in tests, seeds and fixtures.

## What this session will NOT achieve, and why

The client's own facts. A UID number, an insurance policy, a registered company name, a
street address, the CHF price matrix and ten photographs are not knowable from inside the
repo, and guessing any of them is explicitly forbidden by `CLAUDE.md` — a wrong number in a
legal page is worse than a visible gap. Those leave the session as a filled-in request, not
as answers.
