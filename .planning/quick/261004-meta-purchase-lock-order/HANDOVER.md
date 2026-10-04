# Hand-over: Phase 29 lock-order fix (meta_purchase_claim / meta_purchase_sweep)

Job session, 2026-10-04 16:16 +04. Owner: "Yes, small job now".

- Branch: `fix/meta-purchase-lock-order`, cut from `origin/main` `45d9515f` (origin/main had not moved at hand-over, so no merge was needed).
- Code commit: `be46973c`. This hand-over file is the commit on top of it.
- Migration: `20261007270000` (the number reserved for this job). No other ref on GitHub has a file with that number.

## Files

| File | What |
|---|---|
| `packages/db/supabase/migrations/20261007270000_meta_purchase_lock_order.sql` | new migration, one transaction |
| `packages/db/supabase/tests/meta_purchase_lock_order.test.sql` | new pgTAP guard, 12 assertions |
| `packages/db/test/local/meta-purchase-lock-order.test.ts` | new two-connection local proof, 4 tests |

No Worker code changed. `packages/db/database.types.ts` did not change (same signatures).

## What changed

- `meta_purchase_claim`: the body from `20261007260000` word for word, plus one statement before the booking lock: `perform 1 from public.booking_payments p where p.id = p_payment_id for key share;`. The diff against 260000 is that statement and its comment, nothing else.
  - Why FOR KEY SHARE: it is the lock the claim's insert already took through the `payment_id` foreign key, now taken first. It conflicts only with FOR UPDATE, a delete or a change to a unique key. Settle takes FOR UPDATE on this row. So the claim now waits at the payment while a settle holds it, and a settle that comes later waits at the payment until the claim commits. A plain UPDATE of other payment columns (FOR NO KEY UPDATE) is not blocked.
- `meta_purchase_sweep`: the candidate query keeps the same conditions, `order by b.id` and `limit 500`. It no longer takes a lock itself. For each booking:
  1. Read the booking's first succeeded payment, then lock it `for key share skip locked`.
  2. Lock the booking `for update of b skip locked`, re-checking the same conditions.
  3. Read the first succeeded payment again under the booking lock. If it changed, skip the booking.
  4. Do the same work as before: write the `skipped / interrupted` row with `on conflict do nothing`, wipe the three values, add one to the count.
  - A booking that is locked, or that changed, is skipped and picked up the next day, as before.
  - One difference: a locked candidate now still counts against the 500.
- Unchanged: signatures, SECURITY DEFINER, `search_path = ''`, `lock_timeout = '2s'`, `statement_timeout = '5s'`, function comments. Revoke and grant are restated as in 260000: EXECUTE for `vamos_system` only.
- Safe on real paid bookings: it only replaces two function bodies. No table, column, row, grant or other function changes. `create or replace` takes no table lock.

## Trade-off the controller should know (by design, not fixed here)

Some functions lock the booking first and then take FOR UPDATE on the booking's first captured payment:

- `ops_refund_plan`
- `ops_refund_record`
- `ops_refund_intent_sent`
- `record_booking_refund`
- `booking_edit_request_accept`
- `booking_edit_refund_record`

Their order is now the opposite of the claim's. Before this fix they were compatible with the claim and settle was not.

- When they can meet: only if the owner (refund) or a customer (change request) acts on a booking in the same instant its first payment settles and the queue claims it.
- Why this order still wins: the settle repeat this job fixes happens by design, because Stripe sends more than one event per payment and the return route settles too.
- Cost if it ever happens: Postgres aborts one side with 40P01.
  - If the claim is aborted, that booking gets no Purchase: the Worker's `claim_failed` path clears the ids.
  - If the refund or change call is aborted, it fails and is pressed again.
- Settle and the ops refund functions already have opposite orders to each other today. That is outside this job.

The pgTAP guard asserts that settle still locks the payment first. If settle ever changes order, that test fails and points back here.

