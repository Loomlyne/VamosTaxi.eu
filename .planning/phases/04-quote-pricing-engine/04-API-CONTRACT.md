# Phase 4 API contract — Quote, geo, flight, reprice

**Written:** 2026-08-22. Companion to `04-RESEARCH.md`.
**Audience:** the implementer of the Worker routes and the booking-widget fetch client.
**Does not replace:** Phase 7's checkout/payment contract. This file specifies what checkout **must re-check** and what it **must not accept**. Idempotency of `bookings.idempotency_key` is **U20**, owned by Phase 7 — pointed at, not settled.

Base path is the public origin (`https://vamostaxi.eu` / staging). Locale prefix (`/de`, `/fr`, `/ar`) does **not** apply to `/api/*`. `Accept-Language` and the body's `locale` are hints for Mapbox `language=` and for which copy the **client** will render; the API returns i18n **keys**, never translated prose.

Anonymous access is the default. A signed-in customer cookie, if present, is ignored for pricing (the engine is not identity-scoped). It is read at **checkout** for coupon per-user caps and `bookings.customer_id`.

Every amount the API returns is `number | null` (integer rappen). `null` renders `CHF 000` (or the `display_currency` mark plus `000`) by data. This file contains no invented CHF figure.

---

## 0. What the widget collects, and whether the API accepts it

Cross-checked against `docs/build/SPEC-home-booking-widget.md` and `app/home/home.dc.html` (home) plus `app/pages/checkout.dc.html` (extras / coupon).

| Widget field | Where | Accepted on | Notes |
|---|---|---|---|
| Mode: one-way / return / hourly | Home tabs | `POST /api/quote` `mode` | `hourly` → `422 mode_not_offered` (D57). Default `one_way`. |
| Flight number | Home | **Not** on `/api/quote`. `GET /api/flight/:no` | Lookup fills pickup time in the widget; the quote then carries `scheduled_local` like any other time. `flight_no` is stored at booking, not required to price. |
| Flight date (today / tomorrow) | Home | Query on `/api/flight` | Europe/Zurich civil date. |
| Pickup text + suggestion pick | Home combobox | `pickup` Place | `mapbox_id` from `/retrieve`, or pin coordinates, or (fallback) free text **with** coordinates. Text alone cannot be priced. |
| Dropoff, same | Home | `dropoff` Place | Required for `one_way` and `return`. Absent for rejected hourly. |
| Swap ends | Home | Client swaps `pickup`/`dropoff` and re-POSTs | No dedicated route. |
| Dropped pin | Home map | Place `kind: "pin"` | Reverse-geocoded via `/api/geo/reverse` first, or the quote handler reverse-geocodes if only coords are sent. |
| Date + time (Zurich wall clock) | Home WhenPicker | `legs[].scheduled_local` | `'YYYY-MM-DDTHH:MM'`, no tz suffix. Required. |
| Return date + time | Home, when return | Second leg | Required when `mode: "return"`. |
| Passengers (0–8 stepper) | Home | `pax` | Server clamps per class; 0 is accepted and yields `no_eligible_class` (caps still returned). Production min for a **booking** is 1; a 0-pax quote is a planning probe. |
| Bags (0–8 stepper) | Home | `bags` | Same. |
| Selected vehicle class | Home fleet strip | `preferred_class` optional | **Does not change the board.** Server prices every class. Preference is for widget selection / auto-move only. |
| Language | Header | `locale` | `en\|de\|fr\|ar`. Mapbox `language=`. |
| Display currency | Header | `display_currency` | Mark only (ADR-004). Never a conversion. Default `CHF`. |
| Child seat | Checkout extras | `POST /api/quote/reprice` `extras.child_seats` | Not on the home quote. 0 or 1 in Phase 4 (U43). |
| Additional stops (0–3) | Checkout | `reprice` `extras.extra_stops` + `waypoints[]` | Stops change routed metres — reprice **re-runs Directions live** (no Mapbox KV) using lock pickup/dropoff + new waypoints, then prices. The lock's original `distance_m` is replaced only if the HMAC is over a **new** pin (reprice returns a new lock). See §3. |
| Oversized luggage | **Not in the mock** | `reprice` `extras.oversized_luggage` | QUOTE-11. Widget port adds the control. Boolean. |
| Coupon code | Checkout | `reprice` `coupon` | Informational `evaluate_coupon`. Not consumed. |
| Contact name / email / phone | Checkout Details | **Not** a quote field | Booking insert (Phase 7). Required before coupon per-user cap can use email. |
| Payment method | Checkout | **Not** a quote field | Phase 7 / Stripe. |
| Notes / accessibility | Checkout / later | **Not** a quote field | Booking row. |

