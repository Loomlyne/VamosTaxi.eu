# Handoff: Vamos Taxi — rebuild with a real pages / components / sections architecture

## Your task

Rebuild the Vamos Taxi customer booking site and ops dispatcher dashboard in a real
codebase, with the file architecture properly separated into **pages**, **components**,
and **sections** (exact mapping below). Use real module imports (or your framework's
routing) so that separation actually works — do not flatten everything back into one
folder.

If this repo has no existing frontend stack, use: **Next.js (App Router) + TypeScript +
Tailwind + shadcn/ui**. Data/auth: Supabase. Maps: Mapbox. Payments: Stripe (standard,
not Connect). Email: Resend. This is the stack the product's own design system docs
specify — don't deviate without a reason.

If this repo already has an established stack (a different framework, an existing
component library, existing conventions), use that instead and fold this work into it
— don't introduce a second stack alongside it.

## About the design files in this bundle

Everything under `design-reference/` is a **design reference**, not production code —
22 HTML prototype files built in a flat, single-folder prototyping tool. That tool's
component-mount mechanism only resolves a component sitting in the *exact same folder*
as the page using it, with no support for nested imports — which is exactly why
everything is currently dumped in one flat pile and why this handoff exists. Don't
copy the HTML/inline-style markup verbatim; recreate the same visual result and
behavior using your codebase's real component patterns, with real imports across
real folders.

## Fidelity

**High-fidelity.** Colors, type scale, spacing, radii, and shadows below are exact
brand tokens, not approximations — lift them verbatim. Where the reference HTML and
this README ever disagree on a value, trust the HTML (it's the source of truth for
layout/spacing/copy); this README is the source of truth for architecture, tokens,
and cross-cutting behavior.

---

## 1. Target file architecture

```
app/                                   Next.js routes ("pages")
  page.tsx                             ← home.dc.html
  quote/page.tsx                       ← quote.dc.html
  checkout/page.tsx                    ← checkout.dc.html
  confirmation/page.tsx                ← confirmation.dc.html
  ops/
    login/page.tsx                     ← ops-login.dc.html
    page.tsx                           ← ops-board.dc.html   (dispatch bookings board)
    bookings/[id]/page.tsx             ← ops-detail.dc.html
    pricing/page.tsx                   ← ops-pricing.dc.html
    coming-soon/page.tsx               ← ops-coming-soon.dc.html (reads a ?section= or [section] param)

components/                            shared UI, used by 2+ pages
  SiteHeader.tsx                       ← SiteHeader.dc.html
  SiteFooter.tsx                       ← SiteFooter.dc.html
  OpsSidebar.tsx                       ← OpsSidebar.dc.html
  ServiceCard.tsx                      ← ServiceCard.dc.html
  StepCounter.tsx                      ← StepCounter.dc.html
  WhenPicker.tsx                       ← WhenPicker.dc.html
  BrandSelect.tsx                      ← BrandSelect.dc.html

components/sections/                   home-page content blocks, each self-contained
  HowItWorks.tsx                       ← HowItWorks.dc.html
  Services.tsx                         ← Services.dc.html
  WhyVamos.tsx                         ← WhyVamos.dc.html
  Reviews.tsx                          ← Reviews.dc.html
  FAQ.tsx                              ← FAQ.dc.html
```

`hero-explorations.dc.html` (in `design-reference/`) is **not a screen** — it's the
internal design-exploration file the home hero/quote-widget was originally drafted in,
and per `docs/AUDIT-home-hero.md` it still holds an older, out-of-sync version of that
code. Treat `home.dc.html`'s hero as the current version; you can ignore
`hero-explorations.dc.html` or use it only as a secondary reference if something in
`home.dc.html` is ambiguous.

## 2. Page → component/section usage map

| Page | Uses these components | Uses these sections |
|---|---|---|
| home | SiteHeader (or its own inline header — check the file), BrandSelect ×2 (language, currency), StepCounter ×2 (pax, bags), WhenPicker, SiteFooter | HowItWorks, Services, WhyVamos, Reviews, FAQ |
| quote | SiteHeader, SiteFooter | — |
| checkout | SiteHeader, SiteFooter | — |
| confirmation | SiteHeader (variant="inverse"), SiteFooter | — |
| ops-login | — | — |
| ops-board | OpsSidebar | — |
| ops-detail | OpsSidebar | — |
| ops-pricing | OpsSidebar | — |
| ops-coming-soon | OpsSidebar | — |
| Services (section) | ServiceCard ×3–4 | — |

## 3. Cross-cutting behavior (non-obvious, don't lose these when porting)

