---
phase: 01-platform-foundation-design-system-port-i18n-runtime
plan: 09
subsystem: ui
tags: [design-system, react, typescript, nextjs, css-extraction, playwright, screenshot-diff, i18n, rtl, forms]

# Dependency graph
requires:
  - phase: 01-03
    provides: "The stylelint law gates, the i18n key-coverage gate, and the offline mock-harness.ts/playwright.config.ts screenshot-diff rig with button.spec.ts as the reference spec shape"
  - phase: 01-06
    provides: "The dev-gallery route split (thin Server Component page.tsx + client Gallery.tsx), the core.spec.ts mountPort-vs-mountBundle spec shape, and the /brand/... asset remap in mock-harness.ts every icon-bearing component needs"
  - phase: 01-07
    provides: "The next-intl locale runtime and dictionary-key-coverage gate this plan's props-driven copy rule assumes"
provides:
  - "All eight form controls (Input, Textarea, Select, Checkbox, Radio, Switch, Counter, DatePicker) in components/forms/, each typed, statically styled, with the states their Component State Matrix row marks"
  - "The forms-category states gallery (app/[locale]/dev/components/forms/{page.tsx,FormsGallery.tsx}) — every control, every static state, a long-label fixture and a partially-filled field group"
  - "tests/visual/forms.spec.ts + 84 committed screenshot baselines, proving mountPort-vs-mountBundle generalizes to components that import a sibling category's barrel and to components with an infinite loading-spinner animation"
  - "Two generalizable fixes to the shared offline harness (mock-harness.ts): a directory/index.ts import fallback, and an infinite-animation filter in the fonts/animations settle wait"
  - "A real, confirmed-live RTL fix in DatePicker (bidi-reordered date value) and two confirmed-live RTL fixes in Switch/DatePicker's nav chevrons carried over from Task 2"
affects: ["01-10", "01-11", "01-12", "01-13", "01-14"]

actuals:
  tokens: 29048
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A component that imports a sibling category's barrel (components/forms/Checkbox.tsx importing { Icon } from '../core') needs mock-harness.ts's resolveLocal to resolve a bare directory specifier to its index.ts — the file-only lookup core.spec.ts never needed (its own eight components never import across category boundaries) had no such fallback until this plan added one; every later cross-category import inherits the fix."
    - "A Rule 2 loading-state addition with a genuinely infinite CSS animation (`animation: … infinite`, Select's and now DatePicker's spinners) breaks waitForMockReady's own animation-settle wait, since an animation with `iterations: Infinity` never resolves its `.finished` promise by Web Animations API spec — fixed by filtering infinite-iteration animations out of the wait rather than racing a timeout; toHaveScreenshot's own `animations: 'disabled'` already freezes the frozen frame correctly."
    - "A bundle-vs-port screenshot diff is only a valid test when both sides recognize the prop under test. For a Rule 2 addition the compiled bundle has no parameter for at all (Checkbox's indeterminate/invalid, Counter's disabled/error, Select's loading, DatePicker's disabled/error/loading), the prop lands silently in the bundle's own `...rest` spread and the bundle renders as if it were never passed — a same-name bundle-vs-port test on these doesn't compare two states of the same thing. These are single-sided, port-only baselines instead, same treatment Checkbox's indeterminate/invalid already established, generalized to every other Rule 2 addition in this batch once one genuinely flaky/failing case (DatePicker's error state silently diffing against the bundle's fallback hint render) made the pattern's failure mode visible."
    - "Input/Textarea/Select's focused-border treatment is React state (a useState toggled by onFocus/onBlur), not a native :focus-visible pseudo-class — mountPort's fully static, non-hydrated markup can never trigger it via a real `locator.focus()`. Verified correct in the actually-hydrated app instead (both a real mouse click and a real keyboard Tab against the live opennextjs-cloudflare preview server), and the CSS rule's own visual outcome is still screenshot-tested in mountPort by adding the class directly via `page.evaluate()` — same 'test what's actually testable, document what isn't' split 01-06-SUMMARY.md established for Avatar's onError fallback."
    - "A CSS pair of chevrons pointing outward from a centered label (DatePicker's month nav) is mirror-symmetric by construction: flex's own logical-axis reversal under dir=rtl already swaps the buttons' physical positions, so mirroring the glyphs too (`[dir=\"rtl\"] .vt-dp__nav{transform:scaleX(-1)}`) produces a result that looks pixel-identical to the LTR arrangement — confirmed live by opening the real calendar panel under /ar/. That visual non-difference is the correct outcome, not a sign the fix did nothing; without it both chevrons point inward instead of outward."
    - "Switch's knob position animates via `inset-inline-start` transition (3px → 23px), not `transform: translateX()` — the direction-aware equivalent, confirmed live: off-state knob sits at the RTL physical right, on-state knob slides to the RTL physical left, the mirror image of the LTR case."

