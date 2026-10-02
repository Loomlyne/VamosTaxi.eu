# Hand-over — 261002 settle safety (2026-10-02 15:30 +04)

Job session in `.claude/worktrees/settle-safety`, branch **`fix/settle-safety`**, cut from `origin/main` 3978fda9;
`origin/main` re-read at 15:10 +04: still 3978fda9, nothing to merge. Code tip **f22b6a04**; the tip of the branch is
the docs commit that adds this file (`git log -1 fix/settle-safety`). Folder clean after that commit.

Owner signatures (question form, 2026-10-02 14:45 +04): S1 plan "Signed", S2 alert mail T1 "Approve as written",
S3 dashboard message T2 "Approve as written" — `.planning/decisions/2026-10-02-settle-safety.md`.
Plan: `PLAN.md`. Test-first record and every run: `T1-RECORD.md`. Logs: `evidence/`.

## What is in it

| Finding | Commits | What changes |
|---|---|---|
| P-1 lost payment | `2b27e167` (SQL), `4be48e4c` + `f22b6a04` (Worker) | Settle and Accept lock the booking before the request, like every other writer (the deadlock is gone). A database hiccup (deadlock, serialization, lock, connection, resource, shutdown, timeout, or an error with no SQLSTATE) is retried with a delay, never acknowledged; `begin()` errors are retried too. A permanent error after money was captured is never acknowledged either: retried every 300 s until the dead-letter queue sends the existing stuck-payment mail (now naming the booking of a difference page). Inside the settle, an apply that fails for a non-transient reason (class gone, too many travellers, refused place) rolls back the apply only: the payment is recorded, the request ends, the paid difference is Refund due, event `refund.requested` via `difference_not_applied` with the SQLSTATE. |
| P-2 paid after cancel | `2b27e167`, `dd8a9ddf` | Every cancel (link, signed-in, dashboard) ends a waiting change in its own transaction; the Worker then closes its Stripe page (`booking_cancel_change_pages`, best effort, before the mail). A difference that still lands on a cancelled, partly cancelled or refunded booking is recorded, never applied: added to the full refund the cancel owed, otherwise Refund due for the owner to decide; event `refund.requested` via `difference_after_cancel`. |
| Deterministic pick | `2b27e167` | `order by (status = 'requested') desc, created_at desc limit 1`. |
| R4 warning 2 (amount moved between two Accepts) | `2b27e167`, `dd8a9ddf` | Accept refuses `price-changed` (409, nothing written, the first link stays valid; its amount matches the record). Dashboard shows T2 in four languages. |
| R4 warning 3 (new staff change over a just-paid page) | `dd8a9ddf` | Both confirms run Withdraw's page check first (shared helper `closeWaitingStaffPage`): paid → `already-paid` with the existing "The customer has already paid the difference…" text, nothing written; not closable → `stripe-failed`; closed → the change goes ahead. |
| Alert T1 | `4be48e4c` | Any difference settled but not applied (cancelled, replaced, no longer fits) mails info@ once (`difference-not-applied`, booking's language, best effort, never a retry). |

Files: `packages/db/supabase/migrations/20261007200000_settle_safety.sql`, `packages/db/supabase/tests/settle_safety.test.sql`,
`packages/db/database.types.ts`; `apps/web/lib/checkout/settle-errors.ts` (+test), `settle.ts` (+test);
`apps/web/lib/ops/must-fix-mail.ts`; `packages/emails/src/OpsMustFixEmail.tsx` (+test), `messages/{en,de,fr,ar}.json` (2 keys
each); `apps/web/lib/db/system-reads.ts` (+`system-reads-cancel-pages.test.ts`); `apps/web/lib/lifecycle/paid-cancel.ts` (+test);
`apps/web/lib/ops/edit-request-map.ts` (+test), `booking-change.ts` (+test), `booking-trip-change.ts` (+test),
`ops-accept-paid-dc.test.ts`; `app/ops/OpsDetail.dc.html`; `apps/web/lib/ops/settle-safety.local.test.ts`;
`scripts/db-access-fence-allowlist.json` (the test's raw connection). No seed change, no new setting, no new secret.

## Migration `20261007200000_settle_safety.sql`

Safe on real paid bookings: no row inserted, updated or deleted; no backfill; five bodies replaced with `create or
replace` (same signatures, same result columns: a live Worker's prepared `select *` keeps its row type) and one new
function. Runs twice (proven by E1 on the stack: second apply exit 0, md5s unchanged). Live holds 1 edit request
(staff, accepted, paid); nothing waits.

1. **Preconditions, read-only on live just before the apply** (all read 2026-10-02 14:33 +04 and equal to the files):
   ```sql
   select n.nspname||'.'||p.proname as fn, md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('public','checkout_extra_payment_settle'),('public','booking_edit_request_accept'),
          ('app','apply_customer_cancel'),('public','ops_cancel_booking'),('public','checkout_reference_for_session'),
          ('public','booking_cancel_change_pages')) order by 1;
   ```
   Expected: `app.apply_customer_cancel e24fbf45ba0e962bf90ebfb46b5c9b18`, `public.booking_edit_request_accept 586a5e1a37fd194b25ae0aad87576e16`,
   `public.checkout_extra_payment_settle 62df6b4c8440ecfbc3473dfd32895f7f`, `public.checkout_reference_for_session 9d33c74565621b405771b606d40de87e`,
   `public.ops_cancel_booking 78a1ad2e8168bd9e5686c7896d4ef39a`, and no `booking_cancel_change_pages` row.
   Newest live migration then: `20261002101321 customer_request_staff_waiting`.
2. **Apply the file verbatim** (no begin/commit inside).
3. **Read back** — same query; expected (all `prosecdef = t`, `proconfig = {search_path=""}`):
   `app.apply_customer_cancel d29957683f90c195b01f63296a5b9b8f`, `public.booking_cancel_change_pages 913e463604f82c2a7b1a61ef5f1fd53e`,
   `public.booking_edit_request_accept a4b864f32ba527a031bd0865311f069e`, `public.checkout_extra_payment_settle 732b8d008111640feb1073172694fbfd`,
   `public.checkout_reference_for_session 4054b98b618305491abdb470dd03a2e5`, `public.ops_cancel_booking 962726827b46c4d7ce074d9f5d8f26ef`.
   EXECUTE on the five public functions (`has_function_privilege`): postgres t, vamos_system t, service_role **t on live**
   (live default ACL for postgres-owned functions in public grants it; f on a from-empty stack), anon / authenticated /
   vamos_edge / vamos_public / vamos_staff f (`evidence/grants-after-migration.txt` is the from-empty read).
4. Rollback = re-apply the previous bodies from their files with `create or replace` and drop the new function (lines named
   in the migration header). Nothing else depends on them.

## Ship order: migration first, then the Worker, in the same ship

Both halves are safe alone, proven on my stack: (a) the new SQL with the live Worker's code (`git archive origin/main`):
12 local files / 22 tests pass; (c) the old SQL with the new Worker code: the 12 existing local files pass. Migration
first because the new SQL alone loses nothing (the old Worker just misses the T1 mail, the page close on cancel — the
settle's own guard still makes a late payment Refund due — and maps `price-changed` to "Could not apply edit", nothing
written), while the Worker alone on the old SQL would send the old 23P01 overlap mail on each retry of such a payment.
Deploy `pnpm --filter web run deploy -- --env staging` (Worker `vamos`). The change touches the money path: the controller's
fresh review first, then the 4242 payment of a difference (UAT 1-3) right after the deploy.

## Checks (code tip f22b6a04; logs `evidence/gates/`, `evidence/`)

| Check | Result |
|---|---|
| typecheck | exit 0 (on f22b6a04) |
| lint | exit 0 (on f22b6a04), 0 errors, the same 6 warnings as main, none in this job's files |
| lint:css, i18n:check, check:legal-claims, check:numbers, check:public-env, db:seed:check | exit 0 each |
| check:db-fences | exit 0 (first run found module-scope Sets in settle-errors.ts; fixed in f22b6a04) |
| test:unit (`pnpm test:unit`, after `node scripts/sync-dc-mock-to-public.mjs`) | exit 0 — web 386 files / 3985 passed, 27 skipped; emails 239; db 14 |
| build | exit 0 |
| pgTAP from empty (own stack `vamos-taxi-ss`, ports 655xx: `reset` then `pgtap`) | 97 files, 2630 tests, PASS; new `settle_safety.test.sql` 124/124 (on main's bodies: 51 not ok + 12 errors) |
| Worker-client proofs `settle-safety.local.test.ts` (P-1 settle, P-1 Accept, P-2) | 3/3 on the branch; on main's bodies: 40P01, 40P01, request left waiting |
| All local Worker-client files, new SQL + new code | 13 files / 25 tests pass |
| Ship-order runs (a) and (c) | see above |
| types (pinned CLI 2.115.0, generated from the stack on 65522; `db:types:check` itself reads 54322, which a job may not use) | identical to `packages/db/database.types.ts` |

## NOT verified

- Nothing applied or deployed on live; no read-back on live.
- No real Stripe call: page expire / retrieve and the pay pages are stand-ins in every test; no test-mode difference was
  paid in a browser. Cloudflare Queues' handling of `delaySeconds` and the dead-letter step were not run (the retry and
  acknowledge decisions are unit-tested; the dead-letter consumer is live on Worker `vamos`, read with
  `wrangler queues info` at 15:05 +04).
- The deadlock proof holds the booking and then the request on a second connection, in the order the customer's request
  takes them; the upsert itself takes both in one statement, which cannot be interleaved from outside.
- The T1 mail in real mail clients; the T2 message and the `already-paid` message in a browser (vm-run DC tests only).
- Timing: a hiccup is retried 8 times (5 s apart for a deadlock, 60 s otherwise, about 8 minutes); a permanent error
  with money captured 8 × 300 s (about 40 minutes) before the stuck-payment mail.
- A difference paid in the last minute of its 24 h window but recorded after its price record expired is refused by the
  payment gate (`tg_payment_matches_snapshot`): now retried and ends in the stuck-payment mail instead of being dropped;
  it is not recorded automatically. Resend the event from Stripe after a fix.
- A difference paid after the trip has run is still applied (unchanged; out of scope in the plan).
- No dashboard list of dead-lettered events (out of scope in the plan): the stuck-payment mail is the signal.

## Known behaviours (by design, for the reviewer)

- The confirm's page check closes the waiting staff change's page before writing; if the database then refuses the new
  change (e.g. the price book changed in the same second), the old waiting change ends when Stripe's "expired" event
  arrives. No money involved.
- On a cancelled booking whose refund was already sent or declined, a late difference sets Refund due back to "you decide"
  (`pending_ops`, owed null).
- An unpaid difference page that belongs to no request (a replaced page's expired event) is now acknowledged quietly
  instead of ending in a false stuck-payment mail.

## For the controller's list (found, not fixed here)

1. `apps/web/lib/ops/refund-by-hand.local.test.ts` stores the fixed refund id `re_retry` in a unique column: it passes once
   per stack and fails on every later run until a reset (old test).
2. Live `booking_edit_request_set_extra_session` differs from its file by line breaks only (live `e8168fb4…`, file
   `86ffd2c2…`).

## Owner UAT (numbered; on vamostaxi.site after the ship; test bookings stay for your own clean-up)

1. Book a trip on vamostaxi.site with a pickup more than 24 hours ahead and pay with card 4242 4242 4242 4242. Expected: the confirmation page; the controller
   reads `booking_payments` for that booking: one row `succeeded`.
2. Dashboard → that booking → Edit → Trip: move the destination farther away → confirm. Expected: "waiting for the
   difference"; the customer e-mail "pay the difference" arrives.
3. Open that e-mail's link and pay the difference with 4242 4242 4242 4242. Expected: within a minute the dashboard shows
   the new destination; the controller reads `booking_payments`: two rows `succeeded`, and `stripe_events` for that page:
   `processed_at` set, `last_error` empty.
4. Dashboard → same booking → Edit → Trip: change the destination again, farther (a new difference). Do not pay.
5. Open the customer's manage link from the confirmation e-mail → Cancel this transfer → confirm. Expected: the booking
   is cancelled; the dashboard shows Refund due with the full amount paid (trip + first difference); the destination is
   the one from step 3.
6. Open the "pay the difference" link from step 4's e-mail. Expected: Stripe says the page has expired; nothing can be paid.
7. Check info@vamostaxi.site. Expected: no "A Stripe payment event is stuck" mail and no "Difference paid, change not
   applied" mail for this booking.
