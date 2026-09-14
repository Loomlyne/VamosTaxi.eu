# Phase 18: OPS Pricing source of truth - Pattern Map

**Mapped:** 2026-09-13
**Files analyzed:** 38 (modify-in-place DC/kernel/staff APIs + one additive migration + tests)
**Analogs found:** 35 / 38 — every write has a same-repo analog except SCA extra-wait, invented mail copy, and React `/ops`.

## Binding caveats (do not reopen)

- **DC ops is the product.** Analog for Pricing is `app/ops/OpsPricing.dc.html` + `app/vamos-ops-data.js`. **No React `/ops` analog.** Dual-DC: Worker serves `apps/web/public/app/ops/` byte-equal to `app/ops/`.
- **Dual-mount staff APIs:** locale route is the implementation; `apps/web/app/api/staff/*` re-exports. Dashboard origin has no locale prefix.
- **`asStaff` / `asQuote`** from `apps/web/lib/db/identity.ts` — both on `HYPERDRIVE_NOCACHE`. Quote never uses cached Hyperdrive.
- **Integer kernel** `apps/web/lib/pricing/*`. Keep `round.ts`. Do not add npm packages.
- **Worker name `vamos`.** No `vamostaxi.eu`. No `sk_live_`. Never invent CHF. Agent does not `supabase db push`.
- **D-40:** first public CHF is owner Publish on the **live page now**. Do not set `public_chf` from a deploy. Hosted live `rate_versions` id 5 is **not** the flip.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `app/ops/OpsPricing.dc.html` | component | request-response | **this file** (rebuild layout; keep `OpsTable` / header Publish / rail VAT) + `OpsTable.dc.html` Dialog | exact — same file, new layout |
| `apps/web/public/app/ops/OpsPricing.dc.html` | component | file-I/O | **this file** — byte-equal to `app/ops/` (`ops-pricing-vat-field.test.ts`) | exact — dual-DC |
| `app/ops/OpsSidebar.dc.html` | component | transform | **this file** `NAV_BOTTOM` coupons row — **drop** | exact — same file |
| `app/ops/OpsCoupons.dc.html` | component | CRUD | **this file** `OpsTable` coupon fields — fold into Pricing Coupons tab; stop serving as a page | exact — fold |
| `app/ops/ops.dc.html` | route | event-driven | **this file** `HASH_TO_PATH.coupons` + `path === '/coupons'` — **drop** | exact — same file |
| `app/vamos-ops-data.js` | service | request-response | **this file** `rateBookCollection` + `restCollection("coupons")` | exact — same file |
| `apps/web/lib/pricing/lines.ts` | utility | transform | **this file** `buildFareLine` — replace 20 km / min-fare branches with D-11 | exact — rewrite recipe |
| `apps/web/lib/pricing/bands.ts` | utility | transform | **this file** — drop `DISTANCE_FLOOR_KM`; per-class bands **on top of** all-km per-km | exact — rewrite |
| `apps/web/lib/pricing/types.ts` | model | transform | **this file** `VehicleClassSlug` union + `DistanceBandRow` (no class id; bounds comment is **wrong** vs D-14) | exact — open types |
| `apps/web/lib/pricing/round.ts` | utility | transform | **this file** `roundHalfUp` / `perKm` | exact — **KEEP** |
| `apps/web/lib/ops/rate-book.ts` | service | CRUD | **this file** `forkLiveRateVersion` | exact — extend clone |
| `apps/web/lib/ops/pricing.ts` | service | CRUD | **this file** `loadCompleteness` | exact — drop `min_fare` |
| `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` | route | CRUD | **this file** `withStaff` GET / `withAdmin` PUT/DELETE + `kind` | exact — add kinds, drop EUR keys |
| `apps/web/app/api/staff/rate-book/route.ts` | route | request-response | **this file** re-export | exact — dual-mount |
| `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts` | route | request-response | **this file** completeness 409 + `asStaff` tx `live` + `public_chf` | exact — extend tx |
| `apps/web/app/api/staff/rate-versions/[id]/publish/route.ts` | route | request-response | **this file** re-export | exact — dual-mount |
| `apps/web/app/[locale]/(ops)/api/staff/settings/route.ts` | route | CRUD | **this file** PATCH `vat_rate_bps` **now** — stop instant VAT | exact — same file |
| `apps/web/app/api/staff/settings/route.ts` | route | request-response | **this file** re-export | exact — dual-mount |
| `apps/web/app/[locale]/(ops)/api/staff/coupons/route.ts` | route | CRUD | **this file** GET/POST + `apps/web/lib/ops/coupons.ts` | exact — version with draft |
| `apps/web/app/api/staff/coupons/route.ts` | route | request-response | **this file** re-export | exact — dual-mount |
| `apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts` | route | CRUD | **this file** GET+PATCH capacities only. POST analog: `chauffeurs/route.ts` | role-match (POST) / exact (GET/PATCH) |
| `apps/web/app/api/staff/vehicle-classes/route.ts` | route | request-response | **this file** `export { GET, PATCH }` — add POST when locale adds it | exact — dual-mount |
| `apps/web/lib/db/quote.ts` | service | CRUD | **this file** `asQuote` + `quote_rate_book` + `loadLaunchFlags` | exact — **KEEP nocache** |
| `apps/web/lib/db/identity.ts` | service | request-response | **this file** `asStaff` / `asQuote` | exact — **KEEP** |
| `apps/web/lib/checkout/vat.ts` | utility | transform | **this file** `CH_VAT_RATE_BPS = 81` | exact — **KEEP fallback** |
| `apps/web/lib/checkout/extras-catalog.ts` | utility | transform | **this file** `catalogFromSurcharges` + `isPassengerExtra` | exact — extras from surcharge rows |
| `apps/web/app/api/checkout/extras/route.ts` | route | request-response | **this file** `preferDraft: false` | exact — stay live-only |
| `apps/web/lib/quote/engine.ts` | service | request-response | **this file** `preferDraft` + `pricing_live && public_chf` | exact — public never draft |
| `apps/web/lib/pricing/priceQuote.ts` | service | transform | **this file** — still the only recipe; preview must call it with draft book | exact — reuse |
| `apps/web/lib/ops/staff-json.ts` | middleware | request-response | **this file** `withStaff` / `withAdmin` / `jsonOk` / `jsonErr` | exact — **KEEP** |
| `apps/web/lib/ops/coupons.ts` | service | CRUD | **this file** `couponInputFromDc` / `insertCoupon` | exact — attach `rate_version_id` |
| `apps/web/lib/pricing/policy.ts` | utility | transform | **this file** `buildCouponLine` (coupon before VAT; floor at total) | exact — reuse |
| `packages/db/supabase/migrations/<ts>_ops_pricing_source.sql` | migration | CRUD | `20260913000001_launch_public_chf_vat.sql` (additive + `quote_rate_book`) + `20260823000008_rate_versions.sql` `tg_rate_version_transition` | role-match |
| `apps/web/lib/pricing/lines.test.ts` | test | transform | **this file** `buildFareLine` fixtures | exact — rewrite D-11 cases |
| `apps/web/lib/pricing/bands.test.ts` | test | transform | **this file** version-global floor fixtures | exact — rewrite per-class / no floor |
| `apps/web/lib/pricing/public-chf.test.ts` | test | transform | **this file** `derivePricingLive && public_chf` | exact — keep AND |
| `apps/web/lib/ops/pricing.test.ts` | test | CRUD | **this file** completeness still asserts `min_fare` | exact — drop min_fare |
| `apps/web/lib/ops/ops-pricing-vat-field.test.ts` | test | file-I/O | **this file** dual-copy `readFileSync` | exact analog for ops source-read |

