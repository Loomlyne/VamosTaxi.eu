# Phase 1: Platform Foundation, Design System Port & i18n Runtime - Context

**Gathered:** 2026-08-20
**Status:** Ready for planning

<domain>
## Phase Boundary

The production Next.js application deploys to Cloudflare Workers on a real staging domain,
carries the ported Vamos design system verbatim, and renders any string correctly in English,
German, French and Arabic including RTL. This is also where the `VamosLocale` DOM-walking
runtime is replaced with an SSR-safe render-time mechanism over the same dictionary.

Requirements covered: PLAT-01 … PLAT-06, I18N-01 … I18N-06.

Not this phase: any database schema or data access (Phase 2/3), pricing or quotes (Phase 4),
page content beyond what is needed to prove the foundation (Phase 5), the ops console
(Phases 6/8), payment (Phase 7), the production cutover (Phase 11).

</domain>

<decisions>
## Implementation Decisions

### Repository layout and toolchain
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

### Brand assets and the design system source
- **D-05:** `/Users/koss/Desktop/Freelance/brand-guideline-vamos-taxi` is the canonical brand
  source, confirmed latest by the owner. It was compared against the vendored system during
  this discussion and they already agree: `COLORS.pdf` gives exactly `#FDC20B` / `#1E1F1F` /
  `#DEDEDE`, the type is Qurova display plus Poppins body with the same five Qurova weights,
  and every guideline logo SVG shares its viewBox with a repo file (`2490×527` lockup,
  `1684×2071` mark). Nothing has drifted; the vendored system is not stale.
  — **Reversibility:** reversible.
- **D-06:** Two white variants missing from `assets/logo/` are vendored from the guideline
  folder: `LOGO/Final-white.svg` → `assets/logo/lockup-white.svg`, and `LOGO/logo-White.svg`
  → `assets/logo/mark-white.svg`. No token, font or existing-logo changes.
  — **Reversibility:** reversible.
- **D-07:** `#D4632B`, the fourth swatch printed in the guideline PDF, is recorded as a
  palette token (`--vt-orange`) with **no product-UI usage**. The PDF's own body text names
  three colours and never assigns this one a role, so no surface may reach for it until the
  designer states what it is for. This keeps the platform law intact — attention is carried
  by charcoal, full-strength yellow, or semantic danger/success. Owner's call was "you decide"
  after choosing to include the colour; recorded as an open client-input item.
  — **Reversibility:** reversible.
- **D-08:** The "Dm Sans Bold" specimen page in the guideline PDF is a template leftover and is
  not adopted — the same spread carries an unrelated French drinks tagline, and the typography
  section names Qurova and Poppins only.
  — **Reversibility:** reversible.
- **D-09:** The tagline stays **"Ride with class"** — set artwork per `CLAUDE.md`, and cited by
  the PDF's own Qurova rationale. The PDF's "Where every ride is first class." is descriptive
  prose, not a lockup, and is not used as copy.
  — **Reversibility:** reversible.
- **D-10:** Brand assets are copied verbatim into `apps/web/public/brand/` — tokens, fonts,
  icons, logos — with `tokens/laws.css` as the final import. The Worker deploy stays
  self-contained; no cross-package resolution and no coupling to the mock tree's layout.
  — **Reversibility:** reversible.

### Locale routing and the i18n runtime
- **D-11:** One dynamic `[lang]` segment with `generateStaticParams` for `en`/`de`/`fr`/`ar` —
  not four route groups. One page tree, so a fix cannot be applied to one language and missed
  in three. Resolves the open question ADR-001 left to Phase 1 planning.
  — **Reversibility:** one-way — the URL shape becomes the published contract for `hreflang`
  alternates, the Phase 11 redirect map from the Freshpage site, and any link shared or indexed
  before then; changing it after launch needs a redirect migration.
