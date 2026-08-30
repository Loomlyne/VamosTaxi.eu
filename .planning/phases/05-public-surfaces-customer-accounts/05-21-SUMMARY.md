---
phase: 05-public-surfaces-customer-accounts
plan: 21
subsystem: ui
tags: [home, next-intl, publicSql, playwright, site-header]

requires:
  - phase: 05-public-surfaces-customer-accounts
    provides: HomeHero, BookingCard, BookingCardMount, HowItWorks, WhyVamos, Services, Reviews, HomeFaq, publicSql content readers
  - phase: 01-foundation
    provides: buildAlternates, SiteShell, ADR-001 booking draft
provides:
  - Composed `/[locale]` home page (six sections, force-dynamic, publicSql reviews+FAQ)
  - Home overlay header via SiteShell cloneElement (variant=overlay, cta=false)
  - ADR-001 lang-switch against the real BookingCard
affects: [05-22-booking-widget]

tech-stack:
  added: []
  patterns:
    - Home is the only Phase 5 force-dynamic public page (D-11 / ban #5)
    - Overlay/CTA for home resolved in client SiteShell from usePathname; layout stays route-blind and session-blind

key-files:
  created:
    - apps/web/app/[locale]/home.css
    - apps/web/components/home/index.ts
    - apps/web/tests/visual/home.spec.ts
  modified:
    - apps/web/app/[locale]/page.tsx
    - apps/web/components/shell/SiteShell.tsx
    - apps/web/tests/integration/lang-switch.spec.ts

key-decisions:
  - "05-06 recorded no overlay/cta mechanism. Home overlay is cloneElement on the layout header inside SiteShell when the pathname (locale stripped) is /."
  - "getCloudflareContext plus both publicSql reads sit in try/catch; a missing binding or dead DB sets Reviews and HomeFaq to error and the rest of the page still renders."
  - "BookingCardMount slots are not filled by this page. 05-22 owns board / price / status."

patterns-established:
  - "Public home never imports SiteHeader/SiteFooter; layout owns the shell."
  - "Lang-switch fills BookingCard data-test-field hooks and asserts readDraft() in sessionStorage (vamosTrip) with no reload()."

requirements-completed: [SITE-01, SITE-02, SITE-06, SITE-07]

duration: 80min
completed: 2026-08-30
---

# Phase 05 Plan 21: Compose the home page

**Public `/` is now the six-section home (hero+BookingCard, HowItWorks, Services hourly off, WhyVamos, Reviews, HomeFaq) inside the layout shell, overlay header, force-dynamic publicSql reads with designed error states, and no CHF.**

## Performance

- **Duration:** ~80 min
- **Started:** 2026-08-30T16:50:00Z
- **Completed:** 2026-08-30T17:11:03Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Retired Phase 1 `data-image-proof` images and `BookingDraftFields` from `page.tsx`.
- Reviews/FAQ load via `getPublishedReviews` / `getContentStrings`; DB failure degrades those two sections only.
- ADR-001 lang-switch now drives the real booking card (3/3 green on component-1440).

## Overlay / `cta={false}` mechanism

05-06 SUMMARY recorded none. `apps/web/components/shell/SiteShell.tsx` already reads `usePathname()`. After stripping `/de|/fr|/ar`, if the remainder is `/` or empty it `cloneElement`s the layout header with `{ variant: "overlay", cta: false }`. Layout still does not read the route or the session. `SiteHeader` restores the CTA once the overlay bar floats (`scrollY > 120`).

## `BookingCardMount` slots for 05-22

This page renders `<BookingCard />` with no `board` / `price` / `status` props. `board` and `status` stay `undefined`. `BookingCard` (05-06) still passes an empty `PriceSummary` (`empty`, `tCommon("empty")`) into the price slot when `price` is omitted — no quote call, no amount, no `CHF`. Plan 05-22 is the only plan allowed to fill the three slots with Phase 4 client logic.

## lang-switch assertion counts

- Before this plan: **11** `expect(` in `tests/integration/lang-switch.spec.ts`
- After: **21** `expect(`
- Added: `readDraft()` via `page.evaluate` on `vamosTrip`, plus pickup-label language asserts (`PICKUP_LABEL` en/de/ar) with no `reload()`.
- Hidden date input is filled with `{ force: true }` (`.vt-bc-sr-date` is clipped).

## Task Commits

1. **Task 1: Compose the page and retire Phase 1's proof scaffolding** - `69b1204` (feat)
2. **Task 2: Keep ADR-001's draft-survives-a-language-switch guarantee green** - `430c21a` (test)
3. **Task 3: The whole-page SITE-01 proof** - `1405472` (test)

**Plan metadata:** (this commit)

## Files Created/Modified

- `apps/web/app/[locale]/page.tsx` — composed home; `export const dynamic = "force-dynamic"`
- `apps/web/app/[locale]/home.css` — `[data-home]` column + overflow clip; no new class names
- `apps/web/components/home/index.ts` — section barrel
- `apps/web/components/shell/SiteShell.tsx` — home overlay clone
- `apps/web/tests/integration/lang-switch.spec.ts` — real BookingCard fields
- `apps/web/tests/visual/home.spec.ts` — 16-locale×viewport page spec; fail-loud on reviews/FAQ error

## Decisions Made

- Overlay lives in `SiteShell`, not the RSC layout.
- Hourly service card off: `Services showChauffeurByHour={false}`.
- Visual spec throws `Local stack is not running. Run \`pnpm db:start && pnpm db:reset\`.` when `[data-rv]` or `[data-home-faq]` `data-state="error"` — no `skip()`.

## Deviations from Plan

None - plan executed as written. Task 3 verify did not go green (see Issues).

## Issues Encountered

- `tests/visual/home.spec.ts --workers=1` (ports 4280–4283) **failed loud**: the composed page rendered, but Reviews and HomeFaq were `data-state="error"` (Hyperdrive/`publicSql` against `127.0.0.1:54322`). Direct `postgres://postgres:***@127.0.0.1:54322` also failed password auth — this is not the Vamos local stack. Per contract, did not run `pnpm start` / `supabase start` / Docker. No `home.spec.ts-snapshots` written (count 0, need ≥16 once the owner stack is up).
- Did **not** re-run full `pnpm test:visual` (same as 05-04).
- Worktree has no `apps/web/node_modules`; Playwright/Next used the main checkout binaries with `cwd` = worktree `apps/web`. Restored `next-env.d.ts` and `tsconfig.json` after each run.

## User Setup Required

Visual green needs the owner local stack: `pnpm db:start && pnpm db:reset`, then `playwright test tests/visual/home.spec.ts --workers=1 --update-snapshots` once, then without `--update-snapshots`.

## Next Phase Readiness

- 05-22 can fill `BookingCardMount` board / price / status.
- Home composition and ADR-001 against the real widget are in place.
- Whole-page baselines blocked on local Postgres.

---
*Phase: 05-public-surfaces-customer-accounts*
*Completed: 2026-08-30*
