---
phase: 10-hardening-performance-security-compliance
verified: 2026-09-12T18:50:00Z
status: passed
source: 10-UAT.md
---

# Phase 10 verification

Owner UAT on https://vamostaxi.site. 8 passed, restore skipped (Supabase Free).

- Cookie strip: ACCEPT ALL / NECESSARY ONLY / Manage preferences. No four-toggle grid.
- After ACCEPT ALL, banner stays gone on reload.
- dashboard.vamostaxi.site/login has no cookie banner.
- /cookies is necessary-only. No fake Analytics/Marketing switches.
- Quote SELECT reaches /checkout. No Turnstile on checkout. Not 403.
- GET /api/internal/health without header: empty 404. Owner authorized curl: `{ok,db,payments,maps}` all true.
- GET /api/dev/db-smoke: empty 404 (leak gate kept).
- WAF skip live on vamostaxi.site: Skip Stripe webhook, order 1, path `/api/stripe/webhook`.
- Restore Task 3 parked: stay on Supabase Free; never restore onto yaumjzvylngfjhtuffqs.

CSP D-33: first ship blocked DC React on unpkg (white home). Loosened script-src for unpkg + wasm-unsafe-eval. Redeployed Worker **vamos** `2c6d7c87`. Home + quote re-verified.

Named Vitest only (no full lint/typecheck/build): 10-01…10-08 gates green. headers.test.ts 3/3 after CSP fix.

Phase 11 DNS / live Stripe stays out.
