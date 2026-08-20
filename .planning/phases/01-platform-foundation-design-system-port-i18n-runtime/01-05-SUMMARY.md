---
phase: 01-platform-foundation-design-system-port-i18n-runtime
plan: 05
subsystem: infra
tags: [brand-assets, fonts, i18n, arabic, ofl-licence, nextjs-image, opennextjs-cloudflare]

# Dependency graph
requires:
  - phase: 01-01
    provides: "apps/web scaffold, the token-import chain in globals.css (laws.css last), and the Qurova/Poppins .ttf files already vendored as a build-blocking deviation"
provides:
  - "The full brand layer (icons, logos incl. two new D-06 white variants, patterns, photography, colours) served from apps/web/public/brand/ — the app's own origin"
  - "A self-hosted, OFL-licensed Arabic typeface (Noto Sans Arabic) behind a swappable --vt-font-arabic token, with the Google Fonts hotlink dependency fully removed from apps/web"
  - "ADR-013 recording that font's provenance and licence"
  - "--vt-orange (#D4632B) declared as a palette token with no product-UI usage (D-07)"
  - "A documented, evidence-based contract for next/image's real behaviour on this platform, including the one still-open dependency (wrangler.jsonc's IMAGES binding) Phase 5 needs"
affects: ["01-06", "01-07", "01-08", "01-09", "05"]

actuals:
  tokens: 53370
  tasks: 3
  commits: 3

tech-stack:
  added:
    - "Noto Sans Arabic v2.013 (OFL 1.1), self-hosted from github.com/notofonts/arabic's NotoSansArabic-v2.013 release"
  patterns:
    - "Direction-scoped CSS token swap ([dir=\"rtl\"] overriding --vt-font-display/--vt-font-body via a single --vt-font-arabic token) as the static-CSS equivalent of app/vamos-locale.js's chrome() runtime mechanism"
    - "Per-family OFL.txt scope notes when a fonts/ folder holds multiple typefaces with different copyright holders (established by ADR-009 for Qurova/Poppins, now also applied to Noto Sans Arabic's separate OFL-NotoSansArabic.txt)"

key-files:
  created:
    - "apps/web/public/brand/icons/*.svg (66 files)"
    - "apps/web/public/brand/logo/*.svg (10 files, incl. lockup-white.svg, mark-white.svg)"
    - "apps/web/public/brand/patterns/{checker-mark,checker-tile}.png"
    - "apps/web/public/brand/photography/{fleet-van-street.jpg,hero-arrivals.jpg}"
    - "apps/web/public/brand/fonts/NotoSansArabic-{Regular,Medium,SemiBold,Bold}.ttf, OFL-NotoSansArabic.txt"
    - "apps/web/public/brand/tokens/arabic.css"
    - "assets/logo/lockup-white.svg, assets/logo/mark-white.svg"
    - ".planning/ADR-013-arabic-webfont-licence.md"
  modified:
    - "design-system/tokens/colors.css, apps/web/public/brand/tokens/colors.css (--vt-orange)"
    - "apps/web/public/brand/fonts/OFL.txt (scope note updated to point at the new Noto file)"
    - "apps/web/app/globals.css (arabic.css import, laws.css still last)"
    - "apps/web/next.config.ts (image config + documented finding)"
    - "apps/web/app/[locale]/page.tsx (renders the tracer photograph at two sizes)"

key-decisions:
  - "Arabic face: Noto Sans Arabic (D-22's delegated choice), vendored directly from its own upstream GitHub release, never through a webfont service — matches what the mocks already render, so no Arabic screen changes appearance."
  - "Noto Sans Arabic's OFL text is a separate file (OFL-NotoSansArabic.txt), not merged into the existing OFL.txt, because the two licences have different copyright holders (Noto Project Authors vs. Poppins Project Authors)."
  - "hero-arrivals.jpg (a real, already git-tracked root-level photograph the mocks use for the home hero/about page) was vendored into public/brand/photography/ for Task 3's image-delivery proof, alongside fleet-van-street.jpg (the 'one supplied V-Class photograph' per design-system/readme.md, vendored in Task 1) — the plan's own Task 3 verify script names 'hero-arrivals.jpg' literally, and this file genuinely exists in the repo."
  - "Task 3's next.config.ts work stopped short of enabling real image optimisation: the missing piece is an `images: { binding: \"IMAGES\" }` entry in apps/web/wrangler.jsonc, a file this plan does not own (Plan 01-04 owns it in the same wave). Documented as a concrete, evidenced finding rather than silently added to a file outside this plan's declared scope."

