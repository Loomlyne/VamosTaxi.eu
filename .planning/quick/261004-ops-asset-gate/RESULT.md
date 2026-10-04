# Result: dashboard screen files under /app/ops need a staff session

Run by `vamos-tester` (Sonnet) on lab `gate` (native Supabase, public http://localhost:4710, dashboard http://dashboard.localhost:4711),
commit `79225cf8`, 2026-10-04 18:38 and 18:50 +04. Saved by the lead. Scripts and screenshots: `evidence/` (`gate-proof.mjs`,
`extra-proof.mjs`, `results.json`, `ops-responses.json`, `extra/`, `example/`).

## Brief steps (first run, 18:38)

| step | result | evidence |
|---|---|---|
| G1 | FAIL (console noise, not /app/ops) | `/login` 200, e-mail + password fields. `/app/ops` responses exactly `support.js` 200 and `AuthForm.dc.html` 200. Console errors 2: 404 `/photos/site/ops-login-bg.jpg` (the lab has no R2 photos) and 401 `GET /api/staff/me` (AuthForm's signed-out step-up probe, `app/ops/AuthForm.dc.html:340`). Attributed in X3 |
| G2 | PASS | signed out, `ops.dc.html`, `ops-login.dc.html`, `ops.html`, `OpsDetail`, `OpsBoard`, `OpsSettings`, `OpsSidebar`, `OpsTable`: each 404, empty body, `private, no-store` |
| G3 | PASS | `support.js` 200 (65,807 B), `AuthForm.dc.html` 200 (47,373 B) |
| G4 | PASS | G2's eight paths with `x-vamos-dc-asset: 1`: each still 404 |
| G5 | FAIL (same noise as G1) | admin sign-in lands on `/dashboard`, sidebar shown; `/app/ops` 5 responses, all 200 (`support.js`, `AuthForm`, `OpsSidebar`, `OpsDash`, `BrandSelect`); console errors = G1's two, from the `/login` load |
| G6 | PASS | `/bookings` 200, empty board message (no bookings yet); `/app/ops` 3 responses, all 200 (`OpsBoard`, `OpsSidebar`, `OpsTable`); 0 console errors |
| G7 | BLOCKED | no booking in the lab; rerun as X2 |
| G8 | PASS | signed in: `OpsDetail.dc.html` 200 (187,284 B), `ops.dc.html` 200 (32,565 B), both `private, no-store` |
| G9 | PASS | sign-out from the profile menu → `/login`; G2's eight paths 404 again; `vt-auth` empty, no `vt-auth.N` |
| G10 | FAIL (same noise as G1) | 390 px: login and dashboard render; `/app/ops` 7 responses, all 200; console errors = G1's two, once per `/login` load |
| P1 | PASS | public host `OpsDetail.dc.html`, `support.js`, `AuthForm.dc.html`: each 404 |
| P2 | PASS | `/` 200 and `/terms` 200 with their headings, 0 page errors (home: 5 photo 404s + 1 ERR_INVALID_URL console lines, lab has no R2 photos) |
| P3 | PASS | `/app/pages/terms.dc.html` as a document, with and without `x-vamos-dc-asset`: both 308 to `/terms`, same `location` |
| P4 | PASS | `/login/confirm` 200, HTML |

## Extra steps from the lead (18:50)

| step | result | evidence |
|---|---|---|
| X1 | PASS | `scripts/test-lab/example-booking.mjs`: 7 pass, 0 fail; lab bookings 3; newest `VT-26-0003` |
| X2 | PASS | admin, `/bookings/VT-26-0003`: detail shows `VT-26-0003`; `/app/ops` 3 responses in the detail load, all 200 (`OpsSidebar`, `OpsDetail`, `ActionsMenu`); page errors 0. Console: the sign-in window's two (above) and one 404 `/assets/icons/route.svg` (the detail uses `Icon name="route"`, `app/ops/OpsDetail.dc.html:178`; no `route.svg` is vendored in `assets/icons/`; on main too, not this change) |
| X3-G1 | PASS | signed-out `/login` with `/photos/**` stubbed: the only response >= 400 is `GET /api/staff/me` 401; `/app/ops` = `support.js` 200, `AuthForm.dc.html` 200 |
| X3-G10 | PASS | 390 px login + sign-in + `/dashboard`, photos stubbed: only >= 400 is `GET /api/staff/me` 401 (once per `/login` load); `/app/ops` 7 responses, all 200 |

## Lead's reading

- Every `/app/ops` request the browser made, signed out and signed in, at 1440 and 390, was 200. Signed out only the two allow-listed files load.
- The remaining console errors all come from outside `/app/ops` and are not caused by this change: the R2 photo the lab lacks, AuthForm's signed-out
  `/api/staff/me` probe (401 by design), and a missing `route.svg` icon on the booking detail.