## Checks (on `be46973c`, local native stack 127.0.0.1:46522, Supabase CLI 2.119.0, no Docker)

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | pass |
| `node scripts/sync-dc-mock-to-public.mjs` | pass |
| `pnpm run typecheck` | pass |
| `pnpm run lint` | pass: 0 errors, 6 warnings, all in files this job did not touch |
| `pnpm run check:db-fences` | pass: 8/8, 1179 files |
| `pnpm run db:seed:check` | pass: no drift |
| `pnpm --filter web exec vitest run lib/meta lib/checkout/settle.test.ts` | pass: 10 files, 441 tests |
| `supabase db reset` from zero (all migrations + seed, 270000 last) | pass |
| Full pgTAP from zero (`supabase test db --local`) | pass: 103 files, 2857 tests. `meta_purchase.test.sql` 115/115, `meta_purchase_lock_order.test.sql` 12/12 |
| Local: `meta-purchase-lock-order.test.ts`, `meta-purchase.test.ts`, `meta-click-ids.test.ts` (`VAMOS_LOCAL_DB_PORT=46522`) | pass: 3 files, 14 tests |
| Mutation check: the 260000 bodies put back on the same stack | new local test fails as it should: claim gets `{ error: "40P01" }` (deadlock; settle's booking lock waited 990 ms), old sweep fails with `canceling statement due to lock timeout`; pgTAP guard fails 6 of 12. Then 270000 was re-applied and everything passed again |
| Generated types, 260000 vs 270000 bodies (same CLI, same stack) | identical |

What the local proof shows. Each case uses two real connections with the Worker's client options. The claim and the settle run as `vamos_system` through `withIdentity`, as the Worker runs them.

1. Settle holds the payment row FOR UPDATE.
   - The claim waits on a `booking_payments` row and holds nothing on the booking.
   - Settle's next step, booking FOR UPDATE, gets its lock at once. This is the step that used to deadlock.
   - After settle commits, the claim answers `send`, with one `sending` row.
2. The claim runs first, with its transaction still open.
   - The real `checkout_payment_settle` repeat waits on the `booking_payments` row.
   - After the claim commits, settle answers `already_settled = true`.
3. Settle holds the payment of an idle booking.
   - The sweep returns in under 1 s and leaves that booking alone: ids kept, no row.
   - It holds no lock on the booking: settle takes it at once.
   - The next run wipes the booking and writes `skipped / interrupted`.

## NOT verified

- `pnpm run db:types:check` with the pinned CLI 2.115. It needs the Docker stack on 54322, and Docker is off by owner rule. Instead, the native CLI's generated types were compared between the 260000 and 270000 bodies on the same stack: identical. The function signatures did not change.
- Nothing on the hosted database. No connector call was made.
- No Worker build or deploy. None is needed.
- A real Stripe double event against the Worker. The interleaving is proven in SQL, not end to end.
- The full `test:local` set and the other `*.local.test.ts` suites. Only the meta local tests ran.
- The trade-off above was found by reading the latest function definitions on the local stack. It was not run as a test.

## Ship order (controller)

1. Re-read `git log -3`, `origin/main` and the live Worker version. Say what moved.
2. Before applying, read-only on hosted: the md5 values must still be the 260000 ones.
   - `meta_purchase_claim` = `187d1eb46c348d9cec6be3f818f59bb5`
   - `meta_purchase_sweep` = `104302525db4942445d4a1dc025374e7`
   - These match a fresh local replay of 260000.
3. Apply `20261007270000_meta_purchase_lock_order.sql` verbatim, as one migration (connector `apply_migration`). It has its own `begin; ... commit;`.
4. Read back, read-only. Expected values are from a from-zero replay on the local stack:

```sql
select p.oid::regprocedure::text as fn, md5(pg_get_functiondef(p.oid)) as md5
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('meta_purchase_claim', 'meta_purchase_sweep', 'meta_purchase_finish',
                     'meta_purchase_clear_ids', 'checkout_set_meta_click_ids',
                     'tg_bookings_meta_click_ids_pending_only')
 order by 1;
```

| Function | md5 after apply |
|---|---|
| `meta_purchase_claim(uuid,bigint,text,boolean,boolean,text)` | `1a0f083820584d211cb5d94209a4a526` (new) |
| `meta_purchase_sweep()` | `bef84d2c312d07f1ef5ef79b2e404824` (new) |
| `checkout_set_meta_click_ids(uuid,text,text,uuid)` | `7812387444a2045b5cc8f0745acb2a2e` (unchanged) |
| `checkout_set_meta_click_ids(uuid,text,text)` | `c84ea82a9172717cb7bf960b62aa3b44` (unchanged) |
| `tg_bookings_meta_click_ids_pending_only()` | `6e51e9a137e25ad9fabae6e2449ef7f2` (unchanged) |
| `meta_purchase_finish(uuid,uuid,text,integer,integer,integer)` | `fa9f141957d7c85c320a9d14bbc497fa` (unchanged) |
| `meta_purchase_clear_ids(uuid)` | `44b30de59aab9fcdff8ee744e4bafb07` (unchanged) |

```sql
select p.oid::regprocedure::text as fn, a.grantee::regrole::text as grantee
  from pg_proc p, aclexplode(p.proacl) a
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('meta_purchase_claim', 'meta_purchase_sweep')
   and a.privilege_type = 'EXECUTE'
 order by 1, 2;
```

Expected EXECUTE grantees, per function: `postgres`, `service_role`, `vamos_system`. Locally: `{postgres,service_role,vamos_system}` for both. Nobody else.

5. Merge the branch to `main` as one squash commit and push. No Worker deploy: no site code changed.
6. Update the board and clean up the branch (archive tag, then delete).

## Local clean-up done by this session

The native stack `vamos-lockorder` (ports 46520-46529, 8653) was stopped. Its scratch folder `~/.vamos-scratch/lockorder-sb` and its stack folder under `~/.supabase/stacks/` were removed after the final run. The worktree and branch are left for the controller.
