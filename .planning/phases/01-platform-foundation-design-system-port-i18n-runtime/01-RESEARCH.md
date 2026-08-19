# Phase 1: Platform Foundation, Design System Port & i18n Runtime - Research

**Researched:** 2026-08-20
**Domain:** Next.js 15 App Router on Cloudflare Workers (`@opennextjs/cloudflare`), SSR-safe i18n, design-system port
**Confidence:** MEDIUM-HIGH — the platform/deploy mechanics are well-documented and verified against current package registries; the design-system port scope required an in-repo audit that overturned a premise in `01-CONTEXT.md` (see Summary and the Component Port Scope Correction below).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Repository layout and toolchain**
- **D-01:** Full monorepo from day one — `apps/web` plus `packages/db` and `packages/emails`,
  so Phase 2's migrations and Phase 5's email templates land in packages that already exist.
  — **Reversibility:** costly — splitting later moves every import path and the CI build config.
- **D-02:** pnpm workspaces as the package manager and workspace tool.
  — **Reversibility:** reversible.
- **D-03:** The `.dc.html` mocks stay in `app/`, untouched, and remain the visual source of
  truth for every later phase. Production code never imports them; `archive/` is reserved for
  genuinely dead material.
  — **Reversibility:** reversible.
- **D-04:** Local development is `wrangler dev` plus `supabase start` against local Postgres,
  not against staging resources — Phase 2 is the first phase that genuinely needs a database,
  and local work must never mutate staging data once bookings exist.
  — **Reversibility:** reversible.

**Brand assets and the design system source**
- **D-05:** `/Users/koss/Desktop/Freelance/brand-guideline-vamos-taxi` is the canonical brand
  source, confirmed latest by the owner. Colours, type and logo geometry already match the
  vendored system; nothing has drifted.
  — **Reversibility:** reversible.
- **D-06:** Two white logo variants are vendored from the guideline folder:
  `LOGO/Final-white.svg` → `assets/logo/lockup-white.svg`, `LOGO/logo-White.svg` →
  `assets/logo/mark-white.svg`. No token, font or existing-logo changes.
  — **Reversibility:** reversible.
- **D-07:** `#D4632B` (fourth guideline swatch) is recorded as a token (`--vt-orange`) with
  **no product-UI usage** until the designer states its role.
  — **Reversibility:** reversible.
- **D-08:** The "Dm Sans Bold" specimen in the guideline PDF is a template leftover — not
  adopted.
  — **Reversibility:** reversible.
- **D-09:** The tagline stays "Ride with class" — set artwork, never changed.
  — **Reversibility:** reversible.
- **D-10:** Brand assets are copied verbatim into `apps/web/public/brand/` — tokens, fonts,
  icons, logos — with `tokens/laws.css` as the final import. Worker deploy stays
  self-contained; no cross-package resolution and no coupling to the mock tree's layout.
  — **Reversibility:** reversible.

**Locale routing and the i18n runtime**
- **D-11:** One dynamic `[lang]` segment with `generateStaticParams` for `en`/`de`/`fr`/`ar` —
  not four route groups.
  — **Reversibility:** one-way — the URL shape becomes the published contract for `hreflang`
  alternates, the Phase 11 redirect map, and any indexed link; changing it after launch needs a
  redirect migration.
- **D-12:** English lives at the root (`/`, `/about`); German, French and Arabic are prefixed
  (`/de/about`, `/ar/about`). A rewrite keeps `/en/…` from becoming duplicate content.
  — **Reversibility:** one-way — same published-URL contract as D-11.
- **D-13:** The dictionary becomes per-locale JSON (`en.json`, `de.json`, `fr.json`, `ar.json`)
  with dotted keys and parameterised messages — `t('quote.passengers', { n: 3 })`.
  — **Reversibility:** costly — undoing it rewrites every `t()` call site.
- **D-14:** `t()` reads through a loader interface. Phase 1's implementation is the JSON files;
  Phase 6 swaps in the `content_strings` table behind the same interface (I18N-07).
  — **Reversibility:** reversible.
- **D-15:** Booking-widget state lives in `sessionStorage`, mirroring the mocks'
  `localStorage.vamosTrip`. **Bound to ADR-001's stated Phase 1 acceptance test:** fill the
  booking widget partially, switch language, assert every field survives. If that test cannot
  be made to pass, ADR-001 says the URL-segment decision itself is wrong and language moves to
  a cookie.
  — **Reversibility:** reversible.
- **D-16:** Currency persists in `localStorage` only; the server always renders CHF and the
  mark is swapped on hydration. Accepted cost: a one-frame CHF flash for a non-CHF visitor.
  — **Reversibility:** reversible.
- **D-17:** Translation completeness is enforced two ways: a **build-time CI check** asserting
  every key in `en.json` exists in `de`/`fr`/`ar` and that no `t()` call references a missing
  key (fails the PR), **plus** a dev-mode runtime warning with English fallback in production.
  — **Reversibility:** reversible.
- **D-18:** ADR-012's duplicate keys are collapsed and product names (`Vamos Taxi`, `Economy`,
  `Business`, `Van`) marked non-translatable during the dotted-key migration.
  — **Reversibility:** reversible.
- **D-19:** `hreflang` alternates and the sitemap are generated from the route tree via a
  shared metadata helper and a `sitemap.ts` walking the same route list — all four alternates
  plus `x-default` on every public page. Not per-page metadata exports.
  — **Reversibility:** reversible.
- **D-20:** 404 and error pages render in the segment's language, falling back to English when
  the language cannot resolve, and always inside the `SiteHeader`/`SiteFooter` shell.
  — **Reversibility:** reversible.
- **D-21:** Arabic RTL is verified by tooling: a stylelint rule failing on physical
  `left`/`right`/`margin-left` properties in app CSS, a CI assertion that `dir="rtl"` is
  present in the **server-rendered** HTML for `/ar`, plus the per-surface manual Arabic pass
  `CLAUDE.md` already mandates.
  — **Reversibility:** reversible.
- **D-22:** An available OFL/SIL-licensed Arabic sans is vendored and self-hosted in Phase 1 so
  Arabic is typeset rather than falling to whatever the device has. It sits behind a swappable
  token so the designer's eventual choice replaces it without touching call sites.
  — **Reversibility:** reversible.

**Design-system port**
- **D-23:** **All 100+ design-system components are ported in Phase 1**, up front — the
  owner's explicit call over the recommended funnel-first subset. Recorded costs, accepted
  knowingly: this is the single largest work item in the phase and pushes it past the
  "foundation" size the 2–3 week public-site timeline assumes.
  — **Reversibility:** reversible.
  **⚠ See "Component Port Scope Correction" below — this session's audit found the "100+"
  premise does not match what the design system's own `readme.md` documents as Vamos-branded
  components. Flagged for the planner and the owner, not silently worked around.**
- **D-24:** Stylesheets are copied **verbatim** into the app with `tokens/laws.css` as the
  final import; React components are thin shells emitting the same `.vt-*` class names. CSS is
  never rewritten, so pixel-identity is structural rather than eyeballed.
  — **Reversibility:** costly — extracting per-component CSS later touches every ported file.
  **⚠ See Pitfall 1 below — "verbatim" needs a specific extraction step this decision's
  text does not anticipate; the per-component CSS is not sitting in a static file today.**
- **D-25:** "Pixel-identical" (success criterion 2) is proven by a **screenshot diff in CI**
  between the `.dc.html` source render and the React port, per component and variant, able to
  fail a PR.
  — **Reversibility:** reversible.
- **D-26:** Icons ship as CSS masks exactly as in the mocks, with `currentColor` inheritance,
  from the vendored Lucide set only. Not React SVG components.
  — **Reversibility:** reversible.
- **D-27:** The port is structured as separate parallel plans: one for foundations (tokens,
  fonts, Lenis, the CSS pipeline) and one porting components in batches by kind — primitives,
  then form controls, then composites — each batch its own commit. It runs alongside the i18n
  and deploy plans rather than blocking them.
  — **Reversibility:** reversible.
- **D-28:** One dev-only `/dev/components` route shows every ported component with all its
  states side by side, excluded from the production build and the sitemap.
  — **Reversibility:** reversible.
- **D-29:** Each ported component gets a TypeScript interface derived exactly from its mock's
  `data-props` declaration — variant, tone, size, state, copy. A missing prop becomes a compile
  error rather than a runtime surprise in Phase 5.
  — **Reversibility:** reversible.
- **D-30:** `design-system/_ds_bundle.js` is **reference only and never shipped**. It is a
  browser UMD bundle attaching to `window.VamosTaxiDesignSystem_245af1` and expecting a global
  React; there is no `window` in a Worker during server rendering, so wrapping it would make
  the whole UI client-only. It stays in the mock tree as the source the port reads from and
  diffs against.
  — **Reversibility:** reversible.
- **D-31:** No third-party CDN script tags in production. React comes from the app bundle and
  Babel disappears with the build step.
  — **Reversibility:** reversible.
