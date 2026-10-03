---
phase: 29-webhook-purchase
reviewed: 2026-10-03T17:42:42Z
depth: deep
files_reviewed: 19
files_reviewed_list:
  - apps/web/app/api/checkout/intent/route.ts
  - apps/web/lib/checkout/return-settle.test.ts
  - apps/web/lib/checkout/settle.test.ts
  - apps/web/lib/checkout/settle.ts
  - apps/web/lib/env.d.ts
  - apps/web/lib/meta/capi.test.ts
  - apps/web/lib/meta/capi.ts
  - apps/web/lib/meta/click-ids-route.test.ts
  - apps/web/lib/meta/click-ids.test.ts
  - apps/web/lib/meta/click-ids.ts
  - apps/web/lib/meta/legal-gate.test.ts
  - apps/web/lib/meta/purchase.test.ts
  - apps/web/lib/meta/purchase.ts
  - apps/web/worker.ts
  - packages/db/database.types.ts
  - packages/db/supabase/migrations/20261007260000_meta_purchase.sql
  - packages/db/supabase/tests/meta_purchase.test.sql
  - packages/db/test/local/meta-purchase.test.ts
  - scripts/db-access-fence-allowlist.json
findings:
  critical: 0
  warning: 3
  info: 6
  total: 9
status: fixed_partial
fixes:
  WR-01: fixed (cd6b8ff9, typecheck fix in 01845205)
  WR-02: fixed (01845205)
  WR-03: fixed (93430ec1)
  IN-04: fixed (6588eb18)
  IN-05: fixed (d6027a9e)
  IN-01: not in scope
  IN-02: not in scope
  IN-03: not in scope
  IN-06: not in scope
---

# Phase 29: Code Review Report

**Reviewed:** 2026-10-03T17:42:42Z
**Depth:** deep (cross-checked against `checkout_payment_settle` in 20261005130000, `stripe_event_begin` in 20260827000004, `consent_choice` in 20261002100000, `return-settle.ts`, `identity.ts`)
**Files Reviewed:** 19
**Status:** issues_found

## Summary

Scope: `git diff origin/main...HEAD` without `.planning/`. I read the code and traced the call paths. I ran no tests and made no live calls. I did not read or print the token.

The six focus points:

1. **Settle isolation: holds.** The Meta step comes after the refund, the confirmation mail, account provisioning, the alerts and the session-expire loop (`settle.ts:529-543`). `sendMetaPurchase` never rejects, and a second `try/catch` wraps it. `HandleResult` and `applyHandleResult` are unchanged. One gap: the database awaits have no time limit (WR-01).
2. **Exactly once: holds for duplicate delivery and concurrent claims.** The claim row commits before the single POST. There is no retry, and `finish` updates only a row that is still in `sending`. When the return route settles first, the webhook replay reaches the claim once: the return event's `stripe_created` is `session.created`, so `begin` is `ok` and the settle answers `already_settled`. A duplicate payment has status `duplicate`, and extras are filtered out, so neither can claim. The flip side of at-most-once is WR-02.
3. **Consent and refusals: correct.** The claim reads `consent_choice(policy, now)` under the booking lock. Refunded, erased, is_test, not_paid, zero, too_old and the worker skips each write a row and wipe all three columns. A replay of a refunded payment is caught by the booking status and the `booking_refunds` check.
4. **Migration: additive and holds the Phase 28 pending-only rule.** It uses lock_timeout, definer functions and `search_path=''`, returns no arrays and no int8, and both deploy orders are safe. The 3-arg writer is a weak spot only if the Worker is rolled back (WR-03).
5. **Payload: matches the locked shape.** It carries fbp/fbc, CHF value as a number, `https://vamostaxi.site` and our UUID event id. The token is only in the form body. `test_event_code` is set only when `livemode !== true` and a code exists. Logs carry only bookingId, outcome, reason, http and code (`code.subcode`).
6. **Quote/pay/confirmation: unchanged** apart from the 4-arg writer in the intent route, which still runs inside `ctx.waitUntil`.

No blocker found. The three warnings are about the D-05 wipe and an unbounded wait, not about money or what leaves for Meta.

## Warnings

### WR-01: The Meta database calls have no time limit inside the serial queue loop

