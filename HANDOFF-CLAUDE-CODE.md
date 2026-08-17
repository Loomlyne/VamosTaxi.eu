# Vamos Taxi V1 — handoff to Claude Code

You are picking up a **finished design phase**. Every screen of the customer site and the
ops console exists as a working HTML mock, the brand system is complete and vendored, and
the build plan is written. Your job is to turn the mocks into the production platform —
**not** to redesign them.

**Read this file first, then `docs/GSD-LAUNCH.md`, then `docs/MISSING-FEATURES.md`, then
`CLAUDE.md`.** Those four are the whole brief. Everything else is reference.

---

## 0. The three things that decide whether this goes well

1. **The mocks are the visual spec, and they are final.** They were reviewed screen by
   screen at 1440/1024/768/390, in four languages. Do not "improve" layout, spacing,
   colour or copy while porting. A visual change requires a design decision, not a
   developer preference.
2. **The stack is fixed** (§3). Next.js 15 on **Cloudflare Workers** via
   `@opennextjs/cloudflare`, Supabase behind **Hyperdrive**, Stripe, Resend, Mapbox.
   **No Vercel anywhere** — not for hosting, not for preview deploys.
3. **The hard rules in `CLAUDE.md` are product rules, not style preferences** (§5). No
   glow, no tinted yellow, `CHF 000` until the price matrix lands, `data-tok` stays a
   labelled TBC pill, four languages in the same pass, Lenis scroll, responsive at four
   widths. A PR that breaks one of these is wrong even if it looks fine.

---

## 1. Run the mocks in 30 seconds

The `.dc.html` pages **run as-is in a browser**. They are ordinary HTML + JS with relative
asset paths — no build step, no bundler, no framework install. Serve the **package root**
(this folder, the one holding `app/`, `_ds/`, `assets/`) with any static server:

```bash
npx serve .            # or: python3 -m http.server 8000
```

Then open:

| Surface | URL |
|---|---|
| Customer site (start here) | `http://localhost:3000/app/home/home.dc.html` |
| Ops console | `http://localhost:3000/app/ops/ops.dc.html` |
| Ops sign-in | `http://localhost:3000/app/ops/ops-login.dc.html` |
| Any public page | `http://localhost:3000/app/pages/<name>.dc.html` |

Notes:

- **Serve from the root, don't `file://`.** Every page resolves `../../_ds/…`,
  `../../assets/…` and `../vamos-*.js` relatively; the folder structure is load-bearing.
  Moving a file breaks it.
- **First load needs internet.** `app/support.js` pulls React 18.3.1, ReactDOM and
  `@babel/standalone` from unpkg (SRI-pinned). Everything else — fonts, icons, logos,
  Lenis, the design-system bundle — is local.
- All state is `localStorage`. Nothing talks to a server. `VamosOps.resetAll()` in the
  console restores ops seed data.
- Cross-links between `app/home/`, `app/pages/` and `app/ops/` all resolve, so you can
  click through the real flows (home → checkout → confirmation, ops board → detail).

### Iterating on the mocks before/while you build

You can keep editing them as plain HTML+JS — that is the intended workflow for design
changes during the build. Anatomy of a `.dc.html`:

- A static `<head>` declaring every icon/logo file as
  `<meta name="ext-resource-dependency">` (the `Icon`/`Logo` components build URLs in JS
  and read them back from `window.__resources`).
- `<script src="./support.js">` — the small runtime that compiles the page. One copy sits
  in each folder (`app/`, `app/home/`, `app/pages/`, `app/ops/`); they are identical.
- A `<helmet>` block loading `_ds/…/styles.css`, `_ds/…/_ds_bundle.js`, Lenis, then
  `vamos-i18n-dict.js` + `vamos-locale.js`, plus a `:root` override block (this is where
  `--vt-shadow-accent:none` and `.vt-input--focus{box-shadow:none}` live — keep them).
- The page markup, **styled with inline styles only** plus a few `[data-*]` layout rules.
- A `class Component extends DCLogic { … }` script holding state and handlers.
- Sibling components mount as `<dc-import name="SiteHeader" …>`; design-system components
  as `<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Button" …>`.

---

## 2. What is in this package

