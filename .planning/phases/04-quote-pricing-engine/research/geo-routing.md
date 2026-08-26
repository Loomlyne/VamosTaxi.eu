# Geo-Routing — Phase 4 Research Brief

**Lane:** geo-routing · **Phase:** 4 (Quote & Pricing Engine) · **Covers:** QUOTE-01, QUOTE-07
**Date:** 2026-08-22
**Downstream consumers:** the `/api/quote` handler (quote-engine-core lane), `price_snapshots` /
`price_snapshot_legs` / `booking_legs` (already committed in Phase 2), the abuse-ratelimit lane
(shares the same endpoint), Phase 8's OPS-03 exclusion constraint (reads
`estimated_duration_minutes`).

---

## 0. What the repo already commits us to

| Source | Binding fact |
|---|---|
| `.claude/CLAUDE.md` §Constraints, `docs/build/GSD-LAUNCH.md` Phase 4 | "`POST /api/quote`: geocode both ends (Mapbox, cached in KV 24 h by place-id pair) → distance/duration (Directions) → price per class…" |
| `docs/build/CLOUDFLARE-RESOURCES.md` | `GEO_CACHE` KV namespace already provisioned (staging `geo-cache-staging`, prod `geo-cache-production`), first consumer "Phase 4 (geocoding + quote cache)". Turnstile is a secret, not a binding (`TURNSTILE_SECRET`), first consumer Phase 4. No `RATE_LIMIT` binding exists — Cloudflare's dashboard-configured Rate Limiting Rules are a WAF feature, not a `wrangler.jsonc` binding. |
| `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` | `booking_legs`: `pickup_place_id text`, `pickup_lat/lng numeric(9,6)`, `dropoff_place_id/lat/lng` (same shape), `origin_zone_id`/`dest_zone_id` → `service_zones`, `estimated_duration_minutes integer` (feeds the OPS-03 exclusion constraint, floored at 30 min if null when a leg is assigned). `service_zones` is a small **named-zone** table (`slug`, `iata`, `active`) — it backs `fixed_routes`, it is **not** a general "where we operate" polygon. |
| `.../research/price-snapshot.md` (U6, settled) | One `price_snapshots` row **per eligible vehicle class per quote**, all sharing one `quote_id` (unique index `(quote_id, vehicle_class_id)`). `price_snapshots.distance_km numeric(7,2)`, `duration_min integer` are booking-level (shared across classes — a return leg gets its own row in `price_snapshot_legs`). **Consequence for this lane: geocode + route once per quote, not once per class** — the five/six vehicle classes reuse the same distance/duration input. |
| `.planning/ADR-007-edge-data-residency.md` (proposed, pending counsel) | `/api/quote` is a data-touching route (it processes a pickup/dropoff address, which is personal data under GDPR/nFADP) — the proposed default pins it near Frankfurt via Smart Placement. Not this lane's call to make; noted because it affects where the Worker executes when it calls Mapbox. |
| `settings_versions.min_advance_minutes integer` (nullable, seeded NULL) | Already exists (Phase 2, `0005_settings_versions.sql`). This lane reads it; does not create it. |
| `app/vamos-ops-data.js:316-330` (mock `SETTINGS`) | `minAdvance: ''` and no `serviceArea` field at all — `docs/build/MISSING-FEATURES.md:195` lists "service area" as a setting that does not exist yet, even in the mock. **There is no prior art for the service-area shape anywhere in this repo.** This lane has to invent it, which is why §5 below is a schema addition, not a read of an existing field. |
| `app/home/home.dc.html:1477-1520` | The mock's address search is Komoot's **Photon** (`photon.komoot.io`), free OSM-based geocoding — not Mapbox. It is UI scaffolding only; the four fixed language codes it passes (`GEO_LANGS`) are the shape to keep, the provider is not. |
| `docs/build/OPEN-QUESTIONS.md:20-27` | Mapbox account creation is still an **open owner question** — no Mapbox account exists yet. This matters directly for §1: the contract terms below can still be negotiated before sign-up. |

---

## 1. RECOMMENDATION (one decision)