**File:** `apps/web/lib/meta/purchase.ts:174-203`, `packages/db/supabase/migrations/20261007260000_meta_purchase.sql:156-158`, `apps/web/worker.ts:194-218`
**Issue:** `postPurchase` is limited to 5 s (`AbortSignal.timeout`). The claim, finish and clear_ids calls are not. They go through `asSystem`, whose client sets only `connect_timeout: 10` (`packages/db/src/identity.ts:134-140`). It sets no `statement_timeout` and no `lock_timeout`.

`meta_purchase_claim` takes `select … for update` on the booking row. If another transaction holds that row (a dashboard edit, an assign, a long ops transaction), or the Hyperdrive socket stalls, the claim waits with no limit. The queue loop in `worker.ts` handles messages one after another and acks only after `handleStripeMessage` returns. So one stuck claim holds back this message's ack and every later message in the batch, including other customers' payments, until the invocation is killed.

The settle has already committed by then, so the money is safe: the redelivery acks at `already_processed`. But the killed claim rolls back, so no Purchase is sent and the ids are never wiped (see WR-02).

This step is new: before Phase 29, the message was acked right after the expire loop.
**Fix:** Limit each Meta transaction inside the callback, before the call:
```ts
claim: async (...) => {
  const rows = await asSystem(env, async (sql) => {
    await sql`select set_config('lock_timeout', '2s', true), set_config('statement_timeout', '5s', true)`;
    return sql<DbClaimRow[]>`select * from public.meta_purchase_claim(...)`;
  });
  ...
}
```
Do the same for `finish` and `clearIds`. A 55P03 or 57014 then goes down the existing `claim_failed → clearIds` path. Add a unit test where `claim` never resolves, and assert that the settle still returns within the budget. One way is a `Promise.race` budget around the whole `sendMetaPurchase` in `metaPurchaseDepFor`. That race is safe: the claim row is the once-only guard, so a late claim that commits after the race gave up stays in `sending` and is never posted.

### WR-02: At-most-once delivery means an interrupted message leaves fbp/fbc/subject on a paid booking forever (D-05)

**File:** `apps/web/lib/checkout/settle.ts:529-543`, `packages/db/supabase/migrations/20261007260000_meta_purchase.sql:173-183`
**Issue:** The Meta step only runs when the queue message gets past `stripe_event_begin`. `checkout_payment_settle` stamps `processed_at` in the same transaction as the settlement. So if anything interrupts the Worker between the settle commit and the claim commit, every redelivery stops at `already_processed` (20260827000004:28-31) and never reaches the claim again. Interruptions include an isolate eviction, a deploy, the WR-01 stall, or a claim that fails with a connection error and is followed by a `clearIds` that also fails. Result: no Purchase (acceptable under D-06), and `meta_fbp`, `meta_fbc` and `meta_consent_subject` stay on a paid booking indefinitely. That breaks D-05: values wiped once the Purchase is decided against.

Two other paths return without writing or wiping and rely on the first payment's claim having happened:
- the `not_first_payment` branch (lines 173-183);
- the "payment not found / not succeeded" branch (lines 173-183).

The only safeguard is the manual weekly query in HANDOVER §8, and §8 describes it as covering the claim-failure case only.
**Fix:** Add a sweep to an existing Cron Trigger, for example the hourly confirmation-mail sweep. It calls a new definer function, `vamos_system` only. The function finds non-pending bookings (`status <> 'pending'`, `updated_at < now() - interval '1 hour'`) that still hold any of the three columns and have no `meta_purchase_events` row. For each, it either wipes the columns (`meta_purchase_clear_ids`) or inserts a `skipped` row with a new reason such as `missed` and wipes. Say in HANDOVER §8 that the query also covers interrupted queue runs, not only claim failures.

### WR-03: The 3-arg writer still sets ids without touching the subject; a Worker rollback breaks the D-01 link

**File:** `packages/db/supabase/migrations/20261007260000_meta_purchase.sql:45-46` (3-arg body left as in 20261007240000)
**Issue:** HANDOVER §9 lists "revert the merge" as a rollback. After that rollback, the old Worker calls the Phase 28 3-arg `checkout_set_meta_click_ids`. That function updates only `meta_fbp` and `meta_fbc`, so a `meta_consent_subject` saved earlier by the new Worker stays on the booking:
- A press that clears the ids (nulls) leaves the subject behind.
- A press that sets new ids keeps the old subject. If the new Worker is then redeployed before settle, the claim re-checks consent for a subject that was not the one checked when those ids were saved.