- **D-12:** English lives at the root (`/`, `/about`); German, French and Arabic are prefixed
  (`/de/about`, `/ar/about`). A rewrite keeps `/en/…` from becoming duplicate content.
  — **Reversibility:** one-way — same published-URL contract as D-11.
- **D-13:** The dictionary becomes per-locale JSON (`en.json`, `de.json`, `fr.json`, `ar.json`)
  with dotted keys and parameterised messages — `t('quote.passengers', { n: 3 })` — as ADR-001
  requires. The English-source keys of `app/vamos-i18n-dict.js` are migrated once.
  — **Reversibility:** costly — undoing it rewrites every `t()` call site.
- **D-14:** `t()` reads through a loader interface. Phase 1's implementation is the JSON files;
  Phase 6 swaps in the `content_strings` table behind the same interface (I18N-07). No database
  work in this phase, but the seam exists so Phase 6 is a swap rather than a refactor.
  — **Reversibility:** reversible.
- **D-15:** Booking-widget state lives in `sessionStorage`, mirroring the mocks'
  `localStorage.vamosTrip`. It survives ADR-001's soft-navigation remount and a refresh, and
  keeps pickup addresses and flight numbers out of the URL bar, browser history and referrer
  headers — personal data that nFADP would rather not have there. Owner delegated this one.
  **This is bound to ADR-001's stated Phase 1 acceptance test:** fill the booking widget
  partially, switch language, assert every field survives. If that test cannot be made to pass,
  ADR-001 says the URL-segment decision itself is wrong and language moves to a cookie.
  — **Reversibility:** reversible.
- **D-16:** Currency persists in `localStorage` only; the server always renders CHF and the
  mark is swapped on hydration. No cookie, so no `Vary` and no four-way edge-cache split for a
  purely presentational choice. Accepted cost: a one-frame CHF flash for a non-CHF visitor.
  The number never changes — only the mark (I18N-05).
  — **Reversibility:** reversible.
- **D-17:** Translation completeness is enforced two ways: a **build-time CI check** asserting
  every key in `en.json` exists in `de`/`fr`/`ar` and that no `t()` call references a missing
  key (fails the PR), **plus** a dev-mode runtime warning with English fallback in production.
  This replaces `VamosLocale.coverage()`, which has no server-side equivalent.
  — **Reversibility:** reversible.
- **D-18:** ADR-012's duplicate keys are collapsed and product names (`Vamos Taxi`, `Economy`,
  `Business`, `Van`) marked non-translatable **during** the dotted-key migration — the one
  moment the file is being rewritten anyway.
  — **Reversibility:** reversible.
- **D-19:** `hreflang` alternates and the sitemap are generated from the route tree via a
  shared metadata helper and a `sitemap.ts` walking the same route list — all four alternates
  plus `x-default` on every public page. Not per-page metadata exports; 18 public pages is 18
  places to forget one.
  — **Reversibility:** reversible.
- **D-20:** 404 and error pages render in the segment's language, falling back to English when
  the language cannot resolve, and always inside the `SiteHeader`/`SiteFooter` shell. A wrong
  URL still looks like Vamos Taxi.
  — **Reversibility:** reversible.
- **D-21:** Arabic RTL is verified by tooling, not attention: a stylelint rule failing on
  physical `left`/`right`/`margin-left` properties in app CSS, a CI assertion that `dir="rtl"`
  is present in the **server-rendered** HTML for `/ar`, plus the per-surface manual Arabic pass
  `CLAUDE.md` already mandates.
  — **Reversibility:** reversible.
