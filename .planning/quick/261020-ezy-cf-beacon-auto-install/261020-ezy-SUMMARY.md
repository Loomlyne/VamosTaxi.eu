---
status: complete
quick: 261020-ezy
commit: f0a91bc2
completed: 2026-10-20
---

# Quick 261020-ezy: stop loading the Cloudflare beacon ourselves

Our code no longer adds the Cloudflare Web Analytics beacon on any host. Cloudflare's zone auto-install (owner 2026-10-20) is the only source.

## Changes (commit f0a91bc2, local main, not pushed, not deployed)
- `app/vamos-consent.js`: removed BEACON_SRC/BEACON_TOKEN, startAnalytics() and its three calls; header comment states the 2026-10-20 decision. state/save/cached/onChange/turnstile untouched.
- `apps/web/lib/consent/vamos-consent.test.ts`: beacon test replaced by an absence test (vamostaxi.site, vamostaxi.eu, localhost, dashboard.vamostaxi.site, plus source-text check). RED seen first, then green.
- Deleted `apps/web/lib/consent/web-analytics.ts` and its test; `CookieBanner.tsx` import and call removed.
- `apps/web/lib/security/headers.ts`: comment only; CSP strings and headers.test.ts unchanged.
- `.gitleaks.toml`: allowlist entry for the site tag removed (token no longer in repo outside .planning).

## Verification
- vitest lib/consent, components/consent, lib/security/headers: 14 files, 124 tests pass.
- `pnpm typecheck` pass.
- `pnpm gate:local` exit=0, full including test:db-lab (log `~/.vamos-scratch/gate-261020-ezy.log`).
- Final git grep for cloudflareinsights/loadWebAnalytics/web-analytics/data-cf-beacon outside .planning and docs/build: only headers.ts (CSP + comment), headers.test.ts, and the new absence test.

## Deviations
None.

## Left for the controller
Ship/push, deploy, switch Web Analytics on, Cloudflare rule keeping the beacon off dashboard.vamostaxi.site.
