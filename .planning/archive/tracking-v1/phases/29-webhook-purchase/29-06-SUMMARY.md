---
phase: 29-webhook-purchase
plan: 06
subsystem: meta-capi
tags: [meta, settle-queue, worker]
requires: ["29-05"]
provides:
  - SettleDeps.sendMetaPurchase (optional), metaPurchaseDepFor, handleStripeMessage(env, message, options?)
  - worker.ts queue opt-in; return-route source pins
key-files:
  modified:
    - apps/web/lib/checkout/settle.ts
    - apps/web/lib/checkout/settle.test.ts
    - apps/web/lib/checkout/return-settle.test.ts
    - apps/web/worker.ts
requirements-completed: [META-10, META-13, META-14]
completed: 2026-10-03
---

# Phase 29 Plan 06: Settle queue hook Summary

The settle queue now calls the Meta Purchase once after the expire loop for a succeeded, non-extra payment (also when the return route settled first); the Worker queue opts in, the return route cannot.

## Commits
- bf8d5fdf feat(29-06): settle queue calls the Meta Purchase after the money steps
- e0ca15f7 feat(29-06): queue consumer opts in to the Meta Purchase; return route pinned out

## Results
- settle.test.ts 79/79 (new describe covers success, already_settled, refundRequired order, extra, failed/expired/money events, livemode, payment_id 0, throw/reject leaves result identical incl. settled.duplicate, absent dep, call order after expire, opt-in helper).
- return-settle + settle + lib/meta (incl. legal-gate) 456/456; `tsc --noEmit` clean.
- HandleResult and applyHandleResult untouched; settle.ts has no token name or Graph host; return-settle.ts not edited.
- A hanging dep is bounded by the 5 s Graph timeout inside purchase.ts (29-05); settle awaits it, same ack/retry outcome.

## Deviations from Plan
None - plan executed as written.

## Known Stubs
None.

## Self-Check: PASSED