key-files:
  created:
    - "apps/web/components/forms/{Checkbox,Radio,Switch,Counter,DatePicker}.{tsx,css}"
    - "apps/web/app/[locale]/dev/components/forms/{page.tsx,FormsGallery.tsx}"
    - "apps/web/tests/visual/forms.spec.ts + forms.spec.ts-snapshots/*.png (84 files)"
  modified:
    - "apps/web/components/forms/index.ts (barrel now exports all eight form controls)"
    - "apps/web/tests/support/mock-harness.ts (directory-import fallback, infinite-animation filter)"
    - "apps/web/components/forms/DatePicker.tsx (Arabic-pass RTL bidi fix, applied after Task 2's commit)"

key-decisions:
  - "Checkbox's indeterminate is set imperatively via a ref effect (`inputRef.current.indeterminate = indeterminate`), since React exposes no JSX prop for the DOM-only `indeterminate` property; the visual state (both the accent fill and the minus glyph) is driven by the `indeterminate` prop directly, matching the same non-native-state pattern the source's own `checked` prop already uses for the checkmark glyph."
  - "Counter's aria-labels for its +/- buttons (`decrementLabel`/`incrementLabel`) are explicit caller-supplied props with no built-in English fallback — the source hardcodes an English sentence ('Fewer ' + label); I18N-01 treats that as a violation regardless of whether the resulting string happens to be grammatical, so the fix is 'no default,' not 'a better default.'"
  - "DatePicker's weekday header (`dowLabels`) and value placeholder are caller-supplied with no default English literal either, for the same reason — the source hardcodes `['Mo','Tu','We','Th','Fr','Sa','Su']` and `'Pick a date'`."
  - "Only Select and DatePicker get a loading state, per the plan's own must_have and the UI-SPEC's E3 fidelity-contract text — even though the Component State Matrix's own DatePicker row marks its Loading column '—'. Treated the matrix cell as the stale value and the two explicit statements (plan must_have + E3 prose) as authoritative, rather than omitting the state and leaving the plan's own must_have unmet."
  - "Every Rule 2 addition whose prop the compiled bundle doesn't recognize at all gets a single-sided, port-only screenshot baseline, not a bundle-vs-port diff — see tech-stack.patterns above for why a same-prop diff on these is not a meaningful comparison."

patterns-established:
  - "See tech-stack.patterns above — the directory-import fallback and infinite-animation filter apply to every later port batch that imports across components/{core,forms,navigation,feedback,transfer,data}/ or adds another loading-spinner state."

requirements-completed: [PLAT-04, I18N-01, I18N-04]