- **D-22:** An available OFL/SIL-licensed Arabic sans is vendored and **self-hosted** in Phase 1 so
  Arabic is typeset rather than falling to whatever the device has. It sits behind a swappable
  token so the designer's eventual choice replaces it without touching call sites, and its
  licence is recorded the way ADR-009 recorded Qurova's. The designer's pick is an open
  client-input item. **Amended after research:** the mocks currently hotlink an Arabic face from
  the Google Fonts CDN (`app/vamos-locale.js:296`) — that contradicts D-31, adds an origin the
  WAF does not control, and sends every visitor's IP to Google, which the nFADP/GDPR position
  does not want. Phase 1 replaces it with a self-hosted face; the planner picks between **Noto
  Sans Arabic** and **IBM Plex Sans Arabic** (both OFL, licence verified during research) on how
  each sits beside Poppins. Owner delegated the choice between the two.
  — **Reversibility:** reversible.

### Design-system port
- **D-23:** **The full Vamos design-system set is ported in Phase 1 — 33 components**, not the
  "100+" figure quoted during discussion. `_ds_manifest.json` lists 96, but ~63 of those
  (`ActionButtons` … `ToolBarInput`, `DynamicIsland`, `SystemKeyboards`, the `Mobile*` set) are
  an unrelated iOS UI kit mounted into the same project, which `design-system/readme.md` §4.1
  states is "a different product from Vamos Taxi… kept separate". Porting it would contradict
  the single-visual-truth law. **The Vamos 33 are:** Avatar, Badge, Button, Card, CheckerMark,
  Icon, IconButton, Logo, Tag, ListRow, List, StatTile, Table, Alert, Dialog, ProgressIndicator,
  Toast, Tooltip, Checkbox, Counter, DatePicker, Input, Radio, Select, Switch, Textarea,
  SectionHeader, StepIndicator, Tabs, PriceSummary, RouteSummary, StatusBadge, VehicleCard.
  27 of them are confirmed in live use by existing mocks; the remaining 6 are ported too, so the
  kit is complete. Corrected after research, with the owner's agreement — the original "port
  everything" intent is preserved, applied to what is actually Vamos.
  — **Reversibility:** reversible.
- **D-24:** Stylesheets are copied **verbatim** into the app with `tokens/laws.css` as the final
  import; React components are thin shells emitting the same `.vt-*` class names. CSS values are
  never rewritten, so pixel-identity is structural rather than eyeballed. Owner delegated this one.
  **Amended after research:** each component's own CSS is not a static file — it is a JS template
  literal injected into `<head>` at render time by a helper that no-ops when `document` is
  undefined (`design-system/_ds_bundle.js:43186`). Porting the component logic alone would ship
  unstyled server HTML. So the port **extracts** that CSS into real stylesheets the app imports.
  "Verbatim" still binds: values are copied out, not rewritten.
  — **Reversibility:** costly — extracting per-component CSS later touches every ported file.
- **D-25:** "Pixel-identical" (success criterion 2) is proven by a **screenshot diff in CI**
  between the `.dc.html` source render and the React port, per component and variant, able to
  fail a PR. Owner delegated this one. **Amended after research:** the mocks pull React and Babel
  from unpkg at load time, so the diff job serves them from a **locally vendored copy** instead —
  the job needs no network egress, and a CDN hiccup cannot fail an unrelated PR.
  — **Reversibility:** reversible.
- **D-26:** Icons ship as CSS masks exactly as in the mocks, with `currentColor` inheritance,
  from the vendored Lucide set only. Not React SVG components — that would be a genuine
  rendering change from the source being diffed against. Owner delegated this one.
  — **Reversibility:** reversible.
- **D-27:** The port is structured as separate parallel plans: one for foundations (tokens,
  fonts, Lenis, the CSS pipeline) and one porting components in batches by kind — primitives,
  then form controls, then composites — each batch its own commit. It runs alongside the i18n
  and deploy plans rather than blocking them.
  — **Reversibility:** reversible.
- **D-28:** One dev-only `/dev/components` route shows every ported component with all its
  states side by side, excluded from the production build and the sitemap. With a full up-front
  port this is how the not-yet-used components get reviewed at all.
  — **Reversibility:** reversible.
- **D-29:** Each ported component gets a TypeScript interface derived exactly from its mock's
  `data-props` declaration — variant, tone, size, state, copy. A missing prop becomes a compile
  error rather than a runtime surprise in Phase 5.
  — **Reversibility:** reversible.
