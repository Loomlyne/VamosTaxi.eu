# Next-session prompt — copy everything below the line

---

You are picking up **Vamos Taxi V1** at `/Users/koss/Developer/VamosTaxi.eu`, repo
`Loomlyne/VamosTaxi.eu`, branch `main`. The design phase is finished, the planning phase is
finished, and no production code exists yet — that is correct. `.planning/` holds
PROJECT.md, REQUIREMENTS.md (80 v1 requirements), ROADMAP.md (11 phases), STATE.md,
research/ and ADR-001.

**Your job this session is to close blockers, not to write application code.** Do not
scaffold Next.js, do not create `apps/web`, do not install anything. The build starts next
session, and it starts clean only if this one succeeds.

## Read first, in this order

1. `CLAUDE.md` — product rules. Constraints, not preferences. It wins any conflict with your
   instincts, and when it does, say so out loud.
2. `.planning/BLOCKER-SOLVE-PLAN.md` — your brief. Five streams, sequencing, definition of
   done. Follow it.
3. `docs/build/OWNER-ANSWERS.md` — what the owner settled on 13 Aug 2026. Authoritative.
4. `docs/build/OPEN-QUESTIONS.md` — 27 questions, 16 answered, 11 blank.
5. `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` — the inventory: 15 blocking decisions,
   18 conflicts, ~90 tokens by page, and a token → i18n key map in §F.
6. `.planning/PROJECT.md` — context, constraints and the decisions already locked.

Skim as needed: `docs/build/SPEC-*.md` (per-screen specs), `docs/build/MISSING-FEATURES.md`,
`app/vamos-i18n-dict.js`.

**Never touch `archive/`.** It holds two frozen snapshots with older copies of the same
filenames. Never read it to resolve an ambiguity. Scope every search to `app/`,
`design-system/`, `assets/`, `docs/`, `.planning/`.

## The one rule that matters most

**Never invent a value.** Not a CHF figure, not a policy number, not a capacity, not an
address, not a company registration, not a date — not even in a test, a seed, a fixture or
an example. A wrong number in a legal page is worse than a visible gap. Every unknown stays
a `data-tok` pill, which renders as a labelled "TBC" and is impossible to mistake for data.

If you find yourself reaching for a plausible-looking number, stop: that is the failure mode
this rule exists to prevent.

## What "done" looks like

1. Every `data-tok` pill traces to a real value, **or** to a named owner plus a fallback
   plus a statement of what it blocks.
2. Every question in `OPEN-QUESTIONS.md` has an answer with a rationale, or an explicit
   reason it cannot be answered internally.
3. The conflicts register no longer lists conflicts that the 13 Aug answers already settle.
4. A client-ready input pack exists that a non-technical person can complete in one sitting
   without a follow-up call.
5. Nothing was invented.

## How to work

- Decide the engineering questions yourself. Q8, Q9, Q12, Q15, Q17, Q20, Q24 and Q26 are
  engineering choices or already-made decisions — do not send them to the client. Record
  each as a short ADR in `.planning/` with the rationale and the cost of being wrong.
- Ask the owner only what genuinely needs them: Q4 (Qurova licence), Q10 (staff names and
  emails), Q25 (phone verification and social sign-in — removing those buttons changes a
  screen, so it is a design decision).
- Commit each stream separately with a message explaining what changed and why. Do not
  bundle five streams into one commit.
- If a stream turns out to be blocked or wrong-headed, finish every other stream in full and
  say plainly what you left and why. Do not silently narrow the scope.
- Report honestly. If the conflict reconciliation finds fewer resolved items than expected,
  say so with the evidence rather than rounding up.

## Context you will want

- The owner expects the **CHF price matrix within days**. It gates `pricing_live=true`,
  which is the launch trigger. Everything else is built behind that flag with `CHF 000` on
  screen.
- Timeline is **2–3 weeks to a live public site**, solo with AI assistance. Ops depth,
  hardening and cutover follow go-live.
- There are **173 `data-tok` pills** in `app/` and **604 lines** of untranslated strings in
  `docs/build/i18n-todo.txt`, mostly legal.
- Four languages — English, German, French, Arabic — ship together, always. Swiss German:
  "ss", never "ß". Arabic is first-class RTL.
- **8 commits are unpushed.** Decide with the owner whether to push before starting.

Start with Stream 1. Tell me what you find before you move to Stream 2.