coverage:
  - id: D1
    description: "All eight form controls render as React components emitting the mock/bundle's own class names, with statically imported CSS, typed prop interfaces, and no runtime style-injection or ring-on-text-field references"
    requirement: "PLAT-04"
    verification:
      - kind: integration
        ref: "pnpm typecheck && pnpm lint:css && pnpm i18n:check && pnpm build all pass; grep confirms zero injectStyles/_ds_bundle references and zero box-shadow:var(--vt-ring) on text-field CSS under apps/web/components/forms/"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every static state each control's Component State Matrix row marks is built, reachable by using the component, and screenshot-diffed against the vendored bundle (or, for Rule 2 additions the bundle doesn't recognize, a single-sided port-only baseline)"
    requirement: "PLAT-04"
    verification:
      - kind: automated_ui
        ref: "apps/web/tests/visual/forms.spec.ts — 84 passed (42 states x 2 reduced viewports), twice in a row from a clean snapshot directory; 155 passed combined with button.spec.ts + core.spec.ts, no regressions from the shared harness fixes"
        status: pass
    human_judgment: false
  - id: D3
    description: "The dev gallery renders all eight form controls with every marked state, a long-label fixture, and a partially-filled field group, in all four languages, mirroring correctly under Arabic"
    requirement: "PLAT-04"
    verification:
      - kind: integration
        ref: "curl http://localhost:8787/dev/components/forms -> 200; curl .../ar/dev/components/forms | grep dir=\"rtl\" -> match"
        status: pass
      - kind: manual_procedural
        ref: "Playwright screenshots at 1440/1024/768/390px in en/de/ar against the real opennextjs-cloudflare preview server, inspected directly this session — see German/Arabic Pass sections below; a real RTL bug (DatePicker's bidi-reordered date value) was found and fixed, then re-verified live"
        status: pass
    human_judgment: true
    rationale: "The Fidelity Contract's own verification split (01-VALIDATION.md) marks 'does the mirrored result read correctly' as manual-only — a screenshot inspected by the executor, not a pixel-diff assertion, is the evidence for this specific dimension."
  - id: D4
    description: "Every placeholder, label, hint, and assistive-technology label the eight controls render resolves through caller-supplied props with no hardcoded English default — including the ones the compiled bundle source hardcodes (Counter's aria-labels, DatePicker's weekday abbreviations and empty-value placeholder)"
    requirement: "I18N-01"
    verification:
      - kind: unit
        ref: "pnpm i18n:check passes (1467 keys, 0 non-literal skipped); code review of Checkbox/Radio/Switch/Counter/DatePicker.tsx confirms no component synthesizes an English string internally"
        status: pass
    human_judgment: false
  - id: D5
    description: "Directional affordances mirror under RTL (DatePicker's nav chevrons, Switch's knob) and figures/dates do not (Counter's value, DatePicker's selected value and time badge)"
    requirement: "I18N-04"
    verification:
      - kind: manual_procedural
        ref: "Live verification against the real preview server: DatePicker's open calendar panel screenshotted under /ar/ (chevrons point outward correctly), Switch's on/off knob screenshotted under /ar/ (travels the mirrored direction), DatePicker's selected value cropped and inspected at 1440/1024/768/390px after the bidi fix ('14 August 2026', not 'August 2026 14')"
        status: pass
    human_judgment: true
    rationale: "RTL mirroring correctness is a visual-reading judgment call, not a pixel-diff assertion, per the same Fidelity Contract split D3 cites."

duration: ~3h (across two sessions, interrupted by an API session limit)
completed: 2026-08-21
status: complete
---

# Phase 1 Plan 9: Form Controls Port — Input, Textarea, Select, Checkbox, Radio, Switch, Counter, DatePicker, Dev Gallery Summary

**All eight form controls ported with the text-field focus exception and error-over-hint fallback intact, a dev-only states gallery proven correct in German and Arabic against the real preview server (one live RTL bug found and fixed), and 84 committed screenshot baselines that exposed and fixed two generalizable gaps in the shared test harness.**

## Performance

