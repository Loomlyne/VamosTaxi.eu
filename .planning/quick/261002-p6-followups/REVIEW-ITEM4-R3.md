VERDICT: fix

# Review round 3: item 4, commit 0d588250 (round-2 warnings 1, 2, 4)

Reviewer: a new Opus session. It did not build this and did not do rounds 1 or 2. Read only: no product file edited, no git state changed, no database started. Clock: 2026-10-02 13:37 +04. Branch `fix/p6-followups` at `0d588250`. Context read: 1181e49d, 5152fafb, `REVIEW-ITEM4-R2.md`, `T1-RECORD.md` "Round 2 fixes".

**Verdict: fix.** The Withdraw change (round-2 warning 1) is correct. The class-change test (warning 4) is correct. The new idempotency key (warning 2) creates a new problem. Before this commit, a second Accept on a request whose own page was already **paid** failed by accident: the key was the same, and Stripe refused it. Now it succeeds. The second Accept opens a second page and stores it over the paid one, so the settle can no longer find the first payment (finding 1). The fix is about ten lines in one function.

Ran here: `pnpm --filter web exec vitest run lib/ops/booking-change-withdraw.test.ts lib/ops/booking-change.test.ts lib/ops/difference-page.test.ts`: 3 files, 30 tests, all pass. A scratch test outside the repo (`scratchpad/r3/paid-own-page.r3.test.ts`, run with its own config against the HEAD source) **passes**. That proves finding 1: the second call returns `cs_test_n2`, and `stored` holds `cs_test_n2` for the request whose page `cs_test_n1` was paid.

## Answers to the four questions

### 1. Withdraw (`booking-change.ts:927-948`): safe

- **Can it close another live request's page? No.**
  - `booking_change_withdraw` locks the row by id and booking (`20261007140000:963-969`). It returns that row's own `extra_session_id` (`:986`).
  - If a newer change replaced the row between the read (`booking-change.ts:890-901`) and the SQL, the row is no longer `requested`. The SQL raises `nothing-waiting` (`:971-976`), and the late-close line is never reached (`:940-942`).
  - Only one row per booking is `requested`, and since 5152fafb every new page belongs to one request. So `late` is always the page of the row that was just withdrawn.
  - Pages shared on live before this ship (R2 finding 3) can only sit on the withdrawn row and on rows that already ended.
- **Best effort: yes.**
  - `expireSupersededPage` (`:727-735`) catches everything, including `stripeFromEnv`, which is inside its `try`.
  - It runs after `asSystem` has resolved. `asSystem` is `withIdentityCore`, a `begin()` (`identity.ts:69-85, 98-99`), so the withdraw has committed before Stripe is called.
  - A Stripe failure cannot fail the withdraw or leave SQL half done.
- **No double close.** `late !== page` (`:947`) skips the page already closed at `:914`.
- **Close before the commit?**
  - Only the first close, by design: Stripe first, so a paid page answers `already-paid` (`:922`).
  - The late close always comes after the commit.
- **Left over (INFO 5):** in the interleaving, device B still mails the customer a pay link that is now closed (`booking-change.ts:693-707` mails after the store).

### 2. `openDifferencePayment` key `extra:<request>:<difference>:<own page or 0>` (`edit-request.ts:188`)

- **Plain retry of the same state: no second page, no double charge, but no replay either.**
  - `expires_at` is now + 24 h to the second (`edit-request.ts:190`, `stripe.ts:70-76, 146`).
  - So a retry sends the same key with different parameters, and Stripe answers `idempotency_error`, which becomes `stripe-failed` (`:200-201`).
  - The comment "Retries of the same state stay idempotent" (`:187`) is wrong (finding 3).
- **Two payable pages for one request: yes.**
  - The replaced own page is closed **before** the new page is created (`:161`, then `:179`).
  - That close is best effort: `closePage` swallows every error (`:108-114`).
  - Case 1: the own page is open for another amount and Stripe refuses the expire (or the customer finishes paying between the retrieve and the expire). Both pages are then payable, and only the new one is stored (finding 2, older).
  - Case 2: the own page is `complete`, meaning already paid. `hostedSessionIsPayable` is false (`stripe.ts:333`), and the expire fails, as it always does on a complete session. This commit's new key lets the second create succeed (finding 1, **new**).
- **`retrieveCheckoutSession` throws → `stripe-failed`: consistent.**
  - On a second Accept, accept changes nothing. The record already exists (`20261007140000:592-607`), the row stays `requested` with its page, and the booking is untouched.
  - `acceptPaidEdit` returns the failure (`edit-request.ts:302-309`) and runs no clean-up, so the stored page stays tied to its request. If it is paid, the settle finds it. The owner can try again.
  - The two staff confirm paths never pass `ownSessionId` (grep: only `edit-request.ts:307`), so they never reach this branch.
  - One edge: a permanent read error, such as a page from another Stripe account after a key change, is now `stripe-failed` for good (INFO 6).

### 3. Error handling around `asSystem` / `asStaff`: holds

