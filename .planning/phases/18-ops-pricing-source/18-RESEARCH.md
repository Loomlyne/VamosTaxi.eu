# Phase 18: OPS Pricing source of truth — Research (RESTART)

**Researched:** 2026-09-14 restart
**Domain:** Live-book public quote + `/pricing` draft/Publish editor + integer fare kernel
**Confidence:** HIGH on in-repo identifiers (this sitting); MEDIUM on hosted live-book contents (not SELECTed); MEDIUM on Mapbox canton context shape (no canton matcher exists yet)
**Canonical:** `.planning/phases/18-ops-pricing-source/18-CONTEXT.md` (Restarted 2026-09-14, D-01…D-35). Supersedes 2026-09-13 D-01…D-40. Do not execute `archive-2026-09-13/`. `18-PATTERNS.md` and `18-UI-SPEC.md` were rewritten 2026-09-14 to match this CONTEXT (four tabs, VAT-only rail, no History/Preview/region). **CONTEXT wins** if a later discuss changes a D-number.

Owner UAT 2026-09-14: after delete + Publish, the public site still invented a four-class ladder (Economy still painted). Phase 18 is not complete. Replan from wave 1. Keep the shipping kernel (publish tx, D-15 money, `/pricing` editor). Kill every hardcoded Economy / Business / First / Van public board.

Dead unless CONTEXT still has it: History, Preview, test unpaid from this page, region %, night/weekend/holiday extras, quote-lock hours field, clone-draft-immediately-after-Publish, four-class public ladder. **Hide-from-public (D-32) still lives.**

## User Constraints (from CONTEXT.md)

**CRITICAL:** Locked. Planner and executor honour these. Full text: `.planning/phases/18-ops-pricing-source/18-CONTEXT.md`.

Does not steal Phase 11. Do not bind `vamostaxi.eu`. Stripe stays test until the owner says live keys. Agent does not click Publish. Agent does not `supabase db push`. Schema SQL `20260913180000_ops_pricing_source.sql` is **already applied** — new SQL is an owner-apply numbered gate if needed, never agent `db push`. Never restore onto `yaumjzvylngfjhtuffqs`. No `sk_live_`. Never invent CHF.

### Locked Decisions

**Draft / Publish**

- **D-01:** Anything on `/pricing` (every tab, VAT rail, overlays) stays **draft** until Publish. No exceptions.
- **D-02:** Typing is not a draft. Leave without Save → those edits are gone. **Save** creates the draft. **Publish** puts that draft on the public site.
- **D-03:** After Publish, `/pricing` shows the **live book** (what customers see). The next Save starts a new draft.
- **D-04:** One draft for the **whole fare book**. One Publish flips every tab saved since the last Publish.
- **D-05:** A saved draft has a **clear Draft mark** — these numbers are not public until Publish.
- **D-06:** Discard: **confirm**, then draft gone, page shows live book. Public never moved.
- **D-07:** Publish opens a **confirm dialog with the change list** vs the last published book.
- **D-08:** Gaps and conflicts: dialog names the **exact** problem and a **button jumps to that section/overlay**. Failed Publish **keeps the draft**. Public unchanged. Fix and Publish again, or Discard and start from the live book.
- **D-09:** Publish is **all-or-nothing**. If quote, checkout, Stripe, ops, or new mail would disagree, nothing goes live.
- **D-10:** Publish stays blocked until every required class field is filled (see D-30). Dialog lists exact gaps.
- **D-11:** **No History tab.** No history list, no Re-Publish of an old book. Tabs: **Fixed routes · Distance rules · Surcharges & extras · Coupons**.
- **D-12:** **No Preview** on `/pricing`. No test unpaid from this page. VAT % stays on the sticky rail and still waits for Publish (D-01).
- **D-13:** Quote lock is **fixed 24 hours**, not a field. Unpaid keep the locked old amount until then, then the unpaid trip auto-cancels. They must quote again. Select on home cards with no Select yet + Publish → Select refused; quote again. Paid trips **keep the snapshot**; a later Publish does not change them.
- **D-14:** `/pricing` is **admin only**. One staff account type.

**Money recipe (public after Publish)**

Owner examples (illustration, **not** live fares): start **100** + **14.6 km × 12** = **CHF 275.20**; **12.3 km × 10** = **CHF 123** km money. Do not invent CHF.

- **D-15:** Distance class money is **start** (once per trip, not included km) **+ (all km × per-km) + bands on top**. A 1 km trip uses the same recipe. No minimum fare. No first-X-km floor.
- **D-16:** Per-km and start are typed on `/pricing`. Kilometres stay exact (14.6 stays 14.6). Cents are allowed (3.20, 275.20). Do **not** invent a separate “round to 0.01” product rule beyond keeping the real product of km × rate + start + bands.
- **D-17:** **No region %.** Delete it from the Distance tab, from calculation, and from recap.
- **D-18:** **Bands** are an optional table per class. Amount is **CHF per km in that slice, on top of class per-km**. No band rows → start + km only. From **inclusive**, To **exclusive**. Open last band (no To) allowed. **Overlap blocks Publish** until fixed.
- **D-19:** Price stack for a matching trip: always **able** to compute km. If a **fixed route matches** what they picked on the public booking flow, **that CHF dominates**. Else km + bands.
- **D-20:** Fixed routes live on the **Fixed routes** tab. Two kinds of row: (1) **Mapbox place → place** (exact From/To; airport terminal and saved airport pin count as the same airport; A→B and B→A are **separate** rows; Save requires both Mapbox places). (2) **Canton → canton**. Exact place match wins over canton→canton. If you add no matching fixed row, use Distance rules. Not adding canton rows does **not** block quotes.
- **D-21:** Extra stop: they add **one** Mapbox place (max extra stops **hardcoded 1**). Fare **re-runs** start + full new path km × per-km + bands. Not a fixed CHF per stop. Extra stop on a fixed-route trip **switches to the distance recipe**.
- **D-22:** Checkout extras (child seat, pet, ski, …): **amount × quantity**, after ride money, **before VAT**. Delete the extra and Publish → **gone** from checkout (not a CHF 0 chip).
- **D-23:** Meet & greet and free airport wait are **always on**; customer cannot turn them off. Meet & greet is **CHF 0 included** (recap may say included). Free wait hours is a field on `/pricing` (set to **1h** now). Extra wait **after** that is **per hour**, amount on `/pricing`. Extra wait is **not** in the Stripe pay-now amount. Ops marks arrival; then extra hours bill. Do not silent-debit the card from this phase.
- **D-24:** VAT % (rail) is percent of **(ride + extras − coupon)**. Coupon **before VAT**. One coupon per booking. Payable floors at **CHF 0.00**. Public VAT/coupon after Publish only. Coupon codes **case-insensitive**, trim spaces. Percent off or fixed CHF off, dates/cap, all classes.
- **D-25:** **No night extra. No weekend extra. No holiday extra.**
- **D-26:** Mapbox on the public flow shows **everything they type**, like Google Maps. **No canton tick-list fence.** No quote only when Mapbox cannot produce a real From and To. Canton is used for **fixed-route matching** (D-20), not to hide the map.
- **D-27:** After Publish this same math is used by: next home quote, checkout recap, confirmation, ops amounts, Stripe, new booking mail. Header EUR/USD is **display only**. Charge and receipts **CHF**.
- **D-28:** Checkout recap top to bottom: **start, km, bands, automatic wait if it applies, customer extras, VAT, total**. All CHF. No region. No night/weekend/holiday lines.

