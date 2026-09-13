# Phase 18: OPS Pricing source of truth - Research

**Researched:** 2026-09-13
**Domain:** DC ops Pricing on `dashboard.vamostaxi.site` + integer quote kernel + Hyperdrive staff publish + Stripe snapshot charge
**Confidence:** HIGH (codebase + hosted facts). Open items are owner/SCA/copy, tagged below.

Do not re-plan Phases 1–11. Do not execute leftover `04.3-01-PLAN.md` — this phase **absorbs** the blended-band rewrite. Hosted Zurich `yaumjzvylngfjhtuffqs` already has live `rate_versions` id **5**; `settings.public_chf` default **false**; `vat_rate_bps` **81**. Public stays `CHF 000` until owner Publish. Never invent CHF.

<user_constraints>
## User Constraints (from CONTEXT.md)

**CRITICAL:** Locked. Planner and executor honour these. Full text: `.planning/phases/18-ops-pricing-source/18-CONTEXT.md`.

### Locked Decisions

**Go-live / Publish**
- **D-01:** Overlay Save writes **draft** only. Public / ops board / checkout / Stripe / new mail unchanged until Publish.
- **D-02:** Publish is the only flip. Next quote uses the new book immediately. All-or-nothing. Exact error + what was not configured. Confirm shows change list + errors.
- **D-03:** VAT % waits for the same Publish. Today’s instant `PATCH` stays until this phase ships.
- **D-04:** Route Live, deletes, coupon edits, class hide, max pax, night/weekend/holiday/waiting/lock/service area all wait for Publish.
- **D-05:** Ops board / internal totals = published book, or `CHF 000` until first Publish. **Exception:** this page preview may show **draft** CHF.
- **D-06:** No unpublish back to `CHF 000`. Later Publish replaces the book. After success, **new draft cloned from live**. Public stays on old book until next Publish.
- **D-07:** Admin-only. Dispatcher / non-admin `/pricing` → not found. Two admins: last successful Publish wins; the other sees the exact error.
- **D-08:** Publish blocked until every priced field is filled. Gaps = missing required class fields (**name, start, per-km, max pax**) plus any added empty row. Bands/surcharges may be empty if never added.
- **D-09:** History is a fifth tab. Empty before first Publish. Cannot delete rows. Current live marked. Zurich date/time, who published, gap-free, then details vs previous book. Re-Publish old book = same as new Publish. Cannot edit past book in place — clone to draft.
- **D-10:** Discard draft: confirm first. Last published stays live. History unchanged. New draft cloned from live. Never-published: draft gone, page empty, public still `CHF 000`.

**Money recipe**
- **D-11:** Distance class money = **start** + **(all km × per-km)** + **bands on top**. Start is not included-km. **Remove first-X-km / min-fare field.**
- **D-12:** 1 km trip uses the same recipe. No separate minimum.
- **D-13:** Exact km × rate (12.3 stays 12.3), then **normal round to the rappen**. Not Swiss 5-rappen.
- **D-14:** Km bands are a **separate table per class**. Band amount = CHF per km in that slice, **on top of** class per-km. Open last band allowed. From inclusive, To exclusive, except open last. No bands → start + (km × per-km) only. Overlap: warn on confirm, still Publish, **higher CHF per km** wins.
- **D-15:** Region % of **start + km + bands**, before extras/VAT. Two matching zones: highest percent wins (warn, still Publish). Match when pin is **inside the Mapbox zone**.
- **D-16:** VAT is percent of fare + extras. **Coupon before VAT.** Payable floors at `CHF 0.00`. VAT waits for Publish (D-03).
- **D-17:** Matching fixed route **wins** over km engine. Match = same Mapbox place; same airport counts. A→B and B→A are separate. Save without Mapbox From/To blocked. Empty class on a route = that class not offered. Extra stop **switches to distance recipe**.
- **D-18:** Charge always CHF. No EUR/USD columns. Mails CHF only. Header FX converts public quote display only.
- **D-19:** Admin can **add and remove as many classes** as they want. Hidden from public (listed, Select off, `CHF 000`) while **ops can still assign**. Over max pax → not offered on public quote.

