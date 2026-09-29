You run Phase 19, the 10,000-booking surge proof, for Vamos Taxi.

Read `.planning/prompts/00-common-rules.md` on main first and follow it.

YOUR JOB
Phase folder on main:
`.planning/phases/19-v1-production-close-out-leftover-live-gates-and-10k-booking-/`. Read
`19-CONTEXT.md` (D-01 to D-14), `19-RESEARCH.md`, `19-UI-SPEC.md`, `19-VALIDATION.md` and plans
19-01 to 19-05. The owner signed on 2026-09-29.

Folder `/Users/koss/Developer/vamos-wt/phase-19`, branch `gsd/phase-19-surge-proof`, cut from
origin/main.

THE OWNER STARTED THIS PHASE EARLY, on 2026-09-30. The signed order put it last, after 26.0,
26.2 and 20, because it proves the final checkout. The checkout is still being changed by
26.4.2 and 26.5. So this phase is split:

NOW
1. Plan 19-03, the owner's paid setup. Two steps cost money and only he can take them:
   subscribe the Cloudflare account to Workers Paid, and create a copy of the database in
   Supabase by restoring a backup into a new project. Write each as one numbered action with
   the exact words to click, show him the cost BEFORE he takes the step, and wait. His standing
   rule: no paid add-ons for practice, so propose the cheapest way and the smallest size that
   still proves the point. Never restore onto the live project.
2. Plan 19-01, the test switches, only the parts that live in files of their own: the hidden
   Worker `vamos-surge` configuration, the fake-Stripe switch and the secret header that skips
   the quote limit. The live Worker must refuse to start with either switch on; prove that
   with a test. The test Worker sends no e-mail, because the copy holds real addresses.
3. The load script and the machine question (his Mac, or a second machine if it cannot open
   10,000 connections). Ask him once.

WAIT, until the control session says 26.4.2 and 26.5 have shipped
4. Plan 19-02, "Busy, trying again" on PAY. It edits `/checkout`, which other sessions own now.
   The words need four languages; ask the control session for the approved wording.
5. Plan 19-04, the burst and the 200 real sandbox payments. Running it before the checkout is
   final proves the wrong code.
6. Plan 19-05, tear-down.

PASS BAR, from the signed context: all 10,000 end on "Booked" within 5 minutes, nothing lost,
nothing charged twice, no total wrong.

BEFORE REAL LAUNCH, put to the owner: automatic refunds refuse an `sk_live_` key
(`apps/web/lib/lifecycle/paid-cancel.ts`), so the Cancellation page becomes untrue the day live
keys go on.

NEVER run load against vamostaxi.site or the live database. Stripe's sandbox allows 25 requests
a second; pace the real payments under it.
