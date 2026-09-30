<!-- GSD:project-start source:PROJECT.md -->

## Project

**Vamos Taxi V1**

A Swiss pre-booked airport-transfer platform, Zurich first — customers book a ride ahead of
time, get a fixed price, pay online, and a driver is waiting at the agreed pickup. It
replaces the current Freshpage CMS site with a Next.js application on Cloudflare Workers,
plus a signed-in ops console where dispatchers run the day. It is explicitly **not**
on-demand ride-hailing: no live GPS, no nearest-driver matching, no "arriving in 3 minutes".

The design phase is finished. Every screen already exists as a working `.dc.html` mock, the
brand system is vendored, and the build plan is written. This project is the production
build of that package — not a redesign of it.

**Core Value:** A customer can book a fixed-price transfer in under a minute and trust that the driver will
be there. If nothing else works, the booking funnel — quote, pay, confirmation — must.

### Constraints

- **Tech stack**: Next.js 15 App Router + TypeScript on Cloudflare Workers via `@opennextjs/cloudflare`; Supabase (Postgres, Auth, Storage, Realtime) behind Hyperdrive; Stripe standard; Resend; Mapbox; AeroDataBox; Cloudflare Queues, KV, R2, Turnstile, WAF — fixed by `HANDOFF-CLAUDE-CODE.md` §3, no Vercel anywhere
- **Design**: the bound Vamos design system is the only source of visual truth — never invent a colour, font, radius or shadow; compose from its components rather than restyling raw HTML
- **Four platform laws**: no glow, no tinted yellow or brownish surfaces, `CHF 000` until the matrix lands with `data-tok` gaps as labelled TBC pills, four languages in the same pass — a change that breaks one of these is wrong even if it looks fine
- **Localisation**: English, German, French and Arabic ship together, always. Arabic is first-class RTL — lay out with logical properties. Swiss German, "ss" not "ß"
- **Responsive**: every surface built desktop → tablet → mobile in the same pass, checked at 1440/1024/768/390. Nothing scrolls sideways at 390 px. Touch targets ≥ 44 px, 54 px for booking fields and primary CTAs
- **Timeline**: public site live in 2–3 weeks, ops console deepening after go-live. `GSD-LAUNCH.md` sizes the full Phases 0–9 at ~4 weeks, so the roadmap front-loads the booking funnel and ships ops at "enough to run the day"
- **Team**: solo, owner-built with AI assistance
- **Data residency**: Supabase pinned to eu-central (Frankfurt), closest to Zurich. Workers execute at the edge — whether booking routes need pinning near Frankfurt is still open with counsel
- **Security**: RLS on every customer or operational table, server-authoritative quotes, Stripe webhook signature verification, idempotent payment and booking creation, TOTP MFA for staff, no secrets in the repo, audit trail on booking/price/payment/assignment changes
- **Legal**: Swiss nFADP and GDPR — consent logged server-side, not cookie-only, because a browser cookie cannot prove consent to a regulator

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Overview

## Current State (Design Mocks)

### Languages

- JavaScript — runtime JSX compilation and state management in the mocks

### Runtime (Mocks)

- Browser (no Node.js build step for mocks)
- React 18.3.1 (from unpkg, SRI-pinned in `app/support.js`)
- ReactDOM 18.3.1 (from unpkg, SRI-pinned)
- @babel/standalone 7.29.0 (for JSX-to-JS compilation at load time)

### Frameworks & Build

- Declares icon and logo dependencies as `<meta name="ext-resource-dependency">`
- Loads `app/support.js` (compiled dc-runtime for Design Component rendering)
- Loads `design-system/_ds_bundle.js` (UMD-style global namespace)
- Loads React, ReactDOM, and Babel from unpkg on first page load (subsequent pages reuse cached libraries)
- `app/support.js` — compiles and runs Design Components (`<x-dc>` markup + JavaScript)
- `app/*/support.js` — identical copies in `home/`, `pages/`, `ops/` folders for relative path resolution

### CSS & Design Tokens

- Location: `design-system/`
- Entry point: `design-system/styles.css` (imports all token files, components, fonts)
- Token files: `tokens/fonts.css`, `tokens/colors.css`, `tokens/typography.css`, `tokens/spacing.css`, `tokens/elevation.css`, `tokens/motion.css`, `tokens/base.css`, `tokens/laws.css`
- Components: 100+ React components (Button, Input, Card, StatusBadge, Table, etc.)
- Fonts: Qurova (5 weights, display/figures), Poppins (4 weights, body/labels)
- `design-system/_ds_bundle.js` — all components as `window.VamosTaxiDesignSystem_245af1` namespace (UMD)

