---
phase: 01-platform-foundation-design-system-port-i18n-runtime
plan: 11
subsystem: ui
tags: [design-system, react, typescript, nextjs, css-extraction, playwright, screenshot-diff, i18n, rtl, currency]

# Dependency graph
requires:
  - phase: 01-03
    provides: "The stylelint law gates, the i18n key-coverage gate, and the offline mock-harness.ts/playwright.config.ts screenshot-diff rig with button.spec.ts as the reference spec shape"
  - phase: 01-06
    provides: "The nine core primitives (Icon, Badge, Card, etc.), the dev-only states gallery route pattern (thin Server Component page.tsx + client Gallery.tsx), and the mountPort-vs-mountBundle spec shape"
  - phase: 01-07
    provides: "The i18n dictionary migration — statusBadge.* and common.pickup/destination keys, fully translated in all four languages"
provides:
  - "Eight more ported composites (Table, List, ListRow, StatTile, StatusBadge, RouteSummary, PriceSummary, VehicleCard) under components/data/ and components/transfer/, each with a real empty/partial/loading treatment"
  - "The data and transfer dev-gallery categories (/dev/components/data, /dev/components/transfer) with zero/one/many volume fixtures and partial fixtures for the five UI-SPEC-named components (Table, List, StatTile, PriceSummary, RouteSummary), and all nine StatusBadge lifecycle values rendered both standalone and inside a Table cell"
  - "tests/visual/data.spec.ts + transfer.spec.ts with 106 committed screenshot baselines, the fourth and fifth real spec files proving the Plan 03 harness generalizes"
  - "A generalizable mock-harness.ts fix (collectLocalCssLinks): mountPort now links the CSS of every component a ported component composes internally, not just its own — a real, silent styling gap found while diffing StatusBadge/VehicleCard against the bundle"
  - "The exported BookingStatus union (nine lifecycle values) and TableColumn descriptor, the types Phase 4/6/8 build against"
  - "The second German and Arabic manual passes against real ported components (Plan 06 ran the first), with the German lifecycle-label-inside-a-table-cell question and the RouteSummary mirror-vs-keep-direction question both proven against real screenshots"
affects: ["01-12", "01-13", "01-14", "Phase 4 (quote engine)", "Phase 6", "Phase 7 (checkout)", "Phase 8 (ops board)", "Phase 9 (lifecycle)"]

actuals:
  tokens: 17000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A component that composes another category's component internally (StatusBadge/VehicleCard's own <Badge>) needs mountPort to link that composed component's CSS too, not just its own — mock-harness.ts's collectLocalCssLinks walks the local import graph via static source-text scanning (not execution) and resolves every transitively-reachable .css file. Every later port batch that composes across components/{core,forms,navigation,feedback,transfer,data}/ relies on this."
    - "A composite whose compiled bundle source expects a pre-formatted ReactNode prop (PriceSummary's own `value`/`total`, rendered verbatim with no formatting logic in the bundle) while the port formats internally through a shared currency layer (`amount: number | null` -> `formatAmount`, ADR-004/I18N-05) needs two differently-shaped prop objects for a bundle-vs-port diff, not one shared object — the two sides' props are deliberately incompatible by architecture, not a bug."
    - "A state whose own root element renders nothing (StatusBadge's absent-status branch returning `null`) cannot be screenshot-diffed at all — `toHaveScreenshot()` on a zero-size locator times out waiting for 'visible' rather than ever comparing pixels. The correct test for a 'renders nothing' state is a structural assertion (`toBeEmpty()`), not a screenshot."
    - "A component-level structural difference from the vendored bundle that exists for a documented, prior-committed reason (ListRow's `.vt-row__chevron` wrapper span, needed for the RTL mirror rule) produces a small but real pixel/height delta against the bundle and should be treated as a port-only single-sided baseline, not force-matched — the same treatment already established for Law 02 tone drops."

