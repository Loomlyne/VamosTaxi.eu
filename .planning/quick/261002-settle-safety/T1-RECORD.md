# T1 record — 261002 settle safety

Own stack `vamos-taxi-ss` (ports 655xx: DB 65522, API 65521, mail 65524, inspector 8655), replayed from
empty with every migration of `origin/main` 3978fda9 (`local-test-stack.sh start`), roles set with
`local-test-stack.sh roles`. Clock: Mac, +04.

## Live preconditions read (read-only, 2026-10-02 14:33 +04)

Live `supabase_migrations.schema_migrations` newest: `20261002101321 customer_request_staff_waiting`.
md5(prosrc) on live = on the from-empty stack for every function this job replaces or reads:

| Function | md5 |
|---|---|
| public.checkout_extra_payment_settle | 62df6b4c8440ecfbc3473dfd32895f7f |
| public.booking_edit_request_accept | 586a5e1a37fd194b25ae0aad87576e16 |
| app.apply_customer_cancel | e24fbf45ba0e962bf90ebfb46b5c9b18 |
| public.ops_cancel_booking | 78a1ad2e8168bd9e5686c7896d4ef39a |
| public.checkout_reference_for_session | 9d33c74565621b405771b606d40de87e |
| public.booking_edit_request_upsert (unchanged) | 6aa5b9702982284ebea92d95c7081d63 |
| public.booking_change_withdraw (unchanged) | 51b9fea25bd3d685ccadb86bbc03164e |
| public.booking_staff_change (unchanged) | 3e7d4ba8569fdd8360ada0eadae8948e |
| public.booking_staff_trip_change (unchanged) | 96ad73c2f112bef924c07fa7048b7548 |
| public.manage_booking_cancel (unchanged) | 1f46a8f9aa2621e8645a2d318fd147e3 |
| public.customer_paid_cancel (unchanged) | 6161c8599c8f7d42f94ec3bd159b1f6c |
| public.edit_request_refuse (unchanged) | 8adbeaeeab8a7c98da7daf28392df7f5 |
| app.booking_change_settle_credit (unchanged) | 7f69313b37327ed0474cb859503244ba |
| public.booking_edit_apply_payload (unchanged) | e091cc25181cf088f2a5b5c24a1019d3 |

Drift found, not this job's: `public.booking_edit_request_set_extra_session` live `e8168fb4…`, file
`86ffd2c2…`; the live body has `where id = p_request_id and status = 'requested';` on one line, the file on
two. Same logic.

Live rows: `booking_edit_requests` holds 1 row (staff, accepted, paid, booking confirmed). Nothing waits.

## Negative control (tests written first, run on main's bodies)

`apps/web/lib/ops/settle-safety.local.test.ts`, `VAMOS_LOCAL_DB_PORT=65522`, 2026-10-02 ~15:00 +04:

| Test | Result on main's bodies |
|---|---|
| P-1 settle vs a customer request's lock order | FAIL: `{ call: '40P01', side: null }` — the database chose the settle as the deadlock victim; on live the Worker then acknowledged the event (the lost payment). |
| P-1 Accept vs a customer request's lock order | FAIL: `{ call: '40P01', side: null }` |
| P-2 cancel then a paid difference | FAIL: the waiting request stays `requested` after the cancel |

## After the build (2026-10-02 15:05-15:25 +04)

Executors (Sonnet): E1 migration + pgTAP + types, E2 settle retry + alert mail, E3 cancel page close + confirm
check + dashboard texts. Lead (Opus) reviewed each diff against the live bodies: only the planned changes.

- New pgTAP `settle_safety.test.sql` (124): on main's bodies 61 ok, 51 not ok, 12 errors (function missing; the
  settle raising `unknown-class` = the lost payment); on the branch 124/124.
- `settle-safety.local.test.ts` on the branch's SQL: 3/3 (and 3 repeat runs by E1).
- Ship-order runs on `vamos-taxi-ss` (logs in `evidence/`):
  - (b) new SQL + new code: 13 local files / 25 tests pass.
  - (a) new SQL + the live Worker's code (`git archive origin/main`, run from the scratchpad): 12 files / 22 tests
    pass on a fresh reset. A first try on a used stack failed one case of `refund-by-hand.local.test.ts`: the test
    stores the fixed refund id `re_retry` in a unique column, so it passes once per stack (old test, not this job).
  - (c) old SQL (stack reset to main's migrations) + new code: the 12 existing files pass; only
    `settle-safety.local.test.ts` fails, exactly as on main (40P01, 40P01, request left waiting).
- Final: reset from empty with the branch's migrations, full pgTAP 97 files / 2630 tests PASS; md5s and grants in
  `evidence/md5-after-migration.txt`, `evidence/grants-after-migration.txt`; types from the pinned CLI identical.
