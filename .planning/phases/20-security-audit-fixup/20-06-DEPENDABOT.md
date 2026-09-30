# Dependabot triage, 41 open alerts (read-only; source: gh api; 2026-09-30)

Severity: 15 high, 17 medium, 9 low (matches GitHub).
Only 5 packages: undici (28), fast-uri (6), brace-expansion (4), qs (2), js-yaml (1).

GitHub labels most of them "runtime" only because pnpm-lock.yaml has no dev/prod split. `pnpm why -r` shows every path ends at a devDependency.
None of the 5 is in apps/web `dependencies` (next, react, supabase, stripe, resend, zod, next-intl, standardwebhooks, lenis, @vamos/db, @vamos/emails).
No source import of any of the 5 anywhere except packages/db/test/support/drive.ts (undici, test helper).
Next.js 15.5.25 itself has no open alert.

## (a) Runtime and reachable on the Worker: NONE (0 alerts)

## (b) Runtime but vulnerable path not used: NONE (0 alerts)

## (c) Dev / build / test only: ALL 41

| Alerts | Sev | Package | Installed | Patched | Chain (pnpm why) | Reachable on Worker | Suggested action |
|---|---|---|---|---|---|---|---|
| 14,15,16,17,19 (high), 47 (med) | 5 high, 1 med | fast-uri | 3.1.5 | 3.1.6 / 3.1.7 / 3.1.8 | ajv 8.20 > table > stylelint 17.14.1 (web devDep) | No: stylelint lint tooling | pnpm override fast-uri >=3.1.8 |
| 18 | high | js-yaml | 4.3.1 | 4.3.2 | cosmiconfig > stylelint | No: lint tooling | override js-yaml >=4.3.2 |
| 42,44 (high), 46 (med) | 2 high, 1 med | brace-expansion 2.x | 2.1.4 | 2.1.5 / 2.1.6 / 2.1.7 | minimatch 8 > glob 9 > @node-minify/core > @opennextjs/aws > @opennextjs/cloudflare (web devDep) | No: build-time globbing in the OpenNext CLI, not in the emitted Worker | override >=2.1.7 or bump @opennextjs/cloudflare |
| 45 | med | brace-expansion 5.x | 5.0.9 | 5.0.12 | minimatch 10 > eslint 10 / typescript-eslint, glob 12 > opennext | No: lint/build | override >=5.0.12 |
| 12,13 | med | qs | 6.15.3 | 6.16.0 | body-parser > express 5 > @opennextjs/aws > @opennextjs/cloudflare | No: express is OpenNext's local server/build dependency, not in the Worker bundle; no qs import in app code | override qs >=6.16.0 |
| 20-40 (21 alerts: high 24,27,28,35,36; med 20,21,22,23,31,32,33,34,39,40; low 25,26,29,30,37,38) | 5 high, 10 med, 6 low | undici (lockfile ranges 7.x and 8.x) | 7.29.0 (7.x ranges), 8.10.0 (8.x ranges) | 7.29.1 / 8.10.2 | 7.29.0: miniflare 5.20260815 > wrangler 4.124 (web + @vamos/isolation-probe devDeps). 8.10.0: @vamos/db devDep | No: wrangler/miniflare local tooling; the Workers runtime has its own fetch and does not bundle undici | wait for wrangler bump, or override undici 7.x >=7.29.1 |
| 3,4,5,6,7,10,11 (manifest packages/db/package.json) | 2 high (3,5), 2 med (7,11), 3 low (4,6,10) | undici | 8.10.0 (pinned) | 8.10.2 | direct devDep of @vamos/db; sole import is packages/db/test/support/drive.ts | No: test helper only | change the pin to 8.10.2 (one line); closes 7 alerts, and the 8.x lockfile alerts with it |

Fast path if he wants the count to go to zero: one pin (undici 8.10.2 in packages/db) plus pnpm overrides for fast-uri, js-yaml, brace-expansion (2.x and 5.x), qs, undici 7.x; or bump @opennextjs/cloudflare, wrangler and stylelint to versions that carry the patched transitives. Not done here (read-only).