### Icons & Assets

- 57+ Lucide SVGs (ISC license) in `assets/icons/`, vendored verbatim from lucide-icons/lucide main branch
- Rendered as CSS masks through `Icon` component (no `<img>`, no `<svg>`)
- 9 brand SVGs in `assets/logo/` (wordmark/lockup/mark × primary/reversed/white)
- `assets/patterns/` — checker mark, checker tile (CSS-rendered through `CheckerMark` component)
- `assets/photography/` — one supplied V-Class reference photograph
- `design-system/.../assets/fonts/` — Qurova (5 weights), Poppins (4 weights)

### State Management (Mocks)

- `localStorage` only
- `VamosLocale` (`app/vamos-locale.js`) — language (en/de/fr/ar) + currency (CHF/EUR/USD/AED), platform-wide
- `VamosOps` (`app/vamos-ops-data.js`) — ops data contract: vehicles, chauffeurs, bookings, customers, coupons, routes, rates, surcharges, settings, profile
- `vamos-reviews.js` — published reviews store
- `vamos-page-transition.js` — cross-page transition animation state
- `app/vamos-i18n-dict.js` — 128+ strings × 4 languages (en, de, fr, ar) + regex patterns for concatenated strings

### Configuration

- No `.env` file (mocks use localStorage, no external config)
- Static file serving required (do not use `file://` URLs; relative paths require a server like `npx serve .`)
- No build configuration; `.dc.html` files are source and runnable as-is

### Package Managers

## Planned Production Stack (Next.js + Cloudflare + Supabase)

### Languages

- TypeScript (strict mode)

### Runtime

- Cloudflare Workers (serverless edge compute)
- Node.js compatibility flags enabled (for postgres.js driver)
- Next.js 15 (App Router, SSR/ISG)
- Built with `@opennextjs/cloudflare` (adapter that transforms Next.js into a Worker bundle)
- `wrangler` CLI (`@cloudflare/wrangler`)
- CI: GitHub Actions (on PR → build + preview; on main → deploy staging; on tag → deploy prod)

### Databases & Data Access

- Supabase (PostgreSQL, eu-central Frankfurt region, Pro plan)
- Direct connection string via **Cloudflare Hyperdrive** (pooled connection at the edge)
- SQL driver: `postgres.js` (or `pg`) with `max: 5` connections, prepared statements enabled
- Supabase Auth (email+password, email OTP for customers; invite-only staff with TOTP MFA)
- Supabase Storage (chauffeur-photos, vehicle-photos, review-photos buckets or Cloudflare R2)
- Supabase Realtime (ops board subscribers only, ≤ a few staff)
- `@supabase/ssr` — SSR cookie handling in Next middleware

### External Services

- Stripe standard (not Connect) — PaymentIntent, webhook handling, test-mode required before launch
- Resend — transactional email, templates in `packages/emails` (4 languages: en, de, fr, ar)
- Mapbox Geocoding + Directions APIs — cached in Cloudflare KV by place-id pair (24 h TTL)
- AeroDataBox or FlightAware — aviation API for flight autofill, cached in KV
- Queues — webhook fan-out (e.g., Stripe → multiple handlers)
- KV — geo cache, quote cache, flight data cache
- R2 — photo storage (alternative to Supabase Storage)
- Turnstile — CAPTCHA on public forms and quote API
- WAF — managed rules, rate limiting
- Cron Triggers — quote expiry, reminder emails, no-show sweep
- Logpush — structured logging

### Code Structure (Monorepo)

- `apps/web` — Next.js app (SSR + ops console route group)
- `packages/db` — Supabase migrations (SQL versioning)
- `packages/emails` — Resend email templates (React/JSX, 4 languages)

### Configuration

- Secrets matrix in `docs/build/GSD-LAUNCH.md` § Secrets
- Cloudflare: `HYPERDRIVE` binding, `STRIPE_WEBHOOK_SECRET`, `MAPBOX_TOKEN`, etc.
- Supabase: project URL, anon key, service role key
- Resend: API key
- Stripe: live + test keys
- Supabase region: **eu-central (Frankfurt)** — closest to Zurich
- Stripe currency: CHF (standard, not Connect)
- Cloudflare compute: `compatibility_date >= 2024-09-23` (required by postgres.js)

### Build & Deployment

- `opennextjs-cloudflare build` → `dist/` folder with Worker code
- `wrangler deploy` → deploys to Cloudflare Workers
- `dev` (local `wrangler dev` + `supabase start`)
- `staging` (staging.vamostaxi.eu, Micro compute)
- `prod` (vamostaxi.eu, sized in Phase 8)
- Domain: `vamostaxi.eu` (currently on Freshpage/Inware PHP site)
- Cutover planned Phase 9 (301 redirect map, live checklist, one-week watch)

