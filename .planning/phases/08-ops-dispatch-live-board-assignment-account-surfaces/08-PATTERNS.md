# Phase 8: Ops Dispatch — Live Board, Assignment & Account Surfaces - Pattern Map

**Mapped:** 2026-09-10
**Files analyzed:** 42 (modify-in-place DC/store/staff JSON + reuse Phase 7 checkout/Stripe/Resend + new assign/refund/edit RPCs)
**Analogs found:** 42 / 42 — every new write has a same-repo analog. There is **no** analog for React `/ops`, hash URLs as product IA, `emptyBookings()`, or inventing CHF.

## Binding caveats (do not reopen)

- **DC ops is the product.** Wire `app/ops` + `app/vamos-ops-data.js`. Do not resurrect React `/ops`.
- **No `#` in any URL.** Middleware 307-to-`/` is the bug. Serve `ops.dc.html` on D-10 paths.
- **No `emptyBookings` / Isolation Customer* / `VT-48xx` runtime lists.** Empty is empty.
- **Ledger writes = SECURITY DEFINER RPCs** (`checkout_create_booking` family). Never `asStaff INSERT` into `booking_payments`. Never browser service-role.
- **Worker name is `vamos`.** Do not recreate `vamos-web-staging`.
- **Never invent CHF.** `CHF 000` until a real zero or a captured amount. Charge currency is `chf`.
- Phase 7 UAT tests 2–9 continue elsewhere. Do not rewrite `07-UAT.md`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `app/ops/ops.dc.html` | route (DC SPA shell) | event-driven (nav) | itself — replace `readHash` / `location.hash` with `readPath` + `history.pushState` | exact — same file |
| `app/ops/OpsSidebar.dc.html` | component (nav) | transform (hrefs) | itself — `NAV_TOP` / `FLEET` / `NAV_BOTTOM` labels stay; `href:'#dashboard'` → `'/dashboard'` | exact — same file |
| `app/ops/OpsDash.dc.html` | component (tiles) | transform + subscribe | itself — keep `onChange` → `forceUpdate`; change money filter + kill `EXPENSES` rows | exact — same file |
| `app/ops/OpsBoard.dc.html` | component (list) | CRUD (read) + nav | itself — `VamosOps.bookings.all()` already live; `#detail/` → `/bookings/{ref}` | exact — same file |
| `app/ops/OpsCalendarBoard.dc.html` | component (calendar) | CRUD (read) + nav | itself — same board store; `openBooking` hash → path | exact — same file |
| `app/ops/OpsDetail.dc.html` | component (detail) | request-response | itself — cancel PATCH is live; assign `setState` is a lie; take-card = public Payment Element | exact / analog: checkout payment |
| `app/ops/OpsFleet.dc.html` | component (CRUD) | CRUD | itself + `PATCH /api/staff/chauffeurs/:id` — Save must wait for uuid `json.data` | exact — same file |
| `app/ops/OpsCustomers.dc.html` | component (CRUD) | CRUD | itself + `upsertCustomer` write-through | exact — same file |
| New-trip surface `/bookings/new` | component | request-response | Public quote box + `OpsDetail` tokens. No dedicated mock (UI-SPEC). | role-match: public quote + ops chrome |
| Chauffeur page `/fleet/chauffeurs/{id}` | component | request-response | `OpsFleet` profile fields + `OpsBoard` rows (read-only) | role-match |
| `app/vamos-ops-data.js` | service (client store) | request-response + poll | itself — `restCollection`; fix `save`/`pickRows`/poll | exact — same file |
| `app/pages/bookings.dc.html` | component (public list) | request-response | itself — already `GET /api/account/bookings`; catch → `[]`; preview `VT-4821` must not leak | exact — same file |
| `apps/web/middleware.ts` `serveOpsDc` | middleware | request-response | itself — keep HTML inject; stop 307 everything to `/` | exact — same file |
| `apps/web/app/[locale]/(ops)/api/staff/bookings/route.ts` | route (GET) | request-response | itself — `withStaff` + `loadBookings` + `jsonOk` | exact — same file |
| `apps/web/app/api/staff/bookings/route.ts` | route (dual mount) | request-response | itself — `export { GET } from locale twin` | exact — same file |
| `apps/web/app/[locale]/(ops)/api/staff/bookings/[id]/route.ts` | route (PATCH/DELETE) | request-response | itself — keep cancel; **stop** `status=refunded` ledger lie; chauffeur string out | exact — same file |
| `apps/web/app/api/staff/bookings/[id]/route.ts` | route (dual mount) | request-response | itself — `export { PATCH, DELETE }` | exact — same file |
| `apps/web/app/.../api/staff/bookings/[id]/assign/route.ts` (NEW) | route | request-response | `[id]/route.ts` `withStaff` + `jsonOk`/`jsonErr` | role-match |
| `apps/web/lib/ops/bookings.ts` | service (read) | CRUD (SELECT) | itself — add chauffeur/vehicle ids, plate/model, `captured_at`, summed captures/refunds | exact — same file |
| `apps/web/lib/ops/bookings-map.ts` | utility (pure) | transform | itself — `vehicle` today is class slug; D-50 needs fleet row | exact — same file |
| `apps/web/lib/ops/bookings-write.ts` | service (write) | CRUD | itself — cancel keep; chauffeur `full_name` match dies; refund moves out | exact — same file |
| `apps/web/lib/ops/assign.ts` (NEW) | service | request-response | `create-booking.ts` RPC call shape + `sqlstate.ts` mapping | content: checkout RPC / convention: sqlstate |
| `apps/web/lib/ops/refund.ts` (NEW) | service | request-response | `createRefund` in `stripe.ts` then a DEFINER RPC (not `markRefunded`) | exact analog: stripe helper |
| `apps/web/lib/ops/fleet-http.ts` | utility (HTTP parse/present) | transform | itself — `parseChauffeurBody` already maps `vehicle` → `defaultVehicleId` | exact — same file |
| `apps/web/lib/ops/chauffeurs-write.ts` | service (write) | CRUD | itself — already SETs `default_vehicle_id`. Client is the bug. | exact — same file |
| `apps/web/app/[locale]/(ops)/api/staff/chauffeurs/[id]/route.ts` | route | request-response | itself — PATCH returns `jsonOk(presentChauffeur)` object | exact — same file |
| `apps/web/lib/ops/sqlstate.ts` | utility | transform | itself — add `23P01` exclusion_violation | exact — same file |
| `apps/web/lib/ops/customers.ts` | service | CRUD | itself — `upsertCustomer` already writes through `contact_*` | exact — same file |
| `apps/web/app/api/account/bookings/route.ts` | route | request-response | itself — `asCustomer` + RLS; join chauffeur/vehicle | exact — same file |
| `apps/web/lib/account/bookings.ts` | utility | transform | itself — `vehicle` is class slug today | exact — same file |
| `apps/web/lib/checkout/create-booking.ts` | service | request-response | itself — **the** phone-booking writer. Do not INSERT. | exact — reuse |
| `apps/web/app/api/checkout/intent/route.ts` | route | request-response | itself — `asCheckout` + `runCheckoutIntent` | exact — reuse |
| `apps/web/app/api/checkout/pay-link/route.ts` | route | request-response | itself — `sendPayLink` + same unpaid session (D-14/D-22) | exact — reuse |
| `apps/web/lib/checkout/stripe.ts` | service | request-response | itself — `createCheckoutSession` / `createRefund` / `sessionIsPayable` | exact — reuse |
| `apps/web/app/api/stripe/webhook/route.ts` | route | event-driven | itself — verify → `stripe_event_record` → Queue | exact — reuse |
| `apps/web/lib/checkout/settle.ts` | service | event-driven | itself — `checkout_payment_settle`; extra settle must **not** rewind pending→paid | exact — extend |
| `apps/web/lib/db/identity.ts` | service | request-response | itself — `asStaff` / `asCheckout` / `asSystem` / `asCustomer` | exact — reuse |
| `packages/db/.../20260823000011_booking_legs.sql` | constraint (keep) | event-driven | itself — GiST EXCLUDE. Do not drop. | exact — keep |
| `packages/db/.../20260823000005_fleet.sql` | schema (keep) | — | itself — `chauffeurs.default_vehicle_id` | exact — keep |
| `packages/db/.../20260910000001_bookings_select_by_contact_email.sql` | RLS (keep) | request-response | itself — D-05 | exact — keep |
| `packages/db/supabase/migrations/<ts>_ops_assign.sql` (NEW) | migration | CRUD + events | `20260827000003_checkout_rpc.sql` SECURITY DEFINER shape + GiST 23P01 | role-match |
| `packages/db/supabase/migrations/<ts>_ops_refund.sql` (NEW) | migration | CRUD | `booking_refunds` + `checkout_payment_settle` events | role-match |
| `packages/db/supabase/migrations/<ts>_booking_edit_requests.sql` (NEW) | migration | CRUD | `booking_events` append-only + snapshot extra charge | role-match |
| `packages/emails/src/lib/send.ts` | service | request-response | itself — `sendPayLink` / `sendConfirmation` / `sendRefund` | exact — reuse |
| `packages/emails/src/*Assign*.tsx` (NEW) | email template | transform | `PayLinkEmail.tsx` + `sendPayLink` envelope (`FROM`, locale) | role-match |
| `apps/web/lib/ops/ops-live-data.test.ts` | test | batch (file proof) | itself — extend: no hashes, no `emptyBookings`, assign UUID, no expense placeholders | exact — same file |
| `apps/web/wrangler.jsonc` | config | — | itself — `env.staging.name = "vamos"` | exact — do not rename |
| `apps/web/app/[locale]/confirmation/[ref]/ConfirmationClient.tsx` | analog only | poll | visibility-aware 1s poll — copy for board live-update (D-42) | exact analog (do not restyle) |

