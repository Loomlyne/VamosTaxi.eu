---
phase: 18-ops-pricing-source
plan: 08
subsystem: pricing
tags: [D-20, D-21, D-22, D-23, D-24, D-25, D-26, D-33, quote-lock, skip-send, stripe-test]

requires:
  - phase: 18-ops-pricing-source
    provides: Overlay Save writes draft kinds; lock hours×60 on quote_lock_minutes
  - phase: 18-ops-pricing-source
    provides: checkout_expire_unpaid uses quote_lock_expires_at (18-02 SQL)
  - phase: 18-ops-pricing-source
    provides: Checkout extras from published extra-chip rows; preferDraft false
provides:
  - Locked unpaid checkout keeps snapshot CHF until quote_lock_expires_at; then pending auto-cancels
  - Stripe webhook after expiry/cancel/is_test acks without succeeded capture
  - sendPriceChanged / sendExpired skip-send until owner English exists
affects: [18-09, 18-10]

tech-stack:
  added: []
  patterns:
    - Public preferDraft stays host-gated false; new quotes read live book on HYPERDRIVE_NOCACHE
    - Capture gate is Worker-side (status/expired/is_test) before checkout_payment_settle succeeded
    - Price-changed and expired mails are skip-send hooks; no invented body or de/fr/ar

key-files:
  created:
    - apps/web/lib/checkout/lock-mail.ts
  modified:
    - apps/web/lib/quote/lock.ts
    - apps/web/lib/quote/engine.ts
    - apps/web/lib/quote/intent.ts
    - apps/web/lib/checkout/expire-unpaid.ts
    - apps/web/lib/checkout/settle.ts
    - apps/web/lib/checkout/webhook.ts
    - apps/web/lib/checkout/intent.ts
    - apps/web/lib/ops/bookings-map.ts
    - packages/emails/src/lib/send.ts

key-decisions:
  - "Public preferDraft stays false; lock exp is baked from published quote_lock_minutes at lock time"
  - "Expired/cancelled/is_test Stripe webhooks ack without succeeded settle; paid trips are never expired"
  - "Price-changed and expired mails skip-send until owner English exists; no invented copy"

patterns-established:
  - "Select/lock refuses quote_expired when lock rate_version_id is not the current live id"
  - "Ops board totalRappen is snapshot_total_rappen (fallback charged_rappen), never a live-book reprice"

requirements-completed: [D-20, D-21, D-22, D-23, D-24, D-25, D-26, D-33]

duration: 14min
completed: 2026-09-14
---

# Phase 18 Plan 08: Lock hours, expire unpaid, skip-send mails Summary

**Unpaid quotes keep the locked snapshot CHF until `quote_lock_expires_at`, then the pending trip auto-cancels; a Stripe webhook after expiry, cancel, or `is_test` acks without capture; price-changed and expired mails are skip-send until owner English exists.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-09-13T23:45:00Z
- **Completed:** 2026-09-13T23:59:02Z
- **Tasks:** 3 completed
- **Files modified:** 28

## Accomplishments