- **D-30:** `design-system/_ds_bundle.js` is **reference only and never shipped**. It is a
  browser UMD bundle attaching to `window.VamosTaxiDesignSystem_245af1` and expecting a global
  React; there is no `window` in a Worker during server rendering, so wrapping it would make
  the whole UI client-only — the same flash-of-wrong-content class of problem ADR-001 exists to
  eliminate. The owner initially chose to wrap it, and reversed to reference-only once that was
  raised. It stays in the mock tree as the source the port reads from and diffs against.
  — **Reversibility:** reversible.
- **D-31:** No third-party CDN script tags in production. React comes from the app bundle and
  Babel disappears with the build step — the page must render for a traveller on airport wifi
  and under a CSP the WAF controls, not from an origin outside it.
  — **Reversibility:** reversible.
- **D-32:** The four platform laws are enforced **both** at runtime and at lint time: `laws.css`
  keeps neutralising the banned values, and stylelint additionally fails on any coloured
  `box-shadow`, on `--vt-shadow-accent`, and on `--vt-yellow-50/100/200/300` and
  `--vt-yellow-600/700` in app CSS. Across 100 ported components, runtime neutralisation alone
  leaves the violation sitting in the source.
  — **Reversibility:** reversible.

### Deploy pipeline, domains and secrets
- **D-33:** Staging is `staging.vamostaxi.eu`, as `GSD-LAUNCH.md` names it. This needs
  `vamostaxi.eu` DNS on Cloudflare while the live Freshpage site still serves the apex — a
  subdomain record only, leaving the current site untouched until Phase 11.
  — **Reversibility:** costly — the domain appears in CI config, Cloudflare Access policy and
  every shared preview link.
- **D-34:** The `wrangler` config declares all bindings the Worker will ever touch — KV, R2,
  Queues, Hyperdrive, Turnstile — with real resources created but unused, so Phases 3–7 add
  code rather than infrastructure, and there is one place to see the Worker's full surface.
  — **Reversibility:** reversible.
- **D-35:** Secret hygiene (PLAT-06, criterion 3) is proven, not intended: a pre-commit and CI
  scan for credential patterns, a check that no `NEXT_PUBLIC_*` variable outside a named
  allowlist reaches the client bundle — both failing the PR — **plus** the documented secrets
  matrix in `GSD-LAUNCH.md` kept current as each phase adds a credential. Every secret reaches
  the Worker via `wrangler secret`.
  — **Reversibility:** reversible.
- **D-36:** The single Worker entry exports `fetch`, `scheduled` and `queue`; the latter two are
  wired as proven no-ops — registered in `wrangler` config, emitting structured logs, and
  exercised once in staging. Phase 4's cron and Phase 5's queue then add cases to plumbing
  already known to fire.
  — **Reversibility:** reversible.
- **D-37:** Staging sits behind Cloudflare Access with `X-Robots-Tag: noindex`. Nothing
  half-built gets indexed against the live site's rankings, and from Phase 7 a real payment
  form is not on a public URL.
  — **Reversibility:** reversible.
- **D-38:** Observability starts in Phase 1: a small logger emitting JSON with request id,
  route and locale, wired to Logpush. When a booking fails in Phase 7 the trail already exists
  rather than being added after the incident.
  — **Reversibility:** reversible.
- **D-39:** Every gate agreed here **blocks** the merge — typecheck, build, i18n key coverage,
  RTL physical-property lint, the two law lints, secret scan, `NEXT_PUBLIC` allowlist, and the
  component screenshot diffs. This is a solo owner-built project, so CI is the only reviewer,
  and a warning nobody blocks on is a warning nobody reads. Owner delegated this one.
  — **Reversibility:** reversible.