- **Duration:** ~3h across two sessions (Task 1 ran in a prior session that hit an API session limit; this session resumed from Task 2)
- **Completed:** 2026-08-21
- **Tasks:** 3 of 3 planned
- **Files modified:** ~100 (10 in Task 1, 11 in Task 2, ~90 in Task 3 including 84 baseline PNGs, plus one post-Task-2 fix to DatePicker.tsx found during Task 3's own Arabic pass)

## Accomplishments

- Ported `Input`, `Textarea`, `Select` (Task 1, prior session) — the text-entry trio sharing the Law 01 focus exception (`.vt-input--focus{box-shadow:none}`) and the error-over-hint fallback ordering. Select gained a Rule 2 loading state (spinning chevron) the source doesn't have.
- Ported `Checkbox`, `Radio`, `Switch`, `Counter`, `DatePicker` — the choice and value controls. Checkbox gained Rule 2 indeterminate (set imperatively via ref, since React has no JSX prop for the DOM-only property) and invalid states. Counter gained a whole-control disabled prop and an error state (the source only has per-button clamp-driven disabling, no whole-control concept). DatePicker gained disabled/error/loading, and every English literal the source hardcodes (weekday abbreviations, `'Pick a date'`, `'Previous/Next month'`) became a caller-supplied prop with no built-in fallback.
- Fixed a real RTL bug in Switch (Task 2): the source's `transform:translateX(20px)` knob animation always slides physically rightward regardless of writing direction; replaced with an `inset-inline-start` transition between the same two pixel values so the knob travels correctly under `dir="rtl"` — confirmed live this session (off-knob at the RTL physical right, on-knob at the RTL physical left).
- Fixed the calendar nav chevrons in DatePicker (Task 2) to mirror under RTL via a `[dir="rtl"] .vt-dp__nav{transform:scaleX(-1)}` rule, since the flex row's own automatic position-swap under RTL doesn't reorient the mask-image glyphs themselves. Confirmed live this session by actually opening the calendar panel under `/ar/` — the reasoning that this looks pixel-identical to the LTR arrangement (chevrons pointing outward from a centered label are mirror-symmetric by construction) is documented as the *correct* outcome, not a sign the fix is inert.
- Built the forms-category states gallery (`app/[locale]/dev/components/forms/{page.tsx,FormsGallery.tsx}`): every one of the eight controls, every static state its matrix row marks, a long-label fixture per control, and a partially-filled field group proving no control reflows when its neighbours are empty. Interaction-only states (hover/press/focus, and DatePicker's internal `open` panel state) are proven in the spec file instead of the gallery, matching the split Plan 06's `CoreGallery.tsx` already established.
- Wrote `tests/visual/forms.spec.ts`: 42 test cases (84 baselines across the two reduced viewports the Fidelity Contract allows, since none of the eight extracted stylesheets carry a viewport breakpoint rule). In the process, found and fixed two real, generalizable gaps in the shared `mock-harness.ts`:
  1. `resolveLocal` had no fallback for a bare directory import (`"../core"`, used by Checkbox/Counter/DatePicker to reach the core barrel) — core.spec.ts's own eight components never needed this since none of them import across category boundaries. Added an `index.ts`/`index.tsx` fallback.
  2. `waitForMockReady`'s animation-settle wait hung the full 30s test timeout against Select's and DatePicker's genuinely infinite loading-spinner animations — an `iterations: Infinity` animation's `.finished` promise never resolves per the Web Animations API spec. Fixed by filtering infinite-iteration animations out of the wait rather than racing an arbitrary timeout; `toHaveScreenshot`'s own `animations: 'disabled'` already freezes the correct rest frame.
- Found, mid-Task-3, that several Rule 2 additions (Checkbox's indeterminate/invalid, Counter's disabled/error, Select's loading, DatePicker's disabled/error/loading) were written as bundle-vs-port diffs even though the compiled bundle source has no parameter for any of them at all — a prop the bundle doesn't recognize lands silently in its own `...rest` spread rather than toggling any visual state, so a same-name diff test doesn't compare two states of the same thing. Confirmed empirically: DatePicker's "error" test was non-deterministically comparing the bundle's fallback *hint* render against the port's real error-over-hint fallback. Converted all six to single-sided, port-only baselines, the same treatment Checkbox's indeterminate/invalid already used correctly from the start.
- Ran the German and Arabic manual passes against the real `opennextjs-cloudflare preview` server (not just the offline harness), at 1440/1024/768/390px. Found and fixed one real RTL bug during the Arabic pass: DatePicker's selected date value (`"14 August 2026"`) was bidi-reordered to `"August 2026 14"` under `dir="rtl"` because only the time badge, not the value itself, was wrapped in `.vt-dir-keep` — the day number, a weak-directionality run with no strong RTL anchor, drifted to the end of the phrase. Fixed by wrapping the value (not the placeholder, which is ordinary translated prose) in `.vt-dir-keep`, rebuilt, and re-verified live at all four viewports.
- Verified the single most important must_have of this plan — the text-field focus exception — end to end against real hydration: a real keyboard `Tab` into a live Input shows `border-color: rgb(30, 31, 31)` (`--vt-charcoal-900`) and `box-shadow: none`, exactly as intended. Also found and documented a minor, non-regression, verbatim-inherited-from-source quirk: if the mouse remains hovering over a field immediately after a click (before moving away), `:hover`'s higher CSS specificity for `border-color` visually shows grey instead of charcoal for that one property — but `box-shadow: none` (the actual Law 01 requirement) is unaffected, since only the focus rule declares that property. Not fixed — it's the original design system's own cascade behavior, not something this port introduced, and no platform law is violated.

## Task Commits

Each task was committed atomically:

1. **Task 1: Port the field trio — Input, Textarea, Select** - `2542a21` (feat) — completed in a prior session
2. **Task 2: Port the choice and value controls — Checkbox, Radio, Switch, Counter, DatePicker** - `fc5c717` (feat)
3. **Task 3: Forms gallery section, baselines, and the German and Arabic passes** - `f427664` (feat)

**Plan metadata:** completed as part of this summary's own commit

## Files Created/Modified

- `apps/web/components/forms/Input.{tsx,css}` — text field, focus exception, error-over-hint (Task 1)
- `apps/web/components/forms/Textarea.{tsx,css}` — same shape as Input (Task 1)
- `apps/web/components/forms/Select.{tsx,css}` — same shape plus Rule 2 loading (Task 1)
- `apps/web/components/forms/Checkbox.{tsx,css}` — checked/indeterminate/invalid/disabled
- `apps/web/components/forms/Radio.{tsx,css}` — checked/disabled, no error slot of its own
- `apps/web/components/forms/Switch.{tsx,css}` — on/off/disabled, RTL knob-direction fix
- `apps/web/components/forms/Counter.{tsx,css}` — value clamp, whole-control disabled/error
- `apps/web/components/forms/DatePicker.{tsx,css}` — field/calendar/time-slots, disabled/error/loading, RTL chevron mirror, RTL date-value bidi fix
- `apps/web/components/forms/index.ts` — barrel exporting all eight controls
- `apps/web/app/[locale]/dev/components/forms/page.tsx` — thin Server Component locale wrapper
- `apps/web/app/[locale]/dev/components/forms/FormsGallery.tsx` — the states gallery, client component
- `apps/web/tests/visual/forms.spec.ts` — 42 test cases, 84 committed baselines
- `apps/web/tests/support/mock-harness.ts` — directory-import fallback, infinite-animation filter (shared infrastructure fix)

## Decisions Made

See `key-decisions` in frontmatter above for the full list. Summarized:

- Checkbox's `indeterminate` is set imperatively via a ref effect, not a JSX prop (React has none for this DOM-only property).
- Counter's button aria-labels and DatePicker's weekday/placeholder strings are caller-supplied with no built-in English fallback, even though the compiled source hardcodes English for all of them — I18N-01 treats a hardcoded fallback as a violation regardless of how reasonable the English happens to read.
- DatePicker gets a loading state despite the Component State Matrix's own row marking that column "—", because the plan's own must_have and the UI-SPEC's E3 fidelity-contract prose both explicitly require it — treated the matrix cell as the stale value.
- Every Rule 2 addition the compiled bundle doesn't recognize at all (six states across four components) is a single-sided, port-only screenshot baseline, not a bundle-vs-port diff, since the bundle silently ignores an unrecognized prop rather than rendering a comparable "off" state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Switch's knob animation doesn't mirror under RTL**
- **Found during:** Task 2
- **Issue:** The compiled source animates the knob with `transform:translateX(20px)`, a fixed physical translate that always moves rightward regardless of writing direction.
- **Fix:** Replaced with an `inset-inline-start` transition between the same two pixel values (3px → 23px) — direction-aware, same travel distance.
- **Files modified:** `apps/web/components/forms/Switch.css`
- **Verification:** Confirmed live against the real preview server this session — off-knob sits at the RTL physical right, on-knob at the RTL physical left.
- **Committed in:** `fc5c717` (Task 2 commit)

**2. [Rule 1 - Bug] DatePicker's calendar nav chevrons don't mirror under RTL**
- **Found during:** Task 2
- **Issue:** Neither the compiled source nor `tokens/laws.css` mirrors the prev/next month glyphs; a mask-image icon doesn't reorient itself when its flex position swaps under `dir="rtl"`.
- **Fix:** Added `[dir="rtl"] .vt-dp__nav{transform:scaleX(-1)}` to both nav buttons.
- **Files modified:** `apps/web/components/forms/DatePicker.css`
- **Verification:** Confirmed live this session by opening the real calendar panel under `/ar/dev/components/forms` — chevrons point outward correctly (the pixel-identical-to-LTR result is the mathematically correct outcome for a mirror-symmetric outward-pointing pair, not a sign the fix is inert).
- **Committed in:** `fc5c717` (Task 2 commit)

**3. [Rule 1 - Bug] DatePicker's selected date value bidi-reorders under RTL**
- **Found during:** Task 3's Arabic manual pass
- **Issue:** `"14 August 2026"` rendered as `"August 2026 14"` under `dir="rtl"` — the day number, a weak-directionality run with no strong RTL character to anchor it, drifted to the end of the phrase inside the ambient RTL paragraph context. Only the time badge (`.vt-dp__time`), not the value itself, was wrapped in `.vt-dir-keep`.
- **Fix:** Wrapped `value` (not `placeholder`, which is ordinary translated prose) in a `.vt-dir-keep` span.
- **Files modified:** `apps/web/components/forms/DatePicker.tsx`
- **Verification:** Rebuilt and re-verified live against the real preview server at 1440/1024/768/390px — `"14 August 2026"` renders in correct order at every viewport.
- **Committed in:** `f427664` (Task 3 commit)

**4. [Rule 3 - Blocking] mock-harness.ts couldn't resolve a directory/barrel import**
- **Found during:** Task 3 (first `pnpm exec playwright test` run against `forms.spec.ts`)
- **Issue:** `resolveLocal`'s file-only lookup had no fallback for a bare directory specifier — `import { Icon } from "../core"` (used by Checkbox/Counter/DatePicker) threw `cannot resolve local import "../core"`, since `core` is a directory (resolves to `core/index.ts`), not a file. core.spec.ts's own eight components never needed this — none of them import across category boundaries.
- **Fix:** Added an `index.ts`/`index.tsx` fallback to `resolveLocal` when the bare specifier resolves to a directory.
- **Files modified:** `apps/web/tests/support/mock-harness.ts`
- **Verification:** `pnpm exec playwright test tests/visual/forms.spec.ts --grep @component` passes; full suite (button+core+forms) still passes with no regressions.
- **Committed in:** `f427664` (Task 3 commit)

**5. [Rule 3 - Blocking] mock-harness.ts's animation-settle wait hangs on infinite spinners**
- **Found during:** Task 3 (same run — 4 tests timed out at 30s)
- **Issue:** `waitForMockReady`'s `Promise.all(document.getAnimations().map(a => a.finished))` waits for every registered Web Animation to reach its "finished" play state — but a genuinely infinite CSS animation (`animation: … infinite`, Select's and DatePicker's Rule 2 loading spinners) never reaches that state by Web Animations API spec, so `.finished` never resolves.
- **Fix:** Filter out animations whose `effect.getTiming().iterations === Infinity` before the wait; `toHaveScreenshot`'s own `animations: 'disabled'` already freezes them correctly at capture time regardless.
- **Files modified:** `apps/web/tests/support/mock-harness.ts`
- **Verification:** Same run as above — all 84 forms.spec.ts tests pass in ~20s once the fix landed.
- **Committed in:** `f427664` (Task 3 commit)

**6. [Rule 1 - Bug] Six Rule 2 additions were written as invalid bundle-vs-port diffs**
- **Found during:** Task 3 (a full-suite run surfaced 4 flaky/failing DatePicker tests after the two harness fixes above)
- **Issue:** Checkbox's indeterminate/invalid, Counter's disabled/error, Select's loading, and DatePicker's disabled/error/loading tests all called `mountBundle` with a prop the compiled bundle source doesn't recognize at all — the prop lands in the bundle's own `...rest` spread as an invisible DOM attribute, so the bundle renders as if the prop were never passed. Confirmed the actual failure mode: DatePicker's "error" test was comparing the bundle's silently-rendered *hint* against the port's real error-over-hint fallback, a `~3%` pixel diff that also flip-flopped depending on which of the two `--update-snapshots` calls happened to write the baseline last (same-name double-capture quirk, also documented in the spec file's own comments).
- **Fix:** Converted all six to single-sided, port-only baselines (no `mountBundle` call), matching the pattern Checkbox's indeterminate/invalid already used correctly.
- **Files modified:** `apps/web/tests/visual/forms.spec.ts`
- **Verification:** Regenerated all 84 baselines from a clean snapshot directory; ran twice in a row with zero failures; ran the full suite (button+core+forms) twice with zero failures.
- **Committed in:** `f427664` (Task 3 commit)

---

**Total deviations:** 6 auto-fixed (3 Rule 1 bug fixes — two carried forward from Task 2's own commit message, one found live during the Arabic pass; 2 Rule 3 blocking fixes to shared test infrastructure; 1 Rule 1 fix to the test suite's own methodology)
**Impact on plan:** All six were necessary for correctness (three are real I18N-04 RTL bugs a customer would have seen) or for the test suite to actually run/mean anything. No scope creep — all fixes are scoped to files this plan already owned or to the shared harness every port batch depends on.

## Known Stubs

None. Every control renders real, working states through real props — no hardcoded empty values, no placeholder-text-as-data.

## Issues Encountered

- The task was resumed mid-execution after a prior session hit an API session limit partway through (after Task 1's commit). No rework was needed — Task 1's commit (`2542a21`) was verified against the plan's intent before continuing from Task 2.
- Multiple stray `wrangler dev`/`workerd` processes from earlier `opennextjs-cloudflare preview` invocations in this session weren't fully released between restarts, causing port 8787 to stay bound and one `curl` call to hang. Resolved by explicitly enumerating and killing every matching PID before starting a fresh preview server — not a code issue, a local-environment process-management artifact of this execution session.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All eight form controls are ready for Plan 10 (navigation) and Plan 11 (feedback/transfer/data) to compose against, and for Phase 4's booking widget to consume directly.
- Counter's capacity-clamp `min`/`max` props and error copy are ready for Phase 4 to wire against real vehicle-class data — this plan intentionally didn't invent the clamp values themselves.
- One documented, intentional gap: DatePicker's internal `open` calendar-panel state has no automated screenshot coverage (React-state-only, no controlled prop, so neither the static gallery nor the static `mountPort` harness can exercise it) — verified live against the real preview server this session (chevron mirroring, panel contents) but not covered by a committed, repeatable test. Recorded in `.planning/WINDOWS.md` as an unrun-verify follow-up, same treatment 01-06-SUMMARY.md gave Avatar's `onError` fallback.
- No blockers for the next wave.

---
*Phase: 01-platform-foundation-design-system-port-i18n-runtime*
*Completed: 2026-08-21*

## Self-Check: PASSED

All created files verified present on disk; all three task commits (`2542a21`, `fc5c717`, `f427664`) verified present in git history.
