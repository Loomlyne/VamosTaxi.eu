---
phase: quick-261020-fh7
plan: 01
status: complete
commit: c8da82cd
---

# Quick 261020-fh7: ops console no beacon

The gateway (`vamos-dashboard`) now adds `no-transform` to Cache-Control on every text/html response from APP and PUBLIC, so the zone's Web Analytics auto-injection skips dashboard.vamostaxi.site. Existing directives are kept; HTML with no header gets `private, no-store, no-transform`. Non-HTML, redirects, cookies, robots.txt and the SNI 404 are untouched; the body is streamed.

## Files (commit c8da82cd, local main, not pushed)
- apps/web/lib/security/no-transform.ts, no-transform.test.ts (new)
- apps/web/dashboard-gateway.ts (wired, fetch made async, header note)
- apps/web/tests/unit/dashboard-gateway-no-transform.test.ts (new)
- the PLAN.md

## Checks
- vitest (2 files, 17 tests): pass. RED run failed before the helper existed.
- tsc --noEmit: clean.
- pnpm gate:local: exit=0 (~/.vamos-scratch/fh7-gate.log).
- Real pair check: `wrangler dev -c wrangler.dashboard.jsonc -c wrangler.jsonc --env staging --local --port 4731` worked, no fallback needed (no "overloaded" line in log). Host: dashboard.vamostaxi.site:
  - GET /login: 200, text/html, `Cache-Control: private, no-store, no-transform`
  - GET /: 307, Location /login, `Cache-Control: private, no-store`
  - GET /_next/static/css/163d0a58c871d92d.css: 200, text/css, `public, max-age=0, must-revalidate` (same as the same file via the apex host)
- Dev server stopped by PID (wrangler 36368, workerd 36611); ports 4731/9331 clear.

## Controller next steps
Owner Ship; deploy `vamos-dashboard` only (`vamos` unchanged). Live check: `curl -sI https://dashboard.vamostaxi.site/login` shows no-transform and the HTML has no static.cloudflareinsights.com; https://vamostaxi.site still has exactly one beacon.

## Deviations
None. SUMMARY.md and STATE.md not committed, as instructed.