**Unpaid after Publish**
- **D-20:** New quotes use new book immediately. Locked checkout keeps locked amount until expiry or start over. Quote lock length is a field on this page, in **hours**.
- **D-21:** Home class cards with no Select yet + Publish → Select refused; quote again.
- **D-22:** Unpaid booking, emailed pay-link, and open Stripe session keep old amount until lock expires, then **whole unpaid trip auto-cancels**. Rebook from home.
- **D-23:** Pay before expiry → charge locked old amount; voucher is that snapshot. Stripe webhook after expiry → **do not capture**.
- **D-24:** Each Publish sends branded **price-changed** mail (booking language, **old locked amount only**, button to unpaid/pay page). Skip if already paid. On expiry: branded **expired** mail, button to home booking box. **Owner supplies English later. Do not invent copy.**
- **D-25:** Ops board/detail show unpaid at old locked amount until expiry. Dispatcher cannot take a different CHF. Manual phone booking uses **last published book**, or cannot book until first Publish. Never the draft.
- **D-26:** Any Stripe method at the locked amount until expiry.

**This page UI** — also `18-UI-SPEC.md`
- **D-27:** New layout from scratch, `--vt-*` only. Desktop, tablet, mobile required.
- **D-28:** Left tabs: **Fixed routes · Distance rules · Surcharges & extras · Coupons · History**. Old `#coupons` / `/coupons` page **gone**. Add/hide/remove class on Distance rules.
- **D-29:** VAT % on sticky rail. Discard draft + Publish in header. Preview in rail under VAT (draft). Recap: start, km, bands, region %, extras, VAT, total. Empty class = `CHF 000` not selectable. Preview may create test unpaid (D-33). Preview never charges Stripe.
- **D-30:** Surcharges pane: (1) **rules** admin adds (night, weekend, holiday, waiting unit, quote-lock hours, free-wait hours, max extra stops, service area); (2) **surcharge rows** that pick a rule. Every From/To/zone/service-area field is Mapbox. Timezone Europe/Zurich is product law, not a field.
- **D-31:** Drop charcoal “every figure is a placeholder” note. English first, de/fr/ar same sitting. Arabic RTL. Phone: same controls, rail scrolls, tables swipe.
- **D-32:** Publish confirm is a **dialog on this page**, not a route.

**Test unpaid / coupons / extras**
- **D-33:** Admin on this page only. Unpaid only — **no Stripe session**. Typed contact email. **No mails**. Ops board **marked test**. Pay off on public `/bookings`. Uses **draft**. Dies on same lock expiry.
- **D-34:** Coupons: percent off **or** fixed CHF, dates/cap, all classes, one per booking, coupon before VAT. New coupon unusable on public until Publish. Code case-insensitive, trim. Existing unpaid lock keeps coupon + old amount. Floor `CHF 0.00`.
- **D-35:** After Publish, checkout extras list is **built from this page’s surcharge rows**. Delete + Publish → extra **disappears** (not a CHF 0 chip).
- **D-36:** Rule is automatic (night/weekend/holiday/waiting — never a chip; scheduled pickup Zurich) **or** checkout extra chip. New extras must appear on checkout after Publish. Name English here; translate same sitting. Icon from existing Icon set.
- **D-37:** Extra stop is **not** a fixed amount. Mapbox on `/checkout/details`, live re-run of distance recipe. Max extra stops is a field here. Child seat / oversized / pet: amount × quantity. Ski with amount = paid extra.
- **D-38:** Meet & greet and free airport wait are two cards, both auto-on, each can turn off. Free wait **airport pickup only**. Extra waiting after free wait: **CHF 0 at pay**. Ops marks arrival, then extra uses this page’s unit/amount. Owner wants extra taken automatically from saved payment without confirmation — **SCA / off-session is a plan gate**.
- **D-39:** Service area Mapbox on this page. Quote only when **pickup and dropoff are both inside**.
- **D-40:** First public CHF is owner Publish on the **live page now**. This editor does not block that. Until this editor ships, current Pricing page is still the fare book. No `.eu`. Stripe live keys stay owner-gated.

### Claude's Discretion

- Open last km band allowed.
- Band From inclusive, To exclusive except open last.
- Overlapping region %: highest wins, warn, still Publish.
- Meet & greet turned back on: free wait applies again, recap live.
- Arabic RTL.
- Add / hide / remove class on Distance rules pane.
- History details = overlay/page with full change list.
- Extra wait clock starts when ops marks arrival.
- Preview recap line order as D-29.
- New class required fields: name, start, per-km, max pax.

### Deferred Ideas (OUT OF SCOPE)

