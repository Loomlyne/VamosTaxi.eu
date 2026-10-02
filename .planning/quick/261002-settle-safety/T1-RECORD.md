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
