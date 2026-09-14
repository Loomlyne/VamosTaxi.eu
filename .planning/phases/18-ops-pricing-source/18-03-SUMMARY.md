---
phase: 18-ops-pricing-source
plan: 03
subsystem: ops-pricing
tags: [publish, discard, draft, ops-dc, quote-lock, vitest]
requires:
  - phase: 18-ops-pricing-source
    provides: live-book public catalogs (18-02)
provides:
  - Publish leaves the live book on /pricing (no post-Publish draft clone)
  - Discard deletes the draft and returns live; no fork
  - Four tabs only; Save VAT; Draft/Live mark; Fix this; 24h lock
affects: [18-04 money recipe, 18-07 owner Publish UAT]
tech-stack:
  added: []
  patterns: [Save forks live; Publish does not]
key-files:
  created: []
  modified:
    - apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts
    - apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/discard/route.ts
    - apps/web/lib/quote/lock.ts
    - app/ops/OpsPricing.dc.html
    - apps/web/public/app/ops/OpsPricing.dc.html
    - app/vamos-ops-data.js
    - app/vamos-i18n-dict.js
    - apps/web/lib/ops/publish-public-chf.test.ts
    - apps/web/lib/ops/ops-pricing-tabs.test.ts
    - apps/web/lib/ops/ops-pricing-source.test.ts
    - apps/web/lib/ops/draft-preview-unpaid.test.ts
key-decisions:
  - "QUOTE_LOCK_MINUTES = 1440 is hardcoded at Publish (D-13)."
  - "Typing VAT does not write; Save VAT persists the draft."
requirements-completed: [D-01, D-02, D-03, D-04, D-05, D-06, D-07, D-08, D-09, D-10, D-11, D-12, D-13, D-14]
duration: 35min
completed: 2026-09-14
---

# Phase 18: OPS Pricing source of truth — 18-03 Summary

**After Publish, `/pricing` can show the live book. History and Preview are gone. Quote lock is 24 hours, not a field.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-14T14:51:00Z
- **Completed:** 2026-09-14T15:05:00Z
- **Tasks:** 3/3
- **Files modified:** 12

## Accomplishments

- Publish `asStaff` tx no longer clones a draft after `public_chf = true`. 409 incomplete keeps the draft. First Save still forks via `resolveWritableVersionId`.
- Discard deletes draft rows and returns the live version id. No clone after delete.
- OpsPricing: four tabs (Fixed routes · Distance rules · Surcharges & extras · Coupons). VAT rail + **Save VAT**. **Draft — not public until Publish** / **Live book**. Discard confirm. Publish confirm with **Fix this**. Region table, History pane, Preview, and test unpaid removed from this page.
- Quote lock hardcoded 1440 minutes (`QUOTE_LOCK_MINUTES`) at Publish.

## Task Commits

None — production work is uncommitted (standing no-commit-unless-asked). Ask to commit if you want GSD atomic close-out.

1. **Task 1: Stop post-Publish clone** — publish/discard routes
2. **Task 2: Four tabs + Draft/Live + Save VAT + 24h lock** — OpsPricing DC
3. **Task 3: Dual-DC + invert Preview/History tests** — sync + test rewrite

## Files Created/Modified

- `publish/route.ts` — no post-success fork; lock 1440
- `discard/route.ts` — delete draft, return live id
- `lock.ts` — `QUOTE_LOCK_MINUTES = 1440`
- `app/ops/OpsPricing.dc.html` — D-01…D-14 chrome
- Dual-DC public copy synced (ops.dc.html keeps injected `<base href="/app/ops/">`)

## Decisions & Deviations

- Fix this switches the pane for the gap kind. Opening the OpsTable overlay for that row is not wired yet (overlay API); pane jump is in this plan.
- Staff preview/test-unpaid routes remain on disk; OpsPricing does not call them.
- Did not click Publish. Did not `db push`. Did not commit.

## Verification

- `pnpm --filter web exec vitest run lib/ops/ops-pricing-tabs.test.ts lib/ops/ops-pricing-vat-field.test.ts lib/ops/ops-pricing-source.test.ts lib/ops/publish-public-chf.test.ts lib/ops/draft-preview-unpaid.test.ts` — 38 passed

## Next Phase Readiness

18-04 can ship D-15 money (start + all km × per-km + bands) and block Publish on band overlap.

## Self-Check: PASSED