**Classes (public follows the live book)**

- **D-29:** Admin **adds, edits, deletes** any class. No hardcoded four-class ladder on home, checkout, or quote. A new class (any name) appears after Publish with the name they typed.
- **D-30:** Required to Publish a class: **photo, name, start, per-km, max passengers, max bags**. Photo: upload / replace / delete on any class. Stored on **R2**, not local. No photo → cannot Publish. Public card shows name, photo, seats, bags, price from this book.
- **D-31:** Delete a class + Publish → **gone** from home and checkout. Not a grey card, not `CHF 000`.
- **D-32:** **Hide from public** still exists: listed, Select off, `CHF 000`. Board can still assign it.
- **D-33:** Quote pax over max passengers → class **not offered**.

**Surcharges & extras tab (rebuild from scratch)**

- **D-34:** **One list.** Each row is a **type** + only that type’s configuration (+ amount if the type has money). Add/Edit dialog: pick type, fields for that type, a short “what this does”. Nothing extra in the dialog. Rules on this table are the source.
- **D-35:** Checkout extras are a **type in that same dialog** (name, CHF, icon). Ski is a checkout extra like pet. Extra wait / free-wait hours are configured here as that type’s fields (D-23). Quote lock is **not** a row (D-13). Night/weekend/holiday are **not** types (D-25).

### Claude's Discretion

- How Mapbox admin-area canton is read for canton→canton match when no exact place route exists.
- Band table UI on Distance rules (From / To / CHF per km).
- Draft mark visual: charcoal/yellow tokens only, no glow, no pale-yellow tint. Never `--vt-shadow-accent`. Never `--vt-yellow-50` / `-100` / `-600` / `-700`.
- Jump-to-gap button: switch tab + open the overlay for that row.
- Four-language copy same sitting; Arabic RTL.
- Dual DC: edit `app/` then `node scripts/sync-dc-mock-to-public.mjs`.
- First new wave: public home / checkout / quote are a **pure read of the live book**. Live UAT (owner Publishes): delete class → no card; change per-km → next quote matches the recipe; new class appears. Agent does not click Publish.
- `quote_rate_book` must not invent classes. SQL vs Worker filter is a plan choice; owner apply is a numbered gate if SQL changes.
- Extra-wait SCA / off-session Stripe: do not ship a silent debit.

### Deferred Ideas (OUT OF SCOPE)

- Redesign home / checkout / confirmation **layout** (numbers and which cards appear are this phase)
- Live Stripe keys (`sk_live_`)
- `vamostaxi.eu`
- Search Console / JSON-LD
- Invented mail copy (price-changed / expired: skip-send until owner English)
- Extra-wait automatic card debit without customer confirmation
- Return trips
- Practice restore onto `yaumjzvylngfjhtuffqs`

### Must-not (every wave)

- No `sk_live_`
- No `vamostaxi.eu`
- No restore onto `yaumjzvylngfjhtuffqs`
- No `supabase db push` (agent). New SQL = numbered owner-apply gate
- Agent does not Publish
- No inventing CHF, legal copy, or mail wording
- No push `main`; Worker `vamos` staging only until owner says
- No History, no Preview on `/pricing`, no test unpaid from this page, no region %

### Project Constraints (from CLAUDE.md)

- `--vt-*` only. Lucide via `Icon`. Amounts `CHF 000` / `CHF 00.00`. `--vt-shadow-accent:none`. `.vt-input--focus{box-shadow:none}`.
- Four languages same pass (`app/vamos-i18n-dict.js` en/de/fr/ar). Logical properties. Check Arabic.
- Dual DC: `app/ops/` is source; Worker serves `apps/web/public/app/ops/`. Do not strip injected `<base href="/app/ops/">`.
- `SiteHeader` / `SiteFooter` on public pages. Ops uses `OpsSidebar`.
- Lenis from `assets/lenis-boot.js`. Never a second Lenis.

## Summary

Phase 18 restart is not a library choice. The 2026-09-13 waves already shipped a draft/Publish kernel, D-15-style distance math, nocache `asQuote`, and a five-tab DC editor. Owner UAT then proved the **public site still invents a four-class ladder** after Publish. The planner’s job is to make **the live book the only source of which classes exist and what they cost**, then rebuild `/pricing` to the 2026-09-14 product (four tabs, no History/Preview, no region %, one surcharge list, photo-required classes, hardcoded 24 h lock).

Today three layers still **fork the product from the book**:

1. **SQL** `quote_rate_book` aggregates `from public.vehicle_classes as c` with **no join to the live version’s `distance_rates`**. Global class rows leak into the quote JSON even after a class is dropped from the book.
2. **Closed slug unions** on home (`VEHICLE_CLASSES`), checkout (`CLASS_SLUGS`), intent (`IntentVehicleClass`), rate-book (`KNOWN_CLASS_SLUGS`), OpsPricing (`CLASS_KEYS`), `vamos-ops-data.js`, and `vehicle_classes.slug CHECK (economy|business|first|van)`. A new class cannot INSERT; a deleted Economy still has a catalog photo and a card recipe.
3. **Publish immediately calls `forkLiveRateVersion`**, GET prefers a draft if one exists, and Discard forks again. After Publish, `/pricing` no longer shows the live book (D-03). Tests **assert** this fork.