- Redesign home / checkout / confirmation **layout** (those pages only take **numbers** from this book).
- Live Stripe keys.
- `vamostaxi.eu`.
- Google Search Console sitemap submit.
- JSON-LD.
- Practice restore onto `yaumjzvylngfjhtuffqs`.
- Mail English copy (owner will supply).
- Extra-wait off-session charge without customer confirmation — legal/Stripe sub-gate; do not ship a silent debit without that gate.
</user_constraints>

<architectural_responsibility_map>
## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pricing page layout / tabs / preview / dialogs | Browser/Client (`app/ops/OpsPricing.dc.html`) | CDN/Static (Worker serves `public/app/ops/`) | DC ops is the product. Dual-DC sync. |
| Draft writes (route/class/band/region/rule/surcharge/coupon) | API/Backend (`/api/staff/rate-book`, coupons, settings) | Database/Storage (draft `rate_versions` + children) | Overlay Save = draft only (D-01). |
| Publish all-or-nothing | API/Backend `POST …/rate-versions/:id/publish` | Database trigger + `settings.public_chf` / `vat_rate_bps` | One `asStaff` tx. Completeness 409 before write. |
| Quote / class board / Select | API/Backend `asQuote` on `HYPERDRIVE_NOCACHE` | Browser (home DC) | Next quote after Publish, no ~75s cache lag. |
| Checkout extras + extra-stop reprice | API/Backend checkout + `priceQuote` | Browser `/checkout/details` | D-35/D-37; layout of checkout is **out**. |
| Stripe charge amount | API/Backend intent + snapshot | Stripe | Locked snapshot CHF. Never draft. Never client price. |
| Price-changed / expired mail | API/Backend Resend | — | Copy TBC. Do not invent English. |
| History tab | Database `rate_versions` live/retired + publish metadata | Browser History pane | D-09; no delete. |
| Test unpaid | API/Backend booking insert unpaid, no Stripe | Ops board flag | D-33. |
</architectural_responsibility_map>

<research_summary>
## Summary

Phase 18 does not add a library. It **rebuilds** `https://dashboard.vamostaxi.site/pricing` as the only fare book and **replaces** the quote distance recipe.

Today the Worker already has: DC `OpsPricing.dc.html` (routes / distance / surcharges, charcoal placeholder note, Publish in header, VAT on rail), staff dual-mount APIs (`rate-book`, `rate-versions/:id/publish`, `settings` PATCH, `coupons`, `vehicle-classes` PATCH capacities only), `forkLiveRateVersion` clone, publish that sets `rate_versions.status='live'` **and** `settings.public_chf=true` in one `asStaff` tx, quote via `asQuote` → `quote_rate_book` on `HYPERDRIVE_NOCACHE`, integer kernel in `apps/web/lib/pricing/`.

The kernel **does not** implement D-11. `lines.ts` either: (a) if `distance_bands` exist → `min_fare + blendedExtra` after a **20 km floor** (`DISTANCE_FLOOR_KM` in `bands.ts`), or (b) `base + perKm(distance) + min_fare floor`. Bands are **version-scoped**, not per class (`DistanceBandRow` has `rate_version_id` only). Completeness still requires `min_fare_rappen`. Vehicle classes are a **closed union** `economy|business|first|van`. Coupons are a **separate** `/coupons` page (`OpsSidebar` href `/coupons`) and are **not** versioned with the rate book. VAT `PATCH /api/staff/settings` applies **immediately**. `rate-book` `moneyFromRappen` still emits empty EUR/USD/AED keys.

**Primary recommendation:** Keep DC + existing staff APIs + `asQuote` nocache + `roundHalfUp` rappen. Change three things together in one phase: (1) new `OpsPricing` layout per UI-SPEC, (2) kernel D-11/D-14 (drop 20 km floor and min-fare; bands per class on top of all-km per-km), (3) Publish is the only write that can change public quote, VAT, coupons, extras list, and class visibility — draft clone after success. Do not add shadcn or npm packages.
</research_summary>

<standard_stack>
## Standard Stack

