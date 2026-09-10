---
phase: 8
slug: ops-dispatch-live-board-assignment-account-surfaces
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-10
---

# Phase 8 — Validation Strategy

> RESEARCH.md has no `## Validation Architecture` heading. This file is the Nyquist contract so plans can carry Dimension 8. Planner must fill the per-task map with real task IDs.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest `4.1.11` (file proofs) + existing Playwright visual where a UI file is touched |
| **Config file** | `apps/web` vitest / `apps/web/tests` |
| **Quick run command** | `pnpm --filter @vamos/web exec vitest run lib/ops/ops-live-data.test.ts` |
| **Full suite command** | `pnpm run lint && pnpm run typecheck && pnpm run test` (repo Verify from CLAUDE.md) |
| **Estimated runtime** | ~90–180 seconds for targeted ops tests; full suite longer |

---

## Sampling Rate

- **After every task commit:** targeted vitest for the files touched
- **After every plan wave:** `pnpm run typecheck` + ops-live-data + any new SQL/pgTAP if added
- **Before `/gsd:verify-work`:** `pnpm run lint && pnpm run typecheck && pnpm run test`
- **Max feedback latency:** 180 seconds for the quick ops slice

---

## Per-Task Verification Map

Filled by the planner when PLAN.md task IDs exist. Minimum behaviors that MUST appear:

| Behavior | Requirement | Threat | Automated |
|----------|-------------|--------|-----------|
| No `#` in ops sidebar/hrefs | D-10 | open-redirect / stale hash | grep `OpsSidebar` / `vamos-ops-data` for `href="#` = 0 |
| No `emptyBookings` / Isolation names | D-06 OPS-01 | fake board | extend `ops-live-data.test.ts` |
| Assign writes chauffeur UUID + `default_vehicle_id`; overlap returns named other trip | OPS-03 D-43 D-47 | double-book | SQL/unit on 23P01 + API |
| Refund calls Stripe before status `refunded`; Stripe fail stays paid | D-56 | ledger lie | unit + route test |
| Extra fare session amount = difference; original trip unchanged until captured | D-67 | overcharge | unit on snapshot/payment |
| Account list = `contact_email` match; chauffeur/vehicle from fleet | SITE-03 AUTH-06 D-05 D-50 | PII leak / fake names | `lib/account/bookings` tests |
| Customers empty ≠ Isolation | D-63 | fake CRM | ops-live-data |
| Money tiles: captured_at, no expense placeholders, no guessed Stripe fee | D-28–D-38 | fake CHF | ops-live-data + mapper tests |
| Fleet Save persists `default_vehicle_id` | D-53 | assign lie | API round-trip test |
| Schema push after new SQL | DATA-08 | types-green DB-red | [BLOCKING] `supabase db push` (owner/token) or recorded equivalent |

Planner replaces this table with Task IDs. Status starts ⬜ pending.

---

## Wave 0 Requirements

Existing infrastructure covers the phase if the planner **extends** (does not replace):

- `apps/web/lib/ops/ops-live-data.test.ts`
- checkout/stripe tests already in `apps/web/lib/checkout/`
- `packages/emails` tests for new chauffeur/must-fix templates

Add stubs in Wave 0 only if a plan introduces a file with no test analog.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two laptops in-place update | D-39 D-40 | two browsers | Open `/bookings` twice; assign on A; B updates without reload |
| Take card on ops detail | D-12 D-25 | Stripe Elements + dummy card | Owner dummy-card on `dashboard.vamostaxi.site/bookings/{ref}` |
| Path URLs on live dashboard | D-10 | Worker middleware | Open `/dashboard` not `/#dashboard`; refresh stays |
| Visual gate for any DC file touched | CLAUDE.md | pixel | Owner opens staging URL |

---

## Schema

ORM: Supabase (`packages/db/supabase/migrations/*.sql`).

**[BLOCKING]** After assignment/refund/edit-request SQL: push to hosted `yaumjzvylngfjhtuffqs` before claiming verify. Types passing is not proof.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set after planner fills the task map

**Approval:** pending planner fill 2026-09-10
