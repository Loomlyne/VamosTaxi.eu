# Result: TEST-BRIEF (vamos-tester, Sonnet), commit 490d1a51, lab `cookie`, 2026-10-04 15:17 +04

Saved by the lead from the tester's reply. Script and screenshots: `evidence/` (`steps.mjs`, `results.json`).

| step | result | evidence |
|---|---|---|
| C1 | PASS | Status 200, 0 page errors; only `NEXT_LOCALE` left, no `sb-` cookie; `signedIn:false` |
| C2 | PASS | Left `/sign-in` for `/account/transfers`; `signedIn:true`; cookies `NEXT_LOCALE`, `consent_subject`, `vt-auth`; no `sb-`, none with the project ref |
| C3 | PASS | `/account` 200, 0 page errors, address shown (`evidence/cust-C3.png`) |
| C4 | PASS | Old cookies planted again while signed in: 200, still `signedIn:true`, `vt-auth` kept, 0 `sb-` |
| C5 | PASS | Site's own sign-out: `signedIn:false`, no non-empty `vt-auth*`, lands on `/sign-in` |
| C6 | PASS | 390 px, old cookies, `/account`: 200 then sign-in, 0 `sb-`, not signed in |
| D1 | PASS | Dashboard `/login` 200, form shown, 0 page errors, 0 `sb-` |
| D2 | PASS | Lab admin signs in to `/dashboard`, no authenticator step (lab admin has none); `vt-auth` on `dashboard.localhost`, 0 `sb-` |
| D3 | PASS (screenshot) | New trip is "NEW BOOKING" on `/bookings` → `/bookings/new`; the form renders with Pickup / Drop-off, no page error (`evidence/dash-D3.png`). `results.json` shows red only because the tester's input selector missed unlabeled fields; lead looked at the screenshot |
| D4 | PASS | Old cookies planted again on the dashboard, reload: still signed in on `/bookings/new`, 0 `sb-` |

The empty Vehicle class list in `dash-D3.png` is the lab copy: the lead retired the lab's stand-in price book so the e2e checkout fixture could go live. Not part of this change.

Chunked `vt-auth.0/.1` and `vt-auth-code-verifier` were not produced in the browser run; both are covered by the e2e run (`apps/web/tests/e2e-worker/run.sh`, see HANDOVER).