Already in the repo. Do **not** `pnpm add`.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| DC ops + `--vt-*` | bound `VamosTaxiDesignSystem_245af1` | Pricing UI | Product law. `CLAUDE.md`. UI-SPEC. |
| Next.js on Workers | next `15.5.25` + `@opennextjs/cloudflare` `1.20.2` | Worker `vamos` | Live `vamostaxi.site` / `dashboard.vamostaxi.site`. |
| postgres.js via Hyperdrive | existing `@/lib/db/identity` | `asStaff` / `asQuote` | Direct Postgres, never Supavisor `:6543`. Quote = `HYPERDRIVE_NOCACHE`. |
| Integer kernel | `apps/web/lib/pricing/round.ts` | Half-up to rappen | D-13 “normal round to rappen”. Metres in. No float. |
| Stripe | `stripe` `22.6.1` | Charge locked CHF | Test mode until owner. Snapshot at pay. |
| Resend | `6.24.0` | New booking / (later) price-changed | Copy TBC. |
| Mapbox | existing `/api/geo` | From/To, zones, service area, extra stop | D-17/D-30/D-37/D-39. Live Mapbox; no KV place cache. |
| next-intl / `vamos-i18n-dict.js` | next-intl `4.13.7` | en/de/fr/ar | Same sitting. Arabic RTL. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `OpsTable` / `Dialog` / `Button` / `Input` / `Icon` | DC | Tables, overlays, header actions | Every editor on this page. |
| `zod` `4.4.3` | request parse | Staff bodies | Keep; do not invent a second validator. |
| Vitest + Playwright | existing | Kernel + DC fingerprints | Completeness vs D-08, recipe vs D-11. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Rebuild DC `OpsPricing` | React `/ops/pricing` | **Rejected.** Ops is DC-only. |
| New band engine in SQL | Keep `priceQuote` / `lines.ts` in Worker | Kernel stays pure TS; SQL stays book + gates. |
| shadcn | Bound `--vt-*` | **Forbidden.** |
| Swiss 5-rappen | `roundHalfUp` to 1 rappen | D-13 forbids 5-rappen. |
| Versioned coupons table from scratch | Flag coupons with `rate_version_id` or `published_at` | Prefer attach coupon rows to the draft version so D-34 waits for Publish without a second source of truth. |

**Installation:** none. Existing workspace.
</standard_stack>

<architecture_patterns>
## Architecture Patterns

### System Architecture Diagram

```
Admin on /pricing
  → overlay Save ──PUT/DELETE──► draft rate_versions (+ children)
  → VAT / coupons / classes in draft ──no public read──► ignored by asQuote
  → Preview (draft book only) ──optional──► test unpaid (no Stripe, no mail)
  → Publish dialog
       → completeness gaps? ──409 exact list──► stay on draft
       → asStaff tx:
            retire previous live
            set this version live
            public_chf = true (first flip; later Publish keeps true)
            vat_rate_bps from draft
            clone new draft from live (D-06)
       → success: next asQuote (HYPERDRIVE_NOCACHE) reads new book
            home quote / checkout extras / ops amounts / Stripe snapshot / new booking mail
       → locked unpaid: keep snapshot until lock hours expire
            pay → capture snapshot
            expire → auto-cancel + expired mail (copy TBC)
            Publish → price-changed mail old amount only (copy TBC)
```

Public visitor never reads draft. Dispatcher never opens `/pricing`.

### Recommended Project Structure

```
app/ops/OpsPricing.dc.html          # new layout (source)
app/ops/OpsSidebar.dc.html          # drop /coupons
app/ops/OpsCoupons.dc.html          # stop serving as a page; reuse table inside pricing tab or delete
app/vamos-ops-data.js               # collections + publish + preview
apps/web/lib/pricing/lines.ts       # D-11 recipe (replace 20 km / min_fare branch)
apps/web/lib/pricing/bands.ts       # per-class bands on top of all km; drop DISTANCE_FLOOR_KM
apps/web/lib/pricing/types.ts       # VehicleClassSlug open; DistanceBandRow.vehicle_class_id
apps/web/lib/ops/rate-book.ts       # kinds: route, distance, band, region, surcharge, rule; no EUR keys
apps/web/lib/ops/pricing.ts         # completeness = D-08 (drop min_fare)
apps/web/app/.../rate-versions/[id]/publish/route.ts  # keep public_chf; add VAT + clone + all-or-nothing
apps/web/app/.../settings/route.ts  # stop applying vat_rate_bps without Publish
packages/db/supabase/migrations/    # bands per class; class insert; coupon/version; history
```

### Pattern 1: Draft vs live book (already started)