### Design System (Production)

- Copy from `design-system/tokens/*.css` into `apps/web/public/brand/` (unchanged, including `tokens/laws.css` as final import)
- React components rebuilt from design-system source, keeping same class names (CSS stays verbatim)
- Fonts: copy Qurova + Poppins from `design-system/.../assets/fonts/`
- Icons: copy Lucide SVGs from `assets/icons/` (or serve via CSS mask)
- Logo: copy SVGs from `assets/logo/`

## Key Decisions

| Concern | Decision | Rationale |
|---|---|---|
| **No Vercel** | Cloudflare Workers only | No ISR, no image optimization; every feature must work on OpenNext + Workers |
| **EU-hosted** | Supabase eu-central (Frankfurt) | Closest to Zurich; GDPR compliance |
| **SQL over ORM** | `postgres.js` via Hyperdrive | Direct SQL, prepared statements, pooling at the edge |
| **No second database** | Supabase primary only | Auth, Storage, Realtime included; no separate Redis needed (KV for ephemeral cache) |
| **Stripe standard** | Not Connect | Simpler for a single-entity taxi service; no marketplace multi-pay |
| **One app, two routes** | Ops is route group `/(ops)/ops/*` | Same Next app, same deploy, role-gated by JWT claim `role` |
| **Amounts as `CHF 000`** | Until matrix lands | Never invent prices; `pricing_live=false` flag gates checkout; flag flip is launch trigger |
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Overview

## The Four Platform Laws (binding)

### Law 01 · No Glow, Ever

- `--vt-shadow-accent: none` must be set in every `.dc.html` file's `:root` style block (neutralises design system's default yellow button hover glow)
- Text inputs get `.vt-input--focus { box-shadow: none }` — focus signal is the charcoal border only (no yellow ring)
- **Allowed instead:** colour step on hover · `translateY(1px)` on press · `--vt-ring` (charcoal/yellow ring) on focus for buttons, checkboxes, rows, cards
- Neutral shadow tokens (`--vt-shadow-xs`…`--vt-shadow-xl`) are OK; yellow/tinted shadows are not
- `design-system/tokens/laws.css` (imported last, overrides everything)
- Every `.dc.html` file in `app/` sets both lines in `<helmet><style>:root { --vt-shadow-accent: none } .vt-input--focus { box-shadow: none }</style></helmet>`

### Law 02 · No Tinted Yellow

- Never use `--vt-yellow-50` / `-100` / `-200` / `-300` as backgrounds or borders (cream panels, pale icon tiles, tinted alert strips are banned)
- Never use `--vt-yellow-600` / `-700` as text or icon colour (reads brown, not gold)
- This includes design-system component defaults that ship tinted: `Alert tone="accent"` (yellow-50), `ListRow icon=…` (yellow-50 lead), `Badge tone="warning"` — use `tone="inverse"` / `tone="info"` / charcoal / white with `--vt-border-subtle` hairline instead
- When a kit component has no untinted variant, build from tokens rather than shipping the tint
- Attention is carried by: charcoal · full-strength yellow on charcoal · semantic `--vt-danger` / `--vt-success`
- `design-system/tokens/laws.css` aliases `--vt-yellow-50…300` to white/grey and `-600/-700` to charcoal automatically
- `design-system/tokens/colors.css` defines the raw scale; only `-400` and `-500` remain yellow

### Law 03 · Four Languages, Same Pass

- Every visible string — including `placeholder`, `aria-label`, `title`, `alt` — must resolve in `app/vamos-i18n-dict.js` with `de`, `fr`, `ar`
- Strings the code concatenates go in `patterns` as regex entries (never untranslated because it has a number)
- Arabic is RTL and first-class: lay out with **logical properties** (`margin-inline-start`, `inset-inline-end`, `padding-inline`), never `left`/`right` for anything carrying text
- The runtime sets `dir="rtl"` on the document when Arabic is active
- Long-form legal pages that genuinely only exist in some languages carry `data-vt-legal="<languages>"` on `<main>` instead of pretending
- Internal copy (review scaffolds, TBC labels) stays English on purpose
- Production: `vamos-i18n-dict.js` becomes the `content_strings` table; admin edit UI is the ops Content screen; routes get `hreflang` (`/de/…`)
- Run `VamosLocale.coverage(root)` on every new surface — it returns the list of untranslated strings
- Check the surface in German at 1080px (strings grow ~30%) and in Arabic with `dir="rtl"`

### Law 04 · A Pending Value is a Labelled Gap

