You run Phase 20, the security check of the changed app, for Vamos Taxi.

Read `.planning/prompts/00-common-rules.md` on main first and follow it.

YOUR JOB
Phase folder on main: `.planning/phases/20-security-audit-fixup/`. Read `20-CONTEXT.md`
(D-15 to D-20), `20-RESEARCH.md`, `20-UI-SPEC.md`, `20-VALIDATION.md` and plans 20-06 to 20-09.
Plans 20-01 to 20-03 are done; 20-04 and 20-05 are superseded. The owner signed on 2026-09-29.

Folder `/Users/koss/Developer/vamos-wt/phase-20`, branch `gsd/phase-20-security-check`, cut from
origin/main.

THE OWNER STARTED THIS PHASE EARLY, on 2026-09-30. The signed order put it after 26.2. Other
sessions are still changing checkout, accounts and the cookie banner. So:
- Plan 20-06, THE CHECK, runs now. It is reading and probing, not editing. Check what is live
  today, and say for each finding which commit and which Worker version you checked.
- Plans 20-07 and 20-08, THE FIXES, wait for the control session. A fix in a file another
  session is editing is described and sent to the control session, which routes it. You may fix
  now only in files no other session touches; ask the control session when unsure.
- When 26.5 and Phase 27 have shipped, you check them too before 20-09.

LEADS FROM THE CONTROL SESSION, each to confirm or dismiss with evidence
1. RLS policy `bookings_select_own` trusts the e-mail inside the sign-in token and has no filter
   on status. Safe only while sign-in needs a confirmed e-mail. 26.5 plan 10 hides unpaid
   bookings; check the rest.
2. "This e-mail already has an account, sign in first" on checkout (26.5) can reveal who is a
   customer.
3. `SUPABASE_SERVICE_ROLE_KEY` is on the public Worker since 2026-09-29 (owner decision). Read
   on main by `apps/web/lib/supabase/service.ts` (staff digest) and
   `apps/web/app/[locale]/(ops)/api/staff/invite/route.ts`. Test where it is read and that it
   never reaches a browser, a log or a response.
4. `POST /api/checkout/intent` checks Origin but has no limit per visitor and no Turnstile.
5. Automatic refunds refuse an `sk_live_` key (`apps/web/lib/lifecycle/paid-cancel.ts`).
6. `manage_booking_extras` accepts any unrevoked, unexpired access token; check whether a pay
   token can read the driver's phone.
7. The hourly purge deletes unpaid bookings for real since 2026-09-29; check the eligibility
   rule against a booking whose payment is complete at Stripe but not yet recorded.
8. The pages served as mocks load React, ReactDOM and Babel from unpkg at run time.

OWNER RULES FOR THIS PHASE
- Live probes may create up to 10 test bookings on vamostaxi.site, named so he can find them.
  He removes paid ones himself.
- Serious findings are fixed in this phase without asking again, within the file rule above.
  Every other finding is one question to him.
- Never attack, flood or scan anything but vamostaxi.site and dashboard.vamostaxi.site, and
  never in a way that stops a customer from booking. No test that needs a secret value.