requirements-completed: [PLAT-04, I18N-04]

coverage:
  - id: D1
    description: "Every icon, logo (incl. the two D-06 white variants), pattern and photograph the app renders is served from apps/web/public/brand/, the app's own origin"
    requirement: "PLAT-04"
    verification:
      - kind: integration
        ref: "node file-count check (fonts>=12, icons>=57, logo>=10); diff design-system/tokens/colors.css apps/web/public/brand/tokens/colors.css (byte-identical); all font url()s resolve on disk"
        status: pass
    human_judgment: false
  - id: D2
    description: "--vt-orange (#D4632B, the fourth guideline swatch) is declared as a palette token in the canonical source and referenced by no product-UI rule (D-07)"
    requirement: "PLAT-04"
    verification:
      - kind: integration
        ref: "grep -q -- '--vt-orange' apps/web/public/brand/tokens/colors.css && ! grep -rq -- 'var(--vt-orange)' apps/web/app apps/web/components"
        status: pass
    human_judgment: false
  - id: D3
    description: "Arabic is typeset from a self-hosted OFL face (Noto Sans Arabic); the Google Fonts hotlink dependency is fully removed from apps/web; a real browser load of /ar makes zero external requests"
    requirement: "I18N-04"
    verification:
      - kind: integration
        ref: "Playwright load of local preview's /ar with a request listener asserting zero non-localhost hosts (script run directly this session, see Deviations/Task 2 notes); dir=\"rtl\"/lang=\"ar\" confirmed; --vt-font-display computed value confirmed 'Noto Sans Arabic' first-choice; /en confirmed unaffected"
        status: pass
      - kind: other
        ref: "grep of git-tracked apps/web source for any fonts.googleapis.com/gstatic/unpkg/jsdelivr/cdnjs reference — none found"
        status: pass
    human_judgment: false
  - id: D4
    description: "ADR-013 records Noto Sans Arabic's licence position (family, exact upstream release, licence, subprocessor consequence removed), following ADR-009's precedent"
    requirement: "I18N-04"
    verification:
      - kind: other
        ref: ".planning/ADR-013-arabic-webfont-licence.md — provenance read directly from each font file's own name table via fontTools, matching the release asset's own published size (18,777,381 bytes)"
        status: pass
    human_judgment: false
  - id: D5
    description: "next/image's real behaviour on this platform is verified against a real file and documented as the contract Phase 5 builds against, including what does not yet work"
    requirement: "PLAT-04"
    verification:
      - kind: manual_procedural
        ref: "curl evidence in this SUMMARY's Task 3 section: HTTP 200 + image/jpeg content-type at every tested width, but width is NOT honoured (byte-identical to the untouched 1440x1024 source) and no Cache-Control header is set, without wrangler.jsonc's IMAGES binding"
        status: pass
      - kind: other
        ref: "Root cause and remaining step (wrangler.jsonc images.binding, owned by Plan 01-04) documented in next.config.ts and below — a human should confirm the cross-plan handoff lands before Phase 5 relies on this"
        status: unknown
    human_judgment: true
    rationale: "The delivery-mechanism proof is complete and machine-verified, but closing the finding requires a change to a file this plan does not own (wrangler.jsonc, Plan 01-04's scope) — a human/orchestrator decision, not something this plan can auto-resolve without risking a cross-plan file conflict."

duration: ~25min
completed: 2026-08-20
status: complete
---

# Phase 1 Plan 5: Brand Layer Vendoring, Self-Hosted Arabic Type & Image-Delivery Proof Summary

**Every icon, logo, pattern and photograph now serves from `apps/web/public/brand/`; Arabic
renders in a self-hosted, OFL-licensed Noto Sans Arabic with the Google Fonts hotlink fully
removed from the app; and `next/image`'s real behaviour on `@opennextjs/cloudflare` is proven
against a real file, with the one concrete gap (the missing `wrangler.jsonc` `IMAGES` binding)
written down as evidence, not glossed over.**

