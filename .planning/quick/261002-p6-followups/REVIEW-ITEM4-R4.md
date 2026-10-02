VERDICT: safe

# Review round 4: item 4, commit 0ff7a9e8 (round-3 blocker 1, warnings 2 and 3)

Reviewer: a new Opus session. It did not build this and did not do rounds 1-3. Read only: no product file edited, no git state changed, no database started. Clock: 2026-10-02 13:56 +04. Branch `fix/p6-followups`. HEAD is `e9d8ec9b`, a layout-only commit after `0ff7a9e8`; `git diff 0ff7a9e8..HEAD -- apps/web app/ops packages/db` is empty, so the money code reviewed is exactly `0ff7a9e8`. Context read: `REVIEW-ITEM4-R2.md`, `REVIEW-ITEM4-R3.md`, `T1-RECORD.md` "Round 3 fixes", and the item diff `7ccdcdfe..HEAD`.

**Verdict: safe.** Round-3 blocker 1 and warning 2 are fixed. On the request's own page, a new page is now made only after Stripe confirms the old page is `expired`. A paid page answers `already-paid`, and nothing is stored over it. I found nothing new that is broken.

Findings 1-3 are older: they were already on main `7ccdcdfe`, and none got worse. Finding 1 is now easier to see, because the new notice promises something the older settle gap can break. Fix findings 1 and 2 before the live key. Today `acceptPaidEdit` and the change machine both refuse `sk_live_` (`edit-request.ts:278-281`, `booking-change.ts:627`).

## What was run

- `pnpm --filter web exec vitest run lib/ops/difference-page.test.ts lib/ops/ops-accept-paid-dc.test.ts lib/ops/booking-change.test.ts lib/ops/booking-change-withdraw.test.ts lib/ops/edit-request-customer.test.ts`: 5 files, 43 tests, all pass.
- Scratch probes outside the repo (`scratchpad/r4/branches.r4.test.ts`, with their own config, against the HEAD source). They use a Stripe fake that keeps page state (`open`, then `expired` or `complete`; expire refused on any page that is not open) and Stripe's key rule. 5 of 5 pass:
  - Round-3 finding 1, run again: a paid own page answers `already-paid`. Nothing is made or stored, and there is still one page.
  - The expire call returns without error but the page is still `open`, and the re-read says `open`: `stripe-failed`, two reads, nothing made.
  - The expire is refused and the re-read throws: `stripe-failed`, nothing made.
  - Two Accepts at the same moment on an own page that is open for another amount: both return `cs_test_n1`, both store it, and one page is open at the end. The old page is `expired`.
  - Staff path, the replaced page is already paid: there is no read and the close is best effort. A new page is made for the new request (finding 3).
- Negative control: HEAD's `difference-page.test.ts` run against the `0d588250` source (`scratchpad/r4/negctl.r4.test.ts`). 3 of 10 fail: the changed round-2 test, the paid-page test and the refused-close loop. Two of the new tests pass on the old code (finding 6).

## Answers

### 1. Can a new page be stored over a paid or still-payable page?

**Own page (`acceptPaidEdit` → `openDifferencePayment` with `ownSessionId`, `edit-request.ts:339-346`): no.** Every branch:

| Own page at the first read | What happens | Evidence |
|---|---|---|
| Read throws | `stripe-failed`. Nothing is closed, made or stored. | `edit-request.ts:186-190` |
| `open`, same amount | Reused. The same id is stored again. | `:191-192`, `:242-250` |
| `open`, another amount | The page is expired. A new page is made only if the expire answers `expired`. | `:194`, `:132-133` |
| `expired` | Counts as closed with no expire call, and a new page is made. | `:131` |
| `complete` (paid) | `already-paid`. Nothing is closed, made or stored. | `:130`, `:195` |
| Expire throws, or returns without `expired` | The page is read again. | `:134-142` |
| Re-read says `complete` | `already-paid` | `:143` |
| Re-read says `expired` | Closed, and a new page is made. | `:144` |
| Re-read says `open`, anything else, or throws | `stripe-failed`, and the page is left as it is. | `:141`, `:145` |

So every page made on the own path comes after Stripe has said the old page is `expired`. Stripe never turns an `expired` page into a paid one. The concurrent-Accept probe also ends with one payable page:
- The second call's expire is refused.
- Its re-read says `expired`.
- It sends the same key `extra:R:D:<old page>`, so Stripe either replays the first page or refuses the call.