- Public `preferDraft` stays false. New quotes read the live book on nocache. Lock `exp` is baked from published `quote_lock_minutes` (hours×60 from 18-05). `expireUnpaidBookings` still calls `checkout_expire_unpaid`, which selects pending rows where `quote_lock_expires_at <= now()` — not `created_at + 24 hours`. Paid trips are not expired.
- Settle/webhook: `checkout.session.completed` paid after expiry, cancel, or `is_test` acks without `settlePayment` succeeded and does not mark paid. Pay before expiry still charges the locked snapshot. Checkout intent, pay-link, and staff pay-link return 4xx for `is_test` and never create a Stripe session. No `sk_live_`. Confirmation stays the snapshot.
- Select/lock refuses when the quoted `rate_version_id` is not the current live book (server-side; home layout unchanged). `sendPriceChanged` / `sendExpired` return `{ ok: true, skipped: true }` with no HTML body. Publish skip-sends unpaid non-test contacts (old locked CHF only); expire skip-sends cancelled unpaid. Ops board/detail show snapshot CHF; dispatcher cannot pass a different amount. Manual phone booking uses published book / `pricing_live` (refuses when `!public_chf`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock hours, immediate new quotes, expire at snapshot deadline** - `77fbf60` (feat)
2. **Task 2: Webhook after expiry does not capture; is_test refuses Stripe** - `606980e` (feat)
3. **Task 3: Select refuse, skip-send mails, ops snapshot amounts** - `0186b64` (feat)

**Plan metadata:** pending this commit (docs: complete plan)

## Files Created/Modified

- `apps/web/lib/quote/lock.ts` — lock exp from published `quote_lock_minutes` / `quote_lock_deadline`
- `apps/web/lib/quote/engine.ts` — public preferDraft stays false; nocache live book
- `apps/web/lib/quote/intent.ts` — D-21 refuse when lock `rate_version_id` is not live
- `apps/web/lib/checkout/expire-unpaid.ts` — still calls `checkout_expire_unpaid`; then skip-send expired
- `apps/web/lib/checkout/lock-mail.ts` — Publish/expire skip-send; is_test skipped
- `apps/web/lib/checkout/settle.ts` — capture gate: expired pending / cancelled / is_test
- `apps/web/lib/checkout/webhook.ts` — still verify/record/enqueue only; never captures
- `apps/web/lib/checkout/intent.ts` — is_test 4xx before Stripe; locked amount is the charge
- `apps/web/lib/ops/bookings-map.ts` — `totalRappen` from snapshot
- `packages/emails/src/lib/send.ts` — `sendPriceChanged` / `sendExpired` skip-send

## Decisions Made

- Public `preferDraft` stays false. Lock length is the published book's minutes baked at lock time, not the new book's hours after a later Publish.
- Expired unpaid + paid Stripe event → ack, no succeeded settle. Paid bookings after lock expiry still settle (already_settled). `is_test` never opens a Checkout session.
- Mail copy stays TBC. Skip-send records the attempt with `{ skipped: true }`. No invented English, no de/fr/ar bodies. Confirmation voucher is not repriced on later Publish.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vitest cannot resolve `@/` in must-fix-mail**
- **Found during:** Task 2 (settle.test.ts)
- **Issue:** Pre-existing `settle.ts` → `must-fix-mail.ts` `@/lib/db/identity` import failed under node vitest, blocking D-23 tests
- **Fix:** Relative imports in `must-fix-mail.ts`
- **Files modified:** `apps/web/lib/ops/must-fix-mail.ts`
- **Verification:** settle/webhook/intent tests green (41 passed)
- **Committed in:** `606980e` (Task 2)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required so settle.test.ts can run. No Stripe live keys. No invented mail copy. No home/checkout layout redesign.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 18-09 (extra-wait CHF 0 at pay; no off-session debit). Public `preferDraft` stays false. `public_chf` still false. Stripe still test. Do not invent English for price-changed / expired. Do not apply migrations / `db push` / restore / set `public_chf` / deploy / click Publish.

## Self-Check: PASSED

- key-files.created exist on disk (`apps/web/lib/checkout/lock-mail.ts`)
- `git log --grep=18-08` returns 3 task commits (`77fbf60`, `606980e`, `0186b64`)
- Task 1–3 acceptance_criteria all PASS
- Plan verification: `pnpm --filter web exec vitest run lib/quote lib/checkout/settle.test.ts lib/checkout/webhook.test.ts` → 11 files, 170 passed
- engine.ts public preferDraft stays `dashboardHost && PRICING_PREVIEW === "true"`
- expire path uses `quote_lock_expires_at`; pending only
- settle does not succeeded-capture expired/cancelled/is_test; no `sk_live_`
- sendPriceChanged / sendExpired skip-send; no invented price-changed English in packages/emails messages
- quote intent refuses a non-live `rate_version_id`
- No home/checkout layout redesign; no `preferDraft: true`; no migration apply / db push / restore / `public_chf` / invent CHF / deploy / Publish click

---
*Phase: 18-ops-pricing-source*
*Completed: 2026-09-14*
