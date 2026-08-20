---
phase: 01-platform-foundation-design-system-port-i18n-runtime
plan: 06
subsystem: ui
tags: [design-system, react, typescript, nextjs, css-extraction, playwright, screenshot-diff, i18n, rtl]

# Dependency graph
requires:
  - phase: 01-01
    provides: "The pnpm monorepo, the [locale] SSR route tree, and the proven three-step CSS-extraction recipe on Button"
  - phase: 01-03
    provides: "The stylelint law gates, the i18n key-coverage gate, and the offline mock-harness.ts/playwright.config.ts screenshot-diff rig with button.spec.ts as the reference spec shape"
  - phase: 01-05
    provides: "The full vendored brand layer (icons, logos, patterns, photography) under apps/web/public/brand/, which every icon/logo/pattern-bearing component in this plan renders from"
provides:
  - "Eight more ported core primitives (Icon, Logo, CheckerMark, Avatar, Badge, Tag, Card, IconButton) alongside Button, all nine exported from components/core/index.ts"
  - "The dev-only states gallery (app/[locale]/dev/components/{page.tsx,core/*}) — the only place a not-yet-consumed component gets reviewed at all, D-28"
  - "tests/visual/core.spec.ts + 50 committed screenshot baselines, the second real spec file proving the Plan 03 harness generalizes past Button"
  - "A `/brand/...` path remap in mock-harness.ts every icon/logo/pattern-bearing component in Waves 4-6 will also need"
  - "The first German and Arabic manual passes against real ported components, with one real defect (Avatar's onError race) and one real RTL cosmetic bug (gallery prose bidi-reordering) found and fixed"
affects: ["01-07", "01-08", "01-09", "01-10", "01-11", "01-12", "01-13", "01-14"]

