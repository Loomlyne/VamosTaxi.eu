# ADR-005 — The checkout cancellation promise becomes a settings-driven string

**Status:** Accepted, 2026-08-19
**Phase:** 4 (checkout)
**Extends:** the "Cancellation tiers 100 % / 75 % / 0 %" row in `.planning/PROJECT.md`'s Key
Decisions table

## Context

Owner decision 2, dated 13 Aug 2026, sets the refund tier boundary at 24 hours before pickup.
That means the 24 h figure rendered at `app/pages/checkout.dc.html:172` ("Fixed price, all
taxes and tolls included. Free cancellation up to 24 h before pickup.") is in fact the correct,
owner-confirmed number — it stopped being a Law 04 breach the moment decision 2 landed, even
though the string itself is still hard-coded English prose outside a `data-tok` pill. Q15 as
originally raised asked whether the hard-coded string may be converted to a settings-driven
one; the tier decision changes the question from "is this number right" (yes, it is) to
"should a fact this important keep living as copy, correct or not."

## Decision

**Convert it to a settings-driven string anyway**, independent of the number already being
correct. The same 24 h promise is not rendered once — it appears at
`app/home/home.dc.html:769` (en), `:886` (fr), `:920` (ar), `app/pages/checkout.dc.html:172`,
and `app/pages/confirmation.dc.html:120` and `:130` — six or more sites spanning four
languages and two page types. A future policy change to the cancellation window would need
every one of those sites found and edited by hand, in every language, and missing one is
conflict 1's failure mode exactly: a page asserting a policy that another page has already
moved past. Per §F rule 1 of `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` — one key, one fact —
this becomes a single settings-driven value that every site reads, not six independently
maintained strings that happen to currently agree.

## Consequences

**Good.** A future change to the cancellation window is one settings update, and every site
that quotes the promise updates together, in every language, by construction rather than by a
find-and-replace across the codebase that has to remember to include the legal pages, the
home page and the confirmation email in the same pass.

**Cost.** Near zero. The string renders the identical number either way today; the only added
cost is one settings lookup on pages that, in the production build, already read from settings
for other fields.

**Stated here, not buried:** `docs/build/OWNER-ANSWERS.md` is internally inconsistent on this
point. Decision 2 states the 24 h tier boundary in the same breath as the refund percentages,
but the same file's page-by-page answer sheet still lists the free-cancellation window as a
separate, distinct blank number under `{FREE_CANCEL_WINDOW}` — as if it were an open question
rather than the number decision 2 already answered. The Stream 1 blocker-reconciliation pass
recorded this inconsistency without resolving it. This ADR resolves it in favour of the
explicit, dated decision — 24 h, from decision 2 — rather than treating the still-blank sheet
entry as evidence the number is unsettled. It does not silently pick a side without saying so,
and it does not claim the inconsistency itself is closed: one line of owner confirmation that
`{FREE_CANCEL_WINDOW}` and the decision-2 boundary are the same 24 h figure is still wanted
before `OWNER-ANSWERS.md` itself is corrected.

**Cost of being wrong.** Also near zero. If a future tier boundary changes, the only exposure
during the gap between the change and this conversion landing is the six-plus sites this ADR
already names, and that list is the same list a manual find-and-replace would have to work
from — nothing is lost by having converted the string first.