---

## Pattern Assignments

Grouped the way the planner will slice tasks. Copy the excerpts; do not paraphrase them into a second stack.

### 1. Rebuild Pricing DC layout (D-27…D-32)

**Files:** `app/ops/OpsPricing.dc.html` (+ dual-DC public copy)

**Do:** New layout from `18-UI-SPEC.md`. Keep product nouns unless CONTEXT overrides. Keep `OpsTable` overlays, header Publish, rail VAT field, `T` en/de/fr/ar same sitting, Arabic RTL, `--vt-*` only. Drop charcoal placeholder note, first-X-km / min-fare field, EUR/USD columns, currency chips. Five left tabs. Discard draft + Publish fare book in **header**. Preview in rail under VAT. Publish confirm is a **Dialog on this page**.

**Analog — current chrome to keep (tokens + OpsTable + header Publish + rail VAT), not the layout spec** (`app/ops/OpsPricing.dc.html` lines 21–78):

```html
<header style="display:flex;flex-wrap:wrap;align-items:center;gap:14px 22px;padding:18px 32px;background:var(--vt-bg-surface);border-bottom:1px solid var(--vt-border-subtle)">
  <h1 …>{{ tTitle }}</h1>
  <sc-if value="{{ showPublish }}">
    <x-import …Button… onClick="{{ publish }}" disabled="{{ publishDisabled }}">{{ tPublish }}</x-import>
  </sc-if>
</header>
<!-- rail VAT -->
<x-import …Input… label="{{ tVatLabel }}" value="{{ vatPercent }}" onChange="{{ setVatPercent }}" suffix="{{ tVatSuffix }}">
<!-- panes: OpsTable for routes / distance+bands+regions / surcharges -->
<dc-import name="OpsTable" rows="{{ routes }}" … onSave="{{ saveRoute }}" onDelete="{{ deleteRoute }}" …>
```

**Anti-pattern — charcoal note + three panes + minFare field** (lines 49–52, 101–105, 115–117, 124, 608):

```javascript
const PANES = [
  { key:'routes', icon:'navigation' },
  { key:'distance', icon:'arrow-left-right' },
  { key:'surcharges', icon:'banknote' },
];
alertTitle:'Every figure here is a placeholder',
minFare:'Minimum fare',
{ key:'minFare', label:t.minFare, half:true, placeholder:'000', icon:'banknote', suffix:cur },
```

Replace PANES with UI-SPEC tabs: Fixed routes · Distance rules · Surcharges & extras · Coupons · History. Delete `minFare` field. Delete alert aside.

