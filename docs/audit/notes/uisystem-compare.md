# UI System (Loomlyne) vs Vamos Taxi — read-only comparison (2026-09-27)

Repos: `/home/user/loomlyne/ui-system` (UIS) and `/home/user/VamosTaxi.eu` (Vamos, untouched).

## 1. UI System — what it is

| Aspect | Finding | Source |
|---|---|---|
| Maturity | v0.1.0 both packages, **1 commit** in history, **no tests** (CI = build + typecheck + design + playground build only) | `package.json`, `.github/workflows/ci.yml`, `git log` |
| Distribution | Workspace-only. `@ui-system/react` depends on `"@ui-system/core": "workspace:*"` → not installable from npm as-is; consume by vendoring / git submodule / publishing first. `ui.css` is served from jsDelivr off `@main` (unpinned) | `packages/react/package.json`, README |
| Token model | `ui.config.json` → `buildTheme()` → OKLCH 11-step scales per role (primary/accent/neutral/success/warning/danger/info) + derived roles `{role}`, `-hover`, `-ink`, `-soft` (tinted bg), `-soft-ink`, `-text` (role as text, forced to 4.5:1) + neutral roles (bg, surface, line, ink…) + radius roles (chip/control/field/card/panel/media/shell) + fonts + density heights + shadows + motion. All emitted as `--uis-*` CSS vars (inline on `Root` div, or `theme.css` via CLI; Tailwind v4 `@theme inline` export optional) | `packages/core/src/theme.ts`, `exports.ts` |
| Theming / dark mode | Light + dark always generated; `data-uis-mode` / `.dark`; optional `prefers-color-scheme` block | `exports.ts toCSS` |
| Fonts | 6 Google-Fonts presets (Inter, Geist, Fraunces, …). `display/body/mono` overrides accept any family but **`Root` auto-injects a Google Fonts `<link>`** for them (would request Qurova from Google → fails; Poppins duplicated). Mono falls back to JetBrains Mono. Use `loadFonts={false}` | `type.ts`, `Root.tsx useFonts` |
| Components (React) | Root, Logo/LogoMark, Icon, Button (primary/secondary/accent/outline/ghost/soft/light/glass/danger), IconButton, Badge, Field, Input, Select, Textarea, Switch, Checkbox, Card, Media, Divider, Kbd, Tabs, Avatar/AvatarGroup, Tooltip, Toast, Alert, Progress, Stat, Table, Popover, Menu, Chips, Scrim, Drawer, Dialog; navs SiteNav/NavIsland/NavBar/NavStacked/NavDock/NavMinimal/NavMobile; shells AppShell/AppSidebar/AppRail/AppTopbar/AppDock/PageHeader; Reveal, CountUp, `anime` | `packages/react/src/*` |
| Missing | No Radio, DatePicker/TimePicker, Counter, PhoneField, combobox, footer, stepper, list rows | — |
| RTL / logical props | **None.** `ui.css` (451 lines) has 0 logical properties and ~42 physical `left/right` rules (input icon `left:14px`, `padding-left:42px`, drawer `right:0`, switch thumb `left:3px`, avatar stack `margin-left:-8px`…). No `dir` handling anywhere | `packages/core/styles/ui.css` |
| i18n | None. Hard-coded English defaults: `'Search'`, `'Explore'`, `'Menu'`, `'Open menu'`, `aria-label="Sidebar"/"Main"/"Account and workspace"`. `CountUp` formats with `toLocaleString(undefined)` (browser locale, not Swiss `1'250.00`) | `nav/front.tsx`, `nav/back.tsx`, `Motion.tsx` |
| Icons | Own hand-drawn 24px path set (~65 icons), unknown names silently fall back to `sparkle` | `Icon.tsx` |
| Avatars | DiceBear core + 5 CC0 styles bundled (notionists-neutral, lorelei-neutral, thumbs, glass, shapes) or `initials`; `src` photo wins; `avatarSvg()` for exports | `Avatar.tsx` |
| Motion | anime.js v4: `Reveal` (fade-up/fade/scale-in/slide-left/slide-right/blur-in; 620 ms subtle / 950 ms expressive, IntersectionObserver), `CountUp` (1200 ms), reduced-motion honoured | `Motion.tsx` |
| Framework | React ≥18 peer (dev on 19.2); Next 16 playground; Tailwind optional; plain-CSS class API; IIFE `window.UIS` bundle for Claude Design | `build.mjs`, docs/frameworks.md |
| Workers / OpenNext | No Node APIs; pure ESM. Whole `dist/index.js` carries a `'use client'` banner → every component is a Client Component (SSR'd fine, but no RSC-only rendering). Core + DiceBear (5 styles) + animejs bundled into one file — weight counts against Worker size; no tree-shaking of the `STYLES` map. Should run on Workers; untested there | `packages/react/build.mjs` |

## 2. Vamos — current state

- Tokens: `design-system/tokens/*.css` copied to `apps/web/public/brand/tokens/`, imported by `apps/web/app/globals.css` with `laws.css` last (+ `arabic.css`: Noto Sans Arabic stand-in).
- Production React components (Next 15.5 / React 19.2 / next-intl / OpenNext on Workers): `apps/web/components/{core,forms,navigation,feedback,transfer,data,shell,home,marketing,legal,booking,auth,consent}` — ~60 components, each with its own `.css` on `--vt-*`.
- Guards already in place: `apps/web/.stylelintrc*` with `stylelint-use-logical` (errors on physical inline props) and a banned-value list (coloured box-shadows, `--vt-shadow-accent`, `--vt-yellow-50/100/200/300/600/700`).
- **Ops console is not React.** `apps/web/middleware.ts:131 serveOpsDc()` fetches `/app/ops/ops.dc.html` / `ops-login.dc.html`, injects `<base>` + auth flag, and serves the mock. `app/[locale]/(ops)/` holds only API routes and server actions. The 20 `app/ops/*.dc.html` files (~11.9k lines) use the DS bundle: Button 89, Icon 87, Input 52, Dialog 10, Alert 9, Card 6, Logo 5, IconButton 5, Textarea 4, Table/Switch/Select/ListRow 3, Toast/StatusBadge/List/Badge/Avatar 2, Tag/Tabs/PriceSummary 1.
- Emails: `packages/emails` — HTML strings with inline hex from `chrome.ts`, `dir` per locale, light-only. No CSS vars, no React DOM.
- Dark mode: none (no dark tokens; emails `color-scheme: light only`).

## 3. Component map

| Vamos | UIS equivalent | Gap / conflict |
|---|---|---|
| Button (primary = yellow, secondary = charcoal, ghost, light, danger) | Button (`accent` = yellow if primary=charcoal) | Hover/press OK-ish; `btn-size 12.5px` / `0.06em` hard-coded vs Vamos label 13px / 0.09em; 54px lg vs UIS 52px |
| IconButton | IconButton | count/dot use `right:` |
| Icon (Lucide via CSS mask) | Icon (own paths) | **Law conflict** — must stay Lucide |
| Logo, CheckerMark | Logo (logoSrc/markSrc) | Single logoSrc: no reversed/white per tone; no CheckerMark |
| Card (16px, hairline, `tone=inverse`) | Card | No inverse tone; UIS shadows ≠ `--vt-shadow-*` |
| Badge, Tag, StatusBadge | Badge, Chips | Badge `accent/warning` = `-soft` tints (cream) → law 02; no lifecycle mapping |
| Avatar (initials/icon/src, status dot) | Avatar (DiceBear) | UIS default bg = `accent-soft` (cream) → law 02 |
| Input, Textarea, Select, Checkbox, Switch | same | Focus = `0 0 0 4px focus-ring` halo in accent → **law 01**; physical icon padding → RTL break |
| Radio, Counter, DatePicker, TimePicker, WhenPicker, PhoneField, PlaceCombo, TurnstileWidget | — | none |
| Tabs, StepIndicator, SectionHeader | Tabs, PageHeader | no stepper |
| Alert, Toast, Tooltip, Dialog, ProgressIndicator | Alert, Toast, Tooltip, Dialog, Progress | Alert tones are `-soft` tinted |
| Table, List/ListRow, StatTile | Table, Menu, Stat | Stat has delta/trend (invented-stat risk); Table `align:'left'|'right'` |
| VehicleCard, RouteSummary, PriceSummary | — | none (domain-specific) |
| SiteHeader / SiteFooter / BrandSelect / ContactFab / CookieBanner | NavBar (transparent) / — | UIS navs lack phone pill, lang+currency, no footer |
| OpsSidebar (236px charcoal) | AppSidebar / AppShell | UIS sidebar is light, active item `primary-soft` |
| Reveal-like IO in HowItWorks/Reviews | Reveal | UIS durations 620–950 ms, scale/blur effects |

## 4. Conflicts with the Vamos laws

1. **No glow (law 01):** `.uis-input:focus { box-shadow: 0 0 0 4px var(--uis-focus-ring) }` where focus-ring = accent-text at 35% alpha → yellow/olive halo on fields. `--uis-focus` = `accent-text` also drives the 2px outline on everything.
2. **No tinted yellow (law 02):** with accent `#FDC20B`, `accent-soft` = 11% yellow over white (cream) used by Badge accent, Avatar default, Button soft; `accent-text` / `accent-soft-ink` = darkest yellow step reaching 4.5:1 → brown/olive text (the exact yellow-600/700 ban). Warning seeded from `--vt-yellow-500` makes `warning-soft` cream too (Alert/Badge warning). If yellow were made `primary`, the sidebar active item (`primary-soft`) and links would go cream/brown. Vamos' stylelint only catches `--vt-*` names, so these `--uis-*` tints would slip past the gate.
3. **Qurova + Poppins only:** expressible via `type.display/body`, but Root's Google-Fonts link, JetBrains Mono fallback, and preset stacks (Inter etc.) must be disabled. No Arabic font slot (`--vt-font-arabic` swap would need a local override).
4. **Four languages + RTL:** UIS has zero logical properties and hard-coded English labels → fails Vamos `stylelint-use-logical` and law 03 if vendored.
5. **Lenis:** UIS has no scroll manager; Drawer/Dialog would need `data-lenis-prevent` and to cooperate with `lenis-boot.js` body lock. No conflict, but no support.
6. **Lucide via Icon:** UIS draws its own icons; unknown names become `sparkle`. Conflict.
7. **Motion:** Vamos "nothing scales, nothing springs", 80–480 ms. UIS `scale-in`, `blur-in`, 620–1200 ms defaults. Usable only with `fade`/`fade-up` and explicit short durations.
8. **Amounts:** `CountUp` must never animate a price (see §7).

## 5. Verdict per surface

| Surface | Verdict | Effort | Risk |
|---|---|---|---|
| Public website (home, marketing, legal) | **Keep** Vamos components. Optional: nothing UIS adds that Vamos lacks. | 0 d | none |
| Booking flow (checkout, confirmation, manage-booking / pay link) | **Keep, do not touch.** Treated as live with paid bookings (caller's statement; `.planning/STATE.md` also says "Do not touch the main checkout", "No `sk_live_`" as agent gates). Any component swap here re-opens Stripe Elements layout, pill fields, 54px targets, RTL and 4-language coverage. | 0 d | Migration risk HIGH (payment-path regressions, focus halo on fields, RTL breakage) |
| Customer account (sign-in/up, reset, AuthForm) | **Keep** | 0 d | low if untouched |
| Ops dashboard (served `.dc.html` via `serveOpsDc`) | **Keep now.** If ops is ported to React later, UIS could supply `AppShell`/`Table`/`Drawer` **only via a token bridge** (`--uis-*` → `--vt-*`) plus patches. Tokens-only migration alone buys nothing — Vamos already has tokens. | Port 20 screens to React: ~18–25 d regardless. UIS delta: +3–4 d to patch (logical props, focus halo, soft tints, Lucide icons, i18n props, fonts) vs −2–3 d saved on shell/table → net ≈ 0 to +2 d | Low to booking flow (separate host/route), medium to ops |
| Emails (`packages/emails`) | **Keep.** Inline-hex HTML strings; CSS vars and React components don't apply. DiceBear SVG is poorly supported in Gmail/Outlook. | 0 d | none |

Overall: **do not adopt UIS as a component layer in Vamos.** Vamos' kit is more complete for this product (domain components, RTL lint, law guards, tests). At most, borrow the DiceBear avatar helper for ops (see §7), wrapped in a Vamos `Avatar`.

## 6. Draft `ui.config.vamos.json` — value sources

File: `scratchpad/ui.config.vamos.json`. Same keys as UIS root `ui.config.json`, plus schema-allowed `radius.overrides`, `type.display/body/mono`, `avatars`, `motion`. `null` = no Vamos source (UIS `resolveConfig` skips null and falls back to its default — see "needs owner input").

| Key | Value | Source |
|---|---|---|
| name | Vamos Taxi | product name (`.claude/CLAUDE.md` Copy Voice) |
| brand.wordmark | Vamos Taxi | same |
| brand.caption | "" | tagline "Ride with class" is set artwork inside the lockup SVG (`design-system/readme.md:7,450,659`) — do not re-typeset |
| brand.mark | custom | supplied mark artwork |
| brand.logoSrc | /brand/logo/lockup-primary.svg | `assets/logo/lockup-primary.svg` → `apps/web/public/brand/logo/` |
| brand.markSrc | /brand/logo/mark-primary.svg | `assets/logo/mark-primary.svg` |
| brand.variant / placement | lockup / left | SiteHeader control row (`CLAUDE.md` "Every page uses the shared header") |
| color.primary | #1E1F1F | `design-system/tokens/colors.css:10` (`--vt-charcoal`) — UIS model is ink-primary + accent, like its own default |
| color.accent | #FDC20B | `colors.css:9` (`--vt-yellow`) — Vamos yellow CTA = UIS `Button variant="accent"` |
| color.neutral | #767877 | `colors.css:36` (`--vt-grey-500`, the mid grey of the neutral scale) |
| color.success | #359658 | `colors.css:45` `oklch(0.60 0.13 152)` converted to sRGB hex (UIS `safe()` rejects non-hex and would silently use its own green) |
| color.warning | #EDB306 | `colors.css:47` → `:25` (`--vt-yellow-500`) |
| color.danger | #CC3430 | `colors.css:49` `oklch(0.56 0.19 27)` → hex |
| color.info | #3179A6 | `colors.css:51` `oklch(0.55 0.10 240)` → hex |
| color.mode | light | no dark tokens anywhere; emails `color-scheme: light only` |
| radius.pill | true | `spacing.css:22,25` (`--vt-radius-field: pill`); readme "pill for every button and chip" |
| radius.overrides.card | 16 | `spacing.css:20` (`--vt-radius-lg`), readme:186 |
| radius.overrides.panel | 24 | `spacing.css:21` (`--vt-radius-xl`, sheets/booking widget) |
| type.display | Qurova | `typography.css:7`, `fonts.css:3-7` |
| type.body | Poppins | `typography.css:8`, `fonts.css:8-14` |
| type.buttonCase | upper | `.claude/CLAUDE.md:354` "CTAs are uppercase" |
| density | comfortable | controls 36/44 match `spacing.css:27-28`; lg 52 ≠ Vamos 54 (`spacing.css:29`) |
| surface.float | solid | readme:235 "do not blur cards" |
| surface.border | hairline | readme:186 "1px #DEDEDE hairline" |
| nav.front | bar | full-width sticky charcoal bar (`CLAUDE.md:93`, readme:263) |
| nav.back | sidebar | readme:266 "fixed 236px charcoal sidebar" |
| avatars.style | initials | Vamos Avatar falls back to initials (`apps/web/components/core/Avatar.tsx` `initials()`); `app/ops/OpsReviews.dc.html:247` "without a photo the initials show" |
| motion.enabled / intensity | true / subtle | `motion.css`, readme:240 "Short, flat, no bounce" |

### Needs owner input (left null / not expressible)
- `radius.roundness` — Vamos has no single roundness; only media/avatar would read it. Media radius undefined in Vamos.
- `radius.overrides.chip` — Vamos badges are 4px (`spacing.css:17`) but chips are pill; UIS has one `chip` role for both.
- `type.preset` — no preset matches; `display/body` override it. `type.mono` — Vamos mono is a system stack (`typography.css:9`), no family; UIS would load JetBrains Mono. Must set `loadFonts={false}`/`fonts:false`.
- `surface.shadow` — UIS computes its own shadow curves; Vamos `--vt-shadow-xs…xl` (`elevation.css:7-11`) cannot be expressed; map via CSS instead.
- `brand.wordmarkCase / wordmarkFont / markTone` — irrelevant with supplied logo files; no reversed/white logo slot for the charcoal header (`lockup-reversed.svg`, `lockup-white.svg` exist but the schema has one `logoSrc`).
- Arabic font (`--vt-font-arabic`, Noto Sans Arabic) — no schema field.
- Not expressible at all: yellow-tint suppression (laws.css), focus model (ring on buttons, border-only on fields), 54px CTA height, label tracking 0.09em.

## 7. DiceBear and anime.js

People imagery in Vamos today:
- Review authors: `apps/web/components/home/Reviews.tsx:266` `<Avatar name={review.authorName} size="xl" />` (initials), `avatarPath` field (:15) for an uploaded photo; ops review editor uploads a photo or shows initials (`app/ops/OpsReviews.dc.html:247,424`).
- Staff: `app/ops/OpsProfile.dc.html` (avatar upload / initials, `avatarPath` in `apps/web/lib/ops/staff.ts:26`); `OpsSidebar.dc.html:97` profile disc.
- Chauffeurs: photo field in `app/ops/OpsFleet.dc.html:396` (`photoKind:'chauffeur'`, upload to `/api/photos/upload`).
- Customers: no avatar in ops customers/table.
- Brand photography is vehicles, "no people-first lifestyle shots" (readme §Photography).

Where DiceBear could apply: ops-internal only — staff without a photo (sidebar, profile, assignment history), chauffeurs without a photo in Fleet/assignment pickers, customer rows in OpsCustomers. **Not** on public review cards: a generated cartoon face next to a real customer quote reads as fabricated/AI-generated (CLAUDE.md "Nothing may look AI-generated"), and not for chauffeurs shown to customers (the customer must recognise the real driver — photo or nothing). Styles must be non-coloured (`initials` or a neutral style recoloured to charcoal/grey; DiceBear palettes include pale yellows/pinks → law 02 check needed).

Where Reveal applies: home sections that already self-animate via IntersectionObserver (`HowItWorks.tsx:100-132`, `Reviews.tsx:148`) — could swap to `Reveal effect="fade-up"` with ≤320 ms; never `scale-in`/`blur-in`. Not in checkout/confirmation (punctual, no entrance delay on money screens). Adds animejs weight for no functional gain; existing IO code works.

CountUp: **conflicts** with the amounts rule for any price — counting from 0 displays invented intermediate CHF values, bypasses `VamosLocale.money()` / `CHF 1'250.00` formatting and `.vt-dir-keep`, and with `CHF 000` placeholders there is nothing real to count. Readme §States: "never a fake number". Also "no invented stats" rules out marketing counters. Only defensible use: ops dashboard KPIs from real rows (bookings today, unassigned count) — and even there Vamos motion ("nothing loops, nothing springs", 80–480 ms) argues for static figures. Recommendation: do not use CountUp in Vamos.