### Fields that MUST NOT be accepted from the client

Rejected by zod on every quote/reprice/checkout-intent body (`error: "untrusted_input"`):

- `distance_m`, `distance_km`, `duration_s`, `duration_min`
- `total_rappen`, `subtotal_rappen`, `surcharges_rappen`, `discount_rappen`, any per-class amount
- `lines`, `policy`, `rate_version_id`, `settings_version_id`, `engine_version`
- `is_chargeable`, `pricing_live`, `expires_at` (client-supplied)
- An array of class ids to price (`classes: [...]` as input)
- Mapbox access tokens

If a client sends them they are **not** ignored-quietly — the request 400s so a compromised widget cannot look successful while smuggling a fare.

---

## 1. Shared conventions

### Authentication

| Route | Auth | Notes |
|---|---|---|
| `POST /api/quote` | Anonymous | `vamos_qs` cookie minted if absent. Turnstile token optional on 1st/2nd, required from 3rd. |
| `POST /api/quote/reprice` | Anonymous + valid lock | Same Turnstile/rate-limit bucket as quote. |
| `GET /api/geo/suggest` | Anonymous | Session token required. Rate-limited. Turnstile not required (type-ahead). |
| `GET /api/geo/retrieve` | Anonymous | Session token must have been seen on `/suggest`. |
| `GET /api/geo/reverse` | Anonymous | Rate-limited. |
| `GET /api/flight/:no` | Anonymous | Rate-limited. No Turnstile (a lookup is cheaper than Directions and already shape-gated). |
| `POST /api/checkout/intent` | Anonymous or signed-in | Phase 7 handler. Phase 4 specifies the quote re-check. Guest is allowed (PAY-03). |

No customer JWT is required to see a price. Staff tokens do not bypass rate limits on these public routes.

### Idempotency (U20 — not settled)

- `/api/quote` and `/api/geo/*` and `/api/flight/:no` are **not** idempotent in the PAY-05 sense. Repeating them mints a new lock / hits Mapbox / hits AeroDataBox (subject to the flight KV cache, which is ours).
- `POST /api/checkout/intent` **will** carry `idempotency_key`. Who mints it (browser per attempt vs derived from `quote_id`) and how it maps onto Stripe's `Idempotency-Key` is **Phase 7**. This contract only requires: the field exists on the checkout body, is forwarded, and is **not** interpreted by the quote engine. Do not derive a booking idempotency key from `quote_id` in Phase 4 — that would silently settle U20.

Turnstile `siteverify` uses its own `idempotency_key` (UUID per submit **attempt**, reused only on retry of that attempt). Unrelated to booking idempotency.

### Clocks

- `scheduled_local` is Europe/Zurich wall clock `'YYYY-MM-DDTHH:MM'`.
- `expires_at` is ISO-8601 timestamptz, authored by Postgres `now() + quote_lock_minutes`.
- Comparisons that refuse money use Postgres `now()`. Worker `Date` is decorative.

### Money

- Integer rappen or `null`. Never a decimal, never a formatted string in the JSON.
- `currency` on a snapshot/booking is always `CHF`. `display_currency` is the mark the customer saw.
- `pricing_live === false` ⇔ every `total_rappen` is `null` ⇔ checkout intent returns `409 pricing_not_live` before Stripe.

### Errors

Every error body:

```ts
interface ApiError {
  ok: false;
  error: string;          // machine code, stable, snake_case
  i18n_key: string;       // never English prose
  params?: Record<string, string | number | null>;
  action?: "requote" | "retry" | "reload_challenge" | "enter_time" | "disambiguate";
}
```

HTTP status is the transport; `error` is what the widget switches on. Do not parse status alone (a 409 is several different facts).

---

## 2. `POST /api/quote`

Prices every eligible class for a journey. Writes **no** database row (D42). Returns a signed lock.

### Request