- Markup: `<span data-tok>free cancel window</span>` before pickup
- CSS appends `TBC`, so it reads "free cancel window TBC" — legible in review, impossible to mistake for data, searchable when the answer lands
- Never invent a CHF price, even in tests or fixtures visible to a reviewer (Phase 4 flag `pricing_live=false` keeps checkout disabled until the owner approves the real matrix)
- Use `VamosLocale.money(null)` → `CHF 000` for placeholder amounts; `money(n)` only when the real number lands
- Production: `data-tok` pills disappear one at a time as answers land; the number comes from the `settings` table, not copy
- Punch list: `grep -r 'data-tok' app/` + `docs/LEGAL-PLACEHOLDER-CHECKLIST.md` tracks who owes each one

## Naming Patterns

### Files

- Pattern: `PascalCase.dc.html`
- Examples: `home.dc.html`, `SiteHeader.dc.html`, `AuthForm.dc.html`, `OpsReviews.dc.html`
- Scope: Page files live in `app/home/`, `app/pages/`, `app/ops/`; shared components live in `app/home/`, referenced via `<dc-import name="ComponentName" …>`
- Pattern: `kebab-case.dc.html` or `PascalCase.dc.html` depending on component type
- Examples in `app/pages/`: `checkout.dc.html`, `confirmation.dc.html`, `sign-in.dc.html`, `account.dc.html`, `manage-booking.dc.html`, `about.dc.html`, `terms.dc.html`
- Pattern: `vamos-*.js`
- Examples: `vamos-locale.js`, `vamos-i18n-dict.js`, `vamos-ops-data.js`, `vamos-reviews.js`, `vamos-page-transition.js`
- Loaded in every page's `<helmet>` after design-system bundle
- Pattern: `support.js`
- Copied to each folder (`app/`, `app/home/`, `app/pages/`, `app/ops/`); they are identical

### CSS Custom Properties

- Pattern: `--vt-*`
- Namespaces:
- Pattern: `.vt-*`
- Examples: `.vt-input--focus`, `.vt-nav-lo`, `.vt-nav-md`, `.vt-dir-keep` (keep LTR inside RTL text)
- Never invent local CSS class names; use `[data-*]` for layout rules instead

### Data Attributes

- Pattern: `data-*` (hyphenated)
- Examples: `data-bookcard="1"`, `data-upto-wide="1"`, `data-hide-narrow="true"`, `data-fields="1"`, `data-sugroot="1"`, `data-shell="1"`, `data-sheetbody="1"`, `data-sheetonly="1"`, `data-scroll-native` (native scrolling inside region), `data-om-label="Flight"` (observer/instrumentation)
- **Purpose:** Responsive layout rules hang off these attributes; they are **never class selectors** (CSS classes are design-system only)
- **Localisation:** `data-vt-no-i18n` (or `translate="no"`) opts a subtree out of translation — the runtime does not read `data-i18n-skip`; `data-vt-legal="<languages>"` marks legal pages with restricted language coverage
- Pattern: `data-tok`
- Markup: `<span data-tok>policy number here</span>`
- CSS in `design-system/tokens/laws.css` appends ` TBC` visually
- Pattern: `data-props` declaration in the component's `<helmet>` (not visible in mocks, but tooling reads it for documentation)

## Code Style

### Markup Language

### Styling

### JavaScript

- `window.VamosLocale` — language + currency; `setLang()`, `setCur()`, `onChange()`, `t()`, `money()`, `coverage()` (verification of translation completeness)
- `window.VamosOps` — ops data; collections + singletons with `all()`, `get()`, `add()`, `update()`, `onChange()`, `reset()`
- `window.VamosAuth` (customer) and `window.VamosOpsAuth` (staff) — placeholder auth mocks; production uses Supabase Auth + custom JWT claims
- Never read `localStorage.vamosLang` / `vamosCurrency` directly; always use `VamosLocale.setLang(v)` / `setCur(v)`
- Never reload the page to apply a choice; `setLang()` relabels the DOM in place
- For concatenated strings (e.g., "60 minutes waiting included"), put them in `patterns` in `vamos-i18n-dict.js` as regex entries
- For currency: always use `VamosLocale.money(amount)`, never hard-coded `CHF` strings

## Responsive Design

### Breakpoints (no breakpoint media queries needed; use fluid + logical properties)

