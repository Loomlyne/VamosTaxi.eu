---
phase: 27-consent-record
plan: 05
subsystem: api
tags: [consent, route, no-store]
requires: [27-01]
provides:
  - "readConsentChoice(tx, subject, asOf?) in apps/web/lib/consent/read.ts"
  - "GET /api/consent/state (force-dynamic, private no-store, Vary Cookie)"
key-files:
  created:
    - apps/web/lib/consent/read.ts
    - apps/web/lib/consent/read.test.ts
    - apps/web/app/api/consent/state/route.ts
    - apps/web/tests/unit/consent/state-route.test.ts
requirements: [META-04, META-05]
completed: 2026-09-30
---

# Phase 27 Plan 05: Consent state read Summary

`readConsentChoice` binds the subject GUC and calls `public.consent_choice(CONSENT_POLICY_VERSION, asOf|null)`; `GET /api/consent/state` answers "has this visitor chosen under the current version" without caching, without a cookie write and without the UUID in the body.

## Commits
- a8c751fa feat(27-05): readConsentChoice helper with as-of time
- 3606b296 feat(27-05): GET /api/consent/state, no-store per-visitor answer

## Results
- `vitest run lib/consent/read.test.ts`: 4/4 pass. Greps: raw consent_log reads 0, `consent_choice(` 1.
- `vitest run tests/unit/consent/state-route.test.ts`: 6/6 pass (headers, no DB without a valid cookie, no UUID in body, 503 on error).
- Route greps: `force-dynamic` 1, `Set-Cookie|mintConsentSubject` 0.
- `cookie.test.ts` passes.
- recorded_at handling follows 27-01: runtime `Date`, normalised with `new Date(x).toISOString()` (string also accepted).

## Deviations / open items
- `lib/consent/record.test.ts` has 1 failing test ("always records necessary true and functional/analytics/marketing false (D-03, D-05)"). It asserts on `bind.ts` source, which another executor is changing (uncommitted edits to `record.test.ts` in the worktree). Not caused by this plan; I did not touch either file. The GET 405 pin in that file passes.
- `pnpm check:db-fences` exits 1, but not from this plan: the failing fence is D-10 "raw `postgres` import outside the allow-list" at `packages/db/test/local/consent-reader.test.ts:9` (27-01's Worker-client test). The identity-wrapper fence (D-06), which covers the new route, passes. Needs 27-01's file added to `allowed_postgres_importers` (control/owner of that plan).
- TDD RED step for task 1 and 2 was not run separately (tests and implementation written together, then run green).

## Not verified
- DB-backed behaviour of the route on a real stack (27-01's Worker-client test covers the reader).

## Known Stubs
None.