## Performance

- **Duration:** ~25 min (single session)
- **Completed:** 2026-08-20
- **Tasks:** 3 of 3 planned
- **Files modified:** ~95 (83 in Task 1, 9 in Task 2, 3 in Task 3)

## Accomplishments

- Vendored the vendored Lucide icon set (66 SVGs) and the complete brand logo set (10 SVGs,
  including the two D-06 white variants) into `apps/web/public/brand/icons/` and `.../logo/`,
  plus the checker patterns and the supplied V-Class photograph into `.../patterns/` and
  `.../photography/` — every visual asset the app renders now comes from its own origin (D-10).
- Closed D-06: vendored `Final-white.svg` → `assets/logo/lockup-white.svg` and `logo-White.svg`
  → `assets/logo/mark-white.svg` from the canonical guideline folder, verbatim (byte content
  unchanged, only renamed under the repo's convention). Spot-checked D-05's claim that the
  guideline and the vendored system already agree — the three brand hex values
  (`#FDC20B`/`#1E1F1F`/`#DEDEDE`) and the lockup/mark viewBoxes (`2490×527`, `1684×2071`) matched
  exactly. No drift found.
- Recorded D-07's fourth guideline swatch as `--vt-orange:#D4632B` in
  `design-system/tokens/colors.css` (the canonical palette file), with a comment that no surface
  may reference it until the designer assigns it a role, then re-copied that file verbatim into
  `apps/web/public/brand/tokens/` so the two stay byte-identical.
- Self-hosted **Noto Sans Arabic** (400/500/600/700, OFL 1.1) fetched directly from its own
  upstream release (`github.com/notofonts/arabic`, tag `NotoSansArabic-v2.013`, 18,777,381-byte
  zip verified against the GitHub Releases API's own recorded size) — never through a webfont
  service. Provenance for each vendored `.ttf` was read directly out of its own `name` table via
  `fontTools`, the same method ADR-009 used for Qurova/Poppins.
- Added `apps/web/public/brand/tokens/arabic.css`: a single swappable `--vt-font-arabic` token
  plus a `[dir="rtl"]`-scoped override of `--vt-font-display`/`--vt-font-body` — the static-CSS
  equivalent of `app/vamos-locale.js`'s `chrome()` function, which already performs this same
  swap at runtime. Imported into `globals.css` after `typography.css` (so the `[dir="rtl"]`
  override wins the cascade over `typography.css`'s `:root` default — both selectors share
  specificity, so source order decides) and before `laws.css`, which stays the final import.
- **Deleted the dependency, not just added an alternative.** A real Playwright load of a local
  preview's `/ar` — run directly this session, not assumed — recorded zero requests to any host
  but `localhost`, confirmed `dir="rtl"`/`lang="ar"` in the server-rendered HTML, and confirmed
  the computed `--vt-font-display` value resolves to `"Noto Sans Arabic","Qurova","Poppins",...`
  on `/ar` while staying `"Qurova","Poppins",...` (unaffected) on `/en`. A grep of the tracked
  `apps/web` source tree found zero references to `fonts.googleapis.com`, `fonts.gstatic.com`,
  or any other CDN host.
- Recorded the licence as `.planning/ADR-013-arabic-webfont-licence.md`, following ADR-009's
  precedent exactly: family, exact upstream release, what each font file's own name table
  declares, and the subprocessor-list consequence this removes (Google was never on ADR-010's
  list — this closes conflict C25, first registered in ADR-009, without requiring a new
  disclosure).
- **Proved `next/image`'s real behaviour on this platform against a real file**, rendering
  `hero-arrivals.jpg` (a real, already git-tracked root-level photograph the mocks use for the
  home hero and about-page images) at two explicit sizes on the tracer page, and inspecting the
  actual served responses rather than trusting a green HTTP-200 tick. See "Task 3: Image-delivery
  findings" below for the full evidence and what it means for Phase 5.

## Task Commits

1. **Task 1: Vendor the full brand layer into the app** - `7804b8d` (feat)
2. **Task 2: Self-host the Arabic typeface and delete the CDN dependency** - `f89b523` (feat)
3. **Task 3: Prove image handling on this platform before Phase 5 depends on it** - `ca33831` (feat)

No separate plan-metadata commit — this SUMMARY, `STATE.md`, `ROADMAP.md` and `REQUIREMENTS.md`
land in the final documentation commit this execution makes.

## Files Created/Modified

- `apps/web/public/brand/icons/*.svg` (66 files) — vendored Lucide set, CSS-mask ready (D-26)
- `apps/web/public/brand/logo/*.svg` (10 files) — complete brand logo set incl. the two D-06 white variants
- `apps/web/public/brand/patterns/{checker-mark,checker-tile}.png` — checker pattern source assets
- `apps/web/public/brand/photography/{fleet-van-street.jpg,hero-arrivals.jpg}` — supplied photography
- `assets/logo/{lockup-white,mark-white}.svg` — the two D-06 variants, vendored into the mock tree's own asset folder too
- `design-system/tokens/colors.css`, `apps/web/public/brand/tokens/colors.css` — `--vt-orange` added, re-synced byte-identical
- `apps/web/public/brand/fonts/NotoSansArabic-{Regular,Medium,SemiBold,Bold}.ttf` — self-hosted Arabic face
- `apps/web/public/brand/fonts/OFL-NotoSansArabic.txt` — Noto's OFL licence, vendored verbatim
- `apps/web/public/brand/fonts/OFL.txt` — scope note updated to point at the new Noto licence file
- `apps/web/public/brand/tokens/arabic.css` — `--vt-font-arabic` token + `[dir="rtl"]` override
- `apps/web/app/globals.css` — `arabic.css` import added after `typography.css`, `laws.css` still last
- `.planning/ADR-013-arabic-webfont-licence.md` — Arabic font licence record
- `apps/web/next.config.ts` — image configuration + documented Task 3 finding
- `apps/web/app/[locale]/page.tsx` — renders the tracer photograph at two sizes for Task 3's proof

## Decisions Made

- **Arabic face: Noto Sans Arabic** (D-22's delegated choice). Its low-contrast, even strokes
  pair with Poppins' geometric evenness far better than IBM Plex Sans Arabic's more calligraphic
  contrast, and it is the face the mocks already render — the decision changes only where the
  file is served from, not what any reviewed Arabic screen looks like.
- **A single shared `--vt-font-arabic` token for both display and body** in Arabic mode, matching
  what `app/vamos-locale.js`'s `chrome()` already does and answering RESEARCH's Open Question 2
  for Phase 1. A future display/body split is one new token, not a call-site rewrite.
- **Noto Sans Arabic's OFL text is a separate file** (`OFL-NotoSansArabic.txt`), not merged into
  the existing `OFL.txt`, because the two licences have different copyright holders (The Noto
  Project Authors vs. The Poppins Project Authors) — merging them would misstate which holder's
  grant covers which files.
- **`hero-arrivals.jpg` vendored for the Task 3 image-delivery proof**, alongside
  `fleet-van-street.jpg` (Task 1's "one supplied V-Class photograph" per
  `design-system/readme.md`). The plan's own Task 3 verify script names `hero-arrivals.jpg`
  literally as the test asset; it is a real, already git-tracked file (used by the mocks'
  home-hero background and the about page), not an invented one.
- **Task 3 stopped at the file-scope boundary**: the missing piece for real image optimisation
  is `apps/web/wrangler.jsonc`'s `images: { binding: "IMAGES" }` entry — a file this plan does
  not own (Plan 01-04 owns it, in the same wave). Rather than editing a file outside this plan's
  declared scope and risking a cross-plan merge conflict, the finding is documented in
  `next.config.ts`'s own comments and below, as the concrete next step.

## Task 3: Image-delivery findings (the contract Phase 5 builds against)

Configured `next.config.ts`'s `images.remotePatterns: []` (T-01-15: `/_next/image` can only ever
resolve a path under this origin's own `public/` tree, never proxy an arbitrary third-party URL)
and rendered `hero-arrivals.jpg` through `next/image` at two explicit sizes on the tracer page.
Built, previewed via a real local `opennextjs-cloudflare preview` Worker, and inspected the actual
HTTP responses rather than trusting a green build:

**What works:**
- `pnpm typecheck && pnpm build` succeeds; the route stays `●` SSG for all four locales.
- `next/image`'s own `srcset` generation correctly snapped the page's requested 320px/640px
  display sizes to the nearest `deviceSizes`/`imageSizes` breakpoints (384/640 for the 320px
  image, 640/1920 for the 640px image) — a raw `w=320` curl (a width not in the default arrays)
  is correctly rejected `400 Bad Request` by Next's own core validation, independent of
  Cloudflare. This is real, useful platform behaviour Phase 5 needs to know: pick display sizes
  from the configured arrays, or configure custom `deviceSizes`/`imageSizes`.
- Every tested `/_next/image` request (`w=384`, `w=640`, `w=1920`) returns `HTTP 200` with the
  correct `Content-Type: image/jpeg`.

**What does NOT work yet — the finding worth having:**
- The response body at every tested width is **byte-identical** to the untouched
  1440×1024/123,520-byte source file. **No resizing is happening at all.** A check that only
  asserts "200 + image content-type" (exactly what this plan's own automated `<verify>` block
  checks) would have reported success on a completely non-functional optimisation pipeline.
- **No `Cache-Control` header is set on any of these responses** — not even the "immutable or
  not" binary the OpenNext docs describe, which suggests this behaviour differs from what a
  correctly-configured binding would produce, not merely an unconfigured cache duration.
- **Root cause, confirmed against the OpenNext Cloudflare docs (`opennext.js.org/cloudflare/howtos/image`,
  fetched directly this session):** the Cloudflare-adapter's Next.js-compatible image
  optimisation API requires an `images: { binding: "IMAGES" }` entry in `wrangler.jsonc` to
  actually transform anything. The local preview run confirmed no `env.IMAGES` binding is
  registered (absent from the Worker's own printed bindings list) — without it, the adapter
  silently passes the original file through unresized rather than erroring, which is precisely
  the kind of false-positive RESEARCH Pitfall 5 warned this task to verify rather than assume.
- `apps/web/wrangler.jsonc` is Plan 01-04's declared file scope in the same wave (KV, R2, Queue,
  Hyperdrive, cron trigger). Adding the `images` binding line there was not done in this plan to
  avoid touching a file outside this plan's own declared scope; it is flagged here as the
  concrete, evidenced next step before Phase 5 relies on this mechanism for real.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's Task 3 verify script names a file (`hero-arrivals.jpg`) that does not exist under `assets/photography/`**
- **Found during:** Task 3, before writing any code
- **Issue:** The plan's automated `<verify>` block curls
  `/brand/photography/hero-arrivals.jpg`, but Task 1's "the one supplied photograph" (per
  `design-system/readme.md`) is `assets/photography/fleet-van-street.jpg`. `hero-arrivals.jpg`
  turned out to be a different, real, already git-tracked root-level file the mocks use directly
  for the home hero background and the about-page image — not missing, just not where the
  verify script implicitly assumed it would come from.
- **Fix:** Vendored `hero-arrivals.jpg` into `apps/web/public/brand/photography/` alongside
  `fleet-van-street.jpg`, so the plan's own verify script runs unmodified and literally, against
  a real file.
- **Files modified:** `apps/web/public/brand/photography/hero-arrivals.jpg`
- **Verification:** `curl .../hero-arrivals.jpg&w=640` returns `200` + `image/jpeg`, matching the
  plan's literal verify command.
- **Committed in:** `ca33831`

**2. [Rule 3 - Blocking issue] The plan's Task 3 automated `<verify>` grep for external font/CDN references matches Next.js's own build output, not source**
- **Found during:** Task 2 verification
- **Issue:** `grep -rIEq '.../(googleapis|gstatic|unpkg|jsdelivr|cdnjs)\.' apps/web` (Task 2's
  literal verify command) matches strings inside `apps/web/.next/` and `apps/web/.open-next/` —
  Next.js's own vendored `next/font/google` module source code (unused, never imported) and a
  code comment referencing `unpkg.com` in Next's own bundler internals. Both directories are
  gitignored build artifacts, not committed source.
- **Fix:** Re-ran the same grep scoped to `git ls-files apps/web` (tracked source only) instead
  of the whole working tree, confirming zero matches in what actually ships. Documented rather
  than silently patched, since the plan's literal verify command is a wording gap (unscoped
  grep against a working tree that legitimately contains gitignored build output), not a defect
  in the shipped code — the same class of gap 01-01-SUMMARY.md documented for its own `/xx/`
  trailing-slash verify wording.
- **Files modified:** none (verification-only)
- **Verification:** `git ls-files apps/web | xargs grep -IlE '...(googleapis|gstatic|...)\.'`
  returns no matches.
- **Committed in:** n/a (documented here, not a code change)

---

**Total deviations:** 2 (1 Rule 1 fix — vendoring a real file the verify script assumed existed
elsewhere; 1 documented verify-script scoping gap, same class as 01-01's trailing-slash note, not
a code defect). Neither expanded scope beyond what Tasks 2/3 already asked for.

**Impact on plan:** No architectural changes. Task 3's `wrangler.jsonc` IMAGES-binding gap is a
genuine, evidenced open item (see above) rather than a deviation this plan silently fixed or
hid — it is out of this plan's declared file scope by design (Plan 01-04 owns that file in the
same wave), so it is surfaced as a finding for the next plan/orchestrator pass to close, not
worked around.