- **Withdraw:** the `try/catch` is around the `asSystem` call (`booking-change.ts:929-942`), with no `catch` inside the callback.
- **The new retrieve:** its `try/catch` (`edit-request.ts:153-157`) is outside any transaction.
- **`set_extra_session`:** still wrapped (`:205-216`).
- **Unchanged older gap:** `loadEditBookingContact` (`:171`) is still unguarded (R2 finding 6).

### 4. Do the tests prove the fixes?

- **Withdraw:** the late-page test (`booking-change-withdraw.test.ts:133-163`) proves three things:
  - the order is database, then Stripe;
  - `cs_test_late` is closed exactly once;
  - a Stripe refusal still answers ok.

  `resolveStaffBookingId` is mocked, so the only `asSystem` call is the withdraw, and the order assertion is valid. The "not closed a second time" test proves the `late !== page` guard.
- **Warning 4** (`booking-change.test.ts:263-278`) proves `supersededSessionId: "cs_test_old"` and no `ownSessionId`.
- **Warning 2:** the fake Stripe (`difference-page.test.ts:110-119`) is **not** real Stripe:
  - It throws on every key it has seen, whatever the parameters. Real Stripe replays identical parameters.
  - So it proves that each replacement gets a new key. It cannot show what a retry does, and finding 3 shows that claim is false anyway.
  - Nothing tests an own page that is `complete` (finding 1), or an own page open for another amount whose expire is refused (finding 2). Both would have caught the problem.
  - Cosmetic: the second loop pass returns a session with `id: "cs_test_n1"` while `own` is `cs_test_n2` (`:127, 131`).

## Findings

### 1. BLOCKER (new in 0d588250): a second Accept replaces a page that is already paid

**Evidence**
- `edit-request.ts:158-161`: an own page with `status: "complete"` is "not payable" (`stripe.ts:329-338`), so `closePage` is called. Stripe refuses to expire a complete session, and `closePage` swallows that (`:108-114`).
- `:188`: the key is now `extra:R:D:<paid page>`. It differs from the paid page's own key `extra:R:D:0`, so Stripe creates a new page P2.
  - Before this commit, the key was `extra:R:D` in both calls, `expires_at` differed, and Stripe answered `idempotency_error`. The result was `stripe-failed`, and P1 stayed stored.
- `:205-213`: `booking_edit_request_set_extra_session` overwrites the page on any `requested` row (`20260910175309:697-702`). P2 replaces P1.
- Why the row is still `requested` with a paid page: accept never looks at `extra_payment_id` and leaves the row `requested` (`20261007140000:517-520, 586-608`). The row becomes `accepted` only when the settle commits (`:1239-1242`). That leaves two windows:
  - between the payment and its queued webhook;
  - after a settle that failed and was acknowledged (R2 P-1, `settle.ts:364-372`).
- What then happens to P1's money:
  - The settle finds the row by page id (`20261007140000:1058-1064`). P1 is on no row any more, so it raises P0002.
  - For `kind=extra`, no refund is made (`settle.ts:229-230`), and the message is retried (`:353-363`).
  - After 8 retries it goes to the dead-letter queue and one alert goes to info@ (`apps/web/wrangler.jsonc:108-110`).
  - Result: the money is captured but not recorded, the change is not applied, and there is no Refund due.
- What happens to P2:
  - P2 is payable. "Copy payment link" hands it out (`staffExtraPayUrl`, `edit-request.ts:578-597`).
  - If the customer pays P2, the change is applied and she has paid twice. Only the dead-letter alert says so.

**How it is reached**
- For a customer request, Accept stays on screen after the first Accept with `extra_required` (`OpsDetail.dc.html:362-366, 2107`; the toast only says "Extra payment is open").
- "She says she paid but it still waits" invites pressing Accept again.
- Rare: it needs a customer request with a positive difference, or a direct API call on a staff row. But it is a money path, and this commit opened it.

**Proof:** scratch test `paid-own-page.r3.test.ts` (outside the repo) passes on HEAD. The second call returns `{ok:true, sessionId:"cs_test_n2"}`, and `stored` is `[{R, cs_test_n2}]`.

**Fix (edit-request.ts:158-162).** Never replace a page that is paid, or one whose close cannot be proven:

```ts
if (hostedSessionIsPayable(existing, difference)) {
  reuse = { id: ownSessionId, url: existing?.url ?? null };
} else if (existing?.status === "complete") {
  return { ok: false, code: "already-paid" };
} else if (existing?.status === "open") {
  try {
    await expireCheckoutSession(stripe, ownSessionId);
  } catch {
    let st = "";
    try { st = String((await retrieveCheckoutSession(stripe, ownSessionId))?.status ?? ""); } catch { st = ""; }
    if (st === "complete") return { ok: false, code: "already-paid" };
    if (st !== "expired") return { ok: false, code: "stripe-failed" };
  }
}
```