- **D-32:** The four platform laws are enforced **both** at runtime and at lint time:
  `laws.css` keeps neutralising the banned values, and stylelint additionally fails on any
  coloured `box-shadow`, on `--vt-shadow-accent`, and on `--vt-yellow-50/100/200/300` and
  `--vt-yellow-600/700` in app CSS.
  — **Reversibility:** reversible.

**Deploy pipeline, domains and secrets**
- **D-33:** Staging is `staging.vamostaxi.eu`, as `GSD-LAUNCH.md` names it. This needs
  `vamostaxi.eu` DNS on Cloudflare while the live Freshpage site still serves the apex.
  — **Reversibility:** costly — the domain appears in CI config, Cloudflare Access policy and
  every shared preview link.
- **D-34:** The `wrangler` config declares all bindings the Worker will ever touch — KV, R2,
  Queues, Hyperdrive, Turnstile — with real resources created but unused, so Phases 3–7 add
  code rather than infrastructure.
  — **Reversibility:** reversible.
- **D-35:** Secret hygiene (PLAT-06, criterion 3) is proven, not intended: a pre-commit and CI
  scan for credential patterns, a check that no `NEXT_PUBLIC_*` variable outside a named
  allowlist reaches the client bundle — both failing the PR — plus the documented secrets
  matrix in `GSD-LAUNCH.md` kept current. Every secret reaches the Worker via `wrangler secret`.
  — **Reversibility:** reversible.
- **D-36:** The single Worker entry exports `fetch`, `scheduled` and `queue`; the latter two
  are wired as proven no-ops — registered in `wrangler` config, emitting structured logs, and
  exercised once in staging.
  — **Reversibility:** reversible.
- **D-37:** Staging sits behind Cloudflare Access with `X-Robots-Tag: noindex`.
  — **Reversibility:** reversible.
- **D-38:** Observability starts in Phase 1: a small logger emitting JSON with request id,
  route and locale, wired to Logpush.
  — **Reversibility:** reversible.
- **D-39:** Every gate agreed here **blocks** the merge — typecheck, build, i18n key coverage,
  RTL physical-property lint, the two law lints, secret scan, `NEXT_PUBLIC` allowlist, and the
  component screenshot diffs.
  — **Reversibility:** reversible.

### Claude's Discretion
The owner answered "you decide" on these; each is recorded above as a concrete decision the
planner should follow unless research contradicts it, not as an open question:
D-07 (`#D4632B` role), D-15 (booking state in `sessionStorage`), D-21 (RTL verification
mechanism), D-24 (verbatim CSS copy), D-25 (screenshot-diff proof), D-26 (icons stay CSS
masks), D-31 (React from the app bundle, no CDN), D-39 (all CI gates blocking).

### Deferred Ideas (OUT OF SCOPE)
- **`#D4632B` product usage** — recorded as a token with no product role until the designer
  says what it is for. Open client-input item, not a Phase 1 blocker.
- **The designer's Arabic typeface** — swaps into D-22's token when it arrives.
- **The guideline's `PATTERNS/` PNGs** — the repo renders the checker pattern in CSS through
  `CheckerMark`; whether any raster pattern is needed is a Phase 5 question.
- **Freshpage → Cloudflare DNS sequencing risk** — Phase 11 owns it; Phase 1 only adds a
  subdomain record.
- **Where the four-language strings for the not-yet-used ported components come from** —
  surfaces per-surface in Phase 5 rather than during the port.
- **The design system's own review scaffolds** — stay English on purpose; no production home
  needed.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLAT-01 | Single Cloudflare Worker via `@opennextjs/cloudflare`, real custom domain from first deploy | Standard Stack; Code Examples (worker entry, wrangler.jsonc); Common Pitfalls 4 |
| PLAT-02 | Worker exports `fetch`, `scheduled` and `queue` from one custom entry file | Code Examples (custom worker pattern); Common Pitfalls 3 (DO Queue vs. app Queues collision risk) |
| PLAT-03 | PR runs typecheck + build + preview upload; `main` deploys staging; tag deploys prod | Architecture Patterns (CI pipeline); Don't Hand-Roll (CI gates) |
| PLAT-04 | Design-system tokens/fonts/icons/logos served from the app; React components with same class names | Component Port Scope Correction; Pitfall 1 (embedded CSS extraction); Code Examples |
| PLAT-05 | Lenis single instance, `prefers-reduced-motion`, stops while a sheet locks the body | Code Examples (Lenis + App Router); Common Pitfalls 7 |
| PLAT-06 | Every secret via `wrangler secret`; none readable from the browser or committed | Don't Hand-Roll (secret scanning, NEXT_PUBLIC allowlist); Cloudflare specifics |
| I18N-01 | Every visible string in en/de/fr/ar including placeholder/aria-label/title/alt | Standard Stack (next-intl); Common Pitfalls 2 |
| I18N-02 | Language change relabels in place, no reload, survives navigation and return visit | ADR-001 compatibility shim; Common Pitfalls 6 (booking-widget acceptance test) |
| I18N-03 | Correct language in server-rendered HTML — no English flash, no direction flip | Standard Stack (next-intl SSR); Common Pitfalls 2 (dynamic-rendering opt-in risk) |
| I18N-04 | Arabic RTL, logical properties throughout | Don't Hand-Roll (stylelint-use-logical); D-21 CI gate |
| I18N-05 | Currency swaps the mark, never the number, charge always CHF | Architecture Patterns (client-only currency store) |
| I18N-06 | Concatenated strings translated via parameterised messages | Standard Stack (next-intl ICU messages) |
</phase_requirements>

## Summary

Phase 1 has two structurally separate halves, and research changed the shape of one of them.

**The platform half — Next.js 15 on Cloudflare Workers via `@opennextjs/cloudflare`, the i18n
runtime, and the CI gates — is well-trodden, current, and low-risk.** `@opennextjs/cloudflare`
(verified `1.20.2` on npm, released 2026) is the correct, actively maintained adapter; it
supports SSR, ISR and (with the caveats in Pitfall 5) Image Optimization on Workers, and
documents the exact custom-worker pattern PLAT-02 asks for. `next-intl` (verified `4.13.7`) is
the right choice for the i18n runtime over hand-rolling: it was built for the App Router, its
`localPrefix: 'as-needed'` routing mode is the literal mechanism for D-12 (English at the root,
other locales prefixed, no separate rewrite needed), and it satisfies ADR-001's SSR requirement
directly — with one real gotcha (Pitfall 2) that the plan must design around from the first
page, not discover in Phase 5.

**The design-system-port half needed an in-repo audit, and the audit overturned the premise
D-23 was written against.** `design-system/readme.md` — the design system's own authoritative
index — states in §4.1 that a second, unrelated Figma kit ("Rolic.app", an iOS mobile UI kit)
was mounted onto this project and materialized into `design-system/components/mobile/` "at the
user's instruction," and says explicitly: **"It is a different product from Vamos Taxi... kept
separate."** That folder accounts for 63 of the 96 entries in `_ds_manifest.json` — the
likely source of the "100+" figure in D-23. The actual Vamos-branded, `.vt-*`-class-name design
system that `CLAUDE.md` and every `.dc.html` mock draws from is **33 components** across six
categories (`core` 9, `forms` 8, `feedback` 5, `data` 4, `transfer` 4, `navigation` 3), of
which at least 27 are demonstrably imported by a live mock today. See "Component Port Scope
Correction" below — this is flagged plainly for the planner and the owner, not silently
resolved, per the instruction not to work around a CONTEXT.md decision that looks wrong.

Separately, and independent of the count: `design-system/_ds_bundle.js` turned out to be
**readable, unminified compiled source** (verified — see Code Examples), not a black box. Each
of the 33 real components is a small, clean `function ComponentName({ prop = default, ... })`
returning `React.createElement(...)` calls, averaging roughly 55 lines. This is a far better
source of truth for D-29's TypeScript interfaces than reverse-engineering usage sites, and it
makes the port itself more mechanical than D-23's framing ("single largest work item... pushes
it past the foundation size") suggests — **for the 33 real components.** The bundle also
revealed a second load-bearing finding: each component's CSS is not sitting in a static file at
all — it is a JS template-literal string injected into `<head>` at render time by a helper that
explicitly no-ops when `document` is undefined (Pitfall 1). D-24's "verbatim CSS copy" is correct
in spirit but needs a specific extraction step the decision's text does not name.

**Primary recommendation:** use `next-intl` with `localePrefix: 'as-needed'` for the i18n
runtime; scope the Phase 1 design-system port to the 33 Vamos-branded components documented in
`design-system/readme.md` §4 (explicitly excluding `components/mobile/`'s Rolic.app kit, which
is unused, unrelated, and would import a second visual language into the codebase); extract each
real component's embedded CSS into a static stylesheet during the port rather than porting the
runtime `injectStyles` mechanism; and confirm both corrections with the user before the plan
commits effort, since they materially change what "port all components" should mean.

## Component Port Scope Correction