---

## Pattern Assignments

Grouped the way the planner will slice tasks. Copy the excerpts; do not paraphrase them into a second stack.

### 1. Path-based DC console (kill hashes) — D-10

**Files:** `app/ops/ops.dc.html`, `OpsSidebar.dc.html`, `apps/web/middleware.ts`

**Do:** Same `ops.dc.html` document. `history.pushState` + `popstate`. Middleware serves that HTML for every D-10 path. One-shot: if `location.hash` is present, `replaceState` to the path and clear the hash. Navigation hrefs are **root-absolute** (`/bookings`). Keep injected `<base href="/app/ops/">` for DC assets.

#### Analog — hash router to replace (`app/ops/ops.dc.html`)

```javascript
const FLEET = ['vehicles', 'chauffeurs'];
const CONTENT = ['pages', 'legal'];
const ROUTES = ['dashboard', 'bookings', 'calendar', 'pricing', 'customers', 'support', 'coupons', 'settings', 'staff', 'profile', 'reviews', 'detail'].concat(FLEET).concat(CONTENT);
/* One console, one URL. Every section is a hash route on this page: #bookings,
   #pricing, #reviews, #calendar…, plus #detail/<id> for a single booking. */
function readHash() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const [key, id] = raw.split('/');
  if (!key || ROUTES.indexOf(key) === -1) return { route: 'dashboard', detailId: null };
  return { route: key, detailId: key === 'detail' ? decodeURIComponent(id || '') : null };
}
    if (!location.hash) location.replace('#' + (this.props.start || 'dashboard'));
    this._onHash = () => this.setState(Object.assign({ navOpen: false, menuOpen: false }, readHash()));
    window.addEventListener('hashchange', this._onHash);
  goHash = (e) => {
    const a = e.currentTarget;
    const href = (a && a.getAttribute && a.getAttribute('href')) || '';
    if (href.charAt(0) !== '#') return;
    e.preventDefault();
    this.setState({ menuOpen: false, navOpen: false });
    if (location.hash !== href) location.hash = href;
  };
```

Replace with `readPath(location.pathname)` using the same locale strip as middleware (`localeStrippedPath`). Intercept sidebar clicks only for root-absolute ops paths; `preventDefault` + `pushState` + `setState` — **no full reload** (D-39). Do not restore `vt-ops-hash-switch` (already gone).

Recommended path map (planner may rename; do not leave hashes):

| Today | Path |
|-------|------|
| `#dashboard` | `/dashboard` (optional 308 `/` → `/dashboard`) |
| `#bookings` | `/bookings` |
| new trip | `/bookings/new` |
| `#detail/{ref}` | `/bookings/{ref}` |
| `#calendar` | `/calendar` |
| `#customers` | `/customers` |
| customer editor | `/customers/{email}` |
| `#vehicles` / `#chauffeurs` | `/fleet` / `/fleet/chauffeurs` |
| chauffeur page | `/fleet/chauffeurs/{id}` |
| `#support` | `/support` |
| `#pricing` | `/pricing` |
| `#login` | `/login` |
| `#profile` / `#settings` / `#coupons` / `#reviews` | `/profile` `/settings` `/coupons` `/reviews` |