| Range | Name | Use |
|-------|------|-----|
| ≥ 1181px | desktop | full nav, booking widget floats over hero, ops runs sidebar + sticky detail panel |
| 1081–1180px | desktop narrow | nav links drop (`.vt-nav-lo`), ops columns collapse at 1240px |
| 681–1080px | tablet | header 60px, booking widget stacks, hero padding tightens, grids go 2-up at 900px, `.vt-nav-md` drops at 1000px |
| ≤ 680px | mobile | all 1-up, header shows mark + menu (phone is the ContactFab overlay), booking widget stacks first, tables scroll |

### Fixed Constraints

- Container: `1200px`
- Gutter: `clamp(20px, 5vw, 56px)`
- Sticky header: `76px` (60px under 1080px)
- Sticky right rail (quote/checkout): `top: 96px`
- Ops sidebar: fixed `236px`
- Control heights: `36px` (small) / `44px` (standard, minimum for touch) / `54px` (booking widget fields and primary CTAs)
- Nothing scrolls sideways at 390px
- Touch targets: **44px minimum** (54px for booking-widget fields and primary CTAs)
- Body copy: never below 13px
- German text grows ~30%; Arabic reverses direction — check every new surface in both before saying done

### Implementation Patterns

## Localisation

### Dictionary Structure

### Runtime API

| Call | Behaviour |
|------|-----------|
| `VamosLocale.setLang('en'\|'de'\|'fr'\|'ar')` | relabel entire page in place (no reload), set `lang` + `dir`, persist |
| `VamosLocale.setCur('CHF'\|'EUR'\|'USD'…)` | re-render every `[data-money]` element |
| `VamosLocale.onChange(fn)` | subscribe to lang/cur changes; `fn({lang, cur})`; returns unsubscribe |
| `VamosLocale.t(str)` | one string in active language (keyed by English source) |
| `VamosLocale.money(n)` | `CHF 1'250.00` or `CHF 000` if `n` is `null` |
| `VamosLocale.observe()` | keep translating nodes React adds after boot (production only) |
| `VamosLocale.coverage(root)` | list untranslated strings under a DOM node — **run on every new surface before calling done** |

### Arabic-Specific

- The runtime sets `dir="rtl"` on the document; never set it per-element
- Use logical properties everywhere: `margin-inline-start`, `inset-inline-end`, `padding-inline`, `float: inline-start`
- Put `.vt-dir-keep` on anything that must stay LTR inside Arabic: references, times, flight numbers, CHF figures, codes like `VT-4821`
- Use `[data-vt-no-i18n]` (or `translate="no"`) to opt a subtree out of translation (e.g., a language switcher that labels itself in its own language)
- Check every new surface in Arabic with `dir="rtl"` before saying done; `VamosLocale.coverage(root)` must return empty

## Scrolling is native

Scrolling is native. No smooth-scroll library: Lenis and the design system's own scroller were removed on 2026-09-30 because they made scrolling glitch (the design-system scroller restyled the whole page on every scroll event). Wheel, trackpad, touch and keyboard scrolling stay browser-native on every surface; never add Lenis or any scroll-hijacking library, and never write a custom property on `<html>` from a scroll handler. In-page jumps call `window.scrollTo` with `behavior: 'auto'` under `prefers-reduced-motion` and `'smooth'` otherwise, offset -88 for the sticky header; `home.dc.html` keeps its own `html{scroll-behavior:smooth}` (no-preference only). A panel that owns its own scroll uses plain `overflow` plus `overscroll-behavior: contain`.

## Copy Voice

- **Sentence case** — headlines, buttons in long form, nav, chips (only the first word and proper nouns capitalised)
- **UPPERCASE** — button labels, field kickers, table headers, badges, eyebrows (typographic emphasis only, never a whole sentence)
- CTAs are **uppercase** (settled with client, July 2026)
- Confident, plain, second person — address the traveller as *you*; the company is *we*
- Short sentences stating facts you can be held to
- Present tense, active voice: "Your driver is waiting at 08:15" not "A driver has been dispatched"
- Never: emoji, invented stats, stock filler copy, "48,350+ routes worldwide" (unverifiable)
- Figures set in Qurova, stated exactly: `60 minutes`, `24 hours`, `18.4 km`
- Currency always `CHF` with a space: `CHF 000` (mocks) / `CHF 1'250.00` (when real)
- Never invent a price, even in tests or screenshots
- Use `VamosLocale.money()` in logic; amounts stay `000` in markup until the matrix lands
- Field hints explain *why*: "Your voucher goes here"
- Error messages are instructions, not blame: "Check the flight number"
- Reassurance near money: "No charge until the last step"
- Ops copy is neutral and literal: "Awaiting payment", "Driver assigned", "Refund due"
- German strings grow ~30%; keep hints short
- "Ride with class" (tagline is set artwork, never change it)
- Product names vary (always `Vamos Taxi`, `Economy`, `Business`, `Van luxury` — Latin in every language, Arabic included, D-14a)
- Codes/references change (always `ZRH`, `CHF`, `VT-4821`)
- Copy inside `[data-tok]` pills is deliberately not translated — it stays English in every
  language, matching `design-system/readme.md` §9 (corrected 2026-08-19; see `.planning/ADR-011-data-tok-labels-stay-english.md`)

