---
phase: 04-quote-pricing-engine
plan: 10
subsystem: api
tags: [mapbox, geo, suggest, retrieve, reverse, directions, service-area, kv, quote-01, quote-07]

requires:
  - phase: 04-quote-pricing-engine (plan 04-06)
    provides: quote_settings_version RPC (polygon / min_advance_minutes as arguments)
  - phase: 04-quote-pricing-engine (plan 04-08)
    provides: zod boundary, QUOTE_ERRORS, quoteErrorResponse
provides:
  - suggest / retrieve / reverse / routeLegs Mapbox client (one server-held token, no KV of Licensed Map Content)
  - QUOTE-07 service-area gate + pre-Mapbox refusals (same-place, country box, min-advance)
  - three /api/geo/* proxies with hashed session-token gate on /retrieve
affects: [04-11, 04-13, 04-14, widget type-ahead]

tech-stack:
  added: []
  patterns:
    - "MAPBOX_TOKEN optional; absence degrades (empty suggest / place null / route_unavailable), never throws"
    - "QUOTE_ABUSE holds our session-token set only; GEO_CACHE is unused (D-14)"
    - "hasSeenSession fails closed when KV is missing or throws (abuse control, opposite of token-absent degrade)"
    - "Route Handlers: force-dynamic + getCloudflareContext + withRequestContext + quoteErrorResponse"

key-files:
  created:
    - apps/web/lib/geo/mapbox.ts
    - apps/web/lib/geo/mapbox.test.ts
    - apps/web/lib/geo/fixtures.ts
    - apps/web/lib/geo/serviceArea.ts
    - apps/web/lib/geo/serviceArea.test.ts
    - apps/web/lib/geo/session.ts
    - apps/web/lib/geo/session.test.ts
    - apps/web/app/api/geo/suggest/route.ts
    - apps/web/app/api/geo/retrieve/route.ts
    - apps/web/app/api/geo/reverse/route.ts
  modified: []

key-decisions:
  - "D-14: session KV stores hashed UUID + bucket only; no Mapbox field may be added to the record"
  - "q < 3 on /suggest is 200 empty suggestions and does not rememberSession (AM-03: a two-character 200 must not unlock /retrieve)"
  - "04-13 owns rate-limit, breaker, and Turnstile; each geo route header names that seam"

patterns-established:
  - "Geo proxies never return statusText, err.message, or an upstream body (address leak)"
  - "publicSuggestion pick-list strips coordinates at the /suggest boundary, asserted in unit tests rather than trusting the mapper"

requirements-completed: [QUOTE-01, QUOTE-07]

duration: 39min
completed: 2026-08-28
---

# Phase 4 Plan 10: Geo Mapbox + service-area Summary

**Server-held Mapbox client (suggest/retrieve/reverse/Directions) with no Licensed Map Content in KV; QUOTE-07 two-path service area; three `/api/geo/*` proxies gated by a hashed 30-minute session set on `QUOTE_ABUSE`.**

## Performance

- **Duration:** 39 min
- **Started:** 2026-08-28T13:06:35Z
- **Completed:** 2026-08-28T13:45:30Z
- **Tasks:** 3/3
- **Files modified:** 10 created (0 modified)

## Accomplishments

- Four Mapbox calls behind one optional `MAPBOX_TOKEN`; injected `fetch`; hand-written fixtures only; D-47 degrades with no token and no network.
- QUOTE-07: named live `fixed_routes` pair first (keeps Zermatt bookable), else both ends in the polygon; NULL polygon → `service_area_undefined`; NULL `min_advance_minutes` skips; on-edge is inside.
- `/api/geo/suggest|retrieve|reverse` as the first product Route Handlers: `force-dynamic`, zod query → `400 untrusted_input`, `/retrieve` 403 `retrieve_without_suggest` before Mapbox, no upstream strings.

## Task Commits

Each task was committed atomically:

1. **Task 1: Mapbox client — four calls, one token, no cache** - `c100cd4` (feat)
2. **Task 2: service-area gate and pre-Mapbox refusals** - `cc9318f` (feat)
3. **Task 3: three geo proxies and session-token gate** - `143058f` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/geo/mapbox.ts` — suggest / retrieve / reverse / routeLegs; token last on the query string
- `apps/web/lib/geo/mapbox.test.ts` — offline fixtures, D-47 degrade, no-coordinate suggest mapping
- `apps/web/lib/geo/fixtures.ts` — hand-written shapes, never a live capture
- `apps/web/lib/geo/serviceArea.ts` — point-in-polygon, named-pair, min-advance, country box, same-place
- `apps/web/lib/geo/serviceArea.test.ts` — ≥22 assertions + convex-ring property test
- `apps/web/lib/geo/session.ts` — `rememberSession` / `hasSeenSession` / `publicSuggestion` on `QUOTE_ABUSE`
- `apps/web/lib/geo/session.test.ts` — same-bucket true, other bucket/expired/throwing/missing KV false, key has no raw UUID
- `apps/web/app/api/geo/suggest/route.ts` — type-ahead; `q<3` → empty 200; strip coordinates
- `apps/web/app/api/geo/retrieve/route.ts` — session gate before Mapbox
- `apps/web/app/api/geo/reverse/route.ts` — no session; `place: null` is 200

## Decisions Made

- Session key is `geo:session:{bucket}:{sha256(uuid)}` with 30-minute TTL. Bucket is `cf-connecting-ip` (else first `x-forwarded-for`, else `unknown`). 04-13 may replace the bucket source; the hash shape stays.
- `/suggest` records the session only after a real suggest attempt (`q≥3`). Short queries must not mint a retrieve pass.
- Rate-limit / breaker / Turnstile are explicitly not called; header comments point 04-13 at these files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Empty query lng/lat must 400, not coerce to 0**
- **Found during:** Task 3 (geo proxies)
- **Issue:** `z.coerce.number()` turns `""` into `0`, which would reverse Null Island instead of `untrusted_input`.
- **Fix:** query-string finite number = non-empty string that `Number.isFinite(Number(s))`.
- **Files modified:** `apps/web/app/api/geo/reverse/route.ts`
- **Verification:** `pnpm typecheck` exit 0; reverse schema is `.strict()` + finite transform
- **Committed in:** `143058f` (Task 3)

---

**Total deviations:** 1 auto-fixed (Rule 1)
**Impact on plan:** Correctness of the untrusted query boundary. No scope creep.

## Issues Encountered

- `next build` prints `Error: ENVIRONMENT_FALLBACK` while generating static pages (OpenNext `getCloudflareContext` during SSG — Pitfall 5). Build still exits 0. The three geo routes appear as `ƒ` (dynamic) in the route table. Same class of warning `db-smoke` already lives with.

## User Setup Required

None - no external service configuration required this plan. `MAPBOX_TOKEN` remains owner-held (D-47); absence degrades.

## Next Phase Readiness

- Ready for 04-11 (quote handler consumes `routeLegs` + `checkServiceArea` / `checkMinAdvance`) and 04-13 (wrap these `/api/geo/*` call sites with rate-limit, breaker, Turnstile-off).
- No Mapbox account required to keep the unit suite green.
- Worktree mode: STATE.md / ROADMAP.md left to the orchestrator.

## Verification log

```
pnpm --filter web exec vitest run lib/geo
  exit 0  Test Files 3 passed; Tests 50 passed; 0 skipped / 0 todo

pnpm typecheck
  exit 0  (packages/db, apps/isolation-probe, apps/web)

pnpm build
  exit 0  route table includes ƒ /api/geo/suggest, ƒ /api/geo/retrieve, ƒ /api/geo/reverse
```

Task 3 acceptance greps:

```
force-dynamic on three routes                         → 3
hasSeenSession in retrieve/route.ts                   → 3
retrieve_without_suggest in retrieve/route.ts         → 1
GEO_CACHE in session.ts (non-comment)                 → 0
err.message|error.message|statusText in api/geo (code)→ 0
```

## Self-Check: PASSED

- [x] key-files.created exist on disk
- [x] `git log --oneline --grep=04-10` returns the three feat commits plus this metadata commit
- [x] Task 1–3 `<acceptance_criteria>` re-run green
- [x] Plan-level `vitest lib/geo` / `typecheck` / `build` green (0 skipped)

---
*Phase: 04-quote-pricing-engine*
*Completed: 2026-08-28*