```http
POST /api/quote
Content-Type: application/json
Cookie: vamos_qs=<uuid>          # minted on first page response if absent
```

```ts
interface QuoteRequest {
  locale: "en" | "de" | "fr" | "ar";
  display_currency: "CHF" | "EUR" | "USD" | "AED";
  mode: "one_way" | "return";          // "hourly" is 422, not in this union
  pickup: PlaceInput;
  dropoff: PlaceInput;
  legs: Array<{
    leg_seq: 1 | 2;
    scheduled_local: string;           // 'YYYY-MM-DDTHH:MM'
    flight_no?: string | null;         // stored later; ignored for pricing
  }>;                                  // length 1 or 2; 2 iff mode === "return"
  pax: number;                         // integer 0–16
  bags: number;                        // integer 0–16
  preferred_class?: "economy" | "business" | "first" | "van";
  turnstile_token?: string;
  geo_session?: string;                // Search Box session UUID, if pickup/dropoff are mapbox_ids
}

type PlaceInput =
  | { kind: "retrieve"; mapbox_id: string; session_token: string; text: string }
  | { kind: "pin"; lng: number; lat: number; text?: string }
  | { kind: "coords"; lng: number; lat: number; text: string; place_id?: string };
```

`legs[0]` is outbound (pickup → dropoff at `legs[0].scheduled_local`). `legs[1]`, when present, is the return (dropoff → pickup at `legs[1].scheduled_local`). The handler does not accept a different pair of coordinates for the return — ADR-006's web funnel is the reverse of the same two places. (Ops phone bookings with asymmetric returns are Phase 8.)

### Processing order (must not be reordered)

1. Zod. Unknown fields / untrusted money fields → `400 untrusted_input`.
2. Worker rate limit (`ip+vamos_qs` or bare-IP). Fail → `429 rate_limited`.
3. Turnstile: log always; enforce from 3rd in-window request → `403 turnstile_required`.
4. Daily Mapbox breaker. Fail → `503 temporarily_unavailable`.
5. Resolve coordinates (retrieve / reverse). Fail → `422 place_unresolved`.
6. Pickup === dropoff (same coords within ~10 m) → `422 same_place`.
7. Coords outside the generous CH+neighbours box → `422 place_out_of_box` (not the service-area message).
8. QUOTE-07 named-pair OR polygon. Fail → `422 out_of_service_area` or `422 service_area_undefined`.
9. `min_advance_minutes` if non-null: `scheduled_at` (Zurich) must be ≥ `now() + minutes`. Fail → `422 min_advance` with `{minutes}`. If the setting is NULL, skip.
10. Directions `mapbox/driving` for each leg, live, no KV. Fail → `422 route_unavailable`.
11. `select now() + quote_lock_minutes` (Postgres). Load rate book (cached Hyperdrive, no `now()` in SQL).
12. `priceQuote()`. Mint `quote_id`. HMAC the canonical pin.

### Response `200`

Matches quote-engine-core §10, reconciled with the other lanes:

```ts
interface QuoteResponse {
  ok: true;
  quote_id: string;                    // uuid
  lock: string;                        // opaque HMAC token; client echoes it back
  expires_at: string;                  // ISO timestamptz, 30 min (settings.quote_lock_minutes)
  engine_version: string;              // 'quote-engine@<git-sha>'
  pricing_live: boolean;               // false ⇒ every total_rappen is null
  rate_version: { id: number; slug: string } | null;  // null iff no live (and no preview) version
  settings_version_id: number;
  display_currency: "CHF" | "EUR" | "USD" | "AED";
  route: {
    legs: Array<{
      leg_seq: 1 | 2;
      distance_m: number;
      duration_s: number;
      geometry: GeoJSON.LineString;    // QUOTE-01 draw; request-scoped; not a KV cache
      origin_zone_id: string | null;
      dest_zone_id: string | null;
    }>;
  };
  no_eligible_class: boolean;
  classes: Array<{
    slug: "economy" | "business" | "first" | "van";
    eligible: boolean;
    ineligible_reason: "pax" | "bags" | "unavailable" | "no_rate" | "route_off" | null;
    effective_max_pax: number;
    max_bags: number;
    fixed_route: boolean;
    total_rappen: number | null;       // null ⇒ CHF 000
    lines: Line[];                     // complete shape even when unpriced
  }>;
  policy: PolicySnapshot;
}
```

