# J10 hand-over: drop the test-only path, and the integration fixes (payments review, 2026-10-09)

Branch `pay/j10-drop-test-mode` (worktree `.claude/worktrees/pay-j10-drop-test-mode`).
Base of the branch is `pay/j4-late-paylink`. Two merge commits already on the branch join the other chains:

- `d00c336d` merges `pay/j8-money-copy` (J5, J6, J8)
- `73b90ace` merges `pay/j9-db-privileges` (J7, J9)

Nothing pushed, deployed, or applied to a hosted database. The 43 old test-mode bookings are not deleted. No secret was read.

## Integration fixes (later migrations had replaced earlier ones)

A later `CREATE OR REPLACE` is the function that runs. Two of those replacements had dropped a money rule from an earlier job. Both are restored in new files. The earlier files are not edited.

| File | What it restores |
|---|---|
| `20261009170000_purge_keeps_late_refusals.sql` | `purge_unpaid_booking` as the J9 body (payment rows locked first, consent and agreement rows detached) plus J4's two W5-11 refusals: false while a `requires_payment` row still names a Checkout Session, and, for reason `unpaid_expired`, false while the price lock or the pay-link hold is still in the future. |
| `20261009180000_duplicate_out_of_cancel_basis.sql` | J7's `compute_cancellation_refund` (published `free_cancel_hours`, real elapsed hours) and J7's `app.booking_paid_net` (a reversed refund does not reduce the net), each with J3's W5-09 exclusion put back: a duplicate payment, and the refund of that payment, are not part of what the booking owes or has paid. |

`db_privilege_hardening.test.sql` named the pre-J3 10-argument `checkout_payment_settle`. The function's identity is the 14-argument form. Those three casts now use it.

Proof that the drop was real: the first pgTAP run on this tree, with `170000` applied and `180000` not yet written, failed `amount_state_verify` tests 48, 49 and 51 (paid net and the cancel basis were 18 rappen, the booking's own payment plus the duplicate, instead of 9). After `180000` the same suite passed.

## J10: the dead test-only path

J1 stopped returning `stripe-test-only`. The code and the dashboard sentence were still there. Removed:

- `stripe-test-only` from `CHANGE_FAIL_CODES`, from the HTTP status maps (`booking-change-map`, `refund-map`, `edit-request-map`), and from the guest and account cancel routes.
- `errTestOnly` in English, German, French and Arabic in `app/ops/OpsDetail.dc.html`, and the three places that showed it. A Stripe failure on withdraw now uses the existing generic Stripe sentence.

`env.d.ts` and the INT-01 test comment now say the Worker runs the live key, and a test key is accepted only so the local lab and the unit fixtures can run.

## Left in place, on purpose

- `sk_test_` strings inside tests, and `sk_test_e2e_fake_local_only` in `apps/web/tests/e2e-worker/mkcfg.mjs`. The lab cannot run without a key the mode guard accepts.
- `stripe-mode.ts` still reads a test key. Removing that would make the local lab refuse every Stripe call.
- `stripeAccountIsLegacyUaeTest` (`pk_test_51U65pW`) still refuses that retired account. It is a block, not a test-mode checkout.
- Undeployed `env.production` in `wrangler.jsonc` still has `pk_test_placeholder` (names no mode). The staging block already has the live publishable key. This job does not copy a key into the unused production block.
- `scripts/stripe-e2e.mjs` and `scripts/stripe-session-probe.mjs` still require `sk_test_` and are manual sandbox tools. The probe is still the stub from W1-19 (it exits without calling Stripe).
- W5-21 (SQLSTATE mapping) stays undone, as J9 recorded.

## Deploy and migration order (controller)

Apply in timestamp order, each file verbatim, then read the function back. Do not apply `160000` without `170000` after it, and do not apply `150000` without `180000` after it.

1. Deploy the Worker from this branch before applying `20261009115000` or `20261009170000`. The new Worker marks a session dead, then purges. The SQL answers false until that Worker is out, so a customer who changes a selection would see `quote_already_booked`.
2. Deploy the J7 Worker (it is in this same branch) before applying `20261009160000`. After that migration, `vamos_staff` cannot set `erased_at` directly; the live erase is `staff_erase_unpaid_booking`.
3. Order: `20261009100000`, `110000`, `115000`, `120000`, `130000`, `140000`, `150000`, `160000`, `170000`, `180000`.
4. Read back `pg_get_functiondef('public.purge_unpaid_booking(uuid,text)')` and confirm it still contains `requires_payment` and `quote_lock_expires_at`. Read back `compute_cancellation_refund` and `app.booking_paid_net` and confirm both still contain `distinct from 'duplicate'`, and that the cancel function still calls `app.refund_hours_before` and `app.refund_free_window_hours`.

A fresh reviewer who did not write this diff reads it before any ship. This session does not ship.

## Tests run

- pgTAP on lab `pay-j10` (native Supabase, worktree migrations, `supabase db reset` then `supabase test db --local`): **Files=116, Tests=3436, Result: PASS.** The lab was destroyed after that.
- `apps/web` `tsc --noEmit`: clean. eslint on the nine changed TypeScript files: clean.
- Targeted vitest (the maps, the dashboard copy pin, the sandbox pin, refund-by-hand, payment-changed): 5 files, 98 tests, passed.
- Full `apps/web` `vitest run`: 472 files passed, 22 skipped; 5673 tests passed, 47 skipped.

`lab.sh up` and `lab.sh pgtap` still fail after the stack is healthy: `write_sb_env` expects one JSON line from `supabase status --env`, and CLI 2.119 prints `KEY='value'` lines. The suite above was run with `supabase db reset` and `supabase test db --local` on the lab workdir. `lab.sh` was not edited.

## NOT verified

- `*.local.test.ts` and Playwright were not run.
- `db:types:check` was not run (the pinned CLI needs Docker; no signature or column change in this commit).
- No live database, no live Stripe, no deploy.
