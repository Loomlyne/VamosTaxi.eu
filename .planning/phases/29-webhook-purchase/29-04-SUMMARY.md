---
phase: 29-webhook-purchase
plan: 04
subsystem: checkout-meta
tags: [meta, consent, checkout]
requires: [29-01, 29-02]
provides: [Pay press saves consent subject with _fbp/_fbc via 4-arg writer]
key-files:
  modified:
    - apps/web/lib/meta/click-ids.ts
    - apps/web/lib/meta/click-ids.test.ts
    - apps/web/app/api/checkout/intent/route.ts
    - apps/web/lib/meta/click-ids-route.test.ts
requirements-completed: [META-11, META-13]
completed: 2026-10-03
---

# Phase 29 Plan 04: Pay press saves the consent subject Summary

At the Pay press the decision now returns the consent subject and the intent route writes `[bookingId, fbp, fbc, subject]` through the 4-argument `checkout_set_meta_click_ids`; every "none" branch writes three nulls.

## Commits
- f8153fc0 feat(29-04): decision and scheduler carry the subject
- 69538759 feat(29-04): route calls the 4-argument writer

## Results
- `vitest run lib/meta`: 8 files, 342 tests pass (click-ids 17, route test incl. new marketing-off case).
- `tsc --noEmit` in apps/web: clean.
- Route diff: 3 insertions, 2 deletions (write closure plus one comment line). No change to quote, pay or confirmation files.
- Dashboard Origin still skips (nothing saved or cleared); write stays in ctx.waitUntil; the only log line is still the SQLSTATE.

## Deviations from Plan
None. The route test gained one extra case (marketing off writes three nulls).

## Known Stubs
None.

## Self-Check: PASSED