`Line` and `PolicySnapshot` are the shapes in `04-RESEARCH.md` §13. `amount_rappen` may be `null`. `policy.min_advance_minutes` / waiting minutes may be `null`.

When `pricing_live` is false the widget still paints the route, still clamps pax/bags, still shows the class board with `CHF 000`, and **does not** enable a checkout CTA.

### Lock pin (canonical JSON inside the HMAC)

The client never decodes this; documented so checkout recompute is implementable.

```ts
interface QuoteLockPayload {
  v: 1;
  quote_id: string;
  exp: string;                         // timestamptz, Postgres-authored
  engine_version: string;
  rate_version_id: number | null;
  settings_version_id: number;
  computed_at: string;
  display_currency: "CHF" | "EUR" | "USD" | "AED";
  mode: "one_way" | "return";
  pax: number;
  bags: number;
  legs: Array<{
    leg_seq: 1 | 2;
    pickup: { lng: number; lat: number; text: string; place_id?: string };
    dropoff: { lng: number; lat: number; text: string; place_id?: string };
    scheduled_local: string;
    distance_m: number;
    duration_s: number;
    origin_zone_id: string | null;
    dest_zone_id: string | null;
    waypoints: Array<{ lng: number; lat: number; text: string }>;  // empty on first quote
  }>;
  class_totals: Array<{ slug: string; total_rappen: number | null }>;
}
```

HMAC-SHA256 over the UTF-8 canonical JSON (sorted keys, no whitespace) with `QUOTE_LOCK_SECRET`. Token format: `base64url(payload) + "." + base64url(mac)`.

Pinning `distance_m` / `duration_s` for 30 minutes is storing a Navigation API result. That is U33. QUOTE-04 cannot hold a price without it.

---

## 3. `POST /api/quote/reprice`

Checkout extras / coupon. Still **no** snapshot write.

Extras can change routed metres (additional stops). Reprice **must** re-run Directions live when `waypoints` change, then mint a **new** lock (new `quote_id`, new `expires_at`, 30 minutes from **this** call). A coupon-only reprice (waypoints unchanged) **keeps** the original `quote_id` and original `expires_at` and original metres — it only rebuilds lines. Mixing the two in one request follows the stricter rule: if waypoints changed, new lock.

### Request

```ts
interface RepriceRequest {
  quote_id: string;
  lock: string;
  locale: "en" | "de" | "fr" | "ar";
  display_currency: "CHF" | "EUR" | "USD" | "AED";
  preferred_class?: "economy" | "business" | "first" | "van";
  extras?: {
    child_seats?: 0 | 1;
    extra_stops?: 0 | 1 | 2 | 3;
    oversized_luggage?: boolean;
    waypoints?: Array<{ lng: number; lat: number; text: string }>; // length === extra_stops, outbound
  };
  coupon?: string | null;
  contact_email?: string | null;       // lets per-user cap run before booking insert; optional
  turnstile_token?: string;
}
```

`pax`, `bags`, places, times are **not** accepted here. They come from the lock. Sending them is `400 untrusted_input`. To change them the widget goes back to `/api/quote`.

`extra_stops > 3` or `waypoints.length !== extra_stops` → `422 extras_max_stops`.

### Coupon informational result

On the 200, alongside the class board:

```ts
coupon: null | {
  code: string;                        // normalised upper
  applied: boolean;
  rule: "ok" | "not_found" | "inactive" | "not_yet_valid" | "expired"
      | "unpriced" | "usage_cap" | "per_user_cap";
  i18n_key: string;                    // when applied === false
};
```

`applied: false` means the board is the no-coupon price. Never a silent zero.

### Response `200`

Same `QuoteResponse` as `/api/quote`, plus the `coupon` object. `quote_id` / `lock` / `expires_at` refreshed if waypoints changed, reused if not.

---

## 4. Geo proxies (QUOTE-01)

Mapbox token never reaches the browser. Live calls, no KV of Mapbox responses (D52).

### `GET /api/geo/suggest`

```
GET /api/geo/suggest?q={text}&session_token={uuid}&locale={en|de|fr|ar}&proximity={lng},{lat?}
```