**What:** `forkLiveRateVersion` copies distance_rates, fixed_routes, surcharges, distance_bands, region_premiums into a new `draft`.
**When to use:** After Publish (D-06) and when admin edits while live exists.
**Gap:** Does not clone coupons, VAT, quote-lock hours, service area, class hide flags, or per-class bands. Extend the clone, do not add a second fork.

```typescript
// Source: apps/web/lib/ops/rate-book.ts forkLiveRateVersion
await tx`insert into public.distance_rates (...)
  select ${newId}, vehicle_class_id, base_fare_rappen, per_km_rappen,
         min_fare_rappen, max_pax, available
    from public.distance_rates where rate_version_id = ${live.id}`;
```

### Pattern 2: Publish in one `asStaff` transaction

**What:** Completeness first (409 + `gaps[]`). Then status live + `public_chf=true`.
**When to use:** Only the header **Publish fare book** confirm.

```typescript
// Source: apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts
await asStaff(env, claims, async (tx) => {
  await tx`update public.rate_versions set status = 'live' where id = ${id}`;
  await tx`update public.settings set public_chf = true where id = 1`;
  return null;
});
```

**Gap vs D-02/D-03/D-06:** Must also apply draft VAT, refuse if quote/checkout/Stripe/ops/new-mail would disagree, clone new draft, write history row. Do not split across requests.

### Pattern 3: Quote never uses cached Hyperdrive

**What:** `loadQuoteRateBook` → `asQuote` → `quote_rate_book` on `HYPERDRIVE_NOCACHE`. `pricing_live` is engine live **AND** `public_chf`.
**When to use:** Every public quote after Publish.

```typescript
// Source: apps/web/lib/db/quote.ts
const result = await asQuote(env, async (tx) => {
  const rows = await tx`select public.quote_rate_book(${opts.preferDraft}) as result`;
```

Preview on `/pricing` is the **only** reader of draft (D-05). Do not set `preferDraft` on public quote.

### Anti-Patterns to Avoid

- **20 km floor + min_fare as the distance recipe:** contradicts D-11/D-12. Delete `DISTANCE_FLOOR_KM` from the live path.
- **Instant VAT PATCH:** contradicts D-03. Rail input is draft until Publish.
- **Hardcoded four `CLASS_KEYS` / `VehicleClassSlug` union:** contradicts D-19.
- **`moneyFromRappen` EUR/USD/AED keys on this page:** contradicts D-18.
- **Keeping `/coupons` in `OpsSidebar`:** contradicts D-28.
- **Publishing while `min_fare_rappen` is still a completeness column:** D-08 dropped that field.
- **Inventing price-changed mail English:** D-24 / deferred.
- **Silent extra-wait off-session debit:** D-38 deferred gate.
- **React twin of Pricing:** rejected 2026-09-01; still rejected.
</architecture_patterns>

<dont_hand_roll>
## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fare arithmetic | Float CHF / 5-rappen | `roundHalfUp` / `perKm` in `round.ts` | Integer rappen, metres in. D-13. |
| Geocoding | Custom gazetteer | Existing Mapbox suggest/retrieve | D-17/D-39. Terms bar KV place cache. |
| Charge | Client amount / new Stripe product | Existing Checkout intent + snapshot | Locked CHF. Test keys. |
| Tables / overlays | New grid CSS | `OpsTable` + `Dialog` | Ops chrome. UI-SPEC. |
| i18n | Concatenation | dict keys + ICU, four locales same sitting | CLAUDE.md. |
| Publish checklist | Ad-hoc JS only | `loadCompleteness` **kept in lockstep** with DB trigger | Comment in `pricing.ts`: checklist ≠ gate is the known failure. |
| History | Delete/update live rows | Append `rate_versions` live→retired + metadata | D-09; live book is frozen (existing `pricing_frozen` tests). |
| Preview money | Second engine | Same `priceQuote` with draft book | One recipe. |

**Key insight:** The missing work is **wiring and recipe**, not a new platform. Every new path that bypasses `priceQuote` or `asQuote` will drift from Stripe.
</dont_hand_roll>

<common_pitfalls>
## Common Pitfalls

### Pitfall 1: Completeness still requires `min_fare_rappen`

**What goes wrong:** Publish 409 forever after the UI drops first-X-km, or the kernel still applies a hidden floor.
**Why it happens:** `loadCompleteness` and `tg_rate_version_transition` both require `base`, `per_km`, **and** `min_fare` on available distance rates.
**How to avoid:** Change SQL trigger + `pricing.ts` + `lines.ts` in the same plan. Gaps become D-08 only (name, start, per-km, max pax + empty added rows).
**Warning signs:** Tests in `packages/db/supabase/tests/rate_version_publish.test.sql` still set `min_fare_rappen`.