- Map `already-paid` to 409 in `failStatus` (`edit-request-map.ts:91-100`).
- Give the dashboard a toast for it, in all four languages.
- Tests:
  - an own page that is `complete`: answers `already-paid`, with no create and no store;
  - an own page open for another amount, expire refused, re-read `complete`: answers `already-paid`;
  - the same, re-read `open`: answers `stripe-failed`.

### 2. WARNING (older, same fix): an own page whose close fails stays payable next to its replacement

**Evidence**
- If the own page is open for another amount (paid-net moved between two Accepts), `closePage` (`:161`) can fail silently, for example on a transient Stripe error. P2 is then created and stored.
- The old page is then on no row. If it is paid, the result is the same as in finding 1: P0002, dead-letter queue, money not recorded (R2 P-3).
- The amount differed before 5152fafb as well, so the key was new then too. This is not a regression, but it is the same hole.

**Fix:** the `open` branch in finding 1's fix. Proceed only when the expire succeeded or the re-read says `expired`.

### 3. WARNING: "Retries of the same state stay idempotent" (`edit-request.ts:187`) is false

**Evidence**
- `expires_at` is computed from `Date.now()` on every call (`:190`, `stripe.ts:146`). A retry is idempotent only if it lands in the same second.
- In every other case Stripe answers `idempotency_error`. This happens:
  - when Stripe ran the first create but the answer was lost;
  - when Stripe returned a 500 (Stripe stores that result under the key);
  - when `set_extra_session` failed after the create (`:214-216`).
- The answer is then `stripe-failed` until Stripe forgets the key (at least 24 h).
- The page made the first time stays open for 24 h, stored nowhere. Its URL never left the server, so in practice it cannot be paid. Nobody closes it.
- No double charge. But a customer request cannot get a page on Accept: the owner must Refuse, and she must ask again.
- The staff paths are not affected: each confirm has a fresh request id.

**Fix**
- Correct the comment: the key prevents a duplicate page, it does not replay.
- When `set_extra_session` fails after this call created a new page, close that page (best effort) before returning.
- Optionally, on `StripeIdempotencyError`, retry once with an attempt suffix on the key.

### 4. INFO: the "expired own page" case this commit unblocks is nearly unreachable; its expired events loop

**Evidence**
- An own page that expired at Stripe has already sent `checkout.session.expired`. That event ended the request (`20261007140000:1097-1110`), so a second Accept answers `not-requested`.
- The replacement path for "expired" therefore runs only while that event is still queued or failing.
- Every replaced own page (expired, or closed for another amount) sends an expired event that finds no row once P2 is stored. It gets P0002, `refundPaidSessionWithoutBooking` returns false for a non-success (`settle.ts:229`), and it makes 8 retries, then goes to the dead-letter queue with an alert mail about nothing.
- If the event is handled before P2 is stored, it ends the request instead. `set_extra_session` then raises P0002, accept answers `not-found`, and P2 is orphaned.

**Fix:** in the settle, fall back to `metadata.extra_id` when no row holds the page (R2 P-3), or acknowledge an expired or failed event for `kind=extra` that has no row.

### 5. INFO: Withdraw interleaving, what the customer and device B see

- In the late-page case, device B's confirm mails a pay link that Withdraw has just closed, and B shows "mailed".
- No money moves: the expired event finds the withdrawn row and only logs `payment.failed` (`20261007140000:1081-1110`; the status stays `withdrawn`).
- If you want it clean: check the request status again before mailing, in `booking-change.ts:693` and `booking-trip-change.ts:403`.

### 6. INFO: a read that can never succeed is now `stripe-failed` for good

- `edit-request.ts:155-156` treats every retrieve error alike. A `resource_missing` (for example a stored test-mode page after a key change) would block every re-Accept of that request.
- Today `acceptPaidEdit` refuses `sk_live_` (`:241-244`), so this cannot happen yet.
- Suggest: treat a 404 as "no page" (replace), and only transient errors as `stripe-failed`.

### 7. INFO: the fake Stripe in `difference-page.test.ts:112-119` refuses every reused key

- Real Stripe replays when the parameters are the same. To make the fake match:
  - store the parameters, minus `expires_at`, with the key;
  - throw only when the stored parameters differ;
  - return the stored page when they match.
- Add the three finding-1 tests.

## Still open from round 2 (not changed by this commit)

- **R2 finding 3, ship order:** run the read-only shared-page query on live just before the apply, apply the migration and deploy the Worker in one ship, and roll back both or neither.
- **R2 findings 6, 7, 8, 10, 11** and the older **P-1, P-3, P-4** are unchanged. P-1 (settle errors are acknowledged) is one of the two windows that make finding 1 reachable.

## Not verified

- Local-database tests, pgTAP, full gates, `tsc`, eslint and the build: not run (no stack, by instruction; only the three touched unit files were run).
- Real Stripe was not called. These Stripe behaviours come from its documented rules, not from a call:
  - an idempotency error for a reused key with different parameters;
  - a stored 500 result;
  - no expire on a complete session.
- No Chromium run of Accept or Withdraw. No live read.
- The scratch test lives only in the session scratchpad and is not part of the repo.
