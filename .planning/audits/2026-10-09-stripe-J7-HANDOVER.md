# J7 hand-over: refund policy and mirroring (payments review, 2026-10-09)

Branch `pay/j7-refund-policy` (worktree `.claude/worktrees/pay-j7-refund-policy`). **Stacked: base is `pay/j1-mode-guard`** (already contains J1). Job J9 is stacked on this one. Chain C builder; chain A edits `settle.ts`, `worker.ts`, `checkout_payment_settle` and `stripe_event_*`, see "Conflicts with chain A" below.
Migrations written, NOT applied anywhere: `20261009140000_refund_policy_window.sql`, `20261009150000_refund_ledger_mirroring.sql`. Nothing pushed, deployed, or sent to Stripe or a hosted database.

## What changed, per finding

| id | What | Where |
|---|---|---|
| W6-01 | `compute_cancellation_refund` reads the full-refund window from `free_cancel_hours` of the **first price snapshot of the booking** (the policy it was sold under; a later class or trip re-price does not move the promise). Not a number, or no snapshot: 24 (as before). A published 24 behaves exactly as before. The manage page (`/api/manage/booking`) no longer keeps its own TypeScript copy of "more than 24 hours": it asks the same database function (`cancelWindowFromMode`); an unreadable answer shows the review copy, never a promised automatic refund. | `20261009140000`, `app/api/manage/booking/route.ts`, `lib/checkout/cancel-window.ts` |
| W6-02 | Hours-before is real elapsed time (`timestamptz - timestamptz`) in `app.refund_hours_before(pickup, now)`; the `AT TIME ZONE` wall-clock arithmetic is gone. pgTAP: 25.00 h across 2026-10-25, 23.00 h across 2027-03-28. | `20261009140000` |
| W6-03 | **Kept and documented.** Decision D-26 (phase 09, owner): the clock runs from the original pickup. The cancellation page says "Measured from the pickup time in your confirmation, not from the time you booked", which does not contradict it. pgTAP asserts a booking moved to 3 h from now still measures from the original pickup. If the owner wants the current pickup instead, it is a one-line change (`min(l.scheduled_at)`) and a terms sentence. | `20261009140000` (comment), `refund_policy_window.test.sql` |
| W6-04 | Refund route: unparseable body, `[]`, `null`, a string, or any unknown key (typo `amount`) is **400 `invalid-body`**. An explicit `{}` (what the dashboard's full-refund button sends) or `{ "all": true }` is still "everything left". | `refund/route.ts`, `lib/ops/refund-map.ts` |
| W6-05 | Mirror of a refund Stripe accepted and later failed or canceled. New event types handled: `refund.failed`, `refund.updated`, `charge.refund.updated`. The refund is re-read from Stripe. Failed or canceled: new table `booking_refund_reversals` (insert-only, only `alert_sent_at` may be set once), `bookings.refunded_rappen` goes back down, the intent of an app refund is reopened (state `failed`, attempts + 1, `last_error` starting `stripe:`, so Retry sends it again under a new idempotency key), the booking shows Refund due / failed again; a dashboard refund that had closed the booking puts it back to `pending_ops` with the amount owed; ops is mailed (ids only). Succeeded: runs the charge.refunded path on its charge. Every sum that decides what is refundable now skips a reversed refund (`ops_refund_plan`, `app.booking_paid_net`, picker, board, dashboard money). | `20261009150000`, `money-events.ts`, `settle.ts` (dispatch only), `lib/ops/money-alert-mail.ts`, `packages/emails`, `refund.ts`, `bookings.ts`, `booking-change.ts` |
| W6-06, W5-15 | `stripe_charge_refunded_record`: `refund_status` becomes `refunded` only when the booking's refunds reach its captured total over all its non-duplicate payments. pgTAP: 2000 on a 12000 (10000 + 2000) booking leaves `none`; 12000 flips it. | `20261009150000` |
| W6-07 | `stripe_dispute_upsert` also returns reference, stored status and `alert_pending`. A dispute that is new or moved to another status mails ops through the existing must-fix mail (new kind `dispute`, ids only: reference, event id and type, dispute id), then `stripe_dispute_alerted` records it. A mail that did not go out keeps the Stripe event open and retried (every 5 min, then the dead-letter mail); a sent one is never repeated. The dispute banner on the booking detail (four languages) already existed and is unchanged. | `20261009150000`, `money-events.ts`, `money-alert-mail.ts`, `packages/emails` |
| W6-09 | New `public.staff_erase_unpaid_booking(key)`: locks the booking's payments, then the booking, re-checks "no captured payment", then erases, in one transaction (outcomes `erased`, `paid`, `not_found`). `cancelBooking` and the dashboard DELETE use it; `paid` makes `cancelBooking` take the paid path and the DELETE route answer **409 `paid`**. The unguarded `update bookings set erased_at` in the Worker is gone. | `20261009150000`, `bookings-write.ts`, `bookings/[id]/route.ts` |
| W6-16 | `manage_booking_cancel` refuses a booking that is still `quote`/`pending` with no captured payment (`unpaid_use_hard_delete`, as the signed-in route does). Already mapped to 409 by the route. | `20261009150000` |
| W6-19 | A succeeded non-CHF refund no longer skips the CHF refunds of the same charge: CHF ones are recorded, then the event goes to the slow retry (5 min x 8) that ends in the dead-letter mail. Was: acked with `last_error`, nothing recorded. | `money-events.ts` |
| W5-05 | `tg_refund_cap`: BEFORE INSERT trigger on `booking_refunds`, locks the payment row, refuses (P0001 `refund-exceeds-captured`) a refund that takes refunds (net of reversals) above `charged_rappen`. Applies to every writer, current and future. | `20261009150000` |
| W5-06 | EXECUTE revoked from `vamos_system` on `ops_refund_record`, `record_booking_refund`, `booking_edit_refund_record`. grep proved no caller in `apps/` or `packages/` (only tests that assert they are NOT called). Functions stay in place. | `20261009150000` |
| W6-18 | Dead `opsRefundAmount` and its tests removed (the cap is SQL: `ops_refund_plan` + `tg_refund_cap`, proven in pgTAP; TypeScript only mirrors it in `checkRequest`). `customerCancelWindow` (a second dead mirror of 24) replaced by `cancelWindowFromMode`. | `refund-map.ts`, `refund.ts`, `cancel-window.ts`, tests |
| W6-20 | Dead `is-test` arm removed from the extra-pay failStatus. | `extra-pay/route.ts` |
| W6-22 | Runbook text on permanent errors rewritten to U4; new section listing the Stripe event types to subscribe. | `docs/runbooks/stripe-webhook.md` |

## Stripe dashboard: event types the endpoint must be subscribed to

Add (Developers, Webhooks, the live endpoint, "Listen to"): **`refund.failed`, `refund.updated`, `charge.refund.updated`**. The other money events must already be there: `charge.refunded`, `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed` (W4-12: not verified live), plus the settle events. Without the three new ones, W6-05 never fires. Duplicates are harmless (idempotent on the refund id).

## Deploy and migration order (controller)

1. Apply `20261009140000` and `20261009150000` verbatim (each is one transaction, `begin`/`commit`), in that order, after J1..J6 numbers already live. Read back: `select proname from pg_proc where proname in ('stripe_refund_failed_record','staff_erase_unpaid_booking','stripe_dispute_alerted','stripe_refund_failure_alerted')` = 4 rows; `select to_regclass('public.booking_refund_reversals')` not null; `select has_function_privilege('vamos_system','public.ops_refund_record(uuid,int8,text,uuid,public.rappen,text,public.rappen)','EXECUTE')` = false; `select pg_get_constraintdef(oid) from pg_constraint where conname='booking_events_kind_check'` contains `refund.failed` and every older kind.
2. **Migrations before the Worker, always.** The new Worker reads `booking_refund_reversals` in board, picker and dashboard queries and calls `staff_erase_unpaid_booking`; on an old database those fail. The old Worker on the new database keeps working (the dispute upsert still resolves; legacy writers are not called).
3. Subscribe the three event types in Stripe (above). Then deploy.
4. `20261007320000` (REST revoke) is untouched by this job and not a dependency.

## Tests run (lab `pay-c`, native Supabase, own stack)

- `pnpm exec tsc --noEmit -p .` (apps/web): clean. `pnpm exec vitest run` (apps/web): 461 files passed, 20 skipped; 5518 tests passed, 41 skipped. `packages/emails` vitest: 16 files, 279 tests passed. eslint on the 27 changed ts/tsx files: 0 problems. `i18n:check`, `check:numbers`, `check:db-fences`, `check:legal-claims`: pass.
- **pgTAP, whole suite, run on the lab after a clean `supabase db reset`: Files=111, Tests=3143, Result: PASS** (this includes `cancellation_refund_d02`, `refund_review`, `refunds_by_hand`, `ops_refund`, `stripe_money_events`, `refund_lock_order`). New: `refund_policy_window.test.sql` (22 tests: window 12/24/48 both sides, window 0, fallback, text value, first-snapshot rule, DST autumn and spring, original pickup kept), `refund_ledger_mirroring.test.sql` (70 tests: multi-payment status, cap trigger, reversal, intent reopen, idempotence, dashboard refund reversal, legacy revokes, dispute alert flag, erase, guest cancel). Existing tests changed because behaviour changed on purpose: `cancellation_refund_d02` (#4), `ops_refund` (#7), `refund_review` (#5), `refund_lock_order` (nine to six plus one), `manage_token_purpose` (#14, an unpaid pending booking is now refused).
- `lab.sh dbtests`: `packages/db test/local` 72/72, seeded web files 6/6, other web `.local.test.ts` 30 of 33 passed. The 3 failures (`return-settle-superseded.local` x2, `system-reads.local` on the second run) are order and leftover-state failures of the batch runner (a live rate book is expected or already present); each passes alone on a clean database. They do not touch code of this job.
- `database.types.ts`: the pinned CLI (2.115) needs Docker; I generated with the native CLI 2.119 on the lab and merged only the new table, columns and functions by hand (formatting differs between CLI versions). `db:types:check` was NOT run.

## NOT verified

- No live Stripe or Supabase call. The new refund-failed path was proven with unit tests (mocked Stripe) and SQL, never against a real failed refund.
- Which event types the live endpoint subscribes to (W4-12).
- Whether `20261007210000` (editable `free_cancel_hours`) is applied live; the code reads the value from the snapshot either way and falls back to 24.
- Resend delivery of the two new ops mails (unit-tested only; wording below is mine and not owner-signed).

## Deviations and decisions made

- Window version: first snapshot of the booking (not `bookings.price_snapshot_id`, which moves on a re-price).
- `{}` stays a valid explicit full refund (the dashboard sends it); the owner can ask for `{ "all": true }` only.
- Ops mail wording (en, de, fr, ar) for `refund-failed` and `dispute` is operational, in `packages/emails/src/messages/*.json`; the mail goes out in English like the stuck-payment mail. Please have the owner read it.
- The `booking_events.kind` constraint is extended by reading the live definition and appending `refund.failed`, so another job's kinds are not lost.
- The reversal table is not under `tg_append_only` (that function is shared and carve-out sensitive); it has its own trigger (insert-only, `alert_sent_at` once).

## Conflicts with chain A (files they also edit)

- `apps/web/lib/checkout/settle.ts`: I touched four places only: the `./stripe` import (+`retrieveRefund`), the `./money-events` import (+`handleRefundUpdateWithDeps`), a `deliverMoneyAlert` import, the `outcomeFor` return-type union (+`"refund_update"`), a 3-line dispatch block after `if (outcome === "dispute" && dispute) {...}`, and in the default deps factory the `upsertDispute` body plus five new properties right after it (`alertDispute`, `retrieveRefund`, `recordRefundFailure`, `alertRefundFailed`). Likely conflict lines: the dispatch block around the `ignore` fall-through (W4-04) and the deps factory next to `recordChargeRefund`/`upsertDispute`.
- `apps/web/lib/checkout/money-events.ts` (mine mostly; W4-09 and W4-04 touch it too): I deleted the unused `settleWithError`, rewrote the non-CHF block and the tail of `handleChargeRefundedWithDeps`, and rewrote the upsert part of `handleDisputeWithDeps`. If chain A keeps `settleWithError`, drop it again once nothing calls it.
- `docs/runbooks/stripe-webhook.md`: new section before "Is the webhook arriving?" and the U4 paragraph.
- `worker.ts`, `must-fix-mail.ts`, `checkout_payment_settle`, `stripe_event_*`: not touched (the new mails live in `lib/ops/money-alert-mail.ts`). `packages/emails/src/OpsMustFixEmail.tsx` and the four `messages/*.json` gained two kinds and eight strings in the `opsMustFix` block; chain A adding a kind there will conflict textually.
- `booking_events_kind_check`: if another job rewrites the whole constraint after mine, it must include `refund.failed`.

## Found, not fixed

- `confirmation/[ref]/page.tsx` still prints the LIVE `free_cancel_hours` setting to the customer (via `loadSettingsVersion(now)`), while refunds now use the value sold under. If the owner publishes a new value, an old booking's page can show the new one. Fix: read the value from the booking's snapshot. Not done (customer copy path, J8 territory).
- `app/pages/cancellation.dc.html` still says "24 hours" as static legal copy; it does not follow `free_cancel_hours`. Terms are the owner's to word.
- W6-07 (b)/(c): the dispute banner shows the status word only (no amount, no evidence deadline: `due_by` is not stored) and `ops_refund_plan` does not warn when a dispute is open. Needs an owner decision (warn or block) and copy.
- W6-17 (refund mail without amount), W6-08 key guard (J1), W6-10 to W6-15 are untouched.
- A reversed refund on a booking whose other intent for the same payment is open sets the reopened intent to `void` instead of `failed` (partial unique index); staff then see Refund due and plan a new refund. Not exercised in pgTAP.
- `ops_refund_plan` still has no `app.is_admin()` of its own (W6-18 part 2).
