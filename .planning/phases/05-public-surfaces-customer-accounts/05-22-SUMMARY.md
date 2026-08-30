---
phase: 05-public-surfaces-customer-accounts
plan: 22
subsystem: ui
tags: [booking-widget, quote, REFUSAL_BINDINGS, playwright, home]

requires:
  - phase: 04-quote-pricing-engine
    provides: client-contract.ts REFUSAL_BINDINGS DIR_KEEP_PARAMS LOCK_DANGER_THRESHOLD_S fixtures /dev/quote
  - phase: 05-public-surfaces-customer-accounts
    provides: composed home, BookingCard, BookingCardMount slots
provides:
  - BookingBoard mounted into home BookingCard (board / price / status)
  - quote.none_fit and quote.moved_to on the charcoal status strip (option-b)
  - home-widget visual proof, 16 snapshots, four locales × four widths
affects: [05-23-ci, 05-24-owner-inbox]

tech-stack:
  added: []
  patterns:
    - Switch refusals on REFUSAL_BINDINGS[code], never on an invented string
    - Status strip multiplexes none_fit / moved_to / saved / ready / needs-a-trip

key-files:
  created:
    - apps/web/components/home/BookingBoard.tsx
    - apps/web/components/home/BookingBoard.css
    - apps/web/tests/visual/home-widget.spec.ts
  modified:
    - apps/web/app/[locale]/page.tsx
    - apps/web/components/home/BookingCard.tsx

key-decisions:
  - "Task 2 option-b: quote.none_fit and quote.moved_to render in the same dark status strip (BookingCardMount status slot / stripNote). Not an Alert above the board."
  - "Precedence on that strip: none_fit > moved_to > saved > ready > needs-a-trip."
  - "Two class cards at once is allowed (8 pax + extra). Not a second booking."
  - "04-UI-SPEC.md Assumption 5 should be updated with option-b + this precedence — owner flag, not edited from this phase."
  - "BookingCardMount left frozen. BookingCard gained an optional children slot so BookingBoard can own the three Mount slots without cloning the card."

patterns-established:
  - "Home page renders <BookingCard><BookingBoard /></BookingCard>; Board fills Mount."
  - "Quote POST is aborted on input change and unmount (AbortController)."

requirements-completed: [SITE-01, SITE-06]

duration: 90min
completed: 2026-08-30
---

# Phase 05 Plan 22: Mount the quote widget

**Home BookingCard now runs Phase 4's quote board: classes, CHF 000 price panel, and none_fit/moved_to on the same charcoal strip.**

## Performance

- **Duration:** ~90 min
- **Started:** 2026-08-30T17:30:00Z
- **Completed:** 2026-08-30T18:53:00Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments

- Task 1: 04-16 artifacts present (`REFUSAL_BINDINGS`, `DIR_KEEP_PARAMS`, `LOCK_DANGER_THRESHOLD_S`, fixtures, `/dev/quote`, `quote-flow.spec.ts`).
- Task 2: owner chose **option-b** (same strip, same card). Two class cards at once is allowed.
- Task 3: `BookingBoard` calls `/api/quote`, switches refusals on `REFUSAL_BINDINGS`, auto-moves to cheapest eligible class, `formatAmount` → `CHF 000`, `.vt-dir-keep` via `DIR_KEEP_PARAMS`, lock danger from `LOCK_DANGER_THRESHOLD_S`.

## Status-strip precedence (option-b)

1. `quote.none_fit` (no class fits)
2. `quote.moved_to` (saved class dropped; moved to next capacity fit)
3. saved class
4. ready (board loaded, none selected)
5. needs-a-trip

`04-UI-SPEC.md` Assumption 5 is **not** edited here. Owner should back-fill the assumption log.

## Verification

- `home-widget.spec.ts`: **40 passed** (4 projects × 10), `--workers=1`.
- Snapshots: **16** (`en/de/fr/ar` × `390/768/1024/1440`).
- Greps on `BookingBoard.tsx`: `REFUSAL_BINDINGS` 4; `case "quote.` / `=== "quote.` 0; `pricing_live` 0; `formatAmount` 3; `LOCK_DANGER_THRESHOLD_S` 2; `vt-dir-keep` 1 (via `keep()`); AbortController/abort 3.
- `pnpm i18n:check` green. No new keys.
- `lint:css` on `BookingBoard.css` green.
- Worktree `tsc --noEmit` red: missing `@types/node` (no worktree `node_modules`). Inherited. Next compiled the board under Playwright.

## Deviations

- `BookingCard.tsx` not in plan `files_modified`. Added optional `children` so the page can slot `BookingBoard` without touching frozen `BookingCardMount`.
- Full `pnpm test:visual` not re-run. `home.spec.ts` 390 passed after the mount; 768+ not re-baselined this sitting (next-dev persist busy after 390). Widget spec is the plan's proof.
- Class display names in `moved_to` params are the English slugs' labels (Economy/Business/Van) — no new i18n keys.

## Task Commits

1. **Task 1: Verify 04-16 artifacts** — no files (precondition).
2. **Task 2: none_fit / moved_to placement** — no files (owner option-b).
3. **Task 3: Mount board / price / status** — feat + test commits below.

**Plan metadata:** docs commit for this SUMMARY.