- `q` min 3 characters, max 200. Shorter → `200 { suggestions: [] }` (not an error).
- `session_token` required, UUID. Remembered in-memory / short KV **of our session-token set** (not a Mapbox response) for retrieve-gating. This is our bookkeeping, not Licensed Map Content.
- Forwards `language`, `country=CH`, `proximity` default `8.5417,47.3769`, `types=address,poi,street,place`, `limit=6`.

`200`:

```ts
{ ok: true; suggestions: Array<{ mapbox_id: string; name: string; address: string; context: string }> }
```

No coordinates. Mapbox down → `200 { suggestions: [], degraded: true }` and the widget falls back to saved places + free text. `i18n_key` for the empty chrome is `quote.geo.suggest_unavailable` when `degraded`.

### `GET /api/geo/retrieve`

```
GET /api/geo/retrieve?mapbox_id={id}&session_token={uuid}&locale={en|de|fr|ar}
```

Session token must have been seen on `/suggest` from the same rate-limit bucket, else `403 retrieve_without_suggest` (abuse, not a customer-facing copy on the happy path).

`200`: `{ ok: true; place: { mapbox_id, name, address, lng, lat } }`. Coordinates exist here so the widget can drop a pin; they are **not** shown as digits (Law / Mapbox §2.7.1(v)(b)).

These coordinates are Temporary Geocodes. They must not be persisted except via the checkout-time Permanent Geocode path (U34).

### `GET /api/geo/reverse`

```
GET /api/geo/reverse?lng={}&lat={}&locale={en|de|fr|ar}
```

Geocoding v6. `200`: `{ ok: true; place: { name, address, lng, lat } }` or `{ ok: true; place: null }` if nothing addressable. Fail → keep the pin, ask the customer to type (`quote.geo.suggest_unavailable`).

---

## 5. `GET /api/flight/:no` (QUOTE-08)

```
GET /api/flight/{no}?date=YYYY-MM-DD&locale=en
```

`no` is normalised server-side (uppercase, strip non-alphanumerics). Display form `LX 318` is a client concern (`.vt-dir-keep`).

| Condition | Status | `error` | `i18n_key` | `action` |
|---|---|---|---|---|
| Does not match `^[A-Z0-9]{2}\d{1,4}$` | 400 | `malformed` | `quote.flight.malformed` | — |
| 200 from AeroDataBox, zero records | 404 | `not_found` | `quote.flight.not_found` | `enter_time` |
| More than one record (overnight) | 200 | — | — | `disambiguate` — body includes `candidates[]` |
| Timeout / 5xx / RapidAPI 429 | 503 | `provider_unavailable` | `quote.flight.unavailable` | `enter_time` |

Success `200`:

```ts
{
  ok: true;
  flight: {
    number: string;                    // normalised
    date: string;                      // YYYY-MM-DD asked
    landing_at: string;                // ISO timestamptz
    landing_local: string;             // 'YYYY-MM-DDTHH:MM' Europe/Zurich — widget writes this into WhenPicker
    landing_source: "scheduled" | "estimated" | "actual";
    origin_iata?: string;
    dest_iata?: string;
    terminal?: string | null;
    gate?: string | null;
    baggage_belt?: string | null;
  };
  cache_hit: boolean;
}
```

No `buffer_minutes`. No polling endpoint. Re-requesting is the refresh. KV key `flight:{NUMBER}:{DATE}`, TTL 90 s / 30 min / 6 h, no customer id in the key.

The quote POST does not call this. The widget calls it, fills `scheduled_local`, then quotes.

---

## 6. `POST /api/checkout/intent` — quote re-check (Phase 7 handler, Phase 4 rules)

Phase 7 writes the route. Phase 4 binds the **quote-side** of it so an expired or mutated quote cannot pay.

### Request (quote-relevant subset)

```ts
interface CheckoutIntentRequest {
  quote_id: string;
  lock: string;
  vehicle_class: "economy" | "business" | "first" | "van";
  extras?: RepriceRequest["extras"];
  coupon?: string | null;
  contact: { name: string; email: string; phone: string };
  locale: "en" | "de" | "fr" | "ar";
  display_currency: "CHF" | "EUR" | "USD" | "AED";
  idempotency_key?: string;            // U20 — Phase 7 defines lifetime; Phase 4 does not interpret
  turnstile_token?: string;
}
```

Still rejected: distance, totals, `rate_version_id`, `lines`, client `expires_at`.

