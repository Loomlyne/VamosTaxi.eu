---
phase: 05-public-surfaces-customer-accounts
plan: 30
subsystem: home-flight-field
status: executed
completed: 2026-09-04
---

# Plan 05-30: Strip home flight sample schedule — execution summary

## Delivered

- Deleted `const FLIGHTS` and fixture search/status/sim helpers from `app/home/home.dc.html`.
- `FLIGHT_API.search` returns `[]`. `FLIGHT_API.status` returns `null` on non-OK / 503. Lookup miss does not invent rows.
- Placeholders are empty. `sampleFeed` copy is gone. `noFeed` is honest in en/de/fr/ar. `simulateLiveUpdates` defaults false.

## Commits

- This summary lands with the 05-30 code commit.

## Verification

Passed:

- `pnpm --filter web exec vitest run tests/unit/home-flight-fixtures.test.ts` — 3 tests
- `grep LX318|LX39|sampleFeed|const FLIGHTS app/home/home.dc.html` — no matches

Not run: full lint / typecheck / build. No staging deploy. Did not POST `/api/quote`. Did not call live AeroDataBox.

## Self-check

- No `const FLIGHTS` in `app/home/home.dc.html`.
- 503 path does not call a local sample list.
