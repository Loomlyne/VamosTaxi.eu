---
phase: 09
slug: booking-lifecycle-customer-self-service
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-12
---

# Phase 9 — Validation Strategy

> CONTEXT.md D-01…D-32 supersede leftover 75% / auto no-show. Every automated check must prove UI/API → Hyperdrive direct Postgres and, where named, Stripe test refunds or Resend.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pgTAP (`packages/db`) + Vitest (`apps/web`) + Playwright visual |
| **Config file** | `packages/db/supabase/config.toml`; `apps/web/vitest.config.ts`; `apps/web/playwright.config.ts` |
| **Quick run command** | `pnpm --filter @vamos/db run test:db` (touched sql) / `pnpm --filter web exec vitest run` (touched ts) |
| **Full suite command** | `pnpm db:reset && pnpm db:test` + `pnpm --filter web exec vitest run` + `pnpm run typecheck` |
| **Estimated runtime** | ~120 seconds |

---

## Sampling Rate

- **After every task commit:** the quick command for files touched
- **After every plan wave:** full suite
- **Before `/gsd:verify-work`:** full suite green **and** a staging dummy-card cancel that writes `booking_events` + `booking_refunds` (or honest Failed) + a Resend `booking_notifications` row
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Plan | Task | Requirement | Secure behavior | Test type | Command |
|------|------|-------------|-----------------|-----------|---------|
| 09-01 | 1 | LIFE-01..08 | Wave 0 pgTAP files exist (D-02/D-18/D-31) | pgTAP files on disk | `test -f packages/db/supabase/tests/cancellation_refund_d02.test.sql` |
| 09-01 | 2 | LIFE-02/04/05/07 | Wave 0 Vitest: paid-cancel order, reminder, no-show-sweep absent, booking-detail leftover | Vitest | `pnpm --filter web exec vitest run lib/lifecycle` (later plans turn red→green; 09-01 no-show-sweep + expire subset green now) |
| 09-02 | 1–n | LIFE-01/02/03 | D-02 windows, captured amount, status cancelled not refunded | pgTAP | `pnpm --filter @vamos/db run test:db supabase/tests/cancellation_refund_d02.test.sql` |
| 09-03 | 2 | LIFE-08 | D-18 allow/deny + unique booking_id | pgTAP | `pnpm --filter @vamos/db run test:db supabase/tests/review_submission.test.sql` |
| 09-04 | 1 | LIFE-01/02/08 | Hosted Zurich apply + types | MCP readback | `list_migrations` / `execute_sql` on `yaumjzvylngfjhtuffqs` |
| 09-05 | 1 | LIFE-02/03/04 | Stripe createRefund before record; never un-cancel | Vitest | `pnpm --filter web exec vitest run lib/lifecycle/paid-cancel.test.ts` |
| 09-05 | 2 | LIFE-02 | Ops remaining refund until 0 | Vitest | `pnpm --filter web exec vitest run lib/ops/refund.test.ts` |
| 09-06 | 1 | LIFE-05/06/08 | Templates + bookings@ + booking locale | Vitest | `pnpm --filter web exec vitest run lib/lifecycle/notify-lifecycle.test.ts` |
| 09-07 | 1 | LIFE-05/07 | 24h reminder claim/send; no no-show sweep | Vitest | `pnpm --filter web exec vitest run lib/lifecycle/reminder.test.ts` |
| 09-08 | 1 | LIFE-04 | `/booking-detail` not leftover 404; guest GET hashed | Vitest | `pnpm --filter web exec vitest run lib/lifecycle/booking-detail-route.test.ts lib/dc-mock-urls.test.ts` |
| 09-09 | 2 | LIFE-04 | Paid cancel on ticket only; unpaid list hard-delete | Vitest | `pnpm --filter web exec vitest run lib/checkout/booking-lifecycle.test.ts` |
| 09-10 | 1 | LIFE-06 | Time-change request/confirm; flight write | Vitest | `pnpm --filter web exec vitest run lib/ops/edit-request.test.ts` |
| 09-11 | 1 | LIFE-01/08 | Ops complete/no-show + reviewState chip | pgTAP + Vitest | rollup pgTAP + `lib/account/bookings.test.ts` |
| 09-11 | 2 | LIFE-01 | OpsDash refunds in Expenses | Vitest | `pnpm --filter web exec vitest run lib/ops/ops-live-data.test.ts` |
| 09-12 | 1 | LIFE-08 | Customer POST reviews.booking_id | Vitest | `pnpm --filter web exec vitest run lib/lifecycle/review-submit.test.ts` |
| 09-12 | 2 | LIFE-02 | `/cancellation` D-02 not 75% | source assert | python assert no 75% customer tier |

No three consecutive tasks without an automated verify.

---

## Wave 0 Requirements

- [ ] `packages/db/supabase/tests/booking_status_rollup.test.sql`
- [ ] `packages/db/supabase/tests/cancellation_refund_d02.test.sql`
- [ ] `packages/db/supabase/tests/review_submission.test.sql`
- [ ] `apps/web/lib/lifecycle/paid-cancel.test.ts`
- [ ] `apps/web/lib/lifecycle/reminder.test.ts`
- [ ] `apps/web/lib/lifecycle/review-submit.test.ts`
- [ ] `apps/web/lib/lifecycle/booking-detail-route.test.ts`
- [ ] `apps/web/lib/lifecycle/no-show-sweep.test.ts` (asserts worker has **no** no-show sweep)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Staging dummy-card full refund | LIFE-02 | Stripe test network | Paid booking >24h out → Confirm cancellation → Stripe dashboard refund + ticket Refunded line |
| Resend cancel/reminder/review | LIFE-05/08 | Inbox | `bookings@vamostaxi.site` + customer locale copy actually arrives |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 120s
- [x] `nyquist_compliant: true`

**Approval:** pending execute