## Error Handling

- Form field: `error="{{ message }}"` on the component; it renders in red with the text
- Toast/alert: semantic colour (`--vt-danger` for critical, `--vt-warning` for recoverable)
- HTTP: graceful degradation (flight autofill API down → prompt for manual time)
- Validation: "Check the flight number" not "Invalid flight"
- Always offer next step (retry, alternative, contact support)
- Keep error state until the user fixes the input

## Comments

- Complex business logic (pricing surcharge calculation, RLS policy intent)
- Non-obvious state management (why a flag is in localStorage vs Supabase)
- Workarounds and their expiry conditions
- Every exported function gets a doc block
- Parameter types and return types required
- Link to design spec or issue if not obvious
- Example: `/** Locks a quote for 30 minutes or until payment. See Phase 4 in GSD-LAUNCH.md. */`
- Scaffold comments explain special decisions (e.g., why the boot overlay exists; why icon URLs are declared in `<meta>`)
- No verbose commenting of obvious code

## Icon Usage

- Navigation: `plane-landing`, `plane-takeoff`, `map-pin`, `navigation`, `arrow-right`, `chevron-*`
- Time/date: `calendar`, `clock`, `calendar-days`
- Capacity: `users`, `luggage`, `baby` (child seat)
- Vehicle: `car-front`, `car`, `bus`
- Money/receipt: `credit-card`, `banknote`, `receipt`, `ticket` (coupon), `funnel` (filter)
- Actions: `pencil` (edit), `log-out`, `menu`, `search`, `ellipsis` (more), `plus`, `minus`
- Status: `check`, `circle-check`, `shield-check`, `bell` (notification), `circle-alert`, `triangle-alert`
- Other: `snowflake` (ski route), `briefcase` (business class), `info`

## File Structure Guidance

### Where to Add New Code

- Location: `app/pages/<name>.dc.html` (public) or `app/ops/<name>.dc.html` (staff)
- Shell: use `<dc-import name="SiteHeader" …>` + page content + `<dc-import name="SiteFooter">`
- Exception: ops uses `<dc-import name="OpsSidebar">` instead of header
- Location: `app/home/<ComponentName>.dc.html` or `app/ops/<ComponentName>.dc.html`
- Example: `Reviews.dc.html`, `FAQ.dc.html`, `AuthForm.dc.html`
- Import via `<dc-import name="ComponentName" …>` in parent page
- Location: `app/vamos-*.js`
- Pattern: `vamos-<purpose>.js` (e.g., `vamos-locale.js`, `vamos-ops-data.js`)
- Loaded in every page after design-system bundle
- No local CSS files in mocks (design system tokens only)
- Production: copy `design-system/tokens/` and `design-system/styles.css` into `apps/web/public/brand/` (or wire via `@import` in `app/globals.css`); `tokens/laws.css` **must** stay the last import
- Never invent colours, shadows, radii, or type scales — use `--vt-*` tokens or derive from them
- Never override design-system token values in local CSS — they are enforced by law

### Responsive Layout Checklist

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

- **Running HTML mocks** (`.dc.html` files) that execute in the browser with client-side React logic
- **Vendored design system** (`design-system/`) with bundled components, tokens, and assets
- **Shared runtime contracts** for data flow (the `vamos-*.js` suite)
- **Planning documentation** for the future production build

## Current State: Design Package Architecture

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Home Surface** | Marketing + live booking widget | `app/home/home.dc.html` |
| **Home Sections** | Hero, services, reviews, FAQ, why-vamos, how-it-works | `app/home/{Services,Reviews,FAQ,…}.dc.html` |
| **Shell (Public)** | Sticky header (inverse variant) + footer (mandatory on every page) | `app/pages/{SiteHeader,SiteFooter}.dc.html` |
| **Shell (Ops)** | Sidebar navigation; no public header/footer | `app/ops/OpsSidebar.dc.html` |
| **Pages (18)** | Sign-in, account, bookings, checkout, confirmation, legal, marketing | `app/pages/{sign-in,account,checkout,…}.dc.html` |
| **Ops Screens (13)** | Dashboard, board, detail, fleet, pricing, settings, content, reviews, etc. | `app/ops/{OpsDash,OpsBoard,OpsDetail,…}.dc.html` |
| **Locale Runtime** | Single language + currency store + broadcast | `app/vamos-locale.js` |
| **i18n Dictionary** | 128+ strings × en/de/fr/ar + regex patterns | `app/vamos-i18n-dict.js` |
| **Ops Data Store** | 8 collections (vehicles, chauffeurs, bookings, …) + 2 singletons | `app/vamos-ops-data.js` |
| **Design System** | 50+ components (Button, Card, Input, Table, etc.) + tokens | `design-system/_ds_bundle.js` |

