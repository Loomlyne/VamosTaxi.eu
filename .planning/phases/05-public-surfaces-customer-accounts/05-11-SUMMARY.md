---
phase: 05-public-surfaces-customer-accounts
plan: 11
subsystem: ui
tags: [faq, FaqCard, FaqGrid, playwright, next-intl]

requires:
  - phase: 05-05
    provides: PageHero.css, ProseSection
provides:
  - FaqCard
  - FaqGrid
  - /faq
affects: [05-18]

tech-stack:
  added: []
  patterns: ["one disclosure card, two surfaces; keys not sentences"]

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
  - "JSON-LD FAQPage ships, built from the same FAQ_ITEMS constant via JSON.stringify"
  - "Page mock min-block-size 170px vs home 190px is --faq-card-min-block-size, not a fork"
  - "PageHero stays about-namespaced; /faq reuses PageHero.css rather than wrong-namespace strings"

patterns-established:
  - "FaqGrid mode multi|single; empty items[] yields empty without a prop"

requirements-completed: [SITE-04, SITE-06, SITE-07, SITE-02]

duration: 50min
completed: 2026-08-30
---

# Phase 05: 05-11 FAQ

**One `FaqCard`/`FaqGrid` pair, `/faq` in four languages, 32 baselines.**

## Performance

- **Duration:** resume this sitting (Task 1 already on disk)
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Shared disclosure: `aria-expanded` / `aria-controls`, `--vt-ring` focus, Law 02 open-circle hover (charcoal border, not `--vt-yellow-600`)
- `/faq`: 7 questions in mock order, three section anchors (`booking` / `pricing` / `service`), contact + manage-booking CTAs
- Per-locale `FAQPage` JSON-LD from the same `FAQ_ITEMS` list (`JSON.stringify`, no concatenation)
- Gallery: closed / open / loading / empty / multi / single; focus and press proven in the spec
- Playwright: 52 passed, 4 skipped (390-only). 32 snapshots.

## Task Commits

1. **Task 1: FaqCard and FaqGrid** - `ace50fb` (feat)
2. **Task 2: FAQ page** - `8a387a9` / `3e8bd80` (feat)
3. **Task 3: gallery + baselines** - `3188f69` (test)

## Mock card CSS diff (page vs home)

| Rule | `app/pages/faq.dc.html` | `app/home/FAQ.dc.html` | Component |
|------|-------------------------|------------------------|-----------|
| min-height | 170px | 190px | `--faq-card-min-block-size` (default 170px) |
| open hover circle | `--vt-yellow-600` | `var(--vt-yellow-600, #e0aa08)` | neither; Law 02 — full `--vt-yellow`, charcoal border step |
| column steps | 760px / 1160px | same | page mock |

No raw hex. No second card.

## Surface for 05-18

```ts
type FaqItem = { id: string; questionKey: string; answerKeys: string[] }
FaqCard({ item, open, onToggle, state?: "default" | "loading" })
FaqGrid({ items, mode?: "single" | "multi", emptyLabelKey?: string, state?: "default" | "loading" | "empty" })
```

Import from `@/components/marketing`. Keys resolve through `useTranslations("faq")`. Home section should pass `mode="single"` if it wants exclusive open; page uses default `"multi"`.

## JSON-LD

Shipped. `FAQPage` / `Question` / `Answer` from `FAQ_ITEMS` in `faq/page.tsx`, translated with `tFaq`, serialised with `JSON.stringify` as a `<script type="application/ld+json">` child. Same list as the grids.

## Deviations from Plan

`PageHero` only looks up `about.*`. FAQ copy lives in `faq` / `common`. The page reuses `PageHero.css` (checker, kicker, standfirst) instead of showing about strings. Recorded for 05-18: do not pass faq keys into `PageHero` until it takes a namespace.

`FaqItem` is keys-only. Mock answers that wrap a TBC token are adjacent `answerKeys` paragraphs, not a `PendingSlot` inside the sentence. In-card defer links (cancellation/terms) are not on the card type — 05-18 should not re-port layout to add them.

Playwright ports **4210–4213**, 1440 on **4213** (4210 as 1440 failed to bind, same class of issue as 05-09/4194). `process.kill(-pid)` on the detached `next` group SIGKILLed the Playwright worker at the 1024 project boundary; teardown kills the next pid only.

Full `pnpm test:visual` not re-run (same as 05-04 / 05-09). This spec: 52 passed / 4 skipped.

## User Setup Required

None

## Next Phase Readiness

05-18 imports `FaqCard` / `FaqGrid` / `FaqItem`. Do not re-port the card.