### Pitfall 2: Bands are version-global; CONTEXT wants per class

**What goes wrong:** Economy and First share one band table; overlap rules cannot be per class.
**Why it happens:** `distance_bands (rate_version_id, from_km, to_km, per_km_rappen)` — no `vehicle_class_id`. `bands.ts` walks that list for every class.
**How to avoid:** Additive column `vehicle_class_id` (or child table). `forkLiveRateVersion` copies it. Kernel filters by class. Inclusive/exclusive bounds per D-14 — today’s comment on `DistanceBandRow` says the **opposite** (from exclusive, to inclusive).
**Warning signs:** `bands.test.ts` fixtures have no class id.

### Pitfall 3: VAT and coupons go live without Publish

**What goes wrong:** Admin types VAT; public payable changes; coupon on `/coupons` is usable immediately.
**Why it happens:** `PATCH /api/staff/settings` writes `vat_rate_bps` now. Coupons API is not tied to `rate_version_id`.
**How to avoid:** Draft fields on the version (or sidecar draft JSON) applied only in the Publish tx. Delete sidebar `/coupons`.
**Warning signs:** Network tab shows `PATCH /api/staff/settings` on VAT blur.

### Pitfall 4: Closed class union vs add/remove class

**What goes wrong:** Add class saves in OpsTable then quote engine TypeScript drops unknown slugs.
**Why it happens:** `VehicleClassSlug = "economy" | "business" | "first" | "van"`; `rate-book/route.ts` `CLASS_KEYS`; vehicle-classes API is GET+PATCH capacities, **no POST**.
**How to avoid:** Open slug (constrained format), POST class on draft, hide flag for public vs ops assign (D-19).
**Warning signs:** Quote 500 / empty board after Add class.

### Pitfall 5: Quote lock still minutes; CONTEXT wants hours on this page

**What goes wrong:** Field labelled hours, stored as minutes, unpaid cancel fires 60× early.
**Why it happens:** `settings_versions.quote_lock_minutes` + `quote_lock_deadline()`.
**How to avoid:** Store minutes internally if you must; UI is hours (D-20). Convert once at the staff boundary. Unpaid auto-cancel (D-22) must use the **locked** deadline, not the new book’s hours.
**Warning signs:** Preview lock and unpaid cancel disagree.

### Pitfall 6: Extra-wait automatic capture

**What goes wrong:** Off-session debit without SCA → Stripe decline or illegal charge.
**Why it happens:** D-38 owner want vs Stripe/legal deferred gate.
**How to avoid:** Plan a named gate. Until then: amount `CHF 0` at pay, ops clock, **no** silent capture.
**Warning signs:** Intent includes waiting CHF before arrival.

### Pitfall 7: `public_chf` vs hosted id 5

**What goes wrong:** Engineer treats live `rate_versions` id 5 as public CHF.
**Why it happens:** A live row is not the flip (`docs/runbooks/quote-publish.md`). `pricing_live` HTTP is `derivePricingLive && public_chf`.
**How to avoid:** Do not set `public_chf` from a migration or from this phase’s deploy. Owner Publish on the live page remains the first CHF (D-40).
**Warning signs:** Public quote paints numbers while dashboard Publish never happened.
</common_pitfalls>

<code_examples>
## Code Examples

Verified from this repo (not Context7).

### Current distance recipe (to replace)

```typescript
// Source: apps/web/lib/pricing/bands.ts + lines.ts
export const DISTANCE_FLOOR_KM = 20;
// If bands.length > 0:
amount = minFare === null ? null : blendedFareRappen(distance_m, minFare, bands);
// Else:
raw = base + perKm(perKmR, distance_m);
if (minFare !== null && amount < minFare) amount = minFare;
```

**Replace with D-11:** `start + perKm(per_km, all_metres) + per-class band extras`. No floor. 1 km same recipe (D-12). Band CHF is **on top of** class per-km (D-14).

### Rappen rounding (keep)

```typescript
// Source: apps/web/lib/pricing/round.ts
export function perKm(perKmRappen: number, distanceMetres: number): number {
  return roundHalfUp(perKmRappen * distanceMetres, 1_000);
}
```