## Pattern Overview

- **No build step or bundler** — `.dc.html` files run directly in the browser
- **Single React instance per page** — one `class Component extends DCLogic` root per `.dc.html`
- **Declarative component nesting** — sibling components via `<dc-import>`, design-system components via `<x-import component-from-global-scope="…">`
- **Centralized state management** — `VamosLocale` (language/currency), `VamosOps` (collections), `VamosReviews` (published reviews)
- **localStorage persistence** — mock data survives page reloads; no server calls
- **Realtime locale dispatch** — `vamos:locale` custom event broadcasts lang/cur changes to all pages in-place (no reload)
- **Inline CSS only** — no CSS-in-JS, no CSS modules; styles live in `<style>` tags and as `var(--vt-*)` tokens

## Layers

- Purpose: Self-contained, runnable page or reusable section with its own React logic class
- Location: `app/{home,pages,ops}/`, `app/{home,pages,ops}/*.dc.html`
- Contains: Static `<head>` + `<helmet>` block + markup + `<script type="text/x-dc" data-dc-script>` logic
- Depends on: `support.js` (DC runtime), design-system bundle, shared runtimes (vamos-locale, etc.)
- Used by: Pages import components via `<dc-import>`, production Next.js will port these as React components
- Purpose: Cross-page state & broadcast layer that survives page transitions without reloading
- Location: `app/vamos-*.js`
- Pattern: Factory function or singleton that exports a public API; listens to custom events + localStorage changes
- Lifecycle: Loaded once in the `<helmet>` of every page; persists for the lifetime of the tab
- Purpose: UMD bundle exposing 50+ React components + token values + utilities
- Location: `design-system/_ds_bundle.js` (compiled), source in Figma
- API: `window.VamosTaxiDesignSystem_245af1.Button`, `.Card`, `.Input`, `.Icon`, etc.
- Tokens: CSS custom properties loaded from `design-system/tokens/*.css`
- Styling: Inline CSS only; no external stylesheets for component internals
- Purpose: Icons, logos, fonts, photography, patterns
- Location: `assets/{icons,logo,patterns,photography}/`, `design-system/assets/fonts/`
- Icons: Lucide SVGs (ISC); loaded as CSS masks via `Icon` component
- Fonts: Qurova (5 weights) + Poppins; loaded from design-system fonts folder

## Data Flow

### Primary Request Path: Booking Funnel

### Secondary Flow: Account & Bookings (Signed-In Customer)

### Tertiary Flow: Ops Console (Staff)

### State Management

- **Language + Currency**: `VamosLocale` singleton; reads/writes `localStorage.vamosLang` + `vamosCurrency`; broadcasts `vamos:locale` event
- **Booking in progress**: `localStorage.vamosTrip` (JSON); survives page refreshes
- **Signed-in user**: `localStorage.vamosAuthUser` (mock); production uses Supabase Auth cookie
- **Ops data**: `VamosOps.{collection}` API; reads/writes `localStorage` by collection key; fires `vamos:ops` event on write
- **Reviews**: `VamosReviews` singleton; reads from localStorage; shared by home + ops

## Key Abstractions

- Purpose: Encapsulate a page or reusable section's state + handlers + render values
- Pattern: `state = { … }`, `componentDidMount()`, `setField()`, `renderVals()` methods that return template props
- Lifecycle: Mount (subscribe to locale, ops, reviews events) → render → unmount (unsubscribe)
- Used by: Every `.dc.html` page; production port will become React function components
- `<dc-import name="SiteHeader" variant="inverse" …>` → mounts sibling `.dc.html` design component
- `<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Button" …>` → mounts bundled design-system component
- Props pass via attributes; callbacks via onChange/onClick handlers bound to `renderVals()` return values
- API like `VamosLocale.setLang(v)`, `VamosLocale.onChange(fn)`, `VamosLocale.t(key)` (string lookup)
- Listeners array + custom event dispatch; localStorage reads/writes with versioning (`v: VERSION`)
- Used by: Every page that needs locale, ops data, or reviews
- Tokens: CSS custom properties (`var(--vt-accent)`, `var(--vt-radius-lg)`, etc.) loaded from `design-system/tokens/*.css`
- Components: Methods on bundled scope (`VamosTaxiDesignSystem_245af1.Button(props)`) compiled from Figma
- No external CSS files per component; all styling is either inline `<style>` or token-based

