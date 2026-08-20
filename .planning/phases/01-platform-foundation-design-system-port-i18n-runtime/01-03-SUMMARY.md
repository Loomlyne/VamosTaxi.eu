---
phase: 01-platform-foundation-design-system-port-i18n-runtime
plan: 03
subsystem: testing
tags: [stylelint, playwright, screenshot-diff, i18n, ci-gates, css-logical-properties]

# Dependency graph
requires:
  - phase: 01-01
    provides: "apps/web workspace scripts (lint:css, i18n:check, test:visual) already wired as no-op placeholders, and the tracer's ported Button.tsx/Button.css as the first real file each gate runs against"
provides:
  - "apps/web/.stylelintrc.json + .stylelintignore: the D-21/D-32 CSS law and logical-property gates, blocking, scoped to apps/web/app + apps/web/components"
  - "scripts/check-i18n-coverage.mjs: the D-17 build-time cross-locale key coverage, usage, and I18N-06 parameterisation gate — an in-repo script per RESEARCH's Don't Hand-Roll table, not a young npm package"
  - "apps/web/tests/support/mock-harness.ts: serveMock/mountPort/mountBundle — the offline (no unpkg egress) comparison rig every future component-port spec (Plans 06-09) reuses"
  - "apps/web/playwright.config.ts + apps/web/tests/visual/button.spec.ts: the four fixed-viewport screenshot-diff project set and the first proof-of-harness spec, with committed baselines"
affects: ["01-06", "01-07", "01-08", "01-09", "01-10", "01-14"]

actuals:
  tokens: 12000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "stylelint's own regex-string convention (/pattern/ or /pattern/i inside a plain-JSON value) is how a strict-JSON .stylelintrc encodes a regex — no JS config file needed for the two law rules"
    - "app/support.js's window.__resources hook is the swap point for CDN-free mock rendering — inject it before the mock's own <script src=./support.js"> runs, never patch the mock file on disk"
    - "mountPort transpiles a single .tsx file at test time via the TypeScript compiler API (ts.transpileModule, classic JSX) and executes it in a sandboxed Function, exactly the same class of technique app/support.js's own x-import mechanism already uses for the mock tree — no bundler, no new dependency"
    - "waitForMockReady (mock-harness.ts): fonts ready -> #vt-boot-cover detached -> two passes of document.getAnimations().finished -> two rAF round-trips -> a short fixed floor. Every earlier layer alone still raced a genuinely blank Chromium headless screenshot during this plan's own execution; documented so the next spec author does not delete the 'redundant-looking' floor"

key-files:
  created:
    - "apps/web/.stylelintrc.json, apps/web/.stylelintignore"
    - "scripts/check-i18n-coverage.mjs"
    - "apps/web/playwright.config.ts"
    - "apps/web/tests/support/mock-harness.ts"
    - "apps/web/tests/vendor/{README.md,react.production.min.js,react-dom.production.min.js,babel.min.js}"
    - "apps/web/tests/visual/button.spec.ts + tests/visual/button.spec.ts-snapshots/*.png (21 committed baselines)"
  modified:
    - "apps/web/components/core/Button.css (height/width -> block-size/inline-size, the one edit stylelint-use-logical permits)"
    - "apps/web/package.json (lint:css now passes both .gitignore and .stylelintignore as --ignore-path)"
    - ".gitignore (re-includes apps/web/tests/vendor/ against the pre-existing generic vendor/ rule; adds test-results/, playwright-report/, blob-report/)"

key-decisions:
  - "declaration-property-value-disallowed-list is configured as ONE rule with two prop-pattern entries (box-shadow, and /.*/ for the banned token names) rather than 'two rules' — stylelint's config format only allows one entry per rule NAME, so this is the literal way to express D-32's two prohibitions in valid JSON."
  - "Banned token names (--vt-yellow-50/100/200/300/600/700, --vt-shadow-accent) are written as literal strings in .stylelintrc.json rather than derived at config-load time from laws.css — a plain-JSON config file has no import/require mechanism; verified by hand against laws.css's own alias block at authoring time instead."
  - "i18n:check's ADR-011/D-18 exclusions (pending-value-pill keys, non-translatable product names, the I18N-06 opt-out reason) are read from a reserved $meta object in en.json, not hardcoded in the script — the migration in Plan 10 populates $meta, the script does not need editing when it does."
  - "The usage check (I18N-01) only scans apps/web/{app,components,lib} once at least one locale file exists on disk — otherwise pointing --messages-dir at an empty scratch directory (the required 'zero keys is a pass' case) would flag the tracer's own already-correct real call sites as failures."
  - "mountPort renders server-side via react-dom/server + the already-installed TypeScript compiler API, not a bundler or the Next dev server — avoids adding esbuild (or any package) as a new dependency (package installs are excluded from Rule 3 auto-fix and would need a human checkpoint) and avoids the cross-platform screenshot-baseline problem a Next-dev-server round trip would not solve anyway."
  - "button.spec.ts's real-mock comparison (serveMock vs mountPort) is scoped to the primary/ghost variants and the 1440 viewport only; the state matrix (default/hover/press/focus/disabled) diffs the port against mountBundle instead, at both 1440 and 390 — documented in-file as a deliberate scoping of 'the first spec, proof the harness works,' not full 5-variant/4-viewport coverage, which lands with Plans 06-09's own port batches."

