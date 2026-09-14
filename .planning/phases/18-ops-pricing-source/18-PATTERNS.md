# Phase 18: OPS Pricing source of truth - Pattern Map

**Mapped:** 2026-09-14 restart
**Files analyzed:** 62 (18-01…18-07 `<files>` + dual-mount re-exports + dual-DC public copies)
**Analogs found:** 60 / 62

Canonical: `18-CONTEXT.md` Restarted 2026-09-14, D-01…D-35. Supersedes 2026-09-13 D-01…D-40. Do not execute or analog from `archive-2026-09-13/`. The 2026-09-13 `18-PATTERNS.md` is WRONG: it still maps History tab, Preview, test unpaid, region %, five tabs, quote-lock field, and `forkLiveRateVersion` immediately after Publish.

## Binding caveats (do not reopen)

- **CONTEXT D-01…D-35 wins.** Never cite old D-40. First public CHF remains owner Publish on the live page (Phase 11). Do not set `public_chf` from a deploy. Agent does not click Publish. Agent does not `supabase db push`.
- **DC ops is the product.** Analog for Pricing is `app/ops/OpsPricing.dc.html` + `app/vamos-ops-data.js`. **No React `/ops` analog.** Dual-DC: edit `app/` then `node scripts/sync-dc-mock-to-public.mjs`. Worker serves `apps/web/public/app/ops/` byte-equal to `app/ops/`. Do not strip injected `<base href="/app/ops/">`. Home is dual: `app/home/home.dc.html` → `apps/web/public/app/home/home.dc.html`.
- **Dual-mount staff APIs:** locale route under `apps/web/app/[locale]/(ops)/api/staff/*` is the implementation; `apps/web/app/api/staff/*` re-exports. Dashboard origin has no locale prefix.
- **`asStaff` / `asQuote`** from `apps/web/lib/db/identity.ts` — both on `HYPERDRIVE_NOCACHE`. Quote never uses cached Hyperdrive. Public `preferDraft` stays **false** (`engine.ts`, `extras/route.ts`).
- **`withAdmin` on writes** (PUT/DELETE rate-book, POST publish/discard, vehicle-class mutations). D-14: `/pricing` is admin only; one staff account type — do not invent a dispatcher role on this page.
- **Integer kernel KEEP:** `apps/web/lib/pricing/round.ts` `perKm` / `roundHalfUp`. Metres in, rappen out. Owner fixtures 275.20 / 123 are tests, not live fares. Never invent CHF.
- **`quote_rate_book` must not invent classes.** SQL vs Worker filter is a plan choice; owner apply is a numbered gate if SQL changes. Worker `mapRateBook` / `classOnOffer` still filters before SQL apply.
- **Class photos copy chauffeur R2** (`PHOTO_PREFIXES` + `POST /api/photos/upload` + `/photos/<key>`). Discretion prefix: `classes/`.
- **Worker name `vamos`.** No `vamostaxi.eu`. No `sk_live_`. Never restore onto `yaumjzvylngfjhtuffqs`.

### Dead (do not analog as product behavior)

Do **not** copy these as the target product. They exist in the repo today; CHANGE them away.

| Dead pattern | Where it lives today | Why dead |
|--------------|----------------------|----------|
| History tab / Re-Publish / Clone into draft from History | `OpsPricing.dc.html` `PANES` `tabHistory`; clone route | D-11 |
| Preview recap on `/pricing` / Create test unpaid | `runPreview`, `createTestUnpaid`, `draft-preview.ts`, `rate-book/preview`, `test-unpaid` | D-12 |
| `preferDraft: true` on public quote/extras | Must stay false on `vamostaxi.site` | D-03 / public live book |
| Region % table / `buildRegionPremiumLine` as a live recap line | `regionRows` in OpsPricing; `priceQuote.ts` lines 205–211 | D-17 |
| Night / weekend / holiday surcharge types | `SURCHARGE_CODES`, `AUTOMATIC_SURCHARGE_CODES`, OpsPricing `RULE_KINDS` | D-25 |
| Quote-lock hours field | `quoteLockMinutesFromHours` in rate-book PUT; DC rule kind | D-13: lock is hardcoded 24h (1440 minutes) |
| `forkLiveRateVersion` after successful Publish | `publish/route.ts` line 151; `publish-public-chf.test.ts` “D-06” assertion | D-03: page shows LIVE book; next Save starts a draft |
| `forkLiveRateVersion` after Discard | `discard/route.ts` lines 49–51 | D-06: draft gone, page shows live |
| Hardcoded Economy / Business / First / Van public ladder | `VEHICLE_CLASSES`, `CLASS_SLUGS`, `KNOWN_CLASS_SLUGS`, `IntentVehicleClass`, `CLASS_KEYS`, `vamos-ops-data.js` | D-29 / D-31 |
| Dispatcher / second ops role on `/pricing` | Do not add `withStaff` on Publish/Save | D-14 |
| `supabase db push`, `sk_live_`, `vamostaxi.eu`, inventing CHF | Must-not | CONTEXT Must-not |

### KEEP as analogs