**This is the single highest-value finding of this research pass and should be resolved before
planning proceeds, not absorbed silently.**

`design-system/readme.md` (§4.1, §4.2) states, in the design system's own words:

> "A Figma file is mounted on this project: **`Rolic.app`** — an iOS mobile UI kit (53
> component sets + ~6,244 icon symbols, 317 Figma variables). **It is a different product from
> Vamos Taxi**: Urbanist / Plus Jakarta Sans / Onest / SF Pro type, `#597EF7` blue, and an
> inventory of native-iOS furniture... Nothing in it comes from the Vamos Taxi brand pack or the
> `Loomlyne/VamosTaxi.eu` product docs, and Vamos V1 is responsive web only... It is therefore
> kept **separate**, in `components/mobile/`"
> [VERIFIED: design-system/readme.md:305-316]

> "At the user's instruction the kit's families were extracted from the mounted `.fig` into
> `components/mobile/` (62 exports). They are **generated code**... **not** Vamos-branded
> components. Do not mix them into a Vamos surface"
> [VERIFIED: design-system/readme.md:344-349]

The readme's own component inventory table lists the Vamos-branded set explicitly:

> `components/core/` | `Button` `IconButton` `Icon` `Logo` `CheckerMark` `Card` `Badge` `Tag`
> `Avatar`
> `components/forms/` | `Input` `Textarea` `Select` `DatePicker` `Checkbox` `Radio` `Switch`
> `Counter`
> `components/navigation/` | `Tabs` `StepIndicator` `SectionHeader`
> `components/feedback/` | `Alert` `Toast` `Tooltip` `Dialog` `ProgressIndicator`
> `components/transfer/` | `VehicleCard` `RouteSummary` `PriceSummary` `StatusBadge`
> `components/data/` | `StatTile` `Table` `List` `ListRow`
> `components/mobile/` | 62 generated exports from the mounted `Rolic.app` .fig — separate iOS
> visual language, see §4.2
> [VERIFIED: design-system/readme.md:489-495]

Counting that table: **9 + 8 + 3 + 5 + 4 + 4 = 33 Vamos-branded components.** Cross-checked
independently against `design-system/_ds_manifest.json`'s raw `components` array (96 entries
total, of which 63 have `sourcePath` starting `components/mobile/`) — same arithmetic, same
result: `96 − 63 = 33` [VERIFIED: design-system/_ds_manifest.json, counted via script this
session]. A direct `grep` of every `component-from-global-scope="VamosTaxiDesignSystem_245af1.*"`
usage across `app/**/*.dc.html` found 27 of those 33 names actually invoked by a live mock today
(`Alert Avatar Badge Button Card Checkbox CheckerMark Counter Dialog Icon IconButton Input List
ListRow Logo PriceSummary Radio RouteSummary Select StatusBadge StepIndicator Switch Table Tabs
Tag Textarea Toast`) [VERIFIED: grep across app/ this session]. The remaining six
(`StatTile Tooltip DatePicker SectionHeader VehicleCard ProgressIndicator`) did not match the
grep pattern used this session — that may be a real gap or a grep miss on a wrapped attribute;
the planner's Wave 0 should re-run this audit with a tool that parses multi-line attributes
rather than trust this session's single-line grep for that subset.

**Why this matters for planning:** D-23 commits, in its own text, to porting "100+" components
and calls it "the single largest work item in the phase." If the plan is built against a 100+
count, it will over-scope Phase 1 by roughly 3x on the design-system track alone — and the
extra ~63 components are not simply lower-priority, they are a **different brand's visual
language** (`#597EF7` blue, Urbanist/Plus Jakarta Sans/SF Pro, an unrelated `--colors-*` /
`--element-*` token namespace) that CLAUDE.md's "the Vamos design system is the only source of
visual truth" law would forbid shipping into a Vamos-branded production surface in the first
place. Porting them would not just be wasted effort; it would actively contradict a binding
project law.

**Recommendation:** the planner should treat "port the design system" (D-23, D-27) as scoped to
the 33 components in `design-system/readme.md` §4's own table, batched exactly as D-27 already
specifies (primitives → form controls → composites, which maps cleanly onto
`core → forms → navigation/feedback/data → transfer`), and should raise the count discrepancy
with the user as part of plan review — the recommended framing is "port the 33 real components;
`components/mobile/` is explicitly out of scope because it is a different, unrelated design
system that CLAUDE.md forbids surfacing," not a unilateral scope cut made without saying so.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Route rendering (SSR/SSG per locale) | API/Backend (Worker) | — | Next.js Server Components render on the Worker; `[lang]` segment resolved server-side per ADR-001 |
| Language selection & string resolution | API/Backend (Worker) | Browser (client components) | `t()` in Server Components at render time; `useT()` client-side for interactive islands, seeded by a provider |
| Currency selection & formatting | Browser/Client | — | Pure client state (`localStorage`), never touches the server per ADR-004/D-16 |
| Booking-widget in-progress state | Browser/Client | — | `sessionStorage`, survives the ADR-001 soft-navigation remount (D-15) |
| Design-system component rendering | Browser/Client + API/Backend | — | Components are plain React; render on server for initial paint, hydrate for interactivity — this is why embedded client-DOM CSS injection (Pitfall 1) cannot be ported as-is |
| Design tokens / CSS delivery | CDN/Static | — | `public/brand/` served as static assets by the Worker's `ASSETS` binding, cached at Cloudflare's edge |
| Fonts (Qurova, Poppins, Arabic face) | CDN/Static | — | Self-hosted `@font-face` from `public/brand/fonts/`, never a third-party CDN link (D-31, and the Noto Sans Arabic hotlink this phase must remove — Pitfall 8) |
| Lenis smooth scroll | Browser/Client | — | Requires DOM; mounted once in a client root layout wrapper, persists across client-side navigation |
| Secrets (API keys, future Stripe/Supabase creds) | API/Backend (Worker) | — | `wrangler secret`; never reaches `NEXT_PUBLIC_*` or the client bundle (PLAT-06) |
| CI/CD pipeline (typecheck, build, deploy, gates) | Build/Infra | — | GitHub Actions; not a runtime tier but owns PLAT-03 and D-39's blocking gates |
| Cron / queue plumbing (no-op in Phase 1) | API/Backend (Worker) | — | `scheduled` and `queue` exports on the single Worker entry, proven live but empty (D-36); Phase 4/5 attach real handlers later |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15 (App Router) | Framework | Fixed by `HANDOFF-CLAUDE-CODE.md` §3 |
| `@opennextjs/cloudflare` | `1.20.2` [VERIFIED: npm registry, checked 2026-08-20] | Transforms the Next.js build into a Cloudflare Worker bundle | The only maintained OpenNext adapter targeting Cloudflare Workers; supports SSR, ISR, and (with caveats) Image Optimization on Workers [CITED: opennext.js.org/cloudflare] |
| `wrangler` | `4.124.0` [VERIFIED: npm registry, checked 2026-08-20] | Cloudflare CLI — dev, deploy, secrets, bindings | Official Cloudflare tool; required by `@opennextjs/cloudflare`'s own docs (≥3.99.0) |
| `next-intl` | `4.13.7` [VERIFIED: npm registry, checked 2026-08-20] | i18n runtime — `t()`/`useT()`, locale routing, ICU messages | Purpose-built for the App Router, satisfies ADR-001's SSR requirement directly, supports the exact `localePrefix: 'as-needed'` routing D-12 needs — see "i18n Runtime Decision" below |
| `lenis` | `1.3.26` [VERIFIED: npm registry, checked 2026-08-20] | Smooth scroll (npm package form of the vendored `assets/lenis.js`) | Same engine already vendored in the mocks; the npm package + `lenis/react` replaces the manual `<script>` include for the App Router |
| TypeScript | latest stable, strict mode | Language | Fixed by `.claude/CLAUDE.md` |
| pnpm | latest stable | Package manager / workspaces | D-02 |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@playwright/test` | `1.62.1` [VERIFIED: npm registry, checked 2026-08-20] | Screenshot-diff CI (D-25) | Rendering both the `.dc.html` mock and the React port, then `toHaveScreenshot()` per component/variant |
| `stylelint` + `stylelint-use-logical` | stylelint latest, `stylelint-use-logical@2.1.3` [VERIFIED: npm registry, checked 2026-08-20] | D-21's RTL physical-property lint | `stylelint-use-logical` is maintained by `csstools` (the org behind PostCSS/Stylelint tooling), flags `left`/`right`/`margin-left`/etc. directly |
| stylelint (built-in `declaration-property-value-disallowed-list`) | bundled with stylelint | D-32's law lints (coloured `box-shadow`, banned `--vt-yellow-*` values) | No dedicated npm package exists for "ban this project's specific token values" — this is the honest custom-config case; see Don't Hand-Roll |
| `@lingual/i18n-check` (or `i18next-cli status`, framework-agnostic either way) | `@lingual/i18n-check@0.9.5` [VERIFIED: npm registry, checked 2026-08-20] | D-17's cross-locale key-coverage CI check | Compares `en.json` against `de/fr/ar.json`, exits non-zero on missing keys — the piece next-intl's own TypeScript augmentation does not cover (typing only prevents *using* a missing key, not *authoring* one locale short) |
| gitleaks (Go binary, not npm) | latest | Pre-commit + CI secret scan (D-35) | Fastest, MIT-licensed, the standard 2026 pre-commit secret scanner [CITED: multiple 2026 comparison posts — treat as MEDIUM confidence, not independently benchmarked this session] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `next-intl` | Hand-rolled `t()`/`useT()` over the existing per-key dictionary shape | Full control, zero dependency risk — but reimplements ICU pluralization/parameterisation (D-13's `t('quote.passengers', {n:3})`), SSR-safe request-scoped locale propagation, and TypeScript key-safety that next-intl already ships and battle-tests. Given the phase's 2–3 week pressure, hand-rolling this is the higher-risk path, not the safer one. |
| `next-intl` | `react-i18next` / `next-i18next` | Namespace-based, not purpose-built for the App Router; still carries Pages-Router-era assumptions that fit less cleanly with RSC |
| Playwright for screenshot diff | Chromatic / Percy (hosted visual-diff SaaS) | Both are real options and arguably lower-maintenance, but they are external paid services outside the fixed Cloudflare/GitHub Actions stack `HANDOFF-CLAUDE-CODE.md` §3 commits to, and add a vendor the secrets matrix and privacy subprocessor list (ADR-010) would need to account for. Playwright keeps the diff entirely inside the existing CI. |
| gitleaks | trufflehog only | trufflehog's verification (attempting to authenticate a found credential) is a stronger production signal but slower; the pragmatic 2026 pattern is gitleaks pre-commit + optionally trufflehog in CI later — not required for Phase 1's initial gate [CITED, MEDIUM confidence] |

**Installation:**
```bash
pnpm add next-intl lenis
pnpm add -D @opennextjs/cloudflare wrangler @playwright/test stylelint stylelint-use-logical @lingual/i18n-check
# gitleaks is a standalone binary, not an npm dependency — install via the GitHub Action
# (gitleaks/gitleaks-action) in CI and via `brew install gitleaks` / a pre-commit hook locally.
```

**Version verification:** all versions above were checked against the npm registry on
2026-08-20 via `npm view <package> version`. `@opennextjs/cloudflare` moves fast — re-verify
immediately before the scaffold plan executes, not from this document alone.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads (last 7d) | Source Repo | Verdict | Disposition |
|---------|----------|-----|----------------------|--------------|---------|-------------|
| `next-intl` | npm | created 2020-11-19 (~5.7 yrs) | 4,346,691 | github.com/amannn/next-intl | OK | Approved |
| `@opennextjs/cloudflare` | npm | created 2024-09-20 (~2 yrs) | 1,002,777 | github.com/opennextjs/opennextjs-cloudflare | OK | Approved |
| `wrangler` | npm | created 2012-06-19 (Cloudflare's own tool) | 16,296,083 | github.com/cloudflare/workers-sdk | OK | Approved |
| `stylelint-use-logical` | npm | created 2018-09-28 (~7.9 yrs) | 209,954 | github.com/csstools/stylelint-use-logical | OK | Approved |
| `@playwright/test` | npm | created 2020-09-24 (~5.9 yrs), Microsoft | 46,375,709 | github.com/microsoft/playwright | OK | Approved |
| `@lingual/i18n-check` | npm | created 2025 (~1 yr) | not separately queried; parent `i18n-check` project is active | github.com/lingualdev/i18n-check | SUS (young package, single-vendor tool) | Flagged — planner should add a `checkpoint:human-verify` before wiring into a blocking CI gate; alternative is a five-line custom Node script diffing `Object.keys()` across the four JSON files, which has zero supply-chain risk and is arguably more honest for this specific, narrow check |
| `lenis` | npm | created 2023-04-03 (~3.4 yrs) | 1,137,953 | github.com/darkroomengineering/lenis | OK | Approved — same engine already vendored in `assets/lenis.js` |
| `gitleaks` | not npm (Go binary / GitHub Action) | long-established, widely used | not applicable | github.com/gitleaks/gitleaks | Not registry-checkable via `npm view` — treat as [CITED, MEDIUM confidence] rather than [VERIFIED] | Approved with caveat: verify the pinned Action version/SHA at plan time, standard supply-chain hygiene for any third-party Action |

**Packages removed due to `[SLOP]` verdict:** none.
**Packages flagged as suspicious `[SUS]`:** `@lingual/i18n-check` — young, narrow-purpose tool; either gate its install behind a human check or replace it with a small in-repo script (recommended — see Don't Hand-Roll).

No suspicious `postinstall` scripts were found on any package checked (`npm view <pkg>
scripts.postinstall` returned empty for all of `next-intl`, `@opennextjs/cloudflare`,
`wrangler`, `stylelint-use-logical`, `@playwright/test`, `i18next-cli`, `lenis`).

## Architecture Patterns

### System Architecture Diagram

```
Visitor request
      │
      ▼
