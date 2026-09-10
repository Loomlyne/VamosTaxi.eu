---
phase: 8
slug: ops-dispatch-live-board-assignment-account-surfaces
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-10
---

# Phase 8 — Validation Strategy

Planner-filled per-task map. Schema apply is MCP `apply_migration` on `yaumjzvylngfjhtuffqs` (08-09-03). Never `supabase db push`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest `4.1.11` (file proofs) + pgTAP under `packages/db/supabase/tests` + existing Playwright visual where a DC file is touched |
| **Config file** | `apps/web` vitest / `packages/db` supabase tests |
| **Quick run command** | `pnpm --filter @vamos/web exec vitest run lib/ops/ops-live-data.test.ts` |
| **Full suite command** | `pnpm run lint && pnpm run typecheck && pnpm run test` (CLAUDE.md Verify) |
| **Estimated runtime** | ~90–180 seconds for targeted ops tests; full suite longer |

---

## Sampling Rate

- **After every task commit:** targeted vitest (or python file-proof) named in that task’s `<verify>`
- **After every plan wave:** `pnpm run typecheck` + that wave’s vitest files + local pgTAP if SQL landed
- **Before `/gsd:verify-work`:** `pnpm run lint && pnpm run typecheck && pnpm run test` **and** hosted `list_migrations` readback (08-09-03)
- **Max feedback latency:** 180 seconds for the quick ops slice

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | OPS-01 D-10 | T-08-01 T-08-04 | `serveOpsDc` on D-10 paths; no 307-everything-to-/; no `#` Location | source | python assert `serveOpsDc` in `middleware.ts` | ✅ | ⬜ pending |
| 08-01-02 | 01 | 1 | OPS-01 D-10 | T-08-01 T-08-03 | `readPath` + `popstate`; no `hashchange` / `vt-ops-hash-switch` | source | python assert `readPath` in `ops.dc.html` | ✅ | ⬜ pending |
| 08-01-03 | 01 | 1 | OPS-01 D-10 D-04 | T-08-01 | Zero `href="#` / `location.hash` in listed DC; `/dashboard` `/support` | source | python grep seven DC files | ✅ | ⬜ pending |
| 08-01-04 | 01 | 1 | OPS-01 D-06 | T-08-01 T-08-10 | Hash proofs + keep `emptyBookings` absence | unit | `vitest run lib/ops/ops-live-data.test.ts` | ✅ | ⬜ pending |
| 08-02-01 | 02 | 2 | OPS-01 OPS-02 D-13 D-28 | T-08-12 | `capturedAt` + sum captured rappen; unpaid stay on list | source | python `capturedAt` / `captured_at` | ✅ | ⬜ pending |
| 08-02-02 | 02 | 2 | OPS-01 D-28–D-38 | T-08-11 T-08-13 | Money by `capturedAt`; no Chauffeur pay / Fuel placeholders | source | python OpsDash grep | ✅ | ⬜ pending |
| 08-02-03 | 02 | 2 | OPS-01 D-06 D-30 | T-08-10 | Needs attention = unassigned paid + unpaid; no tickets; no VT-48 | source | python OpsBoard / vamos-ops-data | ✅ | ⬜ pending |
| 08-02-04 | 02 | 2 | OPS-01 D-06 D-31 | T-08-10 T-08-11 | Mapper + dash file proofs; no guessed fee | unit | `vitest run lib/ops/ops-live-data.test.ts` | ✅ | ⬜ pending |
| 08-03-01 | 03 | 2 | OPS-03 D-53 | T-08-20 | `pickRows` object `json.data`; save waits HTTP; no mint `c-` | source | python `vamos-ops-data.js` | ✅ | ⬜ pending |
| 08-03-02 | 03 | 2 | OPS-03 D-53 D-55 | T-08-22 | Fleet `onSave` persists uuid vehicle; no auto-cancel off-road | source | python OpsFleet | ✅ | ⬜ pending |
| 08-03-03 | 03 | 2 | OPS-03 D-54 D-52 | T-08-21 | `/fleet/chauffeurs/{id}` profile + read-only trips | source | python `ops.dc.html` chauffeurs | ✅ | ⬜ pending |
| 08-03-04 | 03 | 2 | OPS-03 D-53 | T-08-20 | Persist proofs; `defaultVehicleId` mapping | unit | `vitest run lib/ops/fleet-persist.test.ts` | ❌ W0 | ⬜ pending |
| 08-04-01 | 04 | 3 | OPS-03 DATA-08 D-43–D-49 D-52 | T-08-30 T-08-31 | `ops_assign_leg` / `ops_unassign_leg` DEFINER; no anon EXECUTE; GiST kept | source | python glob `*ops_assign*` | ❌ W0 | ⬜ pending |
| 08-04-02 | 04 | 3 | OPS-03 OPS-02 D-44 D-47 | T-08-32 T-08-33 T-08-35 | `23P01` overlap named; uuid POST; CSRF Origin; no `full_name` PATCH; no asStaff INSERT | source | python sqlstate + bookings-write | ✅ / ❌ | ⬜ pending |
| 08-04-03 | 04 | 3 | OPS-03 D-43 D-46 | T-08-30 T-08-34 | OpsDetail uuid picker POST assign/unassign; unpaid no Assign | source | python OpsDetail `chauffeurId` | ✅ | ⬜ pending |
| 08-04-04 | 04 | 3 | OPS-03 DATA-08 | T-08-30 | pgTAP overlap/unpaid/no-email; assign unit | unit+pgTAP | `vitest run lib/ops/assign.test.ts` | ❌ W0 | ⬜ pending |
| 08-05-01 | 05 | 4 | OPS-05 DATA-08 D-56 D-31 | T-08-40 T-08-41 T-08-42 | `ops_refund_record` requires `stripe_refund_id`; no guessed fee | source | python glob `*ops_refund*` | ❌ W0 | ⬜ pending |
| 08-05-02 | 05 | 4 | OPS-05 D-56 | T-08-40 T-08-43 | Stripe `createRefund` before RPC; fail stays paid; no markRefunded-without-Stripe | source | python refund.ts + staff route | ❌ W0 | ⬜ pending |
| 08-05-03 | 05 | 4 | OPS-05 D-57 D-58 D-59 | T-08-40 | Cancel ≠ Refund; unpaid drop no Stripe; paid cancel no refund mail | source | python bookings-write / OpsDetail | ✅ | ⬜ pending |
| 08-05-04 | 05 | 4 | OPS-05 D-60 DATA-08 | T-08-45 | Mail contact+company after Stripe; unit + pgTAP | unit+pgTAP | `vitest run lib/ops/refund.test.ts` | ❌ W0 | ⬜ pending |
| 08-06-01 | 06 | 5 | OPS-04 D-19 D-23 D-26 | T-08-51 | `/bookings/new` quote-first; no `#new`; no cash | source | python `ops.dc.html` newTrip | ✅ | ⬜ pending |
| 08-06-02 | 06 | 5 | OPS-04 D-11 D-24 | T-08-50 | Save → checkout intent / `checkout_create_booking`; land `/bookings/{ref}` | source | python intent / createBooking refs | ✅ | ⬜ pending |
| 08-06-03 | 06 | 5 | OPS-04 D-12 D-14 D-25 | T-08-50 T-08-53 | Explicit pay-link; take-card Elements; no Mark paid | source | python OpsDetail | ✅ | ⬜ pending |
| 08-06-04 | 06 | 5 | OPS-04 D-11 | T-08-50 T-08-54 | File proofs: no asStaff payment INSERT; no `ui_mode custom` | unit | `vitest run lib/ops/phone-booking.test.ts` | ❌ W0 | ⬜ pending |
| 08-07-01 | 07 | 6 | OPS-05 DATA-08 D-66–D-69 | T-08-60 T-08-63 | `booking_edit_requests` + extra settle DEFINER; no pending rewind | source | python glob `*booking_edit_requests*` | ❌ W0 | ⬜ pending |
| 08-07-02 | 07 | 6 | OPS-05 D-67 D-70 D-73 | T-08-60 T-08-61 T-08-62 | Extra session = difference; unpaid ops PATCH refused; extra settle branch | source | python edit-request / bookings-write / settle | ❌ W0 | ⬜ pending |
| 08-07-03 | 07 | 6 | OPS-05 D-72 D-75 | T-08-64 | Ops accept UI; unpaid no editor; overlap not auto-cancel | source | python OpsDetail no `location.hash` | ✅ | ⬜ pending |
| 08-07-04 | 07 | 6 | OPS-05 AUTH-06 D-71 D-72 | T-08-64 | Customer paid edit = requested; no claim-guest modal | source | python edit-request | ❌ W0 | ⬜ pending |
| 08-07-05 | 07 | 6 | DATA-08 D-67 | T-08-60 T-08-65 | pgTAP difference snapshot; unit unpaid refuse | unit+pgTAP | `vitest run lib/ops/edit-request.test.ts` | ❌ W0 | ⬜ pending |
| 08-08-01 | 08 | 6 | OPS-01 D-61–D-65 | T-08-72 | `/customers` emails or empty; no Isolation; write-through | source | python OpsCustomers Isolation / hash | ✅ | ⬜ pending |
| 08-08-02 | 08 | 6 | SITE-03 AUTH-06 D-05 D-50 | T-08-70 T-08-71 | Account list paid + fleet chauffeur/vehicle or empty; no claim dialog | source | python account bookings + bookings.dc.html | ✅ | ⬜ pending |
| 08-08-03 | 08 | 6 | OPS-01 D-39–D-42 | T-08-73 | Poll ~3s + visibility refetch; no `supabase.channel` | source | python `vamos-ops-data.js` | ✅ | ⬜ pending |
| 08-08-04 | 08 | 6 | SITE-03 AUTH-06 D-06 | T-08-70 T-08-73 | Isolation / Realtime / empty chauffeur proofs | unit | `vitest run lib/ops/ops-live-data.test.ts lib/account/bookings.test.ts` | ✅ | ⬜ pending |
| 08-09-01 | 09 | 7 | OPS-03 D-51 | T-08-80 T-08-81 | Chauffeur assign + unassign mail after RPC; `noreply@vamostaxi.site` | source | python glob email templates | ❌ W0 | ⬜ pending |
| 08-09-02 | 09 | 7 | OPS-03 D-55 D-75 | T-08-80 | Ops must-fix mail; no auto-cancel | source | python emails src | ❌ W0 | ⬜ pending |
| 08-09-03 | 09 | 7 | DATA-08 | T-08-82 T-08-83 T-08-84 | **[BLOCKING]** MCP `apply_migration` after owner **apply**; no `db push` | human | `list_migrations` + `to_regclass` / `pg_proc` readback | — | ⬜ pending |
| 08-09-04 | 09 | 7 | DATA-08 | T-08-82 T-08-73 | Hosted objects exist; local types; Realtime still excludes ops tables | types+sql | `pnpm db:types:check` + execute_sql | ✅ | ⬜ pending |