dual-DC sync · `asStaff`/`asQuote` nocache · `withAdmin` on writes · integer kernel `round.ts` · R2 chauffeur photo prefix (class photos copy that) · overlay Save → draft APIs · Publish POST (`withAdmin` + completeness 409 + `asStaff` tx + `public_chf` + INSERT `settings_versions`) · `quote_rate_book` (must not invent classes) · `resolveWritableVersionId` / `forkLiveRateVersion` **for first Save after Publish only**.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/web/lib/pricing/public-live-book-board.test.ts` | test | file-I/O | `apps/web/lib/ops/ops-pricing-vat-field.test.ts` `readFileSync` | role-match |
| `apps/web/lib/pricing/d15-recipe.test.ts` | test | transform | `apps/web/lib/pricing/lines.test.ts` + `round.ts` `perKm` | role-match |
| `apps/web/lib/ops/ops-pricing-tabs.test.ts` | test | file-I/O | `ops-pricing-vat-field.test.ts` dual-copy equality | exact analog |
| `apps/web/lib/pricing/eligibility.ts` | utility | transform | **this file** `classOnOffer` / hide vs delete / pax | exact — KEEP kernel, kill catalogs around it |
| `apps/web/lib/pricing/eligibility.test.ts` | test | transform | **this file** hide + pax cases | exact — extend D-32/D-33 |
| `apps/web/lib/pricing/rateBook.ts` | service | transform | **this file** `mapRateBook` / `mapClass` | exact — do not invent classes |
| `apps/web/lib/pricing/priceQuote.ts` | service | transform | **this file** `buildFareLine` per class | exact — **CHANGE:** drop `buildRegionPremiumLine` |
| `apps/web/lib/quote/engine.ts` | service | request-response | **this file** `preferDraft` + `public_chf` AND | exact — public `preferDraft` stays false |
| `apps/web/lib/quote/engine.test.ts` | test | request-response | **this file** | exact |
| `apps/web/lib/pricing/public-chf.test.ts` | test | transform | **this file** `derivePricingLive && public_chf` | exact — KEEP AND |
| `packages/db/supabase/migrations/20260914190000_quote_rate_book_live_classes.sql` | migration | CRUD | `20260913180000_ops_pricing_source.sql` `quote_rate_book` + `20260913000001_launch_public_chf_vat.sql` header | role-match — git only |
| `app/home/home.dc.html` | component | request-response | **this file** `fleetOffer` + SiteHeader overlay | exact — **CHANGE:** delete `VEHICLE_CLASSES` |
| `apps/web/public/app/home/home.dc.html` | component | file-I/O | **this file** — byte-equal after `sync-dc-mock-to-public.mjs` | exact — dual-DC |
| `apps/web/components/home/BookingBoard.tsx` | component | request-response | **this file** `publicFleet` omit `no_rate` | exact — **CHANGE:** drop `CLASS_NAMES` four-map |
| `app/vamos-i18n-dict.js` | store | transform | **this file** en/de/fr/ar same sitting | exact |
| `apps/web/public/app/vamos-i18n-dict.js` | store | file-I/O | dual-DC copy of `app/vamos-i18n-dict.js` | exact — dual-DC |
| `apps/web/app/[locale]/checkout/CheckoutClassCards.tsx` | component | request-response | **this file** | exact — **CHANGE:** drop `CLASS_SLUGS` / `CLASS_META` |
| `apps/web/app/[locale]/checkout/CheckoutClient.tsx` | component | request-response | **this file** | exact — **CHANGE:** drop `asClassSlug` → economy |
| `apps/web/lib/quote/intent.ts` | service | request-response | **this file** `INTENT_LADDER` | exact — **CHANGE:** open `IntentVehicleClass` |
| `apps/web/lib/quote/schema.ts` | utility | transform | **this file** extras + preferred_class | exact — open slug; extra_stops 0\|1 |
| `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` | route | CRUD | **this file** `withStaff` GET / `withAdmin` PUT + `resolveWritableVersionId` | exact — KEEP Save-fork; drop `KNOWN_CLASS_SLUGS` / `region` / quote-lock hours |
| `apps/web/app/api/staff/rate-book/route.ts` | route | request-response | **this file** re-export | exact — dual-mount |
| `apps/web/lib/ops/ops-dc-finalize.test.ts` | test | file-I/O | **this file** | exact — **CHANGE:** invert four-class + night\|weekend\|holiday fingerprints |
| `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts` | route | request-response | **this file** completeness 409 + `asStaff` tx `live` + `public_chf` | exact — **CHANGE:** do **not** fork after success (D-03) |
| `apps/web/app/api/staff/rate-versions/[id]/publish/route.ts` | route | request-response | **this file** `export { POST }` | exact — dual-mount |
| `apps/web/lib/ops/rate-book.ts` | service | CRUD | **this file** `forkLiveRateVersion` / `cloneRateVersionFrom` | exact — KEEP for Save; stop calling from Publish/Discard |
| `apps/web/lib/ops/publish-public-chf.test.ts` | test | file-I/O | **this file** `withAdmin` + same-tx `public_chf` | exact — **CHANGE:** invert fork-after-Publish assertion |
| `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/discard/route.ts` | route | request-response | **this file** delete draft children | exact — **CHANGE:** do not fork after discard (D-06) |
| `apps/web/app/api/staff/rate-versions/[id]/discard/route.ts` | route | request-response | **this file** `export { POST }` | exact — dual-mount |
| `app/ops/OpsPricing.dc.html` | component | request-response | **this file** OpsTable / header Publish / rail VAT / `:root --vt-shadow-accent:none` | exact — four tabs only (D-11); no History/Preview/region |
| `apps/web/public/app/ops/OpsPricing.dc.html` | component | file-I/O | **this file** — byte-equal to `app/ops/` | exact — dual-DC |
| `app/vamos-ops-data.js` | service | request-response | **this file** `rateBookCollection` Save/Publish/Discard | exact — **CHANGE:** drop preview/test-unpaid; no four-class coerce |
| `apps/web/public/app/vamos-ops-data.js` | service | file-I/O | dual-DC copy | exact — dual-DC |
| `apps/web/lib/ops/pricing.ts` | service | CRUD | **this file** `loadCompleteness` | exact — add photo + bags + band_overlap; D-30/D-18 |
| `apps/web/lib/quote/lock.ts` | utility | transform | **this file** HMAC lock payload | exact — **CHANGE:** lock length hardcoded 24h; extra_stops 0\|1 |
| `apps/web/lib/ops/ops-pricing-source.test.ts` | test | file-I/O | **this file** dual-copy | exact — invert five-tabs / History / Preview |
| `apps/web/lib/ops/draft-preview-unpaid.test.ts` | test | file-I/O | **this file** | exact — **CHANGE:** Preview/test-unpaid gone (D-12); drop fork-after-Publish expects |
| `apps/web/lib/pricing/lines.ts` | utility | transform | **this file** `buildFareLine` | exact — KEEP D-15 recipe; add canton match; drop region line from public path |
| `apps/web/lib/pricing/lines.test.ts` | test | transform | **this file** | exact — owner fixtures + place-then-canton |
| `apps/web/lib/pricing/bands.ts` | utility | transform | **this file** `classBandExtrasRappen` | exact — KEEP math; overlap **blocks Publish** (D-18), not “higher wins” as product |
| `apps/web/lib/pricing/bands.test.ts` | test | transform | **this file** | exact — rewrite overlap as illegal for Publish |
| `apps/web/lib/ops/pricing.test.ts` | test | CRUD | **this file** completeness | exact — photo + bags + overlap |
| `apps/web/lib/pricing/types.ts` | model | transform | **this file** `VehicleClassSlug = string` | exact — KEEP open slug; add photo_path / display name / canton fields |
| `apps/web/lib/quote/schema.test.ts` | test | transform | **this file** extra_stops 0..3 | exact — cap 1 |
| `apps/web/lib/quote/pipeline.ts` | service | request-response | **this file** `QUOTE_STEPS` | exact — **CHANGE:** drop `country_box` refuse (D-26) |
| `apps/web/lib/checkout/extras-catalog.ts` | utility | transform | **this file** `catalogFromSurcharges` | exact — KEEP omit inactive; **CHANGE:** max extra stops hardcoded 1; meet/free-wait not customer-off |
| `packages/db/supabase/migrations/20260914191000_vehicle_class_any_photo.sql` | migration | CRUD | `20260823000005_fleet.sql` slug CHECK + launch SQL header | role-match — git only, owner-apply 18-07 |
| `apps/web/lib/ops/photos.ts` | utility | file-I/O | **this file** `PHOTO_PREFIXES` / `buildPhotoKey` | exact — add `classes/` |
| `apps/web/lib/ops/photos.test.ts` | test | file-I/O | **this file** | exact — extend kind |
| `apps/web/app/[locale]/(ops)/api/photos/upload/route.ts` | route | file-I/O | **this file** staff POST → `PHOTOS.put` → `{ key }` | exact — KEEP split (no DB write here) |
| `apps/web/app/api/photos/upload/route.ts` | route | request-response | **this file** re-export | exact — dual-mount |
| `apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts` | route | CRUD | **this file** GET/PATCH/POST `withAdmin` | exact — photo_path on Save |
| `apps/web/app/api/staff/vehicle-classes/route.ts` | route | request-response | **this file** `export { GET, PATCH, POST, DELETE }` | exact — dual-mount |
| `apps/web/lib/ops/fleet-write.ts` | service | CRUD | **this file** `insertVehicleClassOnDraft` `asStaff` | exact |
| `apps/web/lib/ops/surcharge-codes.ts` | utility | transform | **this file** `isPassengerExtra` | exact — **CHANGE:** drop night/weekend/holiday types |
| `apps/web/lib/checkout/extras-catalog.test.ts` | test | transform | **this file** omit inactive, not CHF 0 | exact — KEEP D-22 |
| `apps/web/lib/checkout/intent.ts` | service | request-response | **this file** waiting extra 0 at pay | exact — KEEP D-23; no `off_session` |
| `apps/web/lib/checkout/vat.ts` | utility | transform | **this file** `vatOnTopRappen` fallback 81 | exact — KEEP; coupon before VAT (D-24) |
| `apps/web/lib/pricing/policy.ts` | utility | transform | **this file** `buildCouponLine` on pre-coupon total | exact — KEEP D-24 |
| `apps/web/lib/ops/bookings-map.ts` | service | transform | **this file** `extraWaitFromArrival` display-only | exact — KEEP; grep-gate no `off_session` |
| `apps/web/lib/checkout/extra-wait-no-offsession.test.ts` | test | file-I/O | **this file** | exact — extend to `bookings-map.ts` |
| `docs/runbooks/quote-publish.md` | config | request-response | **this file** Hyperdrive nocache + snapshot-at-pay | exact — do not invent CHF or mail copy |

---

## Pattern Assignments

Grouped the way 18-01…18-07 slice tasks. Copy the excerpts; do not paraphrase them into a second stack. **KEEP** vs **CHANGE** is binding.

### 1. Dual-DC sync + dual-mount re-exports

**Files:** every `app/ops/*` and `app/home/home.dc.html` change; `apps/web/public/app/{ops,home}/*`; `apps/web/app/api/staff/*` re-exports; `apps/web/app/api/photos/upload/route.ts`.

**KEEP — sync script** (`scripts/sync-dc-mock-to-public.mjs` lines 1–8, 27–28):

```javascript
/**
 * Copy the Claude Design export (app/ + design-system + assets + hero)
 * into apps/web/public so staging serves the mock as-is.
 */