**Analog — overlay Save is draft PUT; Publish is POST** (lines 381, 434–438):

```javascript
/* Row saves: VamosOps.routes, … → PUT /api/staff/rate-book */
publish = () => {
  api.request('POST', '/api/staff/rate-versions/' + id + '/publish').then((json) => {
```

Keep those two verbs. Stop `patchVat` (lines 412–432) writing `PATCH /api/staff/settings` on blur — VAT waits for Publish (D-03).

**Analog — admin-only chrome** (line 504):

```javascript
showPublish: role === 'admin',
```

D-07: dispatcher `/pricing` → not found (ops shell already omits Pricing from dispatcher nav via `NAV_ADMIN`). Do not paint a disabled page.

**Analog — Dialog / OpsTable** (`app/ops/OpsTable.dc.html` lines 125, 345):

```html
<x-import component-from-global-scope="VamosTaxiDesignSystem_245af1.Dialog" open="{{ yes }}" size="md" title="{{ editorTitle }}" …>
<x-import …Dialog… size="sm" title="{{ confirmTitle }}" onClose="{{ cancelDelete }}">
```

Publish confirm + Discard confirm + delete-row confirm copy this Dialog, not a new route. Overlay save verbs from UI-SPEC (`Save route` / `Save class` / …). Dismiss = `Keep editing`.

**Dual-DC:** after editing `app/ops/OpsPricing.dc.html`, the public copy must stay byte-equal. Analog test:

```ts
// apps/web/lib/ops/ops-pricing-vat-field.test.ts lines 16–40
const CANONICAL = join(repoRoot, "app/ops/OpsPricing.dc.html");
const PUBLIC_COPY = join(webRoot, "public/app/ops/OpsPricing.dc.html");
expect(readFileSync(PUBLIC_COPY, "utf8")).toBe(readFileSync(CANONICAL, "utf8"));
```

---

### 2. Drop `/coupons` page (D-28, D-34)

**Files:** `OpsSidebar.dc.html`, `ops.dc.html`, `OpsCoupons.dc.html`

**Analog — sidebar row to delete** (`app/ops/OpsSidebar.dc.html` lines 147–155):

```javascript
const NAV_BOTTOM = [
  { key:'customers', href:'/customers', … },
  { key:'support', href:'/support', … },
  { key:'coupons', href:'/coupons', icon:'ticket', en:'Coupons', de:'Gutscheine', fr:'Codes promo', ar:'القسائم' },
];
const NAV_ADMIN = [
  { key:'pricing', href:'/pricing', icon:'banknote', en:'Pricing & routes', … },
];
```

Pricing stays in `NAV_ADMIN`. Coupons item gone. Coupons live as a tab on `/pricing`.

**Analog — shell route to delete** (`app/ops/ops.dc.html` lines 259–312):

```javascript
coupons: '/coupons', reviews: '/reviews', …
if (path === '/coupons') return { route: 'coupons', detailId: null };
```

**Analog — table to fold, not restyle as a page** (`app/ops/OpsCoupons.dc.html` lines 34, 45–54):

```html
<dc-import name="OpsTable" rows="{{ rows }}" … label-key="code" add-label="{{ tAdd }}" …>
```

```javascript
en: { title:'Coupons',
  add:'Add a coupon',
  emptyTitle:'No coupons yet', emptyBody:'Add a code and it is accepted at checkout as soon as you switch it live.',
  kPercent:'Percentage off', kAmount:'Amount off',
```

Reuse percent-or-amount fields inside the Pricing Coupons tab. New empty copy from UI-SPEC (public cannot use until Publish). Do not keep “accepted as soon as you switch it live.”

---

### 3. Client store — rate-book PUT + coupons collection

**File:** `app/vamos-ops-data.js`

**Analog — envelope + rate-book bind** (lines 24–39, 303–332):

```javascript
function api(method, path, body) {
  return client.request(method, path, body);
}
function pickRows(json, name) {
  if (!json || json.ok === false) return [];
  var data = json.data;
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data[name])) return data[name];
  …
}
function rateBookCollection(name, kind, clean) {
  var putPath = "/api/staff/rate-book";
  function upsert(rec) {
    body.kind = kind;
    return api("PUT", putPath, body)
```

Keep `kind` on PUT. Extend kinds: `route` | `distance` | `band` | `region` | `surcharge` | `rule` (and coupon if coupons move onto the book). Failed writes stay `{ ok:false, code }`; overlay stays open (header comment lines 12–14).

**Analog — coupons today are a separate REST collection** (line 690):

```javascript
coupons: restCollection("coupons", cleanCoupon),
```

After D-34, coupons must wait for Publish. Prefer attaching coupon rows to the draft version (same PUT path or version-scoped coupons API) rather than a second live `public.coupons` write.

---

### 4. Integer kernel — replace 20 km / min-fare with D-11 (keep round)

**Files:** `lines.ts`, `bands.ts`, `types.ts`. **Do not rewrite** `round.ts`.

**KEEP — rappen half-up, metres in** (`apps/web/lib/pricing/round.ts` lines 28–61, 96–101):

