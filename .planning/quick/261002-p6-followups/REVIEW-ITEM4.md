VERDICT: fix

# Review — item 4 (commit 1181e49d): a customer's time request vs a staff change waiting for payment

Reviewer: a new Opus session that did not build this. Read only. One probe ran on the builder's scratch stack (`vamos-taxi-p6f`, port 61622) inside BEGIN … ROLLBACK, and nothing was kept. Date: 2026-10-02.

The migration is correct as written and is safe to apply on live. The fix is needed because of finding 1. The new refusal assumes two things: a paid difference means the request is `accepted`, and a dead page means the request is `superseded`. One reachable path breaks both: a Stripe page shared by two requests. If this ships as is, a customer who has already paid is told "pay the difference first" and cannot ask for a new time for up to 24 h. The owner cannot clear it.

## Answers to the six questions

**1. Body, grants, running twice, live safety: correct.**
- `diff` of `20261007150000:1294-1396` against `20261007190000:39-156` shows two differences: the added block (`:115-128`, with its comment) and a blank line after `$$;`.
- The md5 of the text between `$$…$$` was computed straight from the files:
  - P6: `c86124b9515b2ff7222ec9d084cfe643`. This equals the live precondition in T1-RECORD.
  - New: `6aa5b9702982284ebea92d95c7081d63`. This equals the expected value.
- Signature, return table, `security definer` (`:53`) and `set search_path = ''` (`:54`) are the same as in P6.
- Grants:
  - P6 did not re-state grants for this function. Its ACL comes from `20260910175309:506-512`: revoke from public, grant to vamos_system.
  - The new file (`:158-169`) revokes from public, anon and authenticated, and grants to vamos_system.
  - It does not touch service_role, so live keeps postgres, service_role and vamos_system.
  - The comment (`:171-174`) adds the new refusal.
- Running twice is safe: create or replace, revoke, grant and comment are all idempotent.
- Live safety: the file has no DML and no backfill. Only the function's pg_proc row is replaced, and no table is locked. Live had 0 edit requests.

**2. Correctness and races: correct, with the exceptions in findings 1 and 2.**
- When the block fires:
  - Only for `p_actor = 'customer'` (`:116`).
  - Only for a staff row (`r.actor = 'staff'`, `:121`) that is `requested` (`:122`).
  - The staff row is joined through `extra_snapshot_id` (`:119`), so a null id never matches.
  - Only while `x.expires_at > now()` (`:123`). That is the exact complement of accept's `expired` check (`20261007140000:538-543`).
- It runs after the booking row lock (`:85-89`) and after the `unpaid` and `snapshot-mismatch` checks.
- It is serialised with every other writer:
  - The staff class and trip changes lock the booking first (`20261007140000:795-800`, `20261007150000:633-639`).
  - Withdraw locks the booking first (`20261007140000:963`).
  - Settle and accept lock the request first, then the booking (`:1057-1071`, `:509-528`).
  - If one of these holds the booking, the upsert waits. Its next statement then reads their commit (read committed).
  - If the upsert holds the booking first, it sees the staff row as `requested` and refuses. That is the safe direction. It also cannot deadlock here, because the block raises before the upsert's own `for update` on the request (`:130-135`).
- A staff request that is `requested` with no extra price record: P1 and P6 cannot leave one.
  - Both call upsert and then accept in the same transaction (`20261007140000:885-895`, `20261007150000:880-886`).
  - Accept either sets the row to `accepted` or sets `extra_snapshot_id` (`20261007140000:594-606`).
  - Only a direct staff upsert leaves one (the tests, and the old 08-07 shape). It has nothing to pay, so not blocking is the right call.
- Page clock vs record clock:
  - The record expires at `now() + 24h`, where `now()` is the start of the database transaction (`20260910175309:235/352`).
  - The page expires at the Worker's `Date.now() + 24h`, capped at now + 24h − 30 s (`stripe.ts:70-76`, `edit-request.ts:171`).
  - So the page ends about 30 s before its record. The only exception would be a Stripe call that starts more than 30 s after the transaction.
