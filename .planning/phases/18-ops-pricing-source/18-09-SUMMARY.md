---
phase: 18-ops-pricing-source
plan: 09
subsystem: checkout
tags: [D-38, extras-catalog, extra-wait, off-session, ops-arrival]

requires:
  - phase: 18-ops-pricing-source
    provides: Checkout extras from published extra-chip rows; preferDraft false
  - phase: 18-ops-pricing-source
    provides: booking_legs.arrived_at column (18-02 SQL)
provides:
  - Meet & greet and free airport wait as two default-on checkout cards
  - Extra waiting CHF 0 at pay; ops arrival clock on booking_legs.arrived_at
  - Grep gate: no off_session / waiting PaymentIntent capture
affects: [18-10]

tech-stack:
  added: []
  patterns:
    - Default-on extras use named ExtraToggles (meetGreet/freeWait); free wait requires airportPickup === true
    - Waiting surcharges emit included / payable 0 at quote time; extra wait is ops display only
    - Staff PATCH { arrived: true } coalesces booking_legs.arrived_at; never a Stripe debit

key-files:
  created:
    - apps/web/lib/checkout/extra-wait-no-offsession.test.ts
    - apps/web/lib/ops/bookings-write.test.ts
  modified:
    - apps/web/lib/checkout/extras-catalog.ts
    - apps/web/lib/checkout/intent.ts
    - apps/web/lib/pricing/lines.ts
    - apps/web/lib/ops/bookings-write.ts
    - apps/web/lib/ops/bookings-map.ts
    - app/ops/OpsDetail.dc.html
    - apps/web/app/[locale]/checkout/CheckoutClient.tsx

key-decisions:
  - "Extra wait after free wait is CHF 0 at pay; SCA / off-session debit is not shipped"
  - "Free wait duration is published free_wait_minutes, never a hardcoded 60"
  - "Ops mark-arrival writes arrived_at only; extra wait CHF is display from published unit/amount"

patterns-established:
  - "Meet off drops the meet line and the free-wait recap; turning meet back on restores free wait"
  - "Dual-copy OpsDetail: edit app/ops then cp to apps/web/public/app/ops"

requirements-completed: [D-38]

duration: 17min
completed: 2026-09-14
---

# Phase 18 Plan 09: Extra-wait CHF 0 at pay; no off-session debit Summary

**Meet & greet and free airport wait are two default-on checkout cards; extra waiting after free wait is CHF 0 on the Stripe snapshot; ops marks arrival to start the clock; silent off-session capture is not shipped.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-09-14T00:01:23Z
- **Completed:** 2026-09-14T00:18:36Z
- **Tasks:** 3 completed
- **Files modified:** 19

## Accomplishments

- Meet & greet is a real toggle (default on). Free airport wait is a second catalog card, airport-pickup only. Meet off removes the meet line; turning meet back on restores free wait on the recap. Duration is the published `free_wait_minutes` field, not 60.
- Quote waiting lines with an amount kind emit included / payable 0. Checkout intent extra fares skip waiting. Ops PATCH `{ arrived: true }` coalesces `booking_legs.arrived_at`. OpsDetail shows Mark arrival and extra-wait minutes/CHF for display only.
- Vitest source-read of `intent.ts`, `settle.ts`, `stripe.ts`, `webhook.ts` asserts no `off_session`, no `setup_future_usage`, and no `PaymentIntent.create` for extra wait. SCA and legal copy were not invented.

## Task Commits

Each task was committed atomically:

1. **Task 1: Two cards — meet & greet and free wait** - `3869673` (feat)
2. **Task 2: Extra wait CHF 0 at pay; ops arrival clock** - `e55a624` (feat)
3. **Task 3: Grep gate — no off-session extra-wait debit** - `c5a546e` (test)

**Plan metadata:** pending this commit (docs: complete plan)

## Files Created/Modified