**Replaced page on the staff paths (`booking-change.ts:675-681`, `booking-trip-change.ts:385-391`): not the same care, but no money is lost.**
- The SQL ends the old change first (`booking_staff_change` → upsert, `20261007140000:338`).
- Then `closePage` tries to close its page and swallows any error (`edit-request.ts:108-114, 199-201`). It never reads the page.
- If that page was paid but not yet recorded, the old row still holds its page id. Its payment is recorded later on that ended row and shows as Refund due (`20261007140000:1060, 1245-1256`).
- Meanwhile the new change has mailed a second link for the full new difference (finding 3).

**`already-paid` on a staff path cannot happen.** Neither confirm passes `ownSessionId`. If one ever did, the code would end a paid request (finding 4).

### 2. Double charge, two payable pages for one request, captured money recorded nowhere?

- **Double charge on one request:** not possible on the own path any more.
  - Across requests it can still happen, by design: a paid old staff page becomes Refund due (finding 3).
- **Two payable pages for one request:**
  - Not from the own path.
  - A page made but never stored can exist: the store fails (`:251-253`) or Stripe's answer is lost (`:237-239`). It stays open at Stripe for 24 h, but its url never leaves the server: no path returns it or mails it.
- **Captured money recorded nowhere:** not through this function any more. Round-2 P-3 is now limited to pages whose url never left the server. Two older gaps remain:
  - It can still happen through older P-1: a settle error is acknowledged (finding 1).
  - A changed difference records the wrong amount (finding 2).

### 3. `already-paid` → 409 and the dashboard

- **409 on every route.** `failStatus("already-paid") = 409` (`edit-request-map.ts:98`). It is used by:
  - both mounts of edit-accept (`[locale]/(ops)/…/edit-accept/route.ts:42`; `app/api/…/edit-accept/route.ts:2` re-exports it);
  - the older `edit-request` accept (`:60`).

  No customer route can produce this code.
- **The dashboard receives the code.** `VamosOpsApi.request` returns the JSON body for any status (`app/vamos-ops-api.js:16-33`). The handler reloads and shows `t.acceptPaid` before the generic message (`OpsDetail.dc.html:2211`).
- **Server side, nothing is left half done.**
  - A second Accept keeps the existing extra price record and writes nothing (`20261007140000:593-606`).
  - The page is not touched.
  - The route returns before any mail (`route.ts:42`).
- **Text in four languages** (`OpsDetail.dc.html:858, 1000, 1121, 1266`):
  - German has no ß, and nothing in it needs "ss".
  - The Arabic «دفع العميل الفرق بالفعل. يُطبَّق التغيير عند تسجيل الدفعة.» reads naturally.
  - French and English are fine.
- **Two things are left (findings 1 and 5):**
  - the notice's promise is unconditional;
  - after the reload the booking still says "Extra payment is open".

### 4. Error handling around `asSystem` / `asStaff`

It holds. No changed code has a `try/catch` inside an `asSystem` callback:
- `closeOwnPage` touches no database.
- `set_extra_session` has its `try` around the `asSystem` call (`edit-request.ts:242-253`), and so do accept (`:293-322`) and withdraw (`booking-change.ts:927-942`).
- The customer request closes the old page after the `asSystem` call has resolved (`edit-request.ts:447-453`).