#### Analog — sidebar hashes (`app/ops/OpsSidebar.dc.html`)

```javascript
const NAV_TOP = [
  { key:'dashboard', href:'#dashboard', icon:'layout-dashboard', en:'Dashboard', de:'Übersicht', fr:'Tableau de bord', ar:'لوحة المعلومات' },
  { key:'bookings', href:'#bookings', icon:'receipt', en:'Bookings', de:'Buchungen', fr:'Réservations', ar:'الحجوزات' },
  { key:'calendar', href:'#calendar', icon:'calendar-days', en:'Calendar', de:'Kalender', fr:'Calendrier', ar:'التقويم' },
];
const FLEET = [
  { key:'vehicles', href:'#vehicles', icon:'car', en:'Vehicles', de:'Fahrzeuge', fr:'Véhicules', ar:'المركبات' },
  { key:'chauffeurs', href:'#chauffeurs', icon:'users', en:'Chauffeurs', de:'Chauffeure', fr:'Chauffeurs', ar:'السائقون' },
];
const NAV_BOTTOM = [
  { key:'customers', href:'#customers', icon:'user', en:'Customers', de:'Kunden', fr:'Clients', ar:'العملاء' },
  { key:'support', href:'#support', icon:'mail', en:'Support', de:'Support', fr:'Assistance', ar:'الدعم' },
  { key:'coupons', href:'#coupons', icon:'ticket', en:'Coupons', de:'Gutscheine', fr:'Codes promo', ar:'القسائم' },
];
```

Labels/icons stay. `href` becomes the D-10 path. Collapse `#vehicles`/`#chauffeurs` under `/fleet` as CONTEXT shows. Support stays `/support`, not Staff. After deleting a `NAV_ADMIN` item, do not keep positional `NAV_ADMIN[1]`.

Board/calendar/customers currently navigate by hash — same cut:

```javascript
// OpsBoard.dc.html
location.hash = '#detail/' + encodeURIComponent(row.id);
// OpsCalendarBoard.dc.html
location.hash = '#detail/' + encodeURIComponent(id);
// OpsCustomers.dc.html
open: () => { location.hash = '#detail/' + encodeURIComponent(b.id); },
// OpsFleet.dc.html
{ label: t.vehicles, active: !isChauffeurs, go: () => { location.hash = '#vehicles'; } },
```

#### Analog — `serveOpsDc` keep; 307-to-`/` kill (`apps/web/middleware.ts`)

```typescript
async function serveOpsDc(
  request: NextRequest,
  cookieSource: NextResponse,
  file: "ops.dc.html" | "ops-login.dc.html",
  injectAuth: boolean,
): Promise<NextResponse> {
  const asset = new URL(`/app/ops/${file}`, request.url);
  const res = await fetch(asset);
  let html = await res.text();
  const boot = [
    html.includes('href="/app/ops/"') ? "" : '<base href="/app/ops/">',
    injectAuth ? '<script>try{localStorage.setItem("vamosOpsAuth","1")}catch(e){}</script>' : "",
  ].join("");
  html = html.replace(/<head([^>]*)>/i, `<head$1>${boot}`);
  // ...
}

  if (inConsole) {
    if (path !== "/") {
      return applyStagingNoindex(
        copyCookies(client.response, NextResponse.redirect(dashboardAbs(request, "/"), 307)),
      );
    }
    return serveOpsDc(request, client.response, "ops.dc.html", true);
  }
```

**Do:** Allowlist D-10 paths on the named dashboard host; `serveOpsDc(..., "ops.dc.html")` for each. Keep `/login` → `ops-login.dc.html`. Do **not** 307 `/bookings` → `/`. Matcher already excludes `/api/*`:

```typescript
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
```

`localeStrippedPath` is the locale-strip to reuse for `readPath`:

```typescript
function localeStrippedPath(pathname: string): { localePrefix: string | null; path: string } {
  const match = pathname.match(/^\/(en|de|fr|ar)(?=\/|$)/);
  if (match) {
    const prefix = match[1] ?? null;
    return { localePrefix: prefix, path: pathname.slice(match[0].length) || "/" };
  }
  return { localePrefix: null, path: pathname };
}
```

Do not resurrect React `/ops`. `apps/web/lib/ops/paths.ts` maps internal `/ops` leftovers — public dashboard URLs are `/dashboard` etc. on `dashboard.vamostaxi.site`. Worker staging name stays `vamos` (`apps/web/wrangler.jsonc`).

---

### 2. Staff JSON + client store — no fixtures

**Files:** `app/vamos-ops-data.js`, GET bookings dual mounts, `bookings.ts`, `bookings-map.ts`, `staff-json.ts`

#### Analog — staff envelope (`apps/web/lib/ops/staff-json.ts`)

```typescript
export function jsonOk(data: unknown, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}
export function jsonErr(code: string, status: number): Response {
  return Response.json({ ok: false, code }, { status });
}
export function withStaff(handler: StaffJsonHandler): (request: Request) => Promise<Response> {
  return (request) => staffResponse(request, requireStaffClaims, handler);
}
```

Every new staff route copies this. Reads: `asStaff`. Ledger: DEFINER RPC via `asCheckout` / `asSystem`, not `asStaff INSERT`.

#### Analog — dual mounts (keep)

`apps/web/app/[locale]/(ops)/api/staff/bookings/route.ts`:

```typescript
export const GET = withStaff(async (claims) => {
  const { env } = getCloudflareContext();
  const rows = await loadBookings(env, claims);
  return jsonOk(rows);
});
```

`apps/web/app/api/staff/bookings/route.ts`:

```typescript
export const dynamic = "force-dynamic";
export { GET } from "../../../[locale]/(ops)/api/staff/bookings/route";
```

`apps/web/app/api/staff/bookings/[id]/route.ts`:

```typescript
export const dynamic = "force-dynamic";
export { PATCH, DELETE } from "../../../../[locale]/(ops)/api/staff/bookings/[id]/route";
```

New assign/pay-link/refund actions: same dual-mount. GET stays read-only (`ops-live-data.test.ts` asserts `not.toMatch(/export const POST/)` on the list route — add POST on a **subpath**, not the list).

