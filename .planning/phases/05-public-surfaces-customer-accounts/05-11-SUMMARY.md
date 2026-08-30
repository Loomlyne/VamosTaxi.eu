---
phase: 05-public-surfaces-customer-accounts
plan: 11
subsystem: ui
tags: [faq, disclosure, next-intl, playwright, marketing]

requires:
  - phase: 05-public-surfaces-customer-accounts
    provides: PageHero, Prose, buildAlternates("/faq"), faq message keys
provides:
  - Shared FaqCard / FaqGrid disclosure used by /faq and later by home (05-18)
  - SITE-04 /faq page with hreflang and FAQPage JSON-LD
  - Four-language four-viewport visual baselines
affects: [05-18-home-faq-section]

tech-stack:
  added: []
  patterns:
    - One FaqCard with real disclosure props; home must import, not re-port
    - Open-circle hover stays --vt-yellow; charcoal border is the Law 02 hover step

key-files:
  created:
    - apps/web/components/marketing/FaqCard.tsx
    - apps/web/components/marketing/FaqCard.css
    - apps/web/components/marketing/FaqGrid.tsx
    - apps/web/app/[locale]/faq/page.tsx
    - apps/web/app/[locale]/dev/faq/page.tsx
    - apps/web/app/[locale]/dev/faq/FaqGallery.tsx
    - apps/web/tests/visual/faq.spec.ts
  modified:
    - apps/web/components/marketing/index.ts

key-decisions:
  - "JSON-LD FAQPage ships, serialised with JSON.stringify from the same FaqItem[] constant"
  - "Page mock card CSS is the union; home min-height 190px is --faq-card-min-block-size"
  - "PageHero is about-namespace-only; /faq composes the hero with faq/common keys"

patterns-established:
  - "FaqItem = { id, questionKey, answerKeys }; keys resolve through useTranslations(\"faq\")"
  - "FaqGrid mode defaults to multi; single exists for home without a card fork"

requirements-completed: [SITE-04, SITE-06, SITE-07, SITE-02]

duration: 49min
completed: 2026-08-30
---

# Phase 05 Plan 11: FAQ page and shared disclosure card Summary

**One FaqCard/FaqGrid pair ports the mock disclosure (real button, 0fr→1fr panel, 760/1160 columns) onto `/faq` with FAQPage JSON-LD and 32 four-language four-viewport baselines.**

## Performance

- **Duration:** 49 min
- **Started:** 2026-08-30T13:55:23Z
- **Completed:** 2026-08-30T14:44:29Z
- **Tasks:** 3
- **Files modified:** 8 (+ 32 snapshots)

## Accomplishments

- Shared accessible disclosure: `<button aria-expanded aria-controls>` + `role="region"` panel, reduced-motion, Law 02 yellow (no `-600`, no hex)
- `/faq` renders all 7 mock questions in three anchored groups through `FaqGrid`, hreflang via `buildAlternates("/faq")`, no `force-dynamic`
- Gallery + Playwright: column steps, no sideways scroll at 390, keyboard, focus ring (`--vt-ring`), RTL `inset-inline-end`, en≠de names

## Task Commits