It is fail-safe only when the subject happens to be NULL.
**Fix:** In this migration, replace the 3-arg body so it also sets `meta_consent_subject = null` on every call. Ids without a subject then skip as `no_subject`, which is fail-closed. This changes nothing for the old Worker's Pay answer. Add a pgTAP assertion that the 3-arg call nulls the subject.

## Info

### IN-01: A "send" decision combined with a worker skip or refund leaves the row in `sending` forever

**File:** `apps/web/lib/meta/purchase.ts:107-113`
**Issue:** The defensive branch returns early when `claim.decision === "send"` but `workerSkip !== null || input.refundRequired`. The database can never return that today, because it checks the skip first. If it ever did, the row would stay `sending` with no `finished_at`, and it would be logged as `skip`.
**Fix:** In that branch, when `claim.eventId` is set, call `deps.finish(bookingId, claim.eventId, "failed", null, null, null)` before returning.

### IN-02: Misleading log reason when the database answers "already"

**File:** `apps/web/lib/meta/purchase.ts:108-111`
**Issue:** `reason: claim.reason ?? workerSkip ?? …`. An `already` answer has a null reason, so the log shows `outcome=already reason=gate_closed` (or `no_token`, `no_test_code`) although the database never looked at the worker skip.
**Fix:** `reason: claim.decision === "already" ? null : claim.reason`.

### IN-03: service_role keeps full access to `meta_purchase_events` and EXECUTE on the new functions

**File:** `packages/db/supabase/migrations/20261007260000_meta_purchase.sql:105-106, 78, 277-279`
**Issue:** Supabase's default privileges give `service_role` ALL on new tables and EXECUTE on new functions. The revokes name `anon` and `authenticated` but not `service_role`, and service_role bypasses forced RLS. This matches the project rule (memory: live-service-role-default-execute) and HANDOVER §3.4. Noted here so §3.4's "true only for vamos_system" check is read with that exception for both the table and the functions.
**Fix:** None required. Optionally `revoke all on table public.meta_purchase_events from service_role;` if no tooling needs it.

### IN-04: No proof that two concurrent claims produce one send

**File:** `packages/db/test/local/meta-purchase.test.ts:103-131`, `packages/db/supabase/tests/meta_purchase.test.sql`
**Issue:** "Second call answers already" is only tested one call after the other. Research Finding 8 asked for two concurrent claims leading to one fetch. The code is correct by construction (booking `FOR UPDATE`, a fresh snapshot after the lock wait under READ COMMITTED, and the primary key as a backstop). But no test covers the duplicate-delivery race.
**Fix:** In the local test, open two Worker-client transactions. The first claims and holds; the second claims and blocks. Commit the first and assert that the second returns `already`.

### IN-05: The migration is not re-runnable after a partial apply, and `set lock_timeout` is session-scoped

**File:** `packages/db/supabase/migrations/20261007260000_meta_purchase.sql:10, 86, 111`
**Issue:** `create table public.meta_purchase_events` has no `if not exists`. If the connector runs the file outside one transaction and it fails after line 86, a re-run fails. If it fails before line 111, the pooled session keeps `lock_timeout = 5s`.
**Fix:** Apply it as one transaction: connector `apply_migration`, not `execute_sql`. Or use `create table if not exists` and `set local lock_timeout`.

### IN-06: The locked payload has no `client_user_agent`, so Graph may reject the first send

**File:** `apps/web/lib/meta/capi.ts:46-62`
**Issue:** Meta documents the user agent as required for website events (research A1, Pitfall 1). The payload is locked by META-11 and the privacy line, so this is not a code defect. Expect `state='rejected'` (code 100) on the first 4242 run. The handling is correct: it records the result, never retries and logs the code only. Per META-14, stop and ask the owner. Do not widen the payload.
**Fix:** None in code. Keep HANDOVER §6's stop rule.

---

_Reviewed: 2026-10-03T17:42:42Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