The integer kernel (`lines.ts` / `bands.ts` / `round.ts`) already does start + all-km per-km + class bands on top. Extra-stop drops fixed routes. Extra wait is CHF 0 at pay. Keep that. Change the **read surface** first (home / checkout / quote / `quote_rate_book` classes array), then the **editor contract** (Save vs fork, four tabs, one surcharge list, R2 class photo, overlap blocks Publish).

**Primary recommendation:** Wave 1 = public surfaces are a pure read of the live book (no four-class ladder; owner UAT after owner Publish). Then stop forking a draft on Publish. Then rebuild OpsPricing tabs/surcharges/draft mark to D-01…D-35. Do not add npm packages. Do not execute the 2026-09-13 archive. New SQL only as an owner-apply numbered gate. Agent does not Publish. No `sk_live_`. No `.eu`. Never invent CHF.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `/pricing` editor (tabs, draft mark, Save, Discard, Publish dialog, jump-to-fix) | Browser/Client (`app/ops/OpsPricing.dc.html`) | CDN/Static (Worker serves `apps/web/public/app/ops/`) | Dual-DC. Ops is DC-only. |
| Overlay Save → draft book | API/Backend `PUT /api/staff/rate-book` | Database draft `rate_versions` + children | D-02: Save creates the draft. Typing is not a draft. |
| Publish all-or-nothing | API/Backend `POST …/rate-versions/:id/publish` | Database `asStaff` tx + `settings.public_chf` / `vat_rate_bps` | D-09. Completeness 409 before write. Failed Publish keeps draft. Agent does not click Publish. |
| After-Publish page = live book | API/Backend GET rate-book + publish tx | Database **no immediate fork** | D-03. Today `forkLiveRateVersion` after Publish hides live. |
| Public class board / Select | API/Backend `asQuote` → `quote_rate_book` on `HYPERDRIVE_NOCACHE` | Browser `app/home/home.dc.html` | Live book only. No four-class catalog. |
| Quote / checkout recap / Stripe | API/Backend `priceQuote` + snapshot at pay | Stripe **test** mode | Same math after Publish. Charge CHF. Paid trips keep snapshot. No `sk_live_`. |
| Class photos | API/Backend `POST /api/photos/upload` → R2 `PHOTOS` | Database `photo_path` on the class | Follow chauffeur pattern. Required to Publish (D-30). |
| Mapbox From/To + extra stop | API/Backend `/api/geo/suggest` + retrieve + Directions | Browser booking widget | Already worldwide suggest (no `country=CH`). Canton is matching only (D-20/D-26). |
| Checkout extras catalog | API/Backend live surcharge rows | Browser `/checkout/details` | D-22/D-34/D-35. Delete + Publish → gone. |
| Extra wait after free wait | Ops mark-arrival (`booking_legs.arrived_at`) | Display only until owner SCA gate | Not in Stripe pay-now (D-23). No silent debit. |

## Current codebase — file → now → gap vs new D-

### Draft / Publish (D-01…D-14)

| File | What it does now | Gap vs new D- |
|------|------------------|---------------|
| `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts` | Completeness 409, then `asStaff` tx: retire previous live, set this row live, `public_chf=true`, copy `vat_rate_bps`, INSERT `settings_versions`, **then `forkLiveRateVersion` in the same tx** (line 151). Header comment still says “D-06: clone a new draft after success.” | **D-03 forbids that fork.** After Publish the page must show the live book. Next Save starts the draft. Tests in `publish-public-chf.test.ts` **assert** the fork. |
| `apps/web/lib/ops/rate-book.ts` `forkLiveRateVersion` / `resolveWritableDraftId` | Overlay writes always fork live first when no draft exists. Staff analog of `quote_rate_book(true)` still returns the draft after a live row exists. | Keep fork **on Save** (D-02). Remove fork **on Publish** and **on Discard** (D-03, D-06). |
| `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` GET | `resolveVersionId`: if a draft exists, return it; else live. GET does **not** fork. | After Publish-with-fork, GET always hits the clone, so `/pricing` never shows live. After D-03, GET must prefer live when no saved draft exists. |
| Same file PUT | `resolveWritableVersionId` forks live on write. Accepts `kind` `route\|distance\|band\|region\|surcharge\|rule\|coupon`. Writes `quote_lock_minutes` from `quoteLockHours`. | D-02 Save-creates-draft is close. Drop `region` kind (D-17). Drop quote-lock hours write (D-13). |
| `app/ops/OpsPricing.dc.html` | Five tabs including **History**. Preview + **Create test unpaid** in the rail (`runPreview`, `createTestUnpaid`). VAT `setVatPercent` calls `ops.saveDraftVat` **on every change** (not overlay Save). Publish dialog lists gap **labels** only — **no jump-to-overlay button**. Band overlap / region % are **warnings you can still publish**. `CLASS_KEYS = ['economy','business','first','van']`. | D-11 drop History. D-12 drop Preview and test unpaid. D-02 VAT typing must not write. D-08 jump-to-gap. D-18 overlap **blocks** Publish. D-17 delete region table. |
| `app/vamos-ops-data.js` | `preview`, `createTestUnpaid`, `saveDraftVat` PUT `kind: "rule"` `ruleKind: "vat"`. `VEHICLE_CLASSES = ["Economy","Business","First","Van"]`. | D-12 drop preview/test-unpaid. D-01 VAT waits for Publish but Save still creates the draft — keystroke VAT violates D-02. |
| `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/discard/route.ts` | Confirm path exists. After delete, **`forkLiveRateVersion` from live** so a new draft appears immediately. | D-06: draft gone, **page shows live book**. Next Save starts the draft — do not clone on Discard. |
| `apps/web/lib/ops/pricing.ts` `loadCompleteness` | Gaps: distance (start/per-km/max pax/slug), surcharge amount/predicate, live fixed route price, coupon code/amount, empty rule payload, band class/per-km. **No photo. No max bags. No band overlap.** | D-10/D-30 photo + bags required. D-18 overlap is a Publish block, not a warn. |
| `packages/db/…/20260913180000_ops_pricing_source.sql` `tg_rate_version_transition` | Same as TS completeness minus coupon/rule/band extras. No photo. No overlap. | Keep trigger in lockstep with `loadCompleteness`. New columns = owner-apply gate. Never `db push`. |
| `apps/web/app/[locale]/(ops)/api/staff/settings/route.ts` PATCH | `vat_rate_bps: current.vat_rate_bps` — body cannot flip live VAT. | Aligns with D-01 public VAT. Rail must write **draft** `rate_versions.vat_rate_bps` only on Save, applied at Publish. |
| `apps/web/lib/quote/lock.ts` + `expire-unpaid.ts` | Lock length is published `quote_lock_minutes`. Expiry uses `quote_lock_expires_at`, not `created_at + 24h`. | D-13: **hardcode 24 hours**. Remove the hours field from `/pricing` and from Publish copy into `settings_versions`. |
| `apps/web/lib/ops/draft-preview.ts` + `rate-book/preview` + `test-unpaid` | Admin draft recap and test unpaid (no Stripe). Recap still has a **region** line. | D-12: delete from `/pricing`. Do not keep a Preview pane. |