### Claude's Discretion
The owner answered "you decide" on these; each is recorded above as a concrete decision the
planner should follow unless research contradicts it, not as an open question:
D-07 (`#D4632B` role), D-15 (booking state in `sessionStorage`), D-21 (RTL verification
mechanism), D-24 (verbatim CSS copy), D-25 (screenshot-diff proof), D-26 (icons stay CSS
masks), D-31 (React from the app bundle, no CDN), D-39 (all CI gates blocking).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Binding project rules
- `CLAUDE.md` — the four platform laws, the design-system-is-the-only-visual-truth rule, the
  shared header/footer rule, the Lenis rule, the four-languages-same-pass rule.
- `.claude/CLAUDE.md` — stack constraints, naming patterns, responsive breakpoints, copy voice,
  the anti-patterns list.

### Architecture decisions that bind this phase
- `.planning/ADR-001-i18n-ssr.md` — language as route segment, currency as client state,
  render-time `t()`/`useT()`, the `VamosLocale` compatibility shim, and the booking-widget
  acceptance test this phase must pass. D-11 through D-16 resolve the questions it left open.
- `.planning/ADR-009-qurova-webfont-licence.md` — the Qurova webfont licence position; the
  model for how D-22's Arabic font licence gets recorded.
- `.planning/ADR-011-data-tok-labels-stay-english.md` — `data-tok` pill copy is not translated.
- `.planning/ADR-012-dictionary-duplicates-and-product-names.md` — the duplicate keys and
  non-translatable product names D-18 resolves during the migration.
- `.planning/ADR-004-currency-display-only.md` — currency changes the mark, never the number.

### Requirements and roadmap
- `.planning/ROADMAP.md` § Phase 1 — goal, the five success criteria, requirement list.
- `.planning/REQUIREMENTS.md` — PLAT-01 … PLAT-06, I18N-01 … I18N-06 in full.
- `HANDOFF-CLAUDE-CODE.md` §3 — the fixed stack; §8 — staff auth and security posture.
- `docs/build/GSD-LAUNCH.md` § Secrets — the secrets matrix D-35 keeps current.

### Brand and design system
- `/Users/koss/Desktop/Freelance/brand-guideline-vamos-taxi/` — **canonical brand source**,
  confirmed latest by the owner. `Brand Guideline VAMOS TAXI.pdf` (logo construction, safety
  margin, typography rationale), `COLORS/COLORS.pdf` (the three brand colours), `FONT/`
  (Qurova ×5, Poppins family), `LOGO/` (source SVGs including the two white variants D-06
  vendors), `PATTERNS/`.
- `design-system/styles.css` and `design-system/tokens/*.css` — copied verbatim per D-24;
  `tokens/laws.css` must remain the final import.
- `design-system/readme.md` §2 — copy voice, amount formatting, the `CHF 000` rule.
- `design-system/_ds_bundle.js` — reference only per D-30; the source the port diffs against.
- `app/` (`home/`, `pages/`, `ops/`) — the `.dc.html` mocks, the visual source of truth.
- `assets/icons/` (57 Lucide SVGs), `assets/logo/`, `assets/patterns/`,
  `assets/lenis.js` / `lenis.css` / `lenis-boot.js` — the vendored runtime and assets.

### Runtime contracts being ported
- `app/vamos-locale.js` — the `VamosLocale` contract the shim must preserve (`setLang`,
  `setCur`, `onChange`, `money`, in-place relabelling, never a reload).
- `app/vamos-i18n-dict.js` — the dictionary migrated to per-locale JSON per D-13.