#### Analog — board SELECT (`apps/web/lib/ops/bookings.ts`)

```typescript
      left join public.chauffeurs ch on ch.id = l.assigned_chauffeur_id
      left join lateral (
        select *
        from public.booking_payments pay
        where pay.booking_id = b.id
        order by pay.created_at desc
        limit 1
      ) p on true
```

Planner must also select `l.assigned_chauffeur_id`, `l.assigned_vehicle_id`, vehicle plate/model, `ch.email`, `ch.languages`, `p.captured_at`, and **sum of captured payments / refunds** — latest payment only is not enough once extras exist (D-29/D-31).

#### Analog — mapper today (`apps/web/lib/ops/bookings-map.ts`)

```typescript
  const klass = classLabel(row.class_slug);
  const chauffeur = str(row.chauffeur_name);
  return {
    // ...
    klass,
    vehicle: klass,          // BUG for D-50 — class slug, not fleet plate/model
    chauffeur,
    driver: chauffeur,
    paid,
    paidByCard,
    totalRappen: Number(row.charged_rappen ?? 0) || 0,
  };
```

Extend the type with `capturedAt`, chauffeur uuid, vehicle uuid, plate/model, chauffeur email. Empty chauffeur/vehicle strings until assigned. Never Isolation names.

#### Analog — store (`app/vamos-ops-data.js`)

Hydrate is already staff JSON. **Do not** add `emptyBookings`. Header already says so:

```javascript
/* In-scope collections hydrate from /api/staff JSON and start empty (D-35).
   404/network stays []. Bookings hydrate GET /api/staff/bookings. */
```

`pickRows` only accepts **arrays** — PATCH `{ ok, data: object }` becomes `[]`:

```javascript
  function pickRows(json, name) {
    if (!json || json.ok === false) return [];
    var data = json.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data[name])) return data[name];
    if (data && Array.isArray(data.rows)) return data.rows;
    return [];
  }
```

`afterWrite` then falls back to the optimistic list. **Do:** if `json.data` is a non-array object, treat it as one row and replace by id.

`save()` is emit-only (Fleet “saved” until reload):

```javascript
      save: function () { emit(name); return list.slice(); },
```

`add` already prefers object `json.data` — `update`/`upsert` must do the same.

Generated ids are the other half of D-53:

```javascript
  function id(prefix) { return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function cleanChauffeur(c) {
    c = c || {};
    return {
      id: str(c.id) || id("c"),
      name: str(c.name), phone: str(c.phone), email: str(c.email),
      vehicle: str(c.vehicle),
```

Never PATCH a non-uuid. `isUuid` on the chauffeur route 400s `c-m5x…`. After POST/PATCH, replace the row with `json.data` (object). `cleanVehicle` has the same `id("v")` trap.

15s poll today — extend, do not throw away:

```javascript
        if (name === "bookings") {
          clearTimeout(pollTimer);
          pollTimer = setTimeout(function () {
            loaded = false;
            hydrate();
          }, 15000);
        }
```

**Do (D-42):** visible interval ~3s, pause when `document.hidden`, `visibilitychange` + `focus` set `loaded=false; hydrate()`. Do **not** enable `supabase_realtime` on ops tables.

Identity wrappers to copy (`apps/web/lib/db/identity.ts`):

```typescript
export const asSystem = <T,>(env: CloudflareEnv, fn: QueryFn<T>) =>
  withIdentity(env, "system", undefined, fn);
export const asCheckout = <T,>(
  env: CloudflareEnv,
  claims: VamosClaims | null,
  fn: QueryFn<T>,
) => withIdentity(env, "checkout", claims, fn);
export const asCustomer = <T,>(
  env: CloudflareEnv,
  claims: VamosClaims,
  fn: QueryFn<T>,
) => withIdentity(env, "customer", claims, fn);
export const asStaff = <T,>(
  env: CloudflareEnv,
  claims: VamosClaims,
  fn: QueryFn<T>,
) => withIdentity(env, "staff", claims, fn);
```

Hyperdrive **direct** only (not `:6543`).

---

### 3. Assign — chauffeur implies vehicle (D-43…D-52)

**Files:** `OpsDetail.dc.html` (UI), NEW `assign.ts` + RPC, `bookings-write.ts` (stop name match), `sqlstate.ts`

#### Anti-pattern to delete — local assign (`OpsDetail.dc.html`)

```javascript
  state = { lang: ..., dialogOpen:false, cancelOpen:false, pickDriver:'', assigned:{}, ... };
function chauffeurNames() {
  // ...
  return ops.chauffeurs.all().map((c) => c.name).filter(Boolean);
}
      confirmAssign: () => {
        const chosen = this.state.pickDriver;
        this.setState((s) => ({ assigned: Object.assign({}, s.assigned, { [booking.id]: chosen }), dialogOpen: false }));
        this.notify(t.driverAssigned + booking.id);
      },
```

Picker options = chauffeur **uuid** + label. Dialog POSTs. No typed names. Unpaid: no assign (D-44). Completed/cancelled/refunded: frozen (D-49). Swap = one step, old chauffeur off (D-48).

Cancel PATCH is the live analog to copy for assign HTTP:

```javascript
        client.request('PATCH', '/api/staff/bookings/' + encodeURIComponent(id), { status: 'cancelled' }).then((json) => {
          if (json && json.ok) {
            if (ops) ops.bookings.reset();
```

Prefer a dedicated `POST /api/staff/bookings/{id}/assign` `{ chauffeurId }` rather than stuffing `chauffeur` into PATCH. Dual-mount like `[id]/route.ts`.

#### Anti-pattern to delete — name match, no vehicle (`bookings-write.ts`)

```typescript
    if (patch.chauffeur !== undefined) {
      const chauffeur = patch.chauffeur.trim() || null;
      await sql`
        update public.booking_legs
        set assigned_chauffeur_id = case
          when ${chauffeur} is null then null
          else (
            select id from public.chauffeurs
            where id::text = ${chauffeur} or full_name = ${chauffeur}
            limit 1
          )
        end
        where booking_id = ${bookingId}::uuid
```

Does **not** set `assigned_vehicle_id`. Overlap on the car is unenforced. Email-less chauffeurs still assign.

#### Analog — GiST EXCLUDE (keep; Postgres owns overlap)

`packages/db/supabase/migrations/20260823000011_booking_legs.sql`:

```sql
  constraint booking_legs_assignable check (
    (assigned_chauffeur_id is null and assigned_vehicle_id is null)
    or (estimated_duration_minutes is not null and estimated_duration_minutes > 0
        and turnaround_buffer_minutes is not null)
  ),
