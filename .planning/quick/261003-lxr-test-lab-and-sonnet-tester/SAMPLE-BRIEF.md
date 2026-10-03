---
worktree: /Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/test-lab
branch: feat/test-lab
commit: 0eb9bf07
lab: lxr
evidence: /Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/test-lab/.planning/quick/261003-lxr-test-lab-and-sonnet-tester/evidence/sample
---

# Test brief: the booking funnel at 768 px, a percent voucher, Arabic, and dashboard sign-in

Written by the lead (Opus); run by `vamos-tester` (Sonnet). Run it exactly; reply with PASS / FAIL / BLOCKED per step; the lead saves the reply as `RESULT.md` in the evidence folder.

## What changed

Nothing in the product. This brief proves the test lab itself (`scripts/test-lab/`) on checks its own self-test does not cover.

## Gates

None. Skip `lab.sh gates` for this brief (the lead ran them).

## Setup beyond the lab

none

## Steps

| id | viewport | language | action in plain words | expected result |
|---|---|---|---|---|
| T1 | 768 | en | Home, From Zurich Airport, To Zug, day 10, open prices (tablet uses the booking sheet) | URL path is /checkout and at least 1 class card (`[data-co-class]`) shows |
| T2 | 768 | en | On that page choose Economy, fill the traveller, read the PAY label, apply voucher `LABPCT`, read the PAY label again | the second amount is lower than the first and greater than 0 |
| T3 | 768 | en | Press PAY | the intent answer is 200; `/__sessions` has exactly one more session than before T3, and its `amount_total` in rappen equals the second PAY amount × 100 |
| T4 | 390 | ar | Open home in Arabic | `document.documentElement.dir` is `rtl`; `coverage(page, "#book")` count is 0; the page has no horizontal scroll (`scrollWidth <= innerWidth`); screenshot `T4.png` |
| T5 | 1440 | en | Dashboard: sign in with the lab admin | the URL path starts with /dashboard after sign-in; screenshot `T5.png` |
| T6 | — | — | Read the database (read-only `db()`) | `select count(*) from bookings where created_at > now() - interval '30 minutes'` is at least 1 |

## Out of scope

Design judgement, copy, any other page, the live site. Amounts are stand-ins of 1-3 rappen and are never a finding.

## Stop conditions

The lab does not come up; a step cannot be run as written with the helpers of `lab-browser.mjs`; a Worker drops again after one `down`/`up`.
