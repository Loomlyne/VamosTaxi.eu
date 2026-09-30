# Phase 20 hand-over, batch A

**Branch:** `gsd/phase-20-security-check`, folder `vamos-wt/phase-20`. origin/main merged (`4271e802`).
**Not pushed to main, not deployed, no hosted SQL.** Every Phase 20 ship needs the owner's Ship.
Checked against live Worker `a55b2c19` = code `e27014c1` (findings in `20-06-FINDINGS.md`).

## Commits, one finding each (each can be held back)

| Finding | Commit | What |
|---|---|---|
| F1 | `6b104b84` | Migration `20261005100000_manage_token_purpose.sql`: seven manage lookups accept only `purpose = 'manage'`. A pay link no longer opens the booking. |
| F2 | `1c314d1a`, `c7059d34`, `719d4a2a` | Dashboard Support read-only: no PDF viewer, no file preview, no reply box; "Answer by e-mail" opens the admin's mail. The staff file route only downloads (attachment, nosniff, sandbox CSP). `6480ec08` (vendored pdf.js) is superseded and its files are removed. |
| F5, F10 | `135ff1a1` | Migration `20261005110000_security_hardening.sql`: `customer_confirmation_read` derives the customer from the session; the hourly confirmation resend skips test bookings and captures older than 7 days. F14 database item needed no change (`staff_extra_label_upsert` already checks admin; now asserted by a test). |
| F13 | `1d05ed5e` | React, ReactDOM, Babel served from `/assets/vendor/` with the same SRI; `unpkg.com` removed from `script-src`. |
| docs | `fb907a9d` … `b5b46c9e` | Findings, owner decisions, Dependabot triage (41 alerts, none reachable on the Worker), draft plan 20-10 (refunds by hand, unsigned). |

## Checks on `4271e802`

| Check | Result |
|---|---|
| typecheck, lint, lint:css, i18n:check, check:legal-claims, check:numbers, check:public-env, check:db-fences, db:seed:check | all exit 0 |
| build | exit 0 |
| Unit tests (full run) | 2470 pass, 5 fail, 1 skipped. The 5 are 5-second timeouts in `paid-cancel`, `reminder`, `legal-gate`, `bookings-write` tests, files this branch does not touch. Each file passes when run alone; `paid-cancel` also passes on main. |
| pgTAP (isolated stack `vamos-taxi-20`) | 78 files, 1787 tests, 2 fail: `seed_idempotent.test.sql` tests 33 and 36 (content_strings 2660 vs pinned 2626; 94 vs 75). Pre-existing on main: the test pins old counts, `db:seed:check` reports no drift. Not fixed here; belongs to 26.0. |
| From-zero replay | `supabase db reset` applied every migration including both new ones, then the seed. |
| types:check | generated types identical to `packages/db/database.types.ts`. |
| New tests | F1: 20 assertions, 9 failed before, 20 pass after. F5/F10/F14: 13 assertions, 6 failed before, 13 pass after. F2: 5 source tests, failed before. F13: 5 tests, failed before. |
| Independent Opus review of F1, F2, F13 | PASS WITH NOTES, no blocker. |
| F13 browser proof | 13 public mock pages + dashboard login + console boot under the exact CSP with 0 requests to unpkg and 0 script-src violations. Test browser with routed files, **not the built Worker**. |

## Migrations

| File | Safe on real paid bookings? |
|---|---|
| `20261005100000_manage_token_purpose.sql` | Yes. Function replace, grants re-asserted, no row or table change. Apply after 26.5's migrations; read back `md5(prosrc)`. Before applying, compare the live bodies of the seven functions with their newest earlier migration. |
| `20261005110000_security_hardening.sql` | Yes. Two function replaces, no data change. |

No new settings, no new bindings, no new secrets.

## Behaviour changes to know

- F5: the Worker passes the sign-in user id, not `customers.id`, to `customer_confirmation_read`
  (`lib/checkout/booking-read.ts:393`), so the signed-in confirmation read could never match before.
  The function now accepts the caller's own user id, so that path starts working. Own bookings only.
- F1: the pay token is **not** revoked at payment, because the pay page reads "paid" with it.
  It can no longer open anything else.
- F2: a ticket no longer moves to "Replied" by itself; the admin closes it.

## NOT verified

- Nothing on live: no deploy, no hosted SQL, no live re-probe (that is plan 20-09 after the Ship).
- The built Worker (`e2e-worker`) was not run for F13 or F2; the dashboard Support page was not
  opened signed in.
- Whether the e-mail copy that reaches the admin's inbox carries the attachments.
- The reply branch of `PATCH /api/staff/tickets/:id` still exists (staff-only, Origin-checked,
  no longer called). Left for 26.2.
- `.claude/CLAUDE.md`, `HANDOFF-CLAUDE-CODE.md` and `docs/` still say the libraries load from unpkg.

## Owner UAT after the Ship (no checkout code changed, so no 4242 step for this batch)

1. Open https://vamostaxi.site → the page loads with pictures and the booking bar. Switch to Deutsch → the text changes.
2. Open https://vamostaxi.site/faq, /privacy and /sign-in → each page shows its content, not a blank page.
3. Open https://dashboard.vamostaxi.site, sign in → the console loads.
4. Dashboard → Support → open a ticket → you see the messages, file names as plain labels, no reply box, a button "Answer by e-mail".
5. Click "Answer by e-mail" → your mail app opens a new message to the customer.
6. Click Close ticket, then Reopen → the ticket moves and comes back.
7. Open a manage link from an old confirmation e-mail → the booking shows as before.
8. Dashboard → a booking → Send pay link to your own address; open the pay link → the pay page shows. Paste the same link's token at `https://vamostaxi.site/manage-booking?token=…` → "not found", not the booking.
9. Sign in on vamostaxi.site, open Bookings, open one of your paid bookings → it shows.

## Still to build (Phase 20)

- Batch B, after 26.5 is on main: F6, F8, F14 rest, F11 (plan 20-10 needs his signature and wording).
- Batch C, after Phase 27 is on main: F12 confirm screen (UI-SPEC first), `/dev` 404 double headers.
- F3 is 26.5's; re-probed in 20-09. Then 20-09 live readback; TEST SECURITY booking VT-26-0745 left to the hourly clean-up.
