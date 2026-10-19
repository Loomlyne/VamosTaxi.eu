---
phase: 28-pixel-pageview
plan: 04
requirements: [META-07]
---
# Phase 28 Plan 04: server-side second lock

- `contentSecurityPolicy({ metaPixel })` in `lib/security/headers.ts`. `false` is the existing policy byte for byte (pinned). `true` adds `https://connect.facebook.net` to script-src, `https://www.facebook.com` to img-src, connect-src and frame-src; connect-src does not gain the script host; no Instagram or gateway host. `SECURITY_HEADER_PAIRS` names no Meta host (pinned in headers.test.ts and legal-gate.test.ts).
- `Referrer-Policy: strict-origin` on every response (the one intended change to an existing pin).
- `metaPixelCspFor(url, measurementAllowed)` in `lib/meta/pixel-csp.ts`: the Meta policy only for allowed addresses while both flags are on; tested over the shared address table.
- `middleware.ts`: mock-serve branch only (two imports and a few lines). The URL handed to the chooser is built as `https://<Host header hostname><path><query>`, so a local Worker proof with a Host header gives the public answer; production Host is the real host. The policy depends on the address only, so the 300 s cache stays identical for everyone.

Verified: `vitest run lib/security lib/meta lib/consent/mock-mounts.test.ts` 383 passed; `pnpm typecheck` passes. Served-header proof on a local Worker build is part of the 28-07 gate.
