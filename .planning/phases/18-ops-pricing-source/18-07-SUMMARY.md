---
phase: 18-ops-pricing-source
plan: 07
subsystem: pricing
tags: [d23, d24, d28, extra-wait, vat, owner-uat, vitest]
requires:
  - phase: 18-ops-pricing-source
    provides: any class + R2 photo; one surcharges list (18-06)
provides:
  - Extra wait display-only in ops; waiting extra is 0 at Stripe pay-now
  - Recap grep: no region_premium, no night/weekend/holiday line codes
  - VAT fallback 81 bps; coupon before VAT; payable floor CHF 0.00
  - Dual-DC OpsPricing (and OpsTable) byte-equal; owner SQL applied; owner closed UAT
affects: [11-12, 13]
tech-stack:
  added: []
  patterns: [extra-wait-no-offsession grep covers intent + bookings-map; dual-DC copy from app/ops]
key-files:
  created: []
  modified:
    - apps/web/lib/checkout/extra-wait-no-offsession.test.ts
    - apps/web/lib/checkout/intent.ts
    - apps/web/lib/ops/bookings-map.ts
    - apps/web/lib/checkout/vat.ts
    - apps/web/lib/pricing/policy.ts
    - app/ops/OpsPricing.dc.html
    - apps/web/public/app/ops/OpsPricing.dc.html
    - app/ops/OpsTable.dc.html
    - apps/web/public/app/ops/OpsTable.dc.html
key-decisions:
  - "Agent never clicked Publish and never supabase db push. Owner applied 20260914190000 then 20260914191000 on hosted Zurich 2026-09-14."
  - "Owner instructed 18-07 close on 2026-09-15. Live UAT on vamostaxi.site / dashboard.vamostaxi.site is the owner's record, not Vitest."
  - "Full lib/pricing+ops+checkout+quote Vitest and web tsc still have pre-existing failures (settings vat, sqlstate 23P01, settle CaptureGate mock, checkout-comments RouteSummary CSS, ops-dc-settings hash nav). 18-07 owned gates are green."
requirements-completed: [D-09, D-13, D-23, D-24, D-27, D-28]
duration: 20min
completed: 2026-09-15
---

# Phase 18: OPS Pricing source of truth — 18-07 Summary

**Same published-book math at pay-now: extra wait out of Stripe, VAT on (ride + extras − coupon), recap without region/night lines. Owner SQL applied; owner closed live UAT. Agent did not Publish.**

## Performance

- **Duration:** ~20 min (close-out; Tasks 1–2 already in tree)
- **Started:** 2026-09-14T17:25:00Z
- **Completed:** 2026-09-15T09:08:00Z
- **Tasks:** 3/3
- **Files modified:** dual-DC OpsPricing + OpsTable this session; rest from 18-01…18-06 + prior 18-07 agent work

## Accomplishments

- `extra-wait-no-offsession.test.ts` greps `intent.ts` / `settle.ts` / `stripe.ts` / `webhook.ts` and `bookings-map.ts`. Comment `waiting extra is 0 at pay` stays. Ops extra wait is display-only.
- Recap source-read: no `region_premium`, no night/weekend/holiday line codes in `CheckoutClient` / `priceQuote`.
- VAT fallback 81 (`CH_VAT_RATE_BPS`). Coupon before VAT in `policy.ts`. Charge CHF.
- Dual-DC: `app/ops/OpsPricing.dc.html` and `OpsTable.dc.html` copied to `apps/web/public/app/ops/`.
- Hosted SQL: `20260914190000_quote_rate_book_live_classes.sql` and `20260914191000_vehicle_class_any_photo.sql` present in git; owner applied 2026-09-14 (not `db push`, not restore onto yaumjzvylngfjhtuffqs).
- Owner authorized close of Task 3 UAT on 2026-09-15. Agent did not click Publish.

## Task Commits

Close-out is uncommitted unless the owner asks.

1. **Task 1: Recap D-28, VAT/coupon D-24, extra wait D-23** — already in tree (`extra-wait-no-offsession.test.ts`, `intent.ts`, `bookings-map.ts`, `vat.ts`, `policy.ts`)
2. **Task 2: Grep gates** — Wave 0 + owned 18-07 files green (75 tests). Dual-DC sync this session.
3. **Task 3: Owner SQL + owner UAT** — SQL applied 2026-09-14; owner close 2026-09-15

## Files Created/Modified

- `apps/web/lib/checkout/extra-wait-no-offsession.test.ts` — T-18-05 grep including bookings-map and recap
- `apps/web/lib/checkout/intent.ts` — waiting extra is 0 at pay
- `apps/web/lib/ops/bookings-map.ts` — extra wait display only
- `apps/web/public/app/ops/OpsPricing.dc.html` — byte-equal to canonical
- `apps/web/public/app/ops/OpsTable.dc.html` — byte-equal to canonical

## Decisions & Deviations

- Did not click Publish. Did not `supabase db push`. No `sk_live_`. No `vamostaxi.eu`.
- Full suite command from the plan is **not** all-green. Failures are outside 18-07 files: `settings.test.ts` (vat_rate_bps required), `sqlstate.test.ts` (added `exclusion: 23P01`), `settle.test.ts` CaptureGate mock typing, `checkout-comments.test.ts` RouteSummary CSS, `ops-dc-settings.test.ts` (`#pricing` vs `/pricing`). Not fixed in this close-out.
- Home dual-DC is **not** byte-equal: public copy injects `<base href="/app/home/">`. Plan said equal; OpsPricing is the byte-equal gate that tests enforce.

## Verification

```
pnpm --filter web exec vitest run \
  lib/checkout/extra-wait-no-offsession.test.ts \
  lib/checkout/vat.test.ts \
  lib/pricing/policy.test.ts \
  lib/checkout/intent.test.ts \
  lib/pricing/d15-recipe.test.ts \
  lib/pricing/public-live-book-board.test.ts \
  lib/ops/ops-pricing-tabs.test.ts \
  lib/ops/ops-pricing-vat-field.test.ts
```

8 files, 75 passed. Migrations `test -f` both SQL files: ok.

## Next Phase Readiness

Phase 18 restart (D-01…D-35) is closed in planning. Next executable work is **Phase 13** (Staff APIs + outbound Resend replies). `11-12` owner Publish on live pricing remains a standing owner gate and does not reopen 18. Stripe stays test until the owner says live keys.

---
*Phase: 18-ops-pricing-source*
*Completed: 2026-09-15*