patterns-established:
  - "Every future *.spec.ts under tests/visual should call mock-harness.ts's waitForMockReady(page) before any toHaveScreenshot() against a served page — it is the one place the mount-animation/paint-race fix lives."
  - "A generated mountPort/mountBundle page is served from the SAME harness HTTP server as serveMock, at /__generated__/<hash>, keyed by a hash of (path/name + props) — this is why calling mountPort/mountBundle twice with identical arguments is cheap and returns the same URL rather than re-rendering."

requirements-completed: []
requirements-partial:
  - id: I18N-01
    reason: "The build-time gate (cross-locale key coverage + usage check) now exists and blocks a PR on a missing/orphaned key, but the requirement itself ('every visible string renders in EN/DE/FR/AR') is about actual content coverage, which the dictionary migration (Plan 10) still has to deliver — the tracer's 3 seeded keys are not the platform's real string set."
  - id: I18N-06
    reason: "The parameterisation gate exists and blocks a PR on an unmarked bare-digit English message, but no real content with this class of bug exists yet to have been fixed by this plan — same Plan 10 dependency as I18N-01."

coverage:
  - id: D1
    description: "A physical inline-direction property (margin-left, height, width, ...) in apps/web app/component CSS fails pnpm lint:css; a coloured box-shadow or a banned --vt-yellow-*/--vt-shadow-accent reference fails it too; public/brand (the vendored token source) is excluded with a documented reason"
    requirement: "I18N-04"
    verification:
      - kind: integration
        ref: "pnpm lint:css (clean pass); planted apps/web/components/core/__gate.css with margin-left:4px makes it exit non-zero, file removed after; planted physical-property lines in Button.css's own port (height/width) were found and fixed, not silenced"
        status: pass
    human_judgment: false
  - id: D2
    description: "scripts/check-i18n-coverage.mjs enforces cross-locale key coverage, literal-key usage resolution, and I18N-06 parameterisation, all naming their requirement in failure output; passes on zero keys; skips (not silently ignores) a non-literal t() call argument"
    requirement: "I18N-01, I18N-06"
    verification:
      - kind: integration
        ref: "pnpm i18n:check (clean pass, 3/3/3 counts); deleting HomePage from de.json makes it fail naming the key, file restored after; --messages-dir against an empty scratch dir exits 0; a synthetic t(dynamicKey) call is reported as skipped, not dropped"
        status: pass
    human_judgment: false
  - id: D3
    description: "apps/web/tests/support/mock-harness.ts serves a real .dc.html mock CDN-free (CookieBanner.dc.html), the React port (mountPort), and the vendored-bundle render (mountBundle) from one offline HTTP server; playwright.config.ts declares the four fixed viewports, animations disabled, and the (explicitly provisional) 1% tolerance; button.spec.ts diffs primary/ghost across default/hover/press/focus/disabled with 21 committed baselines, and every test asserts zero non-localhost requests were made"
    requirement: "PLAT-04"
    verification:
      - kind: integration
        ref: "pnpm test:visual --grep @component: 21 passed, 23 skipped (reduced-viewport/off-project rows), twice in a row from a clean snapshot dir; a network-guard sanity check (temporarily breaking the vendor map) confirmed the localhost-only assertion actually fails on a real unpkg.com request"
        status: pass
    human_judgment: false

duration: ~50min
completed: 2026-08-20
status: complete
---

# Phase 1 Plan 3: Stylelint Law Gates, i18n Coverage Gate & Offline Screenshot-Diff Harness Summary

**Three blocking CI gates — a stylelint config banning physical properties and tinted-yellow/glow
tokens, an in-repo i18n key-coverage/parameterisation script, and an offline Playwright
screenshot-diff rig with its first passing component spec — so every port plan in Waves 3-6 has a
real `<automated>` command instead of an assertion of intent.**

## Performance