12.3 km at 250 rappen/km → `roundHalfUp(250 * 12300, 1000)` — exact metres, not 2-dp km. Matches D-13.

### Completeness today (must change)

```typescript
// Source: apps/web/lib/ops/pricing.ts
and (r.base_fare_rappen is null or r.per_km_rappen is null or r.min_fare_rappen is null)
```

D-08: drop `min_fare`. Require name/start/per-km/max pax. Empty added rows. Bands optional.

### Public CHF AND

```typescript
// Source: apps/web/lib/pricing/public-chf.test.ts (contract)
// engine HTTP pricing_live = derivePricingLive && flags.public_chf
```

### Dual-mount staff routes (keep)

```typescript
// Source: apps/web/app/api/staff/rate-book/route.ts
export { GET, PUT, DELETE } from "../../../[locale]/(ops)/api/staff/rate-book/route";
```

Dashboard origin has no locale prefix. Keep both mounts when adding band/class/history.
</code_examples>

<sota_updates>
## State of the Art (this repo, 2026-09-13)

| Old (live now) | This phase | When | Impact |
|----------------|------------|------|--------|
| 20 km min-fare lump + version bands | start + all-km per-km + per-class bands on top | Phase 18 | Rewrite `lines.ts` / `bands.ts`; 04.3 plan abandoned |
| Four closed class slugs | Admin add/hide/remove | D-19 | Open types + POST class |
| VAT PATCH instant | VAT on Publish | D-03 | Stop settings write on blur |
| Coupons page `/coupons` | Coupons tab on `/pricing` | D-28 D-34 | Sidebar delete; version with draft |
| Completeness needs min_fare | Completeness = D-08 | D-08 D-11 | Trigger + `loadCompleteness` |
| Bands from exclusive / to inclusive (type comment) | From inclusive / To exclusive | D-14 | Flip kernel + tests |
| Charcoal placeholder note | Drop; real editor | D-31 | UI-SPEC |
| Quote lock minutes on settings_versions | Hours field on this page | D-20 | Convert at boundary |

**Deprecated/outdated for this phase:**
- `DISTANCE_FLOOR_KM` on the live quote path
- First-X-km / min-fare field on the page
- `OpsSidebar` Coupons item
- `moneyFromRappen` multi-currency object on Pricing
- Executing `.planning/phases/04.3-blended-distance-bands/04.3-01-PLAN.md` as a separate phase
</sota_updates>

<open_questions>
## Open Questions

1. **Extra-wait off-session capture (D-38)**
   - What we know: owner wants automatic debit after ops marks arrival; payable waiting is CHF 0 at pay.
   - What's unclear: SCA / off-session Stripe + legal copy.
   - Recommendation: named plan gate. Do not ship silent capture. Do not invent legal text.

2. **Price-changed / expired mail English (D-24)**
   - What we know: branded, booking language, old locked amount only, buttons specified.
   - What's unclear: exact English (owner later).
   - Recommendation: wire Resend with TBC / skip-send until copy exists. Do not invent.

3. **Where draft VAT / lock-hours / service area live**
   - What we know: today VAT is `settings.vat_rate_bps`; lock is `settings_versions.quote_lock_minutes`; service area is `settings_versions.service_area_geojson`.
   - What's unclear: column vs jsonb on the draft `rate_versions` row.
   - Recommendation: planner picks one host **on the version** so Publish is one tx. Do not keep instant settings PATCH for those fields.

4. **Global `vehicle_classes` vs versioned classes**
   - What we know: classes are a global table; distance_rates reference them; quote slug union is closed.
   - What's unclear: deleting a class that old snapshots named.
   - Recommendation: never delete a class row used by a snapshot; hide on draft; retire slug after Publish if unused. Snapshots stay append-only.

5. **First owner Publish vs this editor (D-40)**
   - What we know: first public CHF is the **current** page’s Publish; this phase must not block it.
   - What's unclear: if owner Publishes on the old page mid-build.
   - Recommendation: do not change `public_chf` from deploys. New editor still uses Publish as the only public flip after it ships.
</open_questions>

<validation_architecture>
## Validation Architecture

Existing Vitest in `apps/web` (`lib/**/*.test.ts`). Do **not** point `<automated>` at `tests/integration/*.spec.ts` — vitest excludes those and `passWithNoTests: true` fakes green. Playwright DC fingerprints stay for UI after the DC rebuild.

