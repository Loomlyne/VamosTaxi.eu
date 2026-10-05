# Hand-over: refund and change-request lock order (migration 20261007280000)

Job session, 2026-10-04 17:35 +04. Owner, 16:52 +04 in the controller's chat: "do the lock order job too in parallel".

- Branch: `fix/refund-lock-order`, cut from `origin/main` `369cbd26` (origin/main had moved from `0be589db` before the first commit: fast-forward).
- Code commit: `8a584727`. Then `origin/main` merged twice: `6a3ad2e0` (`e66eae74`, no conflict, no database file) and `6bbf0058` (`15e600cc`, board only). This hand-over file is the commit on top.
- Migration: `20261007280000`, the number reserved for this job. No ref on GitHub has a file with that number (`git log --remotes=origin -- 'packages/db/supabase/migrations/2026100728*'` is empty).

## Files

| File | What |
|---|---|
| `packages/db/supabase/migrations/20261007280000_refund_lock_order.sql` | new migration, one transaction, nine `create or replace` |
| `packages/db/supabase/tests/refund_lock_order.test.sql` | new pgTAP guard, 38 assertions |
| `packages/db/test/local/refund-lock-order.test.ts` | new two-connection local proof, 7 tests |

No Worker code changed. `packages/db/database.types.ts` did not change (same signatures).

## What changed

One order everywhere: **payment, then booking, then what comes after the booking** (change request, refund intent). This is the order of `checkout_payment_settle` and, since 270000, of the Meta claim and sweep.

Pattern in each function:
1. Read the payment id without a lock.
2. Lock that payment `FOR UPDATE` (the strength the function used before).
3. Lock the booking. The booking statement is unchanged.
4. Read the payment again under the booking lock. The old `FOR UPDATE` on it is removed: the row is already held.
5. If the payment changed, the function raises `payment-changed`, SQLSTATE `40001`. It never takes a second payment lock while it holds the booking. Nothing is written: the transaction rolls back.

"Changed" in practice means: no captured payment at the first read, one now. A booking with no captured payment locks nothing before the booking, as before.

| Function | Body copied from | Before | After | When the payment changed |
|---|---|---|---|---|
| `ops_refund_plan` | 20261007140000 | booking → every captured payment (loop, by id) | captured payments by id (one statement) → booking | count of captured payments differs → 40001. Worker (`refund.ts`) answers `unknown`; no intent and no Stripe call yet; the owner presses Refund again. |
| `ops_refund_intent_sent` | 20261005140000 | booking → intent → payment | the intent's payment → booking → intent | intent's payment differs → 40001. Cannot happen: an intent's payment never changes. If it did: Worker marks the part `unrecorded`, the intent stays open, Retry finds the refund at Stripe and records it. Never twice. |
| `ops_refund_record` | 20260928150000 | booking → the given payment | the given payment → booking | payment found now but not locked before → 40001. Cannot happen: the caller names the payment, and a payment never moves to another booking (`tg_payment_update_whitelist`). No Worker caller. |
| `record_booking_refund` | 20260911234758 | booking → first captured payment | first captured payment → booking | 40001. No Worker caller since 20-10. |
| `booking_edit_request_accept` | 20261007200000 | booking → request → first captured payment | first captured payment → booking → request | 40001. Worker (`edit-request.ts`) answers `unknown`; nothing written; the owner presses Accept again. |
| `booking_edit_refund_record` | 20260910175309 | request → booking → first captured payment | first captured payment → booking → request | 40001. The request lock moved after the booking (read without a lock first, as accept does). No Worker caller. |
| `booking_staff_change` (found, same pattern) | 20261007140000 | booking → (accept) first captured payment | first captured payment → booking → (accept re-locks the same row, no wait) | checked just before accept is called → 40001. Worker (`booking-change.ts`) answers `unknown`; price record and request roll back; the owner presses again. |
| `booking_staff_trip_change` (found, same pattern) | 20261007150000 | booking → (accept, priced changes only) first captured payment | first captured payment → booking → (accept, priced changes only) | checked before accept, priced changes only → 40001. Same Worker answer as above. Every trip change, priced or not, locks the first captured payment before the booking (the lock comes before the priced/unpriced split); a change with no new price is never refused with `payment-changed`. (Corrected 2026-10-05, U27: this line said an unpriced change takes no payment lock.) |
| `checkout_extra_payment_settle` (found, same pattern) | 20261007200000 | booking → request → the request's recorded payment | the request's recorded payment → booking → request | 40001. `settle.ts` treats 40001 as contention: the event is retried after 5 s, never recorded as failed. On the return route it redirects to the confirmation, as any retry does. |

