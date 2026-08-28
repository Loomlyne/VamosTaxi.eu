---
phase: 04-quote-pricing-engine
plan: 14
subsystem: quote-intent
status: tasks-1-2-complete
pending: task-3-owner-checkpoint
---

# 04-14 Tasks 1–2

Intent ladder + Law 04 gate. Task 3 (Mapbox / AeroDataBox / CF zone plan) is the owner checkpoint — not invented.

## D-49 probe (observed)

```
probe-now-frozen: t0=2026-08-28 15:10:19.25022+00
probe-now-frozen: t1=2026-08-28 15:10:19.25022+00
probe-now-frozen: FROZEN=yes
```

Exit 0. `now()` is frozen at transaction start across sequential `sql.begin` awaits. Step 3 may compare `lock.exp` against `now()` inside the write transaction. Fallback (single-select deadline) is not taken.

## Commits

| Task | Subject |
|------|---------|
| 1 | feat(04-14): checkout-intent ladder and D-49 clock probe |
| 2 | feat(04-14): Law 04 numbers gate, runbooks, OWNER-ANSWERS |

## Verify

| Command | Exit |
|---------|------|
| `pnpm db:probe:now` / `node packages/db/scripts/probe-now-frozen.mjs` | 0 |
| `vitest run lib/quote/intent.test.ts` | 0 (17 passed) |
| `vitest -t decorative` | 0 |
| `pnpm check:numbers` | 0 |
| temp `MIN_ADVANCE = 180` in policy.ts | 1 then reverted |
| temp `CHF 1250` in intent.ts | 1 then reverted |

## Self-Check: PARTIAL

Tasks 1–2 done. Task 3 waits on Koss.