- `apps/web/lib/checkout/extras-catalog.ts` — two default-on cards; free wait airport-only; waiting not payable
- `apps/web/lib/checkout/extras-catalog.test.ts` — D-38 toggle / recap / airport-pickup tests
- `apps/web/app/[locale]/checkout/CheckoutClient.tsx` — chip toggles; meet-on restores free wait
- `apps/web/lib/checkout/vamos-trip.ts` — persist `meetGreet` / `freeWait`
- `apps/web/i18n/messages/{en,de,fr,ar}.json` — `freeWait` in four languages
- `apps/web/lib/pricing/lines.ts` — waiting amount kind → included / 0 at pay
- `apps/web/lib/checkout/intent.ts` — waiting extra 0 on the payable snapshot
- `apps/web/lib/ops/bookings-write.ts` — `markArrival` writes `arrived_at`
- `apps/web/lib/ops/bookings-map.ts` — `extraWaitFromArrival` display fields
- `apps/web/lib/ops/bookings.ts` — select `arrived_at` + published free-wait / waiting amount
- `app/ops/OpsDetail.dc.html` — Mark arrival control (copied to public dual)
- `apps/web/lib/checkout/extra-wait-no-offsession.test.ts` — off_session grep gate

## Decisions Made

- Extra wait after free wait is CHF 0 at pay. Owner-wanted automatic bank debit without confirmation stays deferred; this plan does not call Stripe with `off_session` or capture extra wait.
- Free wait applies only when `airportPickup === true` and meet is on. Meet toggled back on restores free wait on the recap (discretion).
- Ops extra-wait CHF uses the published waiting amount as one unit when unit minutes are omitted — never a hardcoded 60, never a PaymentIntent.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] CheckoutClient toggle wiring for default-on cards**
- **Found during:** Task 1 (two cards)
- **Issue:** Plan file list was extras-catalog only. `extraIsOn("meet_greet")` returning true forever plus `extraCodes` opt-in would leave the new `toggle: true` cards stuck on.
- **Fix:** Named `meetGreet` / `freeWait` state, persist on `vamosTrip`, EN/DE/FR/AR `freeWait` copy. Layout unchanged beyond chip membership/toggles.
- **Files modified:** `CheckoutClient.tsx`, `vamos-trip.ts`, `i18n/messages/{en,de,fr,ar}.json`
- **Verification:** extras-catalog.test.ts 12 passed
- **Committed in:** `3869673` (Task 1)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required so D-38 cards actually turn off. No checkout layout redesign. No off-session debit. No invented legal copy.

## Issues Encountered

Plan-level `pnpm --filter web exec vitest run lib/checkout` still hits a pre-existing `checkout-comments.test.ts` assertion (`RouteSummary.css` `display:contents`) unrelated to 18-09. 18-09 files (`extras-catalog`, `intent`, `extra-wait-no-offsession`, `lines`) are green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 18-10 (grep gates + owner UAT on live /pricing). Do not execute 18-10 in this close-out. Public `preferDraft` stays false. `public_chf` still false. Stripe still test. Do not invent SCA/legal copy. Do not apply migrations / `db push` / restore / set `public_chf` / deploy / click Publish.

## Self-Check: PASSED

- key-files.created exist on disk (`extra-wait-no-offsession.test.ts`, `bookings-write.test.ts`)
- `git log --grep=18-09` returns 3 task commits (`3869673`, `e55a624`, `c5a546e`)
- Task 1–3 acceptance_criteria all PASS
- Plan verification (18-09 files): `pnpm --filter web exec vitest run lib/checkout/extra-wait-no-offsession.test.ts lib/checkout/intent.test.ts lib/checkout/extras-catalog.test.ts lib/pricing/lines.test.ts` → 4 files, 61 passed
- Dual-copy OpsDetail: `cmp app/ops/OpsDetail.dc.html apps/web/public/app/ops/OpsDetail.dc.html` BYTE_EQUAL
- `--vt-shadow-accent:none` on OpsDetail; no `--vt-yellow-50`/`-100` tints
- No `off_session` on checkout charge path; no `PaymentIntent.create` for extra wait
- No `vamostaxi.eu`; no React `/ops`; public preferDraft stays false; no 18-10 work

---
*Phase: 18-ops-pricing-source*
*Completed: 2026-09-14*
