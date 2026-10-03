# R2-2 — tablet booking card (681–1080 px)

## Decision this changes (read first)
Option A REPLACES the owner's signed 26.4 decision for tablets: `.planning/phases/26.4-one-form-phone-booking/26.4-CONTEXT.md:21` (D-01) says
"Phone (390) AND tablet (768) get the new pattern: the hero shows ONE bar ... Laptop (>=1081) keeps the 26.3 home box". With A, tablets (681-1080) get the
box again; only phones (<=680) keep one bar + sheet. A needs the owner's explicit word that D-01/D-02/D-05 no longer apply at 681-1080.
Option B keeps D-01 (one bar + sheet on tablet) and redesigns the bar and the sheet.

Today at 681-1080: the card is hidden; a one-line "Where to?" bar (max 640) + trust line shows, tapping opens a one-column 560 px sheet that scrolls at 1024x768.
Recommended: A.

## Option A: card returns at 681-1080 (two-column grid) — optA.css
681-899: From swap To / When + Travellers / SEE PRICES full width / notes. 900-1080: From swap To / When, Travellers, SEE PRICES in one row / notes.
Flight row (when present) is full width above From. One-way only, 54 px fields and CTA, signed field order kept. Phone (<=680) untouched.

### Coder files (A)
- `app/home/home.dc.html` (+ twin in `app/pages/` only if one exists; none known) — only file with product changes.
- `apps/web/tests/unit/home-one-form-264.test.ts` lines 54-55: `matchMedia('(max-width:1080px)')` and `@media (max-width:1080px){\n[data-bookcard]{display:none!important}` become the 680 versions (title "uses one media boundary" stays true: one boundary, now 680).
- `apps/web/tests/unit/home-laptop-bar-2641.test.ts` lines 4, 64-65: same two needles; comment line 4 and "<=1080 stays the 26.4 bar + sheet" updated; check the 1081/1359 `block` tests still match once the 681-1080 rules are added as their own block (keep them in a separate @media so lines 22-36 keep passing).
- Strings: none new (all existing).

### Every behaviour that depends on NARROW() / state.narrow in home.dc.html (all move from 1080 to 680; each needs a check at 681-1080 and at <=680)
1. l.1158 `NARROW()` definition: `matchMedia('(max-width:1080px)')` -> `(max-width:680px)`.
2. l.1218 initial state `narrow: NARROW()`.
3. l.1261-1291 chip from HowItWorks/destinations (`if (narrow) this.openSheetAt(1)`): at 681-1080 the chip must fill To in the box and scroll to it instead of opening the sheet.
4. l.1308 `#book` hash landing: offset `-(headerBottom()+16)` only when narrow; at tablet the box is `#book` and the overlay header is not sticky-docked, so offset -16 applies.
5. l.1362-1369 resize handler: `narrow` flip, closes the sheet and clears suggestions when leaving narrow (l.1366), `flipped` resets for narrow entering; plus l.1376 `_mqs = ['(max-width:1080px)', '(min-width:1360px)']` -> 680.
6. l.1952 `setupDock()`: IntersectionObserver docked bar only when narrow; at tablet no dock.
7. l.1987 `#book` link interceptor (`bookClick`): swallows `/#book` links and opens the sheet when NARROW(); at tablet the link must just scroll to the box.
8. l.2167 `componentDidUpdate`: flight field focus after an airport pick is skipped when narrow; at tablet it must run (focus moves to Flight number).
9. l.2346 `dockShow` and l.2348 `barId/boxId` (`id="book"` goes to the bar when narrow, to the card otherwise) and l.2395 `trustInBar` (hero trust line hidden when in bar).
10. CSS tied to the same boundary: l.211 (`#book` <=1079 rules), l.230/233 `data-only-wide`/`data-upto-wide`, l.241, l.218 (hero height `calc(100svh - 88px)` stays <=1080: keep at 1080, it is the hero, not the card), l.275-278 (>=681 grid, replaced by optA.css), l.290-308 bar/dock block (`max-width:1080px` -> 680), l.314-345 laptop rules (>=1081, unchanged).
11. The 26.4 sheet (BookingSheet) is then only opened <=680; `home-sheet-history-bp2` behaviour (history entry on open) is unaffected.