```ts
export function roundHalfUp(numerator: number, denominator: number): number {
  // … remainder * 2 >= denominator → quotient + 1
}
export function perKm(perKmRappen: number, distanceMetres: number): number {
  return roundHalfUp(perKmRappen * distanceMetres, 1_000);
}
```

12.3 km at 250 rappen/km → `roundHalfUp(250 * 12300, 1000)`. Not Swiss 5-rappen. Not 2-dp km.

**REPLACE — version-global floor** (`apps/web/lib/pricing/bands.ts` lines 1–36):

```ts
export const DISTANCE_FLOOR_KM = 20;
export const DISTANCE_FLOOR_M = DISTANCE_FLOOR_KM * 1000;
export function blendedFareRappen(distanceM, minFareRappen, bands) {
  return minFareRappen + blendedExtraRappen(distanceM, bands);
}
```

D-11/D-14: `start + perKm(per_km, all_metres) + per-class band extras`. Band CHF is **on top of** class per-km. No floor. 1 km same recipe (D-12). Filter bands by `vehicle_class_id`. From inclusive, To exclusive, except open last (today’s `DistanceBandRow` comment says the opposite — flip it).

**REPLACE — fare line branches** (`apps/web/lib/pricing/lines.ts` lines 140–247):

```ts
export function buildFareLine(args: BuildFareLineArgs): Line {
  // 1) live fixed route match (today also reverse A←B — D-17: A→B and B→A are SEPARATE; extra stop switches to distance)
  if (fixed && matched) { … amount_rappen: fixed.price_rappen }
  // 2) if bands.length > 0 → blendedFareRappen(distance_m, minFare, bands)  // DELETE
  // 3) else base + perKm; if amount < minFare → minFare                    // DELETE minFare floor
}
```

New distance recipe: always `base + perKm(per_km, all_m) + class band extras`. Fixed route still wins when Mapbox From/To match (D-17). Extra stop → distance recipe for the new path.

**REPLACE — closed class union + band shape** (`apps/web/lib/pricing/types.ts` lines 17–18, 51–69):

```ts
export type VehicleClassSlug = "economy" | "business" | "first" | "van";
export interface DistanceRateRow {
  min_fare_rappen: number | null;
  …
}
/** One blended km band. from_km exclusive start; to_km inclusive, null = open. */
export interface DistanceBandRow {
  id: number;
  rate_version_id: number;
  from_km: number;
  to_km: number | null;
  per_km_rappen: number;
}
```

Open slug (constrained format). Drop `min_fare_rappen` from the live recipe (column may linger until migration). Add `vehicle_class_id` on bands. Bounds comment must match D-14 (From inclusive / To exclusive).

**Coupon before VAT** — already in kernel (`apps/web/lib/pricing/policy.ts` lines 203–239): percent/amount of `preCouponTotal`, clamped so remainder never goes negative. Payable floor `CHF 0.00` (D-16). Do not invent a second coupon engine.

---

### 5. Draft clone — extend `forkLiveRateVersion` (D-06)

**File:** `apps/web/lib/ops/rate-book.ts`

**Analog — clone live → draft in one `asStaff` tx** (lines 499–564):

```ts
export async function forkLiveRateVersion(env, claims, live): Promise<number> {
  return asStaff(env, claims, async (tx) => {
    // insert rate_versions draft, then copy:
    insert into public.distance_rates (… min_fare_rappen, max_pax, available)
    insert into public.fixed_routes (…)
    insert into public.surcharges (… predicate, quantity_source)
    insert into public.distance_bands (rate_version_id, from_km, to_km, per_km_rappen)
    insert into public.region_premiums (rate_version_id, zone_id, percent)
    return newId;
  });
}
```

**Gap vs D-06:** clone must also copy coupons, VAT, quote-lock hours, service area, class hide flags, per-class bands. Extend this function — do not add a second fork.

`resolveWritableVersionId` already forks when the admin writes a live version (`rate-book/route.ts` lines 225–243). Keep that: overlay Save never mutates live.

---

### 6. Completeness lockstep with DB trigger (D-08)

**Files:** `apps/web/lib/ops/pricing.ts` + `packages/db/supabase/migrations/20260823000008_rate_versions.sql` (replace via new migration; do not edit applied files in place without a follow-on).

**Analog — checklist MUST match trigger** (`pricing.ts` lines 63–80):

```ts
/**
 * Mirrors `tg_rate_version_transition` in
 * `packages/db/supabase/migrations/20260823000008_rate_versions.sql`.
 * Changing one without the other is the known failure mode.
 */
and (r.base_fare_rappen is null or r.per_km_rappen is null or r.min_fare_rappen is null)
```

**Analog — trigger** (`20260823000008_rate_versions.sql` lines 71–74):

```sql
if new.status = 'live' and old.status = 'draft' then
  select count(*) into v_missing from public.distance_rates r
   where r.rate_version_id = new.id and r.available
     and (r.base_fare_rappen is null or r.per_km_rappen is null or r.min_fare_rappen is null);
```

D-08: drop `min_fare`. Require name, start (`base_fare_rappen`), per-km, max pax + empty added rows. Bands/surcharges optional if never added. Change SQL + `loadCompleteness` + `lines.ts` in the **same plan**.