Older and unchanged (round-2 #6): `loadEditBookingContact` (`:205`) is outside a `try`. In the replace branch it now runs after a confirmed close. A database error there throws a 500 and leaves the request holding a dead page, and that page's expired event then ends the request. No money moves.

### 5. Do the tests prove the branches?

Mostly. The fake now follows Stripe's real key rule:
- the same key with the same parameters returns the same page;
- different parameters give `idempotency_error`;
- `expires_at` is compared to the second (`difference-page.test.ts:63-81`).

The tests for a paid page, a refused close (re-read `complete` or `open`) and an expired own page each fail on the old code. The gaps are in finding 6.

## Findings

### 1. WARNING (older, round-2 P-1; the new notice makes it visible): "applied when the payment is recorded" can be false

**Evidence**
- `settle.ts:351-372` acknowledges every settle error except P0002. It neither retries nor alerts.
- For a waiting change, `checkout_extra_payment_settle` applies the change (`20261007140000:1201-1243`). That apply can raise errors that are not P0002:
  - `23P01` from the kept-overlap trigger (`20261007150000:154`);
  - `capacity` (`:411`) or `keep-window-mismatch` (`:402`);
  - a dropped Hyperdrive connection or a deadlock.
- In those cases the payment is captured and nothing is recorded. The row stays `requested` with its paid page.
- From then on:
  - every Accept answers `already-paid`, and the toast says the change is applied when the payment is recorded, which never happens;
  - after 24 h, Accept answers `expired` (`:542`);
  - Refuse ends the request with the money still unrecorded: no Refund due and no alert.
- This is exactly the case where the owner presses Accept again ("she paid but it still waits").

**Fix**
- `settle.ts`: retry, do not acknowledge, the transient SQLSTATE classes (`08*`, `40001`, `40P01`, `57014`, `53*`).
- For `kind=extra` with a permanent error: alert info@ with the session id, the same way as `alertStuckPayment` (`settle.ts:156`), and keep the event marked.
- Notice: end it with "If it still waits in a few minutes, check the payment in Stripe." in all four languages. Or, on `already-paid`, look up `stripe_events` for that session with an error and name it.

### 2. WARNING (older, round-2 P-4; "also covers a changed amount" holds for the close only): a replacement page for a moved difference records a different amount than it charges

**Evidence**
- A second Accept keeps the request's first extra price record (`20261007140000:593-606`, `v_extra := v_req.extra_snapshot_id`). But it returns the fresh difference (`:627-637`).
- `acceptPaidEdit` opens the page for that fresh difference (`edit-request.ts:339-346` → `chargedRappen: difference`, `:213-214`).
- The settle records the first record's total, not what Stripe captured (`:1166`, `v_extra.total_rappen`).
- `app.booking_paid_net` and then `booking_change_settle_credit` (`:428`) build Refund due from what was recorded. Two cases:
  - Paid-net went up between the two Accepts: the customer pays less than is recorded, and Refund due is too high by the gap.
  - Paid-net went down: she pays more than is recorded, and nothing shows.
- Rare: paid-net must move while one customer request waits. But it is a money record that disagrees with Stripe.

**Fix (code only, no migration)**
- In `acceptPaidEdit`, when `accepted.extra_snapshot_id` is set, read its total. `loadEditSnapshotTotal` (`system-reads.ts:124`) is still there.
- If the total differs from `accepted.difference_rappen`, answer a refusal such as `price-changed` (409, with a toast in four languages: "The amount changed. Refuse this request; the customer can ask again."). Do not touch the page.
- Alternative (needs a migration number from the controller): in `booking_edit_request_accept`, make a new extra record when `v_diff` differs from the stored record's total.
- Test: a second Accept with a moved difference makes no page and stores nothing.

### 3. WARNING (older, P1 C6 by design): a staff change made while the previous one's page was just paid charges the customer twice

**Evidence**
- `confirmBookingChange` and `confirmTripChange` end the waiting staff change in SQL first. Only then do they try to close its page, without reading it (`edit-request.ts:199-201`, `closePage` `:108-114`).
- So a page paid seconds before is not noticed. The new change mails a second pay link for the full new difference (`booking-change.ts:692-712`, `booking-trip-change.ts:402-425`).
- The first payment is recorded later on the ended row as Refund due (`20261007140000:1245-1256`). The owner then refunds it by hand.
- Withdraw already does this check (expire, re-read, `complete` → `already-paid`; `booking-change.ts:912-924`). The confirms do not.
- Proven by the scratch probe "staff path".

**Fix**
- Before the SQL in both confirms: when a staff change waits with a page, run Withdraw's check:
  - paid → refuse with `already-paid` and reuse the existing `withdrawPaid` notice;
  - close not confirmed → `stripe-failed`.
- Only then end the old change.

### 4. INFO (new in this item): `already-paid` would be mishandled on a staff path

**Evidence**
- Today it cannot happen: the staff paths never pass `ownSessionId`.
- If one ever did, `booking-change.ts:683-690` and `booking-trip-change.ts:393-400` would call `supersedePendingEditRequest` on a request whose page is paid, and answer `unknown`. The payment would then become Refund due instead of applying the change.

**Fix:** a one-line guard (`if (opened.code === "already-paid") return { ok: false, code: "already-paid" }` before the clean-up), or a test that pins "staff paths never pass `ownSessionId`".

### 5. INFO (new): after the `already-paid` notice, the booking still says the payment is open

**Evidence**
- After the reload the line still ends "· Extra payment is open for the difference." (`OpsDetail.dc.html:2184`).
- The Accept button stays.
- "Copy payment link" answers session-expired for the paid page.

None of this is wrong in money terms, but it contradicts the notice.

**Fix:** optional. Expose the page status in the booking read and show "paid, waiting to be recorded".

### 6. INFO (new, tests): two new tests pass on the old code, and two branches have no test

**Evidence**
- These two tests pass against the `0d588250` source (negative control):
  - "a refused close that Stripe then reports as expired" (`difference-page.test.ts:210-222`). It asserts neither the second read nor the expire attempt, so the old swallow-and-create code passes it.
  - The retry test (`:224-249`). That one is expected: warning 3 changed only a comment.
- These branches have no test:
  - the expire returns without error but the status is not `expired`;
  - the re-read throws after a refused expire.

  Both are correct at HEAD (scratch probes). But two mutations would pass the suite:
  - `now = "expired"` in the catch at `:141`;
  - `return "closed"` after any expire that does not throw.
- The fake `expire` resolves `expired` for any page, even a paid or expired one (`:98`). That is harmless for `closeOwnPage`, which never expires those. But it means the replaced-page tests (`:102-127`) cannot show what happens to a paid replaced page (finding 3).
- The fake does not model three Stripe behaviours: the 24 h key life, a stored 5xx answer, and a 409 for the same key in flight.

**Fix**
- In `:210-222`, add `expect(retrieve).toHaveBeenCalledTimes(2)` and `expect(expire.mock.calls.map((c) => c[1])).toEqual(["cs_test_a"])`.
- Add two cases: expire resolves `{status:"open"}` with re-read `open` → `stripe-failed`; re-read throws → `stripe-failed`.
- Give the fake a page state, as in `scratchpad/r4/branches.r4.test.ts`.

## Still open from earlier rounds (not changed by this commit; all older than this job unless noted)

- **R3 warning 3, behaviour:**
  - After a store that failed, a retry sends the same key with a later `expires_at`. It is refused for about 24 h, so the owner must Refuse and the customer ask again.
  - The page made but never stored is not closed.
  - Main had the same mix of key and moving expiry.
- **R3 info 4:**
  - Every confirmed close sends an expired event.
  - The Stripe queue runs with batch size 1 and a 1 s batch timeout (`apps/web/wrangler.jsonc:104-105`). So "the event lands before the new page is stored" is a real race:
    - the request is ended (`20261007140000:1097-1115`);
    - the store answers `not-found`, and the dashboard shows "Could not apply edit";
    - the customer is not told.
  - Otherwise the event finds no row and goes to the dead-letter queue, with one alert mail.
- **R3 info 5 and 6.**
- **Round 2:**
  - #3, ship order: run the shared-page query on live before the apply; apply the migration and deploy the Worker in one ship.
  - #6 (now after a confirmed close, see answer 4), #7, #8, #11.
  - #10, dead code: `shouldExpireOldExtraSession` and `loadEditSnapshotTotal`. Finding 2's fix would use the second one again.
- **P-3** is now limited to pages that were never stored.

## Not verified

- Local-database tests, pgTAP, full gates, `tsc`, eslint and the build were not run (no stack, by instruction).
- The SQL paths (settle, accept, supersede) were read, not run.
- Real Stripe was not called. These are taken from Stripe's documented rules:
  - expire is refused on a session that is not `open`;
  - a key reused with different parameters gives `idempotency_error`;
  - a complete card session is paid.
- Not checked: whether Stripe allows an expire while a card payment is being processed. If it does, the PaymentIntent would be cancelled. The code is safe either way: it acts only on `expired` or `complete`.
- The negative control was run for `difference-page.test.ts` only, not for `ops-accept-paid-dc.test.ts`.
- No Chromium run of Accept and its notice. No live read.
- The scratch tests live only in the session scratchpad and are not part of the repo.
