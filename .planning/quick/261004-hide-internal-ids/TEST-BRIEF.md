---
worktree: /Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-acc772106f447cb8c
branch: fix/hide-internal-ids
commit: (tip at dispatch; `git -C <worktree> log --oneline -1`)
lab: hide-ids
evidence: /Users/koss/Developer/VamosTaxi.eu/.claude/worktrees/agent-acc772106f447cb8c/.planning/quick/261004-hide-internal-ids/evidence/lab
---

# Test brief: review link token by cookie, public message set, no internal header — on a local Worker build

Written by the lead (Opus); run by `vamos-tester` (Sonnet). Run it exactly; reply with PASS / FAIL / BLOCKED per step.

## What changed

- F1: `GET /review?token=…` is answered by middleware with a 302 to `/review` (token removed from the URL) and an
  HttpOnly cookie `vt_review` (Secure, SameSite=Lax, Path=/review, Max-Age 2592000). The review page reads the
  token from the query first, then that cookie. Files: `apps/web/middleware.ts`, `apps/web/lib/reviews/review-cookie.ts`,
  `apps/web/app/[locale]/review/page.tsx`, `ReviewForm.tsx`.
- F7: the locale layout ships only public message namespaces to the browser (`apps/web/lib/i18n/client-messages.ts`).
- F9: the Worker removes `x-middleware-set-cookie` from responses (`apps/web/worker.ts`).

## Gates

Skip `lab.sh gates` (the lead ran the full gates on this tip). Build the lab Worker from this worktree.

## Setup beyond the lab

1. `scripts/test-lab/lab.sh up hide-ids` from the worktree (native runtime). Use its slot ports; never kill a process you did not start.
2. Make one booking reviewable, lab database only (`db()` helper from `scripts/test-lab/lab-browser.mjs`, or psql to the lab's own port):
   - Take any booking in the lab (if none: run `node scripts/test-lab/example-booking.mjs <evidence>/example` once to create one).
   - Make it reviewable: `status` must not be quote/pending/cancelled/partially_cancelled (set it to `'paid'`), and it needs one
     `public.booking_payments` row with `status = 'succeeded'` (insert one; read the table's columns with `\d public.booking_payments`
     and fill the required ones with the booking's own values; amount any positive integer).
   - Insert the review token (purpose 'manage', never expires):
     `insert into public.booking_access_tokens (booking_id, token_hash, purpose, expires_at) values (<booking id>, decode('ae216c2ef5247a3782c135efa279a3e4cdc61094270f5d2be58c6204b7a612c9','hex'), 'manage', 'infinity') on conflict do nothing;`
   - The raw token for the link is `AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA`.
   - Make sure no `public.reviews` row exists for that booking (delete it if a previous run made one).

## Steps

`<PUB>` = the lab's public Worker base URL (`lab.sh env hide-ids`).

| id | viewport | language | action in plain words | expected result |
|---|---|---|---|---|
| S1 | — | — | `curl -sS -D - -o /dev/null "<PUB>/review?token=AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA"` | status 302; `location` ends in `/review` with no `token=`; one `set-cookie: vt_review=AQID…` with `HttpOnly`, `Secure`, `SameSite=lax`, `Path=/review`, `Max-Age=2592000`; **no** `x-middleware-set-cookie` header |
| S2 | — | — | `curl -sS -D - -o /dev/null "<PUB>/manage-booking?token=abc"` | status 302, `set-cookie: vt_manage=abc…`, **no** `x-middleware-set-cookie` header |
| S3 | 1440 | en | In Chromium open `<PUB>/review?token=AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA` | address bar ends in `/review` (no token); the review form (stars, comment, submit) shows, not "We could not find this booking"; screenshot `S3.png` |
| S4 | 1440 | en | Reload the page (F5) | still `/review`, form still shows; screenshot `S4.png` |
| S5 | 1440 | de | Switch the language to Deutsch with the header switcher, as a visitor would | page in German, form still shows, URL has no token; screenshot `S5.png` |
| S6 | 390 | ar | New context: open the token link at 390, switch to Arabic | form shows, `dir=rtl`, no sideways scroll; screenshot `S6.png` |
| S7 | 1440 | en | Back in S3's context: 5 stars on each of the three ratings, comment "Lab review", pass Turnstile (lab stand-in), submit | thank-you state shows; `select count(*) from public.reviews where booking_id = <id>` = 1; the POST to `/api/reviews/submit` answered `{"ok":true}` with no other field |
| S8 | — | — | `curl -sS "<PUB>/checkout" -o checkout.html` and search it | the HTML contains none of: `Stripe webhook`, `Refunds to issue`, `Review scaffold`, `Sentry`, `as issued by Supabase Auth` (case-insensitive); it does contain `Cookie` text (page rendered); report the byte size |
| S9 | — | — | `curl -sS "<PUB>/app/vamos-i18n-dict.js" | head -c 400` and `curl -sS "<PUB>/_ds/vamos-taxi-design-system-245af154-0455-4c10-af76-5254642c3786/_ds_bundle.js" | head -c 400`; `curl -sS -o /dev/null -w '%{http_code}' "<PUB>/_ds/vamos-taxi-design-system-245af154-0455-4c10-af76-5254642c3786/readme.md"` | no `/*` developer notes or `@ds-bundle` header at the top of either file; readme.md is 404 |
| S10 | 1440 | en | Open `<PUB>/cookies` and `<PUB>/` in Chromium | no console errors other than network stand-ins; the cookies table shows "Sign-in" over `sb-…-auth-token`; screenshot `S10-cookies.png`, `S10-home.png` |

## Out of scope

Design judgement, prices, the live site, the dashboard. Do not edit product code, tests or this brief.

## Stop conditions

The lab does not come up after one retry; S1 cannot run; the Worker drops twice. Report BLOCKED with the last 30 log lines.
Step S7 may be BLOCKED if the booking cannot be made reviewable in the lab: say exactly which insert failed and why.
When done: `scripts/test-lab/lab.sh down hide-ids` (keep the stack for a rerun; do not destroy).