alter table public.booking_legs
  add constraint booking_legs_chauffeur_no_overlap
  exclude using gist (assigned_chauffeur_id with =, scheduled_range with &&)
  where (assigned_chauffeur_id is not null and status not in ('cancelled','no_show'))
  deferrable initially immediate;

alter table public.booking_legs
  add constraint booking_legs_vehicle_no_overlap
  exclude using gist (assigned_vehicle_id with =, scheduled_range with &&)
  where (assigned_vehicle_id is not null and status not in ('cancelled','no_show'))
  deferrable initially immediate;
```

Swap uses `SET CONSTRAINTS booking_legs_chauffeur_no_overlap DEFERRED` inside one transaction (comment in that migration). Unassign sets **both** FKs null.

Assignable CHECK needs duration. Phone Save must go through quote lock, not a text-only insert. Analog:

```typescript
// apps/web/lib/checkout/lock-to-rpc.ts
    estimated_duration_minutes: Math.max(0, Math.round(leg.duration_s / 60)),
```

Empty `tstzrange` is a silent no-op — do not hand-roll JS interval math.

#### Analog — SECURITY DEFINER writer to copy (`apps/web/lib/checkout/create-booking.ts`)

```typescript
  const rows = await sql`
    select * from public.checkout_create_booking(
      ${args.quoteId}::uuid,
      ${args.idempotencyKey},
      ...
    )
  `;
```

`ops_assign_leg(chauffeur_id)` copies this shape: load `chauffeurs.email` + `default_vehicle_id`, refuse nulls (D-52/D-43), set both FKs on the **leg**, snapshot turnaround via existing `tg_leg_snapshot_buffer`, insert `booking_events` (`assignment.chauffeur_set` / `assignment.vehicle_set` / `assignment.cleared` already in `20260823000016_booking_events.sql`). Grant EXECUTE like checkout RPCs — not to `anon`/`authenticated`/Data API. Worker calls through Hyperdrive role that already executes checkout RPCs **or** `asSystem`. Never from the browser JWT.

On `23P01`, SELECT the other leg (`assigned_chauffeur_id`, `scheduled_range &&`, other booking) and return `{ code: "overlap", otherRef, otherLocal }` (D-47). **Add to `sqlstate.ts`** — missing today:

```typescript
export const OPS_SQLSTATE = Object.freeze({
  restrict: "23001",
  unique: "23505",
  check: "23514",
  privilege: "42501",
  noData: "P0002",
} as const);
```

```typescript
// exclusion_violation = 23P01 (booking_legs_chauffeur_no_overlap)
```

Timeline kinds already exist — insert inside the same tx (DATA-08 / OPS-02):

```sql
                   'assignment.chauffeur_set','assignment.vehicle_set','assignment.cleared',