### Money (D-15…D-28)

| File | What it does now | Gap vs new D- |
|------|------------------|---------------|
| `apps/web/lib/pricing/lines.ts` `buildFareLine` | Fixed route origin→dest for this class if live and **no extra stops**. Else `base + perKm(all metres) + classBandExtrasRappen`. `min_fare_rappen` is **not** a floor. Extra stops skip the fixed table. A→B and B→A are separate rows. | D-15/D-19/D-21 recipe is **already this**. Missing: canton→canton fallback; airport terminal ≡ airport pin. |
| `apps/web/lib/pricing/bands.ts` `classBandExtrasRappen` | Per-class `[from_km, to_km)` extras **on top of** class per-km. Open last (`to_km` null) allowed. **Overlapping slices take the higher `per_km_rappen`.** | Kernel math OK. D-18: overlap must **block Publish**, not “higher wins” at quote time. After Publish is clean, quote can assume no overlap. |
| `apps/web/lib/pricing/round.ts` `perKm` | `roundHalfUp(perKmRappen * distanceMetres, 1_000)`. Metres in. | **Can express owner fixtures without a new product-round rule.** `perKm(1200, 14600)` → 17520 rappen (CHF 175.20); + start 10000 = **CHF 275.20**. `perKm(1000, 12300)` → 12300 rappen (**CHF 123**). Tests today use other numbers (`12.3 km × 250 rappen`). Add the owner fixtures as tests; do not invent live fares. |
| `apps/web/lib/pricing/priceQuote.ts` | Per leg: fare, **`buildRegionPremiumLine`**, surcharges; then extras; coupon; assemble. | D-17: delete region line from calculation and recap. D-28 recap order: start, km, bands, automatic wait, customer extras, VAT, total — no region, no night/weekend/holiday. |
| `apps/web/lib/pricing/lines.ts` `buildRegionPremiumLine` | Highest matching zone % of the fare line. | Dead (D-17). Delete from kernel, recap, Distance tab, `region_premiums` writes. |
| `apps/web/lib/checkout/extras-catalog.ts` `publishedMaxExtraStops` | Cap comes from **`rate_versions.max_extra_stops`**. Missing → 0. | D-21: max extra stops **hardcoded 1**. Not a `/pricing` field. |
| `apps/web/lib/quote/pipeline.ts` `country_box` | After resolve, **both pins must `insideCountryBox`** or `place_out_of_box`. London/Tunis fail. Chamonix/Malpensa pass (box is wide). | D-26: Mapbox shows everything; quote only fails when From/To cannot be resolved. Canton is matching, not a fence. `country_box` is a **quote fence**, not a suggest filter. |
| `apps/web/lib/geo/mapbox.ts` `suggest` | Search Box worldwide. Comment: `country=` is a filter that dropped Dubai. **No `country=CH`.** Proximity is Zurich HB rank bias. | D-26 suggest path **already matches**. Do not add a CH fence. |
| `apps/web/lib/geo/serviceArea.ts` `insideCountryBox` | Bounding box used by the quote pipeline. | Keep the function if service-area polygon still needs geometry helpers; stop using it as a hard quote refuse unless CONTEXT is read as “polygon still allowed”. Canton tick-list does not exist. |
| Canton → canton match | **No code.** Grep of `apps/web` finds no `canton` / `admin_area` / `iso_3166_2` matcher. Fixed match is `origin_zone_id === dest_zone_id` on `fixed_routes`. | D-20 kind (2) is greenfield. Discretion: how Mapbox admin-area is read. Not adding canton rows must not block quotes. |
| Airport terminal ≡ saved airport pin | Zones are `service_zones` UUIDs. Quote `defaultResolvePlace` returns lng/lat/`place_id`; `origin_zone_id` is `ResolvedPlace.zoneId ?? null`. No “same airport” collapse. | D-20: terminal and saved airport pin count as the same airport. Plan: match on airport zone_type / IATA / Mapbox feature, not raw mapbox_id. |
| `apps/web/lib/checkout/vat.ts` | `vatOnTopRappen(net)` with injected bps; fallback 81. `payableWithVatRappen`. | Kernel-side coupon is **before** assemble (`policy.ts` `buildCouponLine` on pre-coupon total). Intent charges `payableWithVatRappen(netRappen + extraAdd)` where `netRappen` is the class total (coupon already inside if lock has it). **Aligns with D-24 on the Stripe path** if reprice includes coupon. |
| `apps/web/lib/checkout/confirmation-receipt.ts` `receiptPriceSplit` | Comment: “Class fare + extras, then VAT, **then coupon**.” Uses `vatIncludedRappen` on gross. | D-24 / D-28: coupon **before** VAT. Confirmation recap order is wrong. |
| `apps/web/lib/checkout/intent.ts` | “waiting extra is 0 at pay”. `extraFaresOn` / `extraRappenOutsideLock` drop waiting. No `off_session`. Charge currency CHF. | D-23 extra-wait-not-in-pay-now **already held**. Keep the grep gate. Do not add silent debit. |
| `apps/web/lib/checkout/extras-catalog.ts` meet/free wait | `meet_greet` and `free_wait` are **toggles**, `extraToggleDefaultOn` (explicit false turns off). Free wait only if `airportPickup === true`. | D-23: always on; customer **cannot** turn them off. Meet is CHF 0 included. |
| `apps/web/lib/ops/surcharge-codes.ts` | `AUTOMATIC_SURCHARGE_CODES` includes night/weekend/holiday. `isPassengerExtra` = not automatic. Ski normalises to `ski_rack`. | D-25: those kinds must not exist as types. D-35: ski is a checkout extra like pet (keep). New extras from the one list, not a closed chip union — `isPassengerExtra` already allows unknown non-automatic codes. |

