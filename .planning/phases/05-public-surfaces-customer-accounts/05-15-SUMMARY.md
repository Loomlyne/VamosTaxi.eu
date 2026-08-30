---
phase: 05-public-surfaces-customer-accounts
plan: 15
subsystem: ui
tags: [home, services, ServiceCard, playwright, law-01, next-intl]

requires:
  - phase: 05-public-surfaces-customer-accounts
    provides: HomeHero gallery pattern, Icon, SectionHeader, next-intl dictionaries
provides:
  - ServiceCard with full declared prop surface and seven states
  - Services section honouring showChauffeurByHour, mediaTone, scrollPerStep
  - Dev gallery and 112 visual baselines
affects: [05-21 home composition]

tech-stack:
  added: []
  patterns:
    - Law 01 shine as pointer-tracked fill/border, never WebGL glow
    - Named translators per namespace (tServices / tCommon / tHome)

key-files:
  created:
    - apps/web/components/home/ServiceCard.tsx
    - apps/web/components/home/ServiceCard.css
    - apps/web/components/home/Services.tsx
    - apps/web/components/home/Services.css
    - apps/web/app/[locale]/dev/home/services/page.tsx
    - apps/web/tests/visual/home-services.spec.ts
  modified: []

key-decisions:
  - "Mock shine is WebGL2 specular edge (20px bleed, coloured glow). Substituted with rAF-throttled --card-px/--card-py radial fill + border step (Law 01)."
  - "showChauffeurByHour defaults false from 04-UI-SPEC.md §G line 185 (hourly tab absent / hourlyEnabled=false / ADR-014 §6)."
  - "scrollPerStep accepted and ignored; SITE-06 requires auto-fit/minmax grid, not the mock scroll stage."
  - "Plan tone/mediaTone light|inverse maps mock grey|charcoal."
  - "CTA kicker/title use existing keys services.all-services and home.your-routes-fixed-price-appears-here-the-moment (mock strings not in the dictionary; no invented keys)."

patterns-established:
  - "Proximity disabled entirely under prefers-reduced-motion, not shortened."
  - "state=disabled renders a non-link with aria-disabled."

requirements-completed: [SITE-01, SITE-06]

duration: 25min
completed: 2026-08-30
---

# Phase 05 Plan 15: Services section Summary

**ServiceCard ports with seven states and a Law 01 fill/border proximity effect; Services is an auto-fit grid with hourly defaulted off from 04-UI-SPEC §G line 185; 112 four-language baselines.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-30T13:55:18Z
- **Completed:** 2026-08-30T14:20:34Z
- **Tasks:** 3
- **Files modified:** 6 source + 112 snapshots

## Accomplishments

- `ServiceCard` carries href, titleId, icon, tone, accent, shineColor, shineIntensity, proximity, children, plus default/hover/press/focus/selected/disabled/loading
- Mock WebGL glow substituted as pointer-tracked radial fill + border; no coloured drop-shadow, no blur
- `Services` honours all three declared props, links to `/?service=…#book`, shows no price
- Gallery + Playwright Law 01/02 computed-style assertions; 141 passed / 3 skipped (390-only scroll test)

## Task Commits

1. **Task 1: The service card** - `e0a166c` (feat)
2. **Task 2: The services section** - `2e51d09` (feat)
3. **Task 3: Gallery and baselines** - `081a0fa` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/components/home/ServiceCard.tsx` — client card, seven states, proximity handler
- `apps/web/components/home/ServiceCard.css` — logical properties, `--vt-ring`, `translateY(1px)`, reduced-motion kill
- `apps/web/components/home/Services.tsx` — section + CTA, named translators
- `apps/web/components/home/Services.css` — `repeat(auto-fit, minmax(min(100%, 16rem), 1fr))`
- `apps/web/app/[locale]/dev/home/services/page.tsx` — states gallery
- `apps/web/tests/visual/home-services.spec.ts` — ports 4240–4243, `@component` titles

## Decisions Made

- **Shine substitution (Law 01):** mock `ServiceCard.dc.html` implements shine via WebGL2 SDF rim light that bleeds 20px past the media box. Port writes only `--card-px` / `--card-py` (clamped 0–100%) into a radial `background-image` plus a border colour step. `--vt-shadow-accent` remains `none`.
- **Hourly default:** `showChauffeurByHour = false` from `.planning/phases/04-quote-pricing-engine/04-UI-SPEC.md` §G line 185 (`hourly` absent, `hourlyEnabled=false`, ADR-014 §6 "Hourly — Out of V1").
- **scrollPerStep:** mock is scroll-driven; SITE-06 requires auto-fit grid. Prop kept, ignored.
- **05-21 composes** `Services` (and `ServiceCard` only through it). `app/[locale]/page.tsx` untouched.

## Deviations from Plan

None - plan executed exactly as written, with these recorded substitutions the plan itself required:

- Shine technique substituted (Law 01 wins over mock) — planned
- `scrollPerStep` ignored in favour of auto-fit — planned when the shipped layout is the grid
- CTA copy mapped onto existing `services`/`home`/`common` keys rather than adding dictionary rows (files_modified forbids i18n JSON)

**Total deviations:** 0 auto-fixed
**Impact on plan:** Substitutions were the plan's own Law 01 / SITE-06 / i18n constraints.

## Issues Encountered

- Worktree had no `node_modules`; `pnpm install --frozen-lockfile` in the worktree (no symlink).
- `pnpm test:visual` (full `tests/` tree, 1412 cases) was started twice and SIGTERM'd before finish. `home-services.spec.ts` itself: 141 passed, 3 skipped, 112 snapshots. Earlier baselines were not re-diffed in this sitting.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 05-21 to compose `Services` on the home page.
- `showChauffeurByHour` default is false; flipping the prop restores the hourly card without an edit.

## Self-Check: PASSED

- Source files exist; three production commits + this SUMMARY
- `pnpm typecheck`, `pnpm lint`, `pnpm lint:css`, `pnpm i18n:check` exit 0
- `playwright test tests/visual/home-services.spec.ts --workers=1 --update-snapshots` exit 0 (141 passed)

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-30*
