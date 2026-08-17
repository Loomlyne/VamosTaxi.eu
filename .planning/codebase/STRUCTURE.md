# Codebase Structure

**Analysis Date:** 2026-08-17

## Directory Layout

```
VamosTaxi.eu/
├── .planning/                          # Planning docs (this maps to future Claude Code work)
│   └── codebase/                       # Generated codebase maps (ARCHITECTURE.md, STRUCTURE.md, etc.)
│
├── app/                                # ← THE LIVE MOCKS (the running spec)
│   ├── home/                           # Home page + its sections + shared shell
│   │   ├── home.dc.html                # Entry point: marketing + booking widget
│   │   ├── SiteHeader.dc.html          # Shared header (variant="overlay" on home only)
│   │   ├── SiteFooter.dc.html          # Shared footer
│   │   ├── Services.dc.html            # Service cards (Economy, Business, Van)
│   │   ├── ServiceCard.dc.html         # Single service card component
│   │   ├── Reviews.dc.html             # Customer reviews carousel
│   │   ├── FAQ.dc.html                 # Home FAQ section
│   │   ├── HowItWorks.dc.html          # 5-step process section
│   │   ├── WhyVamos.dc.html            # Brand narrative section
│   │   ├── WhenPicker.dc.html          # Date/time picker component (shared with pages)
│   │   ├── BrandSelect.dc.html         # Language + currency switcher (shared)
│   │   ├── CookieBanner.dc.html        # Cookie consent (shared)
│   │   ├── StepCounter.dc.html         # Passenger/bag counter (shared)
│   │   ├── support.js                  # DC runtime (identical copy)
│   │   └── *.dc.html                   # Additional sections (e.g., Services)
│   │
│   ├── pages/                          # 18 public pages (booking funnel + account + legal)
│   │   ├── SiteHeader.dc.html          # Shared header (variant="inverse")
│   │   ├── SiteFooter.dc.html          # Shared footer
│   │   ├── support.js                  # DC runtime (identical copy)
│   │   │
│   │   ├── checkout.dc.html            # Booking checkout + payment
│   │   ├── confirmation.dc.html        # Booking confirmation + ICS download
│   │   ├── sign-in.dc.html             # Customer sign-in
│   │   ├── reset-password.dc.html      # Password reset flow
│   │   ├── account.dc.html             # Customer profile / account settings
│   │   ├── bookings.dc.html            # Booking history list
│   │   ├── booking-detail.dc.html      # Single booking detail + timeline
│   │   ├── BookingRow.dc.html          # Booking list row component
│   │   ├── manage-booking.dc.html      # Manage booking by ref + email / tokened link
│   │   │
│   │   ├── about.dc.html               # About Vamos
│   │   ├── contact.dc.html             # Contact form + company info
│   │   ├── become-a-partner.dc.html    # Partner application form
│   │   ├── coming-soon.dc.html         # Coming-soon page
│   │   ├── faq.dc.html                 # FAQ page (separate from home FAQ section)
│   │   │
│   │   ├── terms.dc.html               # Terms of service (data-tok gaps)
│   │   ├── privacy.dc.html             # Privacy policy (data-tok gaps)
│   │   ├── cookies.dc.html             # Cookie policy
│   │   ├── cancellation.dc.html        # Cancellation policy
│   │   ├── imprint.dc.html             # Company imprint / legal info
│   │   │
│   │   ├── AuthForm.dc.html            # Sign-in/sign-up form component (shared with ops)
│   │   ├── AuthStates.dc.html          # Auth MFA state machine
│   │   ├── PhoneVerify.dc.html         # Phone OTP verification (future)
│   │   ├── ResetForm.dc.html           # Password reset form component
│   │   ├── WhenPicker.dc.html          # Date/time picker (shared)
│   │   └── CookieBanner.dc.html        # Cookie consent (shared)
│   │
│   ├── ops/                            # Dispatch console (13 screens, staff-gated)
│   │   ├── ops.dc.html                 # Shell: sidebar + main screen outlet
│   │   ├── ops-login.dc.html           # Sign-in gateway (password + TOTP mock)
│   │   ├── support.js                  # DC runtime (identical copy)
│   │   ├── OpsSidebar.dc.html          # Left navigation (no public header/footer)
│   │   │
│   │   ├── OpsDash.dc.html             # Dashboard (KPIs, status cards)
│   │   ├── OpsBoard.dc.html            # Live bookings board (Realtime in production)
│   │   ├── OpsDetail.dc.html           # Booking detail (assign chauffeur, view timeline)
│   │   ├── OpsFleet.dc.html            # Vehicle + chauffeur management
│   │   ├── OpsPricing.dc.html          # Distance rates, surcharges, fixed routes
│   │   ├── OpsCoupons.dc.html          # Coupon code management
│   │   ├── OpsCustomers.dc.html        # Customer list (phone, email, booking count)
│   │   ├── OpsReviews.dc.html          # Published reviews + moderation
│   │   ├── OpsContent.dc.html          # i18n content editing (strings, FAQ, etc.)
│   │   ├── OpsSettings.dc.html         # System settings (cancel window, wait time, etc.)
│   │   ├── OpsProfile.dc.html          # Dispatcher profile + preferences
│   │   ├── OpsCalendar.dc.html         # Booking calendar view (unused in Phase 1)
│   │   ├── OpsTable.dc.html            # Shared table component (used by Fleet, Customers, etc.)
│   │   ├── OpsSoon.dc.html             # Coming soon / in-progress screens placeholder
│   │   │
│   │   ├── BrandSelect.dc.html         # Language switcher (for ops pages)
│   │   └── AuthForm.dc.html            # Login form (shared with pages)
│   │
│   └── [Shared Runtimes]               # Loaded in <helmet> of every page
│       ├── vamos-locale.js             # Language + currency store + broadcast
│       ├── vamos-i18n-dict.js          # 128+ strings × en/de/fr/ar + regex patterns
│       ├── vamos-ops-data.js           # 8 collections + 2 singletons (vehicles, bookings, etc.)
│       ├── vamos-reviews.js            # Published reviews cache (shared by home + ops)
│       ├── vamos-page-transition.js    # Cross-page transition overlay + boot cover
│       ├── support.js                  # DC mini-framework (also copied to each folder)
│       ├── cubes-grid.js               # Utility: animated cube/grid visualization
│       └── image-slot.js               # Utility: responsive image loading / lazy-loading
│
├── design-system/                      # Vendored from Figma; single entry point
│   ├── _ds_bundle.js                   # 45KB UMD: 50+ components compiled
│   ├── _ds_manifest.json               # Component inventory + metadata
│   ├── styles.css                      # Single entry point; @imports all tokens
│   │
│   ├── tokens/                         # Design tokens (CSS custom properties)
│   │   ├── fonts.css                   # Qurova + Poppins font stacks
│   │   ├── colors.css                  # --vt-accent, --vt-charcoal-*, --vt-grey-*, etc.
│   │   ├── typography.css              # --vt-heading-*, --vt-body-*, --vt-label-*, etc.
│   │   ├── spacing.css                 # --vt-space-* (4px scale)
│   │   ├── elevation.css               # --vt-shadow-xs through --vt-shadow-xl
│   │   ├── motion.css                  # --vt-transition-*, --vt-ease-*, durations
│   │   ├── base.css                    # Element resets, body baseline
│   │   └── laws.css                    # Brand law rules (glow ban, yellow restrictions, etc.)
│   │
│   ├── assets/                         # Design system fonts (Qurova, Poppins)
│   │   └── fonts/
│   │       ├── Qurova-*.woff2          # 5 weights (OFL.txt license in root)
│   │       └── Poppins-*.woff2         # 4 weights
│   │
│   ├── components/                     # Design system components (read-only, compiled)
│   │   └── mobile/                     # Mobile-specific token overrides
│   │       ├── fig-tokens.css          # Component-specific CSS (read-only)
│   │       └── fig-assets.css          # Component assets (read-only)
│   │
│   ├── readme.md                       # Design system guide (§1–9: brand, voice, tokens, components, laws, i18n)
│   └── [compiled artifacts]            # _adherence.oxlintrc.json, other metadata
│
├── assets/                             # Shared brand assets (not part of design-system)
│   ├── icons/                          # 57+ Lucide SVGs (ISC license)
│   │   ├── arrow-left-right.svg
│   │   ├── car.svg, briefcase.svg, …   # Service class icons
│   │   ├── calendar.svg, clock.svg     # Date/time icons
│   │   ├── check.svg, circle-check.svg # Success indicators
│   │   ├── user.svg, users.svg         # Account icons
│   │   ├── mail.svg, phone.svg         # Contact icons
│   │   ├── plane.svg, plane-landing.svg, plane-takeoff.svg  # Flight icons
│   │   └── [~50 more]
│   │
│   ├── logo/                           # 9 brand marks
│   │   ├── wordmark-primary.svg        # "VAMOS TAXI" lockup (yellow + charcoal)
│   │   ├── wordmark-reversed.svg       # "VAMOS TAXI" white (on dark)
│   │   ├── wordmark-white.svg          # "VAMOS TAXI" white alternate
│   │   ├── lockup-primary.svg          # Mark + wordmark (yellow)
│   │   ├── lockup-reversed.svg         # Mark + wordmark (white)
│   │   ├── mark-primary.svg            # Mark only (yellow)
│   │   ├── mark-reversed.svg           # Mark only (white)
│   │   ├── favicon.svg                 # Favicon
│   │   └── [others]
│   │
│   ├── patterns/                       # UI patterns
│   │   ├── checker-mark.png            # Success checkmark used in booking flow
│   │   └── checker-tile.png            # Checker tile pattern (repeated background)
│   │
│   ├── photography/                    # Brand photography
│   │   └── fleet-van-street.jpg        # V-Class vehicle photo (only clean photo available)
│   │
│   ├── brand/                          # Brand guidelines
│   │   ├── Brand Guideline VAMOS TAXI.pdf
│   │   └── brand-guideline-extracted.txt
│   │
│   └── [Lenis scroll engine]
│       ├── lenis.js                    # Lenis 1.3.23 (MIT) — scroll behavior library
│       ├── lenis.css                   # Lenis styles
│       └── lenis-boot.js               # House initialization (single instance owner)
│
├── docs/                               # Reference + planning (extensive)
│   ├── brief/                          # High-level project docs
│   │   ├── PROJECT-BRIEF.md            # Client brief (features, constraints, market)
│   │   ├── SCOPE-OF-WORK.md            # Deliverables + acceptance criteria
│   │   ├── BUILD-PLAYBOOK.md           # Build methodology + review gates
│   │   ├── CURRENT-SITE-AUDIT.md       # Live site review (public surface)
│   │   ├── RESEARCH.md                 # Market research + competitor analysis
│   │   └── [others: AGENTS.md, DECISIONS.md, etc.]
│   │
│   ├── build/                          # Execution specs (Phase 0–9 roadmap)
│   │   ├── GSD-LAUNCH.md               # Build plan + phase breakdown + stack (Next.js 15, Cloudflare)
│   │   ├── MISSING-FEATURES.md         # Gap audit (🔴/🟡/⚪ prioritized)
│   │   ├── LEGAL-PLACEHOLDER-CHECKLIST.md  # `data-tok` gaps + owners
│   │   │
│   │   ├── SPEC-*.md (23 total)        # Per-screen specifications
│   │   │   ├── SPEC-home-*.md          # Home hero, reviews, FAQ, why-vamos, flight-autofill
│   │   │   ├── SPEC-checkout-confirmation.md  # Booking flow
│   │   │   ├── SPEC-bookings.md        # Account bookings list
│   │   │   ├── SPEC-booking-detail.md  # Single booking detail
│   │   │   ├── SPEC-manage-booking.md  # Ref + email lookup
│   │   │   ├── SPEC-legal-shell.md     # Legal pages structure
│   │   │   ├── SPEC-{terms,privacy,cookies,cancellation}.md  # Legal pages
│   │   │   ├── SPEC-{about,contact,become-a-partner}.md  # Marketing pages
│   │   │   ├── SPEC-ops-*.md           # Ops console specs (board, detail, pricing, etc.)
│   │   │   └── [others]
│   │   │
│   │   ├── i18n-todo.txt               # ~600 untranslated strings (mostly legal)
│   │   ├── i18n-audit*.txt             # Language coverage reports
│   │   └── [audit files]
│
├── deliverables/                       # Client-facing deliverables
│   ├── invoice/                        # Invoice tracking + scope items
│   └── [others]
│
├── scripts/                            # Utility scripts (non-essential)
│   └── [build/test scripts if any]
│
├── archive/                            # ⚠ HISTORICAL SNAPSHOT (frozen, do not edit)
│   ├── ds-upgrade/                     # Old version with flat layout (before home/pages/ops split)
│   └── design_handoff_file_architecture/  # Pre-split directory structure
│
├── .git/                               # Git history
├── .gitignore                          # Ignore rules (no .env, no node_modules, etc.)
├── README.md                           # Quick start: run mocks, serve from root
├── CLAUDE.md                           # Hard rules: glow ban, price placeholders, 4 languages, etc.
├── HANDOFF-CLAUDE-CODE.md              # Handoff to production build (routes, stack, anatomy)
├── github.md                           # Provenance of vendored code (Lucide, Lenis)
│
└── [Root images]
    ├── hero-arrivals.jpg               # Hero background image
    ├── rectangle-*.png                 # Supplied brand photography
    └── [others]
```