---

## Wave 0 Requirements

Existing infrastructure covers the phase if execute **extends** (does not replace):

- [x] `apps/web/lib/ops/ops-live-data.test.ts` — extend (08-01-04, 08-02-04, 08-08-04)
- [x] `apps/web/lib/account/bookings.test.ts` — extend (08-08-04)
- [x] `apps/web/lib/ops/sqlstate.ts` / `sqlstate.test.ts` — extend (08-04-02)
- [ ] `apps/web/lib/ops/fleet-persist.test.ts` — create (08-03-04)
- [ ] `apps/web/lib/ops/assign.test.ts` — create (08-04-04)
- [ ] `apps/web/lib/ops/refund.test.ts` — create (08-05-04)
- [ ] `apps/web/lib/ops/phone-booking.test.ts` — create (08-06-04)
- [ ] `apps/web/lib/ops/edit-request.test.ts` — create (08-07-05)
- [ ] `packages/db/supabase/tests/ops_assign_leg.test.sql` — create (08-04-04)
- [ ] `packages/db/supabase/tests/ops_refund.test.sql` — create (08-05-04)
- [ ] `packages/db/supabase/tests/booking_edit_requests.test.sql` — create (08-07-05)

Executors never `supabase start` as a hidden side effect. If pgTAP cannot run, document blocked and keep vitest green. Do not treat `database.types.ts` as hosted proof.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Two laptops in-place update | D-39 D-40 | two browsers | Open `/bookings` twice; assign on A; B updates without full reload |
| Take card on ops detail | D-12 D-25 OPS-04 | Stripe Elements + dummy card | Owner-gated dummy-card on `dashboard.vamostaxi.site/bookings/{ref}` — **not** an execute task |
| Path URLs on live dashboard | D-10 | Worker middleware deploy | Open `/dashboard` not `/#dashboard`; refresh stays. Deploy is not planning/execute |
| Visual gate for any DC file touched | CLAUDE.md | pixel | Owner opens staging URL; `--vt-*`, no glow |
| Hosted schema | DATA-08 | owner apply + token | 08-09-03 MCP apply then readback |

---

## Schema

ORM: Supabase (`packages/db/supabase/migrations/*.sql`). Project `yaumjzvylngfjhtuffqs`.

**[BLOCKING]** After 08-04 / 08-05 / 08-07 SQL: hosted apply is **08-09-03** via MCP `apply_migration` **after** owner says **apply**. Types passing is not proof. **Never** `supabase db push` (collides with hosted `schema_migrations` timestamps). Hyperdrive stays on the **direct** Postgres URL (never `:6543`).

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 / human apply gate
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (08-09-03 is the human apply gate)
- [x] Wave 0 extends existing vitest; new files are plan Task 4/5 artifacts
- [x] No watch-mode flags
- [x] Feedback latency < 180s for vitest slices
- [x] `nyquist_compliant: true`

**Approval:** planner fill 2026-09-10 — pending owner plan review
