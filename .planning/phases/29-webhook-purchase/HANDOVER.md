# Phase 29 hand-over: Meta Purchase from the Stripe webhook path

Branch `gsd/phase-29-purchase`, not pushed by this session. Built by a job session: no commit on main, no push of main, no deploy, no write to the live database, no live MCP call.

A fresh reviewer session, not the builder, reads this before ship: it touches money settlement, consent and what leaves for Meta.

Base: origin/main `62ed97c0` (already merged; contains c5039143 fare lines and migration 20261007230000). The last fetch on 2026-10-03 17:2x UTC showed nothing new, so the last merge was "Already up to date". The controller re-reads `git log -3`, `origin/main` and the live version before ship.

## 1. What was built

| Plan | What | Commits |
|---|---|---|
| 29-01 | merge main, own native stack, baseline | 226fc13b, 7be8ce37 |
| 29-02 | migration `20261007260000_meta_purchase.sql`, pgTAP, types | 88bf51d1 (red), c544a116 |
| 29-03 | `apps/web/lib/meta/capi.ts` payload and single POST | 03e39371, 7dac49c8 |
| 29-04 | Pay press saves the consent subject (4-arg writer) | f8153fc0, 69538759 |
| 29-05 | `apps/web/lib/meta/purchase.ts` orchestrator, Worker-client proof, fence entry | 7d83f2a2, bbb40983, 574ffb36 |
| 29-06 | settle queue calls the Purchase; return route pinned out | bf8d5fdf, e0ca15f7 |
| 29-07 | typecheck fix in a Phase 29 test, this hand-over | bc6bd568, this commit |

Pay-path files (quote, pricing, checkout and confirmation pages, return route, return-settle, intent lib, stripe lib) are untouched: the stat diff against origin/main is empty. The intent route and `settle.ts` are changed on purpose.

## 2. Migration, ship order

`packages/db/supabase/migrations/20261007260000_meta_purchase.sql`. Additive: one nullable column (`bookings.meta_consent_subject`), one empty table (`meta_purchase_events`, RLS enabled and forced), the 4-arg writer next to the 3-arg one (the 3-arg one is replaced so it also clears the consent subject), the trigger re-created over three columns, four definer functions: `meta_purchase_claim`, `meta_purchase_finish`, `meta_purchase_clear_ids` and `meta_purchase_sweep` (all with lock_timeout 2s and statement_timeout 5s). Safe on live paid rows (nothing is backfilled).

The file is one transaction (`begin;` ... `commit;`). Apply it verbatim, as one transaction (connector `apply_migration`, never `execute_sql` statement by statement, never in pieces).

Order: (a) apply the file verbatim through the Supabase connector; (b) read back (section 3); (c) deploy `pnpm --filter web run deploy -- --env staging` (Worker `vamos`); (d) live check (section 6).

Deploy gap, both directions safe (research Pitfall 10): old Worker plus new DB, the 3-arg writer still works and claims never happen. New Worker plus old DB, the 4-arg writer and the claim fail with 42883, are caught and logged, Pay and settle are unaffected. Migration first is still the rule. The 3-arg writer stays in the database for this reason; the Worker calls the 4-arg one.

## 3. Hosted read-only checks after apply

1. `bookings` row count equal before and after.
2. `select count(*) from bookings where meta_consent_subject is not null` is 0.
3. `meta_purchase_events` is empty.
4. `has_function_privilege`: `meta_purchase_claim`, `meta_purchase_finish`, `meta_purchase_clear_ids`, `meta_purchase_sweep` true only for `vamos_system`; the 4-arg `checkout_set_meta_click_ids` true only for `vamos_checkout`. anon, authenticated, vamos_guest, public false. `service_role` may be true on hosted (it is true locally too).
5. `has_column_privilege('authenticated'|'vamos_guest','public.bookings','meta_consent_subject','SELECT')` false.
6. `meta_purchase_events`: `relrowsecurity` and `relforcerowsecurity` both true.
7. Trigger `bookings_meta_click_ids_pending_only` is enabled (`O`) and fires on `INSERT OR UPDATE OF meta_fbp, meta_fbc, meta_consent_subject`.
8. md5 of `pg_get_functiondef(oid)` equals the local values (read from the own stack on 2026-10-03):