### Server-side refusal (QUOTE-04 / 10) — not bypassable in the UI

Order, none skippable:

1. Verify HMAC. Fail → `404 quote_not_found` (same status/body as unknown id — no oracle).
2. Decorative: Worker `expires_at <= now()` → `409 quote_expired` `action: "requote"`.
3. **Authoritative:** in the DB transaction, `lock.exp <= now()` (Postgres) → `409 quote_expired`.
4. `pricing_live` / chosen class `total_rappen` is null → `409 pricing_not_live`. Checkout is unreachable. No Stripe. No snapshot. No reference burned.
5. Recompute `priceQuote` against the pin + extras + coupon. Chosen class total ≠ locked class total → `409 price_changed`. `ENGINE_VERSION !== lock.engine_version` → `409 engine_changed`. Both `action: "requote"`.
6. Create Stripe PaymentIntent **outside** the DB transaction (never hold a SQL tx across the network).
7. One DB transaction: insert snapshot (chosen class, `shown_alternatives`, `expires_at = now() + payment_window` — U49), booking, legs (Permanent Geocode re-resolve of pickup/dropoff, U34), snapshot legs, bind `booking_id`, insert `booking_payments` (`requires_payment`). Charge gate + coupon `FOR UPDATE` fire here.
8. Gate `restrict_violation` → roll back, `paymentIntents.cancel()`, `409` with the matching code (`quote_expired` / `coupon_no_longer_valid` / `pricing_not_live`).

Deleting step 2 does not change correctness. A `curl` of a held, expired `quote_id` still dies at step 3 or 8.

When `pricing_live` is false this route is a 409 at step 4 for every caller, including ops pretending to be the widget.

`app.checkout_quote` (lock-lane SECURITY DEFINER read of an unbound snapshot) is **not** used on this path: D42 means there is no unbound web snapshot to read. The lock token *is* the quote.

---

## 7. Error vocabulary

| `error` | HTTP | `i18n_key` | Rule that failed | `action` |
|---|---|---|---|---|
| `untrusted_input` | 400 | `quote.error` | Client sent distance / total / rate version / lines | — |
| `malformed` | 400 | `quote.flight.malformed` | Flight number shape | — |
| `mode_not_offered` | 422 | `quote.error.mode_not_offered` | `hourly` | — |
| `place_unresolved` | 422 | `quote.geo.no_results` | Retrieve/reverse produced no coords | — |
| `same_place` | 422 | `quote.error` | Pickup and dropoff are the same point | — |
| `place_out_of_box` | 422 | `quote.error.out_of_service_area` | Coords outside CH+neighbours box (pre-Mapbox) | — |
| `out_of_service_area` | 422 | `quote.error.out_of_service_area` | QUOTE-07 path 2, both ends not in polygon and not a named pair | — |
| `service_area_undefined` | 422 | `quote.error.service_area_undefined` | Polygon NULL and not a named pair. Render as TBC pill, not "we don't serve you." | — |
| `min_advance` | 422 | `quote.error.min_advance` | Inside `settings_versions.min_advance_minutes`. `params.minutes` is the setting, never a constant. This code is **not emitted** while the setting is NULL. | — |
| `route_unavailable` | 422 | `quote.error.route_unavailable` | Directions failed / timed out | `retry` |
| `extras_max_stops` | 422 | `quote.extras.error.max_stops` | Stops > 3 | — |
| `extras_max_child_seats` | 422 | `quote.extras.error.max_child_seats` | Count outside 0–1 in Phase 4 | — |
| `no_settings_version` | 500 | `quote.error` | Catalogue bug, not a customer input | `retry` |
| `rate_limited` | 429 | `quote.error.rate_limited` | Worker `ratelimits` binding | `retry` |
| `turnstile_required` | 403 | `quote.error.turnstile_required` | 3rd+ request, token missing/fail | `reload_challenge` |
| `retrieve_without_suggest` | 403 | `quote.error` | Abuse of `/retrieve` | — |
| `temporarily_unavailable` | 503 | `quote.error.temporarily_unavailable` | Daily Mapbox breaker, or geo fully down at volume | `retry` |
| `provider_unavailable` | 503 | `quote.flight.unavailable` | AeroDataBox down | `enter_time` |
| `not_found` | 404 | `quote.flight.not_found` | No flight on that number+date | `enter_time` |
| `quote_not_found` | 404 | `quote.error.expired` | Bad HMAC / unknown `quote_id`. Same body as expired-or-forged. | `requote` |
| `quote_expired` | 409 | `quote.error.expired` | 30-min lock passed (Postgres) | `requote` |
| `pricing_not_live` | 409 | `quote.error.pricing_not_live` | No live rate version / total null / not chargeable | — |
| `price_changed` | 409 | `quote.error.price_changed` | Recompute ≠ lock (rate version retired+replaced under the same id is impossible; this is pin mismatch or extras that could not be applied) | `requote` |
| `engine_changed` | 409 | `quote.error.engine_changed` | Deploy mid-checkout | `requote` |
| `coupon_no_longer_valid` | 409 | `quote.error.coupon_no_longer_valid` | `evaluate_coupon` was `ok` at reprice, not `ok` at PI creation | `requote` |
| `partially_priced_class` | 500 | `quote.error` | Engine bug: mixed null/non-null amounts | `retry` |

