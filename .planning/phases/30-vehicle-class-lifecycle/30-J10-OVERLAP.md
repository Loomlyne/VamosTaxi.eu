# Phase 30 vs payment chain J1–J10: files already on main

J1–J10 landed on main as `bc38a031` (PR #75, "feat(pay): Stripe payments review J1-J10"). This is no longer parallel work: these files are on main and Phase 30 builds on top of them. Source: `git diff --name-only bc38a031^1 bc38a031`, read 2026-10-12 11:15 +0400; phase branch merged origin/main `65c0b285` as `3245594c`. 191 files.

Rule for the planner: every Phase 30 plan lists its exact files. A plan file that is also on the list below is SHARED: Phase 30 appends its own keys or lines only, never reorders or rewrites J1–J10 lines, and merges origin/main again before hand-over.

## Migrations

J1–J10 own `20261012100000` to `20261012190000` (all on main). Phase 30 starts at `20261012200000`; no number collides.

## Shared files Phase 30 is expected to touch

| File | Why Phase 30 touches it | Rule |
|------|------|------|
| `app/vamos-i18n-dict.js` | dashboard class strings; public About "The fleet" (open question 9) | append own keys; edit only the About fleet entry |
| `app/ops/OpsDetail.dc.html` | Assign picker: retired-class chauffeurs left out, muted count line (open question 7) | touch the Assign block only |
| `apps/web/i18n/messages/{ar,de,en,fr}.json` | only if a Next route or API message needs new keys (class retire/go-live errors) | append own keys; run `db:seed:gen` |
| `packages/db/supabase/seed.sql`, `packages/db/supabase/tests/seed_idempotent.test.sql` | only if the class state column or seeded classes change | re-pin seed header counts after any change |
| `packages/db/supabase/tests/class_change_reprice.test.sql` | read for class-change behaviour; edit only if the class state breaks it | do not weaken J1–J10 assertions |

Shared but not expected to be touched: `packages/emails/src/messages/*.json`, `apps/web/lib/pricing/public-chf.test.ts`, `apps/web/lib/checkout/pay-refusal-messages.test.ts`, `app/vamos-manage-ticket.js`.

## All files J1–J10 changed (on main)

- `.planning/audits/2026-10-09-stripe-J1-HANDOVER.md`
- `.planning/audits/2026-10-09-stripe-J10-HANDOVER.md`
- `.planning/audits/2026-10-09-stripe-J10-REVIEW.md`
- `.planning/audits/2026-10-09-stripe-J2-HANDOVER.md`
- `.planning/audits/2026-10-09-stripe-J3-HANDOVER.md`
- `.planning/audits/2026-10-09-stripe-J4-HANDOVER.md`
- `.planning/audits/2026-10-09-stripe-J5-HANDOVER.md`
- `.planning/audits/2026-10-09-stripe-J6-HANDOVER.md`
- `.planning/audits/2026-10-09-stripe-J7-HANDOVER.md`
- `.planning/audits/2026-10-09-stripe-J8-HANDOVER.md`
- `.planning/audits/2026-10-09-stripe-J9-HANDOVER.md`
- `.planning/handoff/2026-10-11-pay-j1-j10-land.md`
- `app/ops/OpsDetail.dc.html`
- `app/vamos-i18n-dict.js`
- `app/vamos-manage-ticket.js`
- `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/extra-pay/route.ts`
- `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/refund/route.ts`
- `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts`
- `apps/web/app/[locale]/checkout/CheckoutForm.tsx`
- `apps/web/app/[locale]/checkout/CheckoutSettings.tsx`
- `apps/web/app/[locale]/checkout/layout.tsx`
- `apps/web/app/[locale]/checkout/sections/PaymentSection.tsx`
- `apps/web/app/[locale]/checkout/sections/SummaryRail.tsx`
- `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx`
- `apps/web/app/[locale]/confirmation/[ref]/page.tsx`
- `apps/web/app/[locale]/confirmation/page.tsx`
- `apps/web/app/[locale]/layout.tsx`
- `apps/web/app/api/account/bookings/paid-cancel/route.ts`
- `apps/web/app/api/checkout/intent/route.ts`
- `apps/web/app/api/checkout/price/route.ts`
- `apps/web/app/api/checkout/return/route.ts`
- `apps/web/app/api/manage/booking/route.ts`
- `apps/web/app/api/manage/cancel/route.ts`
- `apps/web/components/booking/BookingVoucher.tsx`
- `apps/web/components/checkout/PayBar.tsx`
- `apps/web/components/checkout/confirmation-booked.test.tsx`
- `apps/web/components/checkout/confirmation-return.test.tsx`
- `apps/web/components/checkout/pay-bar-charge-note.test.tsx`
- `apps/web/components/shell/SiteFooter.tsx`
- `apps/web/i18n/messages/ar.json`
- `apps/web/i18n/messages/de.json`
- `apps/web/i18n/messages/en.json`
- `apps/web/i18n/messages/fr.json`
- `apps/web/lib/checkout/account-gate.test.ts`
- `apps/web/lib/checkout/account-gate.ts`
- `apps/web/lib/checkout/booking-pages-polish.test.ts`
- `apps/web/lib/checkout/cancel-window.ts`
- `apps/web/lib/checkout/checkout-charge.ts`
- `apps/web/lib/checkout/confirmation-phase.test.ts`
- `apps/web/lib/checkout/confirmation-phase.ts`
- `apps/web/lib/checkout/confirmation-unmock.test.ts`
- `apps/web/lib/checkout/currency.ts`
- `apps/web/lib/checkout/dlq.test.ts`
- `apps/web/lib/checkout/dlq.ts`
- `apps/web/lib/checkout/errors.ts`
- `apps/web/lib/checkout/intent-account.test.ts`
- `apps/web/lib/checkout/intent-limits.test.ts`
- `apps/web/lib/checkout/intent-schema.test.ts`
- `apps/web/lib/checkout/intent-schema.ts`
- `apps/web/lib/checkout/intent.test.ts`
- `apps/web/lib/checkout/intent.ts`
- `apps/web/lib/checkout/j8-money-copy.test.ts`
- `apps/web/lib/checkout/money-events.test.ts`
- `apps/web/lib/checkout/money-events.ts`
- `apps/web/lib/checkout/pay-client-states.test.ts`
- `apps/web/lib/checkout/pay-client-states.ts`
- `apps/web/lib/checkout/pay-flow-resume.test.ts`
- `apps/web/lib/checkout/pay-flow.ts`
- `apps/web/lib/checkout/pay-outcome-notice.test.ts`
- `apps/web/lib/checkout/pay-outcome-notice.ts`
- `apps/web/lib/checkout/pay-refusal-messages.test.ts`
- `apps/web/lib/checkout/payment-methods.ts`
- `apps/web/lib/checkout/pg-array.ts`
- `apps/web/lib/checkout/purge-unpaid.test.ts`
- `apps/web/lib/checkout/purge-unpaid.ts`
- `apps/web/lib/checkout/queue-consumers.test.ts`
- `apps/web/lib/checkout/queue-consumers.ts`
- `apps/web/lib/checkout/reprice.ts`
- `apps/web/lib/checkout/resume-quote.test.ts`
- `apps/web/lib/checkout/resume-quote.ts`
- `apps/web/lib/checkout/return-settle.test.ts`
- `apps/web/lib/checkout/return-settle.ts`
- `apps/web/lib/checkout/settle-binding.local.test.ts`
- `apps/web/lib/checkout/settle-errors.ts`
- `apps/web/lib/checkout/settle.test.ts`
- `apps/web/lib/checkout/settle.ts`
- `apps/web/lib/checkout/stripe-events-sweep.local.test.ts`
- `apps/web/lib/checkout/stripe-events-sweep.test.ts`
- `apps/web/lib/checkout/stripe-events-sweep.ts`
- `apps/web/lib/checkout/stripe-hosted.test.ts`
- `apps/web/lib/checkout/stripe-mode.test.ts`
- `apps/web/lib/checkout/stripe-mode.ts`
- `apps/web/lib/checkout/stripe-sandbox-only.test.ts`
- `apps/web/lib/checkout/stripe.test.ts`
- `apps/web/lib/checkout/stripe.ts`
- `apps/web/lib/checkout/trip-url.ts`
- `apps/web/lib/checkout/voucher-badge.test.ts`
- `apps/web/lib/checkout/webhook-verify.ts`
- `apps/web/lib/checkout/webhook.ts`
- `apps/web/lib/db/launch-flags-strict.test.ts`
- `apps/web/lib/db/quote.test.ts`
- `apps/web/lib/db/quote.ts`
- `apps/web/lib/env.d.ts`
- `apps/web/lib/health/probe-mode.test.ts`
- `apps/web/lib/health/probe.ts`
- `apps/web/lib/ops/booking-change-map.test.ts`
- `apps/web/lib/ops/booking-change-map.ts`
- `apps/web/lib/ops/booking-change-withdraw.test.ts`
- `apps/web/lib/ops/booking-change.test.ts`
- `apps/web/lib/ops/booking-change.ts`
- `apps/web/lib/ops/booking-trip-change.test.ts`
- `apps/web/lib/ops/booking-trip-change.ts`
- `apps/web/lib/ops/bookings-write.test.ts`
- `apps/web/lib/ops/bookings-write.ts`
- `apps/web/lib/ops/bookings.ts`
- `apps/web/lib/ops/customers-board.test.ts`
- `apps/web/lib/ops/edit-request-map.ts`
- `apps/web/lib/ops/edit-request.ts`
- `apps/web/lib/ops/money-alert-mail.test.ts`
- `apps/web/lib/ops/money-alert-mail.ts`
- `apps/web/lib/ops/must-fix-mail.test.ts`
- `apps/web/lib/ops/must-fix-mail.ts`
- `apps/web/lib/ops/ops-refund-review-dc.test.ts`
- `apps/web/lib/ops/refund-by-hand.test.ts`
- `apps/web/lib/ops/refund-map.ts`
- `apps/web/lib/ops/refund.test.ts`
- `apps/web/lib/ops/refund.ts`
- `apps/web/lib/ops/refusal-rpc-errors.test.ts`
- `apps/web/lib/ops/resolve-booking-id.test.ts`
- `apps/web/lib/ops/staff-cancel-by-hand.test.ts`
- `apps/web/lib/ops/voucher.test.ts`
- `apps/web/lib/pricing/public-chf.test.ts`
- `apps/web/lib/quote/intent.ts`
- `apps/web/lib/security/input-caps.test.ts`
- `apps/web/tests/integration/checkout-server-db.spec.ts`
- `apps/web/tests/integration/webhook-replay.spec.ts`
- `apps/web/tests/unit/audit-26-2-u06-components.test.ts`
- `apps/web/worker.ts`
- `apps/web/wrangler.jsonc`
- `docs/runbooks/stripe-webhook.md`
- `packages/db/database.types.ts`
- `packages/db/supabase/migrations/20261012100000_settle_never_stuck.sql`
- `packages/db/supabase/migrations/20261012110000_amount_state_verify.sql`
- `packages/db/supabase/migrations/20261012120000_late_paylink_settle.sql`
- `packages/db/supabase/migrations/20261012130000_guest_resume_quote.sql`
- `packages/db/supabase/migrations/20261012140000_checkout_replay_by_quote.sql`
- `packages/db/supabase/migrations/20261012150000_refund_policy_window.sql`
- `packages/db/supabase/migrations/20261012160000_refund_ledger_mirroring.sql`
- `packages/db/supabase/migrations/20261012170000_db_privilege_hardening.sql`
- `packages/db/supabase/migrations/20261012180000_purge_keeps_late_refusals.sql`
- `packages/db/supabase/migrations/20261012190000_duplicate_out_of_cancel_basis.sql`
- `packages/db/supabase/seed.sql`
- `packages/db/supabase/tests/amount_state_verify.test.sql`
- `packages/db/supabase/tests/booking_edit_requests.test.sql`
- `packages/db/supabase/tests/cancellation_refund_d02.test.sql`
- `packages/db/supabase/tests/checkout_rpc.test.sql`
- `packages/db/supabase/tests/class_change_reprice.test.sql`
- `packages/db/supabase/tests/db_privilege_hardening.test.sql`
- `packages/db/supabase/tests/guest_resume_quote.test.sql`
- `packages/db/supabase/tests/late_paylink_settle.test.sql`
- `packages/db/supabase/tests/manage_token_purpose.test.sql`
- `packages/db/supabase/tests/ops_refund.test.sql`
- `packages/db/supabase/tests/pay_link_hold.test.sql`
- `packages/db/supabase/tests/purge_agreement_records.test.sql`
- `packages/db/supabase/tests/purge_unpaid.test.sql`
- `packages/db/supabase/tests/reference_format.test.sql`
- `packages/db/supabase/tests/refund_ledger_mirroring.test.sql`
- `packages/db/supabase/tests/refund_lock_order.test.sql`
- `packages/db/supabase/tests/refund_policy_window.test.sql`
- `packages/db/supabase/tests/refund_review.test.sql`
- `packages/db/supabase/tests/rest_function_grants.test.sql`
- `packages/db/supabase/tests/seed_idempotent.test.sql`
- `packages/db/supabase/tests/settle_never_stuck.test.sql`
- `packages/db/supabase/tests/settle_revive.test.sql`
- `packages/db/supabase/tests/settle_safety.test.sql`
- `packages/db/supabase/tests/settle_second_delivery_processed.test.sql`
- `packages/db/supabase/tests/settlement_rpcs.test.sql`
- `packages/db/supabase/tests/unpaid_cancel_session.test.sql`
- `packages/db/test/local/unpaid-lock-order.test.ts`
- `packages/emails/src/OpsMustFixEmail.test.tsx`
- `packages/emails/src/OpsMustFixEmail.tsx`
- `packages/emails/src/lib/send.ts`
- `packages/emails/src/messages/ar.json`
- `packages/emails/src/messages/de.json`
- `packages/emails/src/messages/en.json`
- `packages/emails/src/messages/fr.json`
- `packages/emails/src/refund.test.ts`
- `packages/emails/src/refund.ts`
- `scripts/db-access-fence-allowlist.json`