## Directory Purposes

**`app/home/`:**
- Purpose: Home page (landing + booking widget) and its sections
- Contains: `.dc.html` pages for each section, shared shell components
- Key files: `home.dc.html` (entry point), `SiteHeader.dc.html` (overlay variant), `Services.dc.html`, `Reviews.dc.html`, `FAQ.dc.html`
- Special: `SiteHeader` here uses `variant="overlay"` (transparent on hero, floats when scrolled); `support.js` is copied here from root

**`app/pages/`:**
- Purpose: All public pages (18 total) accessed by customers
- Contains: Booking funnel (checkout → confirmation), account (sign-in → bookings → booking detail), legal (terms/privacy/cookies/etc.), marketing (about/contact/partner)
- Key files: `checkout.dc.html`, `confirmation.dc.html`, `sign-in.dc.html`, `account.dc.html`, `bookings.dc.html`, `manage-booking.dc.html`, plus legal pages
- Special: Every page imports `SiteHeader` (variant="inverse") + `SiteFooter`; `support.js` is copied here

**`app/ops/`:**
- Purpose: Dispatch console (13 staff screens, gated by auth)
- Contains: Shell (`ops.dc.html`), login (`ops-login.dc.html`), sidebar, 13 screens (dashboard, board, detail, fleet, pricing, coupons, customers, reviews, content, settings, profile, calendar, table)
- Key files: `ops.dc.html` (shell), `OpsBoard.dc.html` (live bookings), `OpsDetail.dc.html` (detail view with assignment), `OpsPricing.dc.html` (rate matrix)
- Special: No `SiteHeader`/`SiteFooter`; uses `OpsSidebar` instead; `support.js` is copied here

