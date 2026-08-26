---
phase: 01-platform-foundation-design-system-port-i18n-runtime
plan: 10
subsystem: ui
tags: [design-system, react, typescript, nextjs, css-extraction, playwright, screenshot-diff, i18n, rtl, focus-trap, accessibility]

# Dependency graph
requires:
  - phase: 01-03
    provides: "The stylelint law gates, the i18n key-coverage gate, and the offline mock-harness.ts/playwright.config.ts screenshot-diff rig (mountPort/mountBundle/serveMock) with button.spec.ts as the reference spec shape"
  - phase: 01-06
    provides: "The dev-only states gallery pattern (app/[locale]/dev/components/{page.tsx,core/*}), Icon/IconButton the navigation and feedback components compose against"
  - phase: 01-07
    provides: "The per-category barrel pattern (components/{category}/index.ts) this plan's navigation and feedback barrels follow"
  - phase: 01-08
    provides: "apps/web/lib/lenis-provider.tsx — the single Lenis instance and its inline-style-reading MutationObserver, which Dialog's scroll lock cooperates with and this plan's behaviour spec asserts against from the dialog's side"
provides:
  - "Three navigation components (Tabs, StepIndicator, SectionHeader) and five feedback components (Alert, Toast, Tooltip, Dialog, ProgressIndicator), all ported with the mock's own class names and statically-imported CSS, exported from components/navigation/index.ts and components/feedback/index.ts"
  - "Dialog's focus trap, restore-focus-on-close, and body-scroll-lock/restore cycle — real behaviour beyond rendering, absent from the compiled source, added and automatically proven"
  - "Two dev-only gallery routes (app/[locale]/dev/components/{navigation,feedback}) rendering every marked state, reviewable in all four languages"
  - "tests/visual/navigation.spec.ts + tests/visual/feedback.spec.ts — 62 committed screenshot baselines proving the port matches the vendored bundle per component/variant/state"
  - "tests/integration/feedback-behaviour.spec.ts (@feedback-behaviour) — the automated proof that a screenshot diff cannot give: focus trap, focus restoration, the Lenis scroll-lock cycle meeting from the dialog's side, and the toast live region"
  - "Two real, found-and-fixed gallery-layout defects (StepIndicator tile overlap, Tabs overflow demo not actually constraining its row) plus the class-of-gap pattern for a React-state-only visual (Tooltip's 'shown' state, recorded in WINDOWS.md rather than silently skipped)"
affects: ["01-14", "phase-5-booking-funnel (Dialog's focus/scroll machinery is what any future sheet/modal composes against)"]