> **Geocode and route Mapbox-first, but treat every Mapbox response as request-scoped and
> non-cacheable under the plain terms of Mapbox's Oct-2025 Product Terms — and get that
> assumption overturned in writing by Mapbox's sales team, in an Order, before relying on the
> KV-cache design that `GSD-LAUNCH.md`/`CLOUDFLARE-RESOURCES.md` currently commit to. Until that
> Order exists, `/api/quote` calls Mapbox live on every request; `GEO_CACHE` (KV) is repurposed
> for the two things this lane is actually allowed to cache — the service-area polygon and the
> hand-curated geometry of the eight named fixed routes — not for per-request Mapbox output.**
>
> Concretely:
> 1. **Autocomplete** — Mapbox **Search Box API** (`/search/searchbox/v1/suggest` +
>    `/retrieve`), session-tokened, biased to Switzerland. Proxied through a Worker route so the
>    access token never reaches the browser and the session token can be validated server-side.
> 2. **Reverse geocode (dropped pin)** — Mapbox **Geocoding API v6** `/reverse`, one-shot,
>    `types=address,poi`, no session.
> 3. **Distance + duration + route line** — Mapbox **Directions API v5**, profile
>    `mapbox/driving` (**not** `driving-traffic` — see §3.2), `geometries=geojson`,
>    `overview=full`. One call per quote (not per class — see §0's U6 note), reused for all
>    eligible classes and, on the request-drawing step, to paint the line QUOTE-01 asks for.
> 4. **Service area (QUOTE-07)** — a two-path check, not a single polygon lookup: an
>    (origin-zone, dest-zone) pair that matches a `live` `fixed_routes` row is *always* in area
>    (it is a named product on the price list); everything else must have **both** ends inside a
>    new `settings_versions.service_area_geojson` polygon. That column is **NULL until the owner
>    draws it** (Law 04) — and unlike `min_advance_minutes` (a threshold, safe to skip when NULL),
>    a NULL service area is **fail-closed**: no ad-hoc per-km quote is offered until a polygon
>    exists, because "skip the check" here means "quote literally anywhere on Earth," which is
>    not a TBC gap, it is an unbounded liability.
> 5. **Abuse** — before any of the above run, `/api/quote` sits behind Cloudflare Turnstile
>    (Managed mode) after N anonymous quotes and a Cloudflare Rate Limiting Rule on the route
>    (`/api/quote*`, ~20 req/min/IP, `managed_challenge` action, escalating to `block`). This
>    lane specifies the trigger point; the abuse-ratelimit lane owns the rule's exact shape and
>    Turnstile wiring — do not duplicate that build here.
> 6. **Failure** — Mapbox down or slow degrades to: autocomplete falls back to the saved-places
>    list only (no geocoder hits), reverse geocode failure keeps the pin but asks the customer to
>    type the address, and a Directions failure **fails the quote**, not the price — QUOTE-07
>    cannot be evaluated and QUOTE-04's lock cannot be minted without a real distance, so the
>    honest response is "try again," not a silently wrong number.

Everything below is the evidence and the exact checks that still need running.

---

## 2. The compliance finding that reshapes the KV design

This is the one piece of this brief that overturns an already-written plan, so it is stated first
and in full, not buried.

### 2.1 What the Mapbox Product Terms actually say

Read in full (Mapbox Product Terms, 2025-10-01, the current click-through terms — see
`https://www.mapbox.com/legal/tos` for the successor URL if a newer revision has since shipped;
**verify the date on sign-up**, terms are dated and versioned):

> **§2.7.2 Temporary Geocodes.** "Customer shall not export, store, or cache Temporary
> Geocodes. Customer may display Temporary Geocodes (other than the latitudes and longitudes) to
> its End Users through its Licensed Application(s) and use Temporary Geocodes to position
> results on a map."
>
> **§2.7.3 Permanent Geocodes.** "Customer may permanently store Permanent Geocodes and may
> query the Geocoding API programmatically for Permanent Geocodes. Customer shall only use
> Permanent Geocodes for Customer's own internal business use. Notwithstanding the foregoing
> sentence, Customer may use Permanent Geocodes in its Licensed Application if all the following
> conditions are fulfilled (i) access to Permanent Geocodes cannot be a primary or significant
> feature of a Licensed Application but only used to support an ancillary or incidental feature,
> (ii) **a separate API request for a Permanent Geocode shall be made for each End User account
> that accesses, uses, or relies on it**, (iii) the Licensed Application shall not allow an End
> User to sublicense, sell, rent, lease, transfer, assign, disclose, or distribute a Permanent
> Geocode to any other End User or third party, and (iv) if Permanent Geocodes are displayed,
> latitudes and longitudes may not be made available to End Users."
>
> **§3.52 "Permanent Geocode"** means a Geocode obtained "using a Search API in
> `mapbox.places-permanent` mode (for Geocoding API v5 or earlier) or when the optional
> `permanent` parameter is set to true (for Geocoding API v6 or later)."
>
> **§2.7.1(v)** "Customer shall not (a) resell, re-syndicate, or otherwise make available any
> Geocoding Results to other publishers or third parties or **(b) display the latitudes or
> longitudes directly to End Users or other third parties**."
>
> **§2.10.1 Navigation APIs.** "Customer shall not export, download, cache or store results
> from any request to a Navigation API." — **No permanent-mode exception is offered for this
> product at all.** The Directions API is a Navigation API (§3.49 defines "Navigation APIs" to
> include exactly this family).
>
> **§3.29** "Geocode" or "Geocoding Result" means the response to any request to a **Search
> API** or Atlas Search — and §3.59 defines "Search APIs" broadly enough (Mapbox's search
> service APIs "as set forth in Mapbox documentation") that the **Search Box API's
> `/suggest`/`/retrieve` responses read as Geocoding Results too**, subject to the same
> Temporary/Permanent split. (§2.1 below flags this as the one place I could not find an
> explicit `permanent` parameter documented for Search Box specifically — see the UNCERTAIN
> item.)

### 2.2 What this means for the already-committed design, plainly

1. **`GEO_CACHE` KV, 24 h TTL, keyed by place-id pair, holding Directions distance/duration** —
   as specified in `GSD-LAUNCH.md` — **is barred outright by §2.10.1.** There is no permanent
   tier for Navigation APIs to opt into; the clause is unconditional.
2. **Caching a geocode result (forward search, reverse pin-drop, or Search-Box retrieve) for
   reuse across different customers' requests** is barred by §2.7.2 unless every one of those
   requests is separately billed as a Permanent Geocode — and even then, condition (ii) requires
   "a separate API request... for each End User account that... relies on it," which reads as
   forbidding cross-customer reuse of one cached geocode even under the paid Permanent tier. A
   shared KV cache keyed by `place_id` and served to whichever customer asks next does not fit
   that shape.
3. **`price_snapshots.distance_km` / `.duration_min`, `price_snapshot_legs.distance_km` /
   `.duration_min`, and `booking_legs.estimated_duration_minutes`** — all four already committed
   in Phase 2's schema — are, in plain terms, "results from a request to a Navigation API,"
   **stored**, forever, on a booking record. That is precisely what §2.10.1 forbids. This is not
   a hypothetical edge case; it is the pricing engine's and the dispatch exclusion constraint's
   core input, both already designed around storing it.
4. **`booking_legs.pickup_lat/lng`, `.dropoff_lat/lng`** stored indefinitely on a purchased
   booking is legitimate **only** as a Permanent Geocode (§2.7.3), obtained with `permanent=true`
   set on the request that resolves the *final, chosen* address — not on the search-as-you-type
   traffic during quoting. §2.7.1(v)(b) additionally means those coordinates may never be
   rendered as literal numbers to the customer (a map pin or formatted address only — which this
   product already does; no change needed there).

None of this is a reason to abandon Mapbox — every serious routing/logistics platform (delivery,
fleet, ride-hailing) stores exactly this kind of data on every order, and does so lawfully, because
**Mapbox's Enterprise sales team writes a custom Order for exactly this use case** that supersedes
the self-serve Product Terms' default no-cache clause (Product Terms §1's opening line: "these
Product Terms... along with all referenced terms are incorporated into the agreement" — an Order is
how that agreement is customized). This is normal, expected, and the reason Mapbox's pricing page
funnels high-volume customers to "Contact sales" rather than a credit card. What is **not** normal
is signing up self-serve, building the storage layer as if that were already covered, and finding
out at a compliance review eighteen months in that the default terms never allowed it.

