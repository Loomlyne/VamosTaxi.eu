---
phase: 31
slug: refunds-in-stripe
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-12
---

# Phase 31 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Source: 31-RESEARCH.md "Validation Architecture". Task IDs are filled by the planner in each PLAN's `<verify>`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (node) in `apps/web` and `packages/emails`; pgTAP in `packages/db/supabase/tests` |
| **Config file** | `apps/web/vitest.config.ts` |
| **Quick run command** | `apps/web/node_modules/.bin/vitest run <touched files>` (in a worktree `pnpm exec` can abort; run `node scripts/sync-dc-mock-to-public.mjs` first for DC tests) |
| **Full suite command** | `pnpm gate:local` (lead only, detached with nohup and an `exit=` line) |
| **Estimated runtime** | quick ~30 s; full gate several minutes |

---

## Sampling Rate

- **After every task commit:** the touched test files only (agents never run the full suite; memory "parallel agents and gate load").
- **After every plan wave:** `vitest run lib/ops lib/checkout lib/lifecycle lib/legal tests/unit` in `apps/web` plus the `packages/emails` suite.
- **Before `/gsd-verify-work`:** `pnpm gate:local` green, pgTAP for the reader on an own native stack (`scripts/test-lab/lab.sh pgtap <name>`), Chromium run on the local Worker for the dashboard and customer flows.
- **Max feedback latency:** 60 s per task.

---

## Per-Requirement Verification Map (from 31-RESEARCH.md)
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| R31-01 | URL builder: mode/acct/pi validation, injection rejected | unit | `pnpm --filter web exec vitest run lib/checkout/stripe-dashboard-url.test.ts` | ❌ Wave 0 |
| R31-01 | `stripe-payments` reader: succeeded + `pi_` only, newest first, `leftRappen` with reversals, kind trip/extra, admin only, both mounts re-export | unit | `… vitest run lib/ops/stripe-payments.test.ts` | ❌ Wave 0 |
| R31-01 | DC: menu item disabled until links, one payment `window.open`, list for 2+, none error, bidi isolation | unit (DC source + vm) | `… vitest run lib/ops/ops-refund-stripe-dc.test.ts lib/ops/ops-dc-dash-design.test.ts` | ❌ Wave 0 / ✅ rewrite |
| R31-02 | refund routes, `refundBooking`, parsers gone; no POST to `/refund` in DC; kept maps still work | unit | `… vitest run lib/ops/refund.test.ts lib/ops/payment-changed.test.ts` | ✅ rewrite |
| R31-03 | webhook still records dashboard refunds; replay `'already'` | unit | `… vitest run lib/checkout/money-events.test.ts lib/checkout/settle.test.ts` | ✅ extend |
| R31-04 | duplicate / paid-after-cancel refund path unchanged, no customer mail | unit | same files, new cases | ✅ extend |
| R31-05 | paid-cancel answers carry no amount; policy line on DC pages, dict, twins, email in 4 languages; refund-texts pins rewritten | unit | `… vitest run lib/lifecycle/paid-cancel.test.ts lib/legal/refund-texts-20-10.test.ts tests/unit/manage-ticket-account-refund.test.ts tests/unit/account-booking-details-refund.test.ts lib/ops/class-change-customer-line.test.ts` and `pnpm --filter @vamos/emails exec vitest run` | ✅ update |
| R31-06 | customer mail: recorded→1 (locale, recipients, amount from Stripe), already→0, app→0, send error doesn't retry, idempotency key | unit | `… vitest run lib/checkout/money-events.test.ts packages/emails (refund.test.ts, send.test.ts)` | ✅ extend |
| R31-07 | "Refund to check" visible/hidden per state table | unit (DC) | `… vitest run lib/ops/ops-refund-stripe-dc.test.ts` | ❌ Wave 0 |
| R31-08 | nightly core: window math, 30-min skip, exclusions, findings (a)-(d)+total, cap 500 "truncated", Stripe down → "did not run", no write calls, counts-only logs | unit | `… vitest run lib/checkout/refund-check.test.ts` | ❌ Wave 0 |
| R31-08 | reader definer: grants, STABLE, fixtures, no writes | pgTAP | `pnpm db:test` (or `pnpm test:db-lab`) `packages/db/supabase/tests/refund_check_reader.test.sql` | ❌ Wave 0 |
| R31-08 | reader through Worker client options | local | `VAMOS_LOCAL_DB_PORT=… pnpm --filter web exec vitest run lib/checkout/refund-check.local.test.ts` | ❌ Wave 0 |
| R31-09 | ops mail copy: refund-failed/difference-not-applied say Stripe | unit | `pnpm --filter @vamos/emails exec vitest run src/OpsMustFixEmail.test.tsx` | ✅ update |
| R31-10 | 4-language key parity, seed, no ß, no "Stripe" on customer surfaces | gate | `pnpm i18n:check && pnpm db:seed:check && pnpm --filter web exec vitest run lib/ops/ops-detail-i18n.test.ts` | ✅ |


## Wave 0 Requirements
- [ ] `lib/checkout/stripe-dashboard-url.test.ts`, `lib/ops/stripe-payments.test.ts`, `lib/ops/ops-refund-stripe-dc.test.ts`, `lib/checkout/refund-check.test.ts`, `lib/checkout/refund-check.local.test.ts`
- [ ] `packages/db/supabase/tests/refund_check_reader.test.sql`
- [ ] Re-anchor the four `markRefund:` slicing tests before deleting `markRefund`
- [ ] Decision file with the 2026-10-12 signed wording tables for the rewritten `refund-texts-20-10.test.ts`
- [ ] Framework install: none


## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| The Stripe link opens the right payment page in each mode | R31-01 | needs his Stripe login | Controller: open one live and one sandbox payment from the dashboard after deploy; the page shows that `pi_` |
| Customer refund mail arrives in the booking language with Stripe's amount | R31-06 | needs a real refund | After the pre-ship real payment, refund part of it in Stripe; read `booking_refunds` and the Resend log |
| Nightly check mail | R31-08 | needs the 03:00 cron on the Worker | Controller reads the Worker log line `refund_check` the next morning; a mismatch mail only when a finding exists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