- **Duration:** ~50 min (single session)
- **Completed:** 2026-08-20
- **Tasks:** 3 of 3 planned
- **Files modified:** 36 (4 in Task 1, 1 in Task 2, 29 in Task 3, plus 2 shared config files)

## Accomplishments

- Built `apps/web/.stylelintrc.json` + `.stylelintignore`: `stylelint-use-logical` at error
  severity (D-21/I18N-04) and a single `declaration-property-value-disallowed-list` rule carrying
  two prop-pattern entries — `box-shadow` (bans hex/rgb/hsl/color() values and the literal
  `--vt-shadow-accent` token) and a catch-all `/.*/ ` entry (bans `--vt-yellow-50/100/200/300`
  and `--vt-yellow-600/700` anywhere) — both messages pointing at the law they enforce and at
  CLAUDE.md. `public/brand` (the design system's own vendored, byte-for-byte token source,
  which has to *name* every banned token in order to alias it away) is excluded with a comment
  explaining why, not silently.
- Found and fixed a real blocking bug in the process: `apps/web/package.json`'s `lint:css` script
  (written by the tracer, Plan 01) passed `--ignore-path .gitignore` — which, per stylelint's own
  ignore-path resolution, *replaces* the default `.stylelintignore` lookup rather than adding to
  it, making the newly-written `.stylelintignore` file completely inert. Fixed by passing both
  ignore paths explicitly.
- Ran the new gate against the tree Plan 01 left and found 4 real physical-property violations in
  the ported `Button.css` itself (`height`/`width` on the size and block variants) — converted to
  `block-size`/`inline-size`, the one edit `stylelint-use-logical` permits during CSS extraction,
  never a disable comment.
- Wrote `scripts/check-i18n-coverage.mjs`, the D-17 build-time replacement for
  `VamosLocale.coverage()` (which has no server-side equivalent): cross-locale key coverage
  against `en.json` as the authority, a two-pass static-analysis usage check resolving literal
  `useTranslations()/getTranslations()` + `t()` call sites to dotted keys (a non-literal key
  argument is reported, not silently skipped), and an I18N-06 parameterisation check flagging any
  English message with a bare digit and no ICU placeholder. ADR-011 (pending-value-pill copy
  stays English) and D-18 (product names excluded from all three checks) are honoured via a
  reserved `$meta` block the script reads from `en.json` — nothing hardcoded, so the script and
  Plan 10's actual migration can never drift apart. RESEARCH's package audit rates the equivalent
  npm package (`@lingual/i18n-check`) SUS; this is the honest in-repo-script exception its own
  Don't Hand-Roll table names.
- Built the offline screenshot-diff rig (D-25 as amended): vendored `react.production.min.js`,
  `react-dom.production.min.js` and `babel.min.js` at the exact versions `app/support.js` pins by
  SRI (hashes verified locally to match byte-for-byte), with provenance recorded in
  `apps/web/tests/vendor/README.md`. `apps/web/tests/support/mock-harness.ts` serves three kinds
  of page from one local, network-free HTTP server: `serveMock` (a real `.dc.html` mock, CDN
  script tags rewritten *on read* via `app/support.js`'s own `window.__resources` hook — the mock
  file on disk is never touched), `mountPort` (the React port, statically rendered server-side
  with the TypeScript compiler API + `react-dom/server` — no bundler, no new dependency), and
  `mountBundle` (a component rendered directly from `design-system/_ds_bundle.js` for the six
  components no mock references — `StatTile`, `Tooltip`, `DatePicker`, `SectionHeader`,
  `VehicleCard`, `ProgressIndicator`, named explicitly in the harness).
- `apps/web/playwright.config.ts` declares projects at all four fixed viewports (1440/1024/768/
  390), `animations: 'disabled'`, and `maxDiffPixelRatio: 0.01` with an in-file comment recording
  it as UI-SPEC's own unconfirmed starting value, re-tuned in Plan 14.
- `apps/web/tests/visual/button.spec.ts` is the first spec and proof the harness works: a real
  `serveMock(CookieBanner.dc.html)`-vs-`mountPort` diff at the default state (the harder half of
  the rig — the whole mock tree, Babel-in-browser and all, rendered offline end to end), plus a
  `mountBundle`-vs-`mountPort` diff across the full default/hover/press/focus/disabled matrix for
  the primary and ghost variants, at both reduced viewports. Every test in the suite asserts zero
  non-localhost requests were made — verified to actually fail by temporarily breaking the vendor
  map and confirming the assertion catches a real `unpkg.com` request, then restoring it. 21
  baselines committed; the suite passes twice in a row from a clean snapshot directory.