### 2.3 The recommendation, precisely

- **Before Mapbox sign-up** (still open per `docs/build/OPEN-QUESTIONS.md:20`): put one sentence
  in the Mapbox sales conversation — *"we store route distance, duration and route geometry, and
  pickup/dropoff coordinates, permanently on a paid transportation booking record; we need that
  covered by contract."* This is a five-minute email, not a procurement project — Mapbox's sales
  team handles this routinely for exactly this vertical.
- **Until that email is answered and an Order exists**, this lane's design assumes the
  self-serve terms apply literally, and therefore:
  - `/api/quote` calls Directions **live, every time** — no KV cache of the response. It is
    still fast (Mapbox's own SLA-class latency is well under the "< 800 ms warm" done-when
    criterion in `GSD-LAUNCH.md` Phase 4) and cheap at Zurich volumes (§4.3).
  - The autocomplete/reverse-geocode path is used **read-only, ephemeral, per-request** exactly
    as §2.7.2 permits Temporary Geocodes to be used (displayed, used to position a map pin) —
    which is already all QUOTE-01 needs during search.
  - At the moment a customer's address becomes **the booking's** address (checkout, not quote —
    same quote→booking boundary Phase 2 already drew for pricing), re-resolve pickup/dropoff with
    `permanent=true` so storing `pickup_lat/lng`/`dropoff_lat/lng` on `booking_legs` is the
    contractually-legitimate Permanent Geocode path, not a leftover from the ephemeral quote call.
  - `price_snapshots.distance_km`/`.duration_min` and `booking_legs.estimated_duration_minutes`
    remain in the schema as Phase 2 defined them (not this lane's call to change), but this brief
    flags to the phase plan that **storing them is the exact thing §2.10.1 forbids** absent an
    Order — carry that forward as the settling check in §8, not something this lane can resolve
    alone.
  - `GEO_CACHE` KV is repurposed: it caches the **service-area polygon** (our own data, refreshed
    on ops edit, not a Mapbox response) and the **eight fixed-route line geometries**, which are
    hand-drawn once (Mapbox Studio, or traced from OpenStreetMap directly, licensed separately
    from a live Directions call) rather than persisted output of a live Navigation API request —
    see §5.

---

## 3. Geocoding and search

### 3.1 Search-as-you-type: Search Box API, not raw Geocoding

Mapbox's current recommendation for interactive address search is the **Search Box API**
(`docs.mapbox.com/api/search/search-box/`), not the older Geocoding API used directly — Geocoding
v6 is the right tool for the one-shot reverse lookup (§3.3), but for type-ahead the Search Box
API's `/suggest` + `/retrieve` pair is purpose-built and is what the session-token billing model
in `GSD-LAUNCH.md`'s pricing assumptions (implicitly) refers to.

```
GET https://api.mapbox.com/search/searchbox/v1/suggest
    ?q={typed text}
    &session_token={uuid, one per widget-open}
    &access_token={PUBLIC token, scoped, see §6.2}
    &language={en|de|fr|ar}
    &country=CH               # bias, not a hard filter — see §3.4
    &proximity={lng},{lat}    # Zurich HB by default, or the browser's IP-derived location
    &types=address,poi,street,place
    &limit=6

GET https://api.mapbox.com/search/searchbox/v1/retrieve/{mapbox_id}
    ?session_token={same uuid as the /suggest call that produced mapbox_id}
    &access_token={PUBLIC token}
```

- **Session token**: one per widget-open (not per keystroke), reused across every `/suggest` call
  in that session, and the terminating `/retrieve`. A session ends (billing-wise) at whichever of:
  `/retrieve` is called with the same token, 180 s pass with no `/retrieve`, or 50 `/suggest`
  calls happen on the same token — whichever comes first. **One session = one billable unit**,
  regardless of keystroke count, which is why debouncing keystrokes (already the mock's pattern —
  `home.dc.html:1477`'s 320 ms `_geoT` timer) does not change billing, it only changes perceived
  latency; do not remove the debounce thinking it saves cost.
- **`/suggest` returns no coordinates** — only `mapbox_id`, name, address, context. Coordinates
  only appear from `/retrieve`, called once the customer picks a suggestion. This matches the
  mock's `choose()` handler shape (`home.dc.html`) almost exactly — swap the Photon call for
  `/suggest`, and resolve the pick with `/retrieve` instead of using the suggestion object as-is.
- **Biasing to Switzerland / Zurich**: `country=CH` narrows results to Switzerland but is a
  *bias*, not an allowlist — do not use it as the service-area check (a Basel address and a
  Milano address both plausibly match "closest to typed text," `country=CH` only re-ranks). The
  real service-area gate is §5, run server-side on the *retrieved* coordinate, never on the
  country code. `proximity` should default to Zurich HB (`8.5417,47.3769`) so short/ambiguous
  queries ("Bahnhof") resolve to the right one without the customer having typed a canton.
- **Four-language place names (Law 03)**: `language=de|fr|ar` (IETF tags) changes the *label*
  Mapbox returns for a place (street/city names in the requested script where Mapbox has that
  data — Latin script names generally stay Latin even in `ar`, since Swiss addresses are not
  transliterated into Arabic script by Mapbox; a Zurich street address reads in German/French
  regardless of UI language, exactly like the design system's `.vt-dir-keep` treatment for
  references and codes already asks for). **What must ship in the four languages is not the
  street-name text** (that is Mapbox's data, out of scope for `vamos-i18n-dict.js`) **but every
  surrounding UI string**: the field label, placeholder, empty-state, "no results," the
  service-area refusal message, and the aria-label on the combobox — exactly the existing pattern
  at `home.dc.html:318` (`aria-label="{{ tPickup }}"`), unchanged.
- **Never send the access token from the browser to Mapbox with unrestricted scope.** Proxy
  `/suggest` and `/retrieve` through a Worker route (`/api/geo/suggest`, `/api/geo/retrieve`) that
  holds the Mapbox token as a secret and forwards `country`/`language`/`proximity`. This also
  gives the abuse-ratelimit lane one place to gate before Mapbox is ever called (§6), and keeps
  the session-token discipline server-verifiable (reject a `/retrieve` whose token was never seen
  in a prior `/suggest` from the same rate-limit bucket).

### 3.2 Reverse geocode for a dropped pin

QUOTE-01: "or by dropping a pin on the map." One-shot, no session token, plain Geocoding API v6:

```
GET https://api.mapbox.com/search/geocode/v6/reverse
    ?longitude={lng}&latitude={lat}
    &access_token={secret, server-side only}
    &language={en|de|fr|ar}
    &types=address,poi
```

Current version is **v6** (`docs.mapbox.com/api/search/geocoding/`) — v6 dropped POI results from
the plain Geocoding endpoint (use Search Box for POI search, which QUOTE-01's address search
already does); `types=address,poi` on `/reverse` still resolves a dropped pin to the nearest
addressable feature, which is what a pin drop needs. Response field `full_address` /
`place_formatted` is the string to show back to the customer, never `properties.coordinates` as
literal digits (§2.1's §2.7.1(v)(b)).

### 3.3 Rate limit

Mapbox's default Geocoding rate limit is 1000 req/min per account, adjustable — well above this
product's volume; the binding limit in practice is the Cloudflare-side gate in §6, not Mapbox's.

---

## 4. Distance, duration, route geometry

### 4.1 Directions API, not Matrix

**Directions**, not Matrix — deliberately, for one reason that decides it outright: **QUOTE-01
asks the customer to "see the route drawn."** The Matrix API (`/directions-matrix/v1`) returns
only durations and distances for an N×M grid of points — no route geometry at all
(`docs.mapbox.com/api/navigation/matrix/`). This product only ever prices one origin against one
destination (Matrix's value is pricing *many* candidate pairs in one call, which nothing here
needs — even the return-leg case is two separate one-to-one calls, one per direction, since
D11/ADR-006 already treats each leg as its own row with its own subtotal). Directions gives
distance + duration + geometry in the same response Matrix would need a second call to replicate.

```
GET https://api.mapbox.com/directions/v5/mapbox/driving/{pickup_lng},{pickup_lat};{drop_lng},{drop_lat}
    ?access_token={secret}
    &geometries=geojson
    &overview=full
    &alternatives=false
    &steps=false
```

- **Response**: `routes[0].distance` (metres), `routes[0].duration` (seconds),
  `routes[0].geometry` (GeoJSON `LineString`, because `overview=full` + `geometries=geojson`).
- **Convert once, at the boundary**: `distance_km = round(distance_m / 1000, 2)` (matches
  `price_snapshots.distance_km numeric(7,2)`); `duration_min = round(duration_s / 60)` (matches
  `estimated_duration_minutes integer`, and — per Phase 2's own comment on
  `booking_legs.scheduled_range` — a `0`/`null` duration must never reach that column silently;
  a failed Directions call has to fail the quote, not write a zero).
- **`steps=false`, `alternatives=false`**: turn-by-turn steps and alternate routes are unused
  weight on the response; QUOTE-01 draws one line, the price uses one number.

### 4.2 `mapbox/driving`, not `mapbox/driving-traffic` — and why this matters beyond cost

`driving-traffic` returns a **live, traffic-aware** duration, valid for the moment of the request.
This product prices and locks a quote for a pickup that may be **weeks** in the future
(pre-booked airport transfers, not on-demand rides — the one line in `PROJECT.md`/`AGENTS.md`
that most directly rules this out: "explicitly not on-demand ride-hailing"). A traffic-aware
duration captured today has no relationship to road conditions on the scheduled date, and — this
is the sharper point — **even if it were cached, caching a `driving-traffic` value for 24 h would
be actively wrong in a different way than caching `driving` would be**, because the entire value
of the traffic-aware profile is that it is *not* stable across even a few minutes, let alone a
day. `mapbox/driving` (typical, free-flow-adjusted travel time) is the right baseline for both:
(a) the price the customer locks for a future date, and (b) `estimated_duration_minutes`, which
Phase 2's own comment on `booking_legs` already frames as a **snapshot**, explicitly not something
"a later settings change must... silently recompute." A traffic-aware number is the wrong kind of
input for a value whose entire design intent is to be a stable, reproducible fact about the leg.

### 4.3 Cost at Zurich volume

Directions: 100,000 free requests/month, then $2.00/1,000 up to 500,000
(`mapbox.com/pricing`, fetched 2026-08-22 — **verify at sign-up, Mapbox revises pricing pages
without a stable dated URL**). One quote = one Directions call (§0's U6 note — shared across
classes). At any volume this product will see pre-launch and for a long time after (dozens to a
few hundred quotes/day for a single-city, pre-booked service), this stays inside the free tier
for months; it is not the cost driver a KV cache would meaningfully protect. The compliance
question in §2 is the real reason to resolve caching correctly, not the spend.

---

## 5. Service area (QUOTE-07)

### 5.1 The gap this lane has to fill

No table, column, or even a mock UI field defines "service area" anywhere in this repository
today (§0). `fixed_routes` + `service_zones` define eight **named destinations** with fixed
prices (`Zurich Airport`, `Geneva Airport`, `Zurich city`, `Dietikon`, `Zermatt`, `St. Moritz`,
`Chamonix`, `Verbier` — `app/vamos-ops-data.js:135-138`), several of which (Zermatt, Chamonix) are
150–270 km from Zurich — nowhere near a plausible "we only do per-km pricing within N km of
Zurich" radius. That rules out the simplest possible design (a single radius around Zurich HB) on
its own: the eligible area is not one shape, it is two different products layered.

### 5.2 The two-path check

1. **Named-pair path.** If the pickup resolves to a zone with a live `fixed_routes` row to the
   dropoff's zone (or vice versa — `fixed_routes` has no direction column, so check both orders)
   for at least one vehicle class, the pair is in the service area **by definition** — it is a
   priced product on the list, not something a polygon needs to bless. This also means Zermatt,
   St. Moritz, Chamonix and Verbier keep working as fixed-price destinations without ever being
   inside a "Zurich region" polygon.
2. **Ad-hoc per-km path.** For anything else — the customer typed an address that is not one of
   the eight named zones on either end — **both** pickup and dropoff coordinates must fall inside
   a service-area polygon, checked server-side, never client-side (a customer editing browser
   state cannot bypass the gate).

### 5.3 The schema addition

A new nullable column on the table Phase 2 already versioned for exactly this kind of policy fact:

```sql
-- packages/db/migrations/00xx_service_area.sql  (Phase 4's own migration; extends, does not
-- alter, the settings_versions table Phase 2 committed in 0005_settings_versions.sql)

alter table public.settings_versions
  add column service_area_geojson jsonb;

alter table public.settings_versions
  add constraint settings_versions_service_area_shape check (
    service_area_geojson is null
    or (
      service_area_geojson ->> 'type' in ('Polygon', 'MultiPolygon')
      and jsonb_typeof(service_area_geojson -> 'coordinates') = 'array'
    )
  );

comment on column public.settings_versions.service_area_geojson is
  'GeoJSON Polygon/MultiPolygon for QUOTE-07''s ad-hoc per-km eligibility check. NULL until the '
  'owner draws it (Law 04) — unlike min_advance_minutes, NULL here is fail-CLOSED: skipping the '
  'check would mean quoting a per-km fare to any address on Earth, not a labelled gap. Named '
  'fixed_routes pairs (service_zones) are unaffected by this column and keep working while it '
  'is NULL.';
```

Point-in-polygon runs **in the Worker**, not in Postgres — this repo has not installed PostGIS
(Phase 2's `0001_extensions.sql` installs `pgcrypto`, `btree_gist`, `citext`, `pgtap` only), and
adding it for one boolean check is disproportionate. A small, dependency-free ray-casting
implementation is exact enough for a polygon with dozens of vertices and runs in microseconds:

```ts
// apps/web/lib/geo/service-area.ts
type LngLat = [number, number];

/** Even-odd ray-casting point-in-polygon. `ring` is [lng,lat] pairs, first === last per GeoJSON. */
function pointInRing(pt: LngLat, ring: LngLat[]): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInServiceArea(
  pt: LngLat,
  geojson: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } | null,
): boolean {
  if (!geojson) return false; // fail-closed — §5.3
  const polygons = geojson.type === 'Polygon' ? [geojson.coordinates as LngLat[][]] : (geojson.coordinates as LngLat[][][]);
  return polygons.some(
    (rings) => pointInRing(pt, rings[0]) && !rings.slice(1).some((hole) => pointInRing(pt, hole)),
  );
}
```

### 5.4 The refusal contract

QUOTE-07: "refused... with a message saying which." `/api/quote` returns a structured reason, not
a generic 400 — three distinct i18n keys (Law 03, add to `vamos-i18n-dict.js` in the same pass
this ships), because "outside our area," "too soon," and "not drawn yet" are different facts a
customer needs different next steps for:

```ts
type QuoteRefusal =
  | { ok: false; reason: 'outside_service_area' }                              // §5.2 path 2, both paths failed
  | { ok: false; reason: 'below_min_advance'; min_advance_minutes: number }    // settings_versions non-null
  | { ok: false; reason: 'service_area_undefined' };                          // TBC — column is NULL

// UI: reason === 'service_area_undefined' renders the same data-tok TBC pill pattern as
// price CHF 000 — "service area TBC" — not the same copy as an actual out-of-area refusal,
// so a Zurich customer testing the funnel before the owner draws the polygon does not read
// "we don't serve you" when the truth is "we haven't drawn the map yet."
```

`min_advance_minutes` gets the **opposite** NULL handling from the service area, and the
justification has to travel with the code, not just live in this brief: a NULL threshold is safe
to skip (accept any future `scheduled_at`) because "no rule configured yet" and "no rule" are the
same observable behaviour for a threshold — Law 04's TBC treatment (render the gap, do not invent
`24`) already covers the *display* side via `settings.free_cancel_hours`-style TBC pills elsewhere.
A NULL service area is not a threshold with an unknown value, it is the absence of the entire
definition of where the fleet operates — "skip it" is not neutral, it is "accept everything,"
which is a materially different and unsafe default. Both are Law-04-compliant (neither invents a
number); they differ because the thing being skipped is different in kind.

---

## 6. Cost and abuse — what stops a request before it reaches Mapbox

This lane's job is to say **what gates exist between the public internet and the first Mapbox
call**, not to build the rate-limiter (that is the abuse-ratelimit lane's build). Three layers,
cheapest-to-reject first:

1. **Cloudflare Rate Limiting Rule** on `/api/quote*` and `/api/geo/*` — IP-based, evaluated at
   the edge before the Worker even runs the handler. Current dashboard/API shape (verified
   2026-08-22, `developers.cloudflare.com/waf/rate-limiting-rules/`): period is one of
   `10/60/120/300/600/3600/86400` seconds; action is `block`, `challenge`
   (interactive), `js_challenge`, `managed_challenge`, or `log`. Recommended shape for this
   route: 20 requests/60 s/IP, action `managed_challenge` (steps up to Turnstile rather than a
   hard block, so a customer on a slow connection retrying a quote is not locked out). **This
   requires a paid WAF plan tier for account-level custom rules** — flag as a cost line for
   whoever owns the Cloudflare plan decision, not a blocker for this lane.
2. **Turnstile** (Managed mode — the fully-automatic mode; most visitors pass invisibly, only
   suspicious traffic sees a checkbox) on the booking widget itself, triggered after N anonymous
   quotes in a session (GSD-LAUNCH's own phrasing). Verify server-side via `siteverify` before
   the Worker calls `/api/geo/*` or `/api/quote` at all — a request with a missing/invalid
   Turnstile token never reaches the Mapbox proxy layer.
3. **Session-token discipline on the Search Box proxy** (§3.1): the Worker rejects a
   `/api/geo/retrieve` call whose `session_token` was never seen in a prior `/suggest` from the
   same rate-limit bucket, which stops a scraper from skipping straight to `/retrieve` (the more
   expensive of the two Search Box calls) in bulk.

None of this is Mapbox-specific rate limiting (Mapbox's own limits are generous, §3.3/§4.3) — the
point of all three layers is that **an unauthenticated quote endpoint is itself the abuse target**,
independent of which upstream API it happens to call, exactly as the phase brief states.

---

## 7. Failure — Mapbox down or slow

Per the stack rule ("graceful degradation... flight autofill API down → prompt for manual time"),
the equivalent here:

| Failure | Behaviour |
|---|---|
| Search Box `/suggest` times out or errors | Autocomplete falls back to the saved-places list only (the mock already has this concept — `sug.saved` in `home.dc.html`); the free-text field still accepts manual typing, no address validation blocks it |
| Search Box `/retrieve` or Geocoding `/reverse` fails | The dropped pin or typed text is kept as free text (`pickup_text`/`dropoff_text` — already `not null` on `booking_legs`, `place_id`/`lat`/`lng` are nullable), and the quote proceeds to Directions with coordinates only if it has them — an address with no resolved coordinate cannot be priced or service-area-checked, so… |
| Directions fails (no coordinates, or Mapbox 5xx/timeout) | **The quote fails outright** — not a stale/estimated price. Return `{ ok: false, reason: 'route_unavailable' }`, a new i18n key ("We can't calculate this route right now — try again in a moment"), and let the customer retry. This is the one place degrading gracefully is not the safer choice: QUOTE-04's lock and QUOTE-07's area check both require a real distance; inventing one to keep the funnel moving is the exact failure mode ADR-002/Law 04 already forbid for prices. |
| Both fail, at volume (a real Mapbox outage) | Same behaviour as above, just more often — no special-cased "degraded mode" price. `/api/health` (already planned to check DB + Stripe + Mapbox per `CLOUDFLARE-RESOURCES.md:198`) is where an outage becomes visible to ops, not a silent fallback in the quote path. |

---

## 8. UNCERTAIN — carried forward with the check that settles it

| # | Item | Why it is open | Settling check |
|---|---|---|---|
| G1 | **Does Mapbox's self-serve Product Terms, as read in §2, actually block this product's storage of route distance/duration/coordinates on a booking record, or does an Order/Enterprise agreement already cover transportation-booking use cases as standard?** | I read the public, dated (2025-10-01) click-through Product Terms directly (PDF, `mapbox.com/legal/tos`) — I did not, and cannot, read a negotiated Order that does not exist yet. §2.10.1's no-cache clause for Navigation APIs has no stated exception; §2.7.3's Permanent Geocode path is conditioned in a way that reads as hostile to a shared cache but is *silent* on a per-booking, per-customer store (which is arguably not "shared" at all — one geocode, one booking, one End User). | **Before Mapbox sign-up**: email Mapbox sales with the one-sentence use case in §2.3. Get the answer in writing (an Order clause or an explicit sales confirmation) before `packages/db`'s `booking_legs.pickup_lat/lng` and `price_snapshots.distance_km/duration_min` columns go live against a real Mapbox account. This is the highest-leverage single action in this whole brief — it is a five-minute email that either confirms Phase 2's schema is fine as designed, or forces a design change before any code depends on it. |
| G2 | **Does the Search Box API expose a `permanent` parameter equivalent to Geocoding v6's, or is Search Box's output always "Temporary" with no permanent tier?** | §3.52's definition of Permanent Geocode names Geocoding API v5/v6 specifically ("`mapbox.places-permanent` mode" / "`permanent` parameter") and does not mention Search Box by name. The Search Box API reference pages I fetched (`docs.mapbox.com/api/search/search-box/`) do not list a `permanent` parameter among `/retrieve`'s documented params. | Read the live Search Box API parameter reference at sign-up time (`docs.mapbox.com/api/search/search-box/`, "Retrieve a suggested feature" section) for a `permanent` param; if absent, the only compliant way to permanently store a customer's chosen address is a **separate Geocoding v6 `permanent=true` forward-geocode call on the retrieved address string** at checkout time, not a persisted Search Box `/retrieve` response. Build the checkout-time re-resolve step assuming this is required until confirmed otherwise. |
| G3 | **Exact current Mapbox Directions/Search Box pricing, and whether the free-tier thresholds cited here (§4.3, from a August-2026 fetch of `mapbox.com/pricing`) still hold at whatever date implementation actually starts.** | Mapbox's pricing page has no stable dated URL/version the way the Product Terms PDF does, and pricing pages change without a changelog. | Re-fetch `mapbox.com/pricing` immediately before sign-up; do not rely on the numbers in this brief past that point. |
| G4 | **Cloudflare account plan tier required for custom Rate Limiting Rules on `/api/quote`** (§6.1) | I found the rule shape and actions from current Cloudflare WAF docs, but did not verify against this project's specific Cloudflare plan (`docs/build/CLOUDFLARE-RESOURCES.md` does not list a plan tier). | Confirm during Cloudflare account setup (owned by the abuse-ratelimit lane / whoever provisions the account) whether the plan includes custom Rate Limiting Rules, or whether the free/Pro tier's legacy IP-based rules are the only option — the fallback still works for this use case, just with a smaller parameter surface. |
| G5 | **Whether ADR-007's Smart Placement pinning (near Frankfurt) changes Mapbox call latency meaningfully.** | ADR-007 is itself unresolved (pending counsel). Mapbox's edge presence and Cloudflare's Smart Placement region are two different networks; I have no measured number for the round-trip from a Frankfurt-pinned Worker to Mapbox's nearest edge. | Measure once both Cloudflare (Phase 1, done) and a real Mapbox account exist — this is exactly the kind of number the owner-blockers section says cannot be asserted without real infrastructure. |

---

## 9. Conflicts to flag in the Phase 4 plan (do not silently resolve)

1. `GSD-LAUNCH.md` Phase 4 step 1 and `CLOUDFLARE-RESOURCES.md`'s `GEO_CACHE` row both describe a
   design (`24 h place-id-pair KV cache of Mapbox output`) that §2 shows is very likely
   non-compliant with Mapbox's default terms. Whoever writes the Phase 4 `PLAN.md` needs to either
   carry G1's resolution as a blocking pre-step, or explicitly accept the risk and say so.
2. Phase 2's `booking_legs`/`price_snapshots` columns for lat/lng/distance/duration are
   already-committed schema this lane must not edit — but the storage those columns imply is the
   same G1 question. Flag it against the schema, do not change the schema from this lane.

---

**Everything above uses `CHF 000` conventions where a price appears — none of this lane's work
touches an actual amount; that is the quote-engine-core lane.**
