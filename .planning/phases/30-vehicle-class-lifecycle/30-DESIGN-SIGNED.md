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
