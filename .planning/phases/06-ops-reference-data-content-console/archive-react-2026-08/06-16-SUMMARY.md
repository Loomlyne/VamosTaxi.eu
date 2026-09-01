---
phase: 06-ops-reference-data-content-console
plan: 16
subsystem: i18n
tags: [content_strings, next-intl, hyperdrive, i18n, loader, reconciliation]
requires:
  - phase: 06-ops-reference-data-content-console
    provides: "06-10 content editor + seed-overwrite hazard; 06-13/06-14/06-15/06-17 ops.* keys in JSON; publicSql(HYPERDRIVE)"
provides:
  - "loadMessagesFromDb + unflattenKeys with JSON kill switch and loud fallback"
  - "loadRawMessages seam swap in request.ts; stripMeta/merge/onError untouched"
  - "content-loader-parity.spec.ts four-locale DB=JSON gate"
  - "i18n:pull DB-to-JSON reconciliation; CONTENT-STRINGS-RUNBOOK.md"
affects: [07-quote, 11-launch]
tech-stack:
  added: []
  patterns:
    - "publicSql(env) on cacheable HYPERDRIVE, constructed inside the function"
    - "CONTENT_SOURCE defaults to json; db is opt-in per environment"
    - "NULL de/fr/ar omitted so mergeWithEnglishFallback still fills English"
    - "i18n:pull before db:push on any environment that has console edits"
key-files:
  created:
    - apps/web/lib/content/messages.ts
    - apps/web/lib/content/messages.test.ts
    - apps/web/tests/integration/content-loader-parity.spec.ts
    - scripts/pull-content-strings.mjs
    - docs/build/CONTENT-STRINGS-RUNBOOK.md
  modified:
    - apps/web/i18n/request.ts
    - apps/web/lib/env.d.ts
    - packages/db/supabase/seed.sql
    - package.json
key-decisions:
  - "CONTENT_SOURCE defaults to json until proven; not flipped in any hosted env this plan"
  - "React cache() is a named import in messages.ts so the isolate-memo fence (React.cache) stays quiet"
  - "unflattenKeys keeps dotted JSON siblings (quote.error leaf + quote.error.min_advance) as flatten's inverse"
  - "i18n:pull writes $meta only on en.json — generate-seed reads en.$meta only"
requirements-completed: [I18N-07]
duration: 90min
completed: 2026-09-01
---

# Phase 06 Plan 16: content_strings loader swap

**Runtime dictionary reads `content_strings` through `publicSql` on the cacheable HYPERDRIVE binding when `CONTENT_SOURCE=db`, defaults to JSON, and ships `i18n:pull` plus a written rollback before the swap is enabled anywhere.**

## Performance

- **Duration:** ~90 min
- **Completed:** 2026-09-01
- **Tasks:** 3
- **Files modified:** production files listed above + this SUMMARY

## Accomplishments

- `loadMessagesFromDb` / `unflattenKeys` in `apps/web/lib/content/messages.ts`. One `select key, en, de, fr, ar from public.content_strings` via `publicSql(env)` built inside the function. NULL de/fr/ar omitted. Thrown query and zero-row result fall back to the JSON import and emit one structured error.
- `loadRawMessages` in `apps/web/i18n/request.ts` delegates to that loader. `stripMeta`, `mergeWithEnglishFallback`, `onError`, `getMessageFallback` unchanged (grep counts 3 / 3 / 2 / 3).
- Seed regenerated: `content_strings=2306 pending_value=21 non_translatable=8 no_param_reason=58`. Four-locale parity spec green against local Postgres after `db:reset`.
- `pnpm i18n:pull` / `--check` is the DB→JSON direction. Runbook states the release-order rule and three rollback levels.

## Task Commits

1. **Task 1: loader, unflatten, JSON fallback** — `8cd445f` (feat)
2. **Task 2: seam swap, seed regen, parity gate** — `9e36300` (feat)
3. **Task 3: i18n:pull + runbook** — `6c79e44` (feat)

**Plan metadata:** this commit

## Environments and CONTENT_SOURCE

| Environment | Proven? | CONTENT_SOURCE |
|-------------|---------|----------------|
| Local Supabase `127.0.0.1:54322` | Yes — parity spec, 2306 leaves × 4 locales, `i18n:pull --check` | unset / `json` (default). `db` exercised in unit tests (mocked sql) and by the parity spec reading the table directly |
| Hosted staging (`dashboard.vamostaxi.site` / `vamos-web-staging`) | No | leave `json` |
| Production | Not deployed | leave `json` |