Cloudflare edge (DNS, WAF, Access gate on staging — D-37)
      │
      ▼
Cloudflare Worker  ── single deployment, one entry file ─────────────────┐
 │  exports: fetch (OpenNext) · scheduled (no-op) · queue (no-op)        │
 │                                                                        │
 │  fetch path:                                                          │
 │   1. Match [lang] segment (en unprefixed via rewrite, de/fr/ar        │
 │      prefixed) → resolve locale, set html lang+dir at render time     │
 │   2. Render Server Component tree                                    │
 │        - t(key, params) resolves strings from the locale JSON        │
 │          loader (D-14 seam — JSON today, content_strings in Phase 6) │
 │        - Design-system React components render with statically-      │
 │          imported CSS (not runtime-injected — see Pitfall 1)         │
 │   3. Serve static assets (tokens/fonts/icons/logos) from the          │
 │      `ASSETS` binding — public/brand/, edge-cached                   │
 │   4. Hydrate on client:                                               │
 │        - useT() for client-interactive strings                       │
 │        - Lenis mounts once (client root), currency store reads       │
 │          localStorage, booking widget reads/writes sessionStorage    │
 └────────────────────────────────────────────────────────────────────────┘
      │
      ▼
Structured JSON logs (request id, route, locale) → Logpush (D-38)

Declared-but-unused bindings (D-34, real resources, no code yet):
  KV · R2 · Queues · Hyperdrive · Turnstile  — Phases 3–7 attach code, not infra
