# T1 record — item 4: a customer's time request vs a staff change waiting for payment

Builder: job agent, 2026-10-02. Branch `fix/p6-followups`. Nothing staged, nothing committed (the lead commits).
Own stack: `vamos-taxi-p6f`, db port 61622. Live and port 54322 not touched.
The session was cut off by an expired login once; on resume the files, the stack read-back and every check below were re-run and are unchanged.

## Files

New
- `packages/db/supabase/migrations/20261007190000_customer_request_staff_waiting.sql`
- `packages/db/supabase/tests/customer_request_staff_waiting.test.sql` (51 tests)
- `apps/web/lib/ops/customer-request-staff-waiting.local.test.ts` (4 tests, skipped without `VAMOS_LOCAL_DB_PORT`)

Changed
- `apps/web/lib/ops/edit-request-map.ts` — `"staff-change-waiting"` in the `mapEditSqlError` list (comment names 20261007190000); `failStatus("staff-change-waiting")` = 409. (+5 lines)
- `apps/web/lib/ops/edit-request-customer.test.ts` — two tests added. This file already tested `mapEditSqlError`/`failStatus` for the customer codes, so there is no new `edit-request-map.test.ts`. (+50 lines)

`packages/db/database.types.ts` is unchanged: the signature did not change and the generated file is identical, checked before and after the reset.
`20261007150000` was not edited.

## Migration