**Analog — test that will go red until updated** (`apps/web/lib/ops/pricing.test.ts` lines 79–100):

```ts
expect(distance).toMatch(
  /base_fare_rappen is null or r\.per_km_rappen is null or r\.min_fare_rappen is null/,
);
```

---

### 7. Staff rate-book route (draft writes)

**File:** `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts`

**Imports + auth + envelope** (lines 7–33, 313–336):

```ts
import { asStaff } from "@/lib/db/identity";
import { jsonErr, jsonOk, withAdmin, withStaff } from "@/lib/ops/staff-json";
export const dynamic = "force-dynamic";
const CLASS_KEYS = ["economy", "business", "first", "van"] as const;

export const GET = withStaff(async (claims, request) => { … return jsonOk(bookPayload(book, zones)); });
export const PUT = withAdmin(async (claims, request) => {
  const kind = recBody.kind;
  if (kind !== "route" && kind !== "distance" && kind !== "surcharge") {
    return jsonErr("invalid", 400);
  }
```

Keep `withStaff` GET / `withAdmin` mutating (D-07). Open `kind`. Open `CLASS_KEYS`. Writes go through `asStaff` tagged SQL (lines 353–378). Errors via `failWrite` → `jsonErr("frozen"|"duplicate"|…)` (lines 246–262). Never `err.message`.

**Anti-pattern — EUR/USD/AED keys** (lines 56–63):

```ts
function moneyFromRappen(rappen: number | null): { CHF: string; EUR: string; USD: string; AED: string } {
  const chf = rappen == null ? "" : String(rappen / 100);
  return { CHF: chf, EUR: "", USD: "", AED: "" };
}
```

D-18: CHF only. Do not emit empty EUR/USD/AED on this page.

**Dual-mount** (`apps/web/app/api/staff/rate-book/route.ts` lines 1–2):

```ts
export const dynamic = "force-dynamic";
export { GET, PUT, DELETE } from "../../../[locale]/(ops)/api/staff/rate-book/route";
```

Keep both mounts when adding band/class/history/rule kinds.

---

### 8. Publish all-or-nothing (D-02, D-03, D-06)

**File:** `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts`

**Analog — completeness 409 then one `asStaff` tx** (lines 10, 38–71):

```ts
import { jsonErr, jsonOk, withAdmin } from "@/lib/ops/staff-json";

export async function POST(request, context) {
  return withAdmin(async (claims) => {
    const gaps = await loadCompleteness(env, claims, id);
    if (gaps.length > 0) return jsonFail("incomplete", 409, gaps);
    await asStaff(env, claims, async (tx) => {
      await tx`update public.rate_versions set status = 'live' where id = ${id}`;
      await tx`update public.settings set public_chf = true where id = 1`;
      return null;
    });
    return jsonOk({ id, status: "live" });
  })(request);
}
```

**Keep:** `withAdmin`, 409 + `gaps[]`, `public_chf = true` in the **same** tx as `status='live'`, SQLSTATE mapping (no `err.message`).

**Extend in the same tx (do not split requests):** apply draft VAT → `settings.vat_rate_bps`; clone new draft via `forkLiveRateVersion`; refuse if quote/checkout/Stripe/ops/new-mail would disagree; write history metadata. First Publish still flips `public_chf`; later Publish keeps it true. No unpublish to `CHF 000` (D-06). Do not set `public_chf` from a migration or deploy (D-40).

**Dual-mount** (`apps/web/app/api/staff/rate-versions/[id]/publish/route.ts`):

```ts
export const dynamic = "force-dynamic";
export { POST } from "../../../../../[locale]/(ops)/api/staff/rate-versions/[id]/publish/route";
```

**Source-read analog** (`apps/web/lib/ops/publish-public-chf.test.ts` lines 32–61): DC still POSTs `/api/staff/rate-versions/' + id + '/publish`; `withAdmin` + `asStaff`; `public_chf = true` in the same tx. Extend that test; do not drop the AND.

---

### 9. Stop instant VAT PATCH (D-03)

**File:** `apps/web/app/[locale]/(ops)/api/staff/settings/route.ts`

**Anti-pattern — VAT writes live now** (lines 42–55, 122–175):

```ts
vat_rate_bps: asVatBps(body.vat_rate_bps ?? body.vatRateBps, current.vat_rate_bps),
await sql`
  update public.settings set
    …
    vat_rate_bps = ${parsed.vat_rate_bps},
    updated_at = now()
  where id = 1
`;
```

Until this phase ships, instant PATCH stays (CONTEXT). After ship: rail VAT is **draft**. Public `vat_rate_bps` changes only in the Publish tx. Settings PATCH may still update phone/email/toggles — strip `vat_rate_bps` from this write (or ignore it). Fallback 81 stays in `vat.ts`.

**KEEP fallback** (`apps/web/lib/checkout/vat.ts` lines 1–26):

```ts
export const CH_VAT_RATE_BPS = 81;
export function vatOnTopRappen(netRappen: number, bps?: number | null): number {
  return Math.round((netRappen * vatBps(bps)) / 1000);
}
```