actuals:
  tokens: 29070
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Uniform mountPort-vs-mountBundle screenshot diffing (core.spec.ts/forms.spec.ts's own established shape) applies unmodified to navigation and feedback — no special-casing needed even though this batch includes the first component with a position:fixed root (Dialog) and the first with a React-state-only visibility toggle (Tooltip)."
    - "A component whose compiled bundle counterpart genuinely cannot render a Rule 2 addition's prop shape (Tabs' per-tab `disabled`, StepIndicator's `{label, error}` object items — both crash or silently no-op against the plain-string/no-disabled bundle source) gets a single-sided, port-only screenshot baseline, the same treatment forms.spec.ts's Checkbox indeterminate/invalid states already established — confirmed here by literally reproducing the bundle-side crash first, not assumed from reading the source."
    - "A component whose visual root is `position:fixed` (Dialog's `.vt-dialog__scrim`) collapses its own `#root` wrapper to a 0×0 box for screenshot purposes — normal document flow gives a fixed-positioned child no size contribution to its parent, so every Dialog screenshot in this batch targets `.vt-dialog__scrim` directly, not `#root`. A component whose overflow content is `position:absolute` (Tooltip's bubble) has the same box-collapse problem one level more subtly — `#root` still reports a non-zero size (the trigger's own box), so nothing errors, it just silently crops the bubble out of frame — worked around with a full-page `expect(page)` screenshot instead of an element-scoped one."
    - "A flex item's default `min-inline-size:auto` (not `0`) resolves to its own content's intrinsic minimum width — for a `white-space:nowrap`, no-wrap-point child (StepIndicator's step flow), that silently defeats any `maxInlineSize` set on the item itself and forces the whole row (and the page, at a narrow viewport) wider than intended. The fix is an explicit `minInlineSize:0` on the flex item plus a `overflow-x:auto` inner wrapper around the actual overflowing content — not a wider box, which just moves the same overflow to a different width."
    - "`display:inline-flex` (Tabs' own `.vt-tabs` class, absent the `block` prop) sizes to its own content regardless of an ancestor's declared width — a plain-width wrapper around it does not constrain it, silently defeating an intended overflow demo until the `block` prop (which switches to `.vt-tabs--block{inline-size:100%}`) is added."

key-files:
  created:
    - "apps/web/components/navigation/{Tabs,StepIndicator,SectionHeader}.{tsx,css}, index.ts"
    - "apps/web/components/feedback/{Alert,Toast,Tooltip,Dialog,ProgressIndicator}.{tsx,css}, index.ts"
    - "apps/web/app/[locale]/dev/components/navigation/{page.tsx,NavigationGallery.tsx}"
    - "apps/web/app/[locale]/dev/components/feedback/{page.tsx,FeedbackGallery.tsx}"
    - "apps/web/tests/visual/navigation.spec.ts + navigation.spec.ts-snapshots/*.png (22 files)"
    - "apps/web/tests/visual/feedback.spec.ts + feedback.spec.ts-snapshots/*.png (40 files)"
    - "apps/web/tests/integration/feedback-behaviour.spec.ts"
  modified: []

key-decisions:
  - "The tinted accent tone is removed from both Alert's and Toast's tone unions entirely (Law 02), matching the treatment Plan 06 gave Card's accent tone and Badge's warning tone — recorded in Task 2, re-confirmed here since it's this plan's headline decision."
  - "Dialog's AutoOpenDialogDemo (the gallery fixture) opens itself on mount rather than sitting behind a button a reviewer has to click — matching the plan's own instruction for this fixture — by calling `.focus()` on its trigger synchronously before `setOpen(true)`, so Dialog's own focus-capture effect reads the trigger as `document.activeElement` on the very next commit instead of `document.body`. This is also the exact mechanism tests/integration/feedback-behaviour.spec.ts depends on for a meaningful focus-restoration assertion."
  - "Tooltip's 'shown' state has no port-side (mountPort) screenshot: it is React state toggled by a live onMouseEnter/onFocus handler, not a CSS pseudo-class and not a controllable prop (a deliberate Task 2 design decision, not a gap to route around by adding one). mountPort serves fully static, non-hydrated markup with no attached event handlers, so this is the same test-methodology boundary 01-06-SUMMARY.md already documents for Avatar's onError fallback — recorded in WINDOWS.md (entry 5), not silently skipped, with the bundle-side screenshot and the gallery's real-focus fixture as the two forms of evidence that do exist."
  - "StepIndicator's error-state and Tabs' per-tab-disabled screenshot tests are port-only, single-sided baselines — the compiled bundle's own `StepIndicator`/`Tabs` functions have no shape for these Rule 2 additions at all (confirmed by reproducing a real crash on the StepIndicator side, and a real silent no-op on the Tabs side, before writing the single-sided test), the same treatment forms.spec.ts's Checkbox indeterminate/invalid states already established."

patterns-established:
  - "See tech-stack.patterns above — the fixed/absolute-position screenshot-target workaround and the flex-item auto-min-width fix apply to any later gallery batch whose components include a modal, a positioned overlay, or a no-wrap multi-item flow."

requirements-completed: [PLAT-04, I18N-01, I18N-04, PLAT-05]

coverage:
  - id: D1
    description: "Eight navigation and feedback components (Tabs, StepIndicator, SectionHeader, Alert, Toast, Tooltip, Dialog, ProgressIndicator) render as React components emitting the mock's own class names, with statically-imported CSS present in server-rendered HTML"
    requirement: "PLAT-04"
    verification:
      - kind: integration
        ref: "pnpm typecheck && pnpm lint:css && pnpm i18n:check && pnpm build all pass; grep confirms zero injectStyles/_ds_bundle references under apps/web/components/navigation and apps/web/components/feedback"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every state each component's Component State Matrix row marks is built and reachable by using the component, and screenshot-diffed against the vendored bundle"
    requirement: "PLAT-04"
    verification:
      - kind: automated_ui
        ref: "apps/web/tests/visual/navigation.spec.ts + feedback.spec.ts — 62 passed, twice in a row from a clean snapshot directory"
        status: pass
      - kind: manual_procedural
        ref: "Tooltip's port-side 'shown' state is the one documented exception — see key-decisions and Known Stubs / WINDOWS.md entry 5"
        status: pass
    human_judgment: false
  - id: D3
    description: "Focus stays inside an open Dialog (focus trap), and closing it returns focus to the element that opened it (focus restoration)"
    requirement: "PLAT-04"
    verification:
      - kind: integration
        ref: "apps/web/tests/integration/feedback-behaviour.spec.ts › 'focus trap: tabbing repeatedly never lets focus leave the open dialog' and 'focus restoration: closing the dialog (Escape) returns focus to the element that opened it'"
        status: pass
    human_judgment: false
  - id: D4
    description: "The document and the Lenis smooth-scroll instance both stop while the dialog is open and both restart once it closes — the same cycle proven from the provider's side in Plan 08, now proven from the dialog's side too"
    requirement: "PLAT-05"
    verification:
      - kind: integration
        ref: "apps/web/tests/integration/feedback-behaviour.spec.ts › 'scroll lock: the document and the Lenis instance both stop while the dialog is open, and both restart once it closes'"
        status: pass
    human_judgment: false
  - id: D5
    description: "A dialog's tall body scrolls inside itself while the page behind it does not move, and a toast renders inside a live region so assistive technology announces it"
    requirement: "PLAT-04"
    verification:
      - kind: integration
        ref: "apps/web/tests/integration/feedback-behaviour.spec.ts › 'dialog body: scrolls inside itself while the page behind it does not move' and 'toast: renders inside a live region'"
        status: pass
    human_judgment: false
  - id: D6
    description: "The dev galleries render all eight components with every marked state, in all four languages, mirroring correctly under Arabic, with no horizontal page scroll at 390px"
    requirement: "I18N-04"
    verification:
      - kind: integration
        ref: "curl http://localhost:8787/dev/components/{navigation,feedback} -> 200 each; curl .../ar/dev/components/{navigation,feedback} | grep dir=\"rtl\" -> match each"
        status: pass
      - kind: manual_procedural
        ref: "Playwright screenshots at 1440/1024/768/390px in en/de/ar, inspected directly this session — see German/Arabic Pass sections below; two real defects found and fixed (StepIndicator tile overlap, Tabs overflow demo not constraining its own row) before this evidence was collected"
        status: pass
    human_judgment: true
    rationale: "The Fidelity Contract's own verification split (01-VALIDATION.md) marks 'does the mirrored result read correctly' as manual-only, the same treatment 01-06-SUMMARY.md's D3 already uses for the core gallery."

duration: ~90min (Task 3 only, this session)
completed: 2026-08-21
status: complete
---

# Phase 1 Plan 10: Navigation & Feedback Component Port, Dialog Behaviour Spec Summary

**Eight components ported (Tabs, StepIndicator, SectionHeader, Alert, Toast, Tooltip, Dialog, ProgressIndicator), a real focus-trap/scroll-lock/restore-focus implementation added to Dialog where the source had none, two dev galleries proven correct in German and Arabic with two real layout defects found and fixed along the way, 62 new screenshot baselines, and an automated behaviour spec proving focus, scroll and the toast live region — the exact four things a screenshot diff cannot see.**

## Performance

- **Duration:** Tasks 1–2 completed in a prior session (see their commit timestamps, 2026-08-21 04:39–04:44); Task 3 completed in this session, ~90 min
- **Completed:** 2026-08-21
- **Tasks:** 3 of 3 planned
- **Files modified:** ~25 across the whole plan (7 in Task 1, 11 in Task 2, ~9 non-baseline files in Task 3 plus 62 baseline PNGs)

## Accomplishments

- **Task 1 (prior session, commit `c04881c`):** Ported `Tabs`, `StepIndicator`, `SectionHeader` — the navigation trio. `Tabs` gained an `overflow-x:auto` row (Rule 2, the source has no overflow rule at all) marked `data-lenis-prevent`, and a per-tab `disabled` field the compiled source's `items` shape doesn't carry. `StepIndicator` gained a `completedLabel` assistive-only announcement and a per-step `error` flag, neither present in the source. `SectionHeader` shipped as a pure typographic composition with a Law 02 fix (`--vt-yellow-700` eyebrow colour → `--vt-charcoal-800`) and an RTL chevron-mirror rule for its action link.
- **Task 2 (prior session, commit `3bb7ae2`):** Ported `Alert`, `Toast`, `Tooltip`, `Dialog`, `ProgressIndicator` — the feedback set. Dropped the tinted `accent` tone from both Alert's and Toast's tone unions (Law 02, binding per the plan). Built Dialog's entire behavioural layer from scratch — focus trap, restore-focus-on-close, body-scroll-lock/restore, Escape-to-close — since the compiled source is a plain `if (!open) return null` render with none of it.
- **Task 3 (this session, commit `59f98ee`):** Two dev galleries (`app/[locale]/dev/components/{navigation,feedback}`), following the Plan 06/09 server-wrapper + client-gallery split exactly (Tabs' unconditional per-tab `onClick`, SectionHeader's action-link handler, Dialog's open/close state, and Tooltip's hover/focus state all need a real client-side function, which a Server Component cannot pass across the boundary). Two screenshot-diff specs — `navigation.spec.ts` (22 tests) and `feedback.spec.ts` (40 tests) — following core.spec.ts/forms.spec.ts's uniform mountPort-vs-mountBundle strategy, all passing twice in a row from a clean snapshot directory. One behaviour spec, `feedback-behaviour.spec.ts` (`@feedback-behaviour`, 5 tests), reusing the feedback gallery's own `AutoOpenDialogDemo` and dismissible `Toast` fixtures rather than a bespoke test-only page (not in this plan's file scope) — proving focus trap, focus restoration, the scroll-lock cycle from the dialog's side (meeting `lenis.spec.ts`'s own proof from the provider's side), the dialog's own tall body scrolling without moving the page, and the toast's live region.
- Found and fixed three real, non-cosmetic defects during this session's own build/verify/German/Arabic passes (see Deviations) — none of them assumed from reading CSS, all confirmed by rendering the real thing and inspecting it directly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Port the navigation trio — Tabs, StepIndicator, SectionHeader** - `c04881c` (feat) — prior session
2. **Task 2: Port the feedback set — Alert, Toast, Tooltip, Dialog, ProgressIndicator** - `3bb7ae2` (feat) — prior session
3. **Task 3: Gallery sections, baselines, and the behaviours a screenshot cannot see** - `59f98ee` (feat) — this session

## Files Created/Modified

- `apps/web/components/navigation/{Tabs,StepIndicator,SectionHeader}.{tsx,css}`, `index.ts` — the navigation trio (Task 1)
- `apps/web/components/feedback/{Alert,Toast,Tooltip,Dialog,ProgressIndicator}.{tsx,css}`, `index.ts` — the feedback set (Task 2)
- `apps/web/app/[locale]/dev/components/navigation/{page.tsx,NavigationGallery.tsx}` — thin Server Component wrapper + client gallery (Task 3)
- `apps/web/app/[locale]/dev/components/feedback/{page.tsx,FeedbackGallery.tsx}` — same split, including `AutoOpenDialogDemo` and `AutoShowTooltip` fixtures (Task 3)
- `apps/web/tests/visual/navigation.spec.ts` + `navigation.spec.ts-snapshots/*.png` (22 files) — screenshot-diff spec + baselines (Task 3)
- `apps/web/tests/visual/feedback.spec.ts` + `feedback.spec.ts-snapshots/*.png` (40 files) — screenshot-diff spec + baselines (Task 3)
- `apps/web/tests/integration/feedback-behaviour.spec.ts` — `@feedback-behaviour`-tagged Playwright integration spec (Task 3)

## Decisions Made

See `key-decisions` in the frontmatter for the four implementation-level decisions (accent-tone removal re-confirmed, the auto-open-with-correct-focus-capture trick, Tooltip's documented port-side gap, and the port-only single-sided baselines for two Rule 2 additions). All are documented in-file at their point of use as well.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] StepIndicator gallery tiles overlapped their neighbours at narrow-to-medium widths**

- **Found during:** Task 3, the German manual pass (real screenshot at 1080px, not assumed from CSS reading)
- **Issue:** `StepIndicator.css`'s `.vt-steps{inline-size:100%}` has no overflow control of its own (confirmed by reading the file directly — no `@media` rule anywhere in it). The gallery's shared `tileStyle` capped every tile at `maxInlineSize:320px`, narrower than a 4-step flow's natural content width; with nothing clipping the overflow, the step flow's trailing label text visually bled past its own tile box into the next tile over.
- **Fix:** Added a `wide` variant to the gallery's own `Tile` helper (`wideTileStyle`, `maxInlineSize:560px`) applied to all five StepIndicator tiles. This is presentational-only gallery scaffolding — no change to `StepIndicator.tsx`/`.css` themselves, which stay a faithful port.
- **Files modified:** `apps/web/app/[locale]/dev/components/navigation/NavigationGallery.tsx`
- **Verification:** Re-screenshotted `/de/dev/components/navigation` at 1080px — no more overlap, all five StepIndicator tiles render cleanly.
- **Committed in:** `59f98ee`

**2. [Rule 1 - Bug] The wider StepIndicator tiles then caused the whole page to scroll sideways at 390px**

- **Found during:** Task 3, immediately after fix #1, confirmed programmatically (`document.documentElement.scrollWidth > clientWidth`), not assumed
- **Issue:** A flex item's default `min-inline-size` is `auto`, which resolves to its own content's intrinsic minimum width. For a `white-space:nowrap`, no-wrap-point child like StepIndicator's step flow, that silently overrides any `maxInlineSize` set on the tile itself, forcing the row — and at 390px, the whole page — wider than the viewport. This is exactly the class of regression CLAUDE.md's "nothing may scroll sideways at 390px" rule exists to catch.
- **Fix:** Set `minInlineSize:0` explicitly on `wideTileStyle` (overriding the flex-item default) and wrapped the actual `<StepIndicator>` invocation in an inner `overflow-x:auto` + `data-lenis-prevent` div — the same contract Tabs' own overflow row already establishes — so an oversized step flow scrolls inside its own tile rather than expanding the page.
- **Files modified:** `apps/web/app/[locale]/dev/components/navigation/NavigationGallery.tsx`
- **Verification:** `document.documentElement.scrollWidth === clientWidth` confirmed at 390/768/1024/1440px in both `/en` and `/ar`, via a real headless-browser check, not just a visual screenshot.
- **Committed in:** `59f98ee`

**3. [Rule 1 - Bug] The Tabs "overflow" gallery demo never actually constrained its own row, so it never demonstrated overflow at all**

- **Found during:** Task 3, the same 390px horizontal-scroll investigation as #2 — a DOM audit (`getBoundingClientRect` overflow scan) found `.vt-tabs` itself rendering at 622px inside a 260px wrapper
- **Issue:** `.vt-tabs` is `display:inline-flex` (`Tabs.css`), which sizes to its own content regardless of an ancestor's declared width — an inline-level box does not stretch to fill a narrower parent on its own. The gallery's overflow-demo tile wrapped a plain (non-`block`) `Tabs` in a `inlineSize:260px` div expecting that to constrain it; it didn't, so the row's own `overflow-x:auto` never had a smaller boundary to activate against, and the demo just rendered its full unclipped width.
- **Fix:** Added the `block` prop to that one `<Tabs>` instance, switching it to `.vt-tabs--block{inline-size:100%}`, which does fill the 260px wrapper and gives `overflow-x:auto` a real boundary to scroll against.
- **Files modified:** `apps/web/app/[locale]/dev/components/navigation/NavigationGallery.tsx`
- **Verification:** Re-confirmed no horizontal page scroll at 390/768/1024/1440px after the fix (same check as #2); visually confirmed the Tabs overflow tile now genuinely clips/scrolls rather than rendering full-width.
- **Committed in:** `59f98ee`

**4. [Rule 1 - Bug] Two visual-spec screenshot targets needed correction after real render inspection, not assumption**

- **Found during:** Task 3, first `pnpm test:visual` run for `feedback.spec.ts`
- **Issue:** Dialog's `.vt-dialog__scrim` is `position:fixed;inset:0` — a fixed-positioned child contributes no size to its parent's normal-flow box, so `#root` collapsed to 0×0 and Playwright reported it "not visible" for every Dialog test. Separately, Tooltip's `.vt-tip__bubble` is `position:absolute` and, in its default "top" placement, rendered above the harness page's own top edge (no margin above the mounted component) — clipped by the viewport itself, and even after switching to "bottom" placement, centred (`translateX(-50%)`) past the harness's zero-margin left edge.
- **Fix:** Every Dialog test screenshots `.vt-dialog__scrim` directly instead of `#root`. Tooltip's "shown" test uses `placement="bottom"`, adds `paddingInlineStart:160px` to the harness body before hovering, and screenshots the full page (`expect(page)`) rather than the element-scoped `#root` (which still wouldn't include the overflowing bubble even with room to grow, since absolute positioning never enlarges its containing block's own box).
- **Files modified:** `apps/web/tests/visual/feedback.spec.ts`
- **Verification:** All 40 feedback.spec.ts tests pass twice in a row from a clean snapshot directory; the `dialog-default` and `tooltip-shown` baselines were inspected directly this session and show the real, complete component (dialog panel with title/subtitle/scrollable body; tooltip bubble fully visible and legible), not a cropped fragment.
- **Committed in:** `59f98ee`

---

**Total deviations:** 4 auto-fixed, all Rule 1 bugs found and fixed by rendering the real thing and inspecting it directly (never assumed from reading CSS or from a first-pass screenshot that merely looked plausible). None expanded scope beyond what Task 3 already asked for — all four fixes are contained to gallery scaffolding or spec-file screenshot targeting, with zero changes to `StepIndicator.tsx`/`.css`, `Tabs.tsx`/`.css`, `Dialog.tsx`/`.css`, or `Tooltip.tsx`/`.css` themselves (all four stay the faithful ports Tasks 1–2 committed).

**Impact on plan:** No architectural changes. All four fixes make the plan's own verification genuinely correct rather than merely green, and the two flex/inline-sizing bugs (#2, #3) are exactly the class of "silent overflow" defect the German/Arabic manual pass exists to catch before it compounds across later phases' own galleries.

## German Pass

Run against real components at 1080px, via real Playwright screenshots inspected directly this session (not assumed):

- **`/de/dev/components/navigation`**: All five Tabs states render correctly with German-length labels (`Flughafentransfer`, `Stadtrundfahrt`, `Geschäftsreise`, `Sonderwunsch`) — the overflow tile scrolls horizontally rather than wrapping, confirmed after fix #3 above. All five StepIndicator tiles render without overlap after fixes #1–#2. SectionHeader's long-title tile wraps onto multiple lines without clipping.
- **`/de/dev/components/feedback`**: Alert/Toast tone tiles and their long-body fixtures wrap German-length copy correctly. The Dialog's own German-rendered copy (in this English-scaffold gallery, the component's own chrome — close button, etc.) shows no clipping. ProgressIndicator's label/value pairs stay legible.
- Both routes carry no real German product copy of their own (CLAUDE.md's review-scaffold exemption, same as the core/forms galleries) — the evidence here is the *components'* German-length fixture data, not translated gallery prose.

## Arabic Pass

Checked both routes at 1440, 1024, 768 and 390px, via real Playwright screenshots inspected directly this session:

- **Layout genuinely mirrors, not just text-alignment**: Tabs rows reverse (active tab moves to the trailing/right edge in the LTR-reading sense, i.e. the reading-direction start under RTL), StepIndicator's progression correctly runs right-to-left with "done" checkmarks at the reading-direction start, and SectionHeader's action-link chevron flips to point left (`[dir="rtl"] .vt-sh__link-icon{transform:scaleX(-1)}`, confirmed live, not just read from the CSS).
- **Feedback set**: Alert icons and Toast close/status icons sit on the mirrored (leading) side; Dialog's header close button mirrors to the top-left; nothing clips at any of the four viewports.
- **Nothing scrolls sideways at 390px**, in either language — confirmed programmatically (`scrollWidth === clientWidth`) at all four viewports for both routes, after fixes #2–#3 above; this was a real, failing check before those fixes (655px content in a 390px viewport), not a hypothetical risk.
- **`.vt-dir-keep` figures/codes**: not exercised in this plan's fixtures — none of the eight components render a CHF amount, a flight number, or a reference code.

## Known Stubs

- **Tooltip's "shown" state has no committed automated screenshot coverage on the port side.** It is React state toggled by a live `onMouseEnter`/`onFocus` handler (Tooltip.tsx), not a CSS pseudo-class and not a controllable prop — a deliberate Task 2 design decision, not an oversight. `mountPort` (the offline harness) serves fully static, non-hydrated markup with no attached event handlers, so a real Playwright `hover()`/`focus()` there has nothing to react to — the same class of gap 01-06-SUMMARY.md documents for Avatar's `onError` fallback. The bundle side (real client-hydrated React) **is** screenshot-tested (`tooltip-shown.png`, inspected directly this session, shows the bubble correctly visible), and the port side's real-world rendering fidelity for this state was separately confirmed via the dev gallery's `AutoShowTooltip` fixture (focus-triggered on mount, no interaction required) during this session's own German/Arabic passes. Recorded in `.planning/WINDOWS.md` (entry 5, kind `unrun-verify`) rather than silently left uncovered.
- **StepIndicator's error state and Tabs' per-tab-disabled state have no bundle-side screenshot baseline.** Both are Rule 2 additions the compiled `design-system/_ds_bundle.js` source has no shape for at all — confirmed by literally reproducing a real crash (`StepIndicator`'s bundle function passes an object where it expects a string, throwing "Objects are not valid as a React child") and a real silent no-op (`Tabs`' bundle function accepts an object item but has no `disabled` concept, rendering it as a normal enabled tab) before writing the single-sided, port-only test — the same treatment forms.spec.ts's Checkbox indeterminate/invalid states already established. Not a gap requiring further action; a bundle comparison for these two states was never meaningful.

## Issues Encountered

- **Two transient `opennextjs-cloudflare build` failures during this session's own verification**, both resolved by re-running the identical command immediately after with no code change — most likely caused by the concurrently-running sibling plans (01-11, 01-04, 01-12 all landed commits during this session's own window, confirmed via `git log`) also building/writing into shared `node_modules`/build-tooling state on the same working tree at the same time, the same class of flake 01-06-SUMMARY.md already documented for an identical reason. No impact on committed code — every final verification (`pnpm typecheck`, `pnpm lint:css`, `pnpm i18n:check`, `pnpm build`, `pnpm test:visual --grep @component`, `pnpm test:visual --grep @feedback-behaviour`, and the `opennextjs-cloudflare` build+preview+curl+screenshot cycle) passed cleanly on the tree this plan leaves behind.
- **`pnpm test:visual --grep @component` (the full, repo-wide run) shows 6 pre-existing failures in `tests/visual/data.spec.ts` and `tests/visual/transfer.spec.ts`** — both files belong to the concurrently-executing Plan 01-11 (data and transfer composites), not this plan's file scope (confirmed: `git status` showed both as untracked/actively being modified by another agent during this session, now resolved by 01-11's own commits `a9e5eb0`/`d21131f` landing after this plan's own verification ran). Not investigated or touched — out of scope per this plan's own `<files>` list and the sequential-executor's file-isolation boundary. This plan's own two spec files (`navigation.spec.ts`, `feedback.spec.ts`, 62 tests) and the behaviour spec (5 tests, `component-1440` only) all pass cleanly in isolation and as part of the full suite.

## User Setup Required

None — no external service configuration required by this plan.

## Next Phase Readiness

- All eight navigation and feedback components (`Alert`, `Dialog`, `ProgressIndicator`, `SectionHeader`, `StepIndicator`, `Tabs`, `Toast`, `Tooltip`) are ported, typed, statically styled, exported from their per-category barrels, and screenshot-baselined — later phases (Phase 5's booking funnel in particular) can compose against a real `Dialog` with real focus/scroll behaviour, not a placeholder.
- `Dialog`'s focus-trap/restore/scroll-lock machinery is proven end-to-end (both directions) and is the exact mechanism Phase 5's cancellation-confirmation and any future sheet/modal will depend on — not just implemented, but automatically regression-tested.
- The dev gallery pattern now covers four of six categories (`core`, `forms`, `navigation`, `feedback`); `transfer` and `data` are Plan 11's concurrent scope, landing separately.
- **Not blocked on anything.** The German/Arabic pass ran this session against the real ported components (not deferred), found and fixed three real layout defects before they could compound into later phases' own galleries, and the one open item (Tooltip's port-side screenshot gap) is recorded in `.planning/WINDOWS.md`, not blocking.

## Self-Check: PASSED

Verified directly this session:
- All 9 non-baseline files claimed above (`NavigationGallery.tsx`, `FeedbackGallery.tsx`, both `page.tsx` wrappers, `navigation.spec.ts`, `feedback.spec.ts`, `feedback-behaviour.spec.ts`) confirmed present on disk under their stated paths.
- `apps/web/tests/visual/navigation.spec.ts-snapshots/` contains 22 `.png` files; `apps/web/tests/visual/feedback.spec.ts-snapshots/` contains 40 `.png` files.
- All three task commit hashes (`c04881c`, `3bb7ae2`, `59f98ee`) confirmed present in `git log --oneline --all`.
- `pnpm typecheck`, `pnpm lint:css`, `pnpm i18n:check`, and `pnpm build` all pass on the final tree state.
- `pnpm exec playwright test tests/visual/navigation.spec.ts tests/visual/feedback.spec.ts` — 62 passed, twice in a row from a clean snapshot directory.
- `pnpm exec playwright test tests/integration/feedback-behaviour.spec.ts --project=component-1440` — 5 passed.
- `curl http://localhost:8787/dev/components/{navigation,feedback}` → 200 each; `curl .../ar/dev/components/{navigation,feedback} | grep 'dir="rtl"'` → match each; `document.documentElement.scrollWidth === clientWidth` confirmed at 390/768/1024/1440px in both `/en` and `/ar` for both routes.
- `.planning/WINDOWS.md` entry 5 confirmed recorded for the one open item.

No missing items.