### Codebase maps
- `.planning/codebase/STACK.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, `STRUCTURE.md`,
  `CONCERNS.md`, `INTEGRATIONS.md`, `TESTING.md`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Design tokens** (`design-system/tokens/*.css`) — copied verbatim; `laws.css` already
  aliases the banned tinted-yellow values away at runtime, which D-32 backs with a lint gate.
- **Lenis boot** (`assets/lenis-boot.js`) — already owns the single instance, the house
  settings (lerp 0.12, no bounce, `anchors:true`, `allowNestedScroll:true`), the
  `prefers-reduced-motion` honouring and the sheet-lock stop. Ports as-is; PLAT-05 is
  satisfied by preserving it, not rebuilding it.
- **`VamosLocale` API surface** (`app/vamos-locale.js`) — the contract survives; only the
  DOM-walking mechanism underneath is replaced.
- **`data-props` declarations** on every `.dc.html` component — these are the prop contracts
  D-29 turns into TypeScript interfaces.
- **Brand SVGs** — repo logos already share viewBox geometry with the guideline sources, so
  no re-derivation is needed beyond D-06's two additions.

### Established Patterns
- `.vt-*` class names are design-system-owned; local styling uses `[data-*]` attributes for
  layout only. The port must keep this split or the copied CSS stops matching.
- Responsive is fluid-first — `clamp()` type and gutters, `minmax()`/`auto-fit` grids,
  `min-width:0` on text-bearing flex children — with breakpoints only where layout changes
  shape. Control heights 36/44/54px; nothing scrolls sideways at 390px.
- Amounts read `CHF 000` until the pricing matrix lands; pending values are `data-tok` pills.
- Every page composes `SiteHeader` + `SiteFooter`; ops uses `OpsSidebar` instead.

### Integration Points
- The `t()` loader interface (D-14) is where Phase 6's `content_strings` table connects.
- The declared-but-unused bindings (D-34) are where Phases 3–7 connect: Hyperdrive for Phase 3,
  KV for Phase 4's geo and quote caches, Queues for Phase 5's webhook fan-out, Turnstile for
  the public forms.
- The `scheduled` and `queue` no-ops (D-36) are where Phase 4's quote expiry and Phase 5's
  Stripe fan-out attach.
- The ported component set is what Phase 5's public surfaces and Phase 6/8's ops screens
  consume — the port's prop contracts are the interface those phases build against.

</code_context>

<specifics>
## Specific Ideas

- The owner supplied the brand-guideline folder mid-discussion and asked that the design system
  be checked against it as the latest source. It was, in this session: colours, type and logo
  geometry already match; the only gaps found are the two white logo variants (D-06) and the
  unexplained `#D4632B` swatch (D-07).
- On the CDN question the owner reasoned from the traveller's situation directly — "the
  traveler one is on airport wi-fi, the cdn will not work" — which is why D-31 rules out
  third-party script origins rather than merely preferring the bundle.
- The Arabic font is explicitly a placeholder-with-a-plan: use the best available now, swap
  when the designer sends one. D-22 keeps that swap to a token change.
- 404 behaviour was stated as "it should be translated but if even it get translated and there
  is a problem fallback to english" — D-20 records exactly that, not a redirect.

</specifics>

<deferred>
## Deferred Ideas

- **`#D4632B` product usage** — the colour is recorded as a token with no product role until
  the designer says what it is for. Open client-input item, not a Phase 1 blocker.
- **The designer's Arabic typeface** — swaps into D-22's token when it arrives.
- **The guideline's `PATTERNS/` PNGs** — the repo renders the checker pattern in CSS through
  `CheckerMark`; whether any raster pattern is needed is a Phase 5 question.
- **Freshpage → Cloudflare DNS sequencing risk** — raised as a possible area, not discussed.
  Phase 11 (Launch Cutover) owns it; Phase 1 only adds a subdomain record.
- **Where the four-language strings for the not-yet-used ported components come from** — with
  a full up-front port, most components render no product copy of their own, so this surfaces
  per-surface in Phase 5 rather than during the port.
- **The design system's own review scaffolds** (in-mock galleries, client-input notes) — stay
  English on purpose per `CLAUDE.md`; no production home needed.

</deferred>

---

*Phase: 1-Platform Foundation, Design System Port & i18n Runtime*
*Context gathered: 2026-08-20*