**`app/` (root level):**
- Purpose: Shared runtimes, utilities, support infrastructure
- Contains: `vamos-locale.js` (lang/cur store), `vamos-i18n-dict.js` (128+ strings × 4 langs), `vamos-ops-data.js` (8 collections), `vamos-reviews.js`, `vamos-page-transition.js`, `support.js`, utilities (`cubes-grid.js`, `image-slot.js`)
- Special: Every page's `<helmet>` loads these scripts; they persist across page transitions; only `support.js` is copied to subdirectories

**`design-system/`:**
- Purpose: Vendored design system (UMD bundle + tokens)
- Contains: Compiled components (`_ds_bundle.js`), token CSS files (colors, type, spacing, elevation, motion, base, laws), design-system assets (fonts)
- Key files: `_ds_bundle.js` (all 50+ components as one UMD global), `styles.css` (entry point for @imports), `tokens/` (token files)
- Special: `_ds_bundle.js` is 45KB compiled and read-only (generated from Figma); components load as `window.VamosTaxiDesignSystem_245af1.Button`, etc.; no external CSS per component

**`assets/`:**
- Purpose: Brand assets (icons, logos, patterns, photography, fonts, scroll engine)
- Contains: 57+ Lucide icons (ISC), 9 logo marks (yellow/reversed/white variants), patterns (checker), photography (fleet), fonts (Qurova, Poppins), Lenis scroll library
- Key files: `lenis-boot.js` (single scroll instance owner), icon SVGs (used via CSS mask in Icon component), logo SVGs (used via img src in Logo component)
- Special: Lenis instance is global; `data-lenis-prevent` must be set on nested scrollers (panels, modals that scroll internally)