`booking_edit_request_upsert(uuid,text,uuid,jsonb,bigint)`: the body of `20261007150000` lines 1294-1396 byte for byte, plus one block directly before the supersede (`select r.* into v_prev`). `diff` shows the block as the only difference. The block sits after the lock, after `unpaid` and after `snapshot-mismatch`. It refuses a customer request with `P0001 staff-change-waiting` while a staff request of the booking is `requested` and its extra price record has `expires_at > now()`.
Re-stated: `revoke all … from public`, `from anon` and `from authenticated`, then `grant execute … to vamos_system`, and the comment (the new refusal appended). The header follows the P6/P1 style: what changes, why (P6 review 2, the mirror of P1's `customer-request-waiting`), safe on real paid bookings (no row written; live had 0 rows in `booking_edit_requests` when read on 2026-10-02), rollback = re-apply P6's body.
The file can run twice: I applied it twice with psql without error, then again through the CLI replay.

## Commands and results

| # | Command | Result |
|---|---|---|
| 1 | migration applied twice with psql, then `pnpm exec supabase db reset --workdir …/sbp6f` (all 129 migrations from empty) | pass, no error |
| 2 | new pgTAP file alone (psql), before and again on resume | 51/51 ok |
| 3 | negative control: P6's old body put back, same pgTAP file | tests 12-15, 21, 23, 25, 26, 31, 32 and others fail (the old function supersedes the waiting staff change); my migration re-applied after |
| 4 | `pnpm exec supabase test db --workdir …/sbp6f` after `db reset`, login roles passwordless | Files=96, Tests=2503, Result: PASS (95 existing files + the new one) |
| 5 | `vitest run lib/ops/edit-request-customer.test.ts lib/ops/edit-request.test.ts lib/ops/edit-request-time.test.ts lib/db/system-reads.test.ts` (before and on resume) | 4 files, 27 tests pass |
| 6 | `VAMOS_LOCAL_DB_PORT=61622 vitest run lib/ops/customer-request-staff-waiting.local.test.ts` (after the reset, and again on resume) | 4/4 pass |
| 7 | negative control: P6's old body back, same local test | the two item-4 tests fail (request accepted instead of refused; 3 rows instead of 2); items 1 and 2 pass either way (they prove existing behaviour; no new code); my migration re-applied after |
| 8 | the neighbouring local tests on the same stack: `trip-change.local.test.ts`, `trip-change-patch.local.test.ts`, `lib/checkout/customer-paths.local.test.ts` | 1/1, 1/1, 1/1 pass |
| 9 | `pnpm exec supabase gen types typescript --local --schema public --workdir …/sbp6f` (pinned 2.115.0), output in scratchpad, `diff` vs `packages/db/database.types.ts` | identical (4175 lines), before and after the reset |
| 10 | `pnpm exec tsc --noEmit -p .` in `apps/web` (before and on resume) | exit 0, no output |
| 11 | `pnpm exec eslint` on the three web files | exit 0 |
| 12 | `node scripts/check-db-access-fences.mjs`, `node scripts/check-no-invented-numbers.mjs` | all 8 checks pass; ok |

Env for 6 and 8: `VAMOS_LOCAL_DB_PORT=61622`. `alter role vamos_edge password 'vamos_edge'` and the same for `vamos_public` (the fixture's committed local credentials) were set for the run only, then put back to passwordless; `rolpassword is null` was read back for both. The reset and `test db` ran with the roles passwordless. These files need no hook secret.

## Read-back (reset stack, migration applied by the CLI)

Before (this stack = the live precondition): md5 `c86124b9515b2ff7222ec9d084cfe643`.

```
md5(prosrc) = 6aa5b9702982284ebea92d95c7081d63   prosecdef = t   proconfig = {search_path=""}
proacl      = {postgres=X/postgres,vamos_system=X/postgres}
```

| role | has_function_privilege EXECUTE |
|---|---|
| postgres | t (owner) |
| vamos_system | t |
| anon | f |
| authenticated | f |
| service_role | f (the local stack has no Supabase default grant; live holds one, so the pgTAP ACL check leaves service_role out) |
| vamos_edge | f (login role; it reaches the function as `vamos_system`) |
| vamos_public | f |

Expected on live after the apply: md5 `6aa5b9702982284ebea92d95c7081d63`. The file gives the same md5 when applied with psql and when replayed by the CLI.

## What the tests prove

pgTAP sections (A grants and shape, B refusal, C allowed, D unchanged):
- Refused with `P0001 staff-change-waiting` while a staff request is `requested` with an unexpired extra price record. Afterwards the staff row is still `requested` with its Stripe page id, the booking has exactly one row and nothing was superseded.
- On that same waiting booking, these refusals still fire first: `class-change-staff-only`, both `customer-time-only` shapes, `snapshot-mismatch` and `not-found`. `unpaid` and an unknown actor (`23514 invalid_actor`) still fire.
- Allowed, and the request supersedes (the old request id and its Stripe page id come back), in these cases:
  - the extra record expired a minute ago;
  - `expires_at = now()` exactly (the same boundary as the extra accept's `expired`).
- Withdrawn: allowed, nothing superseded, the staff row stays `withdrawn`.
- Paid (extra settled, request `accepted`): allowed.
- A staff request with no extra price record: allowed and superseded (old behaviour).
- A staff request still supersedes a staff request (one `requested` row left). A customer request still supersedes a customer request.
- The function is SECURITY DEFINER with `search_path=""`. EXECUTE goes to `vamos_system` only (owner and service_role apart; a PUBLIC grant would show as `-`). `anon`, `authenticated` and `vamos_staff` have none. The comment names the refusal.

Worker client: the real `asGuest`, `asCustomer`, `asSystem` and `asStaff` with `fetch_types:false`. Stripe, mail, Mapbox and the write-limiter binding are replaced.
- Item 4, refused:
  - Setup: a paid trip; the owner confirms a dearer change (new pickup at Zug); the request waits; the Stripe page is stubbed.
  - `requestCustomerTimeChange` as guest (manage token) and as signed-in customer both return `{ ok:false, code:"staff-change-waiting" }`.
  - The staff request is still `requested` with the same session id, and its extra record is still alive.
  - The booking's counts of requests, price records and events are unchanged: the cloned price record rolled back with the refusal. No customer row was written. No Stripe page was created or expired.
  - `POST /api/manage/time-change` answers 409 `{ ok:false, code:"staff-change-waiting" }`.
- Item 4, after expiry: the extra record's `expires_at` was set in the past by SQL (triggers off, scratch stack only).
  - The guest request is accepted (`ok:true`); the staff request is `superseded`; the customer request is `requested`.
  - The signed-in door then replaces the guest's request.
  - The booking's time and bound price record never moved.
- Item 2:
  - PATCH `/api/staff/bookings/:id` on a paid Van luxury booking of 10 travellers, with `{pax:13}`, `{pax:11}`, `{pax:13,bags:2}` and `{klass:"economy",pax:2}`: each returns 400 `use-change`. Leg, events and edit requests are unchanged.
  - Trip-change preview for a party of 13 (12 seats + 1): the Economy, Business and Van luxury rows are all `class-too-small`.
  - At 12: Economy and Business are `class-too-small`; Van luxury is not.
- Item 1 data point: a paid Van luxury booking with 10 travellers reads `pax = 10` through `GET /api/manage/booking` (the real route, `manage_booking_read`) and through the signed-in list's select.

## Decisions I had to make

1. The block sits after `snapshot-mismatch`, not before it. Every earlier refusal fires in exactly the situations it did before; only a request that would have superseded a waiting staff change is refused now.
2. The fixture world (`openWorld`) has no Van luxury: it has Economy (4 seats) and Business (7), and the seeded `van` class has 8 seats and no name. I did not edit the fixture. The test adds a 12-seat "Van luxury" class and its rate to the fixture's live price book. That takes one `session_replication_role = replica` insert, because `distance_rates` is frozen once live. Scratch stack only; the rows are committed, as in the other local tests.
3. At 12 travellers the Van luxury preview row reads `trip-data`, not a price: the fixture's saved price record was written before the Van luxury rate existed, so it has no total for that class. That comes from the fixture's data, not from a seat rule. So the test asserts `class-too-small` at 13 and "not `class-too-small`" at 12, not `ok:true` at 12.
4. The extra unit tests went into `edit-request-customer.test.ts` (see Files). One of them drives `requestCustomerTimeChange` with a stand-in `asSystem` that throws `staff-change-waiting`, and checks that the refusal comes back as `{ ok:false, code }`. This proves the catch is around the wrapper, as the postgres.js `begin()` memory note requires.
5. The local test calls the real `POST /api/manage/time-change` and `GET /api/manage/booking` handlers. For that it stubs `next/headers` (the cookie jar) and gives the env a stand-in `QUOTE_RATE_LIMITER_BARE` binding: without it `accountWriteForbidden` fails closed with 429.

## Things the reviewer should know

- The extra price record of a confirmed dearer change lives 24 hours (`booking_edit_mint_extra_snapshot`: `v_until = now() + interval '24 hours'`). An unpaid staff change therefore blocks the customer's time request for up to 24 hours, unless the owner presses Withdraw (the customer can then ask at once) or the difference is paid. That is the signed refusal rule, not a bug, but the customer meets it for that long.
- When the extra record has expired and a customer request replaces the staff request, `requestCustomerTime` still ignores the `old_extra_session_id` the upsert returns, as it did before. By then the Stripe page for the difference has reached its own end (the same 24 hours), so nothing is left open. Not changed here.
- Task 1 changed nothing in `edit-request.ts`, the routes or the pages: they already pass every named SQL refusal through `mapEditSqlError` / `failStatus`. Task 2 reads `result.body.code === 'staff-change-waiting'` and the 409.

## Not verified

- The migration was not applied to live (the controller applies it). The live md5 after the apply should be the expected value above.
- No Chromium run and no page text: that is Task 2.
- Not run here: full `pnpm test:unit`, lint of the whole repo, `lint:css`, `i18n:check`, `seed:check`, `check:legal-claims`, `check:public-env` and the build. The lead runs the full gates once on the merged tip.
- `packages/db/test/local/class-change-reprice.test.ts` was not run (it hard-codes port 54322).
- No fresh-session review yet (money/database change: an Opus review is owed before ship).

## Round 1 fixes (after REVIEW-ITEM4.md, verdict "fix"; findings 1, 2, 3, 5)

The migration `20261007190000` is unchanged (not edited, not narrowed). Nothing staged or committed.

### Changes

| Finding | File | Change |
|---|---|---|
| 1 (blocker) | `apps/web/lib/ops/edit-request.ts` | `openDifferencePayment` now takes `ownSessionId` (the page already on THIS request) or `supersededSessionId` (the page of the request this one replaced). Before, it took `oldSessionId` + `oldExtraSnapshotId`. The own page is reused only while it is open and payable for the same amount, else it is closed. The superseded page is never reused: it is always closed (best effort) and a new page is opened. So one page always belongs to one request. Doc comment rewritten; the file header line on D-73 updated. The now unused `loadEditSnapshotTotal` import is removed. A private `closePage` helper does the best-effort expire. |
| 1 | `apps/web/lib/ops/edit-request.ts` (`acceptPaidEdit`) | passes `ownSessionId: accepted.extra_session_id` (the re-accept of the same request). |
| 1 | `apps/web/lib/ops/booking-change.ts` (~675), `apps/web/lib/ops/booking-trip-change.ts` (~385) | the staff class and trip changes pass `supersededSessionId: row.old_extra_session_id`. |
| 2 | `apps/web/lib/ops/booking-change.ts` (`withdrawBookingChange`) | a waiting staff request with no `extra_session_id` skips the Stripe step and calls `booking_change_withdraw` directly. The SQL still refuses anything that is not a waiting staff change with a price record, and that refusal maps to `nothing-waiting`. Doc comment updated. |
| 3 | `apps/web/lib/ops/edit-request.ts` (`requestCustomerTime`) | after a successful customer upsert, the returned `old_extra_session_id` is closed best effort. A Stripe failure, or no Stripe key, never fails the request. |
| 5 | `packages/db/supabase/tests/customer_request_staff_waiting.test.sql` | D2b, 3 tests (plan 51 → 54): a customer request that carries an unexpired extra price record does not block the next customer request, and is superseded as before (the `r.actor = 'staff'` filter). |

Tests:
- New `apps/web/lib/ops/difference-page.test.ts` (5 tests):
  - a superseded page is closed and a new one opened, even while it is payable for the same amount;
  - closing it is best effort;
  - the own page is reused when payable;
  - the own page is closed and replaced when it is another amount, expired or unreadable;
  - with no earlier page, nothing is closed.
- `apps/web/lib/ops/booking-change-withdraw.test.ts`: the old case "no page → nothing-waiting" is replaced by a finding-2 test:
  - no page (null or empty): no Stripe call, `booking_change_withdraw` is called, the answer is ok;
  - the SQL's own `nothing-waiting` is still mapped.
- `apps/web/lib/ops/edit-request-customer.test.ts`: one finding-3 test (the replaced page is closed; a Stripe refusal still answers ok; no page means no Stripe call). The Stripe module is mocked there now. The new test sits before the existing `vi.doUnmock` test, because that one drops the file's identity mock.
- No existing test asserted cross-request reuse, so none had to change for finding 1.
- `apps/web/lib/ops/customer-request-staff-waiting.local.test.ts`, finding 5: the item-4 test now also calls the real `POST /api/account/bookings/time-change` handler (`customerClaims` mocked to the signed-in owner). It answers 409 `{ok:false, code:"staff-change-waiting"}`, writes nothing, and the staff row is unchanged.
- New `apps/web/lib/ops/customer-request-staff-pages.local.test.ts`, findings 1 and 2. This is a second file because one run of six tests used up the stack's 100 connection slots, the same reason P6 has two trip-change files. Run the two files one after the other.
  - Finding 1: the owner confirms the same dearer trip change twice (same difference; the first page is stubbed as open and payable for exactly that amount, so the old code would have reused it).
    - Afterwards: two staff rows, `superseded` with page 1 and `requested` with page 2, two pages created, and page 1 closed.
    - Within the booking, no page is shared.
    - Paying page 2 through the real `checkout_extra_payment_settle`: `applied=true`, request 2 `accepted` with its payment, pickup now Zug station, `refund_status='none'`, and a customer time request afterwards is accepted.
  - Finding 2: a dearer change whose `extra_session_id` was nulled by SQL (the state the review found reachable).
    - The customer is refused with `staff-change-waiting`.
    - Withdraw answers ok with no `expireCheckoutSession` or `retrieveCheckoutSession` call; the staff row is `withdrawn`.
    - A customer request is then accepted.

### Where it ran

Stack `vamos-taxi-p6f` was in use by another session's browser proof (Worker on 4790/4791, then a new seed run at 13:01). My local tests retire every live price book and a reset wipes rows, so I asked the coordinator. On their instruction I used a second scratch stack, `vamos-taxi-p6g` (db 61722), started from empty. I did not reset p6f and did not run tests on it. p6g was stopped after the run (`supabase stop --no-backup`, project filter p6g only; no p6g container left).

### Commands and results

| # | Command | Result |
|---|---|---|
| R1 | `pnpm exec supabase start --workdir …/sbp6g` (129 migrations + seed from empty) | ok |
| R2 | `pnpm exec supabase test db --workdir …/sbp6g`, login roles passwordless | Files=96, Tests=2506, Result: PASS (the new file runs 54) |
| R3 | read-back on p6g | md5 `6aa5b9702982284ebea92d95c7081d63`, prosecdef t, proconfig `{search_path=""}`, proacl `{postgres=X/postgres,vamos_system=X/postgres}`; EXECUTE: postgres t, vamos_system t; anon, authenticated, service_role, vamos_edge and vamos_public f (unchanged) |
| R4 | `gen types` on p6g vs `packages/db/database.types.ts` | identical |
| R5 | `VAMOS_LOCAL_DB_PORT=61722 vitest run lib/ops/customer-request-staff-waiting.local.test.ts` | 4/4 pass |
| R6 | same for `lib/ops/customer-request-staff-pages.local.test.ts` | 2/2 pass |
| R7 | negative control: the committed (pre-fix) `edit-request.ts`, `booking-change.ts` and `booking-trip-change.ts` written back with `git show HEAD:…` for one run | R6 fails 2/2: finding 1, the two requests share one page; finding 2, `nothing-waiting`. Fixed files restored, md5 identical to before the control. |
| R8 | `trip-change.local`, `trip-change-patch.local`, `booking-change.local`, `lib/checkout/customer-paths.local` on p6g, one at a time | 1/1 each |
| R9 | `vitest run` difference-page, booking-change-withdraw, edit-request-customer, edit-request, edit-request-time, staff-hosted-pay, booking-change, booking-trip-change, lib/db/system-reads | 9 files, 94 tests pass |
| R10 | `pnpm exec tsc --noEmit -p .` (apps/web) | exit 0 |
| R11 | `eslint` on the 8 touched web files | exit 0 |
| R12 | `node scripts/check-db-access-fences.mjs` | all 8 checks pass |

Role passwords were set on p6g for R5-R8 only, then put back to passwordless before the stop.

### Notes for the re-review

- The table-wide "no shared page" check in R6 at first counted the shared page left by the R7 control run on the same scratch stack. It is now scoped to the test's booking. The R7 failure happens earlier, at the two-pages assertion, so the control still holds.
- Older behaviour, left as it was (not one of the findings): when the same request's own page is no longer payable, the new page uses the same Stripe idempotency key `extra:<request>:<difference>`. Within Stripe's idempotency window, Stripe may return the old (expired) page. The code before this round did the same.
- Not done here (the review's separate money-migration suggestion): making `checkout_extra_payment_settle` pick its request deterministically. With the TypeScript fix, no new page is shared any more. Pages shared before this fix can only exist on live if an owner confirmed the same difference twice; live had 0 edit requests on 2026-10-02.
- Finding 4 (copy that names an e-mail that may not have gone out) is a UAT note, not code.

### Round 1: not verified

- No Chromium run of the dashboard Withdraw or of the pages.
- Not on live; the full gates and the build are for the lead.
- Not re-reviewed yet.

## Round 2 fixes (after REVIEW-ITEM4-R2.md, verdict "safe" with warnings; warnings 1, 2 and 4)

Unit tests only; no Supabase stack was started. The migration is unchanged. Nothing staged or committed.

### Changes

| Warning | File | Change |
|---|---|---|
| 1 | `apps/web/lib/ops/booking-change.ts` (`withdrawBookingChange`) | The row `booking_change_withdraw` returns is now read. If it names a page this call did not close (the confirm on another device stored it between the read and the withdraw), that page is closed afterwards through `expireSupersededPage` (best effort; a Stripe refusal does not fail the withdrawal). When the page is the one already closed, it is not closed twice. |
| 2 | `apps/web/lib/ops/edit-request.ts` (`openDifferencePayment`) | The idempotency key is now `extra:${requestId}:${difference}:${ownSessionId \|\| "0"}`, so a replacement page for the same request and amount is a new Stripe request, not a replayed key; retries of the same state stay idempotent. When `retrieveCheckoutSession` throws on the own page, the answer is `stripe-failed` and the page is left alone (it is no longer closed on a failed read). Doc comment updated. |

Correction to my Round 1 note: I wrote that a replayed key "may return the old page". The reviewer is right that Stripe answers `idempotency_error` instead (the expiry differs every second), which the code turned into `stripe-failed`. Warning 2's key fixes that case.

### Tests

| Warning | File | Test |
|---|---|---|
| 1 | `booking-change-withdraw.test.ts` | "a page stored between the read and the withdraw is closed after it": the read has no page; the SQL returns `cs_test_late`. The order is database then Stripe, `expire` is called once with `cs_test_late`, and the answer is ok. A Stripe refusal of that close still answers ok. |
| 1 | same file | "not closed a second time": a page closed first and named again by the SQL is expired once. |
| 2 | `difference-page.test.ts` (replaces the old lines 105-120) | A fake Stripe with real idempotency (a key it has seen, with different parameters, throws `idempotency_error`). First page: key `…:3000:0`. Own page another amount, then expired: each time a new page, the own page closed, the new page stored, key `…:3000:<own page>`. Three keys in total, none replayed. |
| 2 | same file | own page unreadable: `stripe-failed`, no expire, no create, nothing stored. |
| 2 | same file | test 1 now expects key `extra:<new request>:3000:0`. |
| 4 | `booking-change.test.ts` | The class-change confirm with `old_extra_session_id: "cs_test_old"` calls `openDifferencePayment` with `supersededSessionId: "cs_test_old"`, no `ownSessionId`, and no `oldSessionId`. |
| 5 (info, same files) | `difference-page.test.ts` test 2 | now asserts `expire` was called with `cs_test_a`. |
| 5 (info, same files) | `booking-change-withdraw.test.ts` | the SQL's own `nothing-waiting` case now asserts that the `booking_change_withdraw` call happened. |

### Commands and results

| # | Command | Result |
|---|---|---|
| S1 | `vitest run` difference-page, booking-change-withdraw, booking-change, booking-trip-change, edit-request-customer, edit-request, edit-request-time, staff-hosted-pay, lib/db/system-reads | 9 files, 98 tests pass |
| S2 | negative control: the round-1 `edit-request.ts` and `booking-change.ts` (HEAD 5152fafb) written back with `git show` for one run | 4 tests fail: warning 1, both warning 2 tests, and test 1's key. Files restored, md5 identical (`d7d5e77f…` edit-request, `358df71a…` booking-change). |
| S3 | negative control: the class-change call site changed to `ownSessionId` for one run | the warning-4 test fails; file restored, md5 identical |
| S4 | `pnpm exec tsc --noEmit -p .` (apps/web) | exit 0 |
| S5 | `eslint` on the 5 touched files | exit 0 |

### Round 2: not done here, and not verified

- Warning 3 (ship order) is for the controller:
  - run the read-only "shared page" query on live just before the apply;
  - apply the migration and deploy the Worker in one ship, and roll back both or neither.
- Info 6, 7, 8, 10 and 11 and the older P-1, P-3 and P-4 are not changed: they were out of this round's scope.
- Local-database tests were not re-run in round 2 (no stack, by instruction). The two changes act only on Stripe calls and the withdraw's return value.

## Round 3 fixes (after REVIEW-ITEM4-R3.md, verdict "fix"; blocker 1, warnings 2 and 3)

Unit tests only; no Supabase stack was started. The migration is unchanged. Nothing staged or committed.

### Changes

| Finding | File | Change |
|---|---|---|
| 1 (blocker) and 2 | `apps/web/lib/ops/edit-request.ts` | A new helper, `closeOwnPage`, decides what happens to the request's own page when it does not pay this difference. Details below. Doc comment updated. |
| 3 | same file | The idempotency-key comment now says what really happens (details below). |
| 1 | `apps/web/lib/ops/edit-request-map.ts` | `failStatus("already-paid")` = 409. The Accept route already answers with `failStatus`, so it now returns 409 `{ok:false, code:"already-paid"}`. No customer route can produce that code. |
| 1 | `app/ops/OpsDetail.dc.html` | New key `acceptPaid` in all four language tables. The Accept handler, on `already-paid`, reloads the booking and shows `t.acceptPaid` instead of "Could not apply edit". |

How `closeOwnPage` treats the own page:

| Stripe says | Answer | What happens |
|---|---|---|
| `complete` (already paid) | `already-paid` | Nothing is closed, made or stored. |
| `expired` | (replaced) | Nothing to close; a new page is made. |
| any other status | depends on the close | The page is expired. A new page is made only if Stripe confirms the close: the expire answers `expired`, or a fresh read says `expired`. If the fresh read says `complete`, the answer is `already-paid`; any other answer (still open, unreadable) is `stripe-failed`. In both of those cases nothing is made or stored and the page stays as it is. |

This also covers the changed-amount case (warning 2): an own page still open for an old amount is replaced only after a confirmed close.

The corrected key comment says:
- the key does not make a retry return the first page;
- Stripe replays a key only for identical parameters, and `expiresAt` moves every second, so a retry of the same state is refused (`idempotency_error`, answered as `stripe-failed`) and no second page is made;
- a page made but never stored stays open for 24 h, with a url that never left the server.

The dashboard text:

| Language | `acceptPaid` |
|---|---|
| en | The customer has already paid the difference. The change is applied when the payment is recorded. |
| de | Der Kunde hat die Differenz bereits bezahlt. Die Änderung gilt, sobald die Zahlung verbucht ist. (Swiss, no ß) |
| fr | Le client a déjà payé la différence. Le changement s’applique dès que le paiement est enregistré. |
| ar | دفع العميل الفرق بالفعل. يُطبَّق التغيير عند تسجيل الدفعة. |

The wording follows the neighbouring keys of each table (`mustFix`, `withdrawPaid`).

### Tests

`apps/web/lib/ops/difference-page.test.ts`:
- **The fake Stripe now follows Stripe's real rule.** A key it has seen returns the same page for identical parameters (`expires_at` compared to the second, as `stripeSessionExpiresAtUnix` sends it) and `idempotency_error` for different ones.
- **`beforeEach` now resets the mocks fully.** On the old code, a queued one-off answer leaked from one test into the next.
- **New tests:**
  - an own page that is `complete` answers `already-paid`: no expire, no create, nothing stored;
  - an own page open for another amount whose expire Stripe refuses, then re-read:
    - re-read `complete`: `already-paid`;
    - re-read `open`: `stripe-failed`;
    - in both: one expire attempt, two reads, no create, nothing stored;
  - a refused close that the re-read reports `expired` counts as closed, and a new page is made;
  - a retry of the same state (the first page made but not stored), with frozen clocks:
    - in the same second, Stripe replays the same page;
    - in a later second, `stripe-failed`, and nothing is stored.
- **Changed tests:**
  - the round-2 "replacement" test: an expired own page is no longer expired again (no expire call);
  - a cosmetic fix: the retrieved page now carries the own page's id.

New `apps/web/lib/ops/ops-accept-paid-dc.test.ts` (3 tests): `failStatus("already-paid")` is 409; the Accept handler maps `already-paid` to `t.acceptPaid` (with a reload) before the generic failure; the `acceptPaid` line exists four times with the texts above, the German without ß.

### Commands and results

| # | Command | Result |
|---|---|---|
| T1 | `vitest run` ops-accept-paid-dc, ops-p6-edit-dc, ops-class-change-dc, ops-p6-server-dc, difference-page, booking-change-withdraw, booking-change, booking-trip-change, edit-request-customer, edit-request, edit-request-time, staff-hosted-pay, lib/db/system-reads | 13 files: 137 pass, 1 fail. The failure predates this round (see the not-mine section). |
| T2 | negative control: `edit-request.ts`, `edit-request-map.ts` and `OpsDetail.dc.html` of 0d588250 written back with `git show` for one run | 6 tests fail: the 3 DC/route pins, the paid page, refused close then paid or open, and "an expired page is not expired again". Files restored, md5 identical (`7de0f547…` edit-request, `e20c61b8…` edit-request-map, `dd7f82fb…` OpsDetail). |
| T3 | `pnpm exec tsc --noEmit -p .` (apps/web) | exit 0 |
| T4 | `eslint` on edit-request.ts, edit-request-map.ts, difference-page.test.ts, ops-accept-paid-dc.test.ts | exit 0 |
| T5 | `node scripts/check-i18n-coverage.mjs` (i18n:check) | passed: 2685 keys. It checks the Next messages; the OpsDetail tables are pinned by the DC test above. |

### Found, not mine, not changed

- `lib/ops/ops-p6-edit-dc.test.ts:161` ("design laws … no tint or glow on the new rules") fails on HEAD.
- It expects `[dir="rtl"] [data-ops-chg-arrow]{transform:scaleX(-1)}` in OpsDetail, but commit 8b304058 (Task 4, "arrows and chevrons mirror once in Arabic, from the law only") removed that local rule and did not update this pin.
- `git show HEAD:app/ops/OpsDetail.dc.html` has 0 matches.
- Task 4's owner should drop or invert that one assertion.

### Round 3: not done here, and not verified

- Not done from R3: closing a page that this call made when `set_extra_session` then fails (warning 3's optional second part), and treating a missing page (404) as replaceable (info 6). Both are outside the coordinator's list for this round.
- Info 4 (expired events of replaced pages retried into the dead-letter queue) and info 5 (device B mails a closed link) are not changed, and neither are R2's ship order (warning 3) and the older P-1, P-3 and P-4.
- No Chromium run of the Accept toast. No local-database run this round. Not re-reviewed yet.