Edge `managed_challenge` (zone RL) is **not JSON**. The widget treats a non-JSON quote response as `action: "reload_challenge"`.

Coupon **informational** failures are not HTTP errors; they ride on a 200 reprice with `coupon.applied: false` and `coupon.i18n_key` one of:

- `quote.coupon.error.not_found`
- `quote.coupon.error.inactive`
- `quote.coupon.error.not_yet_valid`
- `quote.coupon.error.expired`
- `quote.coupon.error.unpriced`
- `quote.coupon.error.usage_cap`
- `quote.coupon.error.per_user_cap`

Ineligible classes are not errors (200, `eligible: false`). `no_eligible_class: true` is not an error.

---

## 8. Rate limit and Turnstile (QUOTE-09)

Applied to `POST /api/quote`, `POST /api/quote/reprice`, `POST /api/checkout/intent`. Geo suggest is Layer 1 + Worker limit only (no Turnstile). Flight is Worker limit only.

| Layer | Where | Key | Threshold | Action |
|---|---|---|---|---|
| 1 | Zone WAF | `ip.src` | 30 / 60 s | `managed_challenge` (HTML/JS, not JSON 429) |
| 2a | Worker binding | `ip + vamos_qs` | 8 / 60 s | JSON `429 rate_limited` |
| 2b | Worker binding | `ip` (no cookie) | 4 / 60 s | JSON `429 rate_limited` |
| 3 | Worker + siteverify | same as 2a | 1st–2nd: log; 3rd+: require success | JSON `403 turnstile_required` |
| 4 | `QUOTE_ABUSE` KV | `quote:mapbox-budget:YYYY-MM-DD` | U37, sentinel until a Mapbox plan exists | JSON `503 temporarily_unavailable` |

Turnstile down: below threshold fail-open; at/above, Layer 1 is the remaining gate. Siteverify timeout budget 2 s, one retry with the same Turnstile `idempotency_key`.

`vamos_qs`: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`. Set on the first document response if absent. Not a customer identifier; not written to logs in raw form (hash if needed).

---

## 9. `pricing_live=false` contract

When no `rate_versions` row has `status='live'` (and staging `PRICING_PREVIEW` is not set):

- `POST /api/quote` still **200**s: route, eligibility, policy, complete `lines` with `amount_rappen: null`, `pricing_live: false`, `total_rappen: null` on every class, `rate_version: null`.
- The widget renders `CHF 000` via `formatRappen(null)` and disables checkout.
- `POST /api/quote/reprice` same.
- `POST /api/checkout/intent` **409 `pricing_not_live`**. No Stripe, no snapshot, no `VT-YY-####`.
- A direct `INSERT INTO booking_payments` still raises `restrict_violation` (`is_chargeable` false; `charged_rappen > 0` cannot be satisfied by a null total).

Staging `PRICING_PREVIEW=true`: quote/reprice resolve the newest **draft** and may return non-null rappen **for display**. Checkout intent still 409s (`rate_version_is_live` is trigger-derived from `status`, not from the env var). Production Worker must not bind the variable.

---

## 10. What checkout inherits (forward-compat, not this phase's handler)