**`docs/brief/`:**
- Purpose: High-level project documentation (client brief, scope, research)
- Contains: Project overview, scope of work, build methodology, competitive audit, decisions made
- Key files: `PROJECT-BRIEF.md`, `SCOPE-OF-WORK.md`, `BUILD-PLAYBOOK.md`

**`docs/build/`:**
- Purpose: Execution specifications and roadmap
- Contains: Phase 0–9 build plan (`GSD-LAUNCH.md`), gap audit (`MISSING-FEATURES.md`), 23 per-screen specs, i18n todo list, `data-tok` checklist
- Key files: `GSD-LAUNCH.md` (the roadmap; read first), `MISSING-FEATURES.md` (prioritized gaps), `SPEC-*.md` (detailed per-screen behavior)
- Special: These docs define what the production build must implement; the mocks in `app/` are the visual spec to match

**`archive/`:**
- Purpose: Historical snapshot (frozen, do not edit or reference)
- Contains: Older versions of the same files with flat directory layout (predates `home/ pages/ ops/` split)
- Rule: Never read, grep, or cite from this folder; if a filename appears in both `app/` and `archive/`, `app/` wins

## Key File Locations

**Entry Points (URLs to open in browser):**
- `http://localhost:3000/app/home/home.dc.html` — Customer home (start here)
- `http://localhost:3000/app/pages/checkout.dc.html` — Booking checkout
- `http://localhost:3000/app/ops/ops.dc.html` — Dispatch console
- `http://localhost:3000/app/ops/ops-login.dc.html` — Ops sign-in

