---
phase: 05-public-surfaces-customer-accounts
plan: 18
subsystem: ui
tags: [home, reviews, faq, publicSql, playwright, content_strings]

requires:
  - phase: 05-public-surfaces-customer-accounts
    provides: FaqCard, FaqGrid, FaqItem, home gallery pattern
  - phase: 03-hyperdrive-data-access-wiring
    provides: publicSql cacheable binding
provides:
  - getPublishedReviews / getContentStrings / pickLocaleColumn on publicSql
  - Reviews carousel and HomeFaq section (05-21 composes)
  - 64 four-language four-viewport baselines
affects: [05-21-home-composition]

tech-stack:
  added: []
  patterns:
    - First Phase 5 publicSql consumer; library exempt from force-dynamic, page stays force-dynamic
    - HomeFaq reuses FaqGrid; FaqItem gained optional question/answers so DB copy is not a card fork

key-files:
  created:
    - apps/web/lib/db/content.ts
    - apps/web/components/home/Reviews.tsx
    - apps/web/components/home/Reviews.css
    - apps/web/components/home/HomeFaq.tsx
    - apps/web/components/home/HomeFaq.css
    - apps/web/app/[locale]/dev/home/reviews/page.tsx
    - apps/web/tests/visual/home-reviews.spec.ts
    - apps/web/tests/integration/home-content.spec.ts
  modified:
    - scripts/db-access-fence-allowlist.json
    - apps/web/components/marketing/FaqCard.tsx
    - apps/web/i18n/messages/en.json
    - apps/web/i18n/messages/de.json
    - apps/web/i18n/messages/fr.json
    - apps/web/i18n/messages/ar.json

key-decisions:
  - "D-26: ban #5 fires on lib/db/content.ts (library importing publicSql). Fence cannot see 05-21. One named force_dynamic_exempt entry for this plan."
  - "FaqCard accepts optional resolved question/answers; JSON tFaq remains the /faq path"
  - "Gallery tiles use data-tile so inner data-state on Reviews/HomeFaq does not collide"

patterns-established:
  - "publicSql reads are parameterised, ordered, cacheable; no identity wrapper, no write, no module-scope cache"
  - "pickLocaleColumn: en fallback; pending_value and non_translatable always return en"

requirements-completed: [SITE-01, SITE-06]

duration: 85min
completed: 2026-08-30
---

# Phase 05 Plan 18: Home Reviews + HomeFaq from DB Summary

**Home Reviews and FAQ now have `publicSql` readers, a carousel and a FaqGrid section fed from `content_strings`, 64 baselines, and a SITE-01 integration spec that fails loud if local Postgres is down.**

## Performance

- **Duration:** 85 min
- **Started:** 2026-08-30T14:10:00Z
- **Completed:** 2026-08-30T15:32:00Z
- **Tasks:** 3
- **Files modified:** production + 64 snapshots

## Accomplishments

- First Phase 5 `publicSql` consumer: `getPublishedReviews` / `getContentStrings` / `pickLocaleColumn`
- Reviews carousel: declared props, reduced-motion disables autoplay, IO/hover/focus pause, keyboard, loading/empty/error
- HomeFaq reuses `FaqGrid` (`mode="single"`, `--faq-card-min-block-size: 190px`); no card fork

## Surface for 05-21

```
getPublishedReviews(env: CloudflareEnv, limit: number): Promise<ReviewRow[]>
getContentStrings(env: CloudflareEnv, keys: readonly string[]): Promise<ContentStringRow[]>
pickLocaleColumn(row: ContentStringRow, locale: ContentLocale): string
```

`en` is the fallback when a translation column is null. `pendingValue` and `nonTranslatable` rows always return `en`.

Home FAQ key list (bound `any($1)`, not LIKE):

- `faq.frequently-asked-questions`
- `faq.is-the-price-i-see-the-final-price` / `faq.yes-your-fare-is-calculated-from-the-route-and-t`
- `faq.do-i-need-an-account-to-book` / `faq.no-guest-checkout-takes-an-email-address-and-a-m`
- `faq.what-payment-methods-do-you-accept` / `faq.card-payment-processed-by-stripe-every-method-av`
- `faq.how-far-in-advance-do-i-need-to-book` / `faq.placeholder-the-minimum-notice-before-a-pickup-h`
- `faq.can-i-cancel-or-change-my-booking` / `faq.placeholder-the-cancellation-and-change-policy-i`
- `common.brandName` (non_translatable proof)

## D-26 fence

`pnpm check:db-fences` failed on `apps/web/lib/db/content.ts` (ban #5) then passed after one named `force_dynamic_exempt` entry commenting this plan. Consuming page `force-dynamic` remains 05-21 / the existing `/dev` layout.

## Task Commits

1. **Task 1: The two publicSql reads** - `0bf97cd` (feat)
2. **Task 2: The reviews carousel and the home FAQ section** - `eb15e42` (feat)
3. **Task 3: Baselines and the SITE-01 database-read proof** - `069d65a` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/lib/db/content.ts` — read-only publicSql queries
- `scripts/db-access-fence-allowlist.json` — `force_dynamic_exempt`: `apps/web/lib/db/content.ts`
- `apps/web/components/home/Reviews.tsx` + `Reviews.css` — carousel
- `apps/web/components/home/HomeFaq.tsx` + `HomeFaq.css` — section over FaqGrid
- `apps/web/components/marketing/FaqCard.tsx` — optional resolved strings
- `apps/web/app/[locale]/dev/home/reviews/page.tsx` — fixture gallery + `?live=1` proof
- `apps/web/tests/visual/home-reviews.spec.ts` + 64 snapshots
- `apps/web/tests/integration/home-content.spec.ts` — SITE-01; no `skip(`

## Verification

- `pnpm check:db-fences` — pass (8/8) after allowlist
- `tsc --noEmit` (apps/web) — pass
- `eslint` on new TS — pass
- `lint:css` on Reviews.css / HomeFaq.css — pass
- `pnpm i18n:check` — pass
- Playwright `tests/visual/home-reviews.spec.ts` — 77 passed, 3 skipped (390-only on other viewports), 64 snapshots
- Integration not executed: port 54322 closed. Spec throws `Local stack is not running. Run \`pnpm db:start && pnpm db:reset\`.` — no skip
- `pnpm test:visual` (full prior suite) not re-run this sitting

## Deviations

- FaqCard gained optional `question` / `answers` (plan: 05-11 component gains a prop rather than HomeFaq forking)
- `HomeFaq.css` not listed in `files_modified`
- `pickLocaleColumn` inlined in HomeFaq so the section does not import `lib/db/content`
- Gallery `?live=1` is the page that calls `getPublishedReviews` (fixtures stay DB-free)
- RTL next control uses `readingDir()` so Arabic `data-dir="-1"`

## Self-Check: PASSED

- Key files exist on disk
- Three production/test commits on `gsd/05-18-reviews-faq`
- Acceptance greps for tasks 1–3 hold (`skip(` = 0 on integration)
- Visual baselines ≥ 16 (64)
- STATE.md / ROADMAP.md not touched
- `next-env.d.ts` / `tsconfig.json` restored after Next dirtied them