- Found and fixed a real blocking bug: the pre-existing `.gitignore`'s generic `vendor/` rule
  (intended for other ecosystems' dependency-vendoring directories) was silently swallowing
  `apps/web/tests/vendor/` — this plan's own committed test fixture. Added an explicit
  re-include.

## Task Commits

1. **Task 1: The CSS law and logical-property gates** - `90cf9d6` (feat)
2. **Task 2: The i18n key-coverage and parameterisation gate** - `990d9a2` (feat)
3. **Task 3: The screenshot-diff harness with no network egress** - `f618739` (feat)

## Files Created/Modified

- `apps/web/.stylelintrc.json`, `apps/web/.stylelintignore` - the D-21/D-32 blocking lint gates
- `apps/web/package.json` - `lint:css` now honours both `.gitignore` and `.stylelintignore`
- `apps/web/components/core/Button.css` - `height`/`width` → `block-size`/`inline-size`
- `scripts/check-i18n-coverage.mjs` - the D-17 build-time i18n gate (coverage + usage + I18N-06)
- `apps/web/playwright.config.ts` - four-viewport screenshot-diff project config
- `apps/web/tests/support/mock-harness.ts` - `serveMock`/`mountPort`/`mountBundle`/`waitForMockReady`
- `apps/web/tests/vendor/{README.md,react.production.min.js,react-dom.production.min.js,babel.min.js}` - vendored, SRI-verified test-only runtime
- `apps/web/tests/visual/button.spec.ts` + `button.spec.ts-snapshots/*.png` (21 files) - first spec + committed baselines
- `.gitignore` - re-includes `apps/web/tests/vendor/`; adds Playwright's standard output-dir ignores

## Decisions Made

See `key-decisions` in the frontmatter for the six implementation-level decisions this plan made
(the single-rule two-entry stylelint structure, the `$meta`-driven i18n exclusions, the
TypeScript-compiler-API render path instead of a bundler, and the scoped variant/viewport
coverage of the first spec). All are contained to how this plan's own three files work; none
change what Plans 06-09's later specs need to do.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `lint:css`'s `--ignore-path .gitignore` made the new `.stylelintignore` inert**
- **Found during:** Task 1, first `pnpm lint:css` run against the newly-written config
- **Issue:** stylelint only falls back to the default `.stylelintignore` lookup when no
  `--ignore-path` flag is passed at all; since the tracer's `lint:css` script already passed
  `--ignore-path .gitignore`, the new `.stylelintignore` (excluding `public/brand`) was never
  read, and `pnpm lint:css` failed against `design-system/tokens/{base,colors}.css` — files this
  plan's own instructions say must be excluded, not fixed.
- **Fix:** `apps/web/package.json`'s `lint:css` script now passes `--ignore-path .gitignore
  --ignore-path .stylelintignore` (stylelint's `ignorePath` CLI flag is `isMultiple`, so both
  apply).
- **Files modified:** `apps/web/package.json`
- **Verification:** `pnpm lint:css` excludes `public/brand`, still catches a planted violation
  under `apps/web/components/`.
- **Committed in:** `90cf9d6`

**2. [Rule 1 - Bug] The ported `Button.css` itself carried 4 physical-property violations**
- **Found during:** Task 1, running the new gate against the tree Plan 01 left
- **Issue:** `.vt-btn--sm/md/lg` used `height`, `.vt-btn--block` used `width` — both physical,
  both banned by the newly-configured `stylelint-use-logical` rule.
- **Fix:** Converted to `block-size`/`inline-size` — behaviourally identical in this project's
  horizontal-only writing mode (block axis is always vertical, inline axis always horizontal
  regardless of `dir`), and the one edit the plan explicitly permits during CSS extraction.
- **Files modified:** `apps/web/components/core/Button.css`
- **Verification:** `pnpm lint:css` passes clean; `pnpm test:visual` (Task 3) later confirms the
  rendered Button pixel-matches the vendored bundle, so the substitution changed no visible
  layout.
- **Committed in:** `90cf9d6`

**3. [Rule 3 - Blocking issue] `.gitignore`'s generic `vendor/` rule swallowed `apps/web/tests/vendor/`**
- **Found during:** Task 3, staging the vendored React/ReactDOM/Babel files for commit
- **Issue:** `git status` showed the three vendored runtime files as absent even after `git add`;
  `git check-ignore -v` traced it to the pre-existing `.gitignore` line `vendor/` (line 33,
  clearly aimed at other ecosystems' dependency-vendoring directories, not this project's own
  test fixture) matching any directory named `vendor` at any depth.
- **Fix:** Added `!apps/web/tests/vendor/` and `!apps/web/tests/vendor/**` (gitignore requires
  both the directory and its contents re-included explicitly once a parent pattern excludes the
  directory itself) with a comment explaining the collision. Also added the standard Playwright
  `test-results/`/`playwright-report/`/`blob-report/` ignores in the same pass, since none
  existed and the plan's own verify loop was generating them.
- **Files modified:** `.gitignore`
- **Verification:** `git check-ignore -q apps/web/tests/vendor/react.production.min.js` now exits
  1 (not ignored); the three vendor files and `README.md` are tracked in the Task 3 commit.
- **Committed in:** `f618739`

**4. [Rule 1 - Bug] A genuinely blank screenshot despite fully-correct DOM/CSSOM state**
- **Found during:** Task 3, first real `serveMock`-vs-`mountPort` diff attempt
- **Issue:** The captured mock-side screenshot of the "Accept all" button was a uniform
  `#F6F6F6` (the page background) — not the button. Direct inspection showed the DOM/CSSOM state
  at the moment of capture was already fully correct (`opacity:1`, correct `background-color`,
  zero in-flight `document.getAnimations()`, `#vt-boot-cover` already detached) — this was a
  genuine Playwright-headless-Chromium paint-presentation race, not a logic bug in the harness or
  the mock. `app/vamos-page-transition.js`'s own comment ("rAF is suspended in a hidden document")
  independently documents this class of quirk in this exact stack.
- **Fix:** `waitForMockReady()` now layers: fonts ready → `#vt-boot-cover` detached → two passes
  of `document.getAnimations().finished` (50ms apart, to catch a late-registering entrance
  animation) → two `requestAnimationFrame` round-trips → a 250ms fixed floor. Each layer alone
  was insufficient during direct testing; the combination reproduced a clean capture twice in a
  row.
- **Files modified:** `apps/web/tests/support/mock-harness.ts`
- **Verification:** `pnpm test:visual --grep @component` passes twice in a row from a clean
  snapshot directory (no flake across repeated runs during this session).
- **Committed in:** `f618739`

---

**Total deviations:** 4 auto-fixed (2 Rule 3 blocking-issue fixes, 2 Rule 1 bug fixes). All were
necessary to make the plan's own verification commands genuinely pass against real tool/library
behavior; none expanded scope beyond what the three tasks already asked for.

**Impact on plan:** No architectural changes. All four fixes are contained to configuration
(`package.json`, `.gitignore`) or the CSS-extraction/harness files the plan already scoped —
nothing here changes what Plans 06-09 or 14 need to do.

## Issues Encountered

None beyond the four deviations above, all resolved within this plan's own scope.

## User Setup Required

None — no external service configuration required. Everything in this plan runs locally and
offline (that is the point of Task 3).

## Next Phase Readiness

`pnpm lint:css`, `pnpm i18n:check` and `pnpm test:visual` all run, all pass on the tree this plan
leaves behind, and all fail on a planted violation (verified individually and cleaned up). Plans
06-09 (the component port batches) now have a real `mock-harness.ts` to import
(`serveMock`/`mountPort`/`mountBundle`/`waitForMockReady`) and a real Playwright project set to
write their own `*.spec.ts` files against, following `button.spec.ts`'s pattern. Plan 10 (the
dictionary migration) now has a real gate that will catch a missing or unparameterised key the
moment real content lands, and a `$meta` convention (`pendingValueKeys`, `nonTranslatableKeys`,
`noParamKeys`) already defined for it to populate. Plan 14 (screenshot-diff tolerance re-tuning)
has an explicit in-file pointer in `playwright.config.ts` to revisit `maxDiffPixelRatio` once all
33 components have baselines.

**Not blocked on anything:** Waves 3-6 do not need the owner's input to start — the three gates
this plan builds are the only precondition `01-VALIDATION.md` names for them, and all three are
now real, not asserted.

## Self-Check: PASSED

All key created files confirmed present on disk (`apps/web/.stylelintrc.json`,
`apps/web/.stylelintignore`, `scripts/check-i18n-coverage.mjs`, `apps/web/playwright.config.ts`,
`apps/web/tests/support/mock-harness.ts`, `apps/web/tests/vendor/react.production.min.js`,
`apps/web/tests/vendor/react-dom.production.min.js`, `apps/web/tests/vendor/babel.min.js`,
`apps/web/tests/visual/button.spec.ts`) and all three task commit hashes (`90cf9d6`, `990d9a2`,
`f618739`) confirmed present in `git log --oneline --all`. No missing items.