## Entry Points

- Location: `app/home/home.dc.html`
- Triggers: Direct navigation or link from any page's "Book Transfer" button
- Responsibilities: Render hero + hero overlay header + services grid + reviews + FAQ + why-vamos + how-it-works sections + sticky booking widget; broadcast locale changes
- Location: `app/pages/{sign-in,checkout,account,…}.dc.html`
- Triggers: Navigation from links or internal routing
- Responsibilities: Render page content; always mount `SiteHeader` (variant="inverse") + `SiteFooter`; relay locale/ops changes; validate forms on submission
- Location: `app/ops/ops.dc.html` (shell), `app/ops/{OpsBoard,OpsDetail,…}.dc.html` (screens)
- Triggers: ops-login → sets `vamosOpsAuth` → shell unlocks via auth check
- Responsibilities: Render sidebar + main screen; read/write via `VamosOps` API; broadcast `vamos:ops` events on change; show real-time updates via Realtime subscription (production)

## Architectural Constraints

- **No build step:** .dc.html files are deployed as-is; no bundler, no minification, no code splitting
- **Single React version:** React 18.3.1 from unpkg; all pages share it; no version conflicts
- **Global scope pollution (by design):** Design-system components live on `window.VamosTaxiDesignSystem_245af1.*`; shared runtimes on `window.Vamos*`
- **localStorage only:** No server calls; no real database until production; mock data resets via `VamosOps.resetAll()`
- **No async/await:** All code is ES5-compatible (Babel transpiles in-browser); no Promise chains visible in mocks
- **Custom events for broadcast:** `vamos:locale` + `vamos:ops` + `storage` event (cross-tab); no internal event bus
- **No circular imports:** Design component imports are acyclic (home → sections → header/footer, pages → header/footer, ops → sidebar → screens); production must preserve this
- **Inline CSS only:** All styling in `<style>` or `var(--vt-*)`; no external `.css` file per component; exception: design-system bundle includes its own CSS

## Anti-Patterns

### Inventing Prices

### Hardcoding Language Strings

### Restyling Design-System Components Inline

### Glow Effects on Hover/Focus

### Tinted Yellow / Brownish Surfaces

## Error Handling

- Form validation errors stored in component state (`errors.firstName`, etc.); each field shows its error message or nothing
- Mock API calls (hypothetical) would use try/catch with fallback to default values (see `readTrip()` in `checkout.dc.html`)
- Webhook safety: checksum verify (Stripe); deduplication via `stripe_events` table (production Phase 5)
- Network failure: production will add retry logic + offline detection; mocks have no network

## Cross-Cutting Concerns

## End-State Architecture (Production Handoff)

```

```
| Mock | Production Route | Type |
|------|------------------|------|
| `app/home/home.dc.html` | `/` | SSG + client widget |
| `app/pages/{checkout,confirmation}.dc.html` | `/checkout`, `/confirmation/[ref]` | SSR |
| `app/pages/{sign-in,reset-password}.dc.html` | `/sign-in`, `/reset-password` | SSR + Supabase Auth |
| `app/pages/{account,bookings,booking-detail}.dc.html` | `/account`, `/account/bookings[/[ref]]` | SSR + RLS |
| `app/pages/manage-booking.dc.html` | `/manage-booking` | SSR + tokened link |
| `app/pages/{about,contact,become-a-partner}.dc.html` | `/about`, `/contact`, `/partners` (or static/ISR) | ISR |
| `app/pages/{terms,privacy,cookies,…}.dc.html` | `/legal/terms`, `/legal/privacy`, `/legal/cookies` | ISR + versioning |
| `app/ops/*` | `/(ops)/ops/*` (role-gated route group in same app) | SSR + Supabase Realtime |

- React → React Server Components (RSC) for public pages (SSG/ISR); Client Components for interactive sections
- localStorage persistence → Supabase SQL + Auth
- `VamosLocale`, `VamosOps`, `VamosReviews` runtimes → API routes + Supabase queries
- Design-system `.dc.html` components → React components imported from `@/components`
- Design tokens (CSS custom properties) → same, but now served from Cloudflare edge
- i18n dict → moves to `content_strings` table + admin edit UI (ops Content screen)
- Ops Realtime → Supabase Realtime subscription on `bookings` table
- Pricing → Phase 4 `/api/quote` endpoint (Mapbox geocoding + distance matrix + rate lookup)

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