1. **Task 1: The shared FAQ disclosure card and its grid** - `ace50fb` (feat)
2. **Task 2: The FAQ page** - `8a387a9` / `3e8bd80` (feat; second hash is a follow-up on the same page)
3. **Task 3: States gallery and baselines** - `3188f69` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/components/marketing/FaqCard.tsx` — controlled disclosure card
- `apps/web/components/marketing/FaqCard.css` — mock card/grid CSS, logical properties, Law 02 hover
- `apps/web/components/marketing/FaqGrid.tsx` — 1/2/3 columns, multi/single, loading/empty
- `apps/web/components/marketing/index.ts` — exports FaqCard, FaqItem, FaqGrid
- `apps/web/app/[locale]/faq/page.tsx` — SITE-04 page + JSON-LD
- `apps/web/app/[locale]/dev/faq/page.tsx` — server wrapper (`setRequestLocale`)
- `apps/web/app/[locale]/dev/faq/FaqGallery.tsx` — client states gallery
- `apps/web/tests/visual/faq.spec.ts` + 32 snapshots

## Surface for plan 05-18

```ts
type FaqItem = { id: string; questionKey: string; answerKeys: string[] }
FaqCard({ item, open, onToggle, state?: "default" | "loading" })
FaqGrid({ items, mode?: "single" | "multi", emptyLabelKey?: string, state?: "default" | "loading" | "empty" })
```

Home min-block-size: set `--faq-card-min-block-size: 190px` on the home section. Do not re-port the card.

## Mock card CSS diff (page vs home)

| Rule | `faq.dc.html` | `home/FAQ.dc.html` | Component |
|------|---------------|--------------------|-----------|
| min-height | 170px | 190px | `--faq-card-min-block-size` default 170px |
| open hover circle | `--vt-yellow-600` | `--vt-yellow-600,#e0aa08` | **not ported** (Law 02); charcoal border + `--vt-yellow` |
| column steps | 760 / 1160 | 700 / 1024 | page steps (SITE-06) |
| reduced motion | global `*` | local on card parts | `@media (prefers-reduced-motion: reduce)` on card |
| answer margin | 0 0 14px | 0 | page (14px block-end) |
| open bg restated | no | white/grey-300 | omitted (already white) |
| `--faq-ms` | no | yes | duration tokens |

## JSON-LD

Shipped. `FAQPage` is `JSON.stringify`'d from the same `FAQ_ITEMS` constant after `tFaq` resolution, per locale. No string concatenation.

## Decisions Made

- JSON-LD yes, from `FAQ_ITEMS`
- Hero uses PageHero.css + `faq`/`common` keys because PageHero is hard-wired to `about`
- Mock defer callouts (legal deep-links) omitted — no invented section-link copy; answers stay on existing `faq.*` keys
- Meet-and-greet band omitted — no `Meet & greet` key; would fail the no-hardcoded-English grep

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] PageHero cannot resolve faq keys**
- **Found during:** Task 2
- **Issue:** PageHero always `getTranslations("about")`; FAQ copy lives in `faq`/`common`. Editing PageHero is outside `files_modified`.
- **Fix:** Compose the charcoal hero with PageHero.css and named translators.
- **Files modified:** `apps/web/app/[locale]/faq/page.tsx`
- **Verification:** `pnpm i18n:check` exit 0
- **Committed in:** `8a387a9`

**2. [Rule 2 - Missing Critical] Gallery needed a client child**
- **Found during:** Task 3
- **Issue:** `setRequestLocale` requires a server page; FaqCard/FaqGrid are client. Plan listed only `dev/faq/page.tsx`.
- **Fix:** Thin server `page.tsx` + `FaqGallery.tsx` (same pattern as DataGallery).
- **Files modified:** `apps/web/app/[locale]/dev/faq/FaqGallery.tsx`
- **Verification:** gallery route renders loading/empty/open states
- **Committed in:** `3188f69`

---

**Total deviations:** 2 auto-fixed (2 missing critical)
**Impact on plan:** No card fork. 05-18 still imports FaqCard/FaqGrid.

## Issues Encountered

- Playwright `component-390` SIGKILL when four projects share a loaded machine (sibling worktrees also running Playwright). Per-project run with `--retries=1` passed, including 390.
- `pnpm test:visual` (full suite) was not re-run here — would collide with 05-10/05-15 Playwright on the same host. `faq.spec.ts` is 32 snapshots; earlier baselines untouched in this worktree.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 05-18 to import `FaqCard`/`FaqGrid` and set `--faq-card-min-block-size: 190px`
- Orchestrator: merge `gsd/05-11-faq`; do not let this executor touch STATE.md / ROADMAP.md

## Self-Check: PASSED

- key-files exist on disk
- commits `ace50fb`, `8a387a9`, `3188f69` present
- Task 1/2 acceptance greps passed; typecheck/lint/lint:css/i18n:check exit 0
- 32 snapshots in `faq.spec.ts-snapshots`

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-30*
