# Hand-over: stripe_events.payload stored as a JSON string (26.2 finding)

Branch `fix/stripe-events-json`, cut from `origin/main` 69afa70a (main had
not moved at 03:57). Commit: the one this file lands in. Touches payments: a fresh reviewer reads
it before ship. No migration, no new setting, no live row changed.

## Cause

`${JSON.stringify(x)}::jsonb` through the Worker's postgres.js client (`fetch_types: false`,
`prepare: true`): the statement describe says the parameter is jsonb, so postgres.js runs its jsonb
serialiser (`JSON.stringify`) on text that is already JSON (`postgres/src/connection.js:960`). The
row stores a JSON string. `sql.json(x)` sends the object once and stores an object.

## Writers (all of them)

| Writer | Before | Now |
|---|---|---|
| Webhook route | `apps/web/app/api/stripe/webhook/route.ts:38` `JSON.stringify(event.data.object)::jsonb` | `route.ts:31` calls `recordStripeEvent` |
| Return-route settle | `apps/web/lib/checkout/return-settle.ts:101` `JSON.stringify({id, payment_status})::jsonb` | `return-settle.ts:95` calls `recordStripeEvent` |
| Shared writer (new) | — | `apps/web/lib/checkout/stripe-event-record.ts:31`, payload as `sql.json(...)` at `:39` |
| SQL | `public.stripe_event_record(p_payload jsonb)` (`20260827000004_settlement_rpcs.sql:28`) inserts what it is given | unchanged |

Queue consumer (`settle.ts`) does not write payload. Test fixture only: `apps/web/tests/integration/checkout-server-db.spec.ts:331`
still uses the old form for its own fixture row; left alone (test specs belong to another job; it reads nothing back).

## Readers of `stripe_events.payload`

None. Checked in code and on live:
- Code: `settle.ts:532` `stripe_event_begin` and `settle.ts:628` `stripe_event_settle` read id, object_id,
  stripe_created, processed_at, attempts. `webhook.ts:60` enqueues ids only; the consumer re-reads Stripe.
  `dlq.ts` and `packages/db/owner-sql/26.1-verify-reconcile.sql:50` read id/type/attempts/object_id.
  Staff RLS excludes the column (`20260823000023_rls_staff.sql:138`).
- Live (read-only, 03:45 +04): the 5 functions whose body names `stripe_events`
  (`stripe_event_record`, `stripe_event_begin`, `stripe_event_settle`, `checkout_payment_settle`,
  `checkout_extra_payment_settle`) never read `payload`. The one `e.payload ->> 'via'` in
  `checkout_payment_settle` reads `booking_events`; live `booking_events` has 0 non-object payloads.

So no reader breaks today and none needed a change. A future reader must use
`case jsonb_typeof(payload) when 'string' then (payload #>> '{}')::jsonb else payload end`
(written in the header of `stripe-event-record.ts`).

## Live counts (read-only SELECT, Supabase yaumjzvylngfjhtuffqs, 2026-10-02 03:44 +04)

| shape | writer | rows | unprocessed | first | last | unwraps to object |
|---|---|---|---|---|---|---|
| string | webhook (`evt_`) | 65 | 33 | 2026-09-07 | 2026-10-01 | 65 |
| string | return (`return_`) | 7 | 2 | 2026-09-28 | 2026-10-01 | 7 |

72 rows, not 68 (the board number is older). 0 object rows. Every string unwraps to an object.

## Tests

- `apps/web/lib/checkout/stripe-event-record.local.test.ts` (new), own stack `vamos-taxi-sej` on
  127.0.0.1:65322, through the REAL `asSystem` (login vamos_edge, role vamos_system, Worker options),
  read back with `workerSql` (D-07 helper): 2/2 pass.
  - webhook and return writers store `object`; a replay answers duplicate.
  - the exact pre-fix writer stores `string`; a Stripe retry through the new writer is still a
    duplicate and leaves the row as is; `stripe_event_begin` → ok, `stripe_event_settle` → processed,
    `begin` again → already_processed; the unwrap gives back the same object.
  - Mutation check: putting the old writer back turns the first case red with
    `expected 'string' to be 'object'` (the live symptom). Restored.
- `apps/web/lib/checkout/stripe-event-record.test.ts` (new, no database): payload goes as a JSON
  parameter; inserted/duplicate; both writer files call `recordStripeEvent` and contain no
  `stripe_event_record(` or `::jsonb`.
- Touched suites: stripe-event-record (unit + local), return-settle, pay-client-states,
  write-rate-limit, settle, webhook, tests/unit/db-client-guard: 8 files, 116 tests pass.
- `pnpm run typecheck`: pass (all packages). `pnpm run lint`: 0 errors (6 old warnings, none in these
  files). `pnpm run check:db-fences`: 8/8 pass.

## Not verified

- The full gate set (full unit run, pgTAP, from-zero replay, build, i18n, seed, types). The controller runs them.
- A real Stripe webhook delivery and a real return after deploy. After deploy, one 4242 test payment,
  then read-only: `select id, jsonb_typeof(payload) from public.stripe_events order by received_at desc limit 3;`
  — expect `object` for the new `evt_…` and `return_cs_…` rows.
- The Worker build (OpenNext bundle) with this change.

## Proposed UPDATE for the old rows (not run; owner and controller decide)

Not needed for anything to work: nothing reads the column. Only worth it for tidiness, and it touches
a ledger that holds paid-booking events, so it is the owner's call. Run after the deploy, so no new
string row lands after it. No UPDATE trigger on `stripe_events` (only no-delete / no-truncate).
Rehearsed on the local stack inside a rolled-back transaction: 5 string rows → 0, keys readable.

```sql
begin;
update public.stripe_events
   set payload = (payload #>> '{}')::jsonb
 where jsonb_typeof(payload) = 'string'
   and jsonb_typeof((payload #>> '{}')::jsonb) = 'object';
-- expect UPDATE 72 (or 72 plus any string rows written before the deploy)
select jsonb_typeof(payload) as shape, count(*) from public.stripe_events group by 1;
-- expect one row: object
commit;
```

## Seen, not mine (no change made)

- 35 of the 72 rows are unprocessed: 23 at attempts 9 (22 `checkout.session.expired` 09-07..09-12,
  1 `completed` 09-23), 8 `completed` at attempts 1 (09-27..10-01, one with last_error), 4 `expired`
  at attempts 0. Not caused by the payload (nothing reads it). Worth its own look.
- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts:142` casts
  `${serviceAreaJson}::jsonb`; if `serviceAreaJson` is a JSON string it has the same double encoding.
  Not checked (ops pricing, outside this job).
- `rate_version_rules` untouched as instructed.

## Local stack

`vamos-taxi-sej`, ports 653xx, inspector 8653, workdir `tmp/sb653` inside this worktree (gitignored).
Stopped and its volumes removed at the end of this job (03:58 +04); scratch folder deleted.
