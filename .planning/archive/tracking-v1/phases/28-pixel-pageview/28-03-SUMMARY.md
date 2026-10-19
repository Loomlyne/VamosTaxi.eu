---
phase: 28-pixel-pageview
plan: 03
requirements: [META-07, META-08]
---
# Phase 28 Plan 03: mount, second flag, per-needle scan

- One helmet line `<script src="../vamos-meta.js"></script>` after `vamos-consent.js` in both CookieBanner twins (+1 line each). Pins: exactly once per twin, after the consent runtime; no ops file, no other mock, no Next source references the loader; `serveDcHtml` mentions neither the loader, `fbq` nor `pixel`.
- `legal-gate.ts`: `META_EVENTS_MANAGER_SWITCHES_OFF = false` next to `META_LEGAL_GATE_OPEN = false`; `metaMeasurementAllowed()` needs both. The `@ts-expect-error` stays until 28-07.
- `legal-gate.test.ts`: scan now covers `apps/web/{app,components,lib,public}`, `middleware.ts`, `worker.ts` if present and the repo-root `app/`; pixel id, `fbq(` and `fbevents.js` allowed only in `app/vamos-meta.js` (and its synced copy), `connect.facebook.net` also in `lib/security/headers.ts`; `facebook.com/tr`, `graph.facebook.com`, the CAPI token and a noscript image near Meta allowed nowhere. Hand check: a pixel id added to `apps/web/lib/zz-tmp.ts` made it fail (reverted). JS flags pinned equal to TS flags, switch flag pinned to the decision file (the 2026-10-03 addendum is required once true).

Verified: `vitest run lib/meta lib/consent` 388 passed; `pnpm typecheck` passes.
Also fixed in the same commit: a typecheck error in the 28-01 Worker-client test (`null` claims for the checkout identity).
