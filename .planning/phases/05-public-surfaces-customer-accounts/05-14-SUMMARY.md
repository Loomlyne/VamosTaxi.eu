---
phase: 05-public-surfaces-customer-accounts
plan: 14
subsystem: ui
tags: [home, how-it-works, why-vamos, playwright, i18n, motion]

requires:
  - phase: 05-public-surfaces-customer-accounts
    provides: HomeHero gallery pattern, home i18n namespace, Icon/CheckerMark
provides:
  - HowItWorks section with tone and revealOnScroll
  - WhyVamos section with showSupportText, scrollDriven, scrollPerStep
  - Dev galleries and four-language visual baselines
affects: [05-21 home composition]

tech-stack:
  added: []
  patterns: [IntersectionObserver reveal, rAF scroll scrub gated by IO, named next-intl translators]

key-files:
  created:
    - apps/web/components/home/HowItWorks.tsx
    - apps/web/components/home/HowItWorks.css
    - apps/web/components/home/WhyVamos.tsx
    - apps/web/components/home/WhyVamos.css
    - apps/web/app/[locale]/dev/home/how-it-works/page.tsx
    - apps/web/app/[locale]/dev/home/why-vamos/page.tsx
    - apps/web/tests/visual/home-how-it-works.spec.ts
    - apps/web/tests/visual/home-why-vamos.spec.ts
  modified: []

key-decisions:
  - "HowItWorks tone is light | inverse (plan interfaces); inverse maps the mock's charcoal dark ground."
  - "StepCounter is a passenger +/- control and is not used. StepIndicator is a horizontal done/current/todo tracker; the mock timeline uses Icon medallions on a spine, so HowItWorks composes Icon."
  - "HowItWorks does not read trip/quote state (D-16). Step copy is static home-namespace keys; times use now/today/tomorrow rather than live trip clock values."
  - "Law 02: mock [data-hiw-link]:hover used --vt-yellow-700; that unused link style was not ported (no yellow-50/100/200/300/600/700 in CSS)."
  - "WhyVamos fare figure is formatAmount(null) / CHF 000. No invented NN% stats. Photography layers are empty slots, not invented photos."
  - "WhyVamos screenshots capture [data-why-pin], not the scroll-spacer wrap, so driven states stay bounded."
  - "Plan 05-21 composes HowItWorks({ tone, revealOnScroll }) and WhyVamos({ showSupportText, scrollDriven, scrollPerStep })."

patterns-established:
  - "Home section galleries stay server files; motion sections are client components with useTranslations."
  - "Reveal/scrub uses IntersectionObserver (+ bounded rAF), disconnect/cancelAnimationFrame on unmount. No second Lenis, no scroll-behavior, no overscroll-behavior: none."

requirements-completed: [SITE-01, SITE-06]

duration: 90min
completed: 2026-08-30
---

# Phase 05 Plan 14: HowItWorks and WhyVamos Summary

**Standalone HowItWorks and WhyVamos home sections with real mock props, reduced-motion stacks, and 144 four-language visual baselines**

## Performance

- **Duration:** 90 min
- **Started:** 2026-08-30T13:25:00Z
- **Completed:** 2026-08-30T14:53:40Z
- **Tasks:** 3
- **Files modified:** 8 source + 144 snapshot PNGs

## Accomplishments

- Ported HowItWorks (`tone`, `revealOnScroll`) with IntersectionObserver reveal that paints fully under `prefers-reduced-motion` or `revealOnScroll={false}`
- Ported WhyVamos (`showSupportText`, `scrollDriven`, `scrollPerStep`) with IO-gated rAF scrub; stacked readable layout when motion is off
- Dev galleries under `/dev/home/how-it-works` and `/dev/home/why-vamos` (inherit `/dev` production 404 gate)
- Visual specs: 64 HowItWorks + 80 WhyVamos snapshots; reduced-motion, no sideways scroll at 390, German fit at 1024, RTL, scroll past-and-back

## Task Commits

1. **Task 1: The how-it-works section** - `423a75c` (feat)
2. **Task 2: The why-Vamos section** - `38ee7ce` (feat)
3. **Indexed access typecheck** - `a3bd0ae` (fix)
4. **Task 3: Four-language baselines** - `edbf4f4` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/components/home/HowItWorks.tsx` - Client section; Icon timeline; named `tHome`
- `apps/web/components/home/HowItWorks.css` - Logical properties; Law 01/02 header; reduced-motion block
- `apps/web/components/home/WhyVamos.tsx` - Client section; three real props; CHF 000 fare card
- `apps/web/components/home/WhyVamos.css` - Pin/stack, logical properties, reduced-motion
- `apps/web/app/[locale]/dev/home/how-it-works/page.tsx` - Server gallery
- `apps/web/app/[locale]/dev/home/why-vamos/page.tsx` - Server gallery
- `apps/web/tests/visual/home-how-it-works.spec.ts` - Ports 4220–4223
- `apps/web/tests/visual/home-why-vamos.spec.ts` - Ports 4230–4233

## Decisions Made

- 05-21 prop surfaces: `HowItWorks({ tone?: "light" | "inverse"; revealOnScroll?: boolean })`, `WhyVamos({ showSupportText?: boolean; scrollDriven?: boolean; scrollPerStep?: number })` (default 52).
- StepCounter not needed. StepIndicator not composed; Icon medallions match the mock.
- No TBC PendingSlot figures in these sections; fare is CHF 000.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] noUncheckedIndexedAccess on medallion/layer lookups**
- **Found during:** Task 1/2 typecheck after worktree `pnpm install`
- **Issue:** `meds[0]` / `layers[k]` possibly undefined
- **Fix:** Guard before use
- **Files modified:** HowItWorks.tsx, WhyVamos.tsx
- **Verification:** `pnpm --filter web run typecheck` exit 0
- **Committed in:** `a3bd0ae`

**2. [Rule 3 - Blocking] WhyVamos screenshot target**
- **Found during:** Task 3
- **Issue:** Screenshotting the driven wrap (pin + N × scrollPerStep vh) OOM/killed Next and workers
- **Fix:** `toHaveScreenshot` on `[data-why-pin]`; retry goto on 500
- **Files modified:** home-why-vamos.spec.ts
- **Verification:** why-vamos passed per viewport project (390/768/1024/1440)
- **Committed in:** `edbf4f4`

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking)
**Impact on plan:** Necessary for typecheck and stable baselines. No scope creep.

## Issues Encountered

- Worktree had no `node_modules`; `pnpm install --prefer-offline` (no symlink).
- Full `pnpm test:visual` (entire visual suite) was not re-run after these baselines; new specs passed per Playwright project. Earlier baselines were not executed in this sitting.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 05-21 to compose HowItWorks and WhyVamos on `app/[locale]/page.tsx`
- Do not update STATE.md / ROADMAP.md from this worktree

## Self-Check: PASSED

- Key files exist on disk
- Commits: `423a75c`, `38ee7ce`, `a3bd0ae`, `edbf4f4`
- Grep acceptance for yellow / Lenis / IO / props / reduced-motion / invented stats: PASS
- typecheck, lint, lint:css, i18n:check: PASS
- Snapshot dirs: HowItWorks 64, WhyVamos 80 (≥16 each)

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-30*