```

Staff cancel/assign/refund currently do **not** write events. Checkout settle does.

Picker lists people whose **vehicle can take this trip’s passengers and bags**. Not on-shift-only (D-46). Fleet row email required (D-52). After assign, customer `/bookings` shows chauffeur name + vehicle from the fleet row — never a fake name (D-50).

---

### 4. Fleet Save must persist `default_vehicle_id` (D-53)

**Files:** `OpsFleet.dc.html`, `vamos-ops-data.js`, `fleet-http.ts`, `chauffeurs-write.ts`, chauffeur PATCH route

HTTP door is already correct. Analog — parse maps `vehicle` → `defaultVehicleId`:

```typescript
// apps/web/lib/ops/fleet-http.ts
export function parseChauffeurBody(body: unknown): { id: string | null; input: ChauffeurInput } {
  // ...
  const id = isUuid(idRaw) ? idRaw : null;
  return {
    id,
    input: {
      fullName: asString(rec.fullName || rec.name),
      email: asString(rec.email) || null,
      defaultVehicleId: asString(rec.defaultVehicleId || rec.vehicle) || null,
```

Present round-trips `vehicle` as the uuid:

```typescript
export function presentChauffeur(row: ChauffeurRow | ChauffeurDetail): Record<string, unknown> {
  return {
    id: row.id,
    fullName: row.fullName,
    name: row.fullName,
    email: row.email ?? "",
    defaultVehicleId: row.defaultVehicleId,
    vehicle: row.defaultVehicleId ?? "",
```

Write already SETs the column (`chauffeurs-write.ts`):

```typescript
      update public.chauffeurs set
        full_name = ${parsed.fullName},
        email = ${parsed.email},
        default_vehicle_id = ${parsed.defaultVehicleId},
```

Column definition (`20260823000005_fleet.sql`):

```sql
  default_vehicle_id uuid references public.vehicles(id) on delete set null,
  languages          text[] not null default '{}',   -- ISO codes, e.g. {en,de,fr}
```

PATCH route returns the object (client must consume it):

```typescript
      await updateChauffeurRow(env, claims, id, input);
      const updated = await loadChauffeur(env, claims, id);
      return jsonOk(updated ? presentChauffeur(updated) : { id });
```

OpsFleet `onSave` today does not wait for `ok`:

```javascript
      onSave: (rec) => {
        if (!store) return;
        store.upsert(rec);
```

**Do:** `upsert` and wait for `ok`; replace row with `json.data`; never PATCH `c-…`. Prove: Save chauffeur+vehicle → reload → `default_vehicle_id` still set.

Chauffeur language for assign mail (D-51): first of `de,fr,ar,en` present in `languages text[]`, else `en`. Do not invent copy.

Vehicle off-road (D-55): allowed. Upcoming assigned trips → Needs attention must-fix + ops email. Not auto-cancel. Dispatcher reassigns chauffeur (vehicle follows) or pairs this chauffeur with a working vehicle.

Chauffeur page (D-54): profile + read-only live trips (same board data). Assign still on trip detail. Tokens from neighbouring ops screens — no marketing look.

---

### 5. Phone booking = Phase 7 checkout path (D-11…D-26)

**Files:** new-trip DC, `POST /api/quote`, `POST /api/checkout/intent`, `POST /api/checkout/pay-link`, Stripe Elements on OpsDetail

Do **not** `asStaff INSERT INTO bookings`. Quote first (D-26). Unpaid row shows on the board (D-13). Same extras/Mapbox/flight/company as the site.

#### Analog — intent route (`apps/web/app/api/checkout/intent/route.ts`)

```typescript
import { asCheckout, asQuote } from "@/lib/db/identity";
import { runCheckoutIntent } from "@/lib/checkout/intent";
import { createBooking } from "@/lib/checkout/create-booking";
import {
  createCheckoutSession,
  expireCheckoutSession,
  retrieveCheckoutSession,
  stripeFromEnv,
  stripePublishableKey,
} from "@/lib/checkout/stripe";
```

#### Analog — Checkout Session (`apps/web/lib/checkout/stripe.ts`)

```typescript
export const CHECKOUT_UI_MODE = "elements" as const;
      mode: "payment",
      ui_mode: CHECKOUT_UI_MODE,
      adaptive_pricing: { enabled: true },
      metadata: {
        booking_id: input.bookingId,
        booking_reference: input.bookingReference,
      },
          price_data: {
            currency: CHARGE_CURRENCY,  // "chf"
            unit_amount: input.chargedRappen,
```

Do not pass legacy `ui_mode: "custom"`. Charge always CHF (`CHARGE_CURRENCY = "chf"`). Test keys only. Take card on ops detail = **same Payment Element fields** as public `/checkout/payment` (D-25). Fail/hang-up → leave unpaid; pay-link still works (D-16). Never “mark paid outside Stripe”.

#### Analog — pay-link (`apps/web/app/api/checkout/pay-link/route.ts`)

```typescript
  const sent = await sendPayLink(
    { RESEND_API_KEY: env.RESEND_API_KEY ?? "" },
    payLinkEmailFromLock({ ... }),
    to,
  );
```

Email goes out when dispatcher clicks Send (D-14), not auto-on-save. Resend = **same unpaid session**, new email (D-22) unless amount changed. Public pay URL is `/checkout/pay/{token}` (`payLinkPath` in `lib/checkout/pay-link.ts`). Recipients = contact + company payer if different (`confirmationRecipients`).

#### Analog — webhook confirm (`apps/web/app/api/stripe/webhook/route.ts`)

```typescript
          select public.stripe_event_record(
            ${event.id},
            ${event.type},
            ${new Date(event.created * 1000).toISOString()}::timestamptz,
            ${objectId},
            ${JSON.stringify(event.data.object)}::jsonb
          ) as inserted
    enqueue: (message) => env.STRIPE_EVENTS.send(message).then(() => undefined),
```

Settle (`apps/web/lib/checkout/settle.ts`):

```typescript
          select * from public.checkout_payment_settle(
            ${input.eventId},
            ${input.sessionId},
            ${input.paymentIntentId},
            ${input.outcome},
            ...
          )
```

Pay → booking confirmed automatically (D-03). Dispatcher still assigns by hand.

Unpaid edit in ops is forbidden (D-70): cancel + new trip. Current `updateBooking` allows field PATCH on any status — refuse unpaid PATCH except cancel / send-pay-link / take-card.

---

### 6. Extra fare = new snapshot + new session (D-67 / D-73)

**Why:** `tg_payment_matches_snapshot` rejects `charged_rappen <> snapshot.total_rappen`.

`packages/db/supabase/migrations/20260823000014_payments_refunds.sql`:

```sql
  if new.charged_rappen is distinct from s.total_rappen then
    raise exception 'charge % does not match snapshot % total %',
      new.charged_rappen, s.id, s.total_rappen using errcode = 'restrict_violation';
  end if;
```

**Do:** Insert a chargeable `price_snapshots` row whose `total_rappen` is the **difference**. New Checkout Session `unit_amount = differenceRappen`, metadata `{ booking_id, kind: "extra", extra_id }`. Webhook settles the extra **payment row only** — do not run pending→paid→confirmed on an already-confirmed booking. Apply pending trip edits in that same extra-settle transaction. Trip columns unchanged until extra captured (D-67). Second edit merges into **one** extra payment (D-73): expire old extra session if amount changed (unlike D-22 original unpaid session).

Paid-edit request storage: new `booking_edit_requests` (id, booking_id, actor, payload, quote snapshot id, status requested/accepted/superseded, extra_payment_id). Customer paid edit = request; ops must accept (D-72). Same-price edit: no extra pay, still wait for ops accept (D-74). Edit that breaks assigned chauffeur → must-fix, not auto-cancel (D-75).

---

### 7. Refund = Stripe first (D-56…D-60)

#### Analog — helper already unused (`apps/web/lib/checkout/stripe.ts`)

```typescript
export async function createRefund(
  stripe: Stripe,
  input: {
    paymentIntentId: string;
    amountRappen: number;
    idempotencyKey: string;
  },
): Promise<Stripe.Refund> {
  return stripe.refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountRappen,
      reason: "requested_by_customer",
    },
    { idempotencyKey: input.idempotencyKey },
  );
}
```

Full refund: `amountRappen = sum of captured charged_rappen`. Idempotency key `refund:{bookingId}:{paymentId}`. Persist `booking_refunds.stripe_refund_id`. On Stripe error: stay paid, return `{ ok:false, code }`. Never mark refunded without Stripe.

#### Anti-pattern — status PATCH then email (`[id]/route.ts`)

```typescript
  if (status === "cancelled") {
    const row = await cancelBooking(env, claims, id);
    if (!row) return jsonErr("not-found", 404);
    if (row.paid) await refundMail(env, "pending", row);
    return jsonOk({ id, status: "cancelled" });
  }
  if (status === "refunded") {
    const row = await markRefunded(env, claims, id);
    if (!row) return jsonErr("not-found", 404);
    await refundMail(env, "issued", row);
    return jsonOk({ id, status: "refunded" });
  }
```

`markRefunded` is an UPDATE status gated on `cancelled|refunded` — no Stripe. OpsDetail `markRefund` sends `{ status: 'refunded' }`. Violates D-56.

Cancel and Refund are two actions (D-57). Cancel unpaid = drop, no Stripe (D-59). Cancel paid = status cancelled only. Customer >24h before pickup → auto full refund; inside 24h → tell customer we emailed ops (D-58). Implement the **rule** if manage-booking cancel already exists; do not build a Phase 9 shell.

Refund email: contact + company payer if different (D-60). Reuse `sendRefund` (`packages/emails/src/lib/send.ts`).

---

### 8. Dashboard money — captured_at, live zeros (D-27…D-38)

**File:** `app/ops/OpsDash.dc.html`

Today money filters **pickup** `dateIso` and paints placeholder expense rows:

```javascript
const INCOME = ['Transfers', 'Airport pickups', 'Extras and waiting time', 'Corporate accounts'];
const EXPENSES = ['Chauffeur pay', 'Fuel and tolls', 'Vehicle leasing', 'Insurance', 'Card and platform fees'];
function inPeriod(iso, period, today) { /* iso === today / last 7 / last 30 */ }
    const periodBookings = bookings.filter((b) => inPeriod(b.dateIso, p.key, today));
    const paid = periodBookings.filter((b) => b.paid);
    const incomeRappen = paid.reduce((n, b) => n + (Number(b.totalRappen) || 0), 0);
      expenses: EXPENSES.map((label) => ({ label, amount: expenseMoney })),
        { icon:'banknote', title:'Refunds to issue', note:'Cancelled inside the free window', count:'0', href:'#bookings' },
      counts: [
        { label:'Bookings', value:String(periodBookings.length), ..., href:'#bookings', ... },
```

**Do:**
- Period control stays Today / 7 days / 30 days, Zurich (already `zurichToday`).
- Money + “where the money goes” filter by **payment captured date**.
- Operation / Needs attention / Fleet filter by **pickup date**.
- Income = gross capture. Unpaid pending is not income (D-28).
- Average fare divides by the same captured set (D-33).
- No captured fares → `CHF 000` / `0`, not TBC, not `VT-48xx` (D-34). `fareLabel` already falls back to `CHF 000`.
- Expenses tile = real zero, **no child rows** (D-37). Cost sheet is not this phase.
- Money-out = real action kinds only: Refund, Stripe fee (D-38). If Stripe returns no fee, **no line** — do not guess CHF (D-31). Net = Income − Stripe fees − Refunds. Do not subtract the fee from Income.
- Money-in breakdown = vehicle class from captured fares (D-35).
- Needs attention = unassigned **paid** + unpaid/pending — not Support tickets (D-30).
- Tile click → `/bookings` or `/calendar` already filtered (D-36). Kill `#bookings` hrefs.
- Fleet today = on-shift chauffeurs + in-service vehicles; empty fleet = real zeros (D-32). Already counted from `ops.chauffeurs` / `ops.vehicles`.
- Extra capture and difference refund are their own money lines (D-69). Income stays the original capture.

Subscribe pattern already correct — keep:

```javascript
    this._off = window.VamosOps.bookings.onChange(() => this.forceUpdate());
```

Ops money is always CHF — no FX switcher (D-07).

---

### 9. Live in-place updates (D-39…D-42)

Do **not** add `supabase.channel('bookings')`. Staff RLS:

```sql
-- packages/db/supabase/migrations/20260823000023_rls_staff.sql
-- No ops table ever joins the supabase_realtime publication
```

Analog — confirmation wait room (`ConfirmationClient.tsx`):

```typescript
export const POLL_INTERVAL_MS = 1000;
      const hidden = typeof document !== "undefined" && document.hidden;
      if (!hidden) {
          const res = await fetch(`/api/checkout/status/${encodeURIComponent(reference)}`, {
            cache: "no-store",
            credentials: "include",
          });
      timeoutId = window.setTimeout(tick, POLL_INTERVAL_MS);
```

Copy visibility-pause + focus refetch onto `restCollection('bookings')` and public `GET /api/account/bookings`. Silent. No sound. Two laptops = two pollers. Detail stays on the trip (do not kick back to the list). Home/marketing does not live-update. No live GPS.

`OpsDash` / `OpsBoard` / `OpsDetail` / `OpsCalendarBoard` already `onChange` → `forceUpdate`. Keep that.

---

### 10. Account `/bookings` — contact_email (D-05 / D-50)

#### Analog — RLS already the rule

`packages/db/supabase/migrations/20260910000001_bookings_select_by_contact_email.sql`:

```sql
create policy bookings_select_own on public.bookings
  for select to authenticated
  using (
    (select app.uid()) is not null
    and (
      customer_id in (
        select c.id from public.customers c where c.user_id = (select app.uid())
      )
      or (
        contact_email is not null
        and length(btrim(contact_email::text)) > 0
        and lower(contact_email::text)
          = lower(nullif((select app.jwt() ->> 'email'), ''))
      )
    )
  );
```

No claim-guest dialog (D-05). Empty list is correct when emails differ.

#### Analog — route (`apps/web/app/api/account/bookings/route.ts`)

```typescript
      where b.status::text not in ('quote', 'pending')
```

Paid list filter is correct for D-05. Missing chauffeur/vehicle join. Mapper:

```typescript
  const vehicle = classLabel(row.class_slug);
    href: ref ? `/confirmation/${ref}` : "/account",
    vehicle,
```

**Do:** join assigned chauffeur + vehicle; empty string until assigned. Do not use Isolation names.

#### Analog — public DC fetch (`app/pages/bookings.dc.html`)

```javascript
    fetch('/api/account/bookings', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { bookings: [] }))
      .then((data) => {
        const rows = Array.isArray(data.bookings) ? data.bookings : [];
        this.setState({ rows, view: rows.length ? 'populated' : 'empty' });
      })
      .catch(() => this.setState({ rows: [], view: 'empty' }));
```

Keep catch → `[]`. Preview fixture `{ id: 'VT-4821', ... status: 'assigned' }` must not leak into runtime `rows` when fetch fails.

Add the same visibility refetch as ops (D-41).

---

### 11. `/customers` — every booking email (D-61…D-65)

List already unions checkout emails (`customers.ts` `group by lower(b.contact_email::text)` — asserted in `ops-live-data.test.ts`). Empty list if none — never Isolation Customer*.

Write-through already exists — keep for D-65:

```typescript
export async function upsertCustomer(...) {
    await sql`
      update public.bookings
      set
        customer_id = ${customerId},
        contact_name = ${input.fullName},
        contact_email = ${input.email},
        contact_phone = ${input.phone},
      where erased_at is null
        and (
          customer_id = ${customerId}
          or id = ${id}
          or (${previousEmail} <> '' and lower(contact_email::text) = ${previousEmail})
          or lower(contact_email::text) = ${input.email}
        )
    `;
```

Path `/customers/{email}` should PATCH by list id (customer uuid **or** booking-sourced uuid). Same email, two names → one row, latest name (D-64). OpsCustomers `onSave` already `ops.customers.update`. History rows open trip detail — switch hash to `/bookings/{ref}`.

---

### 12. Emails — reuse senders; add chauffeur + must-fix

**Reuse** (`packages/emails/src/lib/send.ts` + `packages/emails/src/index.ts`):

```typescript
export async function sendConfirmation(env: EmailEnv, booking: BookingForEmail): Promise<SendOutcome>
export async function sendPayLink(env: EmailEnv, link: PayLinkForEmail, to: string[]): Promise<SendOutcome>
export async function sendRefund(env: EmailEnv, input: { locale: EmailLocale; kind: RefundKind; to: string; name: string; reference: string }): Promise<SendOutcome>
const FROM = "Vamos Taxi <noreply@vamostaxi.site>";
```

Pay-link language = dispatcher pick EN/DE/FR/AR on the booking (D-18). Confirmation same.

**New templates** (missing today): chauffeur assign **and** unassign (D-51), ops must-fix (vehicle off-road / overlapping edit). Copy `PayLinkEmail` envelope (`FROM`, locale, `SendOutcome`). Gmail is a copy. Tickets stay Postgres (`/support`). No driver app. No WhatsApp-to-chauffeur.

---

### 13. Tests — extend `ops-live-data.test.ts`

Existing close-bar file proofs (`apps/web/lib/ops/ops-live-data.test.ts`):

```typescript
    expect(data).toMatch(/bookings:\s*restCollection\(['"]bookings['"]/);
    expect(data).not.toMatch(/function emptyBookings/);
    expect(list).not.toMatch(/export const POST/);
    expect(pub).toMatch(/export \{ GET \}/);
    expect(board).toMatch(/fareLabel\(r\.totalRappen\)/);
    expect(board).not.toMatch(/render: \(\) => 'CHF 000'/);
    expect(dash).toMatch(/incomeMoney/);
```

**Add:**
- no `href="#dashboard"` / `location.hash = '#detail/` after the cut
- no `EXPENSES = ['Chauffeur pay'`
- assign POST uses chauffeur uuid, not `full_name`
- `pickRows` accepts object `json.data`
- `cleanChauffeur` does not mint `c-` ids when `id` missing (fail instead)
- no Isolation Customer* / `VT-48xx` in runtime board paths
- `OPS_SQLSTATE` includes `23P01`
- `createRefund` called before status `refunded`

No Hyperdrive in unit tests. Do not import `app/api/**/route.ts` in vitest (alias break). File-proof + mapper unit tests only.

---

## Shared Patterns (copy these)

1. **DC pixel-faithful.** `--vt-*` tokens. Lucide via `Icon`. Four languages same pass. No glow. No shadcn. New trip / chauffeur page copy neighbouring ops chrome — no marketing look.
2. **`withStaff` + `jsonOk({ ok, data })` for reads.** Dual-mount locale twin + `app/api/staff/...`.
3. **Ledger = SECURITY DEFINER RPC** (`checkout_create_booking` / `checkout_payment_settle` / `stripe_event_record`). `asCheckout` / `asSystem`. Never browser service-role. Never `asStaff INSERT` on `booking_payments`.
4. **Stripe test, CHF, `ui_mode: "elements"`.** Reuse `createCheckoutSession` / `createRefund` / `sessionIsPayable`. Extra fare = new snapshot.
5. **Overlap = GiST EXCLUDE.** Catch `23P01`. Name the other trip. No force-assign.
6. **Empty is empty.** No `emptyBookings`. No Isolation names. `CHF 000` is a real zero or “no capture yet”.
7. **Live = poll + visibility.** Confirmation 1s poll is the analog. Realtime publication is off ops tables.
8. **Worker `vamos` only.** Direct Postgres URL. Admin `koussayzayeni@gmail.com`. Support is `/support`.

---

## Anti-Patterns (fail the phase)

- React `/ops` resurrection (2026-08-25 context).
- Hash URLs as “fine for now”; middleware 307-to-`/` left in place.
- Assign by `full_name` string / local `assigned: { [id]: name }`.
- `save()` emit-only + `pickRows` dropping object PATCH bodies.
- `PATCH status=refunded` then email.
- Cancel paid → refund-pending email (D-57).
- Dashboard `EXPENSES = ['Chauffeur pay', ...]`.
- Income filtered by pickup `dateIso`.
- `emptyBookings` / `VT-48xx` / Isolation Customer* fallbacks.
- Enabling `supabase_realtime` on ops tables.
- Guessing Stripe fee CHF.
- Staff POST that INSERTs `booking_payments`.
- Worker `vamos-web-staging`.
- Invented CHF / legal copy / photography.
- Driver app / live GPS / auto-dispatch / cost sheet.

---

## No Analog Found

None that the planner must invent from scratch. New SQL (`ops_assign_leg`, `ops_refund_record`, extra-settle, `booking_edit_requests`) copies checkout DEFINER + existing GiST / `booking_refunds` / `booking_events`. New emails copy `sendPayLink`. New paths copy `serveOpsDc`. If a token is missing on new-trip / chauffeur page, fail honestly — do not add a one-off pixel.

---

## Metadata

**Analog search scope:** `app/ops/*.dc.html`, `app/vamos-ops-data.js`, `app/pages/bookings.dc.html`, `apps/web/middleware.ts`, `apps/web/lib/ops/**`, `apps/web/lib/checkout/**`, `apps/web/lib/account/bookings.ts`, `apps/web/lib/db/identity.ts`, `apps/web/app/api/staff/bookings/**`, `apps/web/app/[locale]/(ops)/api/staff/bookings/**`, `apps/web/app/api/account/bookings/route.ts`, `apps/web/app/api/checkout/**`, `apps/web/app/api/stripe/webhook/route.ts`, `packages/db/supabase/migrations/202608230000{05,11,14,16,23}*.sql`, `packages/db/supabase/migrations/2026082700000{3,4}_*.sql`, `packages/db/supabase/migrations/20260910000001_bookings_select_by_contact_email.sql`, `packages/emails/src/**`, `apps/web/wrangler.jsonc`.

**Pattern extraction date:** 2026-09-10

**Out of scope:** cost sheet, driver app, live GPS, auto-dispatch, React `/ops`, Phase 7 UAT rewrite, Phase 11 live Stripe/DNS.

---

## PATTERN MAPPING COMPLETE
