---
phase: 28-pixel-pageview
plan: 07
requirements: [META-06, META-07, META-08, META-09]
---
# Phase 28 Plan 07: real-script proof, flags opened, gate, hand-over

- Meta's real `fbevents.js` (2.9.414) and the setup file were downloaded at 2026-10-03 13:58 UTC (plain GETs, temp folder, not committed) and run on our `/sign-in` and `/about` with every Meta request caught locally. Result: one `PageView`, no other event, no user data, `_fbp` 90 days on `.vamostaxi.site`; withdraw stops everything. Control run without the two `autoConfig` lines: the real script sends an extra `POST /tr/`. Detail in `HANDOVER.md`.
- Gate at 14:00:50 UTC (`v=2.9.412` and `2.9.414`): AutomaticMatching opt-in 0, `config.set(... automaticMatching)` 0, InferredEvents opt-in still 2 (kept off in code). Owner chose to open after this proof (`28-SIGNED.md`). Both flags set true in `legal-gate.ts` and `app/vamos-meta.js`; the `@ts-expect-error` removed; pins updated.
- Extra, not in the plan: `tests/e2e-worker/meta-click-ids.e2e.mjs` and `meta-run.sh` prove META-09 on a real local Worker against the own stack (6 PASS, 1 N/A).
- Full gate list and results: `HANDOVER.md`. Merged `origin/main` twice. Stack and Worker stopped.

## Deviations
- The hand-over file is `HANDOVER.md` (the orchestrator's name), not `28-HANDOVER.md`.
- `consent-banner-27.spec.ts` could not be run here (its `next dev` never became ready without the app env); recorded as not verified.