### Public board (D-29…D-33)

| File | What it does now | Gap vs new D- |
|------|------------------|---------------|
| `app/home/home.dc.html` `VEHICLE_CLASSES` | Hardcoded Economy/Business/First/Van with `/photos/site/class-*.jpg`, caps 4/4/4/7. `classCatalog(slug)` falls back to this list. `fleetVals` maps `names[v.id]` for the four English names. Comment claims “which classes appear comes from `fleetOffer`” — **catalog still supplies photo/name/cap when the slug is known.** | D-29/D-30/D-31: cards = live book name, **R2 photo**, seats, bags, price. Unknown slug must not revive Economy. Delete + Publish → **gone**, not `classCatalog('economy')`. |
| `apps/web/components/home/BookingBoard.tsx` | `CLASS_NAMES: Record<VehicleClassSlug, string>` closed to four English names. `publicFleet` drops `ineligible_reason === "no_rate"` only. `VehicleClassSlug` is already `string` in `types.ts`. | D-29: name from the book, not `CLASS_NAMES`. Hide (D-32) stays listed Select-off `CHF 000`. Delete must not remain as a named card. |
| `apps/web/app/[locale]/checkout/CheckoutClassCards.tsx` | `CLASS_SLUGS = ["economy","business","first","van"]`. `CLASS_META` hardcoded images under `/assets/photography/class-*.jpg` and pax/bags. `offered.filter(id => CLASS_SLUGS.includes)` **drops any new class.** `firstFittingClass` falls back to `"business"`. | D-29/D-30: render offered slugs from the live book; photo from R2; capacities from the book. Do not invent a fallback class. |
| `apps/web/app/[locale]/checkout/CheckoutClient.tsx` | Same `CLASS_SLUGS`. `asClassSlug` maps unknown → **economy**. Default vehicle state `"economy"`. `classLabel` has four keys + `vehicleClassFallback`. | D-29: vehicle_class is the book slug. Intent body must accept any live slug. |
| `apps/web/app/[locale]/(ops)/api/staff/rate-book/route.ts` | `KNOWN_CLASS_SLUGS = ["economy","business","first","van"]`. GET hydrates route rows as **economy/business/first/van money columns**. Writes coerce unknown klass to `"economy"`. | D-29: routes are per-class rows, not four columns. A fifth class is invisible and coerced. |
| `app/vamos-ops-data.js` | `VEHICLE_CLASSES` four titles; unknown klass coerced to `"Economy"` on vehicles/bookings/rates. | D-29: list from the live/draft book. Ops board still assigns **hidden** classes (D-32). |
| `apps/web/lib/quote/intent.ts` | `IntentVehicleClass = "economy" \| "business" \| "first" \| "van"`. `IntentBody.vehicle_class` and `IntentRecomputeClass.slug` are that union. | D-29: open string = live slug. Closed union **rejects a new class at pay**. |
| `apps/web/lib/pricing/eligibility.ts` `classOnOffer` | On offer if a distance rate **or** a fixed route exists for the class id. Hide-from-public → listed `unavailable` (Select off). Pax over `LEAST(passenger_capacity, max_pax)` → `pax` (not offered). Delete with no rate and no fixed → filtered out of the board. | D-31/D-32/D-33 **kernel is close**. Public UI still paints the four-class catalog around it. `quote_rate_book` still **emits every `vehicle_classes` row**, so a leftover global Economy can reappear if a rate row remains. |
| `packages/db/…/20260913180000_ops_pricing_source.sql` `quote_rate_book` | `'classes', (select … from public.vehicle_classes as c)` — **all classes, no version join.** | D-29/D-31: must not invent classes. SQL vs Worker filter is plan choice; owner apply if SQL changes. Never `db push`. |
| `packages/db/…/20260823000005_fleet.sql` | `vehicle_classes.slug check (slug in ('economy','business','first','van'))`. **No `photo_path` on `vehicle_classes`.** Photo lives on `vehicles` and `chauffeurs`. | D-29 cannot INSERT a new slug until this CHECK is dropped (owner-apply). D-30 needs a class photo column + R2 prefix. |

### Classes photos (D-30)

| File | What it does now | Gap vs new D- |
|------|------------------|---------------|
| `apps/web/lib/ops/photos.ts` | `PHOTO_PREFIXES = vehicles/ chauffeurs/ reviews/ staff/ site/`. `PhotoKind` has no `class`. `buildPhotoKey(kind, recordId, mime)` → `<prefix><uuid>/<random>.<ext>`. Browser never holds R2 credentials. | Add a class prefix (discretion: `classes/`). Extend `isPhotoKind`. Keep sniff/size/MIME. |
| `apps/web/app/[locale]/(ops)/api/photos/upload/route.ts` | Staff POST multipart `{ kind, recordId, file }` → `env.PHOTOS.put` → `{ key }`. **Writes no DB column.** Owner screen PATCHes the key via `asStaff`. | Same split for class photos: upload returns key; class Save stores `photo_path` on the draft. |
| `app/ops/OpsTable.dc.html` photo editor | `FormData` `kind` + `recordId` + `file` to `/api/photos/upload`. Renders `/photos/<key>`. Clear sets `''`. Rejects `data:` embeds on chauffeur save (`chauffeurs.ts`). | Copy this editor onto the class overlay (`photoKind: 'class'` once kind exists). |
| Completeness | `loadCompleteness` / trigger do **not** require photo or luggage. | D-30: no photo → cannot Publish. Name, start, per-km, max pax, max bags too. |

### Surcharges tab (D-34 D-35)