```
CLAUDE.md                     project rules — the hard constraints, read in full
HANDOFF-CLAUDE-CODE.md        this file
github.md                     provenance of vendored third-party code (Lucide, Lenis)

app/                          ← THE LIVE MOCKS. This is the spec.
  home/                       home page + its sections and shared shell components
  pages/                      18 public pages (booking funnel, account, legal, marketing)
  ops/                        dispatch console: shell, sidebar, 13 screens
  vamos-i18n-dict.js          128+ strings × de/fr/ar + regex patterns (§6.1)
  vamos-locale.js             VamosLocale — the one language + currency store (§6.1)
  vamos-ops-data.js           VamosOps — the ops data contract (§6.2)
  vamos-reviews.js            published-reviews store shared by home + ops Reviews
  vamos-page-transition.js    cross-page transition runtime
  support.js                  page runtime (also copied into home/, pages/, ops/)

_ds/vamos-taxi-design-system-245af154-.../
  styles.css                  single entry point; @imports every token file
  tokens/                     colors, typography, spacing, elevation, motion, base, laws
  _ds_bundle.js               all design-system components as one UMD-ish global
  components/                 per-component .jsx + .d.ts + .prompt.md + states card
  assets/                     fonts (Qurova ×5, Poppins), icons, logo SVGs, patterns
  readme.md                   the full design-system guide — brand, voice, the four laws

assets/                       what the pages actually load
  icons/                      57+ Lucide SVGs (ISC) rendered as CSS masks through Icon
  logo/                       9 brand SVGs (wordmark/lockup/mark × primary/reversed/white)
  patterns/                   checker mark + checker tile
  photography/                supplied V-Class photograph (the only clean photo we have)
  lenis.js / lenis.css / lenis-boot.js   vendored Lenis 1.3.23 (MIT) + house settings

docs/
  GSD-LAUNCH.md               ← the build plan. Phases 0–9, Goal → Steps → Done when.
  MISSING-FEATURES.md         ← gap audit, page by page, 🔴/🟡/⚪ prioritised.
  SPEC-*.md                   23 per-screen specs: intended behaviour, rules, edge cases
  i18n-todo.txt               ~600 untranslated strings (mostly legal) + audit files
  LEGAL-PLACEHOLDER-CHECKLIST.md   every data-tok gap and who owes the number
  AUDIT-home-hero.md          hero decisions and why
  *.dc.html                   internal review scaffolds (English on purpose)
  PROMPT-CLAUDE-CODE-EXPORT.md the request that produced this package

screenshots/                  verification captures taken during design review
uploads/                      source screenshots and pastes from the client
hero-arrivals.jpg, rectangle-*.png   root images referenced by mocks

ds-upgrade/                          ⚠ HISTORICAL SNAPSHOT — do not edit, do not copy from
design_handoff_file_architecture/    ⚠ HISTORICAL SNAPSHOT — do not edit, do not copy from
```

### The two archives

`ds-upgrade/` and `design_handoff_file_architecture/` are **frozen snapshots of earlier
states of this project**, kept for history. They contain older copies of the same page
names (`ds-upgrade/app/home.dc.html`, `design_handoff_file_architecture/design-reference/home.dc.html`, …)
with a flat layout that predates the `home/ pages/ ops/` split.

**The live pages exist only in `app/`.** Never edit those folders, never port from them,
and never resolve an ambiguity by looking at them — if a file name appears in both, `app/`
wins. If you grep the repo, scope it to `app/`, `_ds/`, `assets/`, `docs/`.

---

## 3. Stack — fixed

| Concern | Decision |
|---|---|
| Framework | **Next.js 15, App Router**, TypeScript |
| Hosting | **Cloudflare Workers** via `@opennextjs/cloudflare` (`wrangler deploy`) — SSR + static assets in one Worker |
| Database / Auth / Storage / Realtime | **Supabase**, region **eu-central (Frankfurt)**, Pro |
| SQL access from the edge | **Cloudflare Hyperdrive** → the Supabase **direct connection string** (not the pooled one), `postgres.js`/`pg` with `max: 5` |
| Payments | **Stripe standard** (not Connect). CHF; cards + TWINT + Apple/Google Pay |
| Email | **Resend**, templates in `packages/emails`, four languages |
| Maps | **Mapbox** Geocoding + Directions, results cached in KV |
| Also Cloudflare | Queues (webhook fan-out), KV (quote/geo cache), R2 (photos, backups), Turnstile, WAF, Cron Triggers, Logpush |
| Repo shape | monorepo `apps/web`, `packages/db`, `packages/emails` |
| Envs | `dev` (wrangler dev + supabase CLI) · `staging` · `prod` |

