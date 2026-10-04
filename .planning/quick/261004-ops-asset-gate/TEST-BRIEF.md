---
worktree: /Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a27c298ece3746d96
branch: fix/ops-asset-gate
commit: 79225cf8
lab: gate
evidence: /Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-a27c298ece3746d96/.planning/quick/261004-ops-asset-gate/evidence
---

# Test brief: dashboard screen files under /app/ops need a staff session

Written by the lead (Opus); run by `vamos-tester` (Sonnet). Run it exactly; reply with PASS / FAIL / BLOCKED per step; the lead saves the reply as `RESULT.md` in the evidence folder.

## What changed

On the dashboard host, the screen files under `/app/ops/` (ops.dc.html, OpsDetail.dc.html, OpsBoard.dc.html, OpsSettings.dc.html, …) were readable by anyone signed out. Now they are served only to a signed-in admin session (the same rule as the dashboard pages). Two files stay open because the sign-in page needs them before sign-in: `/app/ops/support.js` and `/app/ops/AuthForm.dc.html`. Every other `/app/ops/*` path answers an empty 404 with `cache-control: private, no-store` when signed out. The dashboard pages (`/login`, `/dashboard`, `/bookings`, `/bookings/<ref>`) now read their page file from the assets binding, not over HTTP. Files: `apps/web/worker.ts`, `apps/web/middleware.ts`, `apps/web/lib/ops/asset-gate.ts`, `apps/web/lib/ops/session.ts`, `apps/web/lib/supabase/request.ts`, `apps/web/lib/dc-mock-urls.ts`.

## Gates

Skip `lab.sh gates` (the lead runs the gates). The lab is ALREADY UP (`lab.sh up gate` was run by the lead; run it again only if `lab.sh status gate` says it is down). Do not run `down` or `destroy`; the lead does.

## Setup beyond the lab

none. Load the lab variables first: `eval "$(scripts/test-lab/lab.sh env gate)"` from the worktree. Use `scripts/test-lab/lab-browser.mjs` (`start`, `open`, `dashboardSignIn`, `step`, `finish`, `db`). Write the step script in the evidence folder (for example `evidence/gate-proof.mjs`), never in `apps/` or `scripts/`.

For every browser step, record on the page:
- console messages of type `error` (`page.on("console")`, keep `msg.type() === "error"`), and page errors (`s.errors`);
- every response whose URL path starts with `/app/ops` (`page.on("response")`): path and status.

"0 console errors" means no console message of type `error` and no page error. List any you see in the reply (first 150 characters each).
Never print the admin password or any cookie value in the reply.

## Steps

| id | viewport | language | action in plain words | expected result |
|---|---|---|---|---|
| G1 | 1440 | en | Fresh browser (signed out). Open `DASH + "/login"`, wait for network idle | status 200; an e-mail field and a password field are visible; 0 console errors; the `/app/ops` responses are exactly `/app/ops/support.js` and `/app/ops/AuthForm.dc.html`, each 200 (list them); no response anywhere on the page has status 404; screenshot `G1` |
| G2 | — | — | Same context, signed out: `page.request.get(DASH + path, { maxRedirects: 0 })` for each path: `/app/ops/ops.dc.html`, `/app/ops/ops-login.dc.html`, `/app/ops/ops.html`, `/app/ops/OpsDetail.dc.html`, `/app/ops/OpsBoard.dc.html`, `/app/ops/OpsSettings.dc.html`, `/app/ops/OpsSidebar.dc.html`, `/app/ops/OpsTable.dc.html` | every one: status 404, empty body, header `cache-control` is `private, no-store` |
| G3 | — | — | Same context: `page.request.get(DASH + "/app/ops/support.js")` and `DASH + "/app/ops/AuthForm.dc.html"` | both 200 with a non-empty body |
| G4 | — | — | Same context: repeat G2's paths with the extra request header `x-vamos-dc-asset: 1` | every one still 404 |
| G5 | 1440 | en | Same browser: `dashboardSignIn(s)` (lab admin) | URL leaves `/login` (lands on `/dashboard`); the dashboard sidebar is visible (text "Dashboard" or "Trips" in the left navigation); 0 console errors; every `/app/ops` response during this step is 200 (list path and status; give the count); screenshot `G5` |
| G6 | 1440 | en | Same browser: open `DASH + "/bookings"`, wait for network idle | the trips board renders (a table with rows, or the board's empty message); 0 console errors; every `/app/ops` response is 200 (list them, give the count); screenshot `G6` |
| G7 | 1440 | en | Same browser: open one booking detail. Click the first booking row on the board; if there is none, use `db("select reference from public.bookings order by created_at desc limit 1")` and open `DASH + "/bookings/" + reference` | the booking detail renders and shows its reference (`VT-…`); 0 console errors; every `/app/ops` response is 200 (list them, give the count); screenshot `G7` |
| G8 | — | — | Same context, signed in: `page.request.get(DASH + "/app/ops/OpsDetail.dc.html")` and `DASH + "/app/ops/ops.dc.html"` | both 200, non-empty body, `cache-control` is `private, no-store` |
| G9 | 1440 | en | Same browser: sign out with the dashboard's own sign-out control (sidebar or profile menu; look for "Sign out" / "Log out") | URL ends on `/login`; then repeat G2's `page.request.get` list: every one 404 again; `context.cookies()` has no cookie named `vt-auth` or `vt-auth.N` with a non-empty value |
| G10 | 390 | en | Fresh browser at 390 px: open `DASH + "/login"`, then `dashboardSignIn(s)`, then wait for network idle on `/dashboard` | login renders with 0 console errors; after sign-in the dashboard renders, 0 console errors, no `/app/ops` response other than 200; screenshot `G10` |
| P1 | 1440 | en | Fresh browser: `page.request.get(BASE + path)` for `/app/ops/OpsDetail.dc.html`, `/app/ops/support.js`, `/app/ops/AuthForm.dc.html` (public host) | each 404 |
| P2 | 1440 | en | Same browser: open `BASE + "/"` and `BASE + "/terms"` | each status 200, the page shows its heading, 0 page errors |
| P3 | — | — | `page.request.get(BASE + "/app/pages/terms.dc.html", { maxRedirects: 0, headers: { "sec-fetch-dest": "document", "x-vamos-dc-asset": "1" } })`, then the same without the `x-vamos-dc-asset` header | both answers have the same status (a 308 to `/terms`) and the same `location` |
| P4 | — | — | `page.request.get(DASH + "/login/confirm")` | status 200, body contains `<html` |

## Out of scope

Design, copy, translations, prices, payments, every other dashboard screen, the live site. Do not judge the look of any page.

## Stop conditions

Report BLOCKED when: the lab is down and `lab.sh up gate` fails; the admin sign-in shows an authenticator-code step (the lab admin has none); a Worker drops after one restart. Never edit product code, tests or this brief.