```

### Recommended Project Structure
```
apps/web/
├── app/
│   ├── [locale]/                  # next-intl dynamic segment; en unprefixed via localePrefix "as-needed"
│   │   ├── layout.tsx             # sets <html lang dir>, mounts NextIntlClientProvider, Lenis root
│   │   ├── page.tsx                # home (stub in Phase 1 — real content is Phase 5)
│   │   ├── sitemap.ts              # walks the same route list as the metadata helper (D-19)
│   │   └── ...
│   ├── dev/components/             # D-28 — dev-only gallery, excluded from prod build & sitemap
│   └── globals.css                 # @import chain ending in tokens/laws.css
├── components/
│   ├── core/        Button.tsx  Card.tsx  Icon.tsx  Logo.tsx  CheckerMark.tsx  Badge.tsx  Tag.tsx  Avatar.tsx  IconButton.tsx
│   ├── forms/        Input.tsx  Textarea.tsx  Select.tsx  DatePicker.tsx  Checkbox.tsx  Radio.tsx  Switch.tsx  Counter.tsx
│   ├── navigation/   Tabs.tsx  StepIndicator.tsx  SectionHeader.tsx
│   ├── feedback/     Alert.tsx  Toast.tsx  Tooltip.tsx  Dialog.tsx  ProgressIndicator.tsx
│   ├── transfer/     VehicleCard.tsx  RouteSummary.tsx  PriceSummary.tsx  StatusBadge.tsx
│   └── data/         StatTile.tsx  Table.tsx  List.tsx  ListRow.tsx
│   # 33 components total, exactly design-system/readme.md §4's table.
│   # components/mobile/ (Rolic.app kit) is explicitly NOT ported — see Component Port Scope Correction.
├── i18n/
│   ├── routing.ts                  # defineRouting({ locales, defaultLocale: 'en', localePrefix: 'as-needed' })
│   ├── request.ts                  # request-scoped config, loader seam (D-14)
│   └── messages/  en.json  de.json  fr.json  ar.json
├── lib/
│   ├── locale-shim.ts               # VamosLocale-compatible client API (ADR-001 point 5)
│   └── logger.ts                    # structured JSON logger (D-38)
├── public/brand/
│   ├── tokens/*.css  styles.css     # verbatim copy per D-24
│   ├── fonts/                       # Qurova, Poppins, + vendored Arabic face (D-22) — gated on ADR-009
│   └── icons/ logo/ patterns/
├── worker.ts                        # custom entry: fetch (OpenNext) + scheduled + queue (D-36)
├── wrangler.jsonc                   # all bindings declared per D-34
├── open-next.config.ts
└── package.json

packages/db/        # empty scaffold this phase — Phase 2 fills it
packages/emails/     # empty scaffold this phase — Phase 5/7 fill it
```

### Pattern 1: SSR-safe i18n with `next-intl`, matching D-11/D-12/D-13
**What:** `[locale]` dynamic segment, `localePrefix: 'as-needed'` so English has no prefix and
`de`/`fr`/`ar` do, `t()` server-side and `useT()` client-side, JSON message files with dotted
keys and ICU parameters.
**When to use:** every route.
**Example:**
```typescript
// Source: next-intl docs, routing configuration — https://next-intl.dev/docs/routing/configuration
// i18n/routing.ts
import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['en', 'de', 'fr', 'ar'],
  defaultLocale: 'en',
  localePrefix: 'as-needed' // English at "/", others at "/de", "/fr", "/ar" — D-12
});
```

```typescript
// app/[locale]/layout.tsx
// Source: next-intl app-router getting-started guide — https://next-intl.dev/docs/getting-started/app-router
import { setRequestLocale } from 'next-intl/server';
import { routing } from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }) {
  const { locale } = await params;
  setRequestLocale(locale); // unlocks static rendering — see Pitfall 2
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  return (
    <html lang={locale} dir={dir}>
      <body>{children}</body>
    </html>
  );
}
```

### Pattern 2: Parameterised messages replace regex `patterns` (D-13, I18N-06)
**What:** ICU message syntax instead of the mocks' `patterns` regex array.
**Example:**
```typescript
// Source: next-intl usage docs
// i18n/messages/en.json
{ "quote": { "passengers": "{n, plural, one {# passenger} other {# passengers}}" } }

// usage
t('quote.passengers', { n: 3 }); // "3 passengers" — pluralisation and interpolation both
                                  // come from the library, not a hand-maintained regex list
```

### Pattern 3: Custom Worker entry exporting `fetch`, `scheduled`, `queue` (PLAT-02, D-36)
**What:** one file that re-exports OpenNext's generated `fetch` handler and adds the project's
own `scheduled`/`queue` no-ops.
**Example:** see Code Examples below.

### Pattern 4: Design-system component — static CSS import, not runtime injection
**What:** the port converts each of the 33 components' `React.createElement(...)` bodies into
JSX with a TypeScript prop interface, **and** extracts the component's `CSS` template-literal
string (currently injected client-side via `injectStyles()`) into a static `.css` file imported
normally at the top of the component module.
**When to use:** every one of the 33 real components — this is not optional; see Pitfall 1.
**Example:** see Code Examples below.

### Anti-Patterns to Avoid
- **Wrapping `_ds_bundle.js` at runtime (the reversed owner idea, D-30):** makes the whole UI
  client-only, defeats SSR, reproduces exactly the flash-of-wrong-content problem ADR-001
  exists to eliminate.
- **Porting `components/mobile/` (the Rolic.app kit):** a second, unrelated visual language;
  contradicts CLAUDE.md's "the Vamos design system is the only source of visual truth."
- **Using `useTranslations` in a Server Component without `setRequestLocale`:** silently opts
  the whole route into dynamic rendering, defeating `generateStaticParams`/ISR and hurting the
  Phase 10 10k-concurrent target that depends on edge-cached static/ISR pages.
- **Reading `.dev.vars` for values also needed at `next build` time (e.g. any future
  `NEXT_PUBLIC_*`):** OpenNext's own docs state `.dev.vars`/`wrangler.jsonc` vars are not
  available to `next build`; build-time and `NEXT_PUBLIC_*` values must come from `.env` files
  or the Cloudflare dashboard's "Build variables and secrets," not `wrangler secret`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSR-safe i18n with pluralisation/RTL | A custom `t()`/`useT()` pair over the JSON dictionary | `next-intl` | Battle-tested ICU message handling, request-scoped locale propagation, and TypeScript key-safety that a hand-rolled version would reimplement worse and slower, against a 2–3 week deadline |
| Cross-locale key-coverage checking | — (this one *can* legitimately be hand-rolled) | Either `@lingual/i18n-check` (flagged `[SUS]`, young) **or** a five-line Node script diffing `Object.keys(JSON.parse(...))` across the four locale files | This is genuinely narrow enough that a small custom script is the more honest answer than adding a young single-purpose dependency — see Package Legitimacy Audit |
| RTL logical-property enforcement | A custom stylelint rule from scratch | `stylelint-use-logical` (maintained by `csstools`, the Stylelint org's own tooling group) | Mature, purpose-built, directly implements exactly D-21's requirement |
| Coloured-`box-shadow` / banned-token lint (D-32) | — | Built-in stylelint `declaration-property-value-disallowed-list` with a project-specific regex config | No dedicated npm package exists for "ban these specific custom-property names in this specific brand system" — a ~15-line stylelint config entry is the honest answer, not a search for a package |
| Secret scanning | A regex-grep pre-commit hook | `gitleaks` (pre-commit) | Sub-second on typical diffs, MIT-licensed, the standard 2026 baseline; a hand-rolled regex hook will always lag gitleaks' maintained detection rules |
| Screenshot diffing | Custom pixel-diff via `canvas`/`pixelmatch` scripting | `@playwright/test`'s built-in `toHaveScreenshot()` | Ships baseline management, `maxDiffPixelRatio` tuning, and CI artifact upload out of the box |
| Smooth scroll | Anything besides the vendored engine | `lenis` npm package (same engine as `assets/lenis.js`) configured identically | CLAUDE.md mandates one Lenis instance with specific house settings; the npm package is the same library, just import-based instead of `<script src>` |

**Key insight:** every "Don't Hand-Roll" item above except the key-coverage check has a mature,
verified, actively-maintained package solving it. The one narrow exception (cross-locale key
coverage) is small enough that a custom script is genuinely lower-risk than a young dependency —
this is the honest exception the instructions ask this document to name, not a blanket "always
use a package" rule.

## Common Pitfalls

### Pitfall 1: "Verbatim CSS copy" (D-24) does not cover the 33 components' own CSS
**What goes wrong:** the plan copies `design-system/tokens/*.css` and `styles.css` verbatim
(correct — these are static files), ports each component's `React.createElement` logic to JSX,
and assumes the CSS carries over automatically because the class names match. It does not: each
component's actual CSS never lived in a static file. It is a JS template-literal constant
embedded inside `design-system/_ds_bundle.js`, injected into `<head>` at render time by:
```javascript
// Source: design-system/_ds_bundle.js:43186-43193 [VERIFIED this session]
function injectStyles(id, css) {
  if (typeof document === 'undefined') return;
  if (document.getElementById(id)) return;
  const el = document.createElement('style');
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}
```
This function is called from inside every component (e.g. `__ds_scope.injectStyles('vt-button',
CSS)` at the top of `Button`'s render body). Confirmed by checking `design-system/styles.css` —
it imports only the seven token files, the (unrelated) Rolic kit's fig-tokens/fig-assets, and
`tokens/laws.css`; there is no `.vt-btn`, `.vt-veh`, `.vt-avatar` etc. anywhere in a static file.
**Why it happens:** the mocks are a client-only SPA with no server render, so `injectStyles`
happening after mount is invisible there. It is explicitly SSR-hostile
(`if (typeof document === 'undefined') return;`).
**How to avoid:** during the port, extract each component's `CSS` template-literal constant out
of `_ds_bundle.js` into a real `.css` file the React component statically imports (e.g.
`Button.css`, imported at the top of `Button.tsx`). Drop the `injectStyles` call entirely — a
static import is what makes the component's styling present in the server-rendered HTML, which
is the actual point of D-24 ("pixel-identity is structural rather than eyeballed").
**Warning signs:** a ported component renders unstyled (or with only token-layer defaults) on
first paint, then "pops" into its correct appearance after hydration — the exact
flash-of-wrong-content class of bug ADR-001 was written to eliminate, but for CSS instead of
language.

### Pitfall 2: `next-intl` opts Server Components into dynamic rendering unless `setRequestLocale` is called
**What goes wrong:** `useTranslations`/`getTranslations` used in a Server Component without
first calling `setRequestLocale(locale)` in that route's layout/page causes next-intl to read
locale via `headers()`, which forces the whole route to dynamic (SSR-per-request) rendering,
silently defeating `generateStaticParams` and any ISR/edge-caching strategy.
**Why it happens:** it is next-intl's documented current behavior for locale-based routing
[CITED: next-intl.dev/docs/getting-started/app-router], not a misconfiguration — it is easy to
miss because the page still renders correctly, just always dynamically.
**How to avoid:** call `setRequestLocale(locale)` as the first statement in every
`app/[locale]/layout.tsx` and in any `page.tsx` that also needs `generateStaticParams` — bake
this into the Phase 1 scaffold's page/layout templates so every page created in later phases
inherits it, rather than relying on each future author to remember it.
**Warning signs:** `next build` output shows a route marked dynamic (ƒ) that should be static
(●) or ISR; Phase 10's 10k-concurrent-visitor target depends on public pages being edge-cacheable,
so this must be caught in Phase 1, not discovered under load in Phase 10.

### Pitfall 3: OpenNext's own ISR revalidation queue is a different mechanism from the app's Cloudflare Queues consumer
**What goes wrong:** PLAT-02 asks for one Worker entry exporting `fetch`, `scheduled`, and
`queue`. OpenNext's own background-ISR-revalidation mechanism *also* uses a queue — but it is a
Durable-Object-backed queue (`DOQueueHandler`/`DOShardedTagCache`), not the Cloudflare Queues
binding the project's own `queue()` export (for Phase 5's Stripe webhook fan-out) will consume.
If the app opts into OpenNext's DO Queue (for ISR) it must additionally re-export
`DOQueueHandler`/`DOShardedTagCache` from the custom worker file, or that mechanism silently
breaks.
**Why it happens:** two independent "queue" concepts share the word but not the binding type —
easy to conflate when skimming docs.
**How to avoid:** confirm in the plan whether ISR is actually used for any Phase 1 route (likely
not much content exists yet); if it is (or will be by Phase 5), the custom `worker.ts` must
export both the app-level `queue()` handler *and* re-export `DOQueueHandler`/`DOShardedTagCache`
per OpenNext's custom-worker doc.
**Warning signs:** ISR revalidation silently stops working after a custom worker entry is
introduced; the OpenNext GitHub issue tracker documents real instances of this exact class of
bug (KV/DO sync-table mismatches).

### Pitfall 4: declaring D-34's unused bindings is a warning, not a blocker — but the *resources* must genuinely exist
**What goes wrong:** the plan interprets D-34 as "just write the binding names into
`wrangler.jsonc`." Wrangler will warn (not error) on an unused binding, so the config-file part
is safe [CITED, MEDIUM confidence — GitHub issue discussion, not the primary docs]. But D-34
explicitly says "with real resources created but unused" — the KV namespace, R2 bucket, Queue,
Hyperdrive config and Turnstile site must actually be provisioned via `wrangler kv namespace
create` / `wrangler r2 bucket create` / `wrangler queues create` / the Hyperdrive dashboard/API /
the Turnstile dashboard, which are real Cloudflare-account-level setup steps, not just config
edits.
**Why it happens:** "declare a binding" reads like a one-line config change; provisioning the
backing resource is a separate action with its own account/billing implications.
**How to avoid:** the plan should list each binding's provisioning command explicitly as its own
task, not bundle it into "write wrangler.jsonc."
**Warning signs:** `wrangler deploy` succeeds but the binding is a stub pointing at a
resource-id that doesn't exist, surfacing only when Phase 3+ code actually tries to use it.

### Pitfall 5: Image Optimization on Workers has real, narrower behavior than Vercel's
**What goes wrong:** a plan assumes `next/image` behaves identically to Vercel. On
`@opennextjs/cloudflare`, only PNG/JPEG/WEBP/AVIF/GIF/SVG are optimized (others pass through
unchanged), `minimumCacheTTL` is not configurable (assets are either immutable-cached or not),
and a custom loader is required since Next's default optimizer needs the Node.js runtime, which
Workers doesn't provide in that form [CITED: opennext.js.org/cloudflare/howtos/image].
**Why it happens:** `HANDOFF-CLAUDE-CODE.md` explicitly flags this — "ISR/image optimisation
must work under OpenNext on Workers — verify each before relying on it" — this phase is exactly
where that verification belongs, since Phase 1 has no real photography yet (owner blocker #3)
but the pattern must be proven before Phase 5 needs it for real.
**How to avoid:** verify `next/image` with Cloudflare Images configured in Phase 1 against a
placeholder image, not defer it to Phase 5 when real photography lands under deadline pressure.
**Warning signs:** none yet in this repo — this is a forward-looking pitfall, not one discovered
this session.

### Pitfall 6: the ADR-001 booking-widget acceptance test is a hard gate, and D-15's `sessionStorage` choice is the entire mechanism that makes it pass
**What goes wrong:** the plan treats the language switch as "just navigate to the new locale
segment" without also verifying the booking widget's component re-hydrates its fields from
`sessionStorage` on mount (rather than only in an initial-state literal that gets reset by the
soft-navigation remount).
**Why it happens:** ADR-001 itself names this as the single condition under which "this decision
is wrong and language moves to a cookie" — it is not a nice-to-have test, it is the thing that
validates D-11/D-12's entire URL-segment approach.
**How to avoid:** build the booking-widget stub (even a minimal Phase 1 placeholder, since real
booking-widget content is Phase 4/5) with sessionStorage read-on-mount from day one, and write
the acceptance test (fill partially → switch language → assert survival) as part of Phase 1's
own verification, not deferred.
**Warning signs:** if this test cannot be made to pass cleanly, per ADR-001's own text, the
correct response is escalating back to re-open D-11/D-12 — not shipping a workaround silently.

### Pitfall 7: Lenis needs an explicit stop/restart around client-side navigation
**What goes wrong:** a single Lenis instance mounted once in the root layout can lose sync with
scroll position across Next.js `<Link>` client-side navigations if not explicitly told to
stop/reset on `usePathname()` changes.
**Why it happens:** Lenis assumes a scrollable document that doesn't change identity;
Next.js App Router client navigations replace page content without a full reload.
**How to avoid:** wrap Lenis in a client component that calls `lenis.stop()`/reset (or scrolls
to top per the mocks' existing page-transition behavior) on `pathname` change, matching
`assets/lenis-boot.js`'s existing house settings (lerp 0.12, `anchors:true`,
`allowNestedScroll:true`, `prefers-reduced-motion` honoured, sheet-lock stop) [CITED: community
Lenis+Next.js patterns; the precise stop/restart mechanism should be validated against the
current `lenis/react` API at implementation time, not assumed from a blog post].
**Warning signs:** scroll position "jumps" or the smoothing feels broken specifically after a
client-side route change, not on first load.

### Pitfall 8: the mocks' current Arabic font mechanism is a data-protection problem this phase must fix, not just a licensing one
**What goes wrong:** `app/vamos-locale.js` currently hotlinks Google Fonts for Arabic:
```javascript
// Source: app/vamos-locale.js:296-303 [VERIFIED this session]
function arabicFont() {
  if (document.getElementById('vt-ar-font')) return;
  var l = document.createElement('link');
  l.id = 'vt-ar-font';
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap';
  document.head.appendChild(l);
}
```
This discloses every Arabic-page visitor's IP and user-agent to Google before any consent
interaction, and Google is not on the site's subprocessor list — already flagged as conflict C25
in ADR-009. It also directly contradicts D-31 (no third-party CDN script tags in production).
**Why it happens:** it was a fast way to get *some* Arabic type in a client-only mock; it was
never meant to survive into production.
**How to avoid:** self-host the chosen Arabic face from `public/brand/fonts/` (see D-22 /
Arabic Webfont Options below) and delete this CDN `<link>` injection entirely as part of the
i18n runtime port — it cannot ship as-is under D-31.
**Warning signs:** any network request to `fonts.googleapis.com` from a production or staging
page load.

## Code Examples

### Custom Worker entry — `fetch` + `scheduled` + `queue` (PLAT-02, D-36)
```typescript
// Source: https://opennext.js.org/cloudflare/howtos/custom-worker
// worker.ts
// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from './.open-next/worker.js';

export default {
  fetch: handler.fetch,

  async scheduled(event) {
    // Phase 1: proven no-op — logs and exercises the binding once in staging (D-36).
    // Phase 4 (quote expiry) and Phase 9 (reminders/no-show sweep) attach real cases here.
    console.log(JSON.stringify({ type: 'scheduled', cron: event.cron, at: new Date().toISOString() }));
  },

  async queue(batch) {
    // Phase 1: proven no-op. Phase 5 (Stripe webhook fan-out) attaches a real consumer here.
    for (const message of batch.messages) {
      console.log(JSON.stringify({ type: 'queue', id: message.id, body: message.body }));
      message.ack();
    }
  },
} satisfies ExportedHandler<CloudflareEnv>;

// Only required if the app also opts into OpenNext's own DO-backed ISR revalidation queue
// (see Pitfall 3) — re-export so that mechanism keeps working:
// @ts-ignore
export { DOQueueHandler, DOShardedTagCache } from './.open-next/worker.js';
```

### `wrangler.jsonc` shape (PLAT-01, D-34)
```jsonc
// Source: https://opennext.js.org/cloudflare/get-started, adapted with D-34's declared-but-unused bindings.
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "main": "worker.ts",
  "name": "vamos-web-staging",
  "compatibility_date": "2026-08-20",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],
  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },
  "services": [{ "binding": "WORKER_SELF_REFERENCE", "service": "vamos-web-staging" }],
  // Declared now per D-34; each resource must be genuinely provisioned (see Pitfall 4),
  // even though no code references these bindings until Phases 3-7.
  "kv_namespaces": [{ "binding": "GEO_CACHE", "id": "<created via wrangler kv namespace create>" }],
  "r2_buckets": [{ "binding": "PHOTOS", "bucket_name": "vamos-photos-staging" }],
  "queues": {
    "producers": [{ "binding": "STRIPE_EVENTS", "queue": "vamos-stripe-events-staging" }],
    "consumers": [{ "queue": "vamos-stripe-events-staging" }]
  },
  "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<created in Phase 3>" }]
  // Turnstile has no wrangler.jsonc binding shape; it is a site-key pair delivered as a secret
  // (TURNSTILE_SECRET) plus a public site key, not a Worker binding — verify at Phase 4 planning.
}
```

### `package.json` build/deploy scripts
```json
// Source: https://opennext.js.org/cloudflare/get-started
{
  "scripts": {
    "build": "next build",
    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    "typecheck": "tsc --noEmit"
  }
}
```

### Design-system component port — before (bundle) / after (React port)
```javascript
// BEFORE — Source: design-system/_ds_bundle.js:43323-43350 [VERIFIED this session]
// Reference only, per D-30 — never shipped.
function Button({
  variant = 'primary', size = 'md', icon, iconEnd, block = false,
  sentenceCase = false, disabled = false, href, type = 'button',
  children, className = '', ...rest
}) {
  __ds_scope.injectStyles('vt-button', CSS); // <-- client-only, no-ops under SSR (Pitfall 1)
  const cls = ['vt-btn', 'vt-btn--' + variant, 'vt-btn--' + size,
    block ? 'vt-btn--block' : '', sentenceCase ? 'vt-btn--sentence' : '', className]
    .filter(Boolean).join(' ');
  // ...React.createElement(...) — logic carries over verbatim, only the CSS delivery changes.
}
```
```tsx
// AFTER — the recommended port pattern. Class-name logic is copied verbatim (D-24);
// only the CSS delivery mechanism changes (static import, not injectStyles).
import './Button.css'; // extracted verbatim from the bundle's `CSS` template literal

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | /* ...exact union from the bundle's usage sites */ string;
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  iconEnd?: string;
  block?: boolean;
  sentenceCase?: boolean;
  href?: string;
}