**No Vercel.** No `vercel.json`, no `@vercel/*`, no Vercel preview deploys, no
Vercel-specific Next.js features (ISR/image optimisation must work under OpenNext on
Workers — verify each before relying on it). Supabase-js is used **only** for Auth token
verification, Storage and Realtime; all app queries go through Hyperdrive + SQL.

Ops is **not a second app**: it is a role-gated route group `/(ops)/ops/*` in the same
Next app, one deploy.

---

## 4. Build order

Follow `docs/GSD-LAUNCH.md` top to bottom. Each phase states its own "Done when" — treat
that as the exit test, don't move on early.

| Phase | What | Rough size |
|---|---|---|
| 0 | Accounts (Cloudflare, Supabase eu-central, Stripe, Resend, Mapbox, repo) | ½ day |
| **1** | **Scaffold: Next 15 + OpenNext on Workers, CI, port tokens + rebuild DS components as React** | 1 day |
| **2** | **Supabase schema + RLS + auth** — the tables mirror the `vamos-ops-data.js` shapes exactly | 2–3 days |
| **3** | **Hyperdrive data access** from the Worker; `@supabase/ssr` cookies in middleware | 1 day |
| 4 | Pricing engine + `/api/quote` (Mapbox, fixed routes, surcharges, coupons, 30-min lock) | 2–3 days |
| 5 | Checkout, Stripe PaymentIntent, webhook → Queues → lifecycle, emails, refunds, cron | 3–4 days |
| 6 | Port every surface to a route, pixel-faithful, on real data; Realtime ops board | 5–8 days |
| 7 | i18n completion (`content_strings`, ~600 legal strings) | 2 days + translation |
| 8 | Hardening for 10k concurrent: caching, compute sizing, WAF, k6, observability | 2–3 days |
| 9 | Cutover: DNS, 301 map, `pricing_live=true`, live checklist, watch week | 1 day + week |

**Priority the owner asked for:** Phases 1–3 (scaffold + database) → **home + booking
flow** (Phases 4–5 plus the home/checkout/confirmation routes of Phase 6) → **ops
console** (the rest of Phase 6). Ship in that order even where a later phase looks easier.

### How to port a screen (Phase 6)

1. Open the mock next to your route at 1440, 1024, 768 and 390.
2. **Reuse the design-system CSS verbatim.** Copy `_ds/…/tokens/*` + `styles.css` into
   `apps/web/public/brand/` (or `app/globals.css` via `@import`) unchanged — including
   `tokens/laws.css`, which **must stay the last import** (it is what enforces no-glow and
   no-tinted-yellow). Rebuild `Button`, `Input`, `Card`, `Badge`, `StatusBadge`,
   `RouteSummary`, `PriceSummary`, `Tabs`, `Table`, `List`/`ListRow`, `Counter`,
   `DatePicker`, `VehicleCard`… as React components **keeping the same class names**, so
   the CSS needs no rewrite. Read the component's `.prompt.md` before you touch it.
3. Lift the mock's inline styles as-is for layout. Where a mock uses a `[data-*]` rule,
   keep the attribute — the responsive rules hang off it.
4. Wire real data. Delete the localStorage store, keep the shape (§6).
5. Re-check the four widths, then German (strings grow ~30 %) and Arabic (`dir="rtl"`).
6. `Icon` stays a CSS mask over `assets/icons/`; `--vt-icon-base`, `--vt-logo-base` and
   `--vt-pattern-base` must point at wherever you serve those folders.

---

## 5. Hard rules (from `CLAUDE.md` — non-negotiable)

**No glow, ever.** No coloured or blurred halo on hover, focus, press or active — buttons,
cards, icons, links, inputs, anything. `--vt-shadow-accent` is `none` and stays `none`;
every page sets it in `:root`. Hover is a colour step, press is `translateY(1px)`, focus
is the `--vt-ring` charcoal/yellow ring. **Text inputs are the exception:** focus shows the
charcoal border only — every page also sets `.vt-input--focus{box-shadow:none}`. Carry both
lines into the React components.

