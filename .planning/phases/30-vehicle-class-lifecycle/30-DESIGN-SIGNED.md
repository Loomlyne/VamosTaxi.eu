# Phase 30 design pictures: signed by Koss

Date: 2026-10-11. Koss signed all five sheets in the question form ("Sign all five").
The pictures were made by Claude Code session `8a03c8b6`, which is now a work session under T3 controller `0fbbf0c1`.

The first version was rejected as "too crowded". It had an inline checklist and a Status column. The signed version is the compact redo.

## Signed sheets (`screens/`)

1. **`sheet-1-table.png`:** the Pricing class table stays the same as today. The only addition is a small LIVE badge (charcoal) or DRAFT badge (outline) beside the class name. At 390 the badge sits under the name.
2. **`sheet-2-draft-checklist.png`:** clicking DRAFT opens a small dialog. It lists Photo, Seats, Bags and "Price in the live price book", each marked done or missing. It also has one line saying what is missing, EDIT CLASS, and GO LIVE, which stays disabled until nothing is missing.
3. **`sheet-3-retire.png`:** the row's delete icon becomes Retire (eye-off). It opens "Retire this class?", which has an optional reason (140 characters), CANCEL and RETIRE.
4. **`sheet-4-retired.png`:** a folded "Retired classes" list sits under the table. Each class takes one line: name, reason and BRING BACK, which returns the class as a Draft.
5. **`sheet-5-chauffeurs.png`:** the chauffeur screen lives at `/chauffeurs`. A chauffeur on a retired class gets one red line, "Retired class: pick a new one". At 390 the class and the flag sit under the chauffeur's name.

## Sheets 6 to 10, signed 2026-10-12

Koss signed all five as drawn in the question form, relayed by T3 controller `0fbbf0c1` (2026-10-12). Pictures drawn from the prototype at `c9fe51cf` with `tools/render.mjs`.

6. **`sheet-6-retire-dialog.png`:** the Retire dialog with the chauffeur count line ("2 chauffeurs are on this class") and the red last-Live warning, in the body order of the UI-SPEC; close X with a 44px tap area. Extra crop: one chauffeur, no warning.
7. **`sheet-7-assign-left-out.png`:** booking detail Assign for a paid trip in a retired class: empty picker and only the "left out" line ("2 chauffeurs left out: retired class"); the false "No chauffeur has the class …" sentence does not show (his answer to open question 1).
8. **`sheet-8-about-classes.png`:** public "Our classes" block with the title "Pick the class that fits." over one card per Live class.
9. **`sheet-9-retired-row-390.png`:** Retired list at 390: name, reason under it, BRING BACK 44px below.
10. **`sheet-10-with-a-class.png`:** `/chauffeurs` with WITH A CLASS counting only chauffeurs on a Live class (2 / 3).

His answer to open question 2 (2026-10-12): the Arabic of the Retire count line and the Assign "left out" line gets count-specific forms (1, 2 dual, 3–10 plural, 11+ singular accusative), grammatical as whole sentences; de, fr, en unchanged; the rest of the dashboard is a later job. The exact strings are in `30-UI-SPEC.md`, "Arabic count forms"; the Arabic frames of sheets 6 and 7 were redrawn with them.

## Notes for the plan

- The built page must show `CHF 000` in the price columns, as it does today. The "—" in the pictures comes from the demo data.
- The checklist is a kit Dialog, because the kit has no Popover.
- The retire icon is eye-off, because the vendored Lucide set has no archive icon.
- The DRAFT badge button is 32 px high so the row height stays the same. Decide whether it needs 44 px.
- The middleware must allow `/chauffeurs` and `/chauffeurs/<id>`, with `/fleet…` forwarding there.
- Not yet touched: `sitemap.dc.html`, `dc-mock-urls.ts`, and the dict entry "The fleet" on the public about page.
- Assign must exclude chauffeurs who are on a retired class.
- Still unclear: how a Draft class's price reaches the live book.

## Prototype state (uncommitted in this worktree)

- `app/ops/OpsPricing.dc.html`, `OpsTable.dc.html`, `OpsFleet.dc.html`, `OpsSidebar.dc.html`, `OpsSoon.dc.html`, `OpsDash.dc.html`, `ops.dc.html`
- `app/vamos-ops-data.js`, `app/vamos-i18n-dict.js`
- the tests `fleet-persist`, `ops-dc-p4`, `ops-dc-editor-foot` and `ops-dc-chauffeur-class`

Checks on this state:
- `vitest run lib/ops`: 132 files and 1613 tests pass. This needs `node scripts/sync-dc-mock-to-public.mjs` first.
- `check-i18n-coverage` passes.