- **Ops auth guard**: every `ops-*` page except `ops-login` checks
  `localStorage.getItem('vamosOpsAuth') !== '1'` on mount and redirects to the login
  page if it fails. This is a placeholder — replace with real Supabase auth — but
  keep the same "redirect unauthenticated dispatchers to login" behavior.
- **OpsSidebar nav is one config array** (key, href, icon, English label, German
  label) — keep nav items driven by one shared list rather than hand-duplicating
  links per page. Items without a real screen yet (calendar, drivers, customers,
  coupons, settings) route to the coming-soon placeholder with a section identifier.
- **Language toggle**: reads/writes a stored language preference (`en`/`de`), strings
  are inline per component today (no i18n library). German is a **launch** language —
  use a real i18n solution (e.g. `next-intl`) and budget ~30% string growth over the
  English text when sizing UI for German.
- **Currency / language pickers** (`BrandSelect`) live in the header on every
  customer-facing page.
- **Never invent a CHF price.** Every amount in these mocks is the literal placeholder
  `CHF 000` / `CHF 00.00` — the real fare matrix is a pending client input. Keep
  placeholders as placeholders; don't fill in plausible-looking numbers.
- **Booking detail (ops-detail)**: tabs, a driver-assignment flow (list + dialog +
  confirm), a price summary, conditional alerts (outstanding balance / refund due),
  a dispatcher note field, and a toast on action — preserve this whole flow, it's the
  core of the ops product.
- **No coloured glow, anywhere** — no colored/blurred box-shadow on hover, focus,
  press, or active, on anything. Hover/press/focus use a fill or border change and
  `translateY(1px)` on press, plus neutral (never colored) shadows and the yellow
  focus ring specified below. This is a hard rule from the product's own design
  system, already overriding the base design system's default yellow button-hover
  glow — don't reintroduce it.

## 4. Design tokens

**Colors** — three fixed brand colors, everything else is a derived tint/shade or a
semantic color (success/warning/danger/info) added because the brand guide defines
none:

| Token | Hex | Role |
|---|---|---|
| yellow (accent) | `#FDC20B` | primary action, focus ring, active state, checker motif — action/attention only, never selection |
| charcoal (ground) | `#1E1F1F` | headers, footers, hero, voucher, sidebar, all text |
| grey (hairline) | `#DEDEDE` | hairlines, rules, disabled, quiet surfaces |

Two background colors per screen max: white and charcoal. Selected state = 2px
charcoal border, never a yellow fill/background.

**Type** — two families:
- **Qurova** — display, headings, prices, counters, reference codes. Tracking
  `-0.02em` at display size, `-0.01em` for headings. Leading 1.04–1.18.
- **Poppins** — body copy, UI, labels, tables. Leading 1.6 body, 1.45 tight.
- Scale: display 1–3 (fluid/clamped), heading 1–4 = 32 / 26 / 20 / 17px, body
  lg/md/sm/xs = 18 / 16 / 14 / 13px, label md/sm = 13 / 11px uppercase at `0.09em`
  tracking, figures lg/md/sm = 38 / 26 / 19px.