export function Button({
  variant = 'primary', size = 'md', icon, iconEnd, block = false,
  sentenceCase = false, disabled = false, href, type = 'button',
  children, className = '', ...rest
}: ButtonProps) {
  const cls = ['vt-btn', `vt-btn--${variant}`, `vt-btn--${size}`,
    block ? 'vt-btn--block' : '', sentenceCase ? 'vt-btn--sentence' : '', className]
    .filter(Boolean).join(' ');
  // ...same JSX structure as the bundle's React.createElement calls.
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `@studio-freight/react-lenis` | `lenis` package + `lenis/react` import | package retired, functionality merged into `lenis` itself | Use `lenis`/`lenis/react`, not the old `@studio-freight/*` names when searching for examples |
| `@cloudflare/next-on-pages` (Edge-runtime-only) | `@opennextjs/cloudflare` (Node.js-runtime, full Next.js feature support) | `@opennextjs/cloudflare` is the actively maintained path; `next-on-pages` supports only the constrained Edge runtime | Use Node.js runtime (`export const runtime = "nodejs"` where relevant), not `"edge"` |
| Manually declaring `nodejs_compat` for every compatibility date | Automatic for `compatibility_date >= 2026-08-04` | Cloudflare changelog, 2026 | Since Phase 1 will use a 2026-08-20+ compatibility date, `nodejs_compat` is on by default — declaring it explicitly anyway is still recommended for clarity and to avoid surprises if the date is ever rolled back |
| Cloudflare Access via a "self-hosted application" bound to a custom hostname (blocked when hostname and Access app share an account) | Access can now be enabled directly on a Worker (2026-08-14 changelog), protecting every hostname associated with that Worker automatically | Cloudflare changelog, 2026-08-14 [CITED: developers.cloudflare.com/changelog/post/2026-08-14-workers-access] | This is the recommended mechanism for D-37 — simpler than the old self-hosted-app + custom-hostname dance, and avoids the same-account limitation that used to block it |

**Deprecated/outdated:** `@studio-freight/react-lenis` (superseded by `lenis/react`);
`@cloudflare/next-on-pages` for anything beyond a purely static/Edge-runtime app (superseded by
`@opennextjs/cloudflare` for this project's SSR/ISR needs).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Lenis's exact stop/restart pattern around Next.js client-side navigation (the specific hook/API call, not the need for it) | Pitfall 7 | Low — the need for *some* stop/reset mechanism is well-established; only the precise `lenis/react` API surface needs validation against the currently-installed version at implementation time |
| A2 | gitleaks is the correct 2026 baseline secret scanner over alternatives (comparison content, not independently benchmarked this session) | Standard Stack, Don't Hand-Roll | Low — gitleaks is long-established and MIT-licensed; even if a different scanner were marginally better, gitleaks meets D-35's requirement |
| A3 | Cloudflare Access enabled directly on a Worker protects a custom domain even when the domain and Access application share the same Cloudflare account (stated in the fetched docs page, not independently tested against a live Worker this session) | State of the Art, D-37 | Medium — if this doesn't hold as documented, the plan falls back to the older self-hosted-application + separate-account pattern, which is more setup work but not a blocker |
| A4 | The six components not matched by this session's single-line `grep` (`StatTile`, `Tooltip`, `DatePicker`, `SectionHeader`, `VehicleCard`, `ProgressIndicator`) are genuinely unused in `app/`, rather than used via a multi-line attribute the grep pattern missed | Component Port Scope Correction | Low — either way, all 33 real components are recommended for the port per D-23's "up front" instruction; this only affects prioritisation/batch ordering, not scope |

## Open Questions

1. **Should D-23's "100+" component count and scope be formally corrected to 33?**
   - What we know: `design-system/readme.md` §4 — the design system's own authoritative
     index — documents exactly 33 Vamos-branded components and explicitly excludes the other 63
     (`components/mobile/`, the Rolic.app iOS kit) as "a different product from Vamos Taxi."
   - What's unclear: whether the owner, when writing D-23, was aware of this distinction or was
     working from the raw manifest/bundle component count.
   - Recommendation: raise this explicitly during plan review before committing effort; do not
     silently narrow the scope, and do not silently port all 96 either.

2. **Does the Phase 4 quote engine or ops console need the Arabic-glyph coverage of the
   eventual designer-supplied Arabic display face, or is a sans-only Arabic treatment (no
   distinct display face) acceptable through V1?**
   - What we know: neither Qurova nor Poppins contains any Arabic glyphs (ADR-009); D-22 vendors
     a stand-in Arabic *sans* face behind a swappable token.
   - What's unclear: whether "swappable token" in D-22 refers to one shared body+display Arabic
     face, or whether the eventual designer pick might be display-only (paired with a different
     Arabic body face) — this affects the CSS variable structure the port sets up.
   - Recommendation: implement with a single swappable `--vt-font-arabic` (or similar) token used
     for both body and display in Arabic mode for Phase 1, since that is what the current
     `vamos-locale.js` mechanism already does; flag for the designer that display/body might
     later split into two tokens.

3. **Does the CI screenshot-diff job (D-25) need network egress to unpkg.com to render the
   `.dc.html` mock side of the comparison?**
   - What we know: the mocks load React/ReactDOM/Babel from unpkg at runtime; D-31 bans this only
     in *production*, not necessarily in CI tooling that renders the mock for comparison purposes.
   - What's unclear: whether GitHub Actions' default network egress to unpkg.com is reliable
     enough for a blocking CI gate, or whether the mock-rendering step should vendor a pinned copy
     of React/ReactDOM/Babel for CI use only (separate from the production bundle).
   - Recommendation: plan for a CI-only vendored copy of React/Babel to render the `.dc.html` side
     of the diff, to avoid making every merge dependent on unpkg.com's availability.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|--------------|-----------|---------|----------|
| Node.js | Next.js build, tooling | ✓ | v26.5.0 | — |
| npm | package resolution | ✓ | 11.17.0 | — |
| pnpm | D-02 workspace manager | ✓ | 11.7.0 | — |
| wrangler | Cloudflare deploy/dev | ✓ (via `npx`, latest resolves to 4.124.0) | 4.124.0 | — |
| supabase CLI | D-04's local `supabase start` (needed from Phase 2 on, not strictly Phase 1) | ✓ | 2.109.1 | — |
| Docker | Recommended for consistent Playwright screenshot rendering across machines (Pitfall on flake) | ✓ | 29.7.2 | Run Playwright natively if Docker is unavailable in CI, but expect more font-rendering flake risk |
| gitleaks | D-35 pre-commit secret scan | ✗ (not found locally) | — | Install via `brew install gitleaks` for local pre-commit, and `gitleaks/gitleaks-action` for CI — no code changes block on this, it's a one-time environment setup task for the plan |

**Missing dependencies with no fallback:** none — gitleaks has a straightforward install path
with no architectural fallback needed.

**Missing dependencies with fallback:** gitleaks (install locally + via GitHub Action, not a
blocker for planning).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `@playwright/test` `1.62.1` (screenshot diffs) + `tsc --noEmit` (typecheck gate) + stylelint (law/RTL gates) — no unit-test framework exists yet in this greenfield repo |
| Config file | none yet — see Wave 0 |
| Quick run command | `pnpm playwright test --grep @component` (per-component screenshot diff, scoped) |
| Full suite command | `pnpm typecheck && pnpm build && pnpm stylelint "**/*.css" && pnpm playwright test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|---------------------|--------------|
| PLAT-01 | Worker serves SSR page on staging domain | smoke (post-deploy) | `curl -sI https://staging.vamostaxi.eu \| grep 200` in CD workflow | ❌ Wave 0 |
| PLAT-02 | `scheduled`/`queue` handlers fire and log | integration | `wrangler dev` + manual `wrangler queues consumer trigger` / cron trigger test | ❌ Wave 0 |
| PLAT-04 | Ported component renders pixel-identical to mock | visual | `pnpm playwright test --grep @component` | ❌ Wave 0 |
| PLAT-05 | Lenis single instance, reduced-motion honoured | manual + assertion | Playwright test asserting `window.lenis` singleton + `prefers-reduced-motion` CSS | ❌ Wave 0 |
| PLAT-06 | No secret in bundle, no `NEXT_PUBLIC_*` outside allowlist | static analysis | `gitleaks detect` + custom `check-next-public-allowlist.mjs` script | ❌ Wave 0 |
| I18N-01/06 | Every key present in all four locales | static analysis | key-coverage script/tool (D-17) | ❌ Wave 0 |
| I18N-02 | Language switch survives navigation, no reload | integration (ADR-001 acceptance test) | Playwright: fill widget → switch lang → assert field values | ❌ Wave 0 |
| I18N-03 | `dir="rtl"` in server-rendered HTML for `/ar` | integration | `curl -s https://.../ar | grep 'dir="rtl"'` or Playwright request-only check | ❌ Wave 0 |
| I18N-04 | No physical left/right properties in app CSS | static analysis | `stylelint` with `stylelint-use-logical` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** typecheck + relevant stylelint scope
- **Per wave merge:** full suite (typecheck, build, stylelint, i18n coverage, Playwright diffs)
- **Phase gate:** full suite green, plus the ADR-001 booking-widget acceptance test, before
  `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `playwright.config.ts` — Playwright project config, screenshot baseline directory, CI reporter
- [ ] `.stylelintrc` — `stylelint-use-logical` + `declaration-property-value-disallowed-list` config for D-32
- [ ] i18n key-coverage script or `@lingual/i18n-check` config (D-17)
- [ ] `scripts/check-next-public-allowlist.mjs` — custom script, no package exists for this (D-35)
- [ ] `.gitleaks.toml` + pre-commit hook + `gitleaks-action` workflow entry (D-35)
- [ ] GitHub Actions workflow files: PR (typecheck+build+preview), main (staging deploy), tag (prod deploy) — PLAT-03
- [ ] Framework install: `pnpm add -D @opennextjs/cloudflare wrangler @playwright/test stylelint stylelint-use-logical`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | no (Phase 2+) | — |
| V3 Session Management | partial | `sessionStorage`-based booking-widget state (D-15) is client-side UX state, not an auth session — no ASVS session-management control applies yet; auth sessions arrive Phase 2/5 |
| V4 Access Control | partial | Cloudflare Access gating staging (D-37) is infrastructure-level access control, not application-level; standard control is Cloudflare's own Access policy engine, not custom code |
| V5 Input Validation | minimal this phase | No user-submitted data processed yet (forms arrive Phase 5); the one input surface is the `[locale]` route param, validated by `generateStaticParams`'s fixed locale list — reject/404 any value outside `en/de/fr/ar` rather than trusting the URL segment |
| V6 Cryptography | no | No cryptographic operations in this phase |
| V7 Error Handling / Logging | yes | Structured JSON logger (D-38) — must not log secret values; request id / route / locale only, matching the fields named in D-38 |
| V14 Configuration | yes | `wrangler secret` for all credentials (PLAT-06); `NEXT_PUBLIC_*` allowlist check (D-35); no secret in `wrangler.jsonc` `vars` (those are visible in the config file, not encrypted) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|------------------------|
| Secret committed to repo or leaked into client bundle | Information Disclosure | `wrangler secret put` for all credentials, never `vars` in `wrangler.jsonc`; gitleaks pre-commit + CI; `NEXT_PUBLIC_*` allowlist check (D-35) |
| Third-party CDN script (unpkg React/Babel, Google Fonts hotlink) reaching production | Information Disclosure (visitor IP/UA leaked to a third party) + Tampering (unpinned CDN content) | D-31's ban on CDN scripts in production; Pitfall 8's fix (self-host the Arabic font, delete the `fonts.googleapis.com` link injection) |
| Locale route param used to construct a file path or key without validation | Tampering / path traversal | Only accept the four `generateStaticParams`-declared locales; the loader interface (D-14) should reject/404 rather than attempt to load an arbitrary locale file |
| Staging surface indexed or scraped ahead of go-live, confusing SEO or exposing pre-launch content | Information Disclosure | Cloudflare Access + `X-Robots-Tag: noindex` (D-37) |
| Worker-level Cloudflare Access accidentally blocking a legitimate unauthenticated route added in a later phase (e.g. Phase 5/7's Stripe webhook) | Denial of Service (self-inflicted) | Not a Phase 1 concern yet (no such route exists), but flagged in State of the Art / Open Question territory: Worker-level Access protects *all* hostnames/routes on that Worker, so a later phase's public webhook route will need either a path-scoped Access bypass or a switch to hostname/path-based Access — note this now so Phase 5/7 planning isn't surprised |

## Sources

### Primary (HIGH confidence)
- `design-system/readme.md` — read directly this session; §4.1/§4.2 authoritative on component
  scope; §8 the four platform laws
- `design-system/_ds_bundle.js` — read directly this session; component source, `injectStyles`
  mechanism
- `design-system/_ds_manifest.json` — read/parsed directly this session; component inventory
- `design-system/tokens/laws.css` — read directly this session; exact banned-value aliases
- `app/vamos-locale.js` — read directly this session; Arabic font hotlink, `chrome()`/`t()`
  mechanism
- npm registry (`npm view <pkg> version|time.created|repository.url|scripts.postinstall`) —
  queried directly this session for every recommended package
- `.planning/ADR-001-i18n-ssr.md`, `ADR-009-qurova-webfont-licence.md` — read directly this
  session
- `opennext.js.org/cloudflare/*` (get-started, custom-worker, image, env-vars) — fetched this
  session
- `next-intl.dev/docs/*` (routing/setup, routing/configuration, getting-started/app-router,
  workflows/typescript) — fetched/searched this session
- `developers.cloudflare.com/workers/configuration/cloudflare-access/` — fetched this session

### Secondary (MEDIUM confidence)
- WebSearch results on Playwright visual-regression flake/CI patterns, cross-referenced against
  Playwright's own docs conventions
- WebSearch results on gitleaks/trufflehog 2026 comparison posts (not independently benchmarked)
- WebSearch results on Lenis + Next.js App Router community patterns (exact API surface not
  independently verified against the currently-pinned `lenis` version)
- Cloudflare changelog post on Worker-level Access (2026-08-14) — fetched via WebFetch summary,
  not the raw changelog HTML

### Tertiary (LOW confidence)
- None retained without at least a WebSearch-with-official-source cross-check; anything that
  stayed single-source-blog-only is called out explicitly in the Assumptions Log instead of
  stated as fact.

## Metadata

**Confidence breakdown:**
- Standard stack (Next.js/OpenNext/Cloudflare/next-intl versions and mechanics): HIGH —
  verified against npm registry and official docs this session
- Component port scope: HIGH — verified by reading the design system's own `readme.md`,
  `_ds_manifest.json`, and `_ds_bundle.js` directly, not inferred
- CI gate tooling (stylelint config, secret scanning, key-coverage): MEDIUM-HIGH — packages
  verified on npm; exact rule configuration is this session's synthesis, not copied from a
  single authoritative "how to lint a design system" guide (none exists for this specific
  combination)
- Cloudflare Access / Logpush / staging specifics: MEDIUM — current docs fetched, but not
  tested against a live Cloudflare account this session
- Lenis + App Router exact API: MEDIUM — pattern confirmed, precise hook API should be
  re-checked against the pinned `lenis` version at implementation time

**Research date:** 2026-08-20
**Valid until:** ~14 days for the Cloudflare/OpenNext-specific mechanics (this ecosystem moves
fast — `@opennextjs/cloudflare` ships frequently); ~30 days for next-intl, stylelint, Playwright
mechanics; the Component Port Scope Correction finding is stable (it's an in-repo fact, not a
moving target) and does not expire.