actuals:
  tokens: 15912
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Asset-base indirection (Icon/Logo/CheckerMark's --vt-icon-base/--vt-logo-base/--vt-pattern-base read) is inert in this port: these three never become client components, so the getComputedStyle branch never runs in the one SSR pass that produces the shipped HTML. FALLBACK_BASE is what actually ships, pointed at Plan 05's apps/web/public/brand/* rather than the mocks' page-relative paths."
    - "A component with a purely inline-style source (no `const CSS` literal, no injectStyles() call) still gets a statically-imported .css file — intentionally near-empty, documented in-file — to keep the CSS-delivery contract mechanically uniform across all 33 components, rather than special-casing the three that happen to have nothing to extract."
    - "A polymorphic `as` prop (Card) ports as a TypeScript generic default `'div'`, not a plain string prop, so a card rendered `as='button'`/`as='a'` keeps that element's own prop types (and, concretely, its native `disabled`/`href` typing)."
    - "A source's dynamically-typed element choice (Tag's `createElement(Tag_, ...)` where `Tag_` is 'button' or 'span') ports as an explicit if/branch on the same shape Button's own href/button branch already established, not as a TypeScript union-typed dynamic tag — the latter can't type-check a DOM attribute (`type`) that's only valid on one branch."
    - "A client-only piece of gallery content (Tag's onClick/onRemove demo tiles) is split into its own 'use client' component file, with the route's page.tsx staying a thin async Server Component that only resolves/validates the locale segment — Next's App Router refuses to pass a function prop from a Server Component into any DOM event handler, even when the receiving component isn't itself a client boundary."
    - "mountPort (tests/support/mock-harness.ts, Plan 03) renders fully static, non-hydrated markup — real for any CSS-pseudo-class state (hover/press/focus, which the browser applies regardless of hydration) but not for a 'use client' component's own React state (Avatar's onError fallback), which simply never runs there. That gap is a real test-methodology boundary, not a bug to route around by hydrating the harness."

key-files:
  created:
    - "apps/web/components/core/{Icon,Logo,CheckerMark,Avatar,Badge,Tag,Card,IconButton}.{tsx,css}"
    - "apps/web/app/[locale]/dev/components/page.tsx"
    - "apps/web/app/[locale]/dev/components/core/{page.tsx,CoreGallery.tsx}"
    - "apps/web/tests/visual/core.spec.ts + core.spec.ts-snapshots/*.png (50 files)"
  modified:
    - "apps/web/components/core/index.ts (barrel now exports all nine core primitives)"
    - "apps/web/tests/support/mock-harness.ts (/brand/... path remap)"

key-decisions:
  - "Card's `accent` tone and Badge's `warning` tone are dropped from their unions and CSS entirely (Law 02) — the plan pre-resolved Card's case explicitly; Badge's `warning` tone (--vt-yellow-100 background, --vt-yellow-700 text) gets the identical treatment for the identical reason, applied by this executor per the plan's own general instruction to test every tone against the same rule."
  - "IconButton ships with no Selected/pressed prop: the UI-SPEC's Component State Matrix cites the header's notification bell as the real-world example, but that bell is a bespoke [data-hd-bell] element in SiteHeader.dc.html, not built from IconButton at all — and the compiled IconButton source has no selected/pressed prop or CSS rule of its own. No prop or class was invented to fill the gap; documented in IconButton.tsx and the gallery instead."
  - "Avatar's image-load-failure fallback (loading/empty/error states resolving to the initials monogram, never a broken-image glyph) is a Rule 2 addition — the compiled source has no error handling on its `src ? <img> : ...` branch at all."
  - "The dev gallery route lives at apps/web/app/[locale]/dev/components/** (not the plan's literal apps/web/app/dev/components/** path) — required by the [locale]-segment routing Plan 01 already established; the literal path would 404 every request, including the /ar/... one the plan's own verify block checks."

patterns-established:
  - "See tech-stack.patterns above — the asset-base-indirection-is-inert and polymorphic-as-prop-as-generic patterns apply to every later batch that ports an Icon/Logo-consuming or polymorphic-element component."

requirements-completed: [PLAT-04]

coverage:
  - id: D1
    description: "Nine core primitives (Icon, Logo, CheckerMark, Avatar, Badge, Tag, Card, IconButton, Button) render as React components emitting the mock's own class names, with statically-imported CSS present in server-rendered HTML"
    requirement: "PLAT-04"
    verification:
      - kind: integration
        ref: "pnpm typecheck && pnpm lint:css && pnpm build all pass; grep confirms zero injectStyles/_ds_bundle references under apps/web/components/"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every state each primitive's Component State Matrix row marks is built and reachable by using the component (not by forcing a class), and screenshot-diffed against the vendored bundle"
    requirement: "PLAT-04"
    verification:
      - kind: automated_ui
        ref: "apps/web/tests/visual/core.spec.ts — 71 passed (50 new core baselines + 21 pre-existing Button baselines), twice in a row from a clean snapshot directory"
        status: pass
      - kind: manual_procedural
        ref: "Avatar's error-fallback and IconButton's absent Selected state are the two documented exceptions — see key-decisions and Known Stubs"
        status: pass
    human_judgment: false
  - id: D3
    description: "The dev gallery renders all nine core primitives with every marked state, in all four languages, mirroring correctly under Arabic"
    requirement: "PLAT-04"
    verification:
      - kind: integration
        ref: "curl http://localhost:8787/dev/components/core -> 200; curl http://localhost:8787/ar/dev/components/core | grep dir=\"rtl\" -> match; curl .../dev/components/forms -> 404 (not yet built, as designed)"
        status: pass
      - kind: manual_procedural
        ref: "Playwright screenshots at 1440/1080/390px in en/de/ar, inspected directly this session — see German/Arabic Pass sections below"
        status: pass
    human_judgment: true
    rationale: "The Fidelity Contract's own verification split (01-VALIDATION.md) marks 'does the mirrored result read correctly' as manual-only — a screenshot inspected by the executor, not a pixel-diff assertion, is the evidence for this specific dimension."

duration: ~70min
completed: 2026-08-20
status: complete
---

# Phase 1 Plan 6: Core Primitives Port — Icon, Logo, CheckerMark, Avatar, Badge, Tag, Card, IconButton, Dev Gallery Summary

**Eight more core primitives ported alongside Button (all nine now in `components/core/`), a dev-only states gallery at `/dev/components/core` proven correct in German and Arabic with real Playwright screenshots, and a second screenshot-diff spec (50 new baselines) proving Plan 03's offline harness generalizes past its first component.**

## Performance

- **Duration:** ~70 min (single session)
- **Completed:** 2026-08-20
- **Tasks:** 3 of 3 planned
- **Files modified:** ~75 (7 in Task 1, 11 in Task 2, ~56 in Task 3 including 50 baseline PNGs)

## Accomplishments

- Ported `Icon`, `Logo`, `CheckerMark` — the three asset-bearing primitives, and the first
  real finding of the batch: none of the three has a `const CSS` literal or an
  `injectStyles()` call in the compiled bundle source at all (confirmed by reading the
  source directly, not assumed from the plan's own recipe description). Every visual
  property is an inline style reading `name`/`size`/`color`/`height`/`style` props
  directly. Ported that exactly — no CSS to preserve verbatim — and gave each an
  intentionally near-empty, in-file-documented `.css` file anyway, to keep the "CSS
  arrives by static import only" contract mechanically uniform across all nine.
  `Icon`'s `name` prop is a closed union of the 66 vendored icon files, not `string`.
- Ported `Avatar`, `Badge`, `Tag`, `Card`, `IconButton` — the surface and label
  primitives. Dropped Badge's `warning` tone and Card's `accent` tone (both resolve to
  a banned pale/brown yellow surface, Law 02) from their unions and CSS entirely, the
  same treatment the plan pre-resolved for Card and this executor applied identically
  to Badge per the plan's own general instruction. Added a real fix Avatar's source
  didn't have: an `onError` + mount-effect fallback so a failed/empty image resolves to
  the initials monogram, never a broken-image glyph (Rule 2 — see Deviations for the
  bug this uncovered and fixed mid-plan).
- Built the dev-only states gallery (D-28): `app/[locale]/dev/components/page.tsx` (a
  six-category index, five of which 404 until their batch lands) and
  `.../dev/components/core/{page.tsx,CoreGallery.tsx}` — every one of the nine core
  primitives, every state its Component State Matrix row marks, reached by using the
  component (a disabled Tag, a selected Card, an Avatar whose image source 404s).
  `CoreGallery.tsx` is a client component (two Tag tiles need real `onClick`/`onRemove`
  handlers — see Deviations); the route's `page.tsx` stays a thin Server Component that
  only resolves the locale segment, so the route keeps its SSG eligibility.
- Wrote `tests/visual/core.spec.ts`: `mountPort`-vs-`mountBundle` screenshot diffs for
  all eight non-Button primitives (Button already has its own committed spec from
  Plan 03, not duplicated here), covering every static/prop-driven state plus real
  Playwright `hover()`/`mouse.down()`/`focus()` simulation for Card's selectable variant
  and IconButton's full interaction set. 50 new baselines committed; the suite passes
  twice in a row from a clean snapshot directory (71 passed, 73 skipped at the two
  non-reduced viewports, matching Button's own established pattern).
- Fixed a real, generalizable gap in the shared offline harness (`mock-harness.ts`,
  Plan 03): it had no way to resolve a `/brand/...` URL (the site-root-relative path
  Next's own `public/` serving produces, and the path every icon/logo/pattern-bearing
  component's `FALLBACK_BASE` now points at) — added a small remap to
  `apps/web/public/brand/...`, the real file location, so `mountPort` resolves assets
  identically to `next dev`/`next build`. Every icon-bearing component in Waves 4-6
  will need this same fix; it is done once, here.
- Ran the German and Arabic manual passes UI-SPEC flags as unresolved assumptions,
  early, against real components rather than at the end of the phase — see the
  dedicated sections below for what was actually observed, including two real defects
  found and fixed mid-pass.

## Task Commits

1. **Task 1: Port the asset-bearing primitives — Icon, Logo, CheckerMark** - `5367928` (feat)
2. **Task 2: Port the surface and label primitives — Avatar, Badge, Tag, Card, IconButton** - `5be1b69` (feat)
3. **Task 3: The dev gallery, the core screenshot baselines, and the first German and Arabic passes** - `c48c1be` (feat)

## Files Created/Modified

- `apps/web/components/core/{Icon,Logo,CheckerMark}.{tsx,css}` - asset-bearing primitives, no extractable CSS
- `apps/web/components/core/{Avatar,Badge,Tag,Card,IconButton}.{tsx,css}` - surface/label primitives
- `apps/web/components/core/index.ts` - barrel now exports all nine core primitives
- `apps/web/app/[locale]/dev/components/page.tsx` - six-category gallery index
- `apps/web/app/[locale]/dev/components/core/page.tsx` - thin Server Component route wrapper
- `apps/web/app/[locale]/dev/components/core/CoreGallery.tsx` - the actual gallery content (client component)
- `apps/web/tests/visual/core.spec.ts` + `core.spec.ts-snapshots/*.png` (50 files) - screenshot-diff spec + baselines
- `apps/web/tests/support/mock-harness.ts` - `/brand/...` path remap (shared infra fix)

## Decisions Made

See `key-decisions` in the frontmatter for the four implementation-level decisions this
plan made (Badge/Card tinted-tone drops, IconButton's undocumentable Selected state,
Avatar's Rule 2 fallback, and the `[locale]`-scoped gallery route path). All are
documented in-file at their point of use as well, so a later reader finds the reasoning
without needing this SUMMARY.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] The plan's literal gallery route path doesn't exist in this app's routing architecture**
- **Found during:** Task 3, before writing any route file
- **Issue:** The plan's `<files>` list names `apps/web/app/dev/components/page.tsx` and
  `.../dev/components/core/page.tsx` — outside the `[locale]` dynamic segment Plan 01
  already established as the only route tree in this app. A page at that literal path
  would only ever match `/dev/components/core` under Next's own routing rules; it could
  never match `/ar/dev/components/core`, which the plan's own Task 3 `<verify>` block
  literally curls and asserts `dir="rtl"` against.
- **Fix:** Created both gallery routes under `apps/web/app/[locale]/dev/components/**`
  instead, with `setRequestLocale(locale)` in each `page.tsx` per the established
  Pitfall 2 pattern (Plan 01).
- **Files modified:** `apps/web/app/[locale]/dev/components/page.tsx`, `.../dev/components/core/page.tsx`
- **Verification:** `curl http://localhost:8787/dev/components/core` → 200; `curl
  http://localhost:8787/ar/dev/components/core | grep 'dir="rtl"'` → match; `next
  build`'s route table shows both routes prerendered for all four locales.
- **Committed in:** `c48c1be`

**2. [Rule 3 - Blocking issue] Next.js refuses an event-handler prop crossing a Server Component boundary**
- **Found during:** Task 3, first `pnpm build`
- **Issue:** The gallery's Tag tiles need real `onClick`/`onRemove` functions to reach
  Tag's `clickable`/`disabled`/removable rendering (`Boolean(onClick)` drives the
  button-vs-span branch). The gallery page was an async Server Component; passing a
  function prop anywhere in that subtree fails the build with "Event handlers cannot be
  passed to Client Component props," even though `Tag` itself isn't a client boundary —
  Next requires *some* client owner to attach a real DOM listener.
- **Fix:** Split the gallery into a thin async Server Component (`page.tsx`, resolves
  the locale segment only) and a `'use client'` component (`CoreGallery.tsx`) that owns
  all the actual markup, including the two handler-bearing Tag tiles.
- **Files modified:** `apps/web/app/[locale]/dev/components/core/{page.tsx,CoreGallery.tsx}`
- **Verification:** `pnpm build` succeeds; the route still prerenders `●` (SSG) for all
  four locales (the split moved interactivity into the client bundle, not out of SSG).
- **Committed in:** `c48c1be`

**3. [Rule 1 - Bug] Avatar's onError fallback missed a same-origin 404 that resolves before hydration**
- **Found during:** Task 3, verifying the gallery's "error" Avatar tile against a real
  `opennextjs-cloudflare preview` server (not assumed — a direct DOM inspection after a
  2.5s wait showed the broken `<img>` still present)
- **Issue:** This is SSR'd markup: the browser starts loading the `<img>` the instant it
  parses the initial HTML, before React hydrates and attaches any listener. A
  same-origin 404 (the gallery's own fixture, and the realistic case of an expired photo
  URL) routinely fails *before* hydration completes, and the DOM `error` event on `<img>`
  does not bubble — so a purely `onError`-driven handler silently misses it. The Rule 2
  addition from Task 2 was therefore incomplete, not just untested.
- **Fix:** Added a mount-effect check (`el.complete && el.naturalWidth === 0`) alongside
  the existing `onError` handler — the standard two-pronged fix for this exact SSR race.
- **Files modified:** `apps/web/components/core/Avatar.tsx`
- **Verification:** Rebuilt, re-ran `opennextjs-cloudflare preview`, re-inspected the
  DOM directly: the error tile now renders `LE` (initials), never the broken `<img>`.
- **Committed in:** `c48c1be`

**4. [Rule 1 - Bug] The gallery's own English prose was bidi-reordered inside the RTL document**
- **Found during:** Task 3, the Arabic manual pass (screenshot inspection at 1440px)
- **Issue:** The gallery's intro paragraph and section headings/captions are
  deliberately plain English (CLAUDE.md's review-scaffold exemption) but render inside
  the page's real `dir="rtl"` (inherited from the shared `[locale]` layout). Without an
  explicit direction override, the browser's bidi algorithm reordered trailing
  punctuation in that English prose (a period visually jumping to the start of a
  sentence) — a real, observed rendering defect in the gallery's own scaffold text, not
  in any of the nine components under test.
- **Fix:** Added `dir="ltr"` scoped narrowly to the gallery's own English-only prose
  (`<h1>`, intro `<p>`, section `<h2>`s, tile captions) in both gallery files — never to
  the `<main>` or the component tiles themselves, which still inherit the page's real
  `dir="rtl"` so their own mirroring stays genuinely tested.
- **Files modified:** `apps/web/app/[locale]/dev/components/{page.tsx,core/CoreGallery.tsx}`
- **Verification:** Re-screenshotted `/ar/dev/components/core` at 1440px — the bidi
  reordering is gone; component tiles (Tag's remove icon, tile flow order) still mirror
  correctly.
- **Committed in:** `c48c1be`

**5. [Documented, not code] Verify-script wording gaps inherited from prior plans**
- Two of this plan's own literal `<verify>` commands trip on pre-existing files this
  plan doesn't own, the same class of gap 01-01-SUMMARY.md and 01-05-SUMMARY.md already
  documented for their own verify scripts:
  - `! grep -rE '_ds_bundle' apps/web/` matches `tests/support/mock-harness.ts` and
    `tests/visual/button.spec.ts` (Plan 03) — both intentionally reference the vendored
    bundle as a reference-only comparison target (D-30/D-25), not a shipped dependency.
    Scoped correctly, `grep -rE '_ds_bundle' apps/web/components/` returns no match.
  - `! grep -rEq 'loading' apps/web/components/core/Button.tsx` matches Plan 01's own
    comment *documenting the absence* of a `loading` prop ("There is no `loading` prop
    on the source Button"). `Button.tsx`'s `ButtonOwnProps` interface has no `loading`
    field.
- **Files modified:** none (verification-only; `Button.tsx` is not in this plan's file
  scope)

---

**Total deviations:** 4 auto-fixed (2 Rule 3 blocking-issue fixes, 2 Rule 1 bug fixes) +
1 documented verify-wording gap (no code change). All four fixes were necessary to make
the plan's own verification commands — and the actual product behaviour they check —
genuinely correct, not just green. None expanded scope beyond what the three tasks
already asked for.

**Impact on plan:** No architectural changes. The route-path and Server/Client-boundary
fixes are contained to files this plan already owns; the `mock-harness.ts` fix is a
small, additive, clearly-scoped extension every later icon-bearing batch will also rely
on.

## German Pass

Per the manual-check instruction, run against real components, not asserted from
CSS reading alone:

- **The gallery itself carries no real German product copy** — it stays English on
  purpose (CLAUDE.md's review-scaffold exemption), so `/de/dev/components/core` renders
  identical English text to `/en/...`. There is no real German string in this route to
  visually check for growth/clipping.
- **The one place in this plan's slice with real, translated German content is the home
  page's ported `Button`** (`apps/web/app/[locale]/page.tsx`, from Plan 01, translated
  by the concurrent Plan 07 dictionary migration): `t("HomePage.cta")` renders
  "TRANSFER BUCHEN" at `/de`. Screenshotted at 1080px directly this session: the pill
  grows to fit the content with no clipping or mid-word wrap, confirming Button's
  intrinsic-width contract holds for real (if, in this case, shorter-than-English)
  German content.
- **Badge/Tag/Card/IconButton were not independently proven against real German
  pixels** — no real German label exists for them in this plan's scope. Their extracted
  CSS was read directly and confirmed to use `white-space:nowrap` plus intrinsic
  padding with no fixed `width`/`inline-size` declaration anywhere in Badge.css,
  Tag.css, Card.css, or IconButton.css — structurally, these cannot clip at any string
  length, they can only grow. This is a structural argument, not a rendered-pixel
  observation; recorded honestly as the weaker form of evidence it is.

## Arabic Pass

Checked `/ar/dev/components/core` at 1440, 1024 (via 1080 substitute at the German
check), 768 and 390px, via real Playwright screenshots inspected directly this session
(not assumed from `dir="rtl"` being present):

- **Layout genuinely mirrors**, not just text-alignment: the whole gallery's tile flow
  reverses (Icon/Logo/Badge/etc. rows run right-to-left), section headings sit at the
  page's trailing edge, and — the one component in this batch with a directional
  affordance — Tag's remove (`×`) button sits on the correct mirrored side of its label.
- **Nothing clips at 390px** — every section wraps via `flex-wrap`, tiles stack cleanly,
  no horizontal scroll.
- **Found and fixed one real defect** (see Deviations #4): the gallery's own English
  scaffold prose was bidi-reordered by the ambient `dir="rtl"` before the fix. This
  is exactly the class of failure UI-SPEC's unresolved consideration warned about,
  caught here in the first batch as intended, not left to compound across 32 more
  components.
- **`.vt-dir-keep` figures/codes**: not exercised in this plan — none of the nine core
  primitives render a CHF amount, a flight number, or a reference code. The `CheckerMark`
  and `Icon` glyphs used in this gallery (a car icon, the checker pattern) are
  non-directional and unaffected by mirroring, as expected.

## Known Stubs

- **Avatar's error/loading states have no committed automated regression test.**
  `mountPort` (the offline harness) renders fully static, non-hydrated markup, so
  Avatar's client-only `onError`/mount-effect fallback (the Rule 2 addition, and the
  bug fix in Deviations #3) never executes there — there is nothing meaningful to
  screenshot-diff for those two states through this harness. The behaviour itself
  **was** verified directly against a real `next build` + `opennextjs-cloudflare
  preview` server this session (confirmed: a same-origin 404 image resolves to the
  initials fallback). Recorded in `.planning/WINDOWS.md` (kind: `unrun-verify`, entry
  id 1) rather than silently left uncovered.
- **IconButton's Selected state is not implemented.** The UI-SPEC's Component State
  Matrix marks it, but neither the compiled source (no selected/pressed prop or CSS)
  nor the real header mock (the notification bell is a bespoke `[data-hd-bell]`
  element, not built from IconButton) has anything to port. Documented in
  `IconButton.tsx` and shown as an explicit "not reachable from the component" note in
  the gallery rather than silently omitted.

## Issues Encountered

Two transient `opennextjs-cloudflare build` failures (`ENOENT .../pages/_app.js.nft.json`
and a bare `Command failed: pnpm build` with no further output) during verification,
both resolved by re-running the same command immediately after — most likely caused by
the concurrent sibling plans (01-07, 01-08) also building/writing into shared
`node_modules`/build-tooling state on the same working tree at the same time (confirmed
those plans' own commits landed interleaved with this plan's on `git log`). No impact on
committed code — every final verification (`pnpm typecheck`, `pnpm lint:css`, `pnpm
build`, `pnpm test:visual --grep @component`, and the `opennextjs-cloudflare`
build+preview+curl+screenshot cycle) passed cleanly on the tree this plan leaves behind.

## User Setup Required

None — no external service configuration required by this plan.

## Next Phase Readiness

- All nine core primitives (`Avatar`, `Badge`, `Button`, `Card`, `CheckerMark`, `Icon`,
  `IconButton`, `Logo`, `Tag`) are ported, typed, statically styled, and exported from
  `apps/web/components/core/index.ts` — Wave 4's forms/navigation/feedback/data/transfer
  batches can now compose against a real `Icon`, a real `Badge`, a real `Card`, etc.,
  not a placeholder.
- The dev gallery pattern (`app/[locale]/dev/components/{page.tsx,core/*}`) is
  established for the five remaining categories to copy directly — same index-links-all-
  six-from-the-start structure, same client/server split if a later category's demo
  content needs a real handler.
- `tests/support/mock-harness.ts`'s `/brand/...` remap is now in place for every future
  icon/logo/pattern-bearing component's spec to rely on without rediscovering the gap.
- **Not blocked on anything.** The German/Arabic pass ran early as the plan intended;
  no failure was severe enough to warrant redesigning the port recipe before Waves 4-6
  proceed. The one open item (Avatar's error-state test coverage) is recorded in
  `.planning/WINDOWS.md`, not blocking.

## Self-Check: PASSED

Verified directly this session:
- All 15 new component files (`Icon`, `Logo`, `CheckerMark`, `Avatar`, `Badge`, `Tag`,
  `Card`, `IconButton` × `.tsx`/`.css`) present on disk under
  `apps/web/components/core/`.
- `apps/web/app/[locale]/dev/components/page.tsx` and
  `.../dev/components/core/{page.tsx,CoreGallery.tsx}` present on disk.
- `apps/web/tests/visual/core.spec.ts` present, and
  `apps/web/tests/visual/core.spec.ts-snapshots/` contains 50 `.png` files.
- All three task commit hashes (`5367928`, `5be1b69`, `c48c1be`) confirmed present in
  `git log --oneline --all`.
- `pnpm typecheck`, `pnpm lint:css`, `pnpm build`, and `pnpm test:visual --grep
  @component` (71 passed, 73 skipped) all pass on the final tree state.
- `.planning/WINDOWS.md` entry id 1 confirmed recorded for the one open item.
No missing items.
