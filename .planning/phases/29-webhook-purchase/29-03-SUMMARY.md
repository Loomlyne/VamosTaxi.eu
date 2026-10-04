---
phase: 29-webhook-purchase
plan: 03
subsystem: meta-capi
tags: [meta, capi, needle-scan]
requires: ["29-01"]
provides:
  - apps/web/lib/meta/capi.ts (buildPurchaseEvent, postPurchase, GRAPH_VERSION, PURCHASE_EVENT_SOURCE_URL)
  - needle-scan allow map for capi.ts, capi.test.ts, purchase.ts, env.d.ts
  - Worker binding types META_CAPI_ACCESS_TOKEN, META_TEST_EVENT_CODE
affects: [29-05]
key-files:
  created:
    - apps/web/lib/meta/capi.ts
    - apps/web/lib/meta/capi.test.ts
  modified:
    - apps/web/lib/meta/legal-gate.test.ts
    - apps/web/lib/env.d.ts
requirements-completed: [META-10, META-11, META-12, META-14]
completed: 2026-10-03
---

# Phase 29 Plan 03: Meta CAPI module Summary

Pure module that builds the locked Purchase event (fbp/fbc, CHF from rappen, our event id, https://vamostaxi.site) and sends it once with a 5 s limit and no retry, classifying sent, rejected or failed.

## Commits
- 03e39371 feat(29-03): payload and single POST
- 7dac49c8 test(29-03): needle scan allow map, bindings typed

## Results
- capi.test.ts 8/8 and legal-gate.test.ts pass (18 tests together); `tsc --noEmit` clean.
- Token only in the body field `access_token`; URL has no query string; outcome keeps http, code, subcode only; no logging; `fbtrace` count 0.
- legal-gate.ts untouched. Fake token and stubbed fetch only; no network call.

## Deviations from Plan
None.

## Known Stubs
None.

## Self-Check: PASSED