- A `quote_id` + `lock` pair that can become one booking. U20 (idempotency key lifetime) is Phase 7.
- One snapshot, chosen class, `shown_alternatives` for the board the customer saw. Phase 9 refunds read `bookings.price_snapshot_id`, never re-run this engine.
- `price_snapshot_legs.leg_subtotal_rappen` is the single-leg refund basis. Booking-level lines carry `allocation: "pro_rata"`.
- `estimated_duration_minutes` on each `booking_legs` row, from the lock's `duration_s` (floored at 30 by the generated range if ever missing — the web path must not write missing).
- Coupon consumption at PI creation (D50). A Phase 9 refund of a booking that consumed a use does **not** automatically restore the use — that restoration policy is Phase 9, not implied here.
- Error keys above are the Phase 5 widget's switch table. No English prose in the JSON.

---

## 11. Test proofs this contract owes

These are the done-when checks from the handoff, stated as tests so they cannot shrink to "the UI hides it."

| Claim | Proof |
|---|---|
| Expired quote refused server-side | `curl` POST `/api/checkout/intent` with a lock whose `exp` is in the past, no browser. Expect 409 `quote_expired`. Repeat with the Worker-side expiry `if` deleted; still 409. |
| UI countdown bypass | Same, with a forged `expires_at` in the JSON body (must 400 `untrusted_input`) and with a patched client that always shows "29:00". |
| Client cannot set the price | Body with `total_rappen: 1` (or any integer) → 400 `untrusted_input`. Body with `distance_m` → 400. |
| `pricing_live=false` | Seed with zero live versions. Quote 200, all totals `null`. Checkout intent 409. `INSERT booking_payments` raises. Rendered amount `CHF 000`. |
| Lines sum to total | When a draft version is previewed on staging, a snapshot INSERT whose `total_rappen` is off by 1 raises `restrict_violation`. Unpriced + a priced line raises. |
| Coupon last-use race | Two parallel checkout intents on `global_limit = 1`. One 200, one 409 `coupon_no_longer_valid`. One `coupon_redemptions` row. |
| QUOTE-07 which-rule | Outside polygon → `out_of_service_area`. Inside polygon, too soon, setting non-null → `min_advance` with `{minutes}` from the row. Polygon NULL, not a named pair → `service_area_undefined`. |
| No class eligible | 8 pax against Van effective 7 → 200, `no_eligible_class: true`, Van `ineligible_reason: "pax"`, no 422. |
| Hourly | `mode: "hourly"` → 422 `mode_not_offered`. |
| Mapbox down | Directions 5xx → 422 `route_unavailable`, no invented metres. |
| Flight down | 503 `provider_unavailable`, pickup time still editable. |

---

## 12. Secrets and bindings this contract needs

| Name | Kind | First consumer |
|---|---|---|
| `MAPBOX_TOKEN` | wrangler secret | `/api/geo/*`, `/api/quote` Directions |
| `QUOTE_LOCK_SECRET` | wrangler secret | HMAC |
| `TURNSTILE_SECRET` | wrangler secret (already inventoried) | siteverify |
| `FLIGHT_API_KEY` | wrangler secret | `/api/flight/:no` |
| `QUOTE_RATE_LIMITER` | `ratelimits` binding | `/api/quote` |
| `QUOTE_ABUSE` | KV namespace (new, not `GEO_CACHE`) | daily breaker |
| `GEO_CACHE` | KV (existing) | **polygon + hand-curated fixed-route geometry only** |
| `QUOTE_ABUSE_METRICS` | Analytics Engine dataset | trip/failure points |
| `HYPERDRIVE` | cached | rate book, settings_versions (no `now()`) |
| `HYPERDRIVE_NOCACHE` | cache-disabled | coupon eval, lock `now()`, snapshot write |
| `PRICING_PREVIEW` | env, staging **only**, absent in production | draft numbers for display |

Do not bind a Mapbox response cache key scheme. U33 forbids planning it.

---

## Metadata

- **Routes specified:** `POST /api/quote`, `POST /api/quote/reprice`, `GET /api/geo/suggest`, `GET /api/geo/retrieve`, `GET /api/geo/reverse`, `GET /api/flight/:no`, quote-side of `POST /api/checkout/intent`
- **U20:** pointed at Phase 7, not settled
- **U33:** live Mapbox, no KV of Mapbox, lock-pin of metres named as the same legal question
- **Amounts:** `null` → `CHF 000` only