**No tinted yellow, no brown-ish yellow.** `#FDC20B` at full strength as a small accent
only. Never `--vt-yellow-50/100/200/300` as a surface or border, never `-600/-700` as text
or icon colour. This includes kit defaults that ship tinted (`Alert tone="accent"`,
`ListRow icon=…`, `Badge tone="warning"`) — use `tone="inverse"`/`tone="info"`, charcoal,
or white with a `--vt-border-subtle` hairline. Attention is charcoal, full-strength yellow
on charcoal, or `--vt-danger`/`--vt-success`.

**`CHF 000` until the price matrix lands.** Never invent, never mock, never seed a
plausible CHF figure — not in code, not in emails, not in tests-as-fixtures visible to a
reviewer. Amounts render through `VamosLocale.money()`; `money(null)` → `CHF 000`. The
currency switch changes the mark, never the number. The Phase 4 flag `pricing_live=false`
keeps prod checkout disabled until the owner approves the real matrix — flipping it is the
launch trigger, not a dev convenience.

**Every `data-tok` stays a labelled TBC pill.** A number the client still owes us is human
words in a `[data-tok]` span whose CSS appends `TBC` ("Free cancel window TBC"). Never
`{TOKEN_NAME}`, never a guessed figure. `grep -r 'data-tok' app/` is the punch list;
`docs/LEGAL-PLACEHOLDER-CHECKLIST.md` says who owes each one. They disappear one at a time
as answers land — and then the number must come from the `settings` table, not from copy.

**Four languages in the same pass: en / de / fr / ar.** A surface is not done until every
visible string resolves — including `placeholder`, `aria-label`, `title` and `alt`.
Concatenated strings go in `patterns` as regex entries. Arabic is first-class: `dir="rtl"`,
so lay out with logical properties (`margin-inline-start`, `inset-inline-end`,
`padding-inline`) and never `left`/`right` for anything carrying text. Legal pages that
genuinely only exist in English carry `data-vt-legal` and say so instead of pretending.
Internal-only copy (review scaffolds, TBC labels) stays English on purpose.

**Responsive at 1440 / 1024 / 768 / 390, in the same pass.** Fluid first — `clamp()` for
type and gutters, `minmax()`/`auto-fit` grids, `flex-wrap`, `min-width:0` on flex children
holding text. Nothing scrolls sideways at 390. The booking widget stacks first on mobile.
Touch targets ≥ 44px (54px for booking-widget fields and primary CTAs).

**Lenis owns scrolling, everywhere.** Keep `assets/lenis.js` + `lenis.css` +
`lenis-boot.js` (or the npm package configured identically: `lerp 0.12`, no bounce,
`anchors:true`, `allowNestedScroll:true`, native touch, `prefers-reduced-motion` honoured,
stopped while a sheet locks the body). One instance per page — never a second `Lenis`,
never re-add `scroll-behavior:smooth`, and put `data-lenis-prevent` on any panel that owns
its own scroll.

**Also:** two background colours per page maximum (white and charcoal). The closing CTA is
a charcoal band, never yellow. One checker mark per surface, flush to a top-right corner.
White type over photography always sits on a scrim (`--vt-scrim-bottom`/`-left`), never a
text-shadow. Icons only from the vendored Lucide set through `Icon` — no hand-drawn SVG, no
emoji, no `→` as an icon (the one exception is `→` inside a route string like
"ZRH → Zermatt", where it is text). Copy stays sentence case; UPPERCASE is only for button
labels, kickers, table headers and badges. **CTAs are uppercase** — settled with the client.

---

## 6. Runtime contracts the production app must reproduce

The mocks' JS stores are the **agreed data contracts**. Keep the shapes and the method
names where you can; replace the storage underneath.

### 6.1 `VamosLocale` (`app/vamos-locale.js`) — language + currency, platform-wide

One store, one broadcast. Never read `localStorage.vamosLang`/`vamosCurrency` directly,
never reload a page to apply a choice.