- Body text never below 13px. Sentence case everywhere in copy; uppercase with
  `0.09em` tracking is reserved for button labels, field kickers, table headers,
  badges, eyebrows — never a full sentence. **CTAs are uppercase** (settled brand
  decision, don't second-guess it).
- No emoji, anywhere, ever.

**Space & shape** — 4px base scale (4 → 128px). Radii: 4px badges, 8px tooltips,
**pill** for every input field and every button/chip (no exceptions), 16px cards, 24px
sheets/the booking widget. Control heights: 36 / 44 / 54px — 44px is the floor for
anything a customer taps, 54px for the booking widget's fields and primary CTAs.
Page container 1200px max-width, gutter `clamp(20px, 5vw, 56px)`.

**Cards** — white, 16px radius, 1px `#DEDEDE` hairline + a whisper-light shadow.
Raised/floating cards drop the border for a bigger neutral shadow (the booking widget
on the home page is the one prominent-shadow element). Charcoal ("inverse") cards
carry vouchers, selected summaries, trust blocks. No colored left-border accents,
ever.

**Shadows** — neutral charcoal, low spread, never pure black, xs (hairline) through
xl (dialogs). **No colored shadow anywhere in this rebuild** (see the no-glow rule
above — this overrides the base design system's own yellow-glow hover treatment).

**Motion** — short and flat, never bouncy: 80ms press, 140ms hover/focus, 200ms
toasts/dialogs, 320ms sheets. Easing `cubic-bezier(.2,0,.2,1)` standard,
`cubic-bezier(.16,1,.3,1)` for entrances. Dialogs rise 10px and fade in; toasts rise
8px. Nothing scales, nothing springs, nothing loops. Honor `prefers-reduced-motion`.

**States**:
- Hover — primary: one step darker yellow (no glow); secondary: charcoal-800;
  ghost: grey-50 fill + charcoal border; table rows: grey-50; links: yellow-700.
- Press — darker fill **plus `translateY(1px)`**, never a scale transform.
- Focus — 3px ring at `rgb(253 194 11 / .45)`; form fields also switch their border
  to charcoal. Focus must always be visible (this product gets used one-handed at
  an airport).
- Disabled — 42% opacity, no shadow, `cursor: not-allowed`.
- Loading/empty — state it in words ("Awaiting live data"), never a fake number or
  a shimmering placeholder pretending to be real data.

**Layout** — mobile-first, but the ops dashboard is desktop-primary. Sticky charcoal
site header, 76px tall. The booking widget floats over the hero on desktop and stacks
to the top on mobile. Quote and checkout are two-column with a sticky right rail
(journey + fare) pinned at `top: 96px`. Ops is a fixed 236px charcoal sidebar plus a
sticky detail panel. Tables scroll internally; page chrome never does.

Exact CSS custom properties for all of the above are in `design-tokens/` (`fonts.css`,
`colors.css`, `typography.css`, `spacing.css`, `elevation.css`, `motion.css`,
`base.css`) — read the values straight out of these rather than re-deriving them.

## 5. Icons

The reference uses 49 vendored Lucide outline SVGs (24×24, 2px stroke), rendered as
CSS masks. In a real React codebase, just use the `lucide-react` package directly
instead of the mask trick — same icon set, same look
(`plane-landing`/`plane-takeoff`, `map-pin`, `calendar`, `clock`, `users`, `luggage`,
`car-front`, `navigation`, `credit-card`, `banknote`, `receipt`, `ticket`,
`shield-check`, `snowflake`, `baby`, `funnel`, `search`, `ellipsis`, etc. — see
`assets/icons/` for the exact file set in use). Never hand-draw an icon or use an
emoji as one.

## 6. Assets

- `assets/icons/` — the 49 Lucide SVGs actually used.
- `assets/logo/` — wordmark / lockup / mark, each in primary (charcoal), reversed
  (white+yellow), and white — plus `favicon.svg`. Vector, use as-is.
- `assets/patterns/` — `checker-mark.png` (corner mark) and `checker-tile.png`
  (5–8% opacity watermark tile) — the brand's signature checker motif, from the taxi
  checkerboard read as a "digital" pixel mark. Never recolor, never center it.
- `assets/photography/fleet-van-street.jpg` — the one approved vehicle photograph
  (black Mercedes V-Class). Economy and Business vehicle classes have no photography
  yet — fall back to an icon tile for those, don't invent a stock photo.
- `hero-arrivals.jpg` and 3 `rectangle-msch*.png` files in `design-reference/` are
  currently used as the home hero background and the WhyVamos media stack — confirm
  with the client whether these are approved for production or need replacing before
  shipping them.
- Photography style, if you need to source more: premium black vehicles, cool
  daylight, slightly desaturated, no warm filter, no grain, no people-first lifestyle
  shots, never a yellow taxi.

## 7. Pending inputs — don't design around these, just leave them open

Real fare/pricing matrix, vehicle photography beyond the one V-Class shot,
destination/lifestyle photography, payment-provider marks (shown as text only for
now), and exact policy numbers (cancellation window, waiting fees, no-show) are all
unresolved client inputs. Keep them as placeholders; don't invent plausible-looking
values for any of them.

## 8. Files in this bundle

- `design-reference/` — all 22 source HTML prototypes (the pages, components, and
  sections listed in §1), for exact markup, copy, and inline layout/spacing values.
- `design-tokens/` — the 7 token CSS files backing §4.
- `assets/` — icons, logo, patterns, photography (§6).
- `docs/` — `AUDIT-home-hero.md` (a detailed audit of the current home hero
  implementation, including a performance/asset-weight critique worth reading before
  you re-implement it) and 4 `SPEC-home-*.md` files (FAQ, Reviews, Services, Why
  Vamos section specs).

## 9. Acceptance checklist

- [ ] Folder structure matches §1 — pages under `app/`, shared components under
      `components/`, home sections under `components/sections/`.
      No `.tsx` component lives in the same folder as a page.
- [ ] Every page in §2 imports the components/sections it needs via real imports —
      nothing copy-pasted between pages.
- [ ] Colors, type, spacing, radii, shadows match §4 exactly (not approximated).
- [ ] No colored/glow box-shadow anywhere, on any state.
- [ ] Ops pages redirect unauthenticated users to login (§3).
- [ ] Every CHF amount is still a placeholder, not a real number.
- [ ] Language toggle and German strings are wired through a real i18n setup, not
      hardcoded inline per component.