| File | What it does now | Gap vs new D- |
|------|------------------|---------------|
| `app/ops/OpsPricing.dc.html` Surcharges pane | **Two** `OpsTable`s: `ruleRows` (RULE_KINDS includes night/weekend/holiday/**quote_lock**/max_stops/service_area) **and** `surcharges` (SURCHARGE_CODES includes night/weekend/holiday). Distance pane still has a **region %** table. | D-34: **one list**. D-35: checkout extra is a type in that dialog; ski like pet; extra wait / free-wait hours are fields of that type; quote lock is **not** a row; night/weekend/holiday are **not** types. D-17: delete region table. |
| `apps/web/lib/checkout/extras-catalog.ts` `catalogFromSurcharges` | Live active passenger extras only. Inactive omitted (not CHF 0). Always appends a synthetic `free_wait` card. | Delete + Publish → gone: already true if the surcharge row is gone. Meet/free-wait must stop being customer toggles (D-23). Ski already a chip (`ski` / `ski_rack`). |
| `apps/web/lib/ops/ops-dc-finalize.test.ts` | **Asserts** four-class ladder, `KNOWN_CLASS_SLUGS`, and `night\|weekend\|holiday` still in OpsPricing. | These tests will fail the new product on purpose. Rewrite to D-29/D-25, do not keep the fingerprint. |
| `apps/web/lib/ops/ops-pricing-source.test.ts` | **Asserts five tabs including History**, overlap/region **warnings**, dual-copy equality. | Rewrite to four tabs, overlap **block**, no region, no History/Preview. Keep dual-DC byte-equal. |

## Approaches considered

### 1. Public class board still invents Economy after delete+Publish (D-29/D-31) — Wave 1

**A. Worker filter only.** Keep SQL `classes` as all `vehicle_classes`. `evaluateEligibility` already uses `classOnOffer`. Tighten home/checkout to render **only** `quote.classes` that are on offer; delete `VEHICLE_CLASSES` / `CLASS_SLUGS` fallbacks.

- Pros: no SQL / no owner apply; fastest UAT.
- Cons: quote JSON still lists deleted global rows; a future painter can revive them.

**B. SQL `quote_rate_book` only returns classes that have a live-book distance rate or fixed route (or hide-from-public rate).** Drop the four-class catalogs in the same wave.

- Pros: matches “SQL must not invent classes”; one source.
- Cons: owner-apply numbered gate. Do not `db push`.

**Recommendation:** **A + B in Wave 1**, B behind the owner-apply gate if the SQL file changes. Never leave `classCatalog('economy')` as a fallback. Hide-from-public (D-32) still listed. Agent does not Publish; owner UAT is the gate.

### 2. After Publish `/pricing` shows a clone, not live (D-03)

**A. Remove `forkLiveRateVersion` from the publish tx.** GET prefers live when no draft exists. PUT/Save forks. Discard deletes draft and does **not** clone.

- Pros: matches D-03/D-02/D-06 literally.
- Cons: rewrite tests that assert fork-after-publish (`publish-public-chf.test.ts`, `draft-preview-unpaid.test.ts`).

**B. Keep the clone but paint `/pricing` from the live id until the admin Saves.** Draft exists in DB unused.

- Pros: less SQL churn.
- Cons: two books in the DB; GET/loadDraft today prefer draft and would still show the clone; easy to regress.

**Recommendation:** **A.** D-03 is explicit. Do not clone on Publish or Discard.

### 3. Band overlap (D-18)

**A. Completeness gap + trigger 409.** Kernel may keep “higher wins” as defence in depth, but Publish never lets overlap live.

**B. Kernel throws on overlap; Publish stays warn.**

**Recommendation:** **A.** Owner said overlap **blocks Publish**. Quote after a clean Publish should never see overlap. Rewrite `bands.test.ts` / DC warn copy.

### 4. New class slug + photo (D-29/D-30)

**A. Drop `slug in (economy,business,first,van)` CHECK; add `vehicle_classes.photo_path`; new R2 kind `classes/`.** Upload analog = chauffeur.

**B. Store class photos as `site/` keys without a new kind; keep four slugs and map “new” classes onto unused `first`.

- B invents a ladder. Reject.

**Recommendation:** **A**, owner-apply SQL. Completeness requires photo + name + start + per-km + max pax + max bags.

### 5. `country_box` vs D-26

**A. Remove `country_box` from `INTENT_LADDER` / pipeline.** Quote fails only on unresolved From/To (and same-place / min-advance as today). Canton matching is separate (D-20).

**B. Keep the box as a silent operating fence.**

- B reinterprets D-26. Owner said Mapbox like Google Maps; canton is matching, not a fence.

**Recommendation:** **A.** Do not add `country=CH` on suggest (already absent). Service-area **polygon** as an optional surcharge-tab type is not named in D-26; planner may keep or drop with D-34 rebuild — default drop if it hides the map.

### 6. Canton → canton (D-20)

**A. On retrieve, read Mapbox context `region` / admin-area; persist canton code on the quote pin; match `fixed_routes` rows tagged `kind=canton`.** Exact place (zone or mapbox_id) wins.

**B. Ask the customer to pick two canton tick-boxes.**

- B is the fence D-26 killed.

**Recommendation:** **A.** Discretion on which Mapbox field. Empty canton table must not block quotes.

## Standard Stack / Don't Hand-Roll

Already in the repo. Do **not** `pnpm add`.

| Problem | Don't build | Use instead | Why |
|---------|-------------|-------------|-----|
| Fare maths | Float CHF / new money lib | `round.ts` `perKm` / `roundHalfUp` | D-16. Owner 275.20 / 123 already expressible. Never invent CHF. |
| Public 000 until first owner Publish | Custom coming-soon UI | `formatAmount(null)` + `public_chf` | Phase 11. This phase does not steal that flip. |
| Class photo upload | Client R2 SDK / data-URL in Postgres | `POST /api/photos/upload` + `PHOTOS.put` + `/photos/<key>` | Chauffeur analog. Browser never holds credentials. |
| Draft/live identity | Cached Hyperdrive on quote | `asQuote` / `HYPERDRIVE_NOCACHE` + `quote_rate_book` | Runbook. Keep nocache after Publish. |
| Staff writes | React `/ops` | `app/ops/*.dc.html` + `withAdmin` dual-mount | Ops is DC. Dual-DC sync script. |
| Checkout extras | Hardcoded chip list | Live surcharge rows via `catalogFromSurcharges` | D-22 delete = gone. |
| Extra wait charge | `off_session` PaymentIntent | Ops `arrived_at` display; no silent debit | D-23. Grep gate already exists. |
| Suggest CH-only | `country=CH` | Existing worldwide Search Box | D-26. |
| VAT | New gross engine | `vatOnTopRappen` after coupon | D-24. Fallback 81. |
| i18n | Per-page tables | `vamos-i18n-dict.js` + `VamosLocale` | Four languages same sitting. |
| Publish | Agent click / `db push` / SQL in a merge | Owner Publish on dashboard; owner apply if SQL | Must-not. No `sk_live_`. No `.eu`. |

