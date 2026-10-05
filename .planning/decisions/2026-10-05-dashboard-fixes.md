# Dashboard fixes — owner decisions (2026-10-05, question form)

Job `fix/dashboard-fixes` (U8–U11 of `.planning/audits/2026-10-05-repo-investigation.md`). Pictures: `.planning/quick/261005-dashboard-fixes/screens/u11-*` (the owner was sent OpsBoard toolbar and OpsDetail "Keep it", before and after, 1440).

| # | Question | Answer (verbatim choice) |
|---|---|---|
| 1 | Dashboard buttons show as plain grey browser buttons (`variant="outline"` has no style in the design system). Make all 26 white with a thin grey line? | "Yes, all 26 white with a line (Recommended)": `ghost` for all 26 |
| 2 | A red error message now stays until closed; green "Saved" messages still go after about 4 seconds. Keep that? | "Yes, errors stay until closed (Recommended)" |

Controller decisions (no owner question): a class taken off sale shows its own name on the board, fleet and Money in (true data; before it showed as Economy); the "You were signed out" message and return-to after a dead session are a later job (new copy in four languages); the 5 s Auth timeout not cancelling the request is accepted.