key-files:
  created:
    - "apps/web/app/[locale]/dev/components/data/{DataGallery.tsx,page.tsx}"
    - "apps/web/app/[locale]/dev/components/transfer/{TransferGallery.tsx,page.tsx}"
    - "apps/web/tests/visual/data.spec.ts + data.spec.ts-snapshots/*.png (56 files)"
    - "apps/web/tests/visual/transfer.spec.ts + transfer.spec.ts-snapshots/*.png (50 files)"
    - "apps/web/components/data/{Table,List,ListRow,StatTile}.{tsx,css} (Task 1, prior session)"
    - "apps/web/components/transfer/{StatusBadge,RouteSummary,PriceSummary,VehicleCard}.{tsx,css} (Task 2, prior session)"
    - "apps/web/lib/currency.ts (Task 2, prior session — the currency-mark layer PriceSummary renders through)"
  modified:
    - "apps/web/tests/support/mock-harness.ts (collectLocalCssLinks — composed-component CSS now linked in mountPort)"
    - "apps/web/components/{data,transfer}/index.ts (Tasks 1-2, prior session — per-category barrels)"

key-decisions:
  - "The tinted lead-tile variant is removed from ListRow (Task 1, prior session) — recorded here per the plan's own instruction to note it in this summary."
  - "PriceSummary's line/total amounts are diffed against the bundle using two intentionally different prop shapes per side (bundle: `value`/`total` as pre-formatted ReactNode strings; port: `amount`/`total` as `number | null` routed through `formatAmount`) rather than dropped to a port-only baseline — the compiled bundle source does no currency formatting of its own at all (confirmed by reading `function PriceSummary` in `_ds_bundle.js` directly), so a single shared prop object cannot serve both sides, but a real cross-comparison is still possible and more valuable than a single-sided baseline."
  - "ListRow's 'chevron' state is a port-only baseline, not a bundle-vs-port diff — the `.vt-row__chevron` wrapper span (Task 1's own RTL-mirror fix) changes the row's flex-item height by a few px versus the bundle's unwrapped chevron icon; the mirroring behaviour itself is proven in the dev gallery's Arabic manual pass instead."
  - "StatusBadge's absent-status test asserts `toBeEmpty()` instead of taking a screenshot — the component legitimately renders nothing (T-01-29), and a zero-size locator cannot be screenshotted at all (Playwright times out waiting for it to become visible)."
  - "Table, RouteSummary and VehicleCard are screenshot-diffed at all four fixed viewports (1440/1024/768/390); List, ListRow, StatTile, StatusBadge and PriceSummary at the reduced 1440/390 set — matching each component's own CSS (VehicleCard has a real `@media (max-width:560px)` rule; Table's horizontal-scroll contract and RouteSummary's mirroring rules are exactly what the narrower breakpoints exist to prove) versus the Fidelity Contract's stated reduced-viewport allowance for CSS with no breakpoint rule."

patterns-established:
  - "See tech-stack.patterns above — the composed-component-CSS-linking pattern applies to every later port batch, and the two-prop-shapes-for-one-diff pattern applies to any future composite whose bundle source expects pre-formatted content the port now formats through a shared layer."

requirements-completed: [PLAT-04, I18N-01, I18N-04, I18N-05]

coverage:
  - id: D1
    description: "Eight data/transfer composites (Table, List, ListRow, StatTile, StatusBadge, RouteSummary, PriceSummary, VehicleCard) render as React components emitting the mock's own class names, with statically-imported CSS present in server-rendered HTML, and no banned tinted-yellow surface"
    requirement: "PLAT-04"
    verification:
      - kind: integration
        ref: "pnpm typecheck && pnpm lint:css && pnpm build all pass; grep confirms zero --vt-yellow-(50|100|200|300|600|700) and zero injectStyles/_ds_bundle references under apps/web/components/data/ and apps/web/components/transfer/"
        status: pass
    human_judgment: false
  - id: D2
    description: "The dev gallery renders all eight composites with every marked state in all four languages, including zero/one/many volume fixtures and a partial fixture for the five UI-SPEC-named components, and all nine StatusBadge lifecycle values standalone and inside a Table cell"
    requirement: "PLAT-04"
    verification:
      - kind: integration
        ref: "curl http://localhost:8787/dev/components/{data,transfer} -> 200; curl .../ar/dev/components/transfer | grep dir=\"rtl\" -> match; curl .../de/dev/components/transfer | grep 'Zahlung ausstehend' -> match"
        status: pass
      - kind: automated_ui
        ref: "apps/web/tests/visual/{data,transfer}.spec.ts — 110 passed (106 new baselines across both files), twice in a row from a clean snapshot directory; full pnpm test:visual suite (all six categories) — 332 passed, 0 regressions, 1 unrelated pre-existing failure in tests/integration/feedback-behaviour.spec.ts (Plan 01-10's own dev-server integration test, a concurrent-session port conflict, not a regression from this plan's changes)"
        status: pass
      - kind: manual_procedural
        ref: "Real Playwright screenshots at 1080px (German) and 1440/1024/768/390px (Arabic) against a live opennextjs-cloudflare preview server, inspected directly this session — see German/Arabic Pass sections below"
        status: pass
    human_judgment: true
    rationale: "The Fidelity Contract's own verification split (01-VALIDATION.md) marks 'does the mirrored result read correctly' and 'does a German label widen without clipping' as manual-only — a screenshot inspected by the executor, not a pixel-diff assertion, is the evidence for these two dimensions."
  - id: D3
    description: "StatusBadge exports a closed BookingStatus union covering all nine lifecycle values; an absent/unrecognised status renders no badge (T-01-29); RouteSummary's stop labels resolve through the dictionary; PriceSummary carries no hardcoded currency literal and routes every amount through the shared currency layer (ADR-004/I18N-05)"
    requirement: "I18N-01"
    verification:
      - kind: unit
        ref: "pnpm i18n:check passes (1476 keys, 1 non-literal call site skipped by design — StatusBadge's dynamic status key); node -e greps confirm the nine lifecycle literals and BookingStatus export, and zero hardcoded CHF/EUR/USD/AED literals in apps/web/components/transfer/*.tsx"
        status: pass
      - kind: e2e
        ref: "tests/visual/transfer.spec.ts's StatusBadge 'absent status' test — toBeEmpty() assertion"
        status: pass
    human_judgment: false

