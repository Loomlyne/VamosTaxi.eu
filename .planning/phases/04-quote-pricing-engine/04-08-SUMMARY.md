---
phase: 04-quote-pricing-engine
plan: 08
subsystem: api
tags: [zod, quote, i18n, schema, errors, boundary]

requires:
  - phase: 04-02
    provides: VehicleClassSlug and QuoteMode unions in pricing/types.ts
  - phase: 04-07
    provides: quote lock/hmac primitives the reprice body pins against
provides:
  - Zod quote/reprice request boundary (parseQuoteRequest, schemas)
  - QUOTE_ERRORS vocabulary table + quoteErrorResponse builder
  - Full quote.* and oversized_luggage i18n in en/de/fr/ar
affects: [04-09, 04-10, 04-11, 04-14]

tech-stack:
  added: [zod@4.4.3]
  patterns:
    - strict zod objects + named forbidden-field set for client price inputs
    - mode preprocess before union (one-way→one_way; hourly→mode_not_offered)
    - Record-as-SoT error table (CURRENCY_MARKS style); body is keys only, no prose
    - dotted sibling keys under quote for quote.error + quote.error.* leaf paths

key-files:
  created:
    - apps/web/lib/quote/schema.ts
    - apps/web/lib/quote/schema.test.ts
    - apps/web/lib/quote/errors.ts
    - apps/web/lib/quote/errors.test.ts
  modified:
    - apps/web/package.json
    - pnpm-lock.yaml
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json

key-decisions:
  - "zod@4.4.3 exact pin; cites 05-RESEARCH Package Legitimacy Audit [OK]/Approved — no new checkpoint"
  - "parseQuoteRequest returns discriminated result only; HTTP/status mapping is 04-11 via errors.ts"
  - "CH+neighbours coordinate box is pre-Mapbox sanity gate, not service area (distinct i18n keys)"
  - "quote.error generic + quote.error.* specifics use dotted sibling keys under quote so both flatten as leaves (next-intl nested walk cannot hold string+object at the same node)"
  - "quote.error.service_area_undefined is en-only pendingValueKeys pill (ADR-011)"

patterns-established:
  - "Boundary: .strict() + FORBIDDEN_CLIENT_PRICE_FIELDS it.each — strip is forbidden"
  - "Vocabulary: QUOTE_ERRORS Record derives QuoteErrorCode; quoteErrorResponse allow-lists body keys"
  - "Law 03: four locales same pass; ICU n param; Arabic six plural categories"

requirements-completed: [QUOTE-02, QUOTE-06, QUOTE-07, QUOTE-08, QUOTE-09, QUOTE-11]

duration: ~25min
completed: 2026-08-28
---

# Phase 4 Plan 08: Quote schema, errors, i18n Summary

**Zod boundary rejects client prices/distances structurally; 26-code error table returns i18n keys only; every quote string ships en/de/fr/ar with ADR-011 English-only service-area pill.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-28T12:15:00Z
- **Completed:** 2026-08-28T12:32:53Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Installed `zod@4.4.3` (exact, no caret); legitimacy cited from 05-RESEARCH audit row.
- `parseQuoteRequest` / `RepriceRequestSchema`: forbidden price fields, unknown-key strict fail, D-04 mode preprocess, pax≥1, extras max codes, count-only waypoints legal (D-56), CH+neighbours box → `place_out_of_box`.
- `QUOTE_ERRORS` (26 rows) + `quoteErrorResponse`; `quote_not_found`/`quote_expired` share `quote.error.expired` (D-28); body allow-list blocks prose.
- Full `quote.*` trees + `price.surcharge.oversized_luggage`; `pnpm i18n:check` green.

## Task Commits

1. **Task 1: zod + boundary schema** - `1a36923` (feat)
2. **Task 2: error vocabulary** - `22cb62a` (feat)
3. **Task 3: four-locale strings** - `b19eb21` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/quote/schema.ts` — request boundary + parse helpers
- `apps/web/lib/quote/schema.test.ts` — 49 tests incl. it.each forbidden fields + fast-check
- `apps/web/lib/quote/errors.ts` — QUOTE_ERRORS + quoteErrorResponse
- `apps/web/lib/quote/errors.test.ts` — table shape, D-28, en.json key existence
- `apps/web/i18n/messages/{en,de,fr,ar}.json` — quote namespace + oversized_luggage
- `apps/web/package.json` / `pnpm-lock.yaml` — zod pin

## Decisions

- Zod already approved in 05-RESEARCH; no human legitimacy checkpoint.
- Generic `quote.error` vs nested `quote.error.*`: dotted sibling property names under `quote` so coverage flatten yields both leaf paths; widget (04-14) should resolve via flat key lookup or re-nest before next-intl path walk.
- Coupon casing preserved in schema (no `toUpperCase`); upper() stays server-side in evaluate_coupon.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0. **Impact:** none.

## Verification

```
pnpm install --frozen-lockfile          # exit 0
pnpm typecheck                          # exit 0
pnpm --filter web exec vitest run lib/quote  # 70 passed (schema 49 + errors 12 + lock suite)
pnpm i18n:check                         # exit 0 (1576 keys)
```

Success criteria:

- Thirteen/twelve named client price fields fail with `untrusted_input` (FORBIDDEN set + it.each).
- `mode: "hourly"` → `mode_not_offered`.
- `extra_stops: 2` without waypoints parses; mismatched waypoints fail.
- Every `QUOTE_ERRORS` i18n_key resolves in en.json (test reads file).
- `quote.error.service_area_undefined` in en only + pendingValueKeys.

## Self-Check: PASSED

- [x] key-files.created exist on disk
- [x] git log greps 04-08 → 3 feat commits
- [x] Task acceptance criteria re-run green
- [x] Plan-level verification commands green

## Next

Ready for plans that consume the boundary (04-09+ engine wiring / 04-11 handlers). Worktree mode: STATE/ROADMAP left to orchestrator.
