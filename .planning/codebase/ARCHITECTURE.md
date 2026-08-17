<!-- refreshed: 2026-08-17 -->
# Architecture

**Analysis Date:** 2026-08-17

## System Overview

This is a **design package**, not a production application. It contains:
- **Running HTML mocks** (`.dc.html` files) that execute in the browser with client-side React logic
- **Vendored design system** (`design-system/`) with bundled components, tokens, and assets
- **Shared runtime contracts** for data flow (the `vamos-*.js` suite)
- **Planning documentation** for the future production build

The architecture today is **static HTML + ES5 JavaScript hosted on a static server**, implementing a three-surface booking platform (customer home + public pages + dispatch console). The production handoff target is **Next.js 15 App Router on Cloudflare Workers** (see §End-State Architecture below).

## Current State: Design Package Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                   Three Runnable Surfaces                    │
├──────────────────────┬──────────────────┬──────────────────┤
│  Home + Sections     │  18 Public Pages │   13 Ops Screens │
│ app/home/*.dc.html   │ app/pages/*.dc.html│ app/ops/*.dc.html│
│ (booking widget)     │ (account, legal)  │ (staff console)  │
└────────┬─────────────┴────────┬─────────┴────────┬──────────┘
         │                      │                   │
         ▼                      ▼                   ▼
┌──────────────────────────────────────────────────────────────┐
│              Shared Runtime Data-Flow Layer                   │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ app/vamos-locale.js         — language + currency store│ │
│ │ app/vamos-i18n-dict.js      — 128+ strings × 4 langs   │ │
│ │ app/vamos-ops-data.js       — 8 collections + 2 stores │ │
│ │ app/vamos-reviews.js        — shared reviews cache     │ │
│ │ app/vamos-page-transition.js— page-transition overlays │ │
│ │ assets/lenis-boot.js        — single scroll instance   │ │
│ └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│        Design System + Vendored Dependencies                  │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ design-system/_ds_bundle.js    — 45KB UMD components   │ │
│ │ design-system/tokens/*.css     — colors, type, spacing │ │
│ │ design-system/styles.css       — component registry    │ │
│ │ assets/                        — icons, logos, photos  │ │
│ │ assets/lenis.js                — scroll engine (MIT)   │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────┐
│              Client Runtime + Storage Layer                    │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ app/support.js (↑3 copies)  — DC mini-framework        │ │
│ │ localStorage                — mock state persistence   │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
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

**Overall:** Static HTML mocks with **client-side React rendering** (via `@babel/standalone` + React 18.3.1 from unpkg), state-machine lifecycle transitions, and design-system composition.

**Key Characteristics:**
- **No build step or bundler** — `.dc.html` files run directly in the browser
- **Single React instance per page** — one `class Component extends DCLogic` root per `.dc.html`
- **Declarative component nesting** — sibling components via `<dc-import>`, design-system components via `<x-import component-from-global-scope="…">`
- **Centralized state management** — `VamosLocale` (language/currency), `VamosOps` (collections), `VamosReviews` (published reviews)
- **localStorage persistence** — mock data survives page reloads; no server calls
- **Realtime locale dispatch** — `vamos:locale` custom event broadcasts lang/cur changes to all pages in-place (no reload)
- **Lenis scroll unified** — single global instance owned by `assets/lenis-boot.js`; all pages share it
- **Inline CSS only** — no CSS-in-JS, no CSS modules; styles live in `<style>` tags and as `var(--vt-*)` tokens

## Layers

**Design Component (`.dc.html` file):**
- Purpose: Self-contained, runnable page or reusable section with its own React logic class
- Location: `app/{home,pages,ops}/`, `app/{home,pages,ops}/*.dc.html`
- Contains: Static `<head>` + `<helmet>` block + markup + `<script type="text/x-dc" data-dc-script>` logic
- Depends on: `support.js` (DC runtime), design-system bundle, shared runtimes (vamos-locale, etc.)
- Used by: Pages import components via `<dc-import>`, production Next.js will port these as React components

**Shared Runtime (data-flow contracts):**
- Purpose: Cross-page state & broadcast layer that survives page transitions without reloading
- Location: `app/vamos-*.js`, `assets/lenis-boot.js`
- Pattern: Factory function or singleton that exports a public API; listens to custom events + localStorage changes
- Lifecycle: Loaded once in the `<helmet>` of every page; persists for the lifetime of the tab

**Design System:**
- Purpose: UMD bundle exposing 50+ React components + token values + utilities
- Location: `design-system/_ds_bundle.js` (compiled), source in Figma
- API: `window.VamosTaxiDesignSystem_245af1.Button`, `.Card`, `.Input`, `.Icon`, etc.
- Tokens: CSS custom properties loaded from `design-system/tokens/*.css`
- Styling: Inline CSS only; no external stylesheets for component internals

**Assets & Branding:**
- Purpose: Icons, logos, fonts, photography, patterns
- Location: `assets/{icons,logo,patterns,photography}/`, `design-system/assets/fonts/`
- Icons: Lucide SVGs (ISC); loaded as CSS masks via `Icon` component
- Fonts: Qurova (5 weights) + Poppins; loaded from design-system fonts folder

## Data Flow

### Primary Request Path: Booking Funnel

1. **Home page loads** (`app/home/home.dc.html`; URL: `http://localhost:3000/app/home/home.dc.html#fleet`)
   - Initializes `VamosLocale` (reads `localStorage.vamosLang` / `vamosCurrency`; defaults en/CHF)
   - Mounts booking widget (searches for flights, picks a service, selects date/time/class)
   - Widget writes `localStorage.vamosTrip` on every change
   - `SiteHeader` (variant="overlay") floats when hero scrolls down
   
2. **Click "Book Transfer"** → navigates to checkout
   - Reads `localStorage.vamosTrip` + fills passenger form
   - Writes coupon, guest vs. account choice
   - On "Pay": validates, generates booking ref (e.g., `VT-5234`), saves to `localStorage.vamosTrip` with `bookingRef`, navigates to confirmation

3. **Confirmation page** (`app/pages/confirmation.dc.html`; URL: `app/pages/confirmation.dc.html`)
   - Reads booking ref + display details from `localStorage.vamosTrip`
   - Shows ICS download link (mock; production will generate real ICS)
   - Offers "Manage Booking" link (deep-links to manage-booking page)

4. **Manage Booking page** (`app/pages/manage-booking.dc.html`; URL: `app/pages/manage-booking.dc.html`)
   - Two entry points: ref + email lookup **and** tokened link
   - Shows booking lifecycle, cancellation policy, manage link

### Secondary Flow: Account & Bookings (Signed-In Customer)

1. **Sign-in page** (`app/pages/sign-in.dc.html`; URL: `app/pages/sign-in.dc.html`)
   - Mock: toggles `localStorage.vamosAuthUser = { id, name, email }`
   - Production: Supabase Auth (email+password + OTP + phone verify)
   - States: `AuthForm` (login) → `AuthStates` (MFA pending) → `PhoneVerify` (OTP)

2. **Account page** (`app/pages/account.dc.html`; URL: `app/pages/account.dc.html`)
   - Reads signed-in user from localStorage
   - Shows profile, contact details, email/phone re-verify forms

3. **Bookings list** (`app/pages/bookings.dc.html`; URL: `app/pages/bookings.dc.html`)
   - Mock: reads array from localStorage
   - Renders `BookingRow` component for each booking
   - Clicking a row navigates to booking-detail

4. **Booking detail** (`app/pages/booking-detail.dc.html`; URL: `app/pages/booking-detail.dc.html`)
   - Shows full lifecycle (quote → pending → paid → confirmed → assigned → completed)
   - Renders `booking_events` timeline (mock data in localStorage)

### Tertiary Flow: Ops Console (Staff)

1. **Ops login** (`app/ops/ops-login.dc.html`; URL: `app/ops/ops-login.dc.html`)
   - Mock: sets `localStorage.vamosOpsAuth = true` + password check
   - Production: Supabase Auth with staff `role` claim + TOTP MFA

2. **Ops shell** (`app/ops/ops.dc.html`; URL: `app/ops/ops.dc.html`)
   - Loads `VamosOps` (reads all 8 collections from localStorage)
   - Mounts `OpsSidebar` (left navigation)
   - Router links to 13 screens (dashboard, board, detail, fleet, pricing, etc.)
   - Production: Supabase Realtime on `bookings` table for live board updates

3. **Ops screens** (e.g., `OpsBoard.dc.html`, `OpsDetail.dc.html`)
   - Read/write via `VamosOps.{collection}.all()`, `.get()`, `.update()`, etc.
   - Fire `vamos:ops` custom event on write; listeners re-render
   - Booking detail shows timeline of `booking_events`; new event creates an append

### State Management

- **Language + Currency**: `VamosLocale` singleton; reads/writes `localStorage.vamosLang` + `vamosCurrency`; broadcasts `vamos:locale` event
- **Booking in progress**: `localStorage.vamosTrip` (JSON); survives page refreshes
- **Signed-in user**: `localStorage.vamosAuthUser` (mock); production uses Supabase Auth cookie
- **Ops data**: `VamosOps.{collection}` API; reads/writes `localStorage` by collection key; fires `vamos:ops` event on write
- **Reviews**: `VamosReviews` singleton; reads from localStorage; shared by home + ops
- **Scroll state**: `assets/lenis-boot.js` owns single Lenis instance; `data-lenis-prevent` on nested scrollers

## Key Abstractions

**Design Component (`class Component extends DCLogic`):**
- Purpose: Encapsulate a page or reusable section's state + handlers + render values
- Pattern: `state = { … }`, `componentDidMount()`, `setField()`, `renderVals()` methods that return template props
- Lifecycle: Mount (subscribe to locale, ops, reviews events) → render → unmount (unsubscribe)
- Used by: Every `.dc.html` page; production port will become React function components

**Component Import Tags:**
- `<dc-import name="SiteHeader" variant="inverse" …>` → mounts sibling `.dc.html` design component
- `<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Button" …>` → mounts bundled design-system component
- Props pass via attributes; callbacks via onChange/onClick handlers bound to `renderVals()` return values

**Shared Runtime Factory:**
- API like `VamosLocale.setLang(v)`, `VamosLocale.onChange(fn)`, `VamosLocale.t(key)` (string lookup)
- Listeners array + custom event dispatch; localStorage reads/writes with versioning (`v: VERSION`)
- Used by: Every page that needs locale, ops data, or reviews

**Token + Component Registry:**
- Tokens: CSS custom properties (`var(--vt-accent)`, `var(--vt-radius-lg)`, etc.) loaded from `design-system/tokens/*.css`
- Components: Methods on bundled scope (`VamosTaxiDesignSystem_245af1.Button(props)`) compiled from Figma
- No external CSS files per component; all styling is either inline `<style>` or token-based

## Entry Points

**Customer Home:**
- Location: `app/home/home.dc.html`
- Triggers: Direct navigation or link from any page's "Book Transfer" button
- Responsibilities: Render hero + hero overlay header + services grid + reviews + FAQ + why-vamos + how-it-works sections + sticky booking widget; broadcast locale changes

**Public Pages (18 total):**
- Location: `app/pages/{sign-in,checkout,account,…}.dc.html`
- Triggers: Navigation from links or internal routing
- Responsibilities: Render page content; always mount `SiteHeader` (variant="inverse") + `SiteFooter`; relay locale/ops changes; validate forms on submission

**Ops Console:**
- Location: `app/ops/ops.dc.html` (shell), `app/ops/{OpsBoard,OpsDetail,…}.dc.html` (screens)
- Triggers: ops-login → sets `vamosOpsAuth` → shell unlocks via auth check
- Responsibilities: Render sidebar + main screen; read/write via `VamosOps` API; broadcast `vamos:ops` events on change; show real-time updates via Realtime subscription (production)

## Architectural Constraints

- **No build step:** .dc.html files are deployed as-is; no bundler, no minification, no code splitting
- **Single React version:** React 18.3.1 from unpkg; all pages share it; no version conflicts
- **Global scope pollution (by design):** Design-system components live on `window.VamosTaxiDesignSystem_245af1.*`; shared runtimes on `window.Vamos*`
- **localStorage only:** No server calls; no real database until production; mock data resets via `VamosOps.resetAll()`
- **No async/await:** All code is ES5-compatible (Babel transpiles in-browser); no Promise chains visible in mocks
- **Lenis instance singleton:** Multiple Lenis constructors = conflict; `assets/lenis-boot.js` is the sole owner
- **Custom events for broadcast:** `vamos:locale` + `vamos:ops` + `storage` event (cross-tab); no internal event bus
- **No circular imports:** Design component imports are acyclic (home → sections → header/footer, pages → header/footer, ops → sidebar → screens); production must preserve this
- **Inline CSS only:** All styling in `<style>` or `var(--vt-*)`; no external `.css` file per component; exception: design-system bundle includes its own CSS

## Anti-Patterns

### Inventing Prices

**What happens:** A mock `.dc.html` hard-codes a CHF amount (e.g., `CHF 234.50`) instead of `CHF 000`.

**Why it's wrong:** The price matrix hasn't landed yet; inventing numbers blocks the design review and gate to production (Phase 4 launch blocker). Amounts must stay `CHF 000` / `CHF 00.00` per design system §2 and CLAUDE.md §2.

**Do this instead:** Use `CHF 000` placeholders. If pricing logic is needed during production, put it in the backend (Phase 4 quote API); the frontend only displays what the backend calculates. Use `VamosLocale.money('000')` to format; the locale runtime swaps currency marks without changing the number.

### Hardcoding Language Strings

**What happens:** Markup includes English text (e.g., `<h2>Who is travelling</h2>`) but doesn't add it to `app/vamos-i18n-dict.js`.

**Why it's wrong:** Four-language parity is a hard rule (CLAUDE.md §4). A string missing from the dictionary doesn't get translated; German and Arabic users see English. The runtime can only translate strings it knows about (via regex patterns for concatenated strings).

**Do this instead:** Write markup in English, then add every visible string to `app/vamos-i18n-dict.js` with `de`, `fr`, `ar` translations in the same pass. Use `patterns` (array of regex entries) for strings the code builds (e.g., "1 passenger"). The runtime translates text nodes + `placeholder`, `aria-label`, `title`, `alt` automatically on every render.

### Restyling Design-System Components Inline

**What happens:** Markup uses a design-system component (e.g., `<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Alert" …>`) but wraps it in a `<div style="…">` to override its colors or padding.

**Why it's wrong:** The design system is the single source of truth (CLAUDE.md §1). Overrides create maintenance debt, diverge from the brand, and fail in production when tokens change. If a component needs a variant the kit doesn't have, add the prop; don't patch it with CSS.

**Do this instead:** Use the component's existing props (e.g., `tone="info"`, `size="lg"`). If the needed variant is missing, add it to the design system or build the piece from tokens (`<div style="background:var(--vt-charcoal-900)…">`) instead of invoking the kit and overriding it. Never both import a kit component and patch it with local CSS.

### Glow Effects on Hover/Focus

**What happens:** A button or input shows a colored shadow or glow when hovered or focused.

**Why it's wrong:** CLAUDE.md §3 forbids glows; they make the app look AI-generated. `--vt-shadow-accent` (yellow glow) is neutralized in every `.dc.html` with `--vt-shadow-accent:none` in the `:root` block. Text inputs override `box-shadow:none` on focus. Glow is never an allowed interaction state.

**Do this instead:** Use only: color/fill changes, border changes, `translateY(1px)` on press, or the neutral shadow tokens (`--vt-shadow-xs` through `--vt-shadow-xl`) + focus ring (`--vt-ring`). The checklist in `checkout.dc.html` §38–40 shows the allowed pattern: `background` and `transform` only, no shadows except the ring.

### Tinted Yellow / Brownish Surfaces

**What happens:** A panel or badge uses `--vt-yellow-50` (cream) or `--vt-yellow-700` (brown) as a background or text color.

**Why it's wrong:** CLAUDE.md §3 bans tinted yellow. The brand yellow is `#FDC20B` (full strength) only, for small accents: primary buttons, badges, kickers. Pale-yellow tints and brown text read as generic / AI-generated. Even kit components like `Alert tone="accent"` (which defaults to yellow-50) must be overridden to `tone="inverse"` or built from tokens instead.

**Do this instead:** If you need a tinted surface, use charcoal (for dark panels), white (with `--vt-border-subtle` hairline), or the semantic colors (`--vt-success`, `--vt-danger`). Never use `--vt-yellow-*` except full-strength `#FDC20B` in a small, intentional accent role. If a design-system component's default is tinted yellow and you can't pass a variant to fix it, build the piece directly from tokens instead of using the kit.

## Error Handling

**Strategy:** Mock raises JavaScript errors (console only); production will rely on Supabase error codes + HTTP status codes + Stripe webhooks.

**Patterns:**
- Form validation errors stored in component state (`errors.firstName`, etc.); each field shows its error message or nothing
- Mock API calls (hypothetical) would use try/catch with fallback to default values (see `readTrip()` in `checkout.dc.html`)
- Webhook safety: checksum verify (Stripe); deduplication via `stripe_events` table (production Phase 5)
- Network failure: production will add retry logic + offline detection; mocks have no network

## Cross-Cutting Concerns

**Logging:** Console.log only; no external logging in mocks. Production will use Workers Logs + Logpush + Sentry.

**Validation:** Form-level (check email format, phone length) in component state. Production backend (Supabase functions) will re-validate on every write. Design system `Input` + `Counter` components handle UI constraints (max length, min/max).

**Authentication:** Mock toggles `localStorage.vamosAuthUser`. Production uses Supabase Auth with `@supabase/ssr` middleware + JWT claim verification in the Worker.

---

## End-State Architecture (Production Handoff)

**Target:** Next.js 15 App Router on Cloudflare Workers via `@opennextjs/cloudflare`.

**Topology:**
```
[Customer] ←HTTPS→ [Cloudflare Worker]
                    ├─ SSR + static assets
                    ├─ API routes (/api/quote, /api/stripe/webhook, etc.)
                    └─ Hyperdrive connection pool ↓ [Supabase]
                                                     ├─ SQL (bookings, auth users, etc.)
                                                     ├─ Realtime (ops board subscribe)
                                                     ├─ Auth (JWT verify in middleware)
                                                     └─ Storage (chauffeur/vehicle photos)

[Stripe] →webhook→ Worker `/api/stripe/webhook` → Cloudflare Queue → Resend (emails)

[Mapbox] ←cached queries← Worker (geocode, directions)

[AeroDataBox] ←cached in KV← Worker (flight autofill)
```

**Routes (mock → production mapping):**

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

**Key shifts:**
- React → React Server Components (RSC) for public pages (SSG/ISR); Client Components for interactive sections
- localStorage persistence → Supabase SQL + Auth
- `VamosLocale`, `VamosOps`, `VamosReviews` runtimes → API routes + Supabase queries
- Design-system `.dc.html` components → React components imported from `@/components`
- Design tokens (CSS custom properties) → same, but now served from Cloudflare edge
- Lenis → stays, same vendored copy
- i18n dict → moves to `content_strings` table + admin edit UI (ops Content screen)
- Ops Realtime → Supabase Realtime subscription on `bookings` table
- Pricing → Phase 4 `/api/quote` endpoint (Mapbox geocoding + distance matrix + rate lookup)

The mocks form the **visual spec**; this architecture ensures the production code maps each page, section, and interaction 1:1 without design changes.

---

*Architecture analysis: 2026-08-17*