## Common Pitfalls

### Pitfall 1: Leave `VEHICLE_CLASSES` / `CLASS_SLUGS` as a “catalog”
**What goes wrong:** Owner deletes Economy, Publishes, home still paints Economy (2026-09-14 UAT).
**Why:** `classCatalog(id)` and checkout `CLASS_SLUGS.includes` revive the ladder even when `fleetOffer` is empty or a new slug arrives.
**How to avoid:** Render only live-book rows. No four-id fallback. Unknown slug uses book name/photo/caps, never Economy.
**Warning signs:** `classCatalog`, `KNOWN_CLASS_SLUGS`, `asClassSlug` → economy, `firstFittingClass` → `"business"`.

### Pitfall 2: Fork a draft in the Publish transaction
**What goes wrong:** `/pricing` no longer matches what customers see (D-03). Admin thinks they are editing live.
**Why:** `publish/route.ts` line 151 + GET prefers draft.
**How to avoid:** Fork only on Save. Rewrite tests that require fork-after-success.
**Warning signs:** After Publish, `rate_versions` has a new `draft` and the page loads it.

### Pitfall 3: `quote_rate_book` returns every `vehicle_classes` row
**What goes wrong:** Deleted class still in JSON; Worker or DC can paint it.
**Why:** `'classes', (select … from public.vehicle_classes as c)` has no version filter.
**How to avoid:** Filter to the live book (SQL and/or Worker). Owner apply if SQL changes. Never `db push`.

### Pitfall 4: Closed Postgres slug CHECK
**What goes wrong:** D-29 “any name” INSERT fails with 23514.
**Why:** `20260823000005_fleet.sql` `slug in ('economy','business','first','van')`.
**How to avoid:** Additive migration, owner-apply gate. Do not invent a fifth slug in app code first.

### Pitfall 5: Band overlap warn-and-publish
**What goes wrong:** Two slices cover the same km; quote uses higher rate; owner thought Publish was blocked.
**Why:** `bands.ts` higher-wins + DC `tBandOverlapWarn` “you can still publish”.
**How to avoid:** Completeness + trigger 409. Jump-to-gap opens the band overlay.

### Pitfall 6: Dual-DC drift / stripped `<base>`
**What goes wrong:** Dashboard serves a stale OpsPricing; History/Preview return.
**Why:** Edit `app/ops/` then forget `node scripts/sync-dc-mock-to-public.mjs`.
**How to avoid:** Keep `ops-pricing-source.test.ts` byte-equal. Do not strip `<base href="/app/ops/">`.

### Pitfall 7: Invent CHF, live Stripe, or `.eu`
**What goes wrong:** Public shows a guessed fare; Worker gets `sk_live_`; DNS binds `.eu`.
**Why:** Tests and copy still contain 80/100/130/150-era floors; wrangler has a production env unused.
**How to avoid:** Owner examples are **fixtures**, not live fares. Stripe stays test. Worker `vamos` only. Agent does not Publish.

### Pitfall 8: Confirmation recap VAT-then-coupon
**What goes wrong:** Receipt disagrees with Stripe (D-09/D-24/D-27).
**Why:** `receiptPriceSplit` documents VAT then coupon.
**How to avoid:** Same stack everywhere: start, km, bands, wait, extras, coupon, VAT, total. Charge CHF.

### Pitfall 9: Extra-wait silent debit
**What goes wrong:** Off-session capture without customer confirmation.
**Why:** Owner wanted it; CONTEXT deferred it.
**How to avoid:** Keep `extra-wait-no-offsession.test.ts`. Extra wait not in pay-now.

### Pitfall 10: Region % leftover in recap
**What goes wrong:** Distance tab and Preview recap still show region after D-17.
**Why:** `buildRegionPremiumLine` + `draft-preview.ts` `{ code: "region" }`.
**How to avoid:** Delete calculation, UI table, and recap line together.

## Validation Architecture

`.planning/config.json` `workflow.nyquist_validation`: **true**.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (unit) + Playwright (integration) |
| Config | `apps/web/package.json` script `test`; Playwright under `apps/web/tests/` |
| Quick run | `pnpm --filter web test` (pricing lines/bands/eligibility, extras-catalog, publish grep, vat, intent) |
| Full suite | same + DC source-read tests + dual-copy equality |

### Phase requirements → test map

| D- | Behavior | Test type | Automated assertion | File exists? |
|----|----------|-----------|---------------------|--------------|
| D-03 | Publish tx has **no** `forkLiveRateVersion` | unit grep | `publish/route.ts` does not call fork after `public_chf` | ⚠️ invert `publish-public-chf.test.ts` |
| D-02/D-06 | GET live when no draft; Discard does not clone | unit grep | `resolveVersionId` live-first; discard has no fork | ❌ Wave 2 |
| D-11/D-12 | No History, Preview, test unpaid in OpsPricing | source-read | no `tabHistory`, `runPreview`, `createTestUnpaid` | ⚠️ invert `ops-pricing-source.test.ts` |
| D-15/D-16 | `10000 + perKm(1200, 14600) === 27520`; `perKm(1000, 12300) === 12300` | unit | owner fixtures — **not** live fares | ⚠️ extend `lines.test.ts` |
| D-17 | No `buildRegionPremiumLine` on the live path; no region table in DC | unit + source-read | priceQuote / OpsPricing | ❌ |
| D-18 | Overlap → completeness gap / 409, not warn | unit | `loadCompleteness` + DC copy | ❌ (today higher-wins) |
| D-21 | Extra stop max 1 hardcoded | unit | cap is 1, not `max_extra_stops` field | ⚠️ change `extras-catalog.ts` |
| D-23 | Extra wait not in Stripe amount; no `off_session` | grep | keep `extra-wait-no-offsession.test.ts` | ✅ |
| D-23 | Meet/free wait not customer-off | unit | extras-catalog toggles | ⚠️ invert default-off tests |
| D-24 | Coupon before VAT on intent + confirmation | unit | `payableWithVatRappen` on post-coupon net; fix `receiptPriceSplit` | ⚠️ |
| D-25 | No night/weekend/holiday types | source-read | OpsPricing `RULE_KINDS` / `SURCHARGE_CODES` | ⚠️ invert `ops-dc-finalize.test.ts` |
| D-26 | Suggest has no `country=` | unit | keep `mapbox.ts` comment/test | ✅ |
| D-26 | Quote does not `place_out_of_box` on country box | unit | pipeline | ⚠️ |
| D-29/D-31 | Home/checkout have no four-slug catalog; deleted class absent | unit + source-read | no `VEHICLE_CLASSES` four-list used as board; `classOnOffer` | ❌ Wave 1 |
| D-29 | `IntentVehicleClass` / `KNOWN_CLASS_SLUGS` open | type + grep | string slug from book | ❌ |
| D-30 | Completeness requires photo + bags | unit | `loadCompleteness` | ❌ |
| D-32 | Hide listed, Select off, `CHF 000` | unit | keep `eligibility.test.ts` hide case | ✅ extend, do not drop |
| D-33 | Pax over max → not offered | unit | keep eligibility pax | ✅ |
| D-34 | One surcharge list | source-read | single OpsTable on Surcharges pane | ❌ |
| Dual-DC | `app/ops/OpsPricing.dc.html` byte-equal public copy | file-I/O | keep | ✅ |
| Must-not | no `sk_live_`, no `vamostaxi.eu` bind, no agent Publish | grep / process | wrangler test keys; no `db push` in plans | grep |

