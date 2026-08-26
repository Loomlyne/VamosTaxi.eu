# Phase 6: Ops Reference Data & Content Console - Research

**Researched:** 2026-08-24
**Domain:** Role-gated Next.js admin console (Supabase Auth + TOTP MFA, Supabase/Postgres CRUD
through the Phase 3 `withIdentity` contract, R2 photo storage, a DB-backed i18n loader)
**Confidence:** MEDIUM-HIGH — the data layer (Phase 2 schema, RLS policies, Phase 3's frozen
`withIdentity` signature) is HIGH confidence (read directly from executed/locked artefacts); the
UI layer is MEDIUM, because four of this phase's required screens (TOTP enrolment, invite-accept,
a real content-string editor, a versioned pricing publish flow) have **no mock to port** — the
`.dc.html` files either don't cover them at all or actively model the wrong interaction (see
`## Screens with no mock` below).

## Summary

Phase 6 builds the `/(ops)/ops/*` route group: role-gated by `app_metadata.vamos_role` (a JWT
claim written by Phase 2's Custom Access Token Hook) and `aal2` (TOTP), enforced in three
independent layers — Postgres RLS (the real boundary), Next.js middleware (UX redirect), and the
invite/claim flow itself. Every table this phase's screens edit already exists as a migration
(Phase 2, executed through Wave 3 as of this research; Waves 4-9 land before Phase 6 executes per
the roadmap's `1 → 2 → 3 → 4/5/6` sequencing) with RLS policies already written and reviewed. The
data-access contract (`withIdentity`, the `asStaff`/`publicSql` wrappers) is fully designed in
Phase 3's `03-CONTEXT.md` with a frozen function signature, but **Phase 3 itself is not yet
executed** (planned, zero plans landed) — Phase 6 planning can build against the frozen contract
with confidence, but execution cannot start until Phase 3 lands the actual `packages/db/src/`
module.

The single largest planning risk in this phase is **mock fidelity vs. requirement fidelity**.
Three of Phase 6's five screens directly contradict their own mock's interaction model once you
compare them against the Phase 2 schema and `docs/build/MISSING-FEATURES.md`'s own gap notes:
`OpsContent.dc.html` is a link directory to other pages, not a string editor (I18N-07 requires an
editor); `OpsPricing.dc.html` mutates each row's `live` flag directly, with no draft/publish
concept (Phase 2's `rate_versions` design is "insert a new version, never edit a live row" — a
structurally different UI); and `OpsFleet.dc.html` has no photo-upload control at all despite
`vehicles.photo_path`/`chauffeurs.photo_path` existing in the schema. A fourth gap has no mock
whatsoever: TOTP enrolment, the MFA challenge screen, and invite-acceptance do not appear
anywhere in `app/ops/AuthForm.dc.html`'s prop surface (`mode: signin|signup|forgot` only). The
planner must treat these four as **new UI built from Vamos design-system primitives**, not ports,
and should flag them for an owner/design look before or during planning — the project's own rule
for "screens that have no mock" (`HANDOFF-CLAUDE-CODE.md` §7) is "ask before inventing these."

**Primary recommendation:** Nest the ops route group under the existing `[locale]` segment
(`app/[locale]/(ops)/ops/**`, canonical `/ops/*` unprefixed for English per D-11/D-12) so the
console inherits the same SSR-safe `t()`/`useT()` runtime and satisfies Law 03 for the console
chrome itself (the mocks already call `VamosLocale` throughout every ops screen — this is not
optional polish). Build the ops shell and staff sign-in first as a hard gate (Wave 1), build TOTP
enrolment/MFA-challenge/invite-accept next since every other screen needs an `aal2` session to
even load (Wave 2), then build the five CRUD surfaces (Fleet, Pricing/coupons, Customers/Reviews,
Content, Settings/staff/profile) in parallel (Wave 3) — they touch disjoint tables and disjoint
files.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OPS-06 | Staff can manage vehicle classes, vehicles, chauffeurs, fixed routes, distance rates, surcharges and coupons | Phase 2 §5/§6 schema (`vehicle_classes`, `vehicles`, `chauffeurs`, `rate_versions`, `distance_rates`, `fixed_routes`, `surcharges`, `coupons`) + §14c staff/admin RLS split. Mock: `OpsFleet.dc.html`, `OpsPricing.dc.html`, `OpsCoupons.dc.html` — Pricing's mock interaction model must be redesigned (see Decisions D-04). |
| OPS-07 | Staff can see customers and their booking history | Phase 2 §5 `customers` table + `bookings`/`booking_legs` (Wave 5, lands before Phase 6 executes). Mock: `OpsCustomers.dc.html`, read-only against real booking data — no booking mutation ships here (Phase 8). |
| OPS-08 | Staff can publish, hide and order the reviews shown on the home page | Phase 2 §12 `reviews` table (`published`, `sort_order`, `locked` generated column). Mock: `OpsReviews.dc.html` — publish/hide/reorder/photo-upload interaction already matches the schema; only the photo persistence target changes (localStorage base64 → R2). |
| OPS-09 | Staff can edit business settings and the content strings behind the site copy | Phase 2 §4 `settings`/`settings_versions` split + §12 `content_strings`. Mock: `OpsSettings.dc.html` (settings only — `settings_versions` has no mock UI at all, see Decisions D-16) + `OpsContent.dc.html` (must be redesigned into a real editor, see Decisions D-05). |
| OPS-10 | The ops console is a role-gated area of the same application, reachable only by staff | Phase 2 §14c RLS (`app.is_staff()`, `aal2`, `AS RESTRICTIVE`) + `research/staff-mfa.md`'s three-layer enforcement. No mock — routing/middleware is new infrastructure. |
| I18N-07 | Editable content strings live in the database and are editable from the ops Content screen | Phase 2 §12 `content_strings` (three `$meta` flags: `pending_value`, `non_translatable`, `no_param_reason`) + Phase 1 D-14's loader seam (`apps/web/i18n/request.ts`'s `loadRawMessages()`) + Phase 3 D-11 (`content_strings` is in `publicSql`'s branded table set). |
| AUTH-05 (ops half) | Staff sign in by invitation only and must pass a second factor | Phase 2 D-04/D-05 (SQL half, done) + `research/staff-mfa.md` (invite route, TOTP enrol/challenge/verify, custom access token hook, Cloudflare cookie-folding pitfall). The UI half — invite-accept, enrol, challenge screens — has no mock and is Phase 6's to build. |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `/ops/*` route access gate | Frontend Server (Next.js middleware) | API/Backend (Postgres RLS) | Middleware is UX-layer redirect only; RLS via `app.is_staff()` + `aal2` is the real, unbypassable boundary (Phase 2 D-05). Never trust the middleware check alone. |
| Staff sign-in + TOTP MFA | API/Backend (Supabase Auth) | Database (`staff` table, Custom Access Token Hook) | Supabase Auth owns session/JWT/factor state; the hook derives `app_metadata.vamos_role` fresh from `public.staff` on every mint so revocation is instant. |
| Fleet / pricing / coupons / content / settings CRUD | Frontend Server (Next.js Server Actions) | Database (RLS per-actor policies) | Server Actions call `asStaff(env, claims, fn)` on `HYPERDRIVE_NOCACHE`; RLS is the actual per-role gate (dispatcher vs. admin), not the Server Action's own logic. |
| Photo upload (vehicle/chauffeur/review) | Browser (file picker) | API/Backend (upload route) → CDN/Storage (R2) | Browser selects/crops a file; a Route Handler issues or relays the R2 write (never a raw client-side R2 credential); R2 serves the read path, optionally behind a Worker route for cache/signing. |
| Content-string public read (site copy) | Database (Hyperdrive-cached `publicSql`) | CDN/Static (Hyperdrive's own query cache) | Phase 3 D-11 already brands `content_strings` onto the cacheable `HYPERDRIVE` binding — this is a data-tier decision, not a new CDN layer; no KV needed for V1. |
| Content-string write (ops edit) | Frontend Server (Server Action) | Database (`asStaff`, `HYPERDRIVE_NOCACHE`) | Every edit is a staff-attributed, RLS-checked write; the public read path picks it up once Hyperdrive's cache window elapses (bounded staleness, not a security concern for copy). |
| Customer + booking-history view | Frontend Server (SSR read) | Database (`customers`, `bookings`, `booking_legs`) | Read-only in this phase; no write path to `bookings` ships here. |

## Project Constraints (from CLAUDE.md)

Directives that bind every screen this phase builds, extracted from `CLAUDE.md` and
`.claude/CLAUDE.md`:

- **Design system only.** Every ops screen composes `Button`, `Card`, `Input`, `Table`, `List`,
  `Tabs`, `Dialog`, `Toast`, `StatusBadge`, etc. from the 33 already-ported components
  (`apps/web/components/**`) — never restyled raw HTML, never a new local CSS class name.
- **`OpsSidebar`, never the public header/footer.** Ops is the one documented exception to the
  mandatory `SiteHeader`/`SiteFooter` rule.
- **No glow, ever.** `--vt-shadow-accent: none` and `.vt-input--focus { box-shadow: none }` in
  every new surface's root style scope (already enforced platform-wide by `tokens/laws.css` +
  the Phase 1 stylelint gate — no new work here, just don't defeat it).
- **No tinted yellow.** Pricing/content "draft" and "pending" states must use charcoal, white
  with a `--vt-border-subtle` hairline, or `--vt-danger`/`--vt-success` — never
  `--vt-yellow-50…300` or `-600/-700`, even though "draft" badges are exactly the kind of state
  a generic admin UI reaches for a yellow pill to express.
- **`CHF 000` until the matrix lands, `data-tok` for every other pending value.** The Pricing
  screen must render every unpriced field as the placeholder by construction (NULL in the DB →
  `CHF 000` in the UI), never by a UI conditional that could invent a number in a fixture or
  screenshot. Imprint street, cancellation-policy figures already seeded by ADR-014 are not
  pending — only the CHF matrix itself and the remaining named blockers are.
- **Four languages, same pass — including the console chrome.** The ops mocks already call
  `VamosLocale` throughout (`OpsSidebar`, `OpsSettings`, `OpsPricing`, `OpsReviews`,
  `OpsContent`, `ops-login` all do); Phase 6 is not exempt from Law 03 just because its audience
  is staff, not travellers.
- **Arabic is first-class RTL.** Logical properties throughout; `OpsSidebar`'s collapse/expand
  and the Content screen's rail-plus-detail layout must be checked in `dir="rtl"` before being
  called done.
- **Lenis + `data-lenis-prevent`.** Any panel that scrolls independently (a long Table, the
  content-string list) gets `data-lenis-prevent`, matching the existing `OpsSidebar.dc.html`
  pattern (`data-lenis-prevent="1"` on the `<aside>`).
- **Ops copy is neutral and literal.** "Awaiting payment", "Draft version", "Published" — never
  marketing voice, never an exclamation mark.
- **GSD workflow enforcement (`.claude/CLAUDE.md`).** No direct repo edits outside a GSD
  command; this constrains the *executor* agent, not this research, but the planner should not
  produce tasks that assume ad-hoc file edits are acceptable.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | 2.112.3 `[VERIFIED: npm registry]` | Auth Admin API (`inviteUserByEmail`), MFA (`enroll`/`challenge`/`verify`), session client | The official Supabase JS SDK — cited throughout `research/staff-mfa.md` and Supabase's own docs by this exact package name. Not yet installed anywhere in this repo (`apps/web`, `packages/db` both lack it as of this research). |
| `@supabase/ssr` | 0.12.4 `[VERIFIED: npm registry]` | Next.js middleware/Server Component cookie-aware Supabase client | Supabase's documented SSR pattern for Next.js App Router (`createServerClient`); superseded the older `@supabase/auth-helpers-nextjs`. Also not yet installed. |
| `postgres` (via `@vamos/db`) | pinned by Phase 3 | Server Action → `withIdentity`/`asStaff` data access | Already the project's chosen SQL client (Phase 3 D-05/D-07); Phase 6 imports the named wrapper only, never `postgres` directly (Phase 3 D-10, CI-enforced). |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `jwt-decode` | 4.0.0 `[VERIFIED: npm registry]` — optional | Client-side, **display-only** decode of `app_metadata.vamos_role` for UI branching (e.g., hiding the Pricing nav item for a dispatcher before the RLS-backed page load confirms it) | Only if the planner wants an instant client-side nav hide; the RLS policy is the real gate regardless, so this is UX polish, not a security dependency. `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` already covers `aal` without decoding. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| R2 for chauffeur/vehicle/review photos | Supabase Storage | `docs/build/GSD-LAUNCH.md` itself recommends R2 ("same bill, image resizing at edge"), and `apps/web/wrangler.jsonc` already declares the `PHOTOS` R2 binding (Phase 1 D-34) — Supabase Storage would be a second, unused storage system. Not recommended. |
| `@supabase/ssr` middleware pattern | Hand-rolled cookie parsing | `research/staff-mfa.md` documents an **open, unfixed** Cloudflare-Workers cookie-folding bug (`opennextjs/opennextjs-cloudflare#501`) whose only known-safe mitigation is Supabase's own `NextResponse.next({ request })` pattern — hand-rolling this is strictly worse. |
| Drag-to-reorder for reviews | A drag-and-drop library (`@dnd-kit`, `react-beautiful-dnd`) | The mock's own interaction is a plain up-arrow "move up" affordance backed by an integer `sort_order` column — no library needed; a full drag library is justified only if the planner wants pointer-drag specifically, which the mock does not require. |

**Installation:**
```bash
pnpm --filter web add @supabase/supabase-js @supabase/ssr
```

**Version verification:** confirmed via `npm view @supabase/supabase-js version` (2.112.3, package
created 2020-01-17) and `npm view @supabase/ssr version` (0.12.4, package created 2023-09-06) —
training-data versions for fast-moving SDKs like these are routinely stale; re-run both commands
immediately before the plan's install task executes.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `@supabase/supabase-js` | npm | ~6 yrs (created 2020-01-17) | very high (official SDK, millions/wk class) | github.com/supabase/supabase-js | [OK] | Approved |
| `@supabase/ssr` | npm | ~3 yrs (created 2023-09-06) | high (official SDK) | github.com/supabase/ssr | [OK] | Approved |
| `jwt-decode` | npm | long-standing, widely used | very high | github.com/auth0/jwt-decode | not scanned (optional, not committed to) | Approved if the planner elects to use it — re-run slopcheck before install if so |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

`slopcheck install @supabase/supabase-js @supabase/ssr` ran successfully in this research session
(`[OK]` for both) — the tool performs a sandboxed `npm install` check and did not modify this
repo's `package.json`, lockfile or `node_modules` (confirmed via `git status`/`git diff` before
and after). No `postinstall` scripts were flagged for either package.

## Architecture Patterns

### System Architecture Diagram

```
Browser (staff)
  │  GET /ops/*  (or /de/ops/*, /fr/ops/*, /ar/ops/*)
  ▼
Next.js Middleware  ───────────────────────────────────────────┐
  │  supabase.auth.getUser()  (never getSession() — re-validates)│
  │  role = user.app_metadata.vamos_role                          │
  │  aal  = supabase.auth.mfa.getAuthenticatorAssuranceLevel()     │
  │                                                                │
  │  no user           → redirect /ops/sign-in                    │
  │  no role            → redirect / (not staff at all)            │
  │  aal !== 'aal2'      → redirect /ops/mfa-challenge               │
  ▼                                                                │
Route Group  app/[locale]/(ops)/ops/**                            │  (UX layer only —
  │  Server Component reads via asStaff(env, claims, fn)           │   not the security
  │  Server Action mutates via asStaff(env, claims, fn)            │   boundary; RLS is)
  ▼                                                                │
withIdentity (packages/db)  ──  BEGIN; set_config(role, claims) ───┘
  │  vamos_staff role, HYPERDRIVE_NOCACHE binding
  ▼
Postgres RLS  ──  AS RESTRICTIVE using (app.is_staff())  ──  per-actor policy (dispatcher vs admin)
  │
  ├─→ chauffeurs / vehicles / vehicle_classes / coupons / customers / bookings (read)
  ├─→ rate_versions / distance_rates / fixed_routes / surcharges  (admin-only write, §14c)
  ├─→ content_strings / reviews / settings / settings_versions
  └─→ staff  (admin-only write — invite/deactivate/role change)

Public site (separate request, no staff session)
  Next.js RSC  ──  publicSql(env)  ──  HYPERDRIVE (cacheable, vamos_public role)
  └─→ content_strings (public read policy: using (true))  →  apps/web/i18n/request.ts's
      loadRawMessages() swap point  →  next-intl  →  rendered page

Photo upload (chauffeur / vehicle / review)
  Browser file input  →  Server Action / Route Handler  →  R2 PUT (binding PHOTOS,
  jurisdiction:"eu")  →  photo_path / avatar_path column stores the object key
  →  read path: Worker route or public R2 URL  →  <img> / next/image (pending IMAGES binding)
```

### Recommended Project Structure

```
apps/web/
├── app/[locale]/(ops)/
│   ├── ops/
│   │   ├── layout.tsx              # OpsSidebar shell, aal2 guard re-check (defense in depth)
│   │   ├── sign-in/page.tsx        # AuthForm surface="ops" mode="signin", password only
│   │   ├── mfa-challenge/page.tsx  # NEW — no mock. TOTP code entry, post-password
│   │   ├── accept-invite/page.tsx  # NEW — no mock. set password → enrol → verify
│   │   ├── vehicles/page.tsx       # OpsFleet section="vehicles"
│   │   ├── chauffeurs/page.tsx     # OpsFleet section="chauffeurs"
│   │   ├── pricing/page.tsx        # OpsPricing — REDESIGNED for draft/publish (D-04)
│   │   ├── coupons/page.tsx        # OpsCoupons
│   │   ├── customers/page.tsx      # OpsCustomers, read-only + booking history
│   │   ├── reviews/page.tsx        # OpsReviews — photo upload target changes to R2
│   │   ├── content/page.tsx        # OpsContent — REDESIGNED into a real editor (D-05)
│   │   ├── content/legal/page.tsx  # legal-doc language-coverage view
│   │   ├── settings/page.tsx       # OpsSettings — settings singleton only (D-16)
│   │   └── profile/page.tsx        # OpsProfile — own MFA/password mgmt
│   └── api/staff/invite/route.ts   # service-role only, admin-gated
├── lib/supabase/
│   ├── server.ts                   # createServerClient for RSC/Server Actions (cookies())
│   ├── middleware.ts               # createServerClient for middleware (request/response cookies)
│   └── client.ts                   # createBrowserClient, ops-side only where needed
├── lib/db/
│   └── (Phase 3's asStaff/asCustomer/... wrappers — imported, not redefined)
└── components/ops/
    ├── OpsSidebar.tsx               # ported from app/ops/OpsSidebar.dc.html
    ├── OpsNav*.tsx
    └── ...
```

### Pattern 1: Three-layer AUTH-05 enforcement

**What:** RLS (`AS RESTRICTIVE`, `app.is_staff()` + `aal2`) is the real boundary; Next.js
middleware is a UX redirect; the invite/claim flow itself refuses to mark `staff.active`/complete
until MFA enrolment finishes.
**When to use:** Every ops route and every Server Action that touches an ops table.
**Example:**
```ts
// Source: .planning/phases/02-data-schema-rls-staff-auth-foundations/research/staff-mfa.md §4
// middleware.ts — UX layer only
const { data: { user } } = await supabase.auth.getUser(); // never getSession() in middleware
if (!user) return NextResponse.redirect(new URL("/ops/sign-in", request.url));
const role = user.app_metadata?.vamos_role;
if (!role) return NextResponse.redirect(new URL("/", request.url));
const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
if (aal.currentLevel !== "aal2") {
  return NextResponse.redirect(new URL("/ops/mfa-challenge", request.url));
}
```
```sql
-- Source: 02-SCHEMA-DRAFT.md §14c — the actual boundary, independent of the above
create policy chauffeurs_staff_gate on public.chauffeurs
  as restrictive for all to vamos_staff
  using ((select app.is_staff())) with check ((select app.is_staff()));
```

### Pattern 2: Publish-gated pricing (replaces the mock's live toggle)

**What:** A pricing edit never mutates a live row. A dispatcher/admin opens the current `draft`
`rate_versions` row (or an admin creates a new one), edits its child rows freely, then an admin
calls the publish action, which the DB's own trigger validates for completeness and legality.
**When to use:** `OPS-06`'s pricing screen only — every other CRUD screen in this phase is
ordinary create/update/delete.
**Example:**
```sql
-- Source: 02-SCHEMA-DRAFT.md §6 — tg_rate_version_transition refuses an incomplete publish
update public.rate_versions set status = 'live' where id = $1;
-- raises 'rate_version % has % unpriced distance_rates rows' (23514/restrict_violation)
-- if any *available* class in this version still has a NULL base_fare_rappen/per_km_rappen/
-- min_fare_rappen — catch by err.code, map to ops copy, never parse the message text.
```
The UI must therefore show, per draft version, a completeness checklist (which classes/routes/
surcharges are still unpriced) **before** the publish button is enabled — client-side
pre-validation as a UX courtesy, with the DB trigger as the actual gate.

### Pattern 3: The `content_strings` loader swap (I18N-07)

**What:** Phase 1 built exactly one seam for this: `apps/web/i18n/request.ts`'s
`loadRawMessages(locale)`. Everything else in that file (English-fallback merge, `$meta`
stripping, missing-key logging) stays untouched.
**When to use:** Once the ops Content editor can write to `content_strings`, swap this one
function's body.
**Example:**
```ts
// Source: apps/web/i18n/request.ts (existing, D-14's seam) + Phase 3 D-11 (publicSql is
// branded to content_strings among four other tables)
async function loadRawMessages(locale: Locale): Promise<Messages> {
  const rows = await publicSql(env, (sql) =>
    sql`select key, en, de, fr, ar, pending_value, non_translatable from content_strings`
  );
  return unflattenDotted(rows, locale); // key 'home.hero.title' -> { home: { hero: { title } } }
}
```
Do this swap **after** the seed migration has populated `content_strings` from
`apps/web/i18n/messages/*.json` (Phase 2 §17) and after the Content editor exists — an empty or
partially-seeded `content_strings` table swapped in too early would blank the entire public site.

### Anti-Patterns to Avoid

- **Porting `OpsContent.dc.html` literally.** It is a navigation index to other page mocks, not
  an editor. Shipping it as-is satisfies "matches the mock" but fails I18N-07 outright — the
  requirement, not the mock, wins here (see `docs/build/MISSING-FEATURES.md`'s own note: "it's a
  link directory, not an editor").
- **Porting `OpsPricing.dc.html`'s per-row `live` toggle as the only pricing UI.** It has no
  concept of a draft batch, no publish step, and would let a dispatcher edit a value that Phase
  2's freeze trigger will reject at the database level the moment any version goes live. Build to
  the schema, use the mock only for the visual chrome (tabs, currency selector, table layout).
- **Trusting `user_metadata` or the top-level `role` JWT claim anywhere.** Only
  `app_metadata.vamos_role` (Custom Access Token Hook output) is authoritative (Phase 2 D-04).
- **Checking `getSession()` in middleware.** Reads cookies without server re-validation; use
  `getUser()` (`research/staff-mfa.md` §4, Supabase's own documented rule).
- **Base64-in-localStorage photo "upload"** (the mock's actual pattern in `OpsReviews.dc.html`/
  `OpsProfile.dc.html`). Production needs a real R2 write and a `photo_path`/`avatar_path` column
  value, never a data URI stored in the row.
- **A `new NextResponse(...)` with a constructed body inside ops middleware's cookie-setting
  path.** Triggers the open Cloudflare cookie-folding bug (`opennextjs-cloudflare#501`); use
  `NextResponse.next({ request })` exactly as Supabase's own docs pattern does.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOTP secret generation, QR code, code verification | A custom TOTP library/crypto | `supabase.auth.mfa.enroll/challenge/verify` | Supabase Auth already implements RFC 6238 TOTP server-side; the client only renders the QR/secret it returns and submits the 6-digit code. |
| Role/permission derivation | A client-trusted role field, a second "is admin" table joined ad hoc in the app | The Custom Access Token Hook's `app_metadata.vamos_role` claim, read via `app.is_staff()`/`app.is_admin()` SQL helpers (already built, Phase 2) | Any app-layer role check that doesn't route through the hook + RLS can be bypassed by a forged claim or a stale cache; the hook re-derives from `public.staff` on every mint. |
| Draft/publish integrity for pricing | An app-layer "are all fields filled?" check as the only gate | The DB `tg_rate_version_transition` trigger (already built, Phase 2) | The trigger is the actual gate (SQLSTATE `restrict_violation`); an app-only check can be raced or skipped by a direct SQL client, a script, or a future second frontend. |
| Reorder persistence for reviews | A drag-and-drop library + its own ordering algorithm | Integer `sort_order` column + a "swap with neighbour" Server Action | The mock's own affordance (`Move up`) is exactly this; the schema already has the column and an index on `(published, sort_order, created_at desc)`. |
| Signed/relayed photo upload | A hand-rolled multipart parser or a client-side R2 SDK call with an exposed credential | A Next.js Route Handler that receives the file server-side and issues the R2 `put()` via the Worker's `PHOTOS` binding (R2 bindings are server-only, never exposed to the browser) | R2 credentials must never reach the browser; the binding is only reachable from Worker code, which is exactly what a Route Handler is on this stack. |

**Key insight:** almost everything this phase would be tempted to hand-roll (TOTP, role
derivation, publish-integrity, photo credentials) already has a server-side or database-side
implementation designed in Phase 2/3's research — the risk in this phase is re-deriving a worse
version of something already decided, not a genuine gap in the ecosystem.

## Common Pitfalls

### Pitfall 1: Treating the mock as the acceptance criterion for screens that need to change shape

**What goes wrong:** A plan ports `OpsContent`/`OpsPricing` pixel-for-pixel and calls I18N-07/
OPS-06 done because "matches the mock" is usually the acceptance bar.
**Why it happens:** The project's own stated rule ("the mocks are final... matches the mock is a
real acceptance criterion") is true for every other phase, but these two screens were designed
*before* the Phase 2 schema (`rate_versions` versioning, `content_strings`' three `$meta` flags)
existed, so the mock genuinely predates and contradicts the requirement.
**How to avoid:** Treat the mock as the source of chrome/branding/copy tone for these two screens
only, not the interaction model; verify against `docs/build/MISSING-FEATURES.md`'s own per-screen
gap notes (already flags both as needing a different interaction than what's mocked).
**Warning signs:** A plan task that says "port OpsPricing.dc.html" with no mention of draft/
publish, or "port OpsContent.dc.html" with no mention of an editable string table.

### Pitfall 2: Assuming Supabase's default mailer can send staff invites

**What goes wrong:** `supabase.auth.admin.inviteUserByEmail()` is called in staging with no
custom SMTP configured; the email either never arrives or the call fails outright for any address
not on the project's team allowlist.
**Why it happens:** Supabase's built-in mailer is fine for local `supabase start` testing (magic
links print to the CLI/Inbucket) but is explicitly not meant for production — 2 emails/hour,
restricted to pre-authorized team addresses unless custom SMTP is configured.
**How to avoid:** Wire Resend as Supabase Auth's custom SMTP provider (dashboard setting, not
code) before any real staff invite is sent in staging or production. This is execution-time,
owner-gated work (Resend account creation is "owner creates when asked" per ADR-014 §4) — flag it
as a blocking checkpoint, not something the plan can route around.
**Warning signs:** An invite "succeeds" in the API response but the staff member never receives
an email; a 429 from the invite endpoint.

### Pitfall 3: R2 bucket created without `jurisdiction: "eu"`

**What goes wrong:** The `PHOTOS` binding's buckets (`vamos-photos-staging`,
`vamos-photos-production`, already named in `apps/web/wrangler.jsonc`) get created via a plain
`wrangler r2 bucket create` the first time someone needs to test photo upload, without the
jurisdiction flag.
**Why it happens:** The binding is already declared in `wrangler.jsonc`, so it's easy to assume
the bucket itself already exists correctly provisioned; it does not (only the binding
declaration exists per Phase 1 D-34's "unused bindings" pattern).
**How to avoid:** `wrangler r2 bucket create vamos-photos-staging --jurisdiction=eu` (and the
production equivalent) as the literal first command in whichever plan first needs to write a
photo — verify the bucket doesn't already exist without the flag before creating (Phase 2 D-24:
irreversible after creation).
**Warning signs:** A support ticket or dashboard listing showing the bucket's jurisdiction as
default/global instead of `eu`.

### Pitfall 4: Building the pricing/staff nav items as visible-but-disabled for a dispatcher

**What goes wrong:** The UI shows a "Pricing" nav item to a dispatcher (greyed out, or worse,
clickable-then-erroring), when the RLS design (`rate_versions_admin_write` is `AS RESTRICTIVE FOR
ALL`) means a dispatcher's query returns **zero rows**, not a permission error — the correct UX
is to not show the nav item at all for that role, matching `MISSING-FEATURES.md`'s own note
("role-based nav — admin-only screens hidden from dispatchers").
**Why it happens:** It's tempting to build one nav config and gate visibility with a client-side
role check that's easy to get subtly wrong (e.g., checking `role !== 'admin'` instead of
allow-listing).
**How to avoid:** Read the role from the server-rendered session (RSC, not client state) when
building `OpsSidebar`'s nav list; the RLS behaviour (zero rows for a dispatcher on `rate_versions`/
`staff`) should never be user-visible as an empty state — it should never load for that role.
**Warning signs:** A dispatcher account sees an empty pricing table instead of not seeing the nav
item at all.

### Pitfall 5: Swapping the `content_strings` loader before the editor and seed both exist

**What goes wrong:** `loadRawMessages()` is pointed at `publicSql` before `content_strings` has
been fully seeded from the JSON dictionary, or before the Content editor can actually write to
it — the public site goes blank or falls back to English everywhere.
**Why it happens:** The swap looks like a one-line change (Phase 1 designed it that way on
purpose), which makes it tempting to do early, before the write path (the editor) is proven.
**How to avoid:** Sequence the swap as the *last* task in the Content plan, after the editor is
built and tested against a seeded table, with a rollback (revert to the JSON loader) as an
explicit fallback step if the DB-backed read path misbehaves.
**Warning signs:** A staging deploy where `/de/*` or `/ar/*` suddenly renders in English or blank
after a Content-plan merge.

## Code Examples

### Invite a staff member (service-role only, admin-gated)

```ts
// Source: research/staff-mfa.md §1, adapted to this repo's paths
// apps/web/app/[locale]/(ops)/api/staff/invite/route.ts
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export async function POST(req: Request) {
  // Gate this route behind the caller's own aal2 admin session first (asStaff + app.is_admin()).
  const { email, role } = await req.json(); // role: 'dispatcher' | 'admin'
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: "https://staging.vamostaxi.eu/ops/accept-invite",
    data: { invited_role: role }, // display-only cosmetic metadata, never authoritative
  });
  if (error) return Response.json({ error: error.message }, { status: 400 });
  // Authoritative row — the hook reads this table, never user_metadata.
  await supabaseAdmin.from("staff").insert({ user_id: data.user.id, role, mfa_enrolled: false });
  return Response.json({ ok: true });
}
```

### TOTP enrol → challenge → verify (net-new UI, no mock)

```ts
// Source: research/staff-mfa.md §2
const { data: enroll } = await supabase.auth.mfa.enroll({ factorType: "totp" });
// enroll.totp.{qr_code, secret, uri} — render the QR, offer the secret as text fallback
const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: enroll.id });
const { data: verify, error } = await supabase.auth.mfa.verify({
  factorId: enroll.id,
  challengeId: challenge.id,
  code: userEnteredCode,
});
// verify's new session JWT now carries aal:"aal2" — mark staff.mfa_enrolled = true only now.
```

### Publish a pricing draft and map the DB error to ops copy

```ts
// Source: 02-SCHEMA-DRAFT.md §6 (trigger) + Phase 3 D-08 (branch on err.code, never message text)
async function publishRateVersion(id: number) {
  try {
    await asStaff(env, claims, (sql) =>
      sql`update rate_versions set status = 'live' where id = ${id}`
    );
  } catch (err) {
    if (err.code === "23514" || err.code === "P0001") {
      // Incomplete matrix or illegal transition — surface the specific missing rows, don't
      // parse err.message; re-query which classes/routes/surcharges are still NULL.
      return { error: "incomplete" as const };
    }
    throw err;
  }
}
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Ops routes should nest under `app/[locale]/**` (canonical `/ops/*` unprefixed English, `/de/ops/*` etc.) rather than sit outside the locale segment | Architecture Patterns, Decisions D-01 | If wrong, every ops route needs re-routing and the middleware matcher needs rework; low-medium cost if caught before Wave 1 lands, one-way/costly after (mirrors D-11/D-12's own stated reversibility). Settle in `/gsd:discuss-phase` before planning locks it in. |
| A2 | `jwt-decode` is worth adding as an optional dependency for client-side nav-hide UX | Standard Stack | Low risk — purely additive UX; omitting it just means the nav briefly shows an item before the server-rendered role check redirects, no security impact either way. |
| A3 | R2 (not Supabase Storage) is the correct target for chauffeur/vehicle/review photos | Standard Stack, Alternatives Considered | Low risk — this is already a landed infrastructure decision (`wrangler.jsonc`'s `PHOTOS` binding, Phase 1 D-34), not a new choice this research is making; flagged as an assumption only because no phase document states it as a locked decision in prose. |
| A4 | Reset-MFA for a staff member is launch-window (🟡), not a Phase 6 blocker | Owner blockers / Uncertain | If the planner disagrees, add a `reset MFA` Server Action to the staff-management plan; `docs/build/MISSING-FEATURES.md` is the only source for this priority, not a locked requirement. |
| A5 | Settings_versions (the immutable policy history) gets a Phase 6 UI at all in V1, versus staying a read-only display of the current version with edits deferred | Decisions D-16 | If the planner decides staff must be able to publish a new policy version from the UI in this phase, that's a materially larger scope than "edit business settings" reads at face value — confirm with `/gsd:discuss-phase` before committing to either scope. |

**If this table is empty:** N/A — five assumptions recorded above, all MEDIUM-LOW risk.

## Decisions taken here

Non-binding recommendations this research makes where no CONTEXT.md exists yet to lock them —
the planner should treat these as strong defaults, not fait accompli; anything marked `[ASSUMED]`
should be confirmed in `/gsd:discuss-phase` if run before planning.

| # | Decision | Basis |
|---|----------|-------|
| D-01 | Ops routes nest under `app/[locale]/(ops)/ops/**` — canonical `/ops/*` unprefixed English per D-11/D-12, `/de/ops/*` etc. `[ASSUMED]` | Ops mocks call `VamosLocale` throughout; Law 03 applies platform-wide; `HANDOFF-CLAUDE-CODE.md`'s older `/ops/*` route table and "locale in a cookie" language predate Phase 1's actual `[locale]`-segment decision (D-11/D-12) and are superseded by it. |
| D-02 | Public read of `content_strings` goes through `publicSql(env)` on the cacheable `HYPERDRIVE` binding — the swap point is exactly `apps/web/i18n/request.ts`'s `loadRawMessages()`, nothing else moves | Phase 3 D-11 already brands `content_strings` (with `reviews`, `vehicle_classes`, `service_zones`, `settings_public`) onto `publicSql`; Phase 1 D-14 built the seam for exactly this swap. |
| D-03 | All ops writes go through `asStaff(env, claims, fn)` on `HYPERDRIVE_NOCACHE`, imported only via the named wrapper — never a raw `postgres` import | Phase 3 D-08/D-10 (frozen signature, CI-enforced import fence, `42501` on a forgotten wrapper). |
| D-04 | The Pricing screen is redesigned around `rate_versions`' draft→publish model (a completeness checklist gating a publish action), not ported as the mock's per-row `live` toggle | 02-SCHEMA-DRAFT.md §6's freeze trigger + `MISSING-FEATURES.md`'s own gap note ("versioned publish... blocked on client matrix"). |
| D-05 | The Content screen is redesigned into a real per-key string table editor (per-language columns, `pending_value`/`non_translatable`/`no_param_reason` flags surfaced, not collapsed) — not ported as the mock's link-directory pattern | `MISSING-FEATURES.md`: "it's a link directory, not an editor"; Phase 2 §12's three-flag design. |
| D-06 | TOTP enrolment, MFA challenge, and invite-accept are net-new screens built from Vamos primitives (`Card`, `Input`, `Button`, `Alert`, `StepIndicator`) — no mock exists to port | `AuthForm.dc.html`'s `data-props` enumerate only `signin\|signup\|forgot`; zero TOTP/MFA/invite states anywhere in `app/ops/`. |
| D-07 | Pricing (and its child tables) is effectively admin-only at the RLS layer — a dispatcher session returns zero rows, not a 403. The Pricing nav item must not render at all for a dispatcher role, decided server-side | `rate_versions_admin_write` is `AS RESTRICTIVE FOR ALL`, ANDing against read too (02-SCHEMA-DRAFT.md §14c's own comment: "a dispatcher cannot see the pricing batches at all"). |
| D-08 | Staff-management writes (invite, deactivate, role change) are admin-only at the RLS layer (`staff_admin_write`) | 02-SCHEMA-DRAFT.md §14c. |
| D-09 | Photo storage is R2 (`PHOTOS` binding), not Supabase Storage | `wrangler.jsonc` already declares the binding + bucket names (Phase 1 D-34); `GSD-LAUNCH.md` recommends R2 explicitly. |
| D-10 | Photo upload is a real R2 write via a server-side Route Handler/Server Action — never the mock's `FileReader.readAsDataURL` → localStorage pattern | `vehicles.photo_path`/`chauffeurs.photo_path`/`reviews.avatar_path` are R2 object-key columns (text), not data URIs, in the Phase 2 schema. |
| D-11 | Staff invite emails require Resend configured as Supabase Auth's custom SMTP before any real invite is sent | Verified: Supabase's default mailer is 2/hour and restricted to team-listed addresses (see Sources); ADR-014 independently names "staff invite emails" as a still-open owner item. |
| D-12 | The Content editor surfaces all three `content_strings` `$meta` facts (pending value / non-translatable / no-param) as distinct, separately-toggleable states, not one collapsed "translatable" boolean | 02-SCHEMA-DRAFT.md §12's explicit warning against collapsing them ("the string is a value the client still owes us... Drop this flag and a pending value silently becomes a stated fact"). |
| D-13 | Review reordering is a "move up/down" Server Action reassigning adjacent `sort_order` integers — no drag-and-drop library | Matches the mock's existing affordance; `reviews.sort_order` + its index already support this exactly. |
| D-14 | OPS-07 (customer booking history) is read-only against `bookings`/`booking_legs` in this phase — no booking mutation ships here | Booking mutation (assign, cancel, refund) is OPS-01…05, Phase 8's scope per the roadmap. |
| D-15 | The ops console UI chrome (nav labels, buttons, field hints, empty states) is translated through the identical `content_strings`/`t()` runtime as the public site — not a separate ops-only i18n mechanism | Law 03 is platform-wide by explicit project rule; the mocks already prove this pattern works for ops screens. |
| D-16 | `settings_versions` (the immutable policy history) gets a read-only "current version" display in Phase 6's Settings screen; publishing a *new* policy version (a genuinely new, unmocked workflow) is Claude's-discretion scope for this phase, not a hard requirement `[ASSUMED]` | OPS-09 says "edit business settings" — the mutable `settings` singleton maps directly to the mock; `settings_versions` has no mock UI at all and ADR-005's "one key, one fact" reasoning is about *reads* being centralised, not about staff routinely publishing new policy versions from the console. Flag for `/gsd:discuss-phase` if the planner wants full versioned-policy editing in V1. |

## UNCERTAIN — must be settled before or during execution

| # | Item | Why uncertain | The check that settles it | Blocks |
|---|---|---|---|---|
| U1 | Should `/ops/*` nest under the `[locale]` segment (`app/[locale]/(ops)/ops/**`) or sit outside it as an unprefixed route group? | The mocks and Law 03 argue for full four-language ops chrome; `HANDOFF-CLAUDE-CODE.md`'s older route table and "locale in a cookie" line argue (implicitly, by being silent on `[locale]`) for an unprefixed `/ops/*` — but that line predates Phase 1's D-11/D-12 URL-segment decision and is likely just stale, not a competing design | Confirm in `/gsd:discuss-phase` (or the planner's own explicit decision) before Wave 1 routes land — this is D-11/D-12-class "one-way, costly to reverse" once URLs are published/linked from invite emails | Every route file path in this phase's Wave 1 plan |
| U2 | Is the Custom Access Token Hook actually enabled on the live Supabase dashboard? | Phase 2 D-33/U15: pgTAP proves the hook *function*; whether the auth server *invokes* it is a dashboard toggle ("Authentication → Hooks (Beta)") that must be checked live, not assumed from docs | Log in to the live Supabase dashboard for `yaumjzvylngfjhtuffqs` and confirm the hook is wired before relying on `app_metadata.vamos_role` ever appearing in a minted JWT | Every RLS check this phase's screens depend on — if unset, every staff query returns zero rows with no diagnosable error |
| U3 | Is `opennextjs/opennextjs-cloudflare#501` (`Set-Cookie` folding) fixed in the version this repo pins (`@opennextjs/cloudflare@1.20.2`)? | Documented open against v0.5.12 at Phase 2's research time; this repo is now on 1.20.2, a large version gap | Read the changelog for `@opennextjs/cloudflare` between 0.5.12 and 1.20.2 for issue #501. Use `NextResponse.next({ request })` regardless — it is Supabase's own recommended pattern independent of whether the bug is fixed | Ops middleware's cookie-setting path; staff sessions are the most likely to chunk (larger JWT: role + aal + amr history) |
| U4 | Which of Phase 5 (customer auth) or Phase 6 (staff auth) lands `apps/web/lib/supabase/{server,middleware,client}.ts` first? | Both phases need `@supabase/supabase-js` + `@supabase/ssr` and run in parallel per the roadmap (`Parallel with: Phase 4, Phase 5`); neither package is installed yet | Check whichever phase's plan merges first; the second phase's plan should import the existing module rather than recreate it — note this explicitly in both phases' plan files | Wave 1 of whichever phase lands second |
| U5 | Do the `vamos-photos-{staging,production}` R2 buckets already exist without `jurisdiction: "eu"`? | The binding is declared in `wrangler.jsonc` (Phase 1 D-34) but Phase 1's scope was declaration only, not creation; a later phase or manual test could have created the bucket without the flag | `wrangler r2 bucket create vamos-photos-staging --jurisdiction=eu` will itself error informatively if the bucket exists already — check bucket jurisdiction via the Cloudflare dashboard or `wrangler r2 bucket list` **before** the first create attempt in this phase's Fleet/Reviews plans | Every photo-upload feature (Fleet, Reviews) |
| U6 | Does the `IMAGES` binding (needed for real `next/image` resizing) land before Phase 6 executes? | Phase 1 explicitly flagged this "for Phase 5, not fixed in this plan's scope"; Phase 5 and 6 run in parallel, so it is not guaranteed to land before Phase 6's photo screens are built | Check `apps/web/wrangler.jsonc` for an `images.binding = IMAGES` entry at the start of the Fleet/Reviews plan; if absent, use a plain `<img>` against the R2 read path rather than `next/image` | Vehicle/chauffeur/review photo display quality, not correctness |
| U7 | Exact shape of `ClaimsFor<'staff'>` that `asStaff(env, claims, fn)` expects | Phase 3 is designed (`03-CONTEXT.md`'s frozen signature) but **not executed** — `packages/db/src/claims.ts` does not exist yet as of this research | Re-read `packages/db/src/claims.ts` once Phase 3 lands, before writing any Server Action that calls `asStaff` | Every Server Action in this phase |
| U8 | Is "reset MFA" for a staff member in Phase 6's scope, or deferred? | `docs/build/MISSING-FEATURES.md` marks it 🟡 (launch-window) under Settings' "staff management UI (invite, role, deactivate, reset MFA)" line, alongside 🔴 invite/role/deactivate | Confirm scope in `/gsd:discuss-phase`, or default to deferring reset-MFA (leave it for a later phase) since it is the only 🟡 item in an otherwise 🔴 list | Sizing of the staff-management plan |
| U9 | Does OPS-09 ("edit business settings") include publishing a new `settings_versions` row from the UI, or only editing the mutable `settings` singleton? | `settings_versions` has zero mock coverage; `OpsSettings.dc.html` only ever touches the mutable singleton | Confirm scope in `/gsd:discuss-phase`; default assumption (D-16) is read-only display of the current policy version in this phase | Sizing of the Settings plan — materially larger if versioned publish is in scope |
| U10 | Is a wheelchair-accessibility declaration Art. 9 (health) data requiring restricted RLS and explicit consent? | Inherited unresolved from Phase 2's own research (U11), explicitly assigned there to "Phase 6, privacy-policy wording" | Counsel question, not an engineering one. No schema field for this exists yet in Phase 2's design, so it does not block any Phase 6 engineering task — only flag it if the planner is asked to add such a field | Privacy-policy wording only, not this phase's schema/UI |
| U11 | Does any Phase 6 screen need live, cross-tab reactivity (the mock's `onChange`/`onAny` behaviour), or is a Server Action + revalidation sufficient? | Realtime is explicitly Phase 8's territory (OPS-01); the mock's instant same-tab `localStorage` reactivity has no direct production equivalent in this phase | Review each of Fleet/Pricing/Coupons/Customers/Reviews/Content/Settings for a multi-staff-concurrent-edit scenario; if none exists in practice (one dispatcher edits at a time), plain `router.refresh()`/revalidation after a Server Action is sufficient and Realtime is correctly deferred to Phase 8 | UI reactivity pattern for every CRUD screen |

### Where sources disagreed

- **Route locale-prefixing (U1):** `HANDOFF-CLAUDE-CODE.md` §6.1/§7 implies an unprefixed `/ops/*`
  with locale in a cookie; Phase 1's D-11/D-12 (binding, later, and explicitly "one-way, costly
  to reverse") establishes `[locale]` as a route segment for the whole app with no stated
  ops exception. This research follows Phase 1's decision as authoritative (it is newer, and it
  is the actual implemented routing config) and flags `HANDOFF`'s language as stale, matching how
  Phase 2/3's own CONTEXT.md files handle similarly-stale `GSD-LAUNCH.md` rows.
- **The ~600-string legal dictionary premise (ROADMAP success criterion 4) vs. the measured
  current state:** `.planning/ROADMAP.md`'s Phase 6 success criterion 4 says "the ~600-string
  legal-page dictionary migrates here as professional translations arrive." That figure traces to
  `docs/build/i18n-todo.txt`, which `.planning/MOCK-COPY-PASS-PROMPT.md` and
  `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` (finding C22) both mark **superseded** — a
  2026-08-19 re-measurement found `app/vamos-i18n-dict.js` (the mock dictionary, since migrated
  to `apps/web/i18n/messages/*.json` in Phase 1) already fully translated except 19 proper-noun
  residuals across the five legal pages. This research independently confirmed the current state:
  `en.json` holds 1495 leaf keys; `de.json`/`fr.json`/`ar.json` are each within 4 lines of `en.json`'s
  line count, consistent with Phase 1 D-17's CI gate (which fails a PR on any missing key) already
  holding. **The real Phase 6 job for this criterion is therefore not "fill ~600 empty cells" —
  it's building the DB-backed editor so any *existing* translation (which may be
  machine-quality/interim in places) can be replaced with a professional one without a code
  deploy, on an ongoing basis.** The planner should not size a translation-filling task against
  the stale 600-string figure.

## Owner blockers that touch this phase

### 1. The CHF price matrix — open

Forces the Pricing screen's entire interaction model: the seed carries exactly one `draft`
`rate_versions` row and **never** a `live` one (Phase 2 D-34). Phase 6's publish button must be
provably inert against this state — every priced field renders `CHF 000` by data (NULL columns),
never by a UI conditional that could be tricked into showing a number in a fixture, a demo, or a
screenshot. `PRICING_PREVIEW=true` (display only, Phase 2's own note) is the only sanctioned way
to show draft numbers on staging, and even then never a real one. This does not block building
the screen — it blocks ever calling the screen "done" with an invented figure anywhere in it.

### 2. Vehicle and destination photography — open

`vehicles.photo_path`, `chauffeurs.photo_path`, `reviews.avatar_path` are nullable text
columns; `ADR-014`'s "still open" list and `docs/build/MISSING-FEATURES.md` both name this
directly ("the one V-Class photo currently repeats everywhere; Economy/Business fall back to an
icon tile"). Does not block Phase 6 engineering — the upload feature and the fallback rendering
(initials/icon tile, matching the Reviews mock's existing pattern) must both exist and be
correct with **zero** real photos supplied, since none will be available when this phase ships.

### 3. Staff invite emails — open (copy) and blocked (delivery)

ADR-014's "still open" list names "staff invite emails" as an unresolved copy/template
question. Independently, this research verified an operational blocker: Supabase Auth's default
mailer is rate-limited to ~2 emails/hour and restricted to addresses already on the project's
team list — real staff invites cannot be delivered until Resend is wired as Supabase Auth's
custom SMTP provider (see Sources; a dashboard setting, not code). The Resend account itself is
"owner creates when asked" per ADR-014 §4 — nobody should request it speculatively; the plan
should name the exact point at which this becomes a hard blocker (the first real, non-`@example`
staff invite in staging) rather than gating the whole phase on it. Local `supabase start`
development is unaffected (Inbucket/CLI-printed links work without custom SMTP).

### 4. Imprint street/postcode — stays TBC

ADR-014 §7: "Stays TBC." No Phase 6 engineering impact — the Content screen renders this like any
other `pending_value` row (a `data-tok`-equivalent TBC state in the editor itself), not a special
case.

### 5. Wheelchair/Art. 9 classification — open with counsel

Inherited from Phase 2's own research (U11), explicitly assigned there to "Phase 6, privacy-policy
wording." No schema field for an accessibility declaration exists in Phase 2's design, so nothing
in this phase's engineering is blocked — only a hypothetical future settings/customer field would
need counsel's answer before shipping.

### 6. Qurova webfont purchase — open until bought

ADR-014 §7: "Keep this item open until the purchase lands." No Phase 6 impact — fonts are Phase
1's concern and are already vendored pending the licence; noted here only because Phase 6 renders
through the same design system and inherits whatever font-serving state Phase 1/5 land in.

## Screens with no mock

Per `HANDOFF-CLAUDE-CODE.md` §7's own rule ("ask before inventing these — they need a design pass,
not a guess"), flag rather than silently design:

1. **TOTP enrolment** (QR code, secret fallback, confirm-code step).
2. **MFA challenge** (returning staff member, post-password, pre-`aal2`).
3. **Invite-accept** (set password → straight into enrolment, per `research/staff-mfa.md`'s
   "enrolment must be mandatory, not optional" rule).
4. **A real content-string editor** (`OpsContent.dc.html` is a directory, not this).
5. **A pricing draft/publish workflow** (`OpsPricing.dc.html` has no draft concept at all).
6. **Vehicle/chauffeur photo upload** (no upload control exists in `OpsFleet.dc.html` despite the
   schema having the column).

These six are genuinely new UI, not ports. The planner should build them to the Vamos design
system's existing primitives and patterns (the same Card/Input/Button/Alert language every other
screen uses) rather than inventing a new visual idiom, and should flag them for an owner/design
look at the earliest reasonable checkpoint — `checkpoint:human-verify` on the first draft of each
is a reasonable place to put that ask, matching how the project already handles other no-mock
screens (ops "new booking, phone" is flagged the same way for Phase 8).

## Proposed Phase 6 plan split

A recommendation the planner may adopt, adapt or replace — not a locked decision. Sequenced so
every screen that needs an `aal2` staff session (i.e., everything except the shell itself) has
one to test against before its own plan starts.

| # | Plan | Goal (one line) | File scope | Depends on | Parallel with |
|---|---|---|---|---|---|
| **P1** | **Ops shell, routing, password sign-in** | The role-gated route group exists, middleware redirects correctly on missing user/role/aal2, `OpsSidebar`/`ops-login` are ported, a seeded staff user can sign in with a password (no MFA enforced yet at this plan's own gate — that lands in P2) | `apps/web/lib/supabase/{server,middleware,client}.ts`, `apps/web/middleware.ts` (extended), `app/[locale]/(ops)/ops/layout.tsx`, `app/[locale]/(ops)/ops/sign-in/page.tsx`, `components/ops/OpsSidebar.tsx`, `@supabase/supabase-js` + `@supabase/ssr` install | Phase 3 executed (`asStaff`/`publicSql` exist); coordinate with Phase 5 on the shared `lib/supabase/*` module (U4) | nothing (hard gate — every later plan needs the shell) |
| **P2** | **TOTP enrolment, MFA challenge, invite-accept** | The three AUTH-05 UI states that have no mock exist and are wired to the RLS `aal2` gate; the invite Route Handler is admin-gated and calls `inviteUserByEmail`; `staff.mfa_enrolled` flips only after a real `mfa.verify()` success | `app/[locale]/(ops)/ops/mfa-challenge/page.tsx`, `app/[locale]/(ops)/ops/accept-invite/page.tsx`, `app/[locale]/(ops)/api/staff/invite/route.ts`, seeded staff+TOTP test fixtures | P1 | P3–P7 can be authored in parallel but should not be considered "staff-usable" until this lands |
| **P3** | **Fleet: vehicle classes, vehicles, chauffeurs + photo upload** | OPS-06's fleet half: CRUD against `vehicle_classes`/`vehicles`/`chauffeurs`, licence/insurance expiry fields, R2 bucket created with `jurisdiction: "eu"`, photo upload wired through a server-side Route Handler | `app/[locale]/(ops)/ops/vehicles/page.tsx`, `.../chauffeurs/page.tsx`, `components/ops/Fleet*.tsx`, R2 bucket creation (Wrangler), photo-upload Route Handler | P1, P2 | P4, P5, P6, P7 (file-disjoint) |
| **P4** | **Pricing (draft/publish) & coupons** | OPS-06's money-adjacent half: the redesigned `rate_versions` draft/publish workflow with a completeness checklist, `distance_rates`/`fixed_routes`/`surcharges` editors (admin-gated), `coupons` CRUD. Every priced field renders `CHF 000`/NULL; publish stays provably inert with no live `rate_versions` row seeded | `app/[locale]/(ops)/ops/pricing/page.tsx`, `.../coupons/page.tsx`, `components/ops/Pricing*.tsx`, publish Server Action + DB-error-to-copy mapping | P1, P2 | P3, P5, P6, P7 |
| **P5** | **Customers (read-only) + Reviews (publish/hide/reorder + photo)** | OPS-07 and OPS-08: a read-only customer list + booking history against real `bookings`/`booking_legs`; reviews publish/hide/`sort_order` reorder, photo upload retargeted from base64-localStorage to R2 | `app/[locale]/(ops)/ops/customers/page.tsx`, `.../reviews/page.tsx`, `components/ops/Customers*.tsx`, `Reviews*.tsx` | P1, P2, (P3's R2 bucket-creation task, or duplicate it here if P3 hasn't landed yet — coordinate, don't double-create) | P3, P4, P6, P7 |
| **P6** | **Content strings editor + the `loadRawMessages` swap** | I18N-07: the real per-key editor (per-language columns, the three `$meta` flags surfaced), a legal-doc language-coverage view, and — as the *last* task in this plan, after the editor is proven against a seeded table — the `apps/web/i18n/request.ts` loader swap to `publicSql`, with a documented rollback | `app/[locale]/(ops)/ops/content/page.tsx`, `.../content/legal/page.tsx`, `components/ops/Content*.tsx`, `apps/web/i18n/request.ts` (the one-function swap) | P1, P2 | P3, P4, P5, P7 |
| **P7** | **Settings, staff management, profile** | OPS-09's settings half: the mutable `settings` singleton editor + a read-only `settings_versions` current-policy display (D-16); admin-only staff management (invite trigger via P2's route, deactivate, role change); each staff member's own profile (password, MFA re-enrol, sign-out-everywhere) | `app/[locale]/(ops)/ops/settings/page.tsx`, `.../profile/page.tsx`, `components/ops/Settings*.tsx`, `Profile*.tsx` | P1, P2 | P3, P4, P5, P6 |

```
P1 ── P2 ──┬── P3 ──┐
           ├── P4 ──┤
           ├── P5 ──┼── (phase gate: full Playwright + pgTAP suites, German/Arabic pass per screen)
           ├── P6 ──┤
           └── P7 ──┘
```

**Wave 1:** P1 alone — the hard gate every other plan's tests need (a working sign-in URL and a
role-gated shell). **Wave 2:** P2 alone — every remaining screen assumes an `aal2` session exists
to test against, and P2 is also where the invite Route Handler both P3–P7's "staff-management"
touchpoints and any seeded test fixture ultimately depend on. **Wave 3:** P3, P4, P5, P6, P7 in
parallel — five file-disjoint CRUD surfaces against tables Phase 2 has already finished (Waves
1–9 land before Phase 6 executes per the roadmap's stated `1 → 2 → 3 → 4/5/6` sequencing). The one
coordination point inside Wave 3 is R2 bucket creation (P3 and P5 both write photos) — whichever
plan's task runs first creates the bucket with `--jurisdiction=eu`; the other imports the binding,
never re-creates it.

## Open Questions

1. **Does `settings_versions` need a "publish new policy version" workflow in Phase 6, or only a
   read-only current-version display?**
   - What we know: the mutable `settings` singleton clearly maps to `OpsSettings.dc.html`.
     `settings_versions` has zero mock coverage.
   - What's unclear: whether OPS-09's "edit business settings" is meant to include the
     versioned policy fields (cancellation tiers, waiting minutes) or whether those stay
     effectively frozen at their ADR-014-seeded values until a later phase.
   - Recommendation: default to read-only display in this phase (D-16); confirm scope in
     `/gsd:discuss-phase` if the planner wants otherwise — it changes plan sizing materially.

2. **Where does the shared `apps/web/lib/supabase/*` client module live if Phase 5 (customer
   auth) and Phase 6 (staff auth) both need it and run in parallel?**
   - What we know: both phases need `@supabase/supabase-js` + `@supabase/ssr` and a
     cookie-aware server client; neither is installed yet.
   - What's unclear: which phase's plan actually lands the shared module first, and whether the
     two phases' plans should explicitly coordinate a merge order to avoid a duplicate-install
     conflict.
   - Recommendation: whichever phase's Wave 1 plan lands first creates
     `apps/web/lib/supabase/{server,middleware,client}.ts`; the other phase's plan imports it. Note
     this explicitly in both phases' plan files so the second-landing phase's planner checks
     before assuming greenfield.

3. **Does the R2 photo read path need a Worker proxy route, or can the bucket serve a public URL
   directly?**
   - What we know: R2 buckets are private by default; chauffeur/vehicle photos feed public pages
     (home, VehicleCard) so at least those need a stable, cacheable public URL.
   - What's unclear: whether a Cloudflare custom domain on the bucket (public bucket access) or a
     Worker route proxying `PHOTOS.get(key)` is the better fit given the project's WAF posture.
   - Recommendation: default to a Worker route (`/photos/[key]`) for uniform cache-header control
     and to keep the bucket itself private; revisit only if Phase 6/5 measure a real latency cost.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `@supabase/supabase-js` | Staff auth, MFA, invite | ✗ (not installed) | target 2.112.3 | none — hard dependency, install in Wave 1 |
| `@supabase/ssr` | Middleware/RSC session | ✗ (not installed) | target 0.12.4 | none — hard dependency, install in Wave 1 |
| Hosted Supabase project (`yaumjzvylngfjhtuffqs`) | Every screen | ✓ (exists, Zurich region) | — | — |
| Local `supabase start` (port 54322) | Local dev/test | ✓ (Phase 2 established) | Postgres 17 local | — |
| `wrangler.jsonc` `PHOTOS` R2 binding | Photo upload | ✓ binding declared, ✗ bucket not yet created with `jurisdiction: eu` | — | Create bucket with `--jurisdiction=eu` as the first photo-upload task |
| `wrangler.jsonc` `IMAGES` binding (next/image real resizing) | Photo display via `next/image` | ✗ (not declared; Phase 1 flagged for Phase 5, not yet landed) | — | Plain `<img>` against the R2 read path until the binding lands |
| Custom SMTP (Resend) on Supabase Auth | Real staff invite delivery | ✗ (Resend account is owner-provisioned "when asked", not yet requested per ADR-014 §4) | — | Local `supabase start` uses Inbucket/CLI-printed links for dev testing; staging/production invite sending is blocked until Resend + SMTP wiring lands |
| Phase 3's `packages/db` `withIdentity`/`asStaff`/`publicSql` | All data access | ✗ (Phase 3 designed, 0 plans executed as of this research) | frozen signature in `03-CONTEXT.md` | Phase 6 cannot execute (only plan) until Phase 3 lands, per the roadmap's stated dependency |
| Custom Access Token Hook enabled on the live Supabase dashboard | `app_metadata.vamos_role` actually minted | UNCONFIRMED (Phase 2 D-33/U15: verify against the live dashboard, not docs, at wiring time) | — | pgTAP proves the hook function itself; whether the auth server actually invokes it is a dashboard setting that must be checked, not assumed |

**Missing dependencies with no fallback:**
- `@supabase/supabase-js` / `@supabase/ssr` — must be installed; no substitute SDK is compatible
  with Supabase's Auth Admin API and MFA endpoints.
- Phase 3's data-access layer — Phase 6 execution is blocked until it lands (planning is not).

**Missing dependencies with fallback:**
- R2 `IMAGES` binding — fall back to plain `<img>`.
- Custom SMTP — fall back to local dev testing only; flag staging/production invite sending as
  blocked pending the Resend account.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Playwright (already configured, `apps/web/playwright.config.ts`) for route/integration behaviour; `supabase test db` (pgTAP, already established by Phase 2) for RLS/trigger assertions |
| Config file | `apps/web/playwright.config.ts`; `packages/db/supabase/config.toml` |
| Quick run command | `pnpm --filter web exec playwright test tests/integration/ops-<area>.spec.ts` |
| Full suite command | `pnpm test:visual` (web) + `pnpm db:test` (pgTAP, from repo root) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OPS-10 | A dispatcher-role JWT cannot reach `/ops/pricing` or `/ops/settings/staff` | integration (Playwright, seeded staff fixtures) | `pnpm --filter web exec playwright test tests/integration/ops-role-gate.spec.ts` | ❌ Wave 1 |
| OPS-10 / AUTH-05 | A staff session at `aal1` (no MFA yet) cannot reach any `/ops/*` page except `/ops/mfa-challenge` | integration | `pnpm --filter web exec playwright test tests/integration/ops-aal-gate.spec.ts` | ❌ Wave 2 |
| AUTH-05 | `insert into public.staff` and role escalation are refused to non-admin `vamos_staff` | pgTAP | `supabase test db supabase/tests/ops_write_denied.test.sql` (already exists per Phase 2 §14c, extend if needed) | ✅ (Phase 2) |
| OPS-06 | Publishing an incomplete `rate_versions` draft is refused with the expected SQLSTATE, and the UI surfaces which rows are missing | integration + pgTAP | `pnpm --filter web exec playwright test tests/integration/ops-pricing-publish.spec.ts`; `supabase test db supabase/tests/rate_version_publish.test.sql` (Phase 2) | ❌ Wave 3 (Playwright side) |
| OPS-08 | Hiding a review removes it from the public home Reviews section without a page reload elsewhere | integration | `pnpm --filter web exec playwright test tests/integration/ops-reviews-publish.spec.ts` | ❌ Wave 3 |
| I18N-07 | Editing a `content_strings` row and re-rendering the public page (after cache TTL) shows the new value in all four languages | integration | `pnpm --filter web exec playwright test tests/integration/content-string-edit.spec.ts` | ❌ Wave 3 |
| I18N-07 | Arabic RTL renders correctly on every new ops screen | manual (per `CLAUDE.md`'s existing per-surface Arabic pass rule) | n/a — human check with `dir="rtl"` | manual-only, existing project convention |

### Sampling Rate

- **Per task commit:** the relevant single Playwright spec (`-x` fast-fail) + the relevant single
  pgTAP file.
- **Per wave merge:** `pnpm test:visual` + `pnpm db:test` (full suites).
- **Phase gate:** both full suites green, plus a manual German-at-1080px and Arabic-`dir="rtl"`
  pass on every new screen (existing project convention, not new to this phase).

### Wave 0 Gaps

- [ ] `apps/web/tests/integration/ops-role-gate.spec.ts` — covers OPS-10
- [ ] `apps/web/tests/integration/ops-aal-gate.spec.ts` — covers AUTH-05 (ops half)
- [ ] `apps/web/tests/integration/ops-pricing-publish.spec.ts` — covers OPS-06
- [ ] `apps/web/tests/integration/ops-reviews-publish.spec.ts` — covers OPS-08
- [ ] `apps/web/tests/integration/content-string-edit.spec.ts` — covers I18N-07
- [ ] Seeded staff fixtures (a dispatcher and an admin `staff` row + a TOTP factor pre-enrolled
  for one, not the other) for the local Playwright/pgTAP runs — none exist yet; Phase 2's seed
  only covers reference data, not staff test accounts.
- [ ] `pnpm --filter web add -D` nothing extra — Playwright is already present; no new test
  framework install needed.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Supabase Auth (password + TOTP MFA), invite-only account creation, `getUser()` (never `getSession()`) server-side re-validation |
| V3 Session Management | yes | `@supabase/ssr` cookie-aware session, `aal` claim checked on every ops request, session survives refresh per Supabase's own token-refresh flow |
| V4 Access Control | yes | Postgres RLS `AS RESTRICTIVE` policies keyed on `app.is_staff()`/`app.is_admin()` + `aal2` — the actual boundary, not the app layer |
| V5 Input Validation | yes | Server Action input validated before reaching `asStaff`; DB-side CHECK constraints and the pricing completeness trigger as the final gate |
| V6 Cryptography | yes (delegated) | TOTP secret generation/verification is Supabase Auth's responsibility (never hand-rolled, see Don't Hand-Roll); manage-token hashing (SHA-256) is Phase 2's existing pattern, not new here |
| V8 Data Protection | yes | Photo uploads never expose R2 credentials to the browser; service-role key used only in the invite Route Handler, server-side only, never in a client bundle (existing `NEXT_PUBLIC_*` allowlist gate from Phase 1 D-35 already covers this) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged/stale role claim (`user_metadata.role` or a cached `app_metadata`) | Spoofing / Elevation of Privilege | Only read `app_metadata.vamos_role`, always derived fresh by the Custom Access Token Hook from `public.staff` on every token mint (Phase 2 D-04). |
| Middleware bypass (disabled/misconfigured redirect) | Elevation of Privilege | RLS `AS RESTRICTIVE` policies are the real gate; middleware failure degrades to "page loads then queries return zero rows / `42501`", never to a data leak. |
| Cross-request cookie/session leakage on a reused Worker instance | Information Disclosure | Not this phase's mechanism directly, but every ops data read/write goes through Phase 3's `withIdentity`, which is specifically designed against this class of failure (DATA-06). |
| Multi-cookie `Set-Cookie` folding on Cloudflare Workers (staff sessions are larger, more likely to chunk) | Tampering (session corruption) | `NextResponse.next({ request })` pattern only, per `opennextjs-cloudflare#501` — see Common Pitfalls / Anti-Patterns. |
| Unenrolled-but-invited staff account left "half-active" | Elevation of Privilege (if trusted before MFA completes) | `staff.mfa_enrolled` is a UX flag only; the RLS `aal2` check makes an unenrolled account unable to reach ops data regardless of what the app believes (Phase 2's own stated design). |
| R2 credential exposure via a client-side upload widget | Information Disclosure / Tampering | Upload always relayed through a server-side Route Handler using the Worker's `PHOTOS` binding; never a client-side presigned-URL scheme unless explicitly designed and reviewed. |
| Staff invite email interception/spoofing via a mis-set redirect | Spoofing | `redirectTo` on `inviteUserByEmail` pinned to the known staging/production origin, never derived from request input. |

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `@supabase/auth-helpers-nextjs` | `@supabase/ssr` | Supabase deprecated auth-helpers in favour of `@supabase/ssr` for App Router SSR cookie handling (documented in Supabase's own migration guides) | Use `@supabase/ssr` only; do not install the deprecated package even if an older tutorial references it. |
| Checking `getSession()` for auth decisions server-side | `getUser()` (server round-trip re-validation) | Supabase's own current guidance, cited directly in `research/staff-mfa.md` | Binding for this phase — `getSession()` in middleware/Server Components is a documented anti-pattern, not a style preference. |

**Deprecated/outdated:** `@supabase/auth-helpers-nextjs` — do not use.

## Sources

### Primary (HIGH confidence)
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-CONTEXT.md`, `02-SCHEMA-DRAFT.md`
  — the executed/locked schema, RLS policies, and staff-auth SQL this phase builds on.
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/staff-mfa.md` — the full
  AUTH-05 design lane (invite, TOTP, hook, Cloudflare cookie pitfall), with its own cited Supabase
  and OpenNext/Cloudflare documentation links.
- `.planning/phases/03-hyperdrive-data-access-wiring/03-CONTEXT.md` — the frozen `withIdentity`/
  `asStaff`/`publicSql` contract this phase's every data access depends on.
- `.planning/phases/01-platform-foundation-design-system-port-i18n-runtime/01-CONTEXT.md`,
  `apps/web/i18n/request.ts` — the ported component set and the exact `content_strings` loader
  swap point.
- `apps/web/wrangler.jsonc` — the already-declared `PHOTOS` R2 binding and bucket names.
- `docs/build/MISSING-FEATURES.md` — the per-screen gap audit that identifies OpsContent/OpsPricing/
  OpsFleet as needing more than a port.
- `HANDOFF-CLAUDE-CODE.md` — stack constraints (§3) and the "screens with no mock" rule (§7-8),
  cross-checked against and partially superseded by Phase 1's actual `[locale]` routing decision.
- npm registry (`npm view @supabase/supabase-js version`, `npm view @supabase/ssr version`) —
  version and package-age verification, run directly in this research session.
- `slopcheck install @supabase/supabase-js @supabase/ssr` — run directly in this research session,
  both `[OK]`.

### Secondary (MEDIUM confidence)
- Supabase's default-mailer rate-limit finding (2/hour, team-address restriction pre-custom-SMTP)
  — WebSearch, cross-referenced against Supabase's own "Production Checklist" and "Send emails
  with custom SMTP" docs pages surfaced by the same search; not independently fetched in full in
  this session, so tagged MEDIUM rather than HIGH.

### Tertiary (LOW confidence)
- None used without cross-verification in this research.

## Metadata

**Confidence breakdown:**
- Standard stack (Supabase JS/SSR versions, R2 as storage target): HIGH — versions verified
  against the live npm registry and slopcheck in this session; R2 target is an already-landed
  infrastructure decision, not a new recommendation.
- Architecture / data access contract: HIGH — read directly from Phase 2's executed schema and
  Phase 3's frozen (though not-yet-executed) function signature.
- UI/screen design (pricing publish flow, content editor, MFA screens): MEDIUM — these are
  genuinely new UI with no mock to verify against; the *data model* they must satisfy is HIGH
  confidence, the *exact interaction design* is this research's own reasoned recommendation, not
  a verified source.
- Pitfalls (mailer rate limit, cookie folding, R2 jurisdiction): MEDIUM-HIGH — cookie-folding bug
  and R2 jurisdiction are cited from Phase 2/3's own prior research sessions (already
  cross-verified there); the mailer rate limit is this session's own WebSearch finding,
  cross-referenced against two independent pages in the same search but not deep-fetched.

**Research date:** 2026-08-24
**Valid until:** 2026-09-07 (14 days) — shorter than the default 30 because this phase's
correctness depends on Phase 3 actually landing with the exact signature `03-CONTEXT.md`
currently freezes; re-verify against `packages/db/src/identity.ts` once Phase 3 executes, before
this phase's plans are finalized.