| md5 | function |
|---|---|
| 7812387444a2045b5cc8f0745acb2a2e | checkout_set_meta_click_ids(uuid,text,text,uuid) |
| c84ea82a9172717cb7bf960b62aa3b44 | checkout_set_meta_click_ids(uuid,text,text) (replaced: clears the consent subject) |
| 6e51e9a137e25ad9fabae6e2449ef7f2 | tg_bookings_meta_click_ids_pending_only() |
| 187d1eb46c348d9cec6be3f818f59bb5 | meta_purchase_claim(uuid,bigint,text,boolean,boolean,text) |
| fa9f141957d7c85c320a9d14bbc497fa | meta_purchase_finish(uuid,uuid,text,integer,integer,integer) |
| 44b30de59aab9fcdff8ee744e4bafb07 | meta_purchase_clear_ids(uuid) |
| 104302525db4942445d4a1dc025374e7 | meta_purchase_sweep() |

## 4. Config

- `META_TEST_EVENT_CODE`: MISSING. The owner's answer to the code request contained no code, so no value was added to `wrangler.jsonc` (and none was invented). Before deploy the owner gives the code to the controller (Events Manager, pixel 1595596972063765, Test events). The controller then adds it to `env.staging.vars` only, never to top-level vars or `env.production`, with the comment from plan 29-07 step 1. Until then a Stripe test-mode payment sends nothing, by design (D-07): the row is recorded with the worker skip reason `no_test_code`.
- `META_CAPI_ACCESS_TOKEN` must exist as a secret on Worker `vamos` (name only; the owner says it does). This session never read, printed or logged it.

## 5. Gates and results (own stack `vamos-taxi-290`, native runtime, after reset from zero)

Verified (UTC, 2026-10-03):

| Gate | Result | Time |
|---|---|---|
| pgTAP (reset, then pgtap) | PASS, 102 files, 2824 tests | 17:22 |
| roles | ok | 17:22 |
| test/local meta-purchase, meta-click-ids, consent-reader | 3 files, 9 tests pass | 17:22 |
| `pnpm test:unit` | db 14, emails 247, web 4768 passed / 31 skipped (413 files passed, 16 skipped), 0 failed | 17:22 |
| `pnpm typecheck` | pass after fix bc6bd568 (see failed list) | 17:2x |
| `pnpm lint`, `lint:css` | pass | 17:23 |
| `check:numbers`, `check:legal-claims`, `check:public-env`, `check:db-fences` | pass | 17:23 |
| `i18n:check`, `db:seed:check` | pass | 17:23 |
| `pnpm build` | pass | 17:30 |
| `opennextjs-cloudflare build` | pass, Worker saved to `.open-next/worker.js` | 17:34 |
| must-not greps on added non-planning lines | live-key prefix 0, old .eu host 0, `CHF [0-9]` 0, `client_user_agent|client_ip_address|external_id` 0 | 17:35 |
| Graph URL, pixel id, token name | only in capi.ts, purchase.ts, env.d.ts and their tests | 17:35 |

Failed, then fixed: the first `pnpm typecheck` failed with TS2345 in `packages/db/test/local/meta-purchase.test.ts` line 42 (`null` passed where the system identity takes `undefined`). Fixed in bc6bd568; typecheck and that test re-ran green. The full unit and lint runs preceded this one-line test-file change; the changed file was re-run on its own.

