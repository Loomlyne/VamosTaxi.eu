---
phase: 29-webhook-purchase
plan: 05
subsystem: meta-capi
tags: [meta, capi, orchestrator, worker-client]
requires: ["29-02", "29-03"]
provides:
  - apps/web/lib/meta/purchase.ts (sendMetaPurchase, metaPurchaseDepsFromEnv, MetaPurchaseInput, MetaPurchaseDeps, ClaimRow)
  - packages/db/test/local/meta-purchase.test.ts (claim/finish/clear_ids through the Worker client options)
affects: [29-06]
key-files:
  created:
    - apps/web/lib/meta/purchase.ts
    - apps/web/lib/meta/purchase.test.ts
    - packages/db/test/local/meta-purchase.test.ts
  modified:
    - scripts/db-access-fence-allowlist.json
requirements-completed: [META-10, META-11, META-12, META-13, META-14]
completed: 2026-10-03
---

# Phase 29 Plan 05: Purchase orchestrator Summary

`sendMetaPurchase` runs gate, token, Stripe mode, claim, one POST, finish, log; it never throws, never retries, and wipes the booking's ids best-effort when the claim itself fails.

## Commits
- 7d83f2a2 test(29-05): Worker-client proof for the Meta Purchase claim
- bbb40983 feat(29-05): Meta Purchase orchestrator
- 574ffb36 chore(29-05): fence allow-list entry for the Purchase orchestrator

## Results
- Local stack (vamos-taxi-290, port 62322): meta-purchase, meta-click-ids, consent-reader local tests 9/9. Claim returns text decision, string uuid, number rappen, parseable date through fetch_types:false.
- Web: purchase.test.ts + legal-gate.test.ts + system-reads.test.ts 31/31; `tsc --noEmit` clean; `pnpm check:db-fences` passes.
- Greps: token binding name only in purchase.ts, env.d.ts, legal-gate.test.ts; zero console calls; zero "retry" in code.
- Log fields are a subset of bookingId, outcome, reason, http, code (subcode folded as `100.2804050`); a log-spy test asserts token, fbp, fbc, subject, Graph message, trace id and test code never appear.
- A faulty 'send' with refundRequired true posts nothing and writes no finish (the claim row stays 'sending'; by design, the claim should never answer send then).

## Deviations from Plan
**1. [Rule 3 - Blocking] Fence force-dynamic exemption.** `check-db-access-fences` failed on purchase.ts (imports `asSystem`, no route). Added it to `force_dynamic_exempt` with a comment clause (library; only consumer is the settle queue, 29-06). Commit 574ffb36.
**2. Test fixture.** The second booking's payment uses snapshot_id 1: the one-succeeded-per-snapshot index rejects two succeeded rows on snapshot 0.

## Known Stubs
None.

## Self-Check: PASSED