const PAGE_FILES = [
  "app/home/home.dc.html",
```

Edit `app/` then `node scripts/sync-dc-mock-to-public.mjs`. Do not strip injected `<base href="/app/ops/">` on the public ops copy.

**KEEP — dual-copy test analog** (`apps/web/lib/ops/ops-pricing-vat-field.test.ts` lines 16–40):

```typescript
const CANONICAL = join(repoRoot, "app/ops/OpsPricing.dc.html");
const PUBLIC_COPY = join(webRoot, "public/app/ops/OpsPricing.dc.html");
// ...
expect(readFileSync(PUBLIC_COPY, "utf8")).toBe(readFileSync(CANONICAL, "utf8"));
```

Copy this `readFileSync` both-copies pattern into `ops-pricing-tabs.test.ts` and `public-live-book-board.test.ts`.

**KEEP — dual-mount staff** (`apps/web/app/api/staff/rate-book/route.ts` lines 1–2):

```typescript
export const dynamic = "force-dynamic";
export { GET, PUT, DELETE } from "../../../[locale]/(ops)/api/staff/rate-book/route";
```

Same shape: publish `export { POST }` (`apps/web/app/api/staff/rate-versions/[id]/publish/route.ts` lines 1–2); discard `export { POST }`; vehicle-classes `export { GET, PATCH, POST, DELETE }`; photos `export { POST, dynamic } from "../../../[locale]/(ops)/api/photos/upload/route"`.

---

### 2. Auth / identity / nocache (KEEP everywhere)

**Source:** `apps/web/lib/ops/staff-json.ts` + `apps/web/lib/db/identity.ts` + `apps/web/lib/db/quote.ts`

**KEEP — json envelope + withAdmin** (`staff-json.ts` lines 23–29, 76–81):

```typescript
export function jsonOk(data: unknown, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}
export function jsonErr(code: string, status: number, extra?: Record<string, unknown>): Response {
  return Response.json({ ok: false, code, ...(extra ?? {}) }, { status });
}
export function withStaff(handler: StaffJsonHandler): (request: Request) => Promise<Response> {
  return (request) => staffResponse(request, requireStaffClaims, handler);
}
export function withAdmin(handler: StaffJsonHandler): (request: Request) => Promise<Response> {
  return (request) => staffResponse(request, requireAdminClaims, handler);
}
```

D-14: Publish / Discard / mutating rate-book stay `withAdmin`, not `withStaff`. Do not invent a dispatcher `/pricing` role.

**KEEP — asStaff / asQuote on nocache** (`identity.ts` lines 118–123, 160–161):

```typescript
export const asStaff = <T,>(
  env: CloudflareEnv,
  claims: VamosClaims,
  fn: QueryFn<T>,
) => withIdentity(env, "staff", claims, fn);

export const asQuote = <T,>(env: CloudflareEnv, fn: QueryFn<T>) =>
  withIdentity(env, "quote", undefined, fn);
```

**KEEP — quote_rate_book via asQuote** (`quote.ts` lines 70–80):

```typescript
export async function loadRateBook(
  env: CloudflareEnv,
  opts: { preferDraft: boolean },
  request?: RequestContext,
): Promise<unknown> {
  const result = await asQuote(env, async (tx) => {
    const rows = await tx`select public.quote_rate_book(${opts.preferDraft}) as result`;
    return rows[0]?.result ?? null;
  });
```

Public callers pass `{ preferDraft: false }`. After Publish the next quote is the new live book because this door is `HYPERDRIVE_NOCACHE`.

---

### 3. Public board — live book only (D-29 / D-31 / D-32 / D-33) — Wave 1

**Files:** `eligibility.ts`, `rateBook.ts`, `priceQuote.ts`, `engine.ts`, `home.dc.html`, `BookingBoard.tsx`, `CheckoutClassCards.tsx`, `CheckoutClient.tsx`, `quote/intent.ts`, `quote/schema.ts`, `rate-book/route.ts` `KNOWN_CLASS_SLUGS`, `20260914190000_quote_rate_book_live_classes.sql`, Wave 0 `public-live-book-board.test.ts`.

#### 3a. Eligibility kernel — KEEP (do not replace with a catalog)

**Analog:** `apps/web/lib/pricing/eligibility.ts`

**KEEP — classOnOffer + hide vs delete** (lines 52–60, 96–122, 170–171):

```typescript
export function classOnOffer(book: RateBook, classId: string): boolean {
  if (distanceRateFor(book, classId)) return true;
  return book.fixed_routes.some((row) => row.vehicle_class_id === classId);
}
```

```typescript
  if (rate !== null && rate.hide_from_public === true) {
    return "unavailable";
  }
  // ...
  if (pax > maxPax) {
    return "pax";
  }
```

```typescript
  const orderedClasses = [...rateBook.classes]
    .filter((cls) => classOnOffer(rateBook, cls.id))
```

D-32 hide = listed, Select off, `CHF 000` (`unavailable`). D-31 delete = no rate and no fixed → omitted (`classOnOffer` false). D-33 pax over max → `pax` (not offered). **Do not drop these cases.** Public UI still paints four catalog cards *around* this kernel — that is the 2026-09-14 UAT hole.

**KEEP — open slug type** (`types.ts` lines 17–21):

```typescript
export type VehicleClassSlug = string;
```

#### 3b. quote_rate_book — CHANGE: must not invent classes

**Analog KEEP body, CHANGE classes agg** (`packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql` lines 337–418):

```sql
create or replace function public.quote_rate_book(p_prefer_draft boolean default false)
-- ...
    'classes', (
      select coalesce(jsonb_agg(to_jsonb(c) order by c.sort_order, c.slug), '[]'::jsonb)
        from public.vehicle_classes as c
    ),
    'distance_rates', (
      select coalesce(jsonb_agg(to_jsonb(d) order by d.vehicle_class_id), '[]'::jsonb)
        from public.distance_rates as d
       where d.rate_version_id = v_id
    ),
```

**CHANGE:** classes subquery must join/filter to `distance_rates` or `fixed_routes` for `v_id`. Keep `p_prefer_draft` live-first (draft only when no live). Keep `public_chf` on the JSON. New file `20260914190000_quote_rate_book_live_classes.sql` — do not edit 20260913180000 in place. **Git only.** Owner apply is 18-07. Never `db push`.

**KEEP — Worker map still filters even before SQL apply** (`rateBook.ts` lines 191–206):

```typescript
export function mapRateBook(doc: unknown): MappedRateBook {
  if (!isRecord(doc)) {
    return {
      rate_version: null,
      classes: [],
      // ...
    };
  }
  return {
    rate_version: mapRateVersion(doc.rate_version),
    classes: mapList(doc.classes, mapClass),
```

`evaluateEligibility` already drops classes with no rate/fixed. After SQL apply, `doc.classes` itself must not list leftover global Economy.

**KEEP — public never preferDraft** (`engine.ts` lines 165–173, 220–221):

```typescript
  // Public vamostaxi.site is always live book (preferDraft stays false).
  const dashboardHost = opts?.dashboardHost === true;
  const preferDraft = dashboardHost && env.PRICING_PREVIEW === "true";
  const rawBook = await deps.loadRateBook(env, { preferDraft }, request);
```

```typescript
      pricing_live:
        rateBookMapper.derivePricingLive(book.rate_version) && flags.public_chf,
```

Do **not** set `preferDraft: true` on public extras/quote (D-12 Preview is gone; D-03 live book).

**KEEP — extras live-only** (`apps/web/app/api/checkout/extras/route.ts` lines 13–18):

```typescript
export async function GET() {
  try {
    const { env } = getCloudflareContext();
    const [raw, flags] = await Promise.all([
      loadRateBook(env, { preferDraft: false }),
      loadLaunchFlags(env),
    ]);
```

#### 3c. Home DC — CHANGE: delete VEHICLE_CLASSES catalog

**Analog:** `app/home/home.dc.html`

**KEEP chrome** (lines 90–103, 198): Lenis, i18n+locale, `--vt-shadow-accent:none`, `SiteHeader variant="overlay"`.

**DEAD catalog** (lines 766–779) — do not keep as fallback:

```javascript
const VEHICLE_CLASSES = [
  { id:'economy', name:'Economy', icon:'car-front', cap:4, bags:3, image:'/photos/site/class-economy.jpg' },
  { id:'business', name:'Business', icon:'car', cap:4, bags:3, badge:true, image:'/photos/site/class-business.jpg' },
  { id:'first', name:'First', icon:'car', cap:4, bags:3, image:'/photos/site/class-first.jpg' },
  { id:'van', name:'Van', icon:'bus', cap:7, bags:8, image:'/photos/site/class-van.jpg' },
];
function classCatalog(slug) {
  const v = VEHICLE_CLASSES.filter((x) => x.id === slug)[0];
```

`fleetOffer` / cards = quote JSON classes only (slug, name, R2 photo, seats, bags, price, eligible). `classCatalog(id)` fallback is the UAT failure. Unknown slug must not revive Economy. Dual-DC home after sync.

**KEEP omit no_rate; hide stays listed** (`BookingBoard.tsx` lines 121–123):

```typescript
function publicFleet(classes: ClassBoardEntry[]): ClassBoardEntry[] {
  return classes.filter((entry) => entry.ineligible_reason !== "no_rate");
}
```

**DEAD four-name map** (`BookingBoard.tsx` lines 34–39) — display name from the book, not this Record:

```typescript
const CLASS_NAMES: Record<VehicleClassSlug, string> = {
  economy: "Economy",
  business: "Business",
  first: "First",
  van: "Van",
};
```

#### 3d. Checkout cards / client / intent — CHANGE: open slug

**DEAD** (`CheckoutClassCards.tsx` lines 6–60):

```typescript
const CLASS_SLUGS = ["economy", "business", "first", "van"] as const;
const CLASS_META: Record<ClassSlug, { image: string; pax: number; bags: number; nameKey: ... }> = { economy: { image: "/assets/photography/class-economy.jpg", ... }, ... };
export function firstFittingClass(...): ClassSlug {
  return ids.find((id) => classFits(id, pax, bags)) ?? ids[0] ?? "business";
}
```

`offered.filter(id => CLASS_SLUGS.includes)` **drops any new class.** `firstFittingClass` → `"business"` invents a ladder. Render offered slugs from the live book; photo from R2 `/photos/<key>`; capacities from the book.

**DEAD coerce to Economy** (`CheckoutClient.tsx` lines 95, 219–226):

```typescript
const CLASS_SLUGS = ["economy", "business", "first", "van"] as const;
function asClassSlug(raw: string): (typeof CLASS_SLUGS)[number] {
  // ...
  return "economy";
}
```

**DEAD closed union** (`quote/intent.ts` lines 62–78):

```typescript
export type IntentVehicleClass = "economy" | "business" | "first" | "van";
export type IntentBody = {
  vehicle_class: IntentVehicleClass;
  // ...
};
export type IntentRecomputeClass = {
  slug: IntentVehicleClass;
```

**CHANGE:** `vehicle_class` / recompute slug = live-book string matching `CLASS_SLUG` `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`. Closed union **rejects a new class at pay**.

**DEAD schema catalog** (`quote/schema.ts` line 74): `VEHICLE_CLASS_VALUES = ["economy", "business", "van"]` — also a closed catalog; open to kebab slug.

**DEAD rate-book four columns** (`rate-book/route.ts` lines 36, 773–794):

```typescript
const KNOWN_CLASS_SLUGS = ["economy", "business", "first", "van"] as const;
const slugSet = new Set<string>(KNOWN_CLASS_SLUGS);
// ...
slug: klassSlug(recBody.vehicleClassSlug) || "economy",
```

D-29: routes are per-class rows, not four money columns. A fifth class is invisible and coerced today.

**DEAD ops data coerce** (`app/vamos-ops-data.js` line 518): `VEHICLE_CLASSES = ["Economy", "Business", "First", "Van"]` — unknown klass → `"Economy"`. List from live/draft book. Ops board still assigns **hidden** classes (D-32).

**DEAD test fingerprint** (`ops-dc-finalize.test.ts` lines 18–29) asserts the four-class ladder and `KNOWN_CLASS_SLUGS`. Invert to D-29; do not keep the fingerprint.

**Migration header analog** (`20260913000001_launch_public_chf_vat.sql` lines 1–8):

```sql
-- Hosted apply is owner-gated (11-11). Do not invent CHF.
-- Agent never apply_migration, never supabase db push, never restore onto
-- yaumjzvylngfjhtuffqs.
```

Copy this header onto `20260914190000_quote_rate_book_live_classes.sql` and `20260914191000_vehicle_class_any_photo.sql`. Never default `public_chf` true.

---

### 4. Publish / Discard / Save-fork (D-01…D-10, D-03 landmine) — Wave 2

**Files:** `publish/route.ts`, `discard/route.ts`, `ops/rate-book.ts`, `rate-book/route.ts` GET/PUT, `publish-public-chf.test.ts`.

#### 4a. Publish POST — KEEP tx / public_chf / completeness; CHANGE: do not fork after success

**Analog:** `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts`

**KEEP — withAdmin + 409 before write + asStaff tx** (lines 58–106):

```typescript
  return withAdmin(async (claims) => {
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) return jsonErr("not-found", 404);
    const { env } = getCloudflareContext();
    const gaps = await loadCompleteness(env, claims, id);
    if (gaps.length > 0) {
      return jsonFail("incomplete", 409, gaps);
    }
    try {
      await asStaff(env, claims, async (tx) => {
        // FOR UPDATE draft, retire previous live, set this live,
        // public_chf = true, vat_rate_bps coalesce, INSERT settings_versions
```

**KEEP — append-only settings_versions INSERT** (lines 107–150): never UPDATE that table. SQLSTATE mapping, no `err.message`. Failed Publish **keeps the draft** (D-08). Envelope `{ ok:false, code:"incomplete", gaps }`.

**KEEP — same-tx public_chf** (lines 101–106):

```typescript
          update public.settings
             set public_chf = true,
                 vat_rate_bps = coalesce(${vatBps}, vat_rate_bps)
           where id = 1
```

**DEAD — fork in the same tx** (line 151 + header comment lines 6–7):

```typescript
        await forkLiveRateVersion(env, claims, { id, label: row.label }, tx);
```

D-03: after Publish `/pricing` shows the **live** book. Next Save starts a draft. Remove this call. Header still says “D-06: clone a new draft after success” — that was 2026-09-13 numbering; **restart D-03 forbids it**.

**DEAD test** (`publish-public-chf.test.ts` lines 96–101):

```typescript
  it("D-06: forkLiveRateVersion runs in the same tx after public_chf", () => {
    expect(publish).toMatch(/forkLiveRateVersion/);
    expect(publish).toMatch(
      /asStaff\([\s\S]*public_chf\s*=\s*true[\s\S]*forkLiveRateVersion/,
    );
```

**CHANGE:** assert `publish/route.ts` does **not** call `forkLiveRateVersion`. Still assert `withAdmin`, `asStaff`, same-tx `public_chf = true`, INSERT `settings_versions`. Dual-mount stays `export { POST }`.

On 409 incomplete, do not delete the draft (D-08). Agent does not click Publish.

#### 4b. Discard — KEEP delete draft; CHANGE: do not fork after discard

**Analog:** `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/discard/route.ts`

**KEEP — withAdmin + refuse live + delete children** (lines 21–47):

```typescript
export const POST = withAdmin(async (claims, request) => {
  // ...
  if (!target || target.status !== "draft") return jsonErr("not-draft", 409);
  await asStaff(env, claims, async (tx) => {
    await tx`delete from public.coupons where rate_version_id = ${id}`;
    await tx`delete from public.surcharges where rate_version_id = ${id}`;
    await tx`delete from public.rate_version_rules where rate_version_id = ${id}`;
    await tx`delete from public.distance_bands where rate_version_id = ${id}`;
    await tx`delete from public.region_premiums where rate_version_id = ${id}`;
    await tx`delete from public.fixed_routes where rate_version_id = ${id}`;
    await tx`delete from public.distance_rates where rate_version_id = ${id}`;
    await tx`delete from public.rate_versions where id = ${id} and status = 'draft'`;
```

Confirm is DC (OpsPricing Dialog). If id is live, refuse. Public book unchanged.

**DEAD — clone after discard** (lines 49–51):

```typescript
  if (!live) return jsonOk({ discarded: id, versionId: null, empty: true });
  const nextId = await forkLiveRateVersion(env, claims, live);
  return jsonOk({ discarded: id, versionId: nextId, empty: false });
```

D-06: draft gone, **page shows live book**. Return live id; do not clone.

#### 4c. Save on live — KEEP fork for first Save after Publish only

**Analog:** `apps/web/lib/ops/rate-book.ts` `forkLiveRateVersion` + `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` `resolveWritableVersionId`

**KEEP — clone implementation** (`rate-book.ts` lines 641–763). Overlay writes copy distance_rates (incl. `hide_from_public`), fixed_routes, rules, surcharges, bands, coupons. When `tx` is passed, clone joins that asStaff tx — **Publish must stop passing tx into fork**. Keep the function for Save.

**KEEP — PUT forks live** (`rate-book/route.ts` lines 342–360, 443–458):

```typescript
async function resolveWritableVersionId(...) {
  // ...
    if (hit.status === "draft") return hit.id;
    if (hit.status === "live") return forkLiveRateVersion(env, claims, hit);
  // ...
  const draft = versions.find((row) => row.status === "draft");
  if (draft) return draft.id;
  const live = versions.find((row) => row.status === "live");
  if (live) return forkLiveRateVersion(env, claims, live);
}
export const PUT = withAdmin(async (claims, request) => {
  const versionId = await resolveWritableVersionId(env, claims, recBody.versionId);
```

D-02: typing is not a draft; **Save** creates the draft. This fork-on-write is the correct D-03 “next Save starts a draft”.

**CHANGE — GET after Publish prefers live** (`rate-book/route.ts` lines 329–339):

```typescript
  const draft = versions.find((row) => row.status === "draft");
  if (draft) return draft.id;
  const live = versions.find((row) => row.status === "live");
  return live ? live.id : versions[0]?.id ?? null;
```

Today, after Publish-with-fork, GET always hits the clone so `/pricing` never shows live. After D-03, GET returns live when no **saved** draft exists. Do not fork on GET.

**CHANGE — drop quote-lock hours write** (lines 63–73, 463–475) `quoteLockMinutesFromHours`. D-13: lock is **1440 minutes**, not a field. Publish writes `quote_lock_minutes = 1440`. Remove quote_lock rule kind from the DC.

**CHANGE — drop `region` kind** (line 34 `DRAFT_KINDS` includes `"region"`). D-17. PUT `kind: "region"` may 400.

---

### 5. OpsPricing four tabs (D-11 / D-12 / D-05 / D-07 / D-08) — Wave 2

**Files:** `app/ops/OpsPricing.dc.html`, `app/vamos-ops-data.js`, `ops-pricing-tabs.test.ts`, `ops-pricing-source.test.ts`, `draft-preview-unpaid.test.ts`, `vamos-i18n-dict.js`.

**KEEP chrome** (`OpsPricing.dc.html` lines 12–13):

```css
:root{--vt-shadow-accent:none}
.vt-input--focus{box-shadow:none}
```

Keep `OpsTable` overlays, header Publish, rail VAT **field** (Save creates draft — D-02; do not PATCH live `settings.vat_rate_bps` on keystroke). Draft mark: charcoal/yellow tokens only — no `--vt-yellow-50`/`-100`, no glow. T blocks en/de/fr/ar same sitting. Arabic RTL / logical properties. Jump-to-gap: switch `PANES` key + open the overlay for that row.

**DEAD five-tab PANES** (lines 299–309):

```javascript
const PANES = [
  { key:'routes', icon:'navigation', tab:'tabRoutes', hint:'hintRoutes' },
  { key:'distance', icon:'arrow-left-right', tab:'tabDistance', hint:'hintDistance' },
  { key:'surcharges', icon:'banknote', tab:'tabSurcharges', hint:'hintSurcharges' },
  { key:'coupons', icon:'ticket', tab:'tabCoupons', hint:'hintCoupons' },
  { key:'history', icon:'clock', tab:'tabHistory', hint:'hintHistory' },
];
```

D-11: **exactly four** keys `routes`, `distance`, `surcharges`, `coupons`. No `tabHistory`. No Re-Publish of an old book.

**DEAD Preview / test unpaid** (lines 383, 868, 893): `runPreview`, `createTestUnpaid`. D-12: no Preview pane, no test unpaid from this page.

**DEAD CLASS_KEYS** (line 245): `['economy', 'business', 'first', 'van']`. Classes come from the book.

**DEAD region table** (line 110 `regionRows` OpsTable). D-17.

**DEAD** `vamos-ops-data.js` `preview`, `createTestUnpaid`, `saveDraftVat` on every VAT keystroke. VAT waits for Save (D-02) then Publish (D-01).

`ops-pricing-source.test.ts` / `ops-pricing-tabs.test.ts`: invert five-tabs, History, Preview, region, overlap-as-warn. Keep dual-DC byte-equal. `draft-preview-unpaid.test.ts`: Preview/test-unpaid routes are not product; do not require post-Publish fork.

---

### 6. Money kernel (D-15…D-18) — KEEP round / fare recipe; CHANGE region + overlap-as-product

**Files:** `round.ts` (KEEP, do not modify unless tests need fixtures), `lines.ts`, `bands.ts`, `priceQuote.ts`, `d15-recipe.test.ts`, `pricing.ts` completeness.

**KEEP — integer perKm** (`round.ts` lines 96–102):

```typescript
export function perKm(perKmRappen: number, distanceMetres: number): number {
  return roundHalfUp(perKmRappen * distanceMetres, 1_000);
}
```

Owner fixtures (illustration, **not** live fares): `10000 + perKm(1200, 14600) === 27520`; `perKm(1000, 12300) === 12300`. Do not invent a separate round-to-0.01 product rule. No float CHF. No 5-rappen.

**KEEP — distance recipe** (`lines.ts` lines 134–217):

```typescript
  /** D-17: extra stop on the journey → skip fixed_routes, use distance recipe. */
  hasExtraStops?: boolean;
export function buildFareLine(args: BuildFareLineArgs): Line {
  // live origin→dest for this class only; extra stops skip fixed
  // amount = base + perKm(perKmR, distance_m) + classBandExtrasRappen(...)
  // min_fare is not a floor
```

D-15: start (once) + (all km × per-km) + bands on top. 1 km uses the same recipe. A→B and B→A are separate rows (no reverse match). Extra stop → never take fixed (D-21) — already `journeyHasExtraStops`.

**KEEP — band extras on top of per-km** (`bands.ts` lines 1–16, 41–42):

```typescript
// Covered metres are [0, distanceM). A band covers [from_km, to_km);
// null to_km is open last.
export function classBandExtrasRappen(...)
```

Open last (`to_km` null) **allowed**. Kernel may still pick a slice if a corrupt book overlaps; **Publish cannot succeed** (D-18).

**CHANGE — overlap is a Publish block**, not “higher wins” as product law. Comment at `bands.ts` line 3 and `bands.test.ts` “overlapping bands, higher per_km_rappen wins” must not remain the shipping story. Completeness kind `band_overlap` (or `band` named by class) → Publish 409.

**DEAD region line on public stack** (`priceQuote.ts` lines 24, 205–211):

```typescript
  buildRegionPremiumLine,
    const region = buildRegionPremiumLine({
      leg: journeyLeg,
      fareLine: fare,
      premiums: book.region_premiums,
      rateVersionId,
    });
    if (region) raw.push(region);
```

D-17: delete from calculation, Distance tab, and recap. `lines.ts` `buildRegionPremiumLine` (line 249) is not a live recap line.

**CHANGE — completeness** (`pricing.ts` `loadCompleteness` lines 79–145): today gaps are start/per-km/max pax/slug, surcharge, live fixed price, coupon, empty rule, band class/per-km. **Missing:** photo, max bags (D-30), band overlap (D-18). Keep trigger in lockstep if SQL changes — owner-apply gate. Never `db push`.

---

### 7. Fixed routes + extra stop + Mapbox unfenced (D-19 / D-20 / D-21 / D-26)

**Files:** `lines.ts`, `types.ts`, `schema.ts`, `pipeline.ts`, `extras-catalog.ts`, `OpsPricing.dc.html` routes pane, `rate-book/route.ts` kind `route`, `CheckoutClient.tsx` extra stop, `home.dc.html` suggest, `lock.ts` extra_stops.

**KEEP — place match then distance** (`lines.ts` 170–177): live `origin_zone_id`/`dest_zone_id` for this class; extra stops skip. **CHANGE:** after exact place (and airport terminal ≡ saved airport pin), canton→canton fallback. Exact place wins. Empty canton table must **not** block quotes. No reverse A←B.

**No analog** for canton matcher: grep of `apps/web` finds no `canton` / `admin_area` / `iso_3166_2` matcher. Discretion: Mapbox retrieve context `region` / admin-area. Persist on the pin. Airport identity: zone_type / IATA, not raw mapbox_id.

**KEEP — Mapbox suggest unfenced** (`mapbox.ts` lines 226–249):

```typescript
export async function suggest(...) {
  // Search is worldwide. proximity is rank bias only (Zurich HB default).
  // country= is a Mapbox FILTER, not a bias — it dropped Dubai
  params.set("proximity", proximityParam(input.proximity));
```

Do **not** add `country=CH`. Do not add a canton tick-list fence (D-26).

**CHANGE — drop country_box quote refuse** (`pipeline.ts` lines 55–67, 519–526):

```typescript
export const QUOTE_STEPS = Object.freeze([
  // ...
  Object.freeze({ id: "country_box" }),
  Object.freeze({ id: "service_area" }),
```

```typescript
    case "country_box": {
      if (!insideCountryBox(state.pickup!) || !insideCountryBox(state.dropoff!)) {
        return { ok: false, code: "place_out_of_box" };
      }
```

D-26: quote fails only when From/To cannot be resolved (plus same-place / min-advance as today). Canton is matching, not a fence. Do not rebuild autocomplete.

**CHANGE — extra_stops max 1** (`schema.ts` lines 251–253 currently `> 3`; `lock.ts` line 79 `extra_stops?: 0 | 1 | 2 | 3`; `extras-catalog.ts` `publishedMaxExtraStops` lines 232–241 reads `rate_versions.max_extra_stops`). D-21: cap **hardcoded 1**, not a `/pricing` field. Extra stop is one Mapbox place; fare re-runs start + full path km × per-km + bands; not a fixed CHF chip.

**KEEP — extra stop already not amount×qty** (`extras-catalog.ts` lines 244–245, 274): extra-stop code gets `amount_rappen: null` in catalog.

---

### 8. Class photos R2 (D-30) + any-class SQL (D-29)

**Files:** `photos.ts`, `photos/upload/route.ts`, `photos/[key]/route.ts` allow-list, `vehicle-classes/route.ts`, `fleet-write.ts`, `20260914191000_vehicle_class_any_photo.sql`, OpsPricing class overlay.

**KEEP — prefixes + key shape** (`photos.ts` lines 7–17, 82–96, 118–122):

```typescript
export const PHOTO_PREFIXES = ["vehicles/", "chauffeurs/", "reviews/", "staff/", "site/"] as const;
export function buildPhotoKey(kind: PhotoKind, recordId: string, contentType: string): string {
  return `${prefix}${recordId}/${crypto.randomUUID()}.${ext}`;
}
export function isReadablePhotoKey(key: string): boolean {
  // reject /, \, .. then PHOTO_PREFIXES.some
}
```

**CHANGE:** add `classes/` to `PHOTO_PREFIXES`, `PhotoKind`, `KIND_TO_PREFIX`, `isPhotoKind`. Keep sniff/size/MIME. Browser never holds R2 credentials.

**KEEP — upload writes no DB** (`photos/upload/route.ts` lines 32–72): staff POST multipart `{ kind, recordId, file }` → `assertPhotoUpload` → `buildPhotoKey` → `env.PHOTOS.put` → `{ key }`. Class Save stores `photo_path` on the draft via `asStaff`.

**KEEP — GET allow-list** (`photos/[key]/route.ts` lines 14–18):

```typescript
  if (!key || !PHOTO_PREFIXES.some((prefix) => key.startsWith(prefix))) {
    return new Response(null, { status: 404 });
  }
```

Extending `PHOTO_PREFIXES` automatically allows `classes/` reads.

**KEEP — DC photo editor analog** (`app/ops/OpsFleet.dc.html` lines 340, 352):

```javascript
{ key:'photo', label:t.fPhoto, editor:'photo', photoKind:'vehicle', upload:'/api/photos/upload', ... }
{ key:'photo', label:t.fPhoto, editor:'photo', photoKind:'chauffeur', upload:'/api/photos/upload', ... }
```

Copy onto the class overlay with `photoKind: 'class'` once kind exists. Render `/photos/<key>`. Clear sets `''`. Reject `data:` embeds (chauffeur analog).

**KEEP — class POST withAdmin + draft** (`vehicle-classes/route.ts` lines 38–42, 78–100):

```typescript
export const GET = withStaff(...)
export const POST = withAdmin(async (claims, request) => {
    const slug = slugFromName(rec.slug ?? rec.name ?? rec.klass);
    if (!CLASS_SLUG.test(slug)) return jsonErr("invalid", 400);
    const draftId = await resolveWritableDraftId(env, claims);
    const id = await insertVehicleClassOnDraft(env, claims, { ...input, slug }, draftId);
```

**KEEP — fleet-write asStaff** (`fleet-write.ts` lines 1–6, 159–165): SQL stays in the write module; route never imports postgres.

**DEAD slug CHECK** (`20260823000005_fleet.sql` line 13):

```sql
  slug               text not null unique check (slug in ('economy','business','first','van')),
```

D-29 cannot INSERT a new slug until this CHECK is dropped. Additive migration `20260914191000_vehicle_class_any_photo.sql`: drop CHECK, add `photo_path`, typed display name. **Git only.** Owner apply 18-07. Do not invent a fifth slug in app code first.

Completeness: empty `photo_path`, empty name, null start, null per-km, null max pax, null bags → 409 (D-10 / D-30).

---

### 9. Surcharges one list + extras catalog (D-22 / D-23 / D-25 / D-34 / D-35)

**Files:** `OpsPricing.dc.html` Surcharges pane, `surcharge-codes.ts`, `extras-catalog.ts`, `extras-catalog.test.ts`.

**KEEP — live chips only, delete = gone** (`extras-catalog.ts` lines 263–281):

```typescript
export function catalogFromSurcharges(rows: SurchargeLike[]): CheckoutExtraJson[] {
  const out: CheckoutExtraJson[] = [];
  for (const row of rows) {
    if (!row.active) continue;
    if (!isPassengerExtra(row.code)) continue;
    if (row.code === FREE_WAIT_CODE) continue;
    // ...
  }
  out.push({ ...FREE_WAIT_CARD });
  return out;
}
```

Inactive omitted, not CHF 0 (D-22). Ski already normalises (`surcharge-codes.ts` lines 43–44 `ski` → `ski_rack`). `isPassengerExtra` already allows unknown non-automatic codes (D-35 new extras from the one list).

**KEEP — membership is the book** (`surcharge-codes.ts` lines 54–59):

```typescript
export function isPassengerExtra(code: string): boolean {
  const n = normalizeSurchargeCode(code);
  if (!n || n === "return_trip") return false;
  return !isAutomaticSurcharge(n);
}
```

**DEAD automatic night/weekend/holiday** (`surcharge-codes.ts` lines 4–16, 33–41):

```typescript
export const SURCHARGE_CODES = [ ..., "night", ..., "weekend", "holiday", ... ];
export const AUTOMATIC_SURCHARGE_CODES = [
  "airport_pickup", "night", "waiting_airport", "waiting_city", "waiting", "weekend", "holiday",
];
```

D-25: those kinds must not exist as types. D-13: quote lock is **not** a row. D-34: **one list**. Add/Edit dialog: pick type, fields for that type, a short “what this does”. Nothing extra in the dialog. Checkout extra is a type in that same dialog (name, CHF, icon). Extra wait / free-wait hours are that type’s fields (D-23).

**CHANGE — meet/free wait not customer-off** (`extras-catalog.ts` lines 27–33, 67–91): today `toggle: true` and `extraToggleDefaultOn` can turn them off. D-23: always on; customer cannot turn them off. Meet is CHF 0 included. Free wait hours is a `/pricing` field (1h now). Extra wait after that is per hour, **not** in Stripe pay-now.

Invert `ops-dc-finalize.test.ts` if it still requires `night|weekend|holiday` in OpsPricing.

---

### 10. Recap / VAT / coupon / extra wait (D-23 / D-24 / D-27 / D-28)

**Files:** `checkout/intent.ts`, `vat.ts`, `policy.ts`, `bookings-map.ts`, `CheckoutClient.tsx`, `extra-wait-no-offsession.test.ts`. Related analog (not in `<files>` but D-24 recap): `confirmation-receipt.ts`.

**KEEP — VAT on top, fallback 81** (`vat.ts` lines 4–26):

```typescript
export const CH_VAT_RATE_BPS = 81;
export function vatOnTopRappen(netRappen: number, bps?: number | null): number {
  if (!Number.isFinite(netRappen) || netRappen <= 0) return 0;
  return Math.round((netRappen * vatBps(bps)) / 1000);
}
export function payableWithVatRappen(netRappen: number, bps?: number | null): number {
  return netRappen + vatOnTopRappen(netRappen, bps);
}
```

D-24: VAT % of (ride + extras − coupon). Coupon before VAT. Payable floors at CHF 0.00. Header EUR/USD is display only; Stripe CHF.

**KEEP — coupon on pre-coupon total** (`policy.ts` lines 205–230):

```typescript
export function buildCouponLine(args: BuildCouponLineArgs): Line {
  // percent or amount, of: "pre_coupon_total", clamped so remainder is never negative
```

**DEAD confirmation order** (`confirmation-receipt.ts` lines 130–157): comment “Class fare + extras, then VAT, **then coupon**” + `vatIncludedRappen` on gross. D-24 / D-28: recap top to bottom **start, km, bands, automatic wait if it applies, customer extras, VAT, total**. Coupon before VAT. No region. No night/weekend/holiday lines. If 18-07 only touches CheckoutClient, still do not ship a receipt that disagrees with Stripe (D-09).

**KEEP — extra wait not in pay-now** (`checkout/intent.ts` lines 235–237):

```typescript
  const extraAdd = extraRappenOutsideLock(payload.extras, catalog, extraOn);
  // D-38: waiting extra is 0 at pay. extraFaresOn / extraRappenOutsideLock drop it.
```

**KEEP — ops display only** (`bookings-map.ts` lines 175–182):

```typescript
/** D-38: extra wait after published free_wait_minutes. Display only — never a Stripe amount. */
export function extraWaitFromArrival(args: { ... }): { extraMinutes: number; extraRappen: number }
```

**KEEP — grep gate** (`extra-wait-no-offsession.test.ts` lines 12–25): no `off_session`, no `paymentIntents.create` on checkout charge path; intent contains `waiting extra is 0 at pay`. **CHANGE:** also read `bookings-map.ts`. Do not add silent debit. Extra-wait SCA is deferred — **no analog to copy**.

---

### 11. Lock hardcoded 24h (D-13)

**Analog:** `apps/web/lib/quote/lock.ts`

Today lock length is published `quote_lock_minutes` (hours×60 from `/pricing`). D-13: **hardcode 24 hours** (1440 minutes). Unpaid keep the locked old amount until then, then auto-cancel (existing expire-unpaid). Paid trips keep the snapshot. Remove the hours field from `/pricing` and from Publish copy into `settings_versions` (Publish may still write 1440 so the column stays consistent). Do not add a quote_lock row on the surcharges list.

---

### 12. Owner-apply SQL + runbook (18-07)

**Analog header:** `20260913000001_launch_public_chf_vat.sql` (see §3b).

**KEEP runbook facts** (`docs/runbooks/quote-publish.md`): Hyperdrive nocache so next quote after Publish is the new book; snapshot at pay; paid trips never reprice. Update only with facts already true. Do not invent CHF or mail copy. Agent does not Publish. Agent does not `db push`. Never restore onto `yaumjzvylngfjhtuffqs`.

---

### 13. Design-system / i18n (CLAUDE.md) — KEEP on every DC

- `--vt-*` only. Lucide via `Icon`. Amounts `CHF 000` / `CHF 00.00`.
- `--vt-shadow-accent:none` on every `.dc.html` `:root`. `.vt-input--focus{box-shadow:none}`.
- No glow. No `--vt-yellow-50` / `-100` / `-600` / `-700`.
- Four languages same sitting in `app/vamos-i18n-dict.js` (Swiss German “ss”). Logical properties. Check Arabic.
- Public pages: `SiteHeader` + `SiteFooter`. Ops: `OpsSidebar`. Home header `variant="overlay"`.
- Lenis from `assets/lenis-boot.js`. Never a second Lenis.

---

## Shared Patterns

### Authentication (staff writes)

**Source:** `apps/web/lib/ops/staff-json.ts` lines 76–81 + `identity.ts` `asStaff`
**Apply to:** publish, discard, rate-book PUT/DELETE, vehicle-classes POST/PATCH/DELETE, overlay Save

```typescript
export const PUT = withAdmin(async (claims, request) => { ... });
export const POST = withAdmin(async (claims) => { ... await asStaff(env, claims, async (tx) => { ... }); });
```

GET rate-book may stay `withStaff`; mutations `withAdmin` (D-14).

### Quote identity (public reads)

**Source:** `apps/web/lib/db/quote.ts` lines 70–76 + `engine.ts` lines 165–173
**Apply to:** home quote, checkout extras, intent reprice

```typescript
loadRateBook(env, { preferDraft: false })
// asQuote → quote_rate_book on HYPERDRIVE_NOCACHE
```

### Error handling (staff JSON)

**Source:** `publish/route.ts` lines 19–41, 154–167 + `rate-book/route.ts` `failWrite` / `classifyPricingFailure`
**Apply to:** all staff pricing writes

```typescript
function jsonFail(code: string, status: number, gaps: CompletenessGap[]): Response {
  return Response.json({ ok: false, code, gaps }, { status });
}
// SQLSTATE only — no err.message. incomplete → 409, forbidden → 403.
```

### Validation (completeness before Publish)

**Source:** `pricing.ts` `loadCompleteness` lines 79–146 + publish 409 at lines 67–70
**Apply to:** Publish; extend kinds for photo, bags, band_overlap. Jump-to-gap consumes `gaps[].kind` + `gaps[].name`.

### Dual-DC + dual-mount

**Source:** `scripts/sync-dc-mock-to-public.mjs` + `ops-pricing-vat-field.test.ts` + `app/api/staff/*/route.ts` re-exports
**Apply to:** every OpsPricing / home / vamos-ops-data / i18n change and every staff route in this phase.

### Integer money

**Source:** `round.ts` `perKm` / `roundHalfUp`
**Apply to:** lines, bands, d15-recipe tests. Never invent CHF. Owner 275.20 / 123 are fixtures.

### R2 photos

**Source:** `photos.ts` + `photos/upload/route.ts` + `photos/[key]/route.ts` + OpsFleet `photoKind`
**Apply to:** class photos (`classes/` prefix). Upload returns key; Save stores `photo_path`.

### Must-not grep

**Source:** `apps/web/lib/health/leak-gate.test.ts` lines 29, 60–61 (`sk_live_`, no `vamostaxi.eu` bind)
**Apply to:** every wave. Extra-wait: `extra-wait-no-offsession.test.ts`.

---

## No Analog Found

| File / capability | Role | Data Flow | Reason |
|-------------------|------|-----------|--------|
| Canton→canton matcher (inside `lines.ts` / quote pin) | utility | transform | No `canton` / `admin_area` / `iso_3166_2` matcher exists. Discretion: Mapbox retrieve region. Empty table must not block quotes (D-20). |
| Extra-wait off-session Stripe debit | service | request-response | Deferred. **Do not invent.** Keep display-only `extraWaitFromArrival` + grep gate. |

Planner: use RESEARCH.md Approach 6A for canton; do not copy Preview/`draft-preview.ts` as a stand-in.

---

## Dead analog index (2026-09-13 PATTERNS — do not copy)

The archived map told planners to keep five tabs, Preview in the rail, `forkLiveRateVersion` after Publish, region % recap, quote-lock hours, and the four-class catalog as “exact — same file”. Those assignments are **wrong** under D-01…D-35:

- Do not analog History / Re-Publish / clone-from-History.
- Do not analog Preview recap or Create test unpaid.
- Do not analog `preferDraft: true` on public.
- Do not analog `buildRegionPremiumLine` as a live line.
- Do not analog night/weekend/holiday types.
- Do not analog quote-lock hours field.
- Do not analog `forkLiveRateVersion` immediately after Publish or Discard.
- Do not analog `VEHICLE_CLASSES` / `CLASS_SLUGS` / `KNOWN_CLASS_SLUGS` / `IntentVehicleClass` as the offer list.
- Do not analog a dispatcher role on `/pricing`.

---

## Metadata

**Analog search scope:** `apps/web/lib/{pricing,ops,quote,checkout,db,geo}`, `apps/web/app/[locale]/(ops)/api/staff`, `apps/web/app/api/staff`, `apps/web/app/api/photos`, `apps/web/app/photos`, `apps/web/app/[locale]/checkout`, `apps/web/components/home`, `app/ops`, `app/home`, `app/vamos-ops-data.js`, `packages/db/supabase/migrations`, `scripts/sync-dc-mock-to-public.mjs`, `docs/runbooks/quote-publish.md`. Ignored `archive-2026-09-13/` except as “do not copy.”
**Files scanned:** ~80 (plan `<files>` + dual-mount + dual-DC + KEEP analog sources)
**Pattern extraction date:** 2026-09-14 restart
**Canonical decisions:** D-01…D-35 (`18-CONTEXT.md` Restarted 2026-09-14)
