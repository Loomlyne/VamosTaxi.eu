# J4 hand-over: late payment and pay-link settle (payments review, 2026-10-09)

Branch `pay/j4-late-paylink` (worktree `.claude/worktrees/pay-j4-late-paylink`). **Stacked: base is `pay/j3-amount-verify`** (`9d101fe0`), which is stacked on `pay/j2-settle-stuck` and `pay/j1-mode-guard`. Nothing pushed, deployed, or applied to a hosted database.

Migration `packages/db/supabase/migrations/20261009115000_late_paylink_settle.sql`. The version is **115000**, not 120000: chain B already owns `20261009120000_guest_resume_quote.sql`. Supabase treats the numeric prefix as the version, so two files cannot share it.

## What changed, per finding

| id | What |
|---|---|
| W5-01 | `checkout_payment_settle`: a pending booking is late only when its price lock **and** its pay-link hold (`bookings.hold_until`) are both past. A pay-link payment inside its hold takes pending → paid → confirmed, with both status events and the legs. A revive (cancelled, or lock and hold both past, pickup still ahead) confirms every leg that was not running and writes `booking.status_changed` next to `booking.revived`. |
| W5-11 | New `checkout_payments_mark_dead`: the Worker marks `requires_payment` rows canceled only after it has read those Checkout Sessions back as expired and unpaid. `purge_unpaid_booking` then answers false while a `requires_payment` row still names a session, and, for reason `unpaid_expired`, while the price lock or pay-link hold is still live. The intent supersede path and the hourly purge both mark dead before they purge. A failed mark is not fatal: the database refuses the purge. |
| W4-05 | `stripe_event_begin` supersedes only an event that would regress a payment (`checkout.session.expired`, `checkout.session.async_payment_failed`, `payment_intent.canceled`), and only when a later paid event on the same `cs_` / `pi_` ids is already processed. A paid event waiting in a retry, a refund, or a dispute is never dropped as superseded. |
| W5-13 | New `app.coupon_reactivate`: a revive gives a released coupon redemption back only while the coupon's global and per-user caps allow it. A redemption that no longer fits stays released; the revive event records how many. |

`purge_unpaid_booking` locks the booking's payment rows first (ordered by id), then the booking. The previous body locked the booking first.

## Files

- Migration `20261009115000_late_paylink_settle.sql` (one transaction, no data change). Replaces `stripe_event_begin` (body of `20261009100000`), `checkout_payment_settle` (body of `20261009110000`), `purge_unpaid_booking` (body of `20261007300000`). Adds `app.coupon_reactivate` (no grant) and `checkout_payments_mark_dead` (EXECUTE `vamos_system`, `vamos_checkout`).
- Worker: `lib/checkout/purge-unpaid.ts`, `lib/checkout/intent.ts`, `app/api/checkout/intent/route.ts`, `lib/checkout/pg-array.ts` (the text-array literal moved out of `settle.ts`; `settle.ts` re-exports it).
- `packages/db/database.types.ts`: `checkout_payments_mark_dead` added by hand. `db:types:check` was not run (the pinned CLI needs Docker).
- Tests: `packages/db/supabase/tests/late_paylink_settle.test.sql` (47), plus the purge and intent unit tests.

## Tests

- `pnpm exec tsc --noEmit -p .` in `apps/web`: clean.
- `pnpm exec vitest run` in `apps/web`: 463 files passed, 22 skipped; 5560 tests passed, 47 skipped.
- eslint on the changed TypeScript files: clean.
- pgTAP, lab `pay-j4`, native, after `supabase db reset`: **Files=112, Tests=3265, Result: PASS**, including `late_paylink_settle.test.sql`. Run again after the payment-first lock change: same counts, PASS.
- `lab.sh up pay-j4` got the stack up and applied `20261009115000`, then stopped at `write_sb_env`: CLI 2.119 `status --env` prints `KEY='value'` lines, and the script only accepts a JSON line, so it reports "gave no keys". pgTAP was run with `supabase test db --local` on that same stack. `lab.sh pgtap` was not the command that printed PASS.

## Deploy and migration order (controller)

1. Deploy the Worker of this branch **before** applying `20261009115000`. The new purge answers false while a session is unproved. The old Worker purges without calling `checkout_payments_mark_dead`, so applying the SQL first would leave expired unpaid bookings in place until the Worker is deployed. The reverse (new Worker, old SQL) still purges; `checkout_payments_mark_dead` is missing and the Worker treats that failure as non-fatal.
2. Apply `20261009115000` verbatim after `20261009110000`. Read back: `checkout_payments_mark_dead` and `app.coupon_reactivate` exist; `prosrc` of `stripe_event_begin` contains `payment_intent.canceled`; `purge_unpaid_booking` locks `booking_payments` before `bookings`.
3. **Merge with chain C.** `pay/j9-db-privileges` migration `20261009160000` replaces `purge_unpaid_booking` again, from the pre-J4 body, with the payment-first lock and without the two W5-11 refusals. Whichever file sorts last wins. Before that chain is applied on top of this one, rebase J9's function onto this body (keep J4's session refusal and the live lock/hold refusal, keep J9's lock and the other J9 changes). Do not apply `160000` unchanged after `115000`.
4. **Merge with chain B.** No shared function. Version `120000` is chain B's `guest_resume_quote` and must stay that file.

## NOT verified

- No live rows were read. No Stripe call. The Worker queue and the hourly purge were not run against Cloudflare.
- `*.local.test.ts` money files were not run on the lab (`lab.sh dbtests` needs `write_sb_env`, which failed on the key format). The unit suite skips them.
- Playwright was not run.

## Deviations

- Migration version is `20261009115000` because `20261009120000` is taken on chain B.
- `purge_unpaid_booking` now locks payments first. That was J9's finding (W5-18); this job rewrites the function, so the new body follows the program lock order instead of copying the old booking-first lock.

## Found, not fixed

- `scripts/test-lab/lab.sh` `write_sb_env` does not parse CLI 2.119 `status --env` (env lines, not JSON). `lab.sh up` and `lab.sh pgtap` fail after the stack is healthy.
- J9's later `purge_unpaid_booking` still drops these refusals until it is rebased (see order note 3).
- J10 (remove test-mode paths) is not this job.
