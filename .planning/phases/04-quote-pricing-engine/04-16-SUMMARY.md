---
phase: 04-quote-pricing-engine
plan: 16
subsystem: ui
tags: [quote, client-contract, refusal-bindings, playwright, i18n]

requires:
  - phase: 04-quote-pricing-engine
    provides: QuoteErrorCode union (04-08), QuoteResponseBody (04-11), Phase 1 ported components
provides:
  - Typed QuoteResponse/RepriceResponse re-exports, exhaustive REFUSAL_BINDINGS, DIR_KEEP_PARAMS, LOCK_DANGER_THRESHOLD_S
  - Frozen null-amount fixtures for every UI-SPEC §§A–H state
  - Dev-gated /dev/quote harness composing Phase 1 components with zero new components
affects: [05-public-surfaces-customer-accounts]

tech-stack:
  added: []
  patterns:
    - REFUSAL_BINDINGS as Record<QuoteErrorCode, Binding> so a missing row is a type error
    - Amounts via formatAmount(null) → CHF 000; no live-pricing UI branch

key-files:
  created:
    - apps/web/lib/quote/client-contract.ts
    - apps/web/lib/quote/client-contract.test.ts
    - apps/web/lib/quote/client-fixtures.ts
    - apps/web/app/[locale]/dev/quote/page.tsx
    - apps/web/app/[locale]/dev/quote/QuoteFlowGallery.tsx
    - apps/web/tests/visual/quote-flow.spec.ts
  modified:
    - apps/web/tests/integration/dev-exclusion.spec.ts
    - apps/web/app/api/quote/route.ts

key-decisions:
  - "Phase 5 renders the widget shell on the public home page and mounts Phase 4 client logic; Phase 4 ships contract + harness only"
  - "REFUSAL_BINDINGS is exhaustive over QuoteErrorCode; coupon seven-rule refusals live on CouponInfo.rule fixtures, not extra union members"
  - "LOCK_DANGER_THRESHOLD_S = 120 (04-UI-SPEC Assumption 1, arbitrary)"

patterns-established:
  - "One refusal → one i18n key from errors.ts → one component/slot/tone (D-13)"
  - "Dev harness under app/[locale]/dev/ inherits the production gate structurally"

requirements-completed: [QUOTE-02, QUOTE-03, QUOTE-04, QUOTE-10]

duration: 26min
completed: 2026-08-28
---

# Phase 4 Plan 16: Client contract + /dev/quote harness Summary

**Typed QuoteResponse contract with exhaustive REFUSAL_BINDINGS, null-amount fixtures, and a dev-gated /dev/quote gallery that renders every 04-UI-SPEC §§A–H state through Phase 1 components in en/de/fr/ar**

## Performance

- **Duration:** 26 min
- **Started:** 2026-08-28T14:19:47Z
- **Completed:** 2026-08-28T14:45:21Z
- **Tasks:** 3
- **Files modified:** 9 (plus 12 screenshot baselines)

## Accomplishments

- `REFUSAL_BINDINGS` covers all 26 `QuoteErrorCode` members; removing one entry fails `pnpm typecheck`
- Every fixture `total_rappen` / `amount_rappen` is `null`; harness has no live-pricing branch; amounts render `CHF 000` via `formatAmount`
- `/[locale]/dev/quote` is in the production build route table; `dev-exclusion.spec.ts` proves 404 on a genuine production deploy and 200 + `X-Robots-Tag: noindex` on staging
- Zero new or changed files under `apps/web/components/`

## Task Commits

Each task was committed atomically:

1. **Task 1: The client contract — §H as exhaustive, typed data** - `705dd4b` (feat)
2. **Task 2: The dev-gated quote harness — every state, no new component** - `44ca5e3` (feat)
3. **Task 3: Prove it in four languages, and prove the production gate still holds** - `c0d8a23` (test)
4. **Follow-up: Buffer.compare for screenshot inequality** - `97d5f2d` (fix)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/quote/client-contract.ts` — REFUSAL_BINDINGS, DIR_KEEP_PARAMS, LOCK_DANGER_THRESHOLD_S, QuoteResponse/RepriceResponse re-exports
- `apps/web/lib/quote/client-contract.test.ts` — 18 tests, 0 skipped
- `apps/web/lib/quote/client-fixtures.ts` — eligible / five ineligible reasons / none-fit / return / fixed-route / coupon applied / seven coupon refusals
- `apps/web/app/[locale]/dev/quote/page.tsx` — thin Server Component wrapper (`setRequestLocale`)
- `apps/web/app/[locale]/dev/quote/QuoteFlowGallery.tsx` — §§A–H gallery through ported components
- `apps/web/tests/visual/quote-flow.spec.ts` — four-locale, RTL, CHF 000, no-glow, §H matrix
- `apps/web/tests/visual/quote-flow.spec.ts-snapshots/` — empty/note/error PriceSummary baselines at 1440/1024/768/390
- `apps/web/tests/integration/dev-exclusion.spec.ts` — `/dev/quote` on production 404 and staging 200
- `apps/web/app/api/quote/route.ts` — dropped unused `preprocessWidgetTokens` re-export (TEST_DIST_DIR next build)

## Decisions Made

- Hand-off (D-16 first option): Phase 5 owns `app/[locale]/page.tsx` widget shell; this plan does not touch it
- `service_area_undefined` is the only `englishOnPurpose` / `data-tok` binding (ADR-011)
- `pricing_not_live` binds to `PriceSummary` slot `note`, never `error` (Assumption 7)
- Toast tones: `turnstile_required` → `neutral`; `rate_limited` / `temporarily_unavailable` → `danger` (Assumption 8)
- `none_fit` rendered as `Alert tone="info"` in the harness — Assumption 5 placeholder, not a Phase 5 layout decision
- Return-leg pickup/dropoff swapped from the two-leg fixture — Assumption 2, not a locked ADR-006 reading

## Four-language result (fact, not claim)

- `en` / `de` / `fr` / `ar` all mount; Arabic gallery `dir="rtl"`; `.vt-dir-keep` wraps countdown mm:ss, coupon `XXXX`, flight `XX 000`, and `CHF 000`
- German at 1024: no overflow on VehicleCard price slot or Input error rows (the two narrowest funnel slots)
- Flight status pills (`on-time` / `delayed` / `cancelled` / `departed`) are English-on-purpose gallery captions for Assumption 4, not 04-08 keys
- §H field labels are `QuoteErrorCode` names (review-scaffold English); the refusal sentences themselves come from existing `quote.*` keys
- No 04-08 copy gap found; `pnpm i18n:check` green; `git diff --stat -- apps/web/i18n/messages/` empty

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Unused quote-route re-export broke TEST_DIST_DIR next build**
- **Found during:** Task 3 (`dev-exclusion.spec.ts`)
- **Issue:** `export { preprocessWidgetTokens }` on `app/api/quote/route.ts` (04-11) is not a valid Next.js Route export; isolated `TEST_DIST_DIR` build failed typecheck. Nobody imported that re-export (tests use `lib/quote/preprocess.ts`)
- **Fix:** Removed the re-export. Handler still imports and calls `preprocessWidgetTokens` locally
- **Files modified:** `apps/web/app/api/quote/route.ts`
- **Verification:** `dev-exclusion.spec.ts` exits 0; `/dev/quote` 404 in production, 200 on staging
- **Committed in:** `c0d8a23` (Task 3)

**2. [Rule 1 - Bug] Playwright screenshot Buffer has no `.equals`**
- **Found during:** plan-level `pnpm typecheck`
- **Issue:** `emptyBuf.equals(noteBuf)` — `Property 'equals' does not exist on type 'Buffer<ArrayBufferLike>'`
- **Fix:** `Buffer.compare`
- **Files modified:** `apps/web/tests/visual/quote-flow.spec.ts`
- **Verification:** `pnpm typecheck` exits 0
- **Committed in:** `97d5f2d`

**3. [Process] TDD shipped as one feat commit, not RED then GREEN**
- **Found during:** Task 1
- **Issue:** Plan `tdd="true"`; tests and implementation landed together so vitest was green before the first commit
- **Fix:** none — 18 tests cover every `<behavior>` bullet
- **Committed in:** `705dd4b`

---

**Total deviations:** 3 auto-fixed (2 blocking/bug, 1 process)
**Impact on plan:** Route re-export removal is required for this plan's own exclusion spec; no component or i18n scope creep.

## Issues Encountered

- `next build` prints `Error: ENVIRONMENT_FALLBACK` while generating static pages (inherited next-intl `now`/`timeZone` on some SSG path). Build still exits 0 and lists `/[locale]/dev/quote`
- `dev-exclusion.spec.ts` still skips 6 viewport-project copies (pre-existing `component-1440`-only gate). `quote-flow.spec.ts` itself: 36 passed, 0 skipped across all four viewport projects

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 can compose `REFUSAL_BINDINGS` + `formatAmount` into `app/[locale]/page.tsx`; do not re-derive treatments
- Assumption 5 (`none_fit` / `moved_to` placement) remains a Phase 5 layout call
- `/dev/quote` can shrink to a states gallery once the public widget exists

## Verification

```
pnpm typecheck                                                     exit 0
pnpm --filter web exec vitest run lib/quote/client-contract.test.ts  exit 0 (18 passed, 0 skipped)
pnpm lint:css                                                      exit 0
pnpm i18n:check                                                    exit 0
pnpm build                                                         exit 0 (route table includes /[locale]/dev/quote)
pnpm --filter web exec playwright test tests/visual/quote-flow.spec.ts tests/integration/dev-exclusion.spec.ts
                                                                   exit 0 (38 passed, 6 skipped = pre-existing exclusion viewport skip)
git status --porcelain apps/web/components/                        empty
```

## Self-Check: PASSED

- key-files.created exist on disk
- `git log --oneline --grep="04-16"` returns production commits
- Task acceptance greps and plan `<verification>` commands re-run green

---
*Phase: 04-quote-pricing-engine*
*Completed: 2026-08-28*
