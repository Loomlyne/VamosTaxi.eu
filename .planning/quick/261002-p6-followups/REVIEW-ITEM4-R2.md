VERDICT: safe

# Review round 2: item 4 (commits 1181e49d and 5152fafb)

Reviewer: a new Opus session. It did not build this and did not do round 1. Read only: no product file was edited, no git state was changed, and no Supabase stack was started or reset. Clock: 2026-10-02 13:25 +04. Branch `fix/p6-followups` at `5152fafb`.

**Verdict.** Safe to ship, on two ship conditions (finding 3). Round-1 findings 1, 2, 3 and 5 are fixed. No path can now put one Stripe page id on two requests. Nothing found in these two commits can charge twice without a Refund due, lose a recorded payment, apply a change without payment, or lock someone out with no way back. Four warnings follow. Finding 1 is new in 5152fafb and is a three-line TypeScript fix; doing it before the ship costs little, but it does not block.

Ran here: `vitest run` on difference-page, booking-change-withdraw, edit-request-customer, booking-change and booking-trip-change: 5 files, 58 tests, all pass. The local-database tests were not run (no stack, by instruction).

## Answers

### 1. Round-1 findings 1, 2, 3 and 5: fixed

**One page per request (finding 1).** `booking_edit_request_set_extra_session` is the only writer of `extra_session_id` (`20260910175309:687-704`; grep across all migrations). `openDifferencePayment` is its only caller (`edit-request.ts:196-207`). The callers of `openDifferencePayment`, one by one:

- **Staff class change** (`booking-change.ts:675-681`) and **staff trip change** (`booking-trip-change.ts:385-391`):
  - They pass `supersededSessionId` only, so `reuse` stays null (`edit-request.ts:143-161`).
  - A new page is always created, with key `extra:${requestId}:${difference}` (`:179`).
  - `requestId` is a fresh row from the upsert insert (`20261007190000:143-148`), so the key and the page are new.
  - The superseded page is closed (`:159-161`) and never stored again.
- **acceptPaidEdit, re-accept, and the dashboard Accept of a customer request** (`edit-request.ts:293-300`):
  - They pass `ownSessionId = accepted.extra_session_id`.
  - Accept returns `v_req.extra_session_id` of the same request (`20261007140000:640`).
  - A reused page is stored back on that same row; a new page overwrites that same row. No second row is involved.
- **Resend:** there is no separate resend code. The pay mail is sent only from the two confirm paths (grep for `sendClassChangePay` / `sendTripChangePay`). "Copy payment link" (`staffExtraPayUrl`, `edit-request.ts:569-591`) only reads.
- **Result:** no path stores one page on two rows. The guarantee lives in TypeScript only: there is no unique index (finding 11).

**The "own page" reuse check.** `hostedSessionIsPayable` (`stripe.ts:329-338`) requires all four:
- a URL;
- status `open`;
- currency CHF;
- `amount_total` equal to the difference accept just computed.

Adaptive pricing does not break this: `fxFromSession` (`stripe.ts:362-433`) shows that `session.currency` and `amount_total` stay in CHF, and the local currency sits in `presentment_details`. Two weak spots remain:
- The page is closed even when only the read failed (finding 2).
- The amount compared is accept's fresh difference, not the request's extra price record (older problem P-4).

**A replaced page that fails to expire.** `closePage` swallows the error (`edit-request.ts:108-114`), and a new page is opened and mailed. If the customer then pays the old page:
- The settle finds the old row by page id. The match is unique now, so the old no-order pick (`20261007140000:1058-1062`) no longer matters.
- The row is `superseded`, so it takes the else branch (`:1245-1254`): the payment is recorded, the booking goes back to its record, and nothing is applied.
- `booking_change_settle_credit` (`:1256`) then shows the overpayment as Refund due.

This is the same "Refund due, no money lost" outcome as P1 C6. pgTAP covers the same else branch (`class_change_reprice.test.sql:446-458`). The customer is still asked to pay the new page. That is a double charge until the owner presses Refund, and it happens only after a Stripe expire failed (finding 8).

**Finding 2 (Withdraw with no page):**
- `booking-change.ts:910-925` skips Stripe when no page is stored.
- `booking_change_withdraw` still refuses anything that is not a waiting staff change with a price record (`20261007140000:971-976`).
- Proven by the local test `customer-request-staff-pages.local.test.ts:159-205` (negative control R7).