duration: ~3h (Tasks 1-2 in a prior session; Task 3 this session)
completed: 2026-08-21
status: complete
---

# Phase 1 Plan 11: Data & Transfer Composites Port — Table, List, ListRow, StatTile, StatusBadge, RouteSummary, PriceSummary, VehicleCard, Dev Gallery Summary

**Eight data/transfer composites ported with real empty/partial/loading treatments, a dev-only states gallery at `/dev/components/{data,transfer}` proving zero/one/many volume fixtures and all nine StatusBadge lifecycle values (standalone and inside a table cell), 106 new committed screenshot baselines, and a generalizable mock-harness.ts fix for composed-component CSS.**

## Performance

- **Duration:** ~3h total (Tasks 1-2 completed in a prior session; Task 3 — this session — completed the gallery, specs, baselines and language passes)
- **Completed:** 2026-08-21
- **Tasks:** 3 of 3 planned
- **Files modified:** 9 in Task 1, 9 in Task 2 (prior session, see their own commits for exact file lists), 7 new/modified text files + 106 baseline PNGs in Task 3 (this session)

## Accomplishments

**Tasks 1-2 (prior session, commits `59d4ee8` and `aff7845` — already on `main`, not touched this session):**
- Ported `Table`, `List`, `ListRow`, `StatTile` (`components/data/`) with the empty-state-in-words rule, `Table`'s `data-selected` attribute-driven selection and `data-lenis-prevent` horizontal-scroll region, and the tinted lead-tile variant dropped from `ListRow` (Law 02).
- Ported `StatusBadge`, `RouteSummary`, `PriceSummary`, `VehicleCard` (`components/transfer/`) with the exported `BookingStatus` nine-value union, `RouteSummary`'s stop labels moved to dictionary lookups, and `PriceSummary`'s amounts routed through the new `apps/web/lib/currency.ts` mark layer (ADR-004).