Not verified:
- `pnpm db:types:check` did not run. It uses the pinned supabase CLI 2.115.0, which needs Docker (off, not started). Substitute proof: native CLI 2.119.0 (`/opt/homebrew/bin/supabase gen types typescript --db-url ...?sslmode=disable --schema public`) against the own stack, compared with `packages/db/database.types.ts` after stripping whitespace, quotes and separators. Proven identical for the Phase 29 objects: table `meta_purchase_events` (Row, Insert, Update, Relationships), the `meta_purchase_claim`, `meta_purchase_finish` and `meta_purchase_clear_ids` Args and Returns, and `bookings.meta_consent_subject` (Row/Insert/Update). NOT proven: byte identity of the whole file. The two generator versions differ in style (`NonNullable<Json>` against `Json`, quoted enum indexes, a `Json` header), 258 such differences, none in Phase 29 objects. The controller's clean-clone `db:types:check` (with Docker or the pinned CLI) is the proof for the whole file.
- The live check in section 6 (Meta accepting the payload) is not done by this session. Research assumption A1: Meta documents the user agent as required for website events, and the locked payload has none.
- No Stripe test payment, no Graph call, no browser run happened.

## 6. Live check, for the controller and the owner (not done by this session)

1. Owner opens Events Manager, pixel 1595596972063765, Test events, and gives the controller the test code (section 4).
2. On https://vamostaxi.site press Accept all, book, pay with 4242 (Stripe test mode).
3. Controller reads read-only: `booking_payments` for that booking, then `select state, skip_reason, test_event, http_status, graph_code, graph_subcode, claimed_at, finished_at from public.meta_purchase_events where booking_id = '<id>'`, and that `meta_fbp`, `meta_fbc`, `meta_consent_subject` on the booking are NULL.

Expected: state `sent`, test_event true, http 200, one Purchase under Test events with the francs charged.

If state is `rejected`: STOP and ask the owner, with the Graph code and subcode. Do not widen the payload (META-14).

If `failed`: read the Worker log line `meta_purchase` (http, code) and report. No resend.

## 7. Decisions taken at Claude's discretion

Send inline in the queue consumer; table `meta_purchase_events`; Graph v26.0; 5 s timeout; no retry. Worker-level refusals (gate_closed, no_token, no_test_code) and refund_required are recorded on the row and wipe the ids (D-05, D-06). A later payment of the same booking writes no row and clears nothing. The claim reads consent as of now (D-01).

## 8. Claim-failure case (D-05)

If the claim call fails (42883 before the migration, or a database error), the Worker wipes the ids best-effort with `meta_purchase_clear_ids`. If that also fails, values can stay on a paid booking. The Worker's daily `0 3 * * *` cron also calls `meta_purchase_sweep()` (WR-02): it covers interrupted queue runs too (a message cut off between the settle commit and the claim is never redelivered into the claim). For a non-pending booking that still holds any of the three values and either already has a row, or has a first succeeded payment older than 7 days, or has not been touched for an hour, it empties them and, when no row exists and a succeeded payment exists, records `skipped` / `interrupted` (no Purchase, D-06). It logs the count only (`meta_purchase_sweep cleaned=N`). Read-only query for the controller after deploy and weekly until the first live sale (ids only, never select the values):

`select b.id, b.status from public.bookings b where b.status in ('paid','confirmed','assigned','completed') and (b.meta_fbp is not null or b.meta_fbc is not null or b.meta_consent_subject is not null) and not exists (select 1 from public.meta_purchase_events e where e.booking_id = b.id)`

Any row: clear with one numbered owner step, never by a session on live.

## 9. Rollback

Fast kill switch: `META_EVENTS_MANAGER_SWITCHES_OFF = false` in `legal-gate.ts` and the loader literal (stops PageView and Purchase; Purchase refusals then record `gate_closed`). Or revert the merge. The migration needs no rollback: the column and table stay empty or inert.

## 10. Left running

Nothing. The own stack `vamos-taxi-290` was stopped (port 62322 no longer listening); no `apps/web/.next-*` folder exists; working tree clean. `.open-next/` is build output, not tracked.