VAT is percent of fare + extras **after** coupon (D-16). Intent already takes `vat_rate_bps` from `loadLaunchFlags`.

**Dual-mount:** `apps/web/app/api/staff/settings/route.ts` `export { GET, PATCH }`.

---

### 10. Coupons API — wait for Publish

**Files:** `apps/web/app/[locale]/(ops)/api/staff/coupons/route.ts` + `apps/web/lib/ops/coupons.ts`

**Analog — staff envelope** (`coupons/route.ts` lines 16–47):

```ts
import { jsonErr, jsonOk, withStaff } from "@/lib/ops/staff-json";
export const GET = withStaff(async (claims) => {
  const rows = await loadCoupons(env, claims);
  return jsonOk(rows.map(toDcCoupon));
});
export const POST = withStaff(async (claims, request) => {
  const row = await insertCoupon(env, claims, couponInputFromDc(raw));
  return jsonOk(toDcCoupon(row), 201);
});
```

Today this is **not** versioned — a POST is live at checkout. D-34: public cannot use a new coupon until Publish. Prefer `rate_version_id` on coupon rows (or draft sidecar applied in Publish tx). Code case-insensitive, trim (fix `couponInputFromDc` if it still uppercases-only).

**Analog — DC field map** (`coupons.ts` lines 225–255):

```ts
export function couponInputFromDc(raw: unknown): CouponInput {
  const kind: CouponKind = body.kind === "amount" ? "amount" : "percent";
  return { code, kind, percent, amountRappen: null, … };
}
```

Amount-off must become real rappen (today `amountRappen: null` — placeholder era). Dual-mount: `apps/web/app/api/staff/coupons/route.ts` `export { GET, POST }`. Keep `[id]` PATCH/DELETE dual-mount if edits stay REST; otherwise fold into rate-book `kind: "coupon"`.

Mutating coupon writes should be `withAdmin` once they wait for Publish (page is admin-only).

---

### 11. Vehicle classes — add/hide/remove (D-19)

**File:** `apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts`

**Today — GET + PATCH capacities, no POST** (lines 17–36):

```ts
export const GET = withStaff(async (claims) => {
  return jsonOk(rows.map(presentVehicleClass));
});
export const PATCH = withStaff(async (claims, request) => {
  await updateVehicleClassCapacities(env, claims, parsed.id, input);
```

**POST analog — chauffeurs create** (`apps/web/app/[locale]/(ops)/api/staff/chauffeurs/route.ts` lines 19–32):

```ts
export const POST = withStaff(async (claims, request) => {
  const parsed = parseChauffeurBody(await readJsonBody(request));
  const input = assertChauffeurInput(parsed.input);
  const id = await insertChauffeur(env, claims, parsed.id, input);
  return jsonOk(created ? presentChauffeur(created) : { id }, 201);
});
```

Copy that shape for class create on the **draft**. Hide flag = public not selectable / `CHF 000` while ops can still assign. Never delete a class row used by a snapshot. Dual-mount today `export { GET, PATCH }` — add POST to **both** mounts.

---

### 12. Quote path — nocache, never draft on public (D-05, D-20)

**KEEP `asQuote` on nocache** (`apps/web/lib/db/identity.ts` lines 71–79, 118–123, 160–161):

```ts
const result = await withIdentityCore(env.HYPERDRIVE_NOCACHE.connectionString, kind, claims, fn);
export const asStaff = (env, claims, fn) => withIdentity(env, "staff", claims, fn);
export const asQuote = (env, fn) => withIdentity(env, "quote", undefined, fn);
```

**KEEP rate-book RPC** (`apps/web/lib/db/quote.ts` lines 9–11, 70–77, 150–165):

```ts
// Every call goes through asQuote, which is on env.HYPERDRIVE_NOCACHE.
export async function loadRateBook(env, opts: { preferDraft: boolean }, request?) {
  const result = await asQuote(env, async (tx) => {
    const rows = await tx`select public.quote_rate_book(${opts.preferDraft}) as result`;
    return rows[0]?.result ?? null;
  });
}
export async function loadLaunchFlags(env, request?): Promise<LaunchFlags> {
  const preferLive = false;
  // public_chf + vat_rate_bps from quote_rate_book JSON; fail closed
}
```

Preview on `/pricing` is the **only** reader of draft (D-05). Do not set `preferDraft` on public quote / checkout extras / Stripe intent.

**Analog — public AND** (`apps/web/lib/quote/engine.ts` lines 165–219):

```ts
const preferDraft = dashboardHost && env.PRICING_PREVIEW === "true";
pricing_live: rateBookMapper.derivePricingLive(book.rate_version) && flags.public_chf,
```

Public host: `preferDraft` false. `PRICING_PREVIEW` must not set `public_chf`. Pricing-page preview should call `priceQuote` with the **draft book** loaded via staff (`asStaff`), not by flipping the public engine’s `preferDraft`.

---

### 13. Checkout extras from surcharge rows (D-35)

**Files:** `apps/web/app/api/checkout/extras/route.ts`, `apps/web/lib/checkout/extras-catalog.ts`

**Analog — live book only** (`extras/route.ts` lines 1–26):

