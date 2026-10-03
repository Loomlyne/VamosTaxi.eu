---
worktree: /Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/<name>
branch: <branch>
commit: <short hash under test>
lab: <name, a-z0-9-, up to 24 characters>
evidence: <worktree>/.planning/quick/<id>/evidence
---

# Test brief: <one line>

Written by the lead (Opus); run by `vamos-tester` (Sonnet). Run it exactly; report PASS / FAIL / BLOCKED per step in `RESULT.md`.

## What changed

One paragraph: what the change does for a customer or the owner, and the files it touches.

## Gates

Default: `scripts/test-lab/lab.sh gates`. Say here if the list differs (extra checks, or a gate to skip and why).

## Setup beyond the lab

Extra SQL for the lab copy only, if any (never live). Write it so it can run twice. Leave this section "none" when the lab's own seed is enough
(classes Economy / Business / Van luxury, live stand-in price book, vouchers `LABFIX` and `LABPCT`, dashboard admin in `admin.txt`).

## Steps

One row per check. The expected result must be something a script can check: text on the page, an amount equal to another amount, a database row
by `select`, a fake Stripe session (`/__sessions`), a mail (`/__mails`), a screenshot to look at.

| id | viewport | language | action in plain words | expected result |
|---|---|---|---|---|
| S1 | 1440 | en | Home, From Zurich Airport, To Zug, day 10, See prices | URL is /checkout, 3 class cards |
| S2 | 390 | de | ... | ... |

## Out of scope

What the tester must not judge or touch (other pages, design, the live site).

## Stop conditions

When to stop and report BLOCKED instead of continuing: the lab does not come up, a step cannot be run as written, a Worker keeps dropping after one restart.