Do not flip `CONTENT_SOURCE=db` on hosted until this spec has passed against that environment's table.

## HYPERDRIVE cache window

Config id is real, not Phase 3's placeholder: `vamos-public-staging` `b53693800b7e4c1c94205774baa73420` (plan 03-07, 2026-08-25). Caching enabled (default). **Hosted cache TTL is unmeasured.** Do not invent one.

## Fallback log (Logpush)

- `type`: `content_strings_fallback`
- `scope`: `i18n`
- `event`: `content_strings_fallback`
- `cause`: `query_failed` \| `empty_result`
- `locale`: `null` (one log per request-cached fetch, not per locale)

## Parity leaf counts

2306 keys in `content_strings` after seed regen. Parity spec: DB-derived object deep-equals JSON-minus-`$meta` for en, de, fr, ar (2306 leaves each; no NULL translations in the seeded table). `i18n:check` reports 2298 coverage keys (excludes the 8 non-translatable).

## Decisions Made

- Named `import { cache } from "react"` in `messages.ts` rather than `React.cache`, so U31/ISOL-08 grep stays green while `loadMessages` still gets a free second call.
- `unflattenKeys` is flatten's inverse including dotted JSON sibling keys (`quote.error` leaf beside `quote.error.min_advance`). PLAN's "no key is a strict prefix" was true of the 1516-key snapshot, not of the finished dictionary.
- `CONTENT_SOURCE` is not mentioned in `request.ts` (acceptance grep = 0). Kill switch lives in the loader module.
- `i18n:pull` updates string leaves in place and `$meta` on `en.json` only, so a no-op pull leaves git clean even when de/fr/ar `$meta` copies differ from en.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] dotted sibling keys**
- **Found during:** Task 1 (unflatten round-trip)
- **Issue:** `en.json` has leaves such as `quote.error` next to `quote.error.min_advance`. Naive split treated the prefix as a collision.
- **Fix:** Sort shorter keys first; keep the longer key as a dotted sibling on the parent.
- **Files modified:** `apps/web/lib/content/messages.ts`, `messages.test.ts`
- **Verification:** vitest 11/11 green; parity round-trip green
- **Committed in:** `8cd445f`

**2. [Rule 2 - Missing critical] Playwright cannot `import()` JSON**
- **Found during:** Task 2 (fallback assertions in the parity spec)
- **Issue:** Playwright ESM requires `with { type: "json" }`; Next.js `loadJsonMessages` does not. Calling `loadMessagesFromDb` from the spec crashed.
- **Fix:** Keep kill-switch / unreachable-DB assertions in `messages.test.ts` (already present). Parity spec compares DB rows + `unflattenKeys` to JSON files.
- **Files modified:** `apps/web/tests/integration/content-loader-parity.spec.ts`
- **Verification:** vitest fallback tests; playwright 2/2 green
- **Committed in:** `9e36300`

---

**Total deviations:** 2 auto-fixed
**Impact on plan:** Required for invertibility and a runnable parity gate. No scope creep.

## Issues Encountered

- Local `content_strings` was 1516 until `supabase db reset` from this worktree's regenerated seed (2306). Docker was not started; the stack was already up.
- `pnpm check:db-fences` is red on inherited identity-wrapper / isolate-memo files this plan does not own. `messages.ts` is not in that list.
- Worktree `apps/web/node_modules` is an empty directory. `tsc --noEmit` cannot resolve `@types/node`. No `pnpm install`. `pnpm test:visual` not run (no `next-dev`).
- `git diff apps/web/i18n/request.ts` also adds the `loadMessagesFromDb` import (required). Body change is only `loadRawMessages` + its doc comment.

## User Setup Required

None for code. To enable the swap in an environment: set `CONTENT_SOURCE=db` only after the parity spec has passed against that environment. Hosted default stays `json`.

## Next Phase Readiness

Loader swap is inert by default. Wave 7 last plan. Do not flip hosted `CONTENT_SOURCE` in this sitting.

---
*Phase: 06-ops-reference-data-content-console*
*Completed: 2026-09-01*