```ts
loadRateBook(env, { preferDraft: false }),
extras: catalogFromSurcharges(book.surcharges),
vat_rate_bps: flags.vat_rate_bps,
```

**Analog — passenger extras only** (`extras-catalog.ts` lines 158–172 + `surcharge-codes.ts` 22–40):

```ts
export function catalogFromSurcharges(rows): CheckoutExtraJson[] {
  for (const row of rows) {
    if (!row.active) continue;
    if (!isPassengerExtra(row.code)) continue;
    …
  }
}
export const PASSENGER_EXTRA_CODES = ["child_seat", "meet_greet", "extra_stop", …];
```

After Publish, checkout extras = this page’s surcharge rows that are chips. Delete + Publish → extra **disappears** (not a CHF 0 chip). Automatic rules (night/weekend/holiday/waiting) never a chip. Do not redesign checkout layout.

---

### 14. Migration analog (bands per class, completeness, coupons/version)

**Analog — additive + comments + owner apply** (`packages/db/supabase/migrations/20260913000001_launch_public_chf_vat.sql` lines 1–18, 24–40):

```sql
-- Hosted apply is owner-gated. Do not invent CHF.
-- Agent never apply_migration, never supabase db push, never restore onto yaumjzvylngfjhtuffqs.

alter table public.settings
  add column if not exists public_chf boolean not null default false,
  add column if not exists vat_rate_bps integer not null default 81
    check (vat_rate_bps >= 0);

create or replace function public.quote_rate_book(p_prefer_draft boolean default false)
returns jsonb
language plpgsql stable security definer set search_path = ''
```

Copy: header law, `if not exists`, comments citing D-NN, extend `quote_rate_book` rather than granting `SELECT` on `settings`. Do **not** default `public_chf` true. Do **not** add `pricing_live` on `rate_versions`.

New migration must: `distance_bands.vehicle_class_id`; completeness without `min_fare`; coupon/version (or sidecar on `rate_versions`); history metadata (`published_at` / `published_by` already exist on `rate_versions` — `pricing.ts` lines 18–20). Agent does not apply.

---

### 15. Tests — vitest `lib/**/*.test.ts` + DC source-read

Do **not** point `<automated>` at `tests/integration/*.spec.ts` (`passWithNoTests: true` fakes green).

| Requirement | Analog test | What to copy |
|-------------|----------------|--------------|
| D-11 D-12 D-13 D-14 | `lib/pricing/lines.test.ts` (fixtures `cls`/`leg`/`rate`, never a currency mark) + `bands.test.ts` (today 20 km floor examples — **replace**) + `round.test.ts` (**keep**) | Vitest + integer rappen. New fixtures: start + all-km per-km + class bands on top; 1 km same recipe; overlap higher CHF wins |
| D-08 | `lib/ops/pricing.test.ts` `loadCompleteness` | Drop `min_fare` assertion; require name/start/per-km/max pax |
| D-18 public AND | `lib/pricing/public-chf.test.ts` | Keep `derivePricingLive && flags.public_chf`; `formatAmount(null) === "CHF 000"` |
| D-01 D-02 D-03 | `lib/ops/publish-public-chf.test.ts` | Keep `withAdmin` + same-tx `public_chf`; add VAT applied only in publish tx |
| D-28 D-31 DC | `lib/ops/ops-pricing-vat-field.test.ts` | `readFileSync` both DC copies; five tabs; no `/coupons` in sidebar; no charcoal placeholder; no EUR keys; `CHF 000` / `CHF 00.00` |
| Dual-mount | `publish-public-chf.test.ts` re-export grep | Locale path + `app/api/staff/…` re-export |

`bands.test.ts` today (lines 5–15) has **no** `vehicle_class_id` and treats 10 km as class floor only — those cases are the old recipe.

Playwright `tests/integration/ops-dc-pricing.spec.ts` may stay as a fingerprint later; it is **not** the Nyquist `<automated>` command.

---

## Shared Patterns

### Authentication — `withStaff` / `withAdmin`

**Source:** `apps/web/lib/ops/staff-json.ts` lines 23–82
**Apply to:** every `/api/staff/*` this phase touches

```ts
export function jsonOk(data: unknown, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}
export function jsonErr(code: string, status: number, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: false, code, ...(extra ?? {}) }, { status });
}
export function withStaff(handler): (request: Request) => Promise<Response> { … requireStaffClaims … }
export function withAdmin(handler): (request: Request) => Promise<Response> { … requireAdminClaims … }
```

Mutating fare-book / Publish / class-add = `withAdmin` (D-07). CSRF: Origin must be dashboard (`staffOriginAllowed`). MFA paused — do not add redirects.

### Dual-mount staff routes

**Source:** `apps/web/app/api/staff/rate-book/route.ts`, `…/publish/route.ts`, `…/settings/route.ts`, `…/coupons/route.ts`, `…/vehicle-classes/route.ts`
**Apply to:** any new staff route (history, preview, test unpaid, class POST)

```ts
export const dynamic = "force-dynamic";
export { GET, PUT, DELETE } from "../../../[locale]/(ops)/api/staff/rate-book/route";
```

Dashboard `https://dashboard.vamostaxi.site` has no locale prefix. Locale file is the implementation.