| Call | Behaviour |
|---|---|
| `setLang('en'\|'de'\|'fr'\|'ar')` | relabels the live DOM in place, sets `lang` + `dir`, persists |
| `setCur('CHF'\|'EUR'\|'USD'\|…)` | re-renders every `[data-money]` |
| `onChange(fn)` | `fn({lang, cur})`, returns an unsubscribe |
| `t(str)` | one string in the active language, keyed by the **English source string** |
| `money(n)` / `money(null)` | formatted amount / **`CHF 000`** |
| `observe()` | keeps translating nodes React adds after boot |
| `coverage(root)` | lists untranslated strings under a node — run it on every new surface |

Production: `vamos-i18n-dict.js` becomes the `content_strings` table (key + en/de/fr/ar),
edited from the ops Content screen; the locale choice lives in a cookie so SSR renders the
right language; routes get `hreflang` (`/de/…`). A logic class that keeps `lang`/`cur` in
state subscribes in `componentDidMount` and releases in `componentWillUnmount`.

### 6.2 `VamosOps` (`app/vamos-ops-data.js`) — the ops data contract

Ten stores, each with the same tiny API. Collections: `vehicles`, `chauffeurs`,
`bookings`, `customers`, `coupons`, `routes`, `rates`, `surcharges` —
`all() get(id) blank(over) add(rec) update(id,patch) upsert(rec) remove(id) save(rows)
reset() onChange(fn)`. Singletons: `settings`, `profile` — `get() update(patch) reset()
onChange(fn)`. Plus `onAny(fn)` and `resetAll()`, and the enums `VEHICLE_CLASSES`,
`VEHICLE_STATUS`, booking status.

**Phase 2 mirrors these shapes as tables.** The booking status enum is fixed:
`quote · pending · paid · confirmed · assigned · completed · cancelled · refunded ·
no_show` — `StatusBadge` owns the colour mapping, don't re-map it. `price_chf` is
**nullable** until the matrix lands. `booking_events` is append-only and powers both the
ops detail timeline and the audit trail. `onChange`/`onAny` become Supabase **Realtime**
subscriptions on the ops board only — customers never hold sockets.

### 6.3 The rest

- **`vamos-reviews.js`** — the published-reviews store home reads and ops Reviews
  manages. One `reviews` table (author, rating, text, source, published, sort); public read
  of published rows only. Same rows both surfaces.
- **`vamos-page-transition.js`** — the cross-page transition. Port the effect to the App
  Router (route transitions), keep the timing; it is part of the felt quality of the site.
- **Auth mocks** — `vamosAuth` (customer) and `vamosOpsAuth` (staff, currently
  `localStorage === '1'`) are placeholders. Real: Supabase email+password and email OTP for
  customers; invite-only staff with a `role` JWT claim (`dispatcher|admin`) and **TOTP MFA
  required**. Delete the mock staff password from `ops-login`'s note.
- **`vamosCookieConsent`** — consent is stored but gates nothing. Wire actual script
  loading to it, add consent versioning and re-prompt on policy change.

Every one of these is a 🔴 in `docs/MISSING-FEATURES.md`, which lists the gaps **section by
section for every surface**. Work from that file when you plan a route; it is more
specific than this summary and it is the definition of "what's missing".

---

## 7. Mock → route map

| Mock | Route | Notes |
|---|---|---|
| `app/home/home.dc.html` | `/` | SSG/ISR + client booking widget; reviews + FAQ from DB |
| `app/pages/checkout.dc.html` | `/checkout` | locked quote, Stripe Payment Element (Phase 5) |
| `app/pages/confirmation.dc.html` | `/confirmation/[ref]` | real booking fetch, ICS, manage link |
| `app/pages/sign-in.dc.html` | `/sign-in` | Supabase Auth; `AuthForm`/`AuthStates`/`PhoneVerify` are its states |
| `app/pages/reset-password.dc.html` | `/reset-password` | tokened links + expiry (a `data-tok`) |
| `app/pages/account.dc.html` | `/account` | RLS-scoped profile; email/phone re-verify |
| `app/pages/bookings.dc.html` | `/account/bookings` | server pagination; `BookingRow` is the row |
| `app/pages/booking-detail.dc.html` | `/account/bookings/[ref]` | lifecycle + `booking_events` timeline |
| `app/pages/manage-booking.dc.html` | `/manage-booking` | ref+email lookup **and** tokened deep link |
| `app/pages/about`, `faq`, `contact`, `become-a-partner`, `coming-soon` | static/ISR | forms → Turnstile + Resend + DB row |
| `app/pages/terms`, `privacy`, `cookies`, `cancellation`, `imprint` | `/legal/*` | versioned, `data-tok` gaps, `data-vt-legal` notice |
| `app/ops/ops.dc.html` + the `Ops*` screens | `/ops/*` | staff-gated route group; Realtime board |
| `app/ops/ops-login.dc.html` | `/ops/sign-in` | invite-only + MFA |