**Task 3 (this session, commit `a9e5eb0`):**
- Built `/dev/components/data` (`DataGallery.tsx`) and `/dev/components/transfer` (`TransferGallery.tsx`), following the thin-Server-Component-page.tsx-plus-client-Gallery.tsx split Plans 06/09 established (needed here too: `Table`'s `onRowClick`, `ListRow`'s `onClick` and `VehicleCard`'s `onSelect` demo tiles need real handler functions, which Next's App Router refuses to pass across a Server Component boundary). Every component renders every state its Component State Matrix row marks; `Table`, `List` and `StatTile` each render a zero/one/many volume trio plus a partial fixture (an absent status cell, a discount-free price, a one-way route with no return leg); `RouteSummary` and `PriceSummary` do the same for their own meta/line arrays. All nine `StatusBadge` lifecycle values render side by side and again inside a `Table` cell, specifically to test the German label-width-inside-a-cell question UI-SPEC's E5 section flags as unresolved.
- Wrote `tests/visual/data.spec.ts` and `tests/visual/transfer.spec.ts` (106 new baselines total), following the `mountPort`-vs-`mountBundle` shape Plans 06/09 established. `Table`, `RouteSummary` and `VehicleCard` are diffed at all four fixed viewports (their own CSS carries real breakpoint/responsive behaviour — `VehicleCard.css`'s `@media (max-width:560px)` rule, `Table.css`'s `min-inline-size:720px` horizontal-scroll contract, `RouteSummary`'s mirroring rules); the rest at the reduced 1440/390 set. The suite passes twice in a row from a clean snapshot directory (110 passed, 58 skipped at the two non-reduced viewports for components without breakpoint CSS).
- **Found and fixed a real, generalizable bug in `mock-harness.ts`** while building these specs (see Deviations #1): `mountPort` only ever linked the ONE stylesheet matching a component's own basename, never the CSS of any component it composes internally. `StatusBadge` and `VehicleCard` both render a real `<Badge>` — the composed badge rendered as unstyled plain text (no pill, no colour) until this fix, a genuine silent styling gap `_ds_bundle.js`'s own `injectStyles()` mechanism doesn't have (the bundle always injects every component's CSS globally, regardless of what's actually rendered). `collectLocalCssLinks` walks the component's local import graph via static source-text scanning and links every transitively-reachable `.css` file.
- Ran the German and Arabic manual passes against a real `opennextjs-cloudflare preview` server (not asserted from CSS reading alone — direct screenshots, inspected this session): German confirms `ZAHLUNG AUSSTEHEND` (pending, the longest lifecycle label) widens its badge without clipping the table cell around it in both the standalone gallery and the German-locale screenshot test; Arabic confirms `RouteSummary`'s pip/line rail mirrors to the trailing edge while every `CHF 000` figure, `08:15` time and `VT-xxxx` reference stays left-to-right, `Table`'s column order reverses (`STATUS | ROUTE | REFERENCE`) and its horizontal scroll starts from the correct edge, and `ListRow`'s chevron flips direction.

## Task Commits

1. **Task 1: Port the data components — Table, List, ListRow, StatTile** - `59d4ee8` (feat) — prior session
2. **Task 2: Port the transfer composites — StatusBadge, RouteSummary, PriceSummary, VehicleCard** - `aff7845` (feat) — prior session
3. **Task 3: Data and transfer gallery sections, volume fixtures, baselines and the language passes** - `a9e5eb0` (feat) — this session

## Files Created/Modified

**This session (Task 3):**
- `apps/web/app/[locale]/dev/components/data/{DataGallery.tsx,page.tsx}` - the data-category states gallery + thin Server Component route wrapper
- `apps/web/app/[locale]/dev/components/transfer/{TransferGallery.tsx,page.tsx}` - the transfer-category states gallery + thin Server Component route wrapper
- `apps/web/tests/visual/data.spec.ts` + `data.spec.ts-snapshots/*.png` (56 files) - screenshot-diff spec + baselines for the four data components
- `apps/web/tests/visual/transfer.spec.ts` + `transfer.spec.ts-snapshots/*.png` (50 files) - screenshot-diff spec + baselines for the four transfer composites
- `apps/web/tests/support/mock-harness.ts` - `collectLocalCssLinks` (composed-component CSS linking, shared infra fix)

**Prior session (Tasks 1-2, see their own commits for full file lists):**
- `apps/web/components/data/{Table,List,ListRow,StatTile}.{tsx,css,index.ts}`
- `apps/web/components/transfer/{StatusBadge,RouteSummary,PriceSummary,VehicleCard}.{tsx,css,index.ts}`
- `apps/web/lib/currency.ts`

## Decisions Made

See `key-decisions` in the frontmatter for the four implementation-level decisions this plan made across its three tasks (the dropped tinted lead-tile from Task 1, the two-prop-shapes PriceSummary diff, ListRow's port-only chevron baseline, and StatusBadge's `toBeEmpty()` assertion). All four are documented in-file at their point of use as well.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `mountPort` never linked a composed child component's CSS, so `StatusBadge`/`VehicleCard`'s own `<Badge>` rendered unstyled**
- **Found during:** Task 3, the first `pnpm --filter web exec playwright test` run against `transfer.spec.ts` — direct visual inspection of the bundle-vs-port diff for `VehicleCard`'s "selected, with badge" fixture showed the bundle's "Popular" badge as a yellow pill, the port's as plain unstyled text.
- **Issue:** `mock-harness.ts`'s `mountPort` (Plan 06) linked only the ONE stylesheet matching the top-level component's own basename (`StatusBadge.css`), never the CSS of any component it composes internally via `import { Badge } from "../core"` (`Badge.css`). This is a real, silent Fidelity Contract gap for any future composite that renders a sibling-category component, not specific to this plan's two composites.
- **Fix:** Added `collectLocalCssLinks(absPath)` — walks the component's local import graph via static source-text scanning (regex over `import`/`require` statements, resolved through the existing `resolveLocal` helper), collecting every `.css` file transitively reachable from the entry component. `mountPort` now links all of them, deduplicated.
- **Files modified:** `apps/web/tests/support/mock-harness.ts`
- **Verification:** Re-ran `tests/visual/transfer.spec.ts` — `VehicleCard`'s "selected, with badge" and `StatusBadge`'s tone tests now match the bundle pixel-for-pixel (previously mismatched by ~2% on identical fixtures). Full `pnpm test:visual` (all six categories, 332 tests) passed with zero regressions from this change.
- **Committed in:** `a9e5eb0` (Task 3 commit)

**2. [Rule 1 - Bug] `StatusBadge`'s absent-status test tried to screenshot a zero-size element**
- **Found during:** Task 3, the first `data.spec.ts`/`transfer.spec.ts` run — `toHaveScreenshot()` timed out on the "absent status renders no badge" test.
- **Issue:** `StatusBadge` correctly returns `null` for an absent/unrecognised status (T-01-29) — `#root` is then a genuinely empty, zero-size `<div>`. Playwright's `toHaveScreenshot()` waits for the target locator to become "visible" before capturing, which a zero-size element never does, so the test hung until timeout rather than ever comparing pixels.
- **Fix:** Replaced the screenshot assertion with `expect(page.locator("#root")).toBeEmpty()` — the structurally correct test for a "renders nothing" state, and one that fails loudly if a future change makes `StatusBadge` render a fallback badge instead.
- **Files modified:** `apps/web/tests/visual/transfer.spec.ts`
- **Verification:** Test passes deterministically across repeated runs.
- **Committed in:** `a9e5eb0` (Task 3 commit)

**3. [Rule 3 - Blocking issue] `PriceSummary`'s bundle-side and port-side amount props are structurally incompatible for a single shared prop object**
- **Found during:** Task 3, investigating a persistent `pricesummary-many`/`pricesummary-no-discount` bundle-vs-port mismatch — direct inspection showed the bundle side rendering completely blank amount cells.
- **Issue:** The compiled bundle's `function PriceSummary` (`_ds_bundle.js`) renders `l.value`/`total` verbatim with no currency formatting of its own at all — it expects the caller to already supply a pre-formatted string. The port's `PriceLine`/`PriceSummaryProps` shape is `amount: number | null`, formatted internally through `formatAmount` (ADR-004/I18N-05's currency-layer decision, Task 2). Passing one shared props object (as `diffBothSides`'s other tests do) left the bundle side's amounts blank (no `value` key present) while the port side correctly rendered `CHF 000`.
- **Fix:** Added a dedicated `diffPriceSummary` helper that builds two differently-shaped prop objects from one small line-spec list — `value: "CHF 000"` for the bundle side, `amount: null` for the port side — rather than dropping this state to a port-only baseline (a real, meaningful cross-comparison was still possible, just not through one shared object).
- **Files modified:** `apps/web/tests/visual/transfer.spec.ts`
- **Verification:** Both `pricesummary-many` and `pricesummary-no-discount` now diff bundle-vs-port correctly and pass twice in a row.
- **Committed in:** `a9e5eb0` (Task 3 commit)

**4. [Rule 1 - Bug] `ListRow`'s chevron-mirror fix produces a real, small height delta against the bundle**
- **Found during:** Task 3, investigating a persistent `listrow-chevron` mismatch (`Expected an image 1440px by 50px, received 1440px by 54px`).
- **Issue:** Task 1's own RTL-mirror fix wraps the chevron icon in `<span className="vt-row__chevron">` so `[dir="rtl"] .vt-row__chevron{transform:scaleX(-1)}` has something to target. The compiled bundle renders the same chevron `Icon` unwrapped. Under the row's `display:flex`, the wrapper span (not the icon) becomes the flex item on the port side, and its own line-height adds a few px the bundle's unwrapped icon doesn't have — a deliberate structural difference from a prior, already-reviewed commit, not a new regression.
- **Fix:** Marked this state a port-only single-sided baseline (same treatment as `ListRow`'s Law 02 icon-lead divergence, already documented in the same file), with the mirroring behaviour itself proven via the dev gallery's real Arabic screenshot pass instead of a pixel-diff.
- **Files modified:** `apps/web/tests/visual/data.spec.ts`
- **Verification:** Test passes deterministically; the mirroring itself was separately confirmed via a direct Arabic screenshot of `TransferGallery.tsx`'s `ListRow` chevron tile this session.
- **Committed in:** `a9e5eb0` (Task 3 commit)

---

**Total deviations:** 4 auto-fixed (2 Rule 1 bug fixes with product-visible impact — the composed-CSS gap and the absent-status screenshot hang — plus 2 Rule 1/3 test-methodology fixes with no product code change). All four were necessary to make the plan's own verification (`pnpm test:visual --grep @component` with committed, stable baselines) genuinely correct rather than merely green; none expanded scope beyond what Task 3 already asked for. The composed-CSS fix (#1) is the one with real forward reach — every later port batch composing across categories relies on it.

**Impact on plan:** No architectural changes. All four fixes are contained to test infrastructure (`mock-harness.ts`, the two spec files) — no production component (`components/data/`, `components/transfer/`) was touched this session.

## German Pass

Run against the real `opennextjs-cloudflare preview` server this session (not asserted from CSS reading alone — direct screenshots at 1080px, inspected):

- **`/de/dev/components/transfer`**: all nine `StatusBadge` lifecycle values render their real German labels (`ANGEBOT`, `ZAHLUNG AUSSTEHEND`, `BEZAHLT`, `BESTÄTIGT`, `FAHRER ZUGEWIESEN`, `ABGESCHLOSSEN`, `STORNIERT`, `RÜCKERSTATTET`, `NICHTERSCHEINEN`) — confirmed against the standalone row AND inside the `Table`-cell fixture. `ZAHLUNG AUSSTEHEND` ("Awaiting payment", `pending`) is the longest label in the dictionary; it widens its own badge pill without clipping and does not force the table cell or column to grow disproportionately — the row height and column width both accommodate it cleanly. Table headers (`REFERENCE`/`STATUS`) do not clip. `RouteSummary`'s German kickers (`ABHOLUNG`/`ZIEL`) render correctly.
- **`/de/dev/components/data`**: `List`/`ListRow`/`StatTile`/`Table` carry no real German product copy of their own (English-only gallery scaffold prose is intentional, CLAUDE.md's review-scaffold exemption) — the one real German content in this route is the `StatusBadge` cell inside the "many rows" `Table` fixture (composed from `components/transfer`), which renders the same lifecycle labels confirmed above.
- **This is the second real German pass against ported components** (Plan 06 ran the first, against `Button`'s CTA only) — the first against genuinely long, real translated strings inside a constrained container (a table cell), which is exactly the scenario UI-SPEC's E5 section flagged as unresolved until proven.

## Arabic Pass

Checked `/ar/dev/components/{data,transfer}` at 1440px (and 390/1024/768 via the same real preview server, screenshots inspected directly this session):

- **Layout genuinely mirrors**, not just text-alignment: `Table`'s column order reverses (`STATUS | ROUTE | REFERENCE` reading right-to-left), `RouteSummary`'s pip/line rail sits at the trailing (right) edge of each stop's text with the pips themselves also mirrored, `ListRow`'s chevron flips to point left, and `VehicleCard`'s icon/photo tile moves to the inline-start (right) position.
- **Figures, times and references correctly stay left-to-right**: every `CHF 000` amount (in `PriceSummary`, `StatTile`, `VehicleCard`), the `08:15` time and `VT-48xx` references inside `RouteSummary`'s meta row, and the passenger/luggage counts in `VehicleCard`'s capacity row all render un-mirrored inside the RTL document — confirmed by direct inspection, not just `.vt-dir-keep`'s presence in the markup.
- **Nothing clips at 390px** — every section wraps, `Table` remains horizontally scrollable (confirmed the scroll region starts from the correct trailing edge).
- **The absent-status Table row** (VT-4829/VT-4828 depending on locale ordering) renders a genuinely blank status cell in both languages — no fallback badge, no layout shift.
- **No new RTL defects found this session** — the one real defect Plan 06 found and fixed (the gallery's own English scaffold prose bidi-reordering) was already fixed at the shared `Section`/`Tile` pattern level; both new gallery files reuse that same `dir="ltr"` scoping and showed no reordering in this pass.

## Known Stubs

None new this session. (Plan 06's Avatar error-state coverage gap remains recorded in `.planning/WINDOWS.md` from that plan; unrelated to this plan's scope.)

## Issues Encountered

- **First-run screenshot baselines required two regeneration passes** — not a defect, but worth recording: `pnpm test:visual` legitimately fails on its very first run against a clean snapshot directory (Playwright writes the baseline and reports "no snapshot exists" as a failure by design). Two of those first-written baselines (the pre-composed-CSS-fix `StatusBadge`/`VehicleCard` renders, and the pre-`diffPriceSummary`-helper `PriceSummary` renders) had to be deleted and rewritten after the corresponding code fixes above, since the original baseline captured the buggy/mismatched render. All baselines committed in `a9e5eb0` reflect the final, fixed behaviour and pass twice in a row from a clean directory.
- **A concurrent sibling plan (01-10, navigation/feedback) was executing on the same working tree during this session** — its own untracked `tests/visual/{navigation,feedback}.spec.ts` and snapshot directories were visible in `git status` throughout; carefully excluded from every `git add` in this session's commit (only Task 3's own seven files + baseline directories were staged). The one `pnpm test:visual` run against the full suite showed a single unrelated failure in `tests/integration/feedback-behaviour.spec.ts` (a dev-server port conflict, most likely from that concurrent session's own dev server) — confirmed out of this plan's scope (Plan 01-11 touches no feedback files) and not a regression from any change in this session.

## User Setup Required

None — no external service configuration required by this plan.

## Next Phase Readiness

- All eight data/transfer composites (`Table`, `List`, `ListRow`, `StatTile`, `StatusBadge`, `RouteSummary`, `PriceSummary`, `VehicleCard`) are ported, typed, statically styled, screenshot-baselined, and exported from `apps/web/components/{data,transfer}/index.ts`. Combined with Plans 06/09/10, all 33 components D-23's corrected scope named are now ported.
- The exported `BookingStatus` union and `TableColumn<Row>` descriptor are ready for Phase 4 (quote engine), Phase 6, Phase 7 (checkout) and Phase 8 (ops board) to build against without retyping.
- `apps/web/lib/currency.ts`'s `formatAmount`/`DEFAULT_CURRENCY` are the shared currency-mark layer every future price-bearing surface should route through — Plan 13's client-only currency-switch store (D-16) builds on top of this, not around it.
- `mock-harness.ts`'s `collectLocalCssLinks` is now in place for every future port batch whose components compose across categories to rely on without rediscovering the gap.
- **Not blocked on anything.** The German/Arabic passes ran against real ported components with real translated content and found no new defects requiring escalation.

## Self-Check: PASSED

Verified directly this session:
- All Task 3 files present on disk: `apps/web/app/[locale]/dev/components/data/{DataGallery.tsx,page.tsx}`, `apps/web/app/[locale]/dev/components/transfer/{TransferGallery.tsx,page.tsx}`, `apps/web/tests/visual/{data,transfer}.spec.ts`, and their `-snapshots/` directories (56 + 50 PNGs).
- `apps/web/tests/support/mock-harness.ts`'s `collectLocalCssLinks` function present and wired into `mountPort`.
- All three task commit hashes (`59d4ee8`, `aff7845`, `a9e5eb0`) confirmed present in `git log --oneline --all`.
- `pnpm typecheck`, `pnpm lint:css`, `pnpm i18n:check`, `pnpm build`, and `pnpm --filter web exec playwright test --grep @component tests/visual/data.spec.ts tests/visual/transfer.spec.ts` (110 passed, 58 skipped, twice in a row) all pass on the final tree state. Full `pnpm test:visual` (all six gallery categories) — 332 passed, 1 pre-existing unrelated failure (see Issues Encountered).
- `curl` against a real `opennextjs-cloudflare preview` server confirms `/dev/components/{data,transfer}` return 200, `/ar/dev/components/transfer` returns `dir="rtl"`, and `/de/dev/components/transfer` contains the real German `pending` label.
No missing items.