Why the three found ones are in: without them this job would make things worse. `ops_refund_plan` now locks the captured difference payment before the booking. A repeated difference settle still locked the booking first and that payment after it. Those two could then deadlock, and before this job they could not. The staff changes call accept while they hold the booking, so the payment lock had to move up into them as well.

One behaviour change to know. Two deliveries of one difference payment arrive in the same second (webhook and return route). Before: the second waited for the booking, then answered "already settled". Now: the second answers 40001 once and answers "already settled" on its retry 5 s later. The money is recorded once in both cases. The local proof (c) shows it.

Kept: signatures, SECURITY DEFINER, `search_path = ''`, no lock or statement timeout (none had one), owner `postgres`, comments. Revoke and grant are restated as each function's latest migration has them. Read back after apply: EXECUTE for `postgres`, `service_role` and `vamos_system`, as before. No table, column, row or other function change.

What still touches a payment after the booking lock in these nine: the fee write in `ops_refund_record` and `ops_refund_intent_sent`, the extra settle's own update, and accept's re-lock inside the staff changes. All are on the row the function already holds.

## Inventory

How it was found: on the from-zero stack, a script read `pg_get_functiondef` of every plpgsql and SQL function in `public` and `app` (183). It listed the row locks on `bookings` and `booking_payments` in text order:
- explicit `FOR UPDATE / NO KEY UPDATE / SHARE / KEY SHARE`
- `UPDATE` and `DELETE`
- inserts whose foreign key takes `KEY SHARE` on a parent (22 foreign keys point at the two tables)
- the triggers on these tables, and nested calls to other functions

Every function the script flagged was then read by hand. No dynamic SQL, and no other schema touches the two tables.

| Function | Order before | Order after | Note |
|---|---|---|---|
| `checkout_payment_settle` | payment → booking | same | the order everyone follows; later it writes only its own payment |
| `meta_purchase_claim` | payment (KEY SHARE) → booking | same | 270000 |
| `meta_purchase_sweep` | payment (KEY SHARE, skip locked) → booking (skip locked) | same | 270000 |
| `checkout_duplicate_refund_record` | payment → booking | same | |
| `stripe_charge_refunded_record` | payment → booking | same | |
| `stripe_dispute_upsert` | payment → booking (KEY SHARE through `booking_disputes`) | same | |
| `ops_refund_plan` | booking → payments | payments → booking | changed |
| `ops_refund_intent_sent` | booking → intent → payment | payment → booking → intent | changed |
| `ops_refund_record` | booking → payment | payment → booking | changed |
| `record_booking_refund` | booking → payment | payment → booking | changed |
| `booking_edit_request_accept` | booking → request → payment | payment → booking → request | changed |
| `booking_edit_refund_record` | request → booking → payment | payment → booking → request | changed |
| `booking_staff_change` | booking → (accept) payment | payment → booking → (accept) | changed, found |
| `booking_staff_trip_change` | booking → (accept) payment | payment → booking → (accept) | changed, found |
| `checkout_extra_payment_settle` | booking → request → payment | payment → booking → request | changed, found |
| `checkout_abandon_unpaid` | booking → UPDATE of its `requires_payment` payments | same | reported, left |
| `checkout_requote_cancel` | booking → UPDATE of its `requires_payment` payments | same | reported, left |
| `purge_unpaid_booking` | booking → DELETE of its payments (unpaid bookings only) | same | reported, left |
| `checkout_create_booking` | KEY SHARE only, on rows it inserts itself | same | no conflict possible |