Shared shell: `SiteHeader` (`variant="inverse"` everywhere, `variant="overlay"` on home
only) and `SiteFooter` are **mandatory on every public page** — never hand-roll either.
Ops uses `OpsSidebar` instead; it is the one surface without the site header.

**Screens that have no mock and still have to be designed+built** (flagged in
MISSING-FEATURES): 🔴 ops **new booking (manual/phone)** — dispatchers take phone bookings
today; 🟡 partner-application review queue; 🟡 refund/finance report; ⚪ corporate accounts
with invoicing. Ask before inventing these — they need a design pass, not a guess.

---

## 8. Owner blockers — design around them, never invent past them

1. **CHF price matrix + surcharges** → gates the Phase 4 engine and the Phase 9 flag flip.
2. **Policy numbers** (min advance, cancel window, waiting fees, no-show) → the `data-tok`
   pills and the refund logic. They must end up in `settings` and feed both copy and
   engine — one source of truth.
3. **Vehicle + destination photography** → the one V-Class photo currently repeats;
   Economy/Business fall back to an icon tile.
4. **Payment-provider and social brand marks** → typed in the footer until the kits arrive
   (they are trademarks, not icon-set glyphs — do not draw approximations).
5. **Qurova webfont license** → the only licence on file (`_ds/…/assets/fonts/OFL.txt`)
   covers Poppins. Confirm redistribution rights **before** serving Qurova from production.

Out of V1 scope, permanently: native apps and a driver app (no GPS/ETA tracking), and
anything that turns this into on-demand ride-hailing. This product is *booked ahead, priced
up front, driver waiting* — copy and UI must never imply "arriving in 3 minutes".

---

## 9. Definition of done, per route

- Visual diff against the mock approved at **1440, 1024, 768, 390**.
- Read once in **German** at 1080px and once in **Arabic** with `dir="rtl"`;
  `VamosLocale.coverage(root)` (or its production equivalent) returns empty.
- The four laws hold: no glow, no tinted yellow, `CHF 000`/`data-tok` intact, four
  languages present.
- Real data through Hyperdrive; no localStorage left except UI preferences.
- Lenis running, one instance, `data-lenis-prevent` on nested scrollers.
- Keyboard focus visible everywhere; touch targets ≥ 44px.
- The matching 🔴 items in `docs/MISSING-FEATURES.md` for that surface are closed.

---

## 10. Reference index

- `docs/GSD-LAUNCH.md` — the build plan, secrets matrix, cost estimate, the five blockers.
- `docs/MISSING-FEATURES.md` — gap audit per surface, prioritised.
- `docs/SPEC-*.md` — 23 screen specs (home widget, flight autofill, reviews, FAQ,
  services, why-vamos, checkout+confirmation, account, bookings, booking detail, manage
  booking, contact, partner, legal shell, terms, privacy, cookies, cancellation, imprint,
  about, ops board, ops detail, ops pricing, ops login, ops coming-soon).
- `docs/i18n-todo.txt` + `i18n-audit*.txt` — the untranslated string backlog.
- `docs/LEGAL-PLACEHOLDER-CHECKLIST.md` — every `data-tok` and who owes it.
- `_ds/…/readme.md` — the design-system guide: brand context, voice (§2), foundations
  (§3), components (§4), iconography (§5), pending inputs (§7), the four laws (§8),
  localisation (§9). Read §2 before writing a single line of customer-facing copy.
- `_ds/…/components/*/*.prompt.md` — per-component usage rules.
- `github.md` — provenance of the vendored Lucide icons and Lenis (licences, edits made,
  how to upgrade).