| Requirement | Test type | File / command |
|-------------|---------|----------------|
| D-11 D-12 D-13 D-14 | unit | `pnpm --filter web exec vitest run lib/pricing/lines.test.ts lib/pricing/bands.test.ts lib/pricing/round.ts` |
| D-08 completeness | unit | `pnpm --filter web exec vitest run lib/ops/pricing.ts` (extend completeness tests; no `min_fare`) |
| D-01 D-02 D-03 D-06 | unit | publish route + `public_chf` + VAT applied only in publish tx |
| D-18 | source-read | no EUR/USD keys on Pricing; `CHF 000` / `CHF 00.00` |
| D-28 D-31 | source-read | `readFileSync` `app/ops/OpsPricing.dc.html` + public copy; no `/coupons` in sidebar; no charcoal placeholder |
| D-35 D-37 | unit | extras list from surcharge rows; extra stop re-runs distance recipe |
| D-22 D-23 | unit | unpaid cancel on lock; webhook after expiry does not capture |
| D-38 | unit + gate | extra wait `CHF 0` at pay; **no** silent off-session capture |
| Schema | file exists | git migration; **owner apply** — agent does not `supabase db push` |

Wave 0: kernel fixtures without `DISTANCE_FLOOR_KM` / `min_fare` as the recipe; completeness without min_fare; OpsPricing source-read for five tabs + Publish fare book.
</validation_architecture>

<sources>
## Sources

### Primary (HIGH confidence)

- `.planning/phases/18-ops-pricing-source/18-CONTEXT.md` — locked D-01…D-40
- `app/ops/OpsPricing.dc.html` — current DC
- `app/ops/OpsSidebar.dc.html` — `/coupons` nav
- `apps/web/lib/pricing/lines.ts`, `bands.ts`, `round.ts`, `types.ts`
- `apps/web/lib/ops/rate-book.ts` (`forkLiveRateVersion`)
- `apps/web/lib/ops/pricing.ts` (`loadCompleteness`)
- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts`
- `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` (`CLASS_KEYS`, `moneyFromRappen`)
- `apps/web/app/[locale]/(ops)/api/staff/settings/route.ts` (instant VAT)
- `apps/web/app/[locale]/(ops)/api/staff/vehicle-classes/route.ts` (no POST)
- `apps/web/lib/db/quote.ts` (`asQuote` / `quote_rate_book`)
- `apps/web/lib/checkout/vat.ts` (`CH_VAT_RATE_BPS = 81`)
- `docs/runbooks/quote-publish.md`
- `CLAUDE.md` — `--vt-*`, no glow, no tinted yellow
- `apps/web/package.json` — versions above
- Hosted: `rate_versions` id 5 live; `public_chf` false until owner Publish (STATE.md / 11-11 SUMMARY)

### Secondary (MEDIUM confidence)

- `packages/db/supabase/tests/rate_version_publish.test.sql` — min_fare still in publish path
- `apps/web/lib/pricing/bands.test.ts` — version-global band fixtures
- `04.3-01-PLAN.md` — unexecuted; superseded

### Tertiary (LOW confidence - needs validation)

- Extra-wait SCA feasibility — Stripe docs not re-fetched this sitting; treat as plan gate not as a chosen API.
</sources>

<metadata>
## Metadata

**Research scope:**
- Core technology: DC ops Pricing + integer quote kernel + Hyperdrive staff publish
- Ecosystem: existing Next/OpenNext/Stripe/Resend/Mapbox — no new packages
- Patterns: draft/live book, nocache quote, completeness lockstep with DB
- Pitfalls: min_fare, 20 km floor, instant VAT, closed class union, coupons page, SCA

**Confidence breakdown:**
- Standard stack: HIGH — versions from `apps/web/package.json`; no new deps
- Architecture: HIGH — read live routes and kernel this sitting
- Pitfalls: HIGH — mismatches vs CONTEXT are file:line above
- Code examples: HIGH — copied from repo sources

**Research date:** 2026-09-13
**Valid until:** 2026-10-13 (or next Publish schema change)

**Claim provenance:** File paths above are `[VERIFIED: codebase]`. Hosted id 5 / `public_chf` false from STATE + 11-11 SUMMARY `[CITED: .planning]`. Stripe SCA for extra-wait `[ASSUMED]` — plan gate.
</metadata>

---

*Phase: 18-ops-pricing-source*
*Research completed: 2026-09-13*
*Ready for planning: after UI-SPEC checker approval*