**Finding 3 (the customer's request closes the replaced page):**
- `edit-request.ts:393-407`: best effort, after the commit; a Stripe failure cannot fail the request.

**Finding 5 (test gaps):**
- pgTAP D2b covers the `r.actor = 'staff'` filter.
- The signed-in route's 409 is now proven through the real handler (`customer-request-staff-waiting.local.test.ts` diff).

### 2. New risks in 5152fafb

**Withdraw while the page is being made: yes, there is a narrow race.** See finding 1.

**Can the customer path close a page that belongs to a live request? No.**
- `old_extra_session_id` comes from `v_prev`, the one `requested` row the same transaction just superseded while holding the booking lock (`20261007190000:84-89, 130-154`).
- Only one row per booking is `requested`, and new pages are never shared, so the closed page belongs to a row that is already ended.
- A page shared before this ship (finding 3) also sits only on rows that are ended or being ended.

**The idempotency key `extra:${requestId}:${difference}`: Stripe does not return the dead page.**
- Stripe compares the parameters of a replayed key with the first request.
- `expires_at` is `now + 24 h − 30 s`, to the second (`stripe.ts:70-76`, `edit-request.ts:181`), so it never matches.
- Stripe therefore answers `idempotency_error`, and the code returns `stripe-failed`.
- The builder's note (`T1-RECORD.md:184`, "may return the old page") is wrong about the effect.
- When it can happen, and what each person sees: finding 2.

### 3. Error handling

The postgres.js `begin()` rule holds in both commits. Every SQL call is wrapped by a try/catch around the `asSystem` / `asStaff` call, with no catch inside a callback:
- `requestCustomerTime`: `edit-request.ts:365-416`.
- `withdrawBookingChange`: the read at `booking-change.ts:886-904`, the write at `:928-941`.
- `set_extra_session`: `edit-request.ts:196-207`.

One unguarded call is older code, `loadEditBookingContact` (`:165`), in finding 6.

A Stripe failure never half-changes a booking:
- **Confirm paths:** the booking is untouched until the payment, because accept with `extra_required` only mints the extra record (`20261007140000:592-607`). A Stripe failure ends the request through the clean-up.
- **Withdraw:** Stripe runs first and SQL second. If Stripe succeeds and the SQL fails, the expired webhook ends the request (settle `:1097-1110`, D4).
- **Customer path:** Stripe runs after the commit and is best effort.

### 4. Tests

**What proves the fixes:**
- The two local tests (negative control R7 fails on the old source).
- `difference-page.test.ts` tests 1, 3 and 4.
- The withdraw test for a null or empty page.
- The finding-3 customer test.

**Weak or wrong:**
- finding 2: `difference-page.test.ts:105-120` asserts a result real Stripe cannot give.
- finding 4: the class-change path is untested.
- finding 5: two assertions that also pass on the old code.

### 5. Anything else

- Nothing found in these commits that charges twice without a Refund due, loses a recorded payment, or applies a change without payment.
- Lockout: no new one. The owner can always Withdraw (it now works with no page), and the customer's refusal ends with the price record.
- Older risks that the new refusal makes longer are listed at the end.

## Findings

### 1. WARNING (new in 5152fafb): Withdraw with no page can race the page being stored

**Evidence**
- Withdraw reads the waiting row (`booking-change.ts:890-901`).
- When `extra_session_id` is empty it skips Stripe (`:910-911`) and calls `booking_change_withdraw` (`:929-938`). It throws away the function's result.
- The SQL does not check the page. It locks the row and returns its current `extra_session_id` (`20261007140000:965-986`).
- The confirm path stores the page (`edit-request.ts:196-207`) and only then mails it (`booking-change.ts:693-707`, `booking-trip-change.ts:403-420`).
- The dashboard polls bookings every 3 s (`app/vamos-ops-data.js:164`), so a second device shows Withdraw (`OpsDetail.dc.html:1791, 1797`) while the page is still being created.

**Order A: the page id is stored between Withdraw's read and its SQL**
- The window is about one database round trip.
- The row ends `withdrawn` with a live page, and the customer gets the pay mail.
- If she pays within 24 h:
  - The settle's withdrawn branch applies the change when nothing newer waits and the record is unchanged (`20261007140000:1201-1214`).
  - Otherwise it records the payment as Refund due.
- No money is lost. But the owner was told "withdrawn", and the promise "the payment link stops working" (`OpsDetail.dc.html:1796`) is broken.

**Order B: Withdraw's SQL commits first**
- `set_extra_session` raises P0002 (`20260910175309:697-702`), and the confirm answers `unknown`.
- The page is orphaned. It is never stored and never mailed.
- The confirm's clean-up then ends whatever row of the booking is `requested` (finding 7).

**Fix (TypeScript only, about three lines):** read the row that `booking_change_withdraw` returns. If it has a page that this call did not close, expire it (best effort):

```ts
const out = await asSystem(env, async (sql) => (await sql<{ extra_session_id: string | null }[]>`
  select * from public.booking_change_withdraw(${ids.bookingId}::uuid, ${ids.requestId}::uuid, ${claims.sub}::uuid)`)[0] ?? null);
const late = s(out?.extra_session_id).trim();
if (late && late !== page) await expireSupersededPage(env, late);
```

Add a unit test: the read has no page, the SQL returns one, and expire is called with it.

### 2. WARNING: a second Accept that replaces its own page reuses the same Stripe key

**Evidence**
- In `edit-request.ts:147-157`, when the own page is not payable for a reason other than the amount (expired, no URL, or the read failed), it is closed. A new page is then created with the same key `extra:${requestId}:${difference}` (`:179`).
- `expires_at` differs every second (`stripe.ts:70-76`), so Stripe answers `idempotency_error` and the code returns `stripe-failed` (`:191-193`).
- When the read failed, `:156` has already expired a page that may still be good. Its `checkout.session.expired` event then ends the request (settle `20261007140000:1097-1110`).

**What each person sees**
- The owner gets the toast `editFailed` (`OpsDetail.dc.html:2206`).
- The customer's link is dead, and her request ends. She has to ask again.
- No money moves.

**How it is reached**
- Only through `edit-accept` with `extra_required`.
- A customer request is priced at the booking's own total, so this needs paid-net below total. That is rare.
- Or through a direct API call on a staff row; the UI shows Accept only for customer rows (`OpsDetail.dc.html:362-366`).
- The logic is the same as before 5152fafb.

**Test**
- `difference-page.test.ts:105-120` asserts that a new page is opened and stored for "expired" and "unreadable".
- Its create mock always succeeds, so it asserts an outcome real Stripe will not give.

**Fix**
- Put the replaced page into the key: `` `extra:${args.requestId}:${difference}:${ownSessionId || "0"}` ``. Retries of the same state stay idempotent.
- When `retrieveCheckoutSession` throws, return `stripe-failed` and leave the page alone.
- Make the test assert that the key differs from the one the own page was made with.

### 3. WARNING: ship order, and pages already shared on live

**Why it matters**
- The live Worker (P6, `05b8f2d1`) still reuses the superseded page.
- Live `20261007190000` plus that Worker is exactly round-1's blocker: a shared page, the payment credited to the superseded row, and the customer refused.
- The settle still picks its row by page with no order (`20261007140000:1058-1062`), so a page shared on live before this ship still behaves the old way.
- "Live had 0 edit requests" was read earlier on 2026-10-02. P6 has been live since 02:58.

**Conditions of the safe verdict**
1. Run this read-only on live just before the apply:

   ```sql
   select extra_session_id, count(*) from public.booking_edit_requests
    where extra_session_id is not null group by 1 having count(*) > 1;
   ```

   It must return 0 rows. If it does not, end the requested row of each pair by Withdraw before applying.
2. Apply the migration and deploy the Worker in the same ship, with nothing in between. Roll back both or neither: a Worker rolled back to P6 with this migration kept re-opens the blocker.

### 4. WARNING: the class-change half of the finding-1 fix has no test

**Evidence**
- `booking-change.ts:675-681` passes `supersededSessionId`.
- `booking-change.test.ts:239` feeds `old_extra_session_id: null`.
- `:254` uses `objectContaining` without the page fields.
- The local test and negative control R7 drive only `confirmTripChange` (`customer-request-staff-pages.local.test.ts:116`).
- Changing it to `ownSessionId` would pass every test.

**Fix:** a unit test with `old_extra_session_id: "cs_test_old"`. It asserts that `openDifferencePayment` is called with `supersededSessionId: "cs_test_old"` and no `ownSessionId`.

### 5. INFO: two assertions that also pass on the old code

- `difference-page.test.ts:83-91` ("closing the replaced page is best effort") never asserts that `expire` was called. The old code ignored `supersededSessionId` and passes it. Add `expect(expire).toHaveBeenCalledWith(expect.anything(), "cs_test_a")`.
- `booking-change-withdraw.test.ts:123-128` (the SQL's own `nothing-waiting`): the old code returned the same code before reaching SQL. Assert that the `booking_change_withdraw` call happened.

### 6. INFO (older): `loadEditBookingContact` is outside a try

- `edit-request.ts:165`: a database error throws out of `openDifferencePayment`.
- It skips the confirm clean-up (`booking-change.ts:684-690`, `booking-trip-change.ts:394-400`) and becomes a 500.
- It leaves a waiting change with no page. Since finding 1 of round 1, Withdraw can now clear that.
- 5152fafb removed the other unguarded read, `loadEditSnapshotTotal`.
- Fix: wrap it and return `{ ok: false, code: "unknown" }`.

### 7. INFO (older, now reachable in one more way): the clean-up ends "the booking's requested row", not its own request

- Both confirm clean-ups call `supersedePendingEditRequest(env, ctx.bookingId)`. That is `edit_request_refuse(key)` (`20260930210000:258-285`): it ends any `requested` row of the booking.
- In a race (two confirms from two devices, or finding 1's order B followed by a customer request) it can end another live request, including one whose page was already mailed. If that page is paid, it becomes Refund due.
- Fix: end by request id (`id = row.request_id and status = 'requested'`).

### 8. INFO: a failed close is silent

- `closePage` (`edit-request.ts:108-114`) swallows a transient Stripe error.
- The customer then holds two payable links for the same change; paying the old one is Refund due (answer 1).
- Suggest: after a failed expire, retrieve the page. If it is still `open`, log a warning, or tell the owner that the old link may still work.

### 9. INFO: a behaviour change to name at the owner's UAT

- Confirming the same change again "to resend" now kills the first link and mails a new one. Before, it reused the first link.
- For a resend, "Copy payment link" / "Open Stripe" keeps the link.
- This is in line with the signed mail text ("the link works for 24 hours"), but he has not seen it.

### 10. INFO: dead code

- `shouldExpireOldExtraSession` (`edit-request-map.ts:45`, re-exported at `edit-request.ts:40, 48`) is used only by its own test.
- `loadEditSnapshotTotal` (`system-reads.ts:124`) and SQL `edit_request_snapshot_total` are used only by tests.

### 11. INFO: defence in depth (needs a migration number from the controller; live has 0 rows, so it is safe)

- A partial unique index on `booking_edit_requests (extra_session_id) where extra_session_id is not null`. A future TypeScript regression then fails with 23505 instead of crediting the wrong row.
- Round 1's deterministic settle pick: `order by (r.status = 'requested') desc, r.created_at desc limit 1`.

## Older problems seen (not in these two commits, not part of the verdict)

**P-1 (round 1, still open): a captured difference can go unrecorded**
- `settle.ts:351-372` acknowledges every settle error except P0002. That includes deadlock, timeout, connection errors, `unknown-class`, and `23P01` from `apply_payload`.
- So a captured difference can go unrecorded.
- With the new refusal, the customer is then refused until the record expires, and Withdraw answers `already-paid`.

**P-3: a paid page that no row holds is retried forever**
- A page no row holds (orphaned, or overwritten on a second Accept after its close failed) can still be paid if its URL left the server.
- The settle then raises P0002. For `kind=extra`, `refundPaidSessionWithoutBooking` returns false (`settle.ts:230`), and the event is retried forever (`:353-363`). The money is never recorded.
- Its `checkout.session.expired` events loop the same way.
- Fix: fall back to `metadata.extra_id` (the request id) when no row has the page id.

**P-4: two Accepts can record a different amount than was captured**
- On a second Accept, accept keeps the first extra record (`20261007140000:594-606`). The page is opened for the fresh difference (`edit-request.ts:296`).
- If paid-net moved between the two Accepts, the settle records `v_extra.total_rappen` (`:1166`), not what Stripe captured.

## Not verified

- The local-database tests (`*.local.test.ts`), pgTAP, the full gates and the build: not run (no stack, by instruction).
- Stripe's idempotency reply was not exercised. It follows Stripe's documented rule that a replayed key with different parameters is an error.
- Live: no read. The finding-3 query has not been run.
- No Chromium run of Withdraw or Accept.