- A payment that still reaches a superseded request (for example a webhook Stripe retries after the customer's request replaced the staff one):
  - It takes the else branch of `checkout_extra_payment_settle` (`20261007140000:1245-1254`).
  - The money is recorded, the booking goes back to its own record, and the overpayment shows as Refund due (`:1256`).
  - The change is not applied, and nothing is applied twice. No money is lost.
  - Finding 1 is the case where the payment lands on the wrong row by accident.

**3. Other callers: none.**
- The only code that passes `'customer'` is `edit-request.ts:373-379` (`requestCustomerTime`).
- Only `POST /api/manage/time-change` and `POST /api/account/bookings/time-change` reach it.
- The SQL callers pass `'staff'` (`20261007140000:887-891`, `20261007150000:882`).
- There is no older route.

**4. Error mapping: correct.**
- The catch sits around `await asSystem(...)` (`edit-request.ts:355-392`), not inside it.
- `mapEditSqlError` matches the message, and `failStatus` returns 409 (`edit-request-map.ts:79-81, 95-96`).
- Both routes answer `{ok:false, code}` with that status (manage `route.ts:60`, account `route.ts:53`).
- The local test proves the 409 body on the real manage handler.

**5. Tests: they prove what they claim.**
- pgTAP sections B, C and D are sound.
- The negative control in T1-RECORD shows the old body fails the new tests.
- The Worker-client test covers both doors (manage link and signed in). It proves that nothing is written (counts of requests, price records and events). It also proves the request is accepted after expiry.
- The "earlier refusals still fire" lines also pass on the old body. That is expected: they guard against regressions.
- Gaps are listed in finding 5.

**6. Pages and dictionary: correct.**
- The check is at `manage-booking.dc.html:933-936` and `booking-detail.dc.html:925-928`. It reads `result.body.code`, and the body is parsed on non-2xx answers too (`vamos-manage-ticket.js:42`).
- `app/vamos-i18n-dict.js:2257` holds one key. A script compared en, de, fr and ar with `.planning/decisions/2026-10-02-p6-followups.md`: byte-identical, including the French `’` (U+2019).
- Both pages call `t()` with exactly that key.

## Findings

### 1. BLOCKER: one Stripe page shared by two requests
The paid difference lands on the superseded request. The new rule then refuses the customer and tells them to pay first, for up to 24 h. The root of this is older code from P1/P6; this commit turns it into a lockout.

**Evidence: how two requests end up with one page**
- The staff paths pass the superseded request's page to `openDifferencePayment` (`booking-trip-change.ts:385-391`, `booking-change.ts:675-681`).
- When the new difference equals the old one, the page is reused (`edit-request.ts:134-139`).
- The same page id is then stored on the new request (`:186-194`).
- The upsert leaves the id on the superseded row (`20261007190000:138-141`).
- `extra_session_id` has no unique index.
- `checkout_extra_payment_settle` picks its request by page id with no `order by` (`20261007140000:1057-1061`).

**Evidence: the rolled-back probe on the scratch stack**
- Setup:
  - A booking is paid 10.
  - Staff class change to a total of 13: request A, page `cs_rvw`.
  - A second staff change at the same total 13: request B. B gets the same page id, as the Worker's reuse would give it.
- Result:
  - The settle's own query picks A, which is `superseded`.
- If the page is paid:
  - `applied = false`.
  - A carries the payment.
  - B stays `requested`.
  - The class is unchanged.
  - `refund_status = pending_ops`.
  - A customer time request is then refused: `ERROR: staff-change-waiting`.
- If the page expires unpaid instead:
  - A is picked again.
  - B stays `requested`, so the customer is refused until B's own price record expires.
  - B's record was created at the second change, so it outlives the dead page by the time between the two changes.
- In the paid case, the owner's Withdraw answers `already-paid` (`booking-change.ts:910-917`). There is no clean way out before the record expires.

**How it is reached:** the owner confirms the same change a second time (for example to resend after `mailed:false`), or corrects an address and the price comes out the same.

**Fix (smallest, TypeScript only)**
- `openDifferencePayment` must never give one page to two requests.
- When the old page belongs to a superseded request (the staff paths), always expire it and open a new one.
- Keep reuse only for the same request (the re-accept in `acceptPaidEdit`).
- Add a Worker-client local test: two staff changes with the same difference, then pay the second page. Expected: the change is applied, and the customer is allowed to ask afterwards.
- Separately, in a money migration with its own review: make the settle pick its row deterministically: `order by (r.status = 'requested') desc, r.created_at desc limit 1`.

### 2. WARNING: the customer is blocked when there is no page to pay
- How it happens:
  - `openDifferencePayment` fails.
  - The clean-up supersede also fails (`booking-trip-change.ts:393-399`, `booking-change.ts:683-689`, "ends by itself after 24 hours").
  - The staff row stays `requested`, with a live price record and no page.
- Effect:
  - The new rule refuses the customer for up to 24 h.
  - Withdraw answers `nothing-waiting` because the code requires `extra_session_id` (`booking-change.ts:904`).
  - The SQL withdraw does not require it (`20261007140000:972-976`).
- Fix: when `extra_session_id` is null, `withdrawBookingChange` skips the Stripe step and calls `booking_change_withdraw` directly.
- Do not narrow the SQL block to `extra_session_id is not null`. That would reopen the gap between the accept commit and `set_extra_session`.

### 3. INFO: `requestCustomerTime` ignores `old_extra_session_id`
- The code returns only `request_id` (`edit-request.ts:381-384`).
- After this commit it can matter only once the price record has expired, and by then the page is normally already dead (see answer 2).
- Defensive fix: after a successful customer upsert, call `expireSupersededPage(env, row.old_extra_session_id)` (best effort), as the staff paths do.

### 4. INFO: the copy can mention an e-mail that never went out
- The refusal says "Pay the difference from our e-mail first" even when the pay mail failed (`mailed:false`).
- The owner signed this text, so the wording stays. The owner's UAT should note "Copy payment link" for the `mailed:false` case.

### 5. INFO: test gaps
- The `r.actor = 'staff'` filter is not exercised: pgTAP has no customer request with an extra price record.
- The signed-in route's 409 is proven only through the library and the vm test, not through the real route handler.
- No test covers finding 1's shared page.

## Older problems seen while reviewing (not in 1181e49d, not part of the verdict)

- **P-1 (WARNING):** possible deadlock between the upsert and settle/accept.
  - Lock order: the upsert locks the booking then the request; settle and accept lock the request then the booking.
  - `settle.ts:351-372` treats every SQL error except P0002 (40P01 included) as permanent and acknowledges it. A captured difference would then never be recorded.
  - This commit makes the window smaller: while a live page exists, the upsert refuses before it locks the request.
- **P-2 (not traced end to end):** a cancelled trip may still get a change applied.
  - The settle's `requested` branch has no booking-status check; only the `withdrawn` branch has one (`20261007140000:1201-1214`).
  - `paid-cancel.ts` neither ends nor closes a waiting change.
  - So a difference paid after the customer cancelled may be applied to a cancelled trip.

## Not verified
- The apply on live and the md5 read-back on live.
- A Chromium run.
- The full gates.
