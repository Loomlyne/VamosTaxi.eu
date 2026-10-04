---
worktree: /Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-ad892723ff45e1689
branch: fix/auth-cookie-rename
commit: 490d1a51
lab: cookie
evidence: /Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-ad892723ff45e1689/.planning/quick/261004-auth-cookie-rename/evidence
---

# Test brief: the sign-in cookie is named vt-auth, old sb-*-auth-token cookies are cleared

Written by the lead (Opus); run by `vamos-tester` (Sonnet). Run it exactly; reply with PASS / FAIL / BLOCKED per step.

## What changed

The Supabase sign-in cookie was named `sb-<project ref>-auth-token` (plus `.0/.1` chunks and `-code-verifier`). It is now
`vt-auth` (`vt-auth.0`, `vt-auth.1`, `vt-auth-code-verifier`). Any request that still carries an old `sb-…-auth-token…`
cookie gets it expired (Set-Cookie Max-Age=0) on that answer; the visitor is simply signed out. Files: `apps/web/lib/supabase/cookies.ts`,
`apps/web/lib/supabase/server.ts`, `apps/web/middleware.ts`, `apps/web/worker.ts`.

## Gates

Skip `lab.sh gates` (the lead runs the full gates once). The lab is ALREADY UP (`lab.sh up cookie` was run by the lead; run it again only
if `lab.sh status cookie` says it is down). Do not run `down` or `destroy` at the end; the lead does.

## Setup beyond the lab

A confirmed customer already exists in the lab copy: e-mail `cookie-lab@example.com`, password `Lab-cookie-2026!` (lab-only test account).
Old cookie values to plant (fake, any value works): names
`sb-yaumjzvylngfjhtuffqs-auth-token.0`, `sb-yaumjzvylngfjhtuffqs-auth-token.1`, `sb-yaumjzvylngfjhtuffqs-auth-token-code-verifier`,
each value `old`, path `/`, on the host of the page under test (`localhost` for public, `dashboard.localhost` for the dashboard).
Plant them with Playwright `context.addCookies` BEFORE the first navigation of that step.

Cookie checks read `context.cookies()` (names only; never print values in the reply).

## Steps

| id | viewport | language | action in plain words | expected result |
|---|---|---|---|---|
| C1 | 1440 | en | Fresh browser, plant the three old cookies for `localhost`, open `BASE + "/"` | page status 200, no page error; afterwards `context.cookies()` has NO name starting `sb-`; `GET BASE/api/auth/session` (same context, `page.request`) answers `signedIn:false` |
| C2 | 1440 | en | Same browser: open `/sign-in`, sign in with the lab customer's e-mail and password (password tab/field). If the site lands on a "Finish your account" step, tick the box, fill any missing name with "Cookie Lab" and finish | leaves `/sign-in`; `/api/auth/session` answers `signedIn:true`; `context.cookies()` has a cookie named `vt-auth` or `vt-auth.0` and no name starting `sb-`; no cookie name contains `yaumjzvylngfjhtuffqs` |
| C3 | 1440 | en | Same browser: open `/account` | status 200, no page error, the page shows `cookie-lab@example.com` somewhere (account details), screenshot `C3` |
| C4 | 1440 | en | Same browser (still signed in): plant the three old cookies again for `localhost`, then open `/account` | still signed in (`/api/auth/session` `signedIn:true`), the `vt-auth*` cookie is still there, no name starting `sb-` remains |
| C5 | 1440 | en | Same browser: sign out through the site's own sign-out control (account page or header menu) | `/api/auth/session` answers `signedIn:false`; no cookie named `vt-auth` or `vt-auth.N` with a non-empty value remains |
| C6 | 390 | en | Fresh browser at 390 px, plant the old cookies, open `/account` | no 500 (status 200 or a redirect to sign-in); no name starting `sb-` remains; not signed in |
| D1 | 1440 | en | Fresh browser, plant the three old cookies for `dashboard.localhost`, open `DASH + "/login"` | status 200, login form visible, no page error; no cookie name starting `sb-` remains |
| D2 | 1440 | en | Same browser: `dashboardSignIn(s)` (lab admin). If an authenticator-code step appears, report BLOCKED for D2-D3 with a screenshot (the lab admin has no authenticator app) | URL leaves `/login`; `context.cookies()` has `vt-auth` or `vt-auth.0` for `dashboard.localhost`, no name starting `sb-` |
| D3 | 1440 | en | Same browser: open the dashboard's New trip screen (the "New trip" control in the sidebar or on the trips board; or `DASH + "/new-trip"` if no control is found) | the New trip form renders (a From/pickup field is visible), no page error, screenshot `D3` |
| D4 | 1440 | en | Same browser: plant the three old cookies for `dashboard.localhost` again, reload the current page | still signed in to the dashboard (URL not `/login`), no name starting `sb-` remains |

## Out of scope

Design, copy, the `/cookies` page text (it still names the old cookie on purpose; another branch edits it), prices, payments, the live site.

## Stop conditions

Report BLOCKED when: the lab is down and `lab.sh up cookie` fails; the customer sign-in answers anything other than signed-in or the finish step
twice in a row; a Worker drops after one restart. Never edit product code, tests or this brief.