### Tests that will change (A)
- `apps/web/tests/visual/home-laptop-bar.spec.ts`: "26.4 bar unchanged at 1080 and under" (l.~398-399, runs at 1024/768/390) and the resize test l.~348-367 (1181 -> 1024 expects `[data-bookcard]` hidden and `[data-bar-wrap] [data-bb]` visible) — expectations flip for 1024/768; 390 stays.
- `apps/web/tests/visual/home-booking-sheet.spec.ts`: every project at 1024 and 768 (header l.9, `1080` boundary uses at l.116-536, 900 at l.315-351) — sheet specs at 1024/768 must move to the phone project (390) or be removed for tablet.
- `apps/web/tests/visual/home-booking-box.spec.ts` (l.84 skips <=1080): now runs at 768 and 1024 too; add 768/1024 flight-order and traveller-popover cases.
- `apps/web/tests/visual/home-one-way.spec.ts` (l.24 boundary 1080) and `home-phone-hero.spec.ts` (boundary 1080 at l.5,34,58,71,83,112): re-point to 680.
- `apps/web/tests/visual/booking-bar-states.spec.ts` / `booking-sheet-states.spec.ts`: component galleries, unaffected.
- Snapshots that change: `home-hero.spec.ts-snapshots/hero-*-component-1024|768-darwin.png` (all states: empty, filled, mount, sheet-closed, sheet-open, en/de/ar), `home.spec.ts-snapshots` and `home-widget.spec.ts-snapshots` at 1024/768. `home-no-dark-band-bp2.spec.ts` (768) re-check page end. Other home section snapshots (reviews, services, how-it-works, why-vamos) only if the hero height moves; it should not.

## Option B: keep bar + sheet, redesign both — optB.css + optB.js
Bar = one 54 px strip From | To | When | SEE PRICES; any tap opens the sheet. CTA is the design-system Button (primary, lg, iconEnd arrow-right), hover = `--vt-accent-hover` (#EDB306, checked in picture R2-2-optB-en-1024x768-hover.png). No `--vt-yellow-*` anywhere in either option.
Sheet = two columns from 681 (Where | When, Who full width, Passengers | Bags side by side), footer CTA 880 wide; no scroll at 1024x768 and 768x1024.

### Coder files (B)
- `app/home/BookingBar.dc.html`: `variant="strip"` (segments + x-import Button), keeps `[data-bb]` for the phone variant; new aria: segments are buttons with aria-haspopup="dialog".
- `app/home/BookingSheet.dc.html`: two-column CSS inside `@media (min-width:681px)` (selectors `[data-bs-col]`, `[data-bs-sec]`, `[data-bs-when]`, `[data-bs-msg]`, `[data-bs-next]`).
- `app/home/home.dc.html`: pass the variant at 681-1080, `setupDock()` observes the strip (dock shows a compact bar under the header), trust/notes rows unchanged.
- Strings: none new (From, To, Pickup address, Drop-off address, Add date and time, See prices exist).
- Unit: `home-one-form-264.test.ts` l.54-55 and `home-laptop-bar-2641.test.ts` l.64-65 stay as is (boundary stays 1080).
- Visual specs that change: `booking-bar-states.spec.ts` (new strip states, 54 px check), `booking-sheet-states.spec.ts` (two-column at 768/1024), `home-booking-sheet.spec.ts` (1024/768 layout assertions), `home-hero.spec.ts-snapshots` (1024/768 all states), `home-laptop-bar.spec.ts` l.~398-460 ("26.4 bar unchanged" at 1024/768).