These lock only the booking and read payments without a lock: `ops_cancel_booking`, `app.apply_customer_cancel`, `customer_paid_cancel`, `ops_refund_decide`, `app.ops_mark_booking_outcome`, `booking_staff_contact_update`, `booking_edit_request_upsert`, `checkout_cancel_unpaid`, `checkout_expire_unpaid`. `checkout_attach_payment` also inserts a new payment row.

Left as they are, and why. The three unpaid-path functions (`checkout_abandon_unpaid`, `checkout_requote_cancel`, `purge_unpaid_booking`) lock the booking, then write that booking's unpaid payments.
- They can deadlock with a settle of that same unpaid payment: a customer pays at the very second the booking is abandoned, re-quoted or purged. Postgres then aborts one side with 40P01, and the settle retries.
- This job does not make that worse. The nine functions above lock captured payments only. These three only write `requires_payment` rows, or the payments of an unpaid booking.
- Changing them would change checkout expiry. That is outside a refund job, so it needs its own decision.

## Checks

On `6a3ad2e0` (code unchanged since `8a584727`; `6bbf0058` after it adds only `.planning/CONTROL-BOARD.md`). Local native stack `vamos-lab-refundlock`, slot 2, db 127.0.0.1:45222, Supabase CLI 2.119.0, no Docker.

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | pass |
| `node scripts/sync-dc-mock-to-public.mjs` | pass |
| `pnpm run typecheck` | pass (packages/db includes its tests) |
| `pnpm run lint` | pass: 0 errors, 6 warnings, all in files this job did not touch |
| `pnpm run check:db-fences` | pass: 8/8, 1189 files |
| `pnpm run db:seed:check` | pass: no drift |
| `pnpm run check:numbers` | pass |
| Worker callers' unit tests: `lib/ops` refund, refund-by-hand, edit-request (4 files), booking-change (6 files), booking-trip-change, staff-cancel-by-hand, staff-hosted-pay, trip-change-migration-grants; `lib/checkout` settle, settle-errors, return-settle; `lib/lifecycle/paid-cancel`; `lib/account/bookings` | pass: 21 files, 381 tests |
| `scripts/test-lab/lab.sh up refundlock` (native), then `supabase db reset` from zero | pass: 138 migrations, 280000 last |
| Full pgTAP from zero (`lab.sh pgtap refundlock`) | pass: 104 files, 2895 tests. `refund_lock_order` 38/38, `settle_safety`, `meta_purchase_lock_order`, `refunds_by_hand`, `ops_refund`, `refund_review`, `booking_edit_requests`, `class_change_reprice`, `trip_change_reprice` all ok |
| Local, packages/db (`VAMOS_LOCAL_DB_PORT=45222`, clean reset, files one after another): `refund-lock-order` 7, `meta-purchase-lock-order` 4, `meta-purchase` 6, `class-change-reprice` 3 | pass: 4 files, 20 tests |
| Local, apps/web: `refund-by-hand`, `settle-safety`, `booking-change`, `trip-change`, `trip-change-patch`, `customer-request-staff-pages`, `customer-request-staff-waiting` | pass: 7 files, 13 tests |
| Bodies copied word for word | each of the nine latest bodies, re-applied unchanged with `create or replace` on the from-zero stack: `pg_get_functiondef` md5 identical |
| Mutation: the nine old bodies put back on the same stack (md5 equal to the "before" column) | pgTAP guard fails 23 of 38. Local: (a) plan gets `40P01` (deadlock, settle's booking lock waited about 1.3 s); (b) Accept gets `40P01`; (c) plan locks the new payment under the booking lock and plans both; (c) extra settle locks the recorded payment under the booking lock and answers already settled. Then 280000 re-applied: everything passes again, md5 equal to the "after" column |
| Mutation: the 270000 sweep without its re-read line | (d) fails: run 1 wipes the ids and writes `skipped / interrupted` against the old payment. 270000 put back: passes |
| Generated types, old vs new bodies (native CLI, same stack) | identical |

What the local proof shows. Two real connections with the Worker's client options. The functions under test run as `vamos_system` through `withIdentity`. Where the order between two steps must be exact, a superuser connection takes the other side's locks by hand, in that side's order (as in 270000).
- (a) Settle holds the payment `FOR UPDATE`. The refund plan waits on a `booking_payments` row and holds nothing on the booking: settle's booking lock is granted at once. After settle commits, the plan writes its one intent.
- (b) The claim's order by hand (payment `FOR KEY SHARE`, then booking). Accept waits on the payment, the claim's booking lock is granted at once, and Accept then answers `extra_required`.
- (b) The other direction: the real Accept holds its locks; the real claim waits on the payment and answers `send` after the commit.
- (c) A second payment settles while the plan waits for the booking. The plan answers `40001 payment-changed` and writes nothing. Pressed again, it plans both payments.
- (c) Two deliveries of one difference payment. The second finds the payment the first recorded and answers `40001`. Its retry answers already settled.
- (d) Sweep, the branch the 270000 reviewer found untested. A table lock in EXCLUSIVE mode lets the sweep read but stops it at its booking lock. Meanwhile an earlier payment of the booking settles. The sweep leaves the booking alone: ids kept, no row. The next run writes `skipped / interrupted` for the new first payment.

## NOT verified

- `pnpm run db:types:check` with the pinned CLI 2.115. It needs the Docker stack, and Docker is off by owner rule. Instead, the native CLI's types were compared for the old and new bodies on the same stack: identical. The signatures did not change.
- Nothing on the hosted database. No connector call was made.
- No Worker build or deploy. None is needed.
- No dashboard press (Refund, Accept, class or trip change) and no real Stripe double event. The interleavings are proven in SQL, not end to end.
- The `payment-changed` branch is forced in a two-connection test for `ops_refund_plan` and `checkout_extra_payment_settle` only. For the other seven only the pgTAP guard checks it is there, in place.
- The full `test:unit` and the full `test:local` were not run, only the files listed.
- The Worker shows `payment-changed` as the generic `unknown` refusal: the refund, Accept and change maps have no name for it. Giving it a clear message is a Worker change, so it was not made here.
- `packages/db/owner-sql/26.1-verify-money.sql` (a past owner check) keeps an old body fingerprint for `ops_refund_record`. It will not match after this migration. It is a record, not a gate.
- `class-change-reprice.test.ts` fails on a stack that holds the lab's own price book: its fixture makes a live price book too (23505). Run it on a clean reset, as was done here.

## Ship order (controller)

1. Re-read `git log -3`, `origin/main` and the live Worker version. Say what moved.
2. Before applying, read-only on hosted: run the query below. The nine md5 values must equal the "before" column. They come from a fresh local replay of every migration up to 270000. If one differs, stop: live then holds a body this migration was not built on.
3. Apply `20261007280000_refund_lock_order.sql` verbatim, as one migration (connector `apply_migration`). It has its own `begin; ... commit;`. `create or replace` takes no table lock. Calls already running finish with the old body.
4. Read back, read-only: the md5 values must equal the "after" column, and the three unchanged functions keep theirs.

```sql
select p.oid::regprocedure::text as fn, md5(pg_get_functiondef(p.oid)) as md5, p.proconfig
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('ops_refund_plan', 'ops_refund_intent_sent', 'ops_refund_record', 'record_booking_refund',
                     'booking_edit_request_accept', 'booking_edit_refund_record', 'booking_staff_change',
                     'booking_staff_trip_change', 'checkout_extra_payment_settle',
                     'checkout_payment_settle', 'meta_purchase_claim', 'meta_purchase_sweep')
 order by 1;
```

| Function | md5 before (live now) | md5 after apply |
|---|---|---|
| `booking_edit_refund_record(uuid,text,uuid,rappen)` | `7c9c5ed140da52c4a6aed897728e4f17` | `4f1c6b7081778cdbf6a7fd9920ccf865` |
| `booking_edit_request_accept(uuid,uuid)` | `657fe55188b26bd7eaa27b2896105df6` | `1ffe0a0ce9a13c8b87d5b64fa96c10a0` |
| `booking_staff_change(uuid,uuid,text,bigint,integer,jsonb,text,integer)` | `d95c2404e2deeeb5b0c7a563aaaf782b` | `1b7075731f2936ac1014d3463067e216` |
| `booking_staff_trip_change(uuid,uuid,text,jsonb,bigint,integer,jsonb,text,numeric,integer,jsonb,integer,text)` | `90d2d3a260a537d8acd90589babbeb82` | `59d567eb272d669403ff4e91793e5d7d` |
| `checkout_extra_payment_settle(text,text,text,text,text,numeric,text,timestamp with time zone,bigint)` | `3f739b9210c5690010a070b583dd4b88` | `a6da4686079f8c55ade4f7dc1e529630` |
| `ops_refund_intent_sent(bigint,text,rappen,text,timestamp with time zone)` | `07c467f2fe19e4658aa310ee4e9f9095` | `097dd8a1d653c8f8b6d731f098995f64` |
| `ops_refund_plan(uuid,uuid,bigint,numeric,text,boolean,integer)` | `103439feb3c7ae6613f61cfbbd293a83` | `6001c33cbb6d8d49fe362d22712ef51f` |
| `ops_refund_record(uuid,bigint,text,uuid,rappen,text,rappen)` | `f9096cdef92344bb0ab458d16f990a07` | `96433b6710b3d78aaac39f02cf87ad58` |
| `record_booking_refund(uuid,text,text,timestamp with time zone,rappen)` | `90d2167f2e0b6b5fd25f4ab38a522a53` | `b43032b9d9e0f1d03a928a90a5d8e29d` |
| `checkout_payment_settle(text,text,text,text,text,numeric,text,timestamp with time zone,bigint,text)` | `71a0d647a1945a9add59ae46a72c88c8` | unchanged |
| `meta_purchase_claim(uuid,bigint,text,boolean,boolean,text)` | `1a0f083820584d211cb5d94209a4a526` | unchanged |
| `meta_purchase_sweep()` | `bef84d2c312d07f1ef5ef79b2e404824` | unchanged |

`proconfig` for each of the nine: `{search_path=""}`, before and after.

```sql
select p.oid::regprocedure::text as fn,
       string_agg(a.grantee::regrole::text, ',' order by a.grantee::regrole::text) as execute_grantees
  from pg_proc p, aclexplode(p.proacl) a
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('ops_refund_plan', 'ops_refund_intent_sent', 'ops_refund_record', 'record_booking_refund',
                     'booking_edit_request_accept', 'booking_edit_refund_record', 'booking_staff_change',
                     'booking_staff_trip_change', 'checkout_extra_payment_settle')
   and a.privilege_type = 'EXECUTE'
 group by 1
 order by 1;
```

Expected for each of the nine: `postgres,service_role,vamos_system`. That is the local value before and after. Nobody else.

5. Merge the branch to `main` as one squash commit and push. No Worker deploy: no site code changed.
6. Update the board and clean up the branch (archive tag, then delete).

## Local state left by this session

- The lab `refundlock` is stopped: its Workers were stopped with `lab.sh down`, its database with `supabase stop` on its own workdir.
- Its folders are kept for the controller: `~/.vamos-scratch/lab-refundlock` and its stack under `~/.supabase/stacks/`. `scripts/test-lab/lab.sh destroy refundlock` removes them, and only them.
- The worktree holds the Worker build from `lab.sh up` (`apps/web/.open-next`, gitignored).
- The worktree and the branch are left for the controller.
