---
phase: 11-launch-cutover
plan: 05
subsystem: seo
tags: [noindex, sitemap, robots, D-03, D-04, D-05, D-30, D-31]

# Dependency graph
requires:
  - phase: 11-launch-cutover
    provides: 11-01 indexing.test.ts RED assertions; 11-06 BookingBoard nulls CHF when !pricing_live
provides:
  - Host-split X-Robots-Tag: dashboard/ops-changes always noindex; public vamostaxi.site + www indexable on Worker vamos
  - SITEMAP_ROUTES D-30 allowlist; robots D-31 disallows
  - Middleware www→apex 301 (live www was HTTP/2 200)
affects: [11-08, 11-12, Search Console after V1]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - applyStagingNoindex(request, response) keys off isDashboardHost || DEPLOY_ENV=ops-changes, not public staging
    - sitemap.ts walks SITEMAP_ROUTES (readonly PublicRoute[]), not PUBLIC_ROUTES

key-files:
  created: []
  modified:
    - apps/web/middleware.ts
    - apps/web/app/sitemap.ts
    - apps/web/app/robots.ts

key-decisions:
  - "Public vamostaxi.site / www stay indexable even when DEPLOY_ENV=staging (D-03); dashboard always noindex (D-04)"
  - "env.production unused (D-08); host-split is the indexable path"
  - "SITEMAP_ROUTES in sitemap.ts only; metadata.ts PUBLIC_ROUTES / buildAlternates untouched"
  - "Live curl -I www was HTTP/2 200, so middleware 301 www→https://vamostaxi.site; no DNS, no .eu"

patterns-established:
  - "Noindex is host-split at both applyStagingNoindex and the final i18n block"
  - "XML sitemap is D-30 allowlist; D-31 paths live in robots.txt only"

requirements-completed: [LAUNCH-05]

# Metrics
duration: 2h 17m
completed: 2026-09-13
---

# Phase 11 Plan 05: Host-split noindex + SITEMAP_ROUTES + www probe Summary

**Public vamostaxi.site stays indexable on Worker vamos (DEPLOY_ENV=staging); dashboard/ops-changes always noindex; XML sitemap is the nine D-30 paths; www→apex 301 added after live www returned 200**

## Performance

- **Duration:** 2h 17m
- **Started:** 2026-09-13T00:15:32Z
- **Completed:** 2026-09-13T02:32:37Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Both noindex sites (`applyStagingNoindex` and the final i18n block) branch on `isDashboardHost` / `ops-changes`, not public `DEPLOY_ENV=staging`
- Staff gate `isDashboardHost && isOpsRequest` unchanged; `/dev` exclusion in next.config.ts untouched
- `SITEMAP_ROUTES` is the nine D-30 paths; XML uses unprefixed `SITE_URL` only (never `/de` `/fr` `/ar`)
- robots.txt keeps `sitemap: SITE_URL/sitemap.xml` and appends D-31 disallows
- `indexing.test.ts` 8/8 green
- wrangler.jsonc and `metadata.ts` PUBLIC_ROUTES untouched; no deploy, no DNS, no `.eu`

## Task Commits

Each task was committed atomically:

1. **Task 1: Host-split noindex at both middleware sites** - `c075901` (feat)
2. **Task 2: SITEMAP_ROUTES allowlist + robots extra disallows** - `03e0da4` (feat)
3. **Task 3: www→apex probe; middleware 301 only if broken** - `d5c702b` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/middleware.ts` - host-split noindex; www.vamostaxi.site 301 to https://vamostaxi.site
- `apps/web/app/sitemap.ts` - `SITEMAP_ROUTES` D-30 allowlist
- `apps/web/app/robots.ts` - D-31 disallows; sitemap URL kept

Unchanged: `apps/web/lib/metadata.ts` (PUBLIC_ROUTES / buildAlternates), `apps/web/wrangler.jsonc`, cookie banner.

## Decisions Made

- Indexability is host-split, not env.production (unused, D-08)
- Sitemap file only (D-29); no Search Console submit
- Live www was 200, so middleware 301 — no Cloudflare DNS click

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0
**Impact on plan:** None

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Verification

`indexing.test.ts`: 8 passed (vitest 4.1.11, cwd worktree `apps/web`).

wrangler.jsonc diff: empty.

## www curl -I (Task 3)

Command: `curl -sSI --max-time 20 https://www.vamostaxi.site`

```
HTTP/2 200
date: Sun, 13 Sep 2026 02:13:17 GMT
content-type: text/html; charset=utf-8
cf-ray: a3a3a1c19bbba6ab-DXB
cf-cache-status: HIT
cache-control: private, no-store
server: cloudflare
strict-transport-security: max-age=31536000; includeSubDomains
cf-placement: remote-ZRH
content-security-policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' unpkg.com js.stripe.com challenges.cloudflare.com; frame-src js.stripe.com hooks.stripe.com challenges.cloudflare.com; connect-src 'self' api.stripe.com challenges.cloudflare.com api.mapbox.com events.mapbox.com; img-src 'self' data: blob: https://*.mapbox.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
nel: {"report_to":"cf-nel","success_fraction":0.0,"max_age":604800}
permissions-policy: camera=(), microphone=(), geolocation=()
referrer-policy: strict-origin-when-cross-origin
x-frame-options: DENY
x-robots-tag: noindex
alt-svc: h3=":443"; ma=86400
```

No `Location: https://vamostaxi.site`. Not a 301. Middleware 301 added in `d5c702b`. No DNS change. No `.eu` 301s. Live header still `x-robots-tag: noindex` because this plan did not deploy Worker vamos.

## Next Phase Readiness

Public indexing + sitemap file ready on the phase branch. Live www 301 and public noindex drop wait on a later Worker `vamos` deploy (not this plan). Do not submit Search Console (D-29). Do not bind `.eu`.

## Self-Check: PASSED

- FOUND: apps/web/middleware.ts
- FOUND: apps/web/app/sitemap.ts
- FOUND: apps/web/app/robots.ts
- FOUND: .planning/phases/11-launch-cutover/11-05-SUMMARY.md
- FOUND: c075901 feat(11-05): host-split noindex at both middleware sites
- FOUND: 03e0da4 feat(11-05): SITEMAP_ROUTES allowlist and D-31 robots disallows
- FOUND: d5c702b feat(11-05): 301 www.vamostaxi.site to apex
- indexing.test.ts: 8 passed
- wrangler.jsonc / metadata.ts: not modified

---
*Phase: 11-launch-cutover*
*Completed: 2026-09-13*