### Database — `asStaff` / `asQuote` nocache

**Source:** `apps/web/lib/db/identity.ts` lines 9–12, 79, 118–161
**Apply to:** staff writes and every quote/checkout extras/Stripe amount read

```ts
// Every wrapper runs on the cache-disabled Hyperdrive binding
await withIdentityCore(env.HYPERDRIVE_NOCACHE.connectionString, kind, claims, fn);
```

`fn` returns data, never `tx`. Errors rethrow; branch on `err.code`. Never import `postgres` or `@vamos/db` from a route.

### Rounding — `roundHalfUp` / `perKm`

**Source:** `apps/web/lib/pricing/round.ts`
**Apply to:** every priced line (start, km, bands, region %, extras, coupon, VAT)

Metres in. Integer rappen out. No float CHF. No 5-rappen.

### Ops chrome — `OpsTable` / `Dialog` / `Button` / `Icon`

**Source:** `app/ops/OpsPricing.dc.html`, `app/ops/OpsTable.dc.html`, `app/ops/OpsCoupons.dc.html`
**Apply to:** every editor on `/pricing`

Lucide via `Icon` only. Amounts `CHF 000` / `CHF 00.00`. No glow, no `--vt-shadow-accent`, no tinted yellow. Overlay Save writes draft. Publish is the only flip.

### Dual-DC byte equality

**Source:** `apps/web/lib/ops/ops-pricing-vat-field.test.ts`
**Apply to:** `OpsPricing`, `OpsSidebar`, `ops.dc.html`, and any ops DC this phase edits

Canonical: `app/ops/`. Worker serves `apps/web/public/app/ops/`. `readFileSync` both; they must match.

### Completeness lockstep

**Source:** comment in `apps/web/lib/ops/pricing.ts` lines 63–67 + trigger in `20260823000008_rate_versions.sql`
**Apply to:** Publish gate

Checklist ≠ gate is the known failure. Change TS + SQL together.

---

## No Analog Found

| File / capability | Role | Data Flow | Reason |
|-------------------|------|-----------|--------|
| Extra-wait silent off-session debit (D-38) | service | request-response | **Plan gate.** No silent Stripe capture analog. Until then: extra wait `CHF 0` at pay; ops marks arrival; do not invent legal copy. |
| Price-changed / expired mail English (D-24) | email | request-response | Owner supplies copy later. Wire Resend with TBC / skip-send. Do not invent English. Existing analog for **envelope only**: `packages/emails` `sendPayLink` / `sendConfirmation`. |
| React `/ops/pricing` | component | — | **Rejected.** Ops is DC-only. |
| Preview “Create test unpaid” (D-33) | route | request-response | No dedicated analog. Closest: unpaid booking insert via checkout RPC (`create-booking.ts`) **without** Stripe session and **without** mail. Mark test on ops board. Uses **draft**. Do not invent a second ledger writer. |

Preview recap (start → km → bands → region % → extras → VAT → total) has no existing recap of that order — build it in DC using `priceQuote` on the draft book, not a second engine.

---

## Anti-patterns (do not copy)

| Pattern | Where | Why |
|---------|-------|-----|
| `DISTANCE_FLOOR_KM` + `min_fare` recipe | `bands.ts` / `lines.ts` | Contradicts D-11/D-12 |
| Instant `PATCH` VAT | `OpsPricing.patchVat` + `settings/route.ts` | Contradicts D-03 |
| `CLASS_KEYS` / `VehicleClassSlug` closed union | `rate-book/route.ts`, `types.ts` | Contradicts D-19 |
| `moneyFromRappen` EUR/USD/AED | `rate-book/route.ts` | Contradicts D-18 |
| `/coupons` in `OpsSidebar` / `ops.dc.html` | those files | Contradicts D-28 |
| Completeness requiring `min_fare_rappen` | `pricing.ts` + trigger | Contradicts D-08 |
| Bidirectional fixed-route match as one row | `lines.ts` reverse match | D-17: A→B and B→A are separate |
| `preferDraft` on public quote / extras | `engine.ts` / extras route | D-05: only this page preview reads draft |
| Setting `public_chf` from migration/deploy | — | D-40; live row id 5 is not the flip |
| shadcn / new npm packages / Swiss 5-rappen | — | Forbidden |
| `vitest run tests/integration/*.spec.ts` as green | — | Excluded; `passWithNoTests` |

---

## Metadata

**Analog search scope:** `app/ops/`, `app/vamos-ops-data.js`, `apps/web/lib/pricing/`, `apps/web/lib/ops/`, `apps/web/lib/db/`, `apps/web/lib/checkout/`, `apps/web/lib/quote/`, `apps/web/app/[locale]/(ops)/api/staff/`, `apps/web/app/api/staff/`, `apps/web/app/api/checkout/`, `packages/db/supabase/migrations/`
**Files scanned:** ~45 (listed analogs + dual-mounts + tests)
**Pattern extraction date:** 2026-09-13
**Host:** `vamostaxi.site` / `dashboard.vamostaxi.site`. Worker `vamos`. No `.eu`. No `sk_live_`. Never invent CHF.