## Issues Encountered

Two `wrangler dev`/`workerd` background processes were started and torn down across the Task 2
and Task 3 verification passes (each `opennextjs-cloudflare preview` invocation spawns its own
`workerd` child). Resolved with `pkill -9 -f "opennextjs-cloudflare preview"` / `wrangler` /
`workerd` before each fresh preview run and confirmed no lingering process before finishing. No
impact on committed code.

`fonttools` was not present in the environment's Python and was installed via `pip3 install
--user fonttools` to read each Arabic font file's own `name` table directly, matching ADR-009's
provenance method exactly rather than trusting the release filename. This is a one-time local
tooling install, not a project dependency — nothing in the repo or its build depends on
`fonttools`.

## User Setup Required

None — no external service configuration required by this plan. (The `wrangler.jsonc` `IMAGES`
binding noted above is a code change for a sibling plan to make, not an external account signup;
Cloudflare Images pricing/billing questions only become relevant once that binding is actually
declared and deployed against a real zone.)

## Next Phase Readiness

- The full brand layer (tokens, fonts, icons, logos, patterns, photography) is served from
  `apps/web/public/brand/` — Plans 06-09 (component port) can reference any of it without a
  further vendoring pass.
- `--vt-font-arabic` and the `[dir="rtl"]` override are in place — any future component that
  reads `--vt-font-display`/`--vt-font-body` gets the Arabic swap automatically; no call site
  needs to special-case Arabic.
- `.planning/ADR-013-arabic-webfont-licence.md` gives the eventual designer's Arabic-face pick a
  single value to change, with the licence position already on record.
- **Blocked on a sibling plan, not the owner:** Phase 5's photography work should not assume
  working `next/image` optimisation until `apps/web/wrangler.jsonc` gains an
  `images: { binding: "IMAGES" }` entry (Plan 01-04's file scope) — see "Task 3: Image-delivery
  findings" above for the full evidence trail. Nothing else in this phase depends on that binding
  landing to proceed.
- RESEARCH's backstop verification item (D-22/UI-SPEC: only a human eye settles whether Noto
  Sans Arabic's optical weight sits comfortably beside Poppins at body size) is still open —
  flagged for the phase's human-verify checkpoint pass, not resolved here.

## Self-Check: PASSED

Verified directly this session:
- `apps/web/public/brand/{icons,logo,patterns,photography,fonts,tokens/arabic.css}` — all present
  on disk with the expected file counts (icons 66, logo 10, fonts incl. 4 Arabic weights).
- `assets/logo/{lockup-white,mark-white}.svg` — present.
- `.planning/ADR-013-arabic-webfont-licence.md` — present, non-empty, mentions OFL.
- All three task commit hashes (`7804b8d`, `f89b523`, `ca33831`) confirmed present in
  `git log --oneline --all`.
- `pnpm typecheck` and `pnpm --filter web run build` both pass on the final tree state.
No missing items.