### Sampling rate

- **Per task commit:** `pnpm --filter web test` for touched kernel + grep tests
- **Per wave merge:** DC source-read + dual-copy + eligibility/board
- **Phase gate:** Owner Publish UAT on `vamostaxi.site` / `dashboard.vamostaxi.site`. Agent does not click Publish. Agent does not `db push`. No `sk_live_`. No `.eu`. Never invent CHF. Never restore onto `yaumjzvylngfjhtuffqs`.

### Wave 0 gaps (tests to add or invert)

- [ ] Invert publish-fork assertion (D-03)
- [ ] Owner recipe fixtures 275.20 / 123 (illustration only)
- [ ] Home/checkout/intent have no closed four-slug board
- [ ] `quote_rate_book` classes do not invent
- [ ] Overlap blocks Publish
- [ ] No History / Preview / region / night-weekend-holiday types
- [ ] Completeness photo + max bags
- [ ] Confirmation recap coupon before VAT
- [ ] Dual-DC still byte-equal after OpsPricing rebuild

## Open questions

| # | Question | Owner vs plan discretion | Recommendation |
|---|----------|--------------------------|----------------|
| Q1 | SQL vs Worker filter for `quote_rate_book.classes` | CONTEXT: plan choice; owner apply if SQL | Filter both; SQL if a migration is needed |
| Q2 | Mapbox field for canton | Discretion | Retrieve context region / `region.code`; persist on the pin |
| Q3 | Airport terminal ≡ pin | CONTEXT D-20, mechanism open | Same airport `zone_type` or IATA, not raw mapbox_id |
| Q4 | Drop `country_box` entirely vs keep polygon rule | D-26 vs leftover service-area type | Drop box refuse; do not add canton tick-list |
| Q5 | R2 prefix for class photos | Discretion | `classes/` next to `chauffeurs/` |
| Q6 | Display name storage (slug vs `vehicle_classes` label column vs i18n) | Discretion | Persist the typed name on the class row; public card shows that name after Publish |
| Q7 | STATE.md Phase 18 Decisions | Hygiene | Rewritten 2026-09-14 to D-01…D-35. Do not restore 2026-09-13 Preview / five-tab / fork-after-Publish rows. |
| Q8 | `18-01`…`18-07-PLAN.md` vs this research | Closed 2026-09-14 | Plans already follow D-01…D-35; PATTERNS + UI-SPEC now match. Execute Wave 1 (`18-01`) only after owner says execute. |

## Assumptions Log

| # | Claim | Section | Risk if wrong |
|---|-------|---------|---------------|
| A1 | Hosted live book still has four global `vehicle_classes` rows including Economy | Public board | If Economy was hard-deleted from the table, UAT cause is catalog-only — still must kill catalogs |
| A2 | `20260913180000_ops_pricing_source.sql` is applied; slug CHECK from 20260823 is still live | D-29 SQL | If CHECK already dropped, skip that migration |
| A3 | Mapbox retrieve payload includes an admin-area/region usable as canton | D-20 | Need a documented fallback (no match → distance recipe) |
| A4 | Stripe on Worker `vamos` is still test | Must-not | Confirm no `sk_live_` before any deploy |

## Sources

### Primary (HIGH)

- `.planning/phases/18-ops-pricing-source/18-CONTEXT.md` — D-01…D-35 restart
- `.planning/phases/18-ops-pricing-source/18-DISCUSSION-LOG.md` — Restart 2026-09-14 section only
- `.planning/ROADMAP.md` Phase 18 success criteria
- `apps/web/app/[locale]/(ops)/api/staff/rate-versions/[id]/publish/route.ts`
- `apps/web/lib/ops/rate-book.ts`, `pricing.ts`, `photos.ts`, `surcharge-codes.ts`
- `apps/web/lib/pricing/lines.ts`, `bands.ts`, `round.ts`, `priceQuote.ts`, `eligibility.ts`, `types.ts`
- `apps/web/lib/quote/pipeline.ts`, `intent.ts`
- `apps/web/lib/geo/mapbox.ts`, `serviceArea.ts`
- `apps/web/lib/checkout/extras-catalog.ts`, `intent.ts`, `vat.ts`, `confirmation-receipt.ts`
- `app/ops/OpsPricing.dc.html`, `app/home/home.dc.html`, `app/vamos-ops-data.js`
- `apps/web/components/home/BookingBoard.tsx`
- `apps/web/app/[locale]/checkout/CheckoutClassCards.tsx`, `CheckoutClient.tsx`
- `packages/db/supabase/migrations/20260913180000_ops_pricing_source.sql`, `20260823000005_fleet.sql`
- `docs/runbooks/quote-publish.md`
- `CLAUDE.md`

### Secondary (MEDIUM)

- Hosted `rate_versions` contents — not queried this sitting
- Mapbox admin-area field names for Swiss cantons

### Tertiary (LOW)

- Whether `www` / dashboard hosts already match Phase 11 noindex split (out of this phase)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH
- Publish-fork / four-class catalogs / region line / two surcharge tables: HIGH (quoted identifiers)
- Canton matcher / airport-pin identity: MEDIUM (no current code)
- Hosted live matrix numbers: not this sitting — never invent CHF

**Research date:** 2026-09-14
**Valid until:** next CONTEXT change

## RESEARCH COMPLETE