**Configuration:**
- `CLAUDE.md` — Hard rules (read in full before any code)
- `HANDOFF-CLAUDE-CODE.md` — Production handoff guide (stack, route map, anatomy, definition of done)
- `.gitignore` — Ignore rules
- `README.md` — Quick start (how to run mocks)

**Core Logic:**
- `app/vamos-locale.js` — Language + currency singleton
- `app/vamos-i18n-dict.js` — Dictionary (add every new visible string here)
- `app/vamos-ops-data.js` — Ops data contract (8 collections + 2 singletons)
- `app/vamos-page-transition.js` — Cross-page transition overlays

**Design Spec:**
- `app/home/home.dc.html` — Home page (visual spec for hero + booking widget)
- `app/pages/checkout.dc.html` — Checkout (visual spec for payment flow)
- `design-system/readme.md` — Design system guide (§1–9: brand, voice, tokens, laws)

**Production Plan:**
- `docs/build/GSD-LAUNCH.md` — Build phases (read second after CLAUDE.md)
- `docs/build/MISSING-FEATURES.md` — Gap audit (what's not mocked yet)
- `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` — `data-tok` gaps and owners

## Naming Conventions

**Files:**

| Pattern | Example | Usage |
|---------|---------|-------|
| `*.dc.html` | `checkout.dc.html`, `OpsBoard.dc.html` | Design Component (runnable page or section) |
| `*Support.js` | `support.js` | DC runtime (present in root + each folder; identical copies) |
| `vamos-*.js` | `vamos-locale.js`, `vamos-ops-data.js` | Shared runtime (loaded in `<helmet>` of every page) |
| `*.css` | `colors.css`, `base.css` | Design tokens or element resets |
| `_ds_*.js` | `_ds_bundle.js`, `_ds_manifest.json` | Design system artifacts (compiled, read-only) |

**Directories:**

| Pattern | Example | Usage |
|---------|---------|-------|
| `{home,pages,ops}/` | `app/home/`, `app/pages/`, `app/ops/` | Surface directories (public pages, home, staff console) |
| `tokens/` | `design-system/tokens/` | Design token CSS files |
| `assets/` | `assets/icons/`, `assets/logo/`, `design-system/assets/fonts/` | Brand assets (icons, logos, fonts) |
| `docs/{brief,build}/` | `docs/brief/`, `docs/build/` | Documentation (high-level, then execution specs) |

**Component Names (`.dc.html` files):**

| Style | Examples | Meaning |
|-------|----------|---------|
| `PascalCase` | `SiteHeader.dc.html`, `OpsBoard.dc.html`, `BrandSelect.dc.html` | Design Component (section or page); importable via `<dc-import name="…">` |
| `kebab-case` | `checkout.dc.html`, `sign-in.dc.html`, `ops-login.dc.html` | Standalone page (not imported, linked directly) |

**JavaScript Classes:**

| Style | Examples | Meaning |
|-------|----------|---------|
| `PascalCase extends DCLogic` | `class Component extends DCLogic { … }` | React logic class in every `.dc.html` script block |

**CSS Custom Properties (tokens):**

| Pattern | Examples | Meaning |
|---------|----------|---------|
| `--vt-{name}` | `--vt-accent`, `--vt-charcoal-900`, `--vt-text-primary`, `--vt-radius-lg` | Design token (color, spacing, type size, etc.) |
| `--vt-shadow-{size}` | `--vt-shadow-xs`, `--vt-shadow-sm`, `--vt-shadow-lg` | Elevation shadow |
| `--vt-transition-{name}` | `--vt-transition-control` | Motion timing |

**Data Attributes (layout + state):**

| Pattern | Examples | Meaning |
|---------|----------|---------|
| `[data-*]` | `[data-hd]`, `[data-row]`, `[data-panel]`, `[data-sel="1"]` | Layout or state class (no external CSS; defined inline in page or shell) |

## Where to Add New Code

**New Page (customer-facing):**

1. Create `app/pages/NewPage.dc.html` (kebab-case if standalone, PascalCase if will be imported)
2. Copy the head + helmet block from `checkout.dc.html` (design-system loads, vamos-*.js loads, `:root` rules)
3. Import mandatory `<dc-import name="SiteHeader" variant="inverse" …>` and `<dc-import name="SiteFooter" …>`
4. Write page markup using inline styles + design-system components via `<x-import>`
5. Write logic class `class Component extends DCLogic { … }`
6. Add every visible string to `app/vamos-i18n-dict.js` (en, de, fr, ar) in the same pass
7. Test at 1440, 1024, 768, 390 px; test in German (30% longer) and Arabic (RTL)

**New Ops Screen:**

1. Create `app/ops/OpsNewScreen.dc.html` (PascalCase; will be imported by shell)
2. Copy head + helmet from `ops.dc.html`
3. Write screen markup using `<x-import>` for design-system components
4. Read/write data via `VamosOps.{collection}.all()`, `.update()`, etc.
5. Listen for `vamos:ops` event (others updated the collection; re-render)
6. Add strings to `app/vamos-i18n-dict.js`
7. Register screen in `OpsSidebar.dc.html` as a router link

**New Reusable Component (section or row template):**

1. Create `app/{home,pages,ops}/ComponentName.dc.html` (PascalCase; importable)
2. Declare props in `<helmet data-props="…">` (e.g., `size, variant, onClick`)
3. Write `class Component extends DCLogic { … }` with prop read, state management, event handlers
4. Use `<dc-import name="ComponentName" size="lg" onClick="{{ handler }}" …>` to mount it in pages
5. Add all strings to `app/vamos-i18n-dict.js`
6. Build every state (default, hover, active, disabled, loading, error, empty) in the same pass, reachable via props

**New Utility or Runtime:**

1. If it reads/writes state across pages → create `app/vamos-newfeature.js` and load in every page's `<helmet>`
2. Export a singleton API (e.g., `window.VamosNewFeature = { get, set, onChange }`)
3. If it's a one-off helper (e.g., a date formatter) → add to root `app/support.js` or the relevant page's script block
4. Document the API in `CLAUDE.md` or in the file's header comment

**Production Port (Next.js):**

All `.dc.html` files in `app/{home,pages,ops}/` become React components in `app/{home,pages,ops}/` (no folder prefix; flat structure). 
- Logic class → React function component with `useState`, `useEffect`, etc.
- Template props (`renderVals()`) → JSX return value
- `<dc-import>` → `<Component>` import
- `<x-import component-from-global-scope="…">` → `<DesignSystemComponent>` import from `@/components/design-system/`
- Shared runtimes → Supabase API routes + `useQueryClient()` from React Query
- Tokens → same CSS custom properties, served from `public/brand/`

## Special Directories

**`archive/`:**
- Purpose: Historical snapshot (frozen)
- Generated: No; imported from design history
- Committed: Yes
- Rule: Read-only; do not reference or edit; if a file name exists in both `app/` and `archive/`, `app/` is canonical

**`.git/`:**
- Purpose: Version control
- Generated: No; created by `git init`
- Committed: Yes; all commits tracked

**`design-system/`:**
- Purpose: Vendored design system
- Generated: Yes (from Figma export)
- Committed: Yes; entire bundle is tracked
- Note: `_ds_bundle.js` is 45KB compiled; do not edit by hand. Update only via Figma re-export.

**`node_modules/` (if ever added):**
- Purpose: npm dependencies (mocks have none; future build will have many)
- Generated: Yes (`npm install`)
- Committed: No (add to `.gitignore` if using npm)

---

*Structure analysis: 2026-08-17*
