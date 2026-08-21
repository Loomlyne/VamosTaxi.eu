# Phase 4 Research — Quote & Pricing Engine

**Written:** 2026-08-22. Synthesised from the six harvested Phase 4 lanes. Not re-researched.
**Extends:** Phase 2 `D1–D24` (settled; not re-litigated). New decisions start at **D41** (Phase 3 already took D25–D40).
**Companion:** `04-API-CONTRACT.md` — the HTTP contract this document's engine produces.
**U-item numbering:** Phase 3 took U23–U32. New Phase 4 items start at **U33**.

---

## What Phase 4 must produce

1. A **pure, integer-only quote engine** (`apps/web/lib/pricing/`) that prices every eligible vehicle class from a frozen `rate_versions` book. Same inputs + same rate version yield the same document forever (QUOTE-05). No float, no `Date.now()` inside the kernel, no live join to a mutable pricing row.
2. `POST /api/quote` (anonymous, rate-limited, Turnstile-escalated) that geocodes, routes, applies QUOTE-07, returns a locked quote, and **writes no `price_snapshots` row**. Sibling routes: Search Box proxy, reverse geocode, flight lookup, checkout reprice. Specified in `04-API-CONTRACT.md`.
3. The 30-minute lock (QUOTE-04) as a **server-signed pin of inputs and version ids**, refused **server-side** at checkout even if the UI countdown is bypassed. `price_snapshots.expires_at` is a second, later clock — the payment window — written once, never extended (D19).
4. Exactly **one `price_snapshots` row per booking**, for the **chosen class**, written inside the booking-creation / PaymentIntent-creation transaction, with `shown_alternatives jsonb` carrying the price board the customer saw (U6, settled here, **contradicting** Phase 2's recommendation).
5. Coupon validation at reprice and **consumption at PaymentIntent creation** under `SELECT … FOR UPDATE` on the `coupons` row. No KV reservation (U7, settled here, **contradicting** Phase 2's recommendation).
6. Child seat, additional stop and oversized luggage each as their **own** `surcharges` line (QUOTE-11). A ninth seeded code `oversized_luggage`. Additional stops go into the Directions waypoint list **before** the fare is computed.
7. Five-layer `pricing_live=false` (D9): no live `rate_versions` row ⇒ every `total_rappen` is `null` ⇒ `CHF 000` by data ⇒ checkout unreachable ⇒ `tg_payment_matches_snapshot` refuses every charge. The engine ships this way. Real numbers are last and small.
8. Additive schema (Phase 4 migrations, not a rewrite of Phase 2): `surcharges.predicate`, `surcharges.quantity_source`, `price_snapshots.shown_alternatives`, `settings_versions.service_area_geojson`, `settings.quote_lock_minutes`, flight provenance columns, `evaluate_coupon()`, coupon-reserve trigger, lines-reconcile trigger, charge-gate `SECURITY DEFINER`. **No invented columns that replace Phase 2's.**
9. Four-language copy for every string this phase introduces, ICU not concatenation, instructions not blame. Arabic is first-class RTL; place names, flight numbers, coupon codes and `CHF 000` wear `.vt-dir-keep`.

### The corrections that changed the shape

Four findings from the lanes, plus one independent terms check, that Phase 2 (or GSD-LAUNCH) had slightly or fully wrong. Named here so a later reader does not "fix" them back.

| # | What was said | What Phase 4 says | Why |
|---|---|---|---|
| 1 | Phase 2 U6 recommendation: one `price_snapshots` row per eligible class per quote (`02-SCHEMA-DRAFT.md` comment on `quote_id`) | **One row, chosen class, written inside the booking transaction.** Shown board in `shown_alternatives`. `/api/quote` writes nothing. | §4. The widget re-quotes on a 300 ms debounce; N-rows-per-quote is 40–120 immutable jsonb rows per abandoned session on a public anonymous endpoint. |
| 2 | Phase 2 U7 recommendation: consume at payment, with a **soft KV reservation** across the 30-minute window | Consume at **PaymentIntent creation**, `SELECT … FOR UPDATE` on `coupons`, **no KV reservation**. | §6. The coupon field is not on `/api/quote`; `coupon_redemptions.booking_id` is `NOT NULL`; a KV slot would be a second source of truth for a race the schema already serialises. |
| 3 | Phase 2 schema comment: "the snapshot's `expires_at` is **extended** to cover the payment window at intent creation" | The snapshot is append-only (D19). It **cannot** be extended. Two clocks, each in the right place. | §5. `tg_append_only` requires every column other than `booking_id` to be byte-identical on the one permitted UPDATE. |
| 4 | GSD-LAUNCH / `CLOUDFLARE-RESOURCES.md`: Mapbox Geocoding + Directions "cached in Cloudflare KV by place-id pair (24 h TTL)" | **Barred** under current self-serve Mapbox Product Terms. Live Mapbox on every quote. `GEO_CACHE` holds only our polygon and hand-curated fixed-route geometry. | §7. Independently verified 2026-08-22 against the 21 July 2026 PDF. Owner decision, not an engineering preference. |
| 5 | quote-lock-expiry lane: the 30-minute lock **is** `price_snapshots.expires_at` | That assumption requires a snapshot row at quote time, which U6 (this document) just forbade. The 30-minute lock is a **signed token**; `expires_at` on the snapshot is the payment window. | §5. Named, not silently merged. |

---

## Inherited from Phase 2 — binding, not reopened

| # | Binding fact | Phase 4 consequence |
|---|---|---|
| D3 | Two Hyperdrive configs | Rate book and `settings_versions` (no `now()` in SQL) go through **`HYPERDRIVE`** (cached). Coupon validation, snapshot write, charge path go through **`HYPERDRIVE_NOCACHE`**. |
| D6 | `rappen` int4; half-up per line; total = sum of already-rounded lines | Integer kernel. Metres in, not 2-dp km. `numeric` percent arrives as a **string**. Database trigger refuses a snapshot whose `total_rappen ≠ Σ lines`. |
| D7 | Versioned `rate_versions` + insert-only `price_snapshots` | Engine loads a version **by id**, never "whatever is live now" at recompute. Snapshot embeds numbers in `basis`, cites `source_row`. |
| D8 | Line labels are i18n key + numeric params | Never English prose on a line. Coupon `code` is the one literal (`.vt-dir-keep`). |
| D9 | `pricing_live` is exactly one `rate_versions` row with `status='live'` | There is no boolean to flip. No live row ⇒ every amount `null` ⇒ `CHF 000`. |
| D10 | `settings` + `settings_versions` | Policy on the snapshot comes from `settings_versions` as of `computedAt`. Advance time and waiting allowances are versioned; quote-lock minutes are an engine parameter on `settings`. |
| D11 | One booking, one snapshot, `price_snapshot_legs` per-leg subtotals | Return-trip discount is booking-level. One class serves both legs. |
| D12 | `VT-YY-####` from a per-year sequence | Minted at booking insert, never at quote. `/api/quote` does not burn a reference. |
| D19 | Append-only: trigger + REVOKE + RLS-no-policy + FORCE RLS | No `expires_at` UPDATE. No mutating "expire stale quotes" Cron on `price_snapshots`. |
| ADR-002 | Waiting allowances seed NULL | Engine refuses to substitute 60/15. Included waiting lines carry `amount_rappen: null` and `included_minutes: null`. Flight autofill does not invent a landing buffer. |
| ADR-004 | Currency switch is a **mark**, never a conversion | Engine returns CHF rappen (or `null`) plus `display_currency`. |
| ADR-006 | Return = two `booking_legs` | Directions is one call per leg. Extra stops at MVP apply to the outbound leg only (UI collects them once). |

### Four GSD-LAUNCH vs Phase 2 schema conflicts — unresolved owner rulings

GSD-LAUNCH is a binding handoff document and it contradicts the Phase 2 schema in four places. **Nobody has ratified the Phase 2 side.** Phase 4 designs against the Phase 2 schema. A contrary owner ruling on any of these changes Phase 4.

| GSD-LAUNCH says | Phase 2 design says | Phase 4 follows | If the owner sides with GSD-LAUNCH |
|---|---|---|---|
| `bookings.price_chf numeric` | `price_snapshot_id` → `price_snapshots` | snapshots (D7) | The quote response, the charge gate, LIFE-03 refunds and this entire engine rewrite |
| `bookings.manage_token uuid` | `booking_access_tokens` (hashed, rotatable) | tokens table (D14) — not a quote concern, carried so it is not "fixed" later | Phase 7 manage-link issuance, not the quote POST |
| `bookings.assigned_chauffeur_id` | assignment on `booking_legs` | legs (ADR-006 / D11) | `estimated_duration_minutes` still has to land on a leg; the exclusion constraint moves |
| `settings` as one mutable row | `settings` + immutable `settings_versions` | split (D10) | Policy snapshot shape, `min_advance_minutes` source, service-area column host |

These are **not** re-litigated here. They are owner blockers on Phase 2 execution; Phase 4 inherits whichever schema actually gets migrated.

---

## 1. The pipeline (QUOTE-03, QUOTE-05) — Wave B `quote-pipeline-order`

```
        ┌─ inputs pinned by the quote lock ─────────────────────────────┐
        │ legs[] (distance_m, duration_s, scheduled_local, zones,        │
        │         waypoints)                                             │
        │ pax, bags, extras, coupon_code, display_currency               │
        │ rate_version_id, settings_version_id, engine_version           │
        └───────────────────────────────────────────────────────────────┘
                              │
  1. RESOLVE   live rate_versions row (D9)  ─── none? → pricing_live=false path (§8)
  2. LOAD      the frozen rate book for that version id  (one cached round trip)
  3. ELIGIBLE  per class: pax / bags / available / priced
  4. FARE      per leg:  fixed_routes match  ∥  base + per_km·metres, then min-fare
  5. SURCHARGE per leg:  percent (basis = that leg's FARE line only)
                         amount (airport pickup, extra stop, …)
                         included (waiting — amount NULL, never a number)
  6. EXTRAS    quantity-sourced amount surcharges (child seat, oversize, extra stop)
  7. RETURN    booking-level percent of Σ FARE lines   (U16 — no number seeded)
  8. COUPON    booking-level discount on the running pre-coupon total, clamped ≥ 0
  9. ASSEMBLE  subtotal = ΣFARE · surcharges = ΣSURCHARGE · discount = −ΣDISCOUNT
               total    = subtotal + surcharges − discount  ≡  Σ lines
```

### Why this order, and why a different order is different money

**Percent surcharges take the leg's fare line as basis, never a running total, never another surcharge.** Three reasons:

1. They become **commutative**. Percent-of-running-total makes `night` then `ski_season` ≠ `ski_season` then `night`, and the answer would depend on Postgres row order — which has no `ORDER BY` guarantee. Pinning the basis removes the ordering question (QUOTE-05, threat T5).
2. It is the only statement a customer can verify. "Night surcharge, a percentage of the fare" is checkable against the fare line above it. A Stripe dispute packet has to survive being read by a stranger.
3. Percent-of-percent is not defensible. There is no reading of the mock's night window under which the night surcharge also taxes the child seat.

**The coupon is last, on the pre-coupon total, after the round-trip discount.** The mock already renders this sequence (`checkout.dc.html` transfer → airport fee → child seat → additional stops → waiting (`included`) → coupon as a credit). A coupon is a discount on **what is payable**, not a discount on the transport component.

**The one percent rule, with one exception:**

> Every percentage in this engine is a percentage of fare lines. The single exception is the coupon, which is a percentage of the pre-coupon total, because a coupon discounts what is payable.

**Min-fare bites the fare line, before any surcharge.** Otherwise a 23:10 pickup on a short hop could be lifted over the minimum by the night surcharge and the customer would pay less than the minimum *for the ride*.

**Fixed routes ignore base / per-km / min-fare entirely.** A fixed route is a price, not a formula. `basis.rule = 'fixed_route'`.

### Conflict named: coupons-extras compounding vs this order

`coupons-extras.md` §2.3 proposed that a round-trip discount and a coupon are **both** computed against the same pre-discount `subtotal + surcharges` and **summed, not compounded**. This document follows **quote-engine-core**: round-trip first (percent of fare lines), then coupon (percent of the running pre-coupon total, which already includes the round-trip line). The two are different money the moment U16 lands a number. The engine-core rule is the one the mock renders and the one that makes percent surcharges commutative. Coupons-extras' additive-not-compounded sketch is **rejected** for the sequential coupon-last rule.

Until U16 is answered the round-trip line exists with `percent: null` and `amount_rappen: null`. The publish gate refuses a live version whose `return_trip` surcharge (if active) is unpriced.

### Fixed-route matching is bidirectional

`fixed_routes` is unique on `(rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id)` with `origin ≠ dest`. The mock lists one row per pair. Seeded bookings run both ways.

**D45: match `(origin, dest)` first, then `(dest, origin)`.** Requiring two rows doubles the ops Pricing table and invites two prices for one journey. Directionality already lives on the `airport_pickup` surcharge (pickup zone). The snapshot records `"matched": "forward" | "reverse"`.

### Surcharge eligibility is data, not TypeScript

`public.surcharges` as drafted has **no predicate**. "22:00–06:00" and "pickup is an airport zone" would live in engine code, unversioned — a hole through D7.

**D46:** Phase 4 adds `predicate jsonb not null default '{}'` and `quantity_source text` (`child_seats` | `extra_stops` | `oversize_bags`). Discriminators:

```text
{"kind":"always"}
{"kind":"pickup_zone_type","zone_type":"airport"}
{"kind":"local_time_window","tz":"Europe/Zurich","from":"22:00","to":"06:00"}
{"kind":"dest_zone_tag","tag":"ski"}
{"kind":"quantity"}
```

An empty object is an **unanswered rule** and blocks `draft → live` (extend `tg_rate_version_transition`). The night window **seeds into the draft** with the mock's `22:00–06:00` because a draft cannot charge; it is an owner input (U38), not an engine constant.

The night window is evaluated against `scheduled_local` (`YYYY-MM-DDTHH:MM`, Europe/Zurich, already on `booking_legs`). No `Date`, no `Intl`, no DST question. A window that wraps midnight (`from > to`) is `(t >= from || t < to)`.

### Two vocabulary gaps

- **`oversized_luggage` does not exist in the mock's eight surcharge codes.** QUOTE-11 requires the line. Seed a ninth: `kind='amount'`, `quantity_source='oversize_bags'`, `amount_rappen NULL` (OWNER-ANSWERS lists the fee as an open blank).
- **"By the hour" has no rate model.** The widget ships a third mode behind `hourlyEnabled` (default true in the mock, labelled "Scope flags — pending approval"). There is no `hourly_rates` table. **D57: Phase 4 ships with `hourlyEnabled=false`.** Hourly is an owner question alongside the matrix (U50). `POST /api/quote` with `mode: "hourly"` is `422 mode_not_offered`.

### Loading the rate book — D3's split, applied

Hyperdrive does not cache a query containing `NOW()`. Default `max_age` 60 s, `stale_while_revalidate` 15 s.

| Read | Binding | Why |
|---|---|---|
| Live-version resolution (`status='live'`) | `HYPERDRIVE` | Small, no `now()`. A ~75 s lag on a *publish* is harmless; the charge gate re-reads status on NOCACHE at payment. |
| Frozen rate book for a version id | `HYPERDRIVE` | Immutable by trigger. The biggest lever on the warm-quote target. |
| `distance_rates.available` / `fixed_routes.live` | `HYPERDRIVE` (same query) | Mutable flags, up to ~75 s stale. **State in the ops Pricing hint:** taking a route off sale takes up to about a minute to reach the widget. |
| `settings_versions` | `HYPERDRIVE` — query **must not contain `now()`** | Fetch recent rows, pick "current as of `computedAt`" in engine code. |
| Coupon validation + redemption counts | `HYPERDRIVE_NOCACHE` | Window and caps are time-sensitive; the query contains `now()` / joins `coupon_redemptions`. |
| Snapshot / booking write | `HYPERDRIVE_NOCACHE` | D1/D2: one explicit transaction. |

`ORDER BY` on every engine query is not cosmetic (threat T5): classes by `sort_order, slug`; rates by `vehicle_class_id`; routes by the zone tuple; surcharges by `code`.

---

## 2. Class eligibility (QUOTE-02) — Wave B `class-eligibility`

Two tables carry a passenger cap and they **disagree in the mocks**:

| Class | Widget (`home.dc.html`) | Ops seed (`RATE_DEFAULT_PAX`) | Vehicles seed |
|---|---|---|---|
| Economy | 3 / 3 | 3 | seats 3, bags 3 |
| Business | 3 / 3 | 3 | seats 3, bags 3 |
| First | 3 / 2 | 3 | seats 3, bags 2 |
| Van | **7** / 8 | **8** | seats 7, bags 8 |

**D44: `effective_max_pax = LEAST(vehicle_classes.passenger_capacity, distance_rates.max_pax)`.** Fleet fact meets commercial fact. Van resolves to **7**, which is the physically correct number and the one the customer-facing mock already shows. Confirm 7 with the owner (U39); until then the `LEAST` rule is what the engine runs.

Bags have one source: `vehicle_classes.luggage_capacity`. `distance_rates` has no `max_bags`. Do not add one.

Pax/bags are max-over-legs, so the rule is already right if a future UI collects them per leg. One class serves both legs (D11).

**When no class is eligible: HTTP 200, every class labelled, `no_eligible_class: true`.** The widget already renders per-class "Up to {n} passengers" rather than an error, and falls back to "No class fits this party size yet" only for the selection. This is categorically different from QUOTE-07 (422, no class board — a fact about the *journey*).

Eligibility is computed even when `pricing_live` is false and even when amounts are `null`. Capacities live on `vehicle_classes` / `distance_rates`, readable from a draft. QUOTE-02 is the only part of the funnel that is fully functional before the matrix lands.

If the selected class drops out, the widget moves selection to the next eligible class and says why (`quote.moved_to`). The API returns the board; the widget owns the auto-move.

---

## 3. Rounding (D6, concretely) — Wave B `determinism-audit` (kernel)

Two facts decide the shape. Postgres `round(numeric)` ties **away from zero**; `round(double precision)` is "platform dependent, nearest-even common." Float rounding is banned in SQL and in JS. Stripe's `amount` is already the CHF minor unit, so the integer in the row *is* the integer sent to Stripe.

**D43: every amount is an exact integer ratio, rounded once, half-up, at the moment the line is produced. Nothing downstream ever rounds again.**

- `Math.round` is not used (half toward +∞ on negatives; takes a float).
- Every discount is computed as a **positive magnitude**; sign is carried by `kind: "discount"`. So `n` is never negative in the kernel and "half up" and "half away from zero" coincide.
- `numeric(5,2)` percent arrives from postgres.js as a **string**. `parseFloat` is banned (`parseFloat('7.35') * 100 === 734.9999999999999`). Parse to hundredths of a percent with a digit regex.
- Per-km is applied to an integer number of **metres**. Mapbox returns metres. Computing from a 2-dp `distance_km` that was itself rounded makes the stored derivation irreproducible (threat T6). Phase 2's `distance_km numeric(7,2)` column remains as a derived display/filter value; the engine's `basis` stores `distance_m`.

| Line | Exact ratio | Rounded at |
|---|---|---|
| Distance fare | `base_fare_rappen + perKm(per_km_rappen, distance_m)` | the `perKm` call |
| Fixed-route fare | `price_rappen` | nowhere — already whole |
| Min-fare | `max(fare, min_fare_rappen)` | nowhere |
| Percent surcharge | `percentOf(legFareRappen, hundredths)` | inside `percentOf` |
| Amount surcharge / extra | `amount_rappen × quantity` | nowhere |
| Included line | `null` | never |
| Return-trip discount | `percentOf(Σ fare lines, hundredths)` | inside `percentOf` |
| Coupon, percent | `percentOf(preCouponTotal, hundredths)` | inside `percentOf` |
| Coupon, amount | `min(amount_rappen, preCouponTotal)` | nowhere; the `min` is the clamp |
| **Total** | **`Σ` of the above** | **never** |

`total_rappen ≡ Σ lines[].amount_rappen` is an **identity**. `assembleTotals` **derives** the typed columns from the lines; it does not compute them in parallel. `tg_snapshot_lines_reconcile` refuses at INSERT any snapshot that breaks the identity, carries a non-integer amount, carries no `i18n_key`, or is unpriced yet carries a priced line.

The half-up rule is tested as a property of the kernel with **unit-free integers** that never appear on a surface. Worked money examples in this document use `amount_rappen: null` and render as `CHF 000`.

U8 (sub-rappen per-km, e.g. a rate that would truncate under `per_km_rappen integer`) stays **open**. `perKm` divides by 1 000, so a millirappen column is a type change and a `10_000` denominator; the line **amount** stays integer rappen either way. Do not pre-emptively widen the column. Check: read the CHF matrix when it lands.

---

## 4. U6 — snapshot cardinality, settled — Wave B `snapshot-write-shape`

> **D42: One `price_snapshots` row per booking-relevant pricing decision — the chosen class — written inside the transaction that creates the booking. `/api/quote` writes no rows at all. Everything the customer was shown is preserved in `shown_alternatives jsonb` on that one row.**

### Phase 2's recommendation, stated fully

Phase 2 left U6 open and **recommended** one row per eligible class per quote: cheap at Zurich volume, and the unchosen rows are dispute evidence. GSD-LAUNCH §4.1 is ambiguous ("Returns all classes + a `quote_id`"). The schema comment on `price_snapshots.quote_id` currently says "one row per class sharing `quote_id`." The unique index `(quote_id, vehicle_class_id)` was built for that.

### Why this document contradicts it

The volume check Phase 2 recorded as "trivially small" is not, because the quote is not a considered action. `home.dc.html` debounces 300 ms and re-quotes from `setPax`, `setBags`, every geocode result and every date/time change. A traveller planning one trip fires **10–30 quotes**. At four classes that is 40–120 immutable jsonb rows per session, on a table with an append-only trigger, four RLS layers and five indexes. At a modest 1 000 planning sessions a day: on the order of 10⁵ rows/day of which the fraction that become bookings is a rounding error. `/api/quote` is public and anonymous (QUOTE-03/09); the write amplification is also an abuse amplifier.

It also degrades the thing it was meant to serve. "The unchosen rows are dispute evidence" is only true of the **last** quote in the session; the other twenty-nine are noise.

The dispute question is *"what price board was this customer looking at when they pressed pay?"* That is one array of four totals — not four documents. The full derivation is only ever needed for the class that was actually sold.

```sql
-- Phase 4 migration (additive)
alter table public.price_snapshots
  add column shown_alternatives jsonb not null default '[]'::jsonb,
  add constraint price_snapshots_alternatives_array
      check (jsonb_typeof(shown_alternatives) = 'array');
```

Shape:

```json
[
  { "class_slug": "economy",  "eligible": true,  "total_rappen": null, "ineligible_reason": null,  "chosen": false },
  { "class_slug": "business", "eligible": true,  "total_rappen": null, "ineligible_reason": null,  "chosen": true  },
  { "class_slug": "first",    "eligible": false, "total_rappen": null, "ineligible_reason": "bags", "chosen": false },
  { "class_slug": "van",      "eligible": true,  "total_rappen": null, "ineligible_reason": null,  "chosen": false }
]
```

`total_rappen` is `null` until a live rate version exists; the renderer prints `CHF 000`.

The unique index `(quote_id, vehicle_class_id)` **stays**. Changing class mid-checkout writes a second snapshot under the same `quote_id` (the previous one remains unbound evidence; `supersedes_id` links them). The comment on `quote_id` is updated in the same migration so the two documents do not disagree.

### The write point moves to the booking transaction

Checkout collects child seat and additional stops **after** the home quote (`checkout.dc.html` Extras step). A snapshot written at checkout entry would be superseded on every checkbox toggle.

```
POST /api/quote           → compute, return, pin the lock. NO DB WRITE.
POST /api/quote/reprice   → recompute against the pinned lock + current extras/coupon. NO DB WRITE.
POST /api/checkout/intent → ONE transaction (Phase 7 owns the handler; Phase 4 specifies the contract):
                              price_snapshots (chosen class, extras, coupon final, shown_alternatives)
                              bookings        (reference minted here — a purchase)
                              booking_legs
                              price_snapshot_legs
                              bookings.price_snapshot_id = …
                              coupon_redemptions          ← trigger, §6
                              booking_payments            ← charge gate fires
                              booking_events
```

This is also what `02-SCHEMA-DRAFT.md` worried about — "a NOT NULL booking FK would force the quote endpoint to fabricate contact details or burn a reference." Under D42 the quote endpoint never touches the table. `booking_id` stays nullable (ops_phone may yet want an unbound snapshot); in the web funnel it is set in the same statement that creates the booking.

**LIFE-07's stale-quote sweep of unbound snapshots collapses for the web path.** There are no unbound web-funnel rows to sweep. The quote lock expires by its own TTL. `price_snapshots_unbound` / `price_snapshots_expiry` remain as the safety net for `ops_phone`.

The recompute at `/api/checkout/intent` is a **deterministic rerun of the engine against the pinned inputs**, asserted equal to the locked per-class totals — never a copy of a number from the request body. Mismatch → `409 price_changed` / `engine_changed` → re-quote.

---

## 5. Quote lock and expiry (QUOTE-04) — Wave B `quote-lock-expiry`

### Where the two Phase 4 lanes disagreed

`quote-lock-expiry.md` settled: **the lock lives in `price_snapshots.expires_at`, in Postgres, and nowhere else. No KV entry backs the lock.** Its three reasons are each sufficient against KV-as-gate: KV is eventually consistent with up to 60 s cross-PoP lag; the checkout POST is already a Postgres write; a second store is a second place for the invariant to rot.

`quote-engine-core.md` settled U6 as **no snapshot at quote time**, and told the lock lane: the artefact "must pin `{rate_version_id, settings_version_id, engine_version, computed_at, expires_at, normalised inputs including distance_m, the per-class totals}` — inputs and version ids, not just an amount." If that lane chose a DB row per quote, the volume arithmetic in §4 is the objection.

Those two settlements cannot both be implemented as written. Implementing the lock as `price_snapshots.expires_at` **requires** a snapshot insert on `/api/quote`, which D42 forbids.

### D47 / D48 — two clocks, signed lock, Postgres authority at checkout

**D47. Two clocks.**

| Clock | Lives in | Checked | Length |
|---|---|---|---|
| 30-minute quote lock (QUOTE-04) | signed lock token (`quote_id` + `expires_at` + HMAC of canonical pinned inputs) | `/api/quote/reprice` and `/api/checkout/intent`, **before** a snapshot is written | `settings.quote_lock_minutes` (seed 30 — owner-approved product number, not a `data-tok` gap) |
| Snapshot `expires_at` | `price_snapshots.expires_at` | `tg_payment_matches_snapshot` at `booking_payments` INSERT | the **payment window**, from snapshot write. Column is `NOT NULL` so a value is written once. **Never extended** (D19). |

**D48. The 30-minute lock is a server-signed token, not a snapshot row and not a KV document.** The Worker mints `quote_id` (UUID) and a payload of pinned inputs, signs with HMAC-SHA256 over a canonical JSON encoding using `QUOTE_LOCK_SECRET`, and returns `quote_id`, `lock`, `expires_at`. The client holds the token; the server re-verifies signature, expiry and that the reprice/checkout body does not smuggle a different distance or total.

Clock discipline, keeping the lock lane's load-bearing rule as far as it still applies:

- `expires_at` on the token is minted from **Postgres `now() + quote_lock_minutes`** via a one-row `select`, not from `Date.now()` in the Worker. The Worker's clock does not author the deadline.
- The comparison that can refuse a payment is **Postgres `now()`** inside the checkout transaction (`token.expires_at <= now()` → `409 quote_expired`, no Stripe call, no snapshot write) **and** `tg_payment_matches_snapshot` on `s.expires_at` after the snapshot exists.
- A Worker-side `expires_at` check and the UI countdown are **decorative**. Deleting them changes nothing about correctness. A `curl` of an expired `quote_id` still 409s.
- `timestamptz` is UTC internally. Local wall clock appears only as `scheduled_local` on legs.

KV is **not** the lock. The lock lane's consistency argument stands: KV must not be the thing a charge decision reads. The signed token is visible to every PoP the instant it is issued (it travels in the request, not through KV replication).

**Mapbox tension, named:** pinning `distance_m` / `duration_s` inside the lock for 30 minutes is storing a Navigation API result. That is the same §2.10.1 question as the snapshot columns (U33). QUOTE-04 cannot hold a price without pinning distance. Until an Order exists, the owner is accepting this 30-minute pin as a legal risk, or QUOTE-04 cannot ship. This document does not pretend otherwise.

### Findings from the lock lane that survive U6

Keep, they do not depend on writing a snapshot at quote time:

1. **`SECURITY DEFINER` + `if not found` on `tg_payment_matches_snapshot`.** As drafted the trigger runs as invoker; an RLS-filtered miss leaves `s` all-NULL and the `IF`s skip. The `IS DISTINCT FROM` amount check happening to still raise is a coincidence. D58.
2. **Drop the `expires_at` extension.** The append-only trigger forbids it. The charge gate fires at PaymentIntent **creation**, before 3-D Secure / TWINT, so the scenario the extension was defending against cannot happen. Carry this as a Phase 2 comment fix when that migration is written.
3. **No mutating Cron sweep of `price_snapshots`.** `expires_at <= now() AND booking_id IS NULL` already *is* expired. GSD-LAUNCH's "Cron expire stale quotes" is a holdover from a mutable status column this schema replaced. LIFE-07's no-show half is a different job on `bookings` (Phase 9). Retention of ancient unbound ops_phone rows is U48, owner-gated; do not build `purge_unbought_quotes` in Phase 4.
4. **Expired mid-checkout → always a fresh `/api/quote`.** No "extend my quote" endpoint. An unbought expired quote was never a promise. If the matrix was republished in the intervening 30 minutes, the customer sees the new board before paying. LIFE-03 protects **purchased** bookings.
5. **`settings.quote_lock_minutes integer not null default 30`.** Engine parameter, not a customer-facing promise, so it belongs on `settings` not `settings_versions` (nothing downstream needs to know what the lock duration *setting* was, only whether `expires_at` had passed).

**Drop, because D42 makes it unnecessary for the web funnel:** `app.checkout_quote(quote_id, vehicle_class_id)` as the way to read an unbound snapshot. There is no unbound web snapshot to read. Keep the idea in reserve for `ops_phone` if that path writes unbound rows; do not build it for `/api/quote`.

### Rate-version change under a live quote

The lock pins `rate_version_id` and `engine_version`. Recompute loads **that** version by id, not "the live one now." If the recomputed total differs from the locked total → `409 price_changed`. If `ENGINE_VERSION !== lock.engine_version` → `409 engine_changed`. A routine deploy must not silently re-price a checkout in flight (threat T8). Snapshots already locked against a **retired** version are still honoured at payment — the customer was shown that price and the version's rows are frozen.

---

## 6. U7 — coupon consumption, settled (QUOTE-06) — Wave C `coupons`

> **D50: A coupon is validated twice by one SQL function and consumed exactly once, at PaymentIntent creation, inside the same transaction as `booking_payments` INSERT, under `SELECT … FOR UPDATE` on the `coupons` row. No KV reservation.**

### Phase 2's recommendation, stated fully

Phase 2 left U7 open and **recommended** consume-at-payment with a **soft KV reservation** across the 30-minute quote window, so a customer actively quoting would not lose a scarce code mid-checkout. That recommendation assumed the coupon could be applied on `/api/quote`.

### Why this document contradicts the KV half

Three facts already true of the schema, independent of preference:

1. **The abandoned-quote problem does not exist for this product.** The coupon field is on checkout, after name, email and payment method (`checkout.dc.html`). There is no anonymous pre-commitment path that can reach a coupon. A KV reservation would be solving a race the UI shape already rules out, with a second system that must never disagree with Postgres.
2. **`coupon_redemptions.booking_id` is `NOT NULL`.** The table structurally cannot hold "reserved but not yet booked."
3. **Phase 2 already designed the transactional moment "the customer commits to pay."** `booking_payments` is inserted at PaymentIntent creation so Stripe cannot take money before our trigger discovers an expired quote. The identical argument applies to a coupon cap: discovering it at webhook time means refunding a completed charge.

**The race two customers redeeming the last use:** both transactions `SELECT … FOR UPDATE` the **`coupons` row** (there is no single child row to lock). The first committer inserts `coupon_redemptions`; the second's recount sees the cap and raises `restrict_violation` **before** Stripe is asked. `ON CONFLICT (coupon_id, booking_id) DO NOTHING` covers a retried PaymentIntent for the **same** booking (PAY-05).

Trigger name `booking_payments_reserve_coupon` is deliberately **after** `booking_payments_match_snapshot` in alphabetical order, so an unchargeable or expired snapshot fails first with zero coupon side effect. Postgres fires same-event BEFORE triggers in name order; if that guarantee is ever weakened this trigger stops being safe.

Informational path (reprice): `evaluate_coupon()` is `language sql stable`, no write. Seven rules, in order:

| # | Rule | i18n key | English (instruction, not blame) |
|---|---|---|---|
| 1 | no row for `upper(code)` | `quote.coupon.error.not_found` | Check the coupon code |
| 2 | `not active` | `quote.coupon.error.inactive` | This code is no longer active |
| 3 | `now() < valid_from` | `quote.coupon.error.not_yet_valid` | This code isn't active yet |
| 4 | `now() >= valid_until` | `quote.coupon.error.expired` | This code has expired |
| 5 | percent/amount NULL (Law 04 gap) | `quote.coupon.error.unpriced` | This code isn't ready yet |
| 6 | `count(redemptions) >= global_limit` | `quote.coupon.error.usage_cap` | This code has reached its limit |
| 7 | per-user cap (customer_id **or** contact_email) | `quote.coupon.error.per_user_cap` | You've already used this code |

Lookup always `upper($1)` server-side; never trust the client's uppercase. `price_snapshots.coupon_code` stores the normalised value. Per-user identity for a guest is `bookings.contact_email` (`citext NOT NULL` by the time a booking exists).

Unpriced coupon: **refuse to apply**, do not treat as zero. Same as the engine's handling of a NULL rate.

Abandoned PaymentIntent (declined card, closed 3-D Secure sheet): `coupon_redemptions` is **not** append-only in Phase 2, so a sweep `DELETE` of a reservation whose booking never reached `succeeded` is a plain delete. The interval is U42 (`checkout_abandon_release_minutes` does not exist yet). Until it lands, the sweep **must not run** rather than invent a number; a conservative hard-code inside a later Phase 5/7 cron is that phase's problem, not a seeded setting pretending to be confirmed.

A KV soft-reservation remains a legitimate **future UX** layer if the owner runs visibly-scarce campaigns. It is additive, not required for correctness, and must key `(coupon_id, quote_id)` — never email or customer id (Phase 2 residency rule). Not built in Phase 4.

Coupons are **not** frozen with a rate version (Phase 2 design). Threat T10: the snapshot line embeds `basis.percent` / `of_rappen` / `clamped` and `coupon_code` as typed. The FK answers ops; the embedded copy answers the customer.

---

## 7. Geo, routing, service area (QUOTE-01, QUOTE-07) — Wave C `geocoding-search` / `distance-routing-cache` / `service-area-advance`

### OWNER DECISION — Mapbox cache and stored Directions results (blocks planning of the cache)

Independently verified 2026-08-22 against the **current** Mapbox Product Terms PDF dated **21 July 2026** (newer than the 1 October 2025 PDF the geo-routing lane cited). The product-terms page at `https://www.mapbox.com/legal/product-terms` links this PDF.

Verbatim:

- **§1.9 Default Restrictions (v):** "not export, download, cache or store Licensed Map Content or other results from the Service Offerings."
- **§2.7.2 Temporary Geocodes:** "Customer shall not export, store, or cache Temporary Geocodes."
- **§2.7.3 Permanent Geocodes:** store allowed only with `permanent=true` **AND** "a separate API request for a Permanent Geocode shall be made for each End User account that accesses, uses, or relies on such Permanent Geocode."
- **§2.10.1 Navigation APIs:** "Customer shall not export, download, cache or store results from any request to a Navigation API."

Directions is a Navigation API (§3.51 of those terms). Therefore GSD-LAUNCH's "cached in Cloudflare KV by place-id pair (24 h TTL)" is **barred under self-serve terms**. Storing `distance_km` / `duration_min` / `estimated_duration_minutes` on `price_snapshots`, `price_snapshot_legs` and `booking_legs` is also storing Navigation API results, which §2.10.1 forbids unless an Order carves it out.

This is **U33**, an owner / commercial decision, not an engineering preference. It changes the cost model for `/api/quote` and is a possible Phase 2 schema tension (those columns already exist in `02-SCHEMA-DRAFT.md`). **Until an Order exists:**

- Live Mapbox on **every** quote. No KV cache of Mapbox responses.
- `GEO_CACHE` holds only the **service-area polygon** (our data) and **hand-curated fixed-route geometry** (traced once, not persisted output of a live Directions call).
- At checkout, re-resolve the chosen pickup/dropoff with Geocoding v6 `permanent=true` before storing `pickup_lat/lng` / `dropoff_lat/lng` on `booking_legs` — the Permanent Geocode path, not a leftover Temporary Geocode from search.
- Coordinates are never rendered as literal digits to the customer (§2.7.1(v)(b)); a pin and a formatted address only — already the product.
- The Phase 2 columns stay as designed (this phase does not rewrite them). The legal risk of filling them is the owner's to accept or to cover by Order **before** a real Mapbox account is pointed at production data.

Do not pretend the 24 h place-id-pair cache is allowed. Do not plan it. Do not size Mapbox spend as if it were in place.

Search Box `/retrieve` does not document a `permanent` parameter (U34). Until confirmed, the checkout-time Geocoding v6 `permanent=true` call is the compliant store path.

### Autocomplete and dropped pin (QUOTE-01)

The mock uses Komoot Photon. Production does not. Provider is Mapbox; the four language codes and the debounce stay.

**D53.**

- **Type-ahead:** Mapbox **Search Box API** `/search/searchbox/v1/suggest` + `/retrieve`, session-tokened (one UUID per widget-open, not per keystroke). One session = one billable unit regardless of keystrokes; the 320 ms debounce is UX, not a cost lever. `/suggest` returns no coordinates; `/retrieve` is called on pick.
- **Dropped pin:** Geocoding API **v6** `/reverse`, `types=address,poi`, no session. Show `full_address` / `place_formatted`, never raw coordinates.
- **Bias, not gate:** `country=CH`, `proximity` default Zurich HB `(8.5417, 47.3769)`. A Milano result can still appear; QUOTE-07 is the gate, run server-side on the retrieved coordinate.
- **Arabic / four languages:** `language=en|de|fr|ar` changes Mapbox's label where they have data. Swiss street names generally stay Latin even in `ar` — that is Mapbox's data, out of `content_strings`, and wears `.vt-dir-keep`. What we translate is every surrounding UI string (label, placeholder, empty, no-results, aria-label, refusals).
- **Never send an unrestricted Mapbox token from the browser.** Proxy through `/api/geo/suggest`, `/api/geo/retrieve`, `/api/geo/reverse`. Session-token discipline: reject a `/retrieve` whose token was never seen in a prior `/suggest` from the same rate-limit bucket.

### Distance, duration, route line

**Directions API v5, profile `mapbox/driving`, not Matrix, not `driving-traffic`.**

QUOTE-01 asks the customer to see the route drawn. Matrix returns no geometry. This product prices one origin against one destination (a return is two one-to-one calls, one per leg). `driving-traffic` is a live duration for *now*; this product locks a price for a pickup that may be weeks away. A traffic-aware number is the wrong input for `estimated_duration_minutes`, which Phase 2 already frames as a snapshot.

```
GET /directions/v5/mapbox/driving/{lng},{lat};{lng},{lat}
    ?geometries=geojson&overview=full&alternatives=false&steps=false
```

Waypoints for additional stops are inserted **between** pickup and dropoff **before** this call, so the fare's `distance_m` already includes the detour. The `extra_stop` surcharge then prices the stop itself, not the kilometres (those are already in the fare). Never fold the two into one number — a refund has to explain them separately.

Convert once at the boundary: `distance_km` (display, 2-dp) derived from metres; `duration_min = round(duration_s / 60)`. A failed Directions call **fails the quote** (`422 route_unavailable`). A zero duration must never reach `booking_legs.estimated_duration_minutes` silently (Phase 2: empty `tstzrange` makes the exclusion constraint a no-op).

One Directions call per **quote**, not per class — every class reuses the same metres/seconds.

Phone bookings with no Mapbox route (U22, Phase 8): the assign dialog must supply a duration; Phase 4's web funnel never writes a leg without one.

### Service area and minimum advance (QUOTE-07)

There is **no** service-area field anywhere in the repo today, not even in the mock. `service_zones` backs `fixed_routes`; it is not a polygon. Several named destinations (Zermatt, Chamonix) are 150–270 km from Zurich, so a radius around HB is wrong on its own.

**D54. Two-path check, server-side, never client-side.**

1. **Named-pair path.** If pickup and dropoff resolve to zones that have a `live` `fixed_routes` row in either order for at least one class, the pair is in area **by definition**. Zermatt stays bookable without sitting inside a Zurich polygon.
2. **Ad-hoc per-km path.** Otherwise **both** coordinates must fall inside `settings_versions.service_area_geojson`.

**NULL handling is opposite for the two rules, and the justification travels with the code:**

- `service_area_geojson` NULL → **fail-closed** (`422 service_area_undefined`). Skipping the check would mean quoting anywhere on Earth. Render as a labelled TBC gap ("service area TBC"), **not** as "we don't serve you."
- `min_advance_minutes` NULL → **skip the threshold** (accept any future `scheduled_at`). A NULL threshold and "no rule" are the same observable. Display still wears the TBC pill. The engine **refuses to invent 180 or 24**. Phase 2 already seeds this NULL (owner blockers).

Point-in-polygon runs in the Worker (ray-casting). PostGIS is not installed (Phase 2 extensions are `pgcrypto`, `btree_gist`, `citext`, `pgtap`) and will not be added for one boolean.

Refusal messages say **which** rule failed. Three distinct keys, never a generic 400.

---

## 8. `pricing_live=false` end to end (QUOTE-10) — Wave B `pricing-live-gate`

D9 is not a boolean. It is exactly one `rate_versions` row with `status='live'`, plus a `BEFORE INSERT` charge-gate trigger that has **no off switch**.

| # | Layer | No live row | Off switch? |
|---|---|---|---|
| 1 | Data | Seed inserts **no** live version. Every `*_rappen` / `percent` in the draft is NULL. | — |
| 2 | Engine | `assembleTotals` returns `total: null` for every class. Eligibility, route, distance, duration, policy and the **complete line shape** still compute. | — |
| 3 | API | `pricing_live: false`, `total_rappen: null`. `/api/checkout/intent` returns **409 `pricing_not_live`** before Stripe. | `PRICING_PREVIEW` changes *display* only |
| 4 | UI | `formatRappen(null)` → `CHF 000`. Not a UI conditional. Primary CTA disabled, labelled from `quote.pricing_pending`. | — |
| 5 | Database | `is_chargeable` is STORED generated, false when total is NULL or version is not live. Trigger refuses every `booking_payments` insert. `charged_rappen > 0` is an additional CHECK — a null total cannot be charged even if someone bypasses `is_chargeable`. | **none** |

In production, layers 3 and 5 mean **no booking is created at all**. Until the CHF matrix is approved, the business cannot take a booking — not on the web and not by phone — because it cannot sell at a price it has not set. State that plainly.

**D59. `PRICING_PREVIEW=true` on staging only.** `/api/quote` may resolve the newest **draft** version so the funnel is testable with draft numbers. It cannot cause a charge: a snapshot citing a draft has `rate_version_is_live = false` (set by trigger from the table, **never** from the caller), so `is_chargeable` is false. The variable must be **absent** from the production Worker, not set to `"false"` — a missing binding is a boot `TypeError`; a typo'd string is truthy.

The flip is one dated, attributed transaction: retire the live row (if any), then `draft → live`, guarded by `rate_versions_one_live` and `tg_rate_version_transition` (every available distance-rate fully priced, every active non-included surcharge priced **and** predicated, every live fixed route priced, `published_at`/`published_by` stamped). Undo is `live → retired` only. `live → draft` is illegal: it would unfreeze `source_row` targets.

---

## 9. Determinism (QUOTE-05) — Wave B `determinism-audit`

> A historical snapshot is **read, never recomputed.** Reproducing a decision means re-running the engine *as it existed at quote time* — a code version, not a data version. Every refund, modification diff, confirmation email and dispute packet reads `bookings.price_snapshot_id`.

| # | Threat | Prevention |
|---|---|---|
| T1 | Live join to a mutable pricing row | Rows frozen once the version leaves draft; snapshot **embeds** numbers in `basis` and cites `source_row` |
| T2 | Clock read inside pricing | Night window against `scheduled_local`. `computedAt` is injected. Engine calls no `Date` API. Bonus: no `now()` ⇒ rate-book query is Hyperdrive-cacheable |
| T3 | Floating point | Integer kernel; `numeric` as string; `roundHalfUp` throws on a non-safe-integer |
| T4 | Locale-dependent formatting leaking into arithmetic | Formatting only at the render boundary (`lib/currency.ts`). Never format-then-parse. Hand-format apostrophe grouping rather than `toLocaleString` against an unspecified ICU dataset on Workers |
| T5 | Non-deterministic row order | `ORDER BY` on every engine query; `seq` a pure function of `(leg_seq, kind rank, code)` |
| T6 | Routed distance drift on a second Mapbox call | `distance_m` is an **input**, pinned in the lock, echoed into `basis`. Never re-fetched between quote and snapshot |
| T7 | Rate-version drift mid-session | Lock pins `rate_version_id`; mismatch → 409, never a silent re-price |
| T8 | Engine code drift (a deploy mid-checkout) | Lock pins `engine_version`; mismatch → 409 |
| T9 | Hyperdrive stale cache | Accepted and bounded (~75 s). Prices immutable so staleness is harmless; mutable flags lag, stated in ops; charge gate re-reads on NOCACHE |
| T10 | Coupons not version-frozen | Line embeds percent / basis / code; FK is for ops |

The QUOTE-05 unit test asserts `JSON.stringify` equality of two `priceQuote` results against the same frozen book at two `computedAt` instants years apart — the whole document, not "the totals match."

---

## 10. Extras (QUOTE-11) — Wave C `extras-lines`

**D51. Extras are `surcharges` rows. No parallel extras table.** Versioning, freeze, publish-completeness and i18n stems already exist. The mock already treats `child_seat` and `extra_stop` as ordinary surcharges.

| Code | UI (today) | `applies_to` (Phase 2 seed) | MVP behaviour on a return |
|---|---|---|---|
| `child_seat` | checkout checkbox, booking-level | `leg` | Duplicates onto **both** legs (a seat is fitted in whichever vehicle shows up). One line per `leg_seq`. |
| `extra_stop` | checkout counter 0–3 | `leg` | Applied to **leg 1 (outbound) only** — the UI cannot collect return-leg stops. Stops are Directions waypoints on that leg. |
| `oversized_luggage` | **not in the mock** — new QUOTE-11 control | seed as `leg` | Same duplication rule as child seat. API accepts a boolean in Phase 4; the widget port adds the control. |

A booking-level toggle that duplicates onto legs still writes **two lines** with two `leg_seq`s, never one line silently covering two legs — ADR-006 single-leg cancellation must be able to drop exactly its own extras.

This duplication rule is an inference from the mock, **not** an owner decision (U40). A per-leg extras UI is a later enhancement. Until then, this is what the engine does.

`child_seat` stays a checkbox (`params` count 1), not a counter, until the owner says families need two seats priced separately (U43). REQUIREMENTS says "a child seat," singular.

**Must not be accepted from the client as a price.** The client sends quantities (`child_seats`, `extra_stops`, `oversized_luggage`). The engine looks up `surcharges.amount_rappen` from the pinned rate version. A client-supplied extra amount is unknown-field / ignored.

---

## 11. Flight autofill (QUOTE-08) — Wave C `flight-autofill`

**D55. AeroDataBox**, already the mock's contract (`aerodatabox.p.rapidapi.com`, `scheduledTime` / `revisedTime` / `runwayTime`). FlightAware's floor is a tracking product this project does not need. LIFE-06 (delay shift on a **paid** booking) is Phase 9.

`GET /api/flight/:no?date=YYYY-MM-DD`

- Normalise: uppercase, strip non-alphanumerics (`LX 318` → `LX318`). Display with a space (`LX 318`).
- Reject before spending a unit unless `^[A-Z0-9]{2}\d{1,4}$`.
- Date: explicit query param; widget defaults to today Europe/Zurich with a today/tomorrow toggle.
- Codeshares: return the record for the number typed (the boarding-pass number). Do not dedupe.
- Overnight / multi-row: **do not take `j[0]`**. Surface a disambiguation choice (U45: confirm `dateLocalRole` against a live key). Guessing is how a 23:40 departure becomes a 00:15 arrival on the wrong calendar day.
- Landing time written as pickup: `runwayTime ?? revisedTime ?? scheduledTime`. **No invented buffer.** The post-landing allowance is `settings_versions.airport_waiting_minutes`, seeded NULL (ADR-002). Flight autofill does not get a private 60.
- Terminal / gate / belt render when present, nothing when null. Never invent a gate.

**KV cache of AeroDataBox** (not Mapbox) is allowed — it is not Licensed Map Content. Key `flight:{NUMBER}:{YYYY-MM-DD}`, never a customer or booking id. TTL 90 s same-day / 30 min next-day / 6 h further out. Cloudflare KV refuses TTL < 60 s.

**Do not port the mock's 45 s background poll.** That is live tracking (`LATER-01`, Phase 9). QUOTE-08 is one lookup on customer action. Re-typing the number is the refresh.

Degradation:

| Failure | Status | English |
|---|---|---|
| Malformed | 400 `malformed` | Check the flight number |
| No record | 404 `not_found` | No flight on that number today |
| Provider down / timeout / 429 | 503 `provider_unavailable` | We can't check flights right now — enter your pickup time. |

The flight-number field stays savable on a down lookup; only autofill is unavailable. Pickup date/time remain manual. This is the line so Phase 4 does not become the live tracking Phase 9 owns.

Additive columns (Phase 4 migration): `booking_legs.flight_checked_at`, `flight_time_source` (`scheduled` \| `estimated` \| `actual`). Event kind `flight.autofilled` (distinct from Phase 9 `flight.delayed`).

`FLIGHT_API_KEY` is a wrangler secret, proxied server-side only.

---

## 12. Abuse and rate limit (QUOTE-09) — Wave D `abuse-ratelimit`

**D56. Three layers, cheapest-to-reject first, plus input-shape defences before Mapbox.**

The zone is **presumptively Cloudflare Free** today (GSD-LAUNCH budgets Workers Paid, not a WAF plan). Free: one rate-limiting rule, `ip.src` only, no OWASP CRS. That is not enough for a public unauthenticated endpoint that pays Mapbox per call. Recommendation: move `vamostaxi.eu` to **Pro** (second rule slot + CRS). Do **not** jump to Business for `cf.unique_visitor_id` — CGNAT is solved at the Worker layer. This is a new cost line, owner-flagged (U36).

### Layer 1 — zone-level Rate Limiting Rule (outer backstop)

`POST /api/quote` (and `/api/geo/*`): `ip.src`, 30 requests / 60 s, action **`managed_challenge`** not `block`. Survives a Turnstile `siteverify` outage (edge challenge does not call the Worker). A `fetch()` from React will see a non-JSON body; the widget must treat "response isn't the quote shape" as "challenged — reload, retry once," not a parse error.

On Free, this is the **one** rule. On Pro, keep it as the loose outer tier.

### Layer 2 — Workers Rate Limiting binding (the real per-visitor gate)

Available on Workers Paid regardless of WAF plan. `wrangler.jsonc` `ratelimits` binding `QUOTE_RATE_LIMITER`.

Key: **`ip + vamos_qs` cookie**, not bare IP. Home mints a `HttpOnly; SameSite=Lax; 24h` UUID cookie on first response. Same-origin `fetch` sends it. Ten tabs behind one CGNAT IP = ten counters. A script that never loaded the page has no cookie → **bare-IP bucket at a tighter limit** (4/60 s vs 8/60 s cookie'd).

The binding is "permissive, eventually consistent, **per colo**." A geographically distributed campaign will see a multiple of the nominal limit. Acceptable for defeating a single-origin hammer; **not** the layer that catches low-and-slow. Say so in the ops runbook.

Threshold reasoning: a real customer comparing classes or nudging pax/bags re-quotes 4–6 times in a couple of minutes. 8/60 s cookie'd is above that; the widget's 300 ms debounce is the cheapest defence of all.

### Layer 3 — Turnstile, escalate after N, not on the first

**Invisible mode**, mounted once pickup **and** dropoff have been touched — not on page load, not a checkbox. The background challenge typically resolves while the rest of the form is filled.

- First **2** `/api/quote` requests in the window: token is sent to `siteverify` and **logged**, not enforced. Missing/failed token is not a 403.
- From the **3rd** request: `siteverify.success === true` required, else 403 `turnstile_required`.
- `idempotency_key` on `siteverify` so a timeout can retry the **same** token without a false `timeout-or-duplicate`. Tokens are single-use; a new key on a consumed token is a real failure — tell the client to mint a fresh token (`timeout-or-duplicate` → "try again," not a hard block).
- Turnstile itself down, below the soft threshold: fail open (those requests never required it). At/above: do **not** hard-block; fall back to layer 1's edge `managed_challenge`. Log degraded-mode.

This is "challenge after N, not on the first," as a mechanism, and it does not add a step to "book in under a minute."

### Before Mapbox is paid

Zod the body. Unknown fields rejected. No client-supplied class-id array, distance, duration, or total (ignored if present, better: schema-rejected).

Reject before the Directions call:

- pickup/dropoff strings too short / too long
- pickup === dropoff
- coordinates outside a generous box around Switzerland + neighbours (not the service-area polygon — that is QUOTE-07 after a real route exists)
- `/api/geo/retrieve` whose session token was never seen

**Daily Mapbox-spend circuit breaker** in a dedicated `QUOTE_ABUSE` KV namespace (not `GEO_CACHE`): one key per UTC day, coarse counter, graceful `503 quote.temporarily_unavailable` at the ceiling. KV is the wrong tool for a per-visitor hot counter (1 write/s/key, last-write-wins); it is the right tool for this. The ceiling number is U37 — unset until a Mapbox plan exists; until then the breaker is **wired but the ceiling is a large sentinel that still logs**, not a guessed commercial limit.

Do not reuse `GEO_CACHE` for abuse counters (different TTL semantics).

### Observability without Logpush

Logpush is deferred. Use: Workers Logs (7-day, already on), WAF Security Analytics, Turnstile dashboard, **Workers Analytics Engine** dataset `quote_abuse`, a 10-minute Cron that emails ops via Resend on trip-rate / Turnstile-failure anomalies. This is the Phase 4 stop-gap; Phase 8's Sentry + Logpush is the real layer.

### WAF false positives

OWASP CRS on a JSON POST that carries `O'Brien`, `LX318`, German/French/Arabic names, and eventually a free-text note, will false-positive on apostrophes and SQL-shaped substrings. Deploy CRS at **Sensitivity: Low, Action: Log** first; promote to Block only after staging traffic with real multilingual names is clean. Super Bot Fight Mode once on Pro. Do not chase Attack Score (Business/Enterprise).

Eligible-class fan-out is **not** a Mapbox cost lever (one Directions call per quote). The thing a class-id array from the client would attack is Postgres write volume, which D42 already removed from `/api/quote`.

---

## 13. Lines, policy, i18n — the snapshot write shape

Canonical launch-state example — this is what the engine produces **today**, with no live rate version. Shape complete, amounts absent. `formatRappen(null)` → `CHF 000`.

```json
[
  { "seq": 1, "leg_seq": 1, "kind": "fare",
    "code": "distance_fare",
    "i18n_key": "price.line.transfer",
    "params": { "vehicle_class": "business" },
    "basis": { "rule": "per_km", "distance_m": 18400,
               "per_km_rappen": null, "base_fare_rappen": null,
               "min_fare_rappen": null, "min_fare_applied": false },
    "source_row": { "table": "distance_rates", "id": 42, "rate_version_id": 7 },
    "amount_rappen": null },

  { "seq": 2, "leg_seq": 1, "kind": "surcharge",
    "code": "airport_pickup", "i18n_key": "price.surcharge.airport_pickup.label",
    "basis": { "rule": "amount", "amount_rappen": null, "quantity": 1,
               "why": { "predicate": "pickup_zone_type", "zone_type": "airport",
                        "pickup_zone": "zrh-airport" } },
    "source_row": { "table": "surcharges", "id": 9, "rate_version_id": 7 },
    "amount_rappen": null },

  { "seq": 3, "leg_seq": 1, "kind": "surcharge",
    "code": "night", "i18n_key": "price.surcharge.night.label",
    "basis": { "rule": "percent", "percent": null, "of_rappen": null,
               "of_line_seq": 1,
               "why": { "predicate": "local_time_window",
                        "pickup_local": "2026-09-04T23:10", "tz": "Europe/Zurich",
                        "from": "22:00", "to": "06:00" } },
    "source_row": { "table": "surcharges", "id": 11, "rate_version_id": 7 },
    "amount_rappen": null },

  { "seq": 4, "leg_seq": 1, "kind": "included",
    "code": "waiting_airport", "i18n_key": "price.surcharge.waiting_airport.label",
    "params": { "minutes": null },
    "basis": { "rule": "included", "included_minutes": null,
               "source": "settings_versions.airport_waiting_minutes" },
    "amount_rappen": null },

  { "seq": 5, "leg_seq": null, "kind": "surcharge",
    "code": "child_seat", "i18n_key": "price.surcharge.child_seat.label",
    "params": { "quantity": 1 },
    "basis": { "rule": "amount", "amount_rappen": null, "quantity": 1,
               "why": { "predicate": "quantity", "quantity_source": "child_seats" } },
    "source_row": { "table": "surcharges", "id": 14, "rate_version_id": 7 },
    "amount_rappen": null },

  { "seq": 6, "leg_seq": null, "kind": "discount",
    "code": "coupon", "i18n_key": "price.line.coupon",
    "params": { "code": "ZRH20" },
    "basis": { "rule": "percent", "percent": null, "of_rappen": null,
               "of": "pre_coupon_total", "clamped": false },
    "source_row": { "table": "coupons", "id": 3 },
    "allocation": "pro_rata",
    "amount_rappen": null }
]
```

Four load-bearing rules (unchanged from Phase 2, restated because they bind the implementation):

- `i18n_key` + `params`, never rendered prose. Coupon `code` is the one literal.
- `basis.why` is wall-clock justification. Recomputing "was this 23:10?" from a UTC instant in month 7 is a DST bug.
- `leg_seq` on every line, `null` for booking-level, plus `allocation` on booking-level lines so a single-leg refund apportions by the recorded rule.
- `amount_rappen: null` for `included` and for anything the matrix has not priced.

Maps onto the mock renderer with no UI change: `kind:"included"` → `muted:true`; `kind:"discount"` → `credit:true`.

**One mock breach to fix while porting.** `lineWaiting: '60 min airport waiting'` hardcodes a number ADR-002 says is unanswered. It becomes `price.surcharge.waiting_airport.label` with `{minutes}`; when the setting is NULL the renderer wears the `data-tok` TBC pill. Same for concatenated transfer + class name fragments — one parameterised key, or German and Arabic both break.

### Policy object

Built from `currentSettingsVersion(rows, computedAt)`. Waiting minutes and (until answered) `min_advance_minutes` are NULL. Free-cancel 24 h and the 100 / 75 / 0 tiers are owner-confirmed (Phase 2 owner blockers) and seed in one dated `settings_versions` row.

```json
{
  "settings_version_id": 4,
  "free_cancel_hours": 24,
  "modification_deadline_hours": 24,
  "min_advance_minutes": null,
  "airport_waiting_minutes": null,
  "city_waiting_minutes": null,
  "cancellation_tiers": [
    { "from_hours_before": 24, "refund_percent": 100 },
    { "from_hours_before": 0,  "refund_percent": 75  },
    { "no_show": true,         "refund_percent": 0   }
  ],
  "policy_doc": { "slug": "cancellation", "version": "2026-08-01" }
}
```

`price_snapshots_policy_shape` already refuses a snapshot that omits the keys, so "we forgot the waiting policy" and "the waiting policy is unanswered" are distinguishable at the row.

U9 (`display_currency`): `VamosLocale.money()` concatenates a mark onto the unchanged figure, so the customer can literally see a euro mark in front of a CHF amount. The engine returns the CHF number and the mark separately and records `display_currency` on the snapshot. The unwritten ADR-004 requirement — *the charge currency must be stated in words at checkout* — is Phase 7 copy, four languages, not closed here.

---

## 14. Customer-visible strings this phase introduces

Every key ships `en` / `de` (Swiss, "ss" not "ß") / `fr` / `ar` in the same pass. Concatenated strings are ICU. Errors are instructions.

| Key | English source | Params | Notes |
|---|---|---|---|
| `quote.class.up_to_pax` | Up to {n} passengers | `{n}` | ICU plural |
| `quote.class.up_to_bags` | Up to {n} bags | `{n}` | ICU plural |
| `quote.class.na_pax` | Not available for {n} passengers | `{n}` | |
| `quote.class.na_bags` | Not available for {n} bags | `{n}` | |
| `quote.none_fit` | No class fits this party size yet. | — | |
| `quote.moved_to` | Moved to {v} — {from} fits up to {cap}. | `{v, from, cap}` | `{v}` is a product name (ADR-012, non-translatable) |
| `quote.error` | Couldn't price this — try again | — | |
| `quote.pricing_pending` | Prices come once the fare table is approved | — | CTA disabled state |
| `quote.error.min_advance` | This pickup is too soon — we need {minutes} minutes' notice | `{minutes}` | Only rendered when the setting is non-null |
| `quote.error.out_of_service_area` | This route is outside our service area | — | |
| `quote.error.service_area_undefined` | Service area | — | rendered as `data-tok` TBC pill, English on purpose (ADR-011) |
| `quote.error.route_unavailable` | We can't calculate this route right now — try again in a moment | — | |
| `quote.error.expired` | This quote has expired — get a new price | — | |
| `quote.error.price_changed` | The fare table changed — get a new price | — | |
| `quote.error.engine_changed` | Get a new price to continue | — | |
| `quote.error.pricing_not_live` | Checkout isn't open yet | — | |
| `quote.error.coupon_no_longer_valid` | This code can't be used — get a new price | — | |
| `quote.error.rate_limited` | Too many prices in a short time — wait a moment and try again | — | |
| `quote.error.turnstile_required` | Confirm this request and try again | — | |
| `quote.error.temporarily_unavailable` | We can't price this right now — try again shortly | — | daily budget / degraded |
| `quote.error.mode_not_offered` | Hourly hire isn't available yet — book a transfer instead | — | |
| `quote.coupon.error.not_found` | Check the coupon code | — | |
| `quote.coupon.error.inactive` | This code is no longer active | — | |
| `quote.coupon.error.not_yet_valid` | This code isn't active yet | — | |
| `quote.coupon.error.expired` | This code has expired | — | |
| `quote.coupon.error.usage_cap` | This code has reached its limit | — | |
| `quote.coupon.error.per_user_cap` | You've already used this code | — | |
| `quote.coupon.error.unpriced` | This code isn't ready yet | — | |
| `quote.extras.error.max_stops` | Check the number of stops | — | max 3 |
| `quote.extras.error.max_child_seats` | Check the number of child seats | — | |
| `quote.flight.unavailable` | We can't check flights right now — enter your pickup time. | — | |
| `quote.flight.recheck` | Check again | — | |
| `quote.flight.malformed` | Check the flight number | — | already in the mock; keep |
| `quote.flight.not_found` | No flight on that number today | — | already in the mock; keep |
| `quote.geo.no_results` | No matching places — try a fuller address | — | |
| `quote.geo.suggest_unavailable` | Place search is down — type the address, or drop a pin | — | |
| `price.line.transfer` | Transfer · {vehicle_class} | `{vehicle_class}` | class slug resolves via non-translatable product name |
| `price.line.coupon` | Coupon {code} | `{code}` | `{code}` literal, `.vt-dir-keep` |
| `price.line.return_discount` | Return-trip reduction | — | amount NULL until U16 |
| `price.surcharge.oversized_luggage.label` | Oversized luggage | — | |
| `price.surcharge.oversized_luggage.rule` | Per declared item | — | |
| `price.surcharge.waiting_airport.label` | Airport waiting · {minutes} min | `{minutes}` | TBC pill when `minutes` is null |

Existing `price.surcharge.{night,airport_pickup,child_seat,extra_stop,waiting_airport}.*` keys from Phase 2's snapshot research remain; this table only lists what Phase 4 newly owes or must re-parameterise.

German / French / Arabic for the new coupon, extras, flight-unavailable and geo keys ship in the same dictionary PR as the English source (the coupons-extras and flight lanes already drafted them). Planner: land them in `apps/web/i18n/messages/{en,de,fr,ar}.json` in the same plan that lands the route.

---

## Decisions taken here (D41+)

| # | Decision | Chosen | Rejected | Why | Depended on by |
|---|---|---|---|---|---|
| D41 | Pipeline order | Fare → surcharges (percent of **fare**) → extras → round-trip (% of fare) → coupon (% of pre-coupon total) | Coupon-before-surcharge; percent-of-running-total; coupons-extras' additive dual-discount | Commutative percents; matches the mock's line order; a coupon discounts what is payable | Engine, snapshot lines, Phase 7/9 refunds |
| D42 | U6 snapshot cardinality | One row, **chosen class**, written at booking; `shown_alternatives` for the board; `/api/quote` writes nothing | Phase 2's one-row-per-eligible-class-per-quote | 300 ms debounce × 4 classes × append-only jsonb on a public endpoint | `/api/quote`, checkout intent, LIFE-07 sweep |
| D43 | Rounding kernel | Integer ratios, half-up once per line, metres in, percent parsed from string hundredths | `Math.round`; `parseFloat`; 2-dp km as the arithmetic input | D6; float ties are platform-dependent; km rounding makes T6 irreproducible | Engine, `tg_snapshot_lines_reconcile` |
| D44 | Class caps | `LEAST(passenger_capacity, max_pax)`; bags from `vehicle_classes` only; max-over-legs | Widget-only caps; ops-seed 8 for Van; a second `max_bags` | Two sources already disagree; `LEAST` is physically correct (Van = 7) | QUOTE-02, widget auto-move |
| D45 | Fixed-route match | `(origin,dest)` then `(dest,origin)`; record `matched` | Require two rows per pair | Ops will half-do "add Zermatt"; airport surcharge already carries direction | Fare step, ops Pricing |
| D46 | Surcharge when | `predicate jsonb` + publish gate refuses `{}` | TypeScript `if (hour >= 22)` | Otherwise the rule that fired is not versioned with the batch (D7 hole) | Publish trigger, night/airport lines |
| D47 | Two expiry clocks | 30-min lock on the signed token; `price_snapshots.expires_at` = payment window, written once | One clock that is both; extending `expires_at` | D42 forbids a snapshot at quote; D19 forbids the UPDATE Phase 2's comment assumed | QUOTE-04, charge gate |
| D48 | Lock artefact | HMAC-SHA256 signed pin of inputs + version ids; Postgres `now()` authors `expires_at` and re-checks at checkout | KV as the lock; snapshot row as the lock; `Date.now()` as author | KV 60 s lag is wrong for a gate; D42 forbids the snapshot; Worker clock is decorative | `/api/quote`, reprice, checkout |
| D49 | Quote-expiry Cron | None that mutates `price_snapshots` | GSD-LAUNCH "Cron expire stale quotes" | D19; expiry is a derived predicate | LIFE-07 split (no-show remains Phase 9) |
| D50 | U7 coupon consume | At PaymentIntent creation, `FOR UPDATE` on `coupons`, no KV reservation | Quote-time consume; Phase 2's soft KV reservation | Coupon is not on `/api/quote`; `booking_id NOT NULL`; KV is a second truth | `coupon_redemptions`, checkout intent |
| D51 | Extras catalogue | Ninth `surcharges` code `oversized_luggage`; quantities from the client, amounts from the rate book | A parallel extras table; client-supplied extra prices | Freeze/publish/i18n already exist on `surcharges` | QUOTE-11, refunds |
| D52 | Mapbox cache | Live Mapbox every quote; `GEO_CACHE` = our polygon + hand-curated fixed-route geometry only | GSD-LAUNCH 24 h place-id-pair KV of Directions/Geocoding | Self-serve terms §1.9 / §2.7.2 / §2.10.1 (PDF 21 July 2026) | Cost model, U33 |
| D53 | Geo providers | Search Box `/suggest`+`/retrieve` (session-tokened, proxied); Geocoding v6 reverse; Directions v5 `mapbox/driving` | Photon in production; Matrix; `driving-traffic`; unrestricted browser token | QUOTE-01 needs geometry; traffic-aware duration is wrong for a future pickup | `/api/geo/*`, `/api/quote` |
| D54 | Service area | Named `fixed_routes` pair OR both ends in polygon; NULL polygon fail-closed; NULL min-advance skip | Radius around HB; skip polygon when NULL; invent 180 minutes | Distant ski destinations are products; skip-polygon = quote Earth | QUOTE-07 |
| D55 | Flight provider | AeroDataBox, one-shot, no poll, no invented buffer, landing time = actual › estimated › scheduled | FlightAware; mock's 45 s poll; landing + N minutes | Cost model; LATER-01 / LIFE-06 are Phase 9; ADR-002 | `/api/flight/:no` |
| D56 | Abuse layers | Zone RL 30/60 `managed_challenge` + Worker `ratelimits` on `ip+vamos_qs` 8/60 (4/60 bare) + invisible Turnstile enforced from the 3rd request | Bare-IP only; Turnstile on the first quote; KV as the per-visitor counter | CGNAT; "under a minute"; KV write-rate; edge challenge survives siteverify outage | QUOTE-09 |
| D57 | Hourly | `hourlyEnabled=false`; `mode: "hourly"` → 422 | Shipping an unmodelled third product | No `hourly_rates` table; owner question with the matrix (U50) | Widget, `/api/quote` |
| D58 | Charge-gate hardening | `SECURITY DEFINER`, `search_path = ''`, explicit `IF NOT FOUND` | Invoker-rights trigger that happens to fail on `IS DISTINCT FROM` | An RLS miss currently skips the `IF`s | `tg_payment_matches_snapshot` |
| D59 | Preview env | `PRICING_PREVIEW` staging-only, **absent** in production | `"false"` string in prod; preview that can charge | Missing binding is a boot error; a draft snapshot is never `is_chargeable` | Staging funnel tests |
| D60 | Hyperdrive split for pricing | Cached book / settings (no `now()`); NOCACHE coupons + writes | One binding; `where effective_from <= now()` on the cached config | Hyperdrive will not cache `now()`; a 75 s publish lag is acceptable, a coupon-cap lag is not | `loadRateBook`, checkout |

---

## UNCERTAIN — carried and new

Phase 2 items this phase must **not** silently close:

| # | Item | The check that settles it | Blocks |
|---|---|---|---|
| U8 | Sub-rappen per-km rates | Read the CHF matrix. Widen to `per_km_millirappen` only if a rate would truncate. Line amount stays integer rappen. | `distance_rates` column type — safe to defer |
| U16 | Round-trip discount percentage | Owner, with the matrix. **Do not seed a number, not even in a fixture.** Line shape exists; `percent` NULL; publish gate refuses an active unpriced `return_trip`. | Return-trip line amount |
| U20 | Who mints `bookings.idempotency_key` and its lifetime | **Phase 7** checkout POST contract. Unique partial index already ships. Do not invent a quote-scoped key here. | Double-charge protection |
| U9 | Display currency copy | Half-settled: `money()` is a mark swap. Remaining: one line of checkout copy that the charge is CHF, four languages. | Phase 7 |
| U5 | Manage-link validity days | Owner. Issuance refuses rather than pick. | Phase 7, not quote |
| U22 | Duration for a phone booking | **Phase 8** assign dialog. Web funnel always has Directions seconds. | OPS-03/04 |

New in this phase (U33+). These ids do not overlap Phase 3's U23–U32.

| # | Item | Why uncertain | The check that settles it | Blocks |
|---|---|---|---|---|
| **U33** | Mapbox Order covering stored Directions distance/duration/geometry and per-booking coordinates | Self-serve terms (PDF 21 July 2026) §2.10.1 / §2.7.2–3 bar the GSD-LAUNCH cache **and** the Phase 2 snapshot/leg columns | Before Mapbox sign-up: email sales with the one-sentence use case. Get an Order clause or a written refusal. Until then: live Mapbox, no KV cache of Mapbox, pin-in-lock is a named legal risk | Planning of any Mapbox cache; production fill of `distance_km` / `estimated_duration_minutes` |
| **U34** | Search Box `permanent` parameter | Terms define Permanent Geocode for Geocoding v5/v6; Search Box docs list no `permanent` | Read live Search Box retrieve params at sign-up. If absent, checkout-time Geocoding v6 `permanent=true` is required | Checkout address persist |
| **U35** | Mapbox Directions / Search Box unit prices | Pricing page has no dated URL; numbers in the geo lane are an August 2026 fetch | Re-fetch `mapbox.com/pricing` at sign-up | Cost model, U37 |
| **U36** | Cloudflare zone plan for custom Rate Limiting + OWASP CRS | Presumed Free; Pro is recommended; not in GSD-LAUNCH budget | Owner sign-off on Pro as a new cost line. Fallback: the one Free RL rule + Worker binding + Turnstile still ship | CRS; second RL slot |
| **U37** | `DAILY_MAPBOX_QUOTE_BUDGET` | Depends on the Mapbox plan, which does not exist | Set at ~70 % of monthly-tolerable ceiling / 30 once the account exists. Until then the breaker is wired with a logging-only sentinel, not a guessed commercial limit | Circuit-breaker threshold |
| **U38** | Night window and airport-zone predicate | Seeded into **draft** from the mock (`22:00–06:00`); owner must confirm before publish | Owner, with the matrix. Publish gate refuses empty predicates | `draft → live` |
| **U39** | Van capacity 7 vs 8 | Widget 7, ops seed 8, vehicles seed 7. `LEAST` → 7 | Owner confirms fleet fact | Copy on the Van card |
| **U40** | Extras duplication on return legs | Inferred from a booking-level checkbox, not an owner decision | Ask whether a child seat / oversize is assumed both ways. Per-leg UI is later | Refund of a single return leg's extras |
| **U41** | Extra-stop detour km at the same per-km rate | Assumed same rate; nowhere specified | Ask with the matrix. A different stop-detour rate needs a column | Fare for a stop-heavy route |
| **U42** | `checkout_abandon_release_minutes` | Column does not exist; coupon reservation release needs a number | Phase 5/7, same "how long do we wait for Stripe" decision as U19. Until then the sweep does not run | Dead coupon-reservation release |
| **U43** | Child seat / oversize as count > 1 | REQUIREMENTS singular; mock is a checkbox | Owner: do Business/Van families need 2+ seats priced separately? Until then count = 1 | Checkout extras UI |
| **U44** | AeroDataBox per-endpoint unit cost | Marketplace page is client-rendered; not confirmed against a paid dashboard | Open RapidAPI pricing while logged in; size the tier from daily lookups × units × 30 | Flight-API tier |
| **U45** | Overnight flight multi-row / `dateLocalRole` | Mock takes `j[0]`; AeroDataBox changelog says overnight can return two records | Look up a known red-eye both days, with and without `dateLocalRole` | Disambiguation UI vs a silent wrong date |
| **U46** | `now()` identity across `sql.begin` sequential awaits | Lock lane: confirm transaction-start freeze | `begin; select now(); select pg_sleep(2); select now();` — both equal | Checkout-time lock comparison |
| **U47** | Stripe auto-cancel of unconfirmed `requires_payment_method` | No documented short timer (7-day rule is `requires_capture`) | Treat explicit `paymentIntents.cancel()` on checkout rollback as **mandatory** until docs say otherwise | Orphaned PaymentIntents (Phase 7) |
| **U48** | Retention of unbound `price_snapshots` (ops_phone) | D19 forbids open DELETE; web path no longer creates them | Owner / GDPR-minimisation, same channel as ADR-002. Do not build `purge_unbought_quotes` in Phase 4 | Storage hygiene only |
| **U49** | Payment-window length on `price_snapshots.expires_at` | Distinct from the 30-min quote lock. No owner number. Column is NOT NULL | Owner, or reuse `quote_lock_minutes` as a conservative same-number default **explicitly recorded** when the snapshot-write plan is written. Do not invent a second constant in this document | Snapshot INSERT |
| **U50** | Hourly hire rate model | Widget flag exists; no table | Owner, with the matrix. Phase 4 ships `hourlyEnabled=false` | A later rate_version, not a freeze-break |
| **U51** | `extra_stop` / `child_seat` `applies_to='leg'` vs engine-core's booking-level extras loop | Phase 2 seed says `leg`; engine-core sketched `applies_to='booking'` | Follow Phase 2 seed (`leg`) + D51 duplication rules. Do not change `applies_to` without an owner extras-UI decision (U40) | Line `leg_seq` |
| **U52** | Security-definer charge-gate vs column-whitelist trigger interaction | Lock lane A | pgTAP `charge_gate.test.sql` as `authenticated` and `vamos_guest` on a local Supabase | D58 landing |
| **U53** | Smart Placement vs Mapbox RTT | ADR-007 unresolved; no measured Frankfurt→Mapbox number | Measure once both accounts exist. Do not assert the < 800 ms warm target before then | Latency claim, not the design |

---

## Owner blockers that touch this engine

1. **The CHF price matrix does not exist.** The engine ships behind no-live-row. Checkout disabled. Every amount `CHF 000` by data. Never invent a price in a fixture, a test, a screenshot or this document's examples.
2. **Waiting allowances** remain NULL (ADR-002). Flight autofill does not invent a buffer. Included waiting lines stay `amount_rappen: null`.
3. **`min_advance_minutes`** remains NULL. Engine skips the threshold; display is TBC. Do not seed 180.
4. **Round-trip percentage** (U16) — do not seed.
5. **Service-area polygon** — NULL, fail-closed for ad-hoc per-km. Named fixed routes still work.
6. **Mapbox account + U33 Order** — nothing in geo can be measured against real infrastructure; the cache is not to be planned.
7. **AeroDataBox / RapidAPI key** — flight route can be written to degrade; live lookup cannot be measured (U44, U45).
8. **Cloudflare zone plan** (U36) and **no Cloudflare/Supabase project** — same as Phase 3. Abuse layers 2–3 can be unit-tested; layer 1 and CRS need a zone.
9. **The four GSD-LAUNCH vs Phase 2 schema conflicts** — record as an ADR before Phase 2 writes a migration. Phase 4 follows Phase 2 until told otherwise.
10. **Night window / airport-zone / Van capacity / extras-on-return** — U38, U39, U40.

Vehicle photography and payment-mark assets do not block Phase 4.

---

## QUOTE-01 … QUOTE-11 coverage

| Requirement | Section | How the done-when is met |
|---|---|---|
| **QUOTE-01** Enter pickup/destination by search or pin, see the route drawn | §7 D53; `04-API-CONTRACT.md` `/api/geo/*` | Search Box proxy + v6 reverse; Directions `geometries=geojson` returned on the quote as `route.legs[].geometry` for the widget to paint. Photon does not ship. |
| **QUOTE-02** One-way or return, date, time, pax, bags, clamped per class | §2 D44 | `LEAST` caps; 200 with labelled ineligible classes; widget auto-move uses the board. Hourly rejected (D57). |
| **QUOTE-03** Price every eligible class: fixed-route else distance + surcharges | §1 D41 D45 | Bidirectional fixed-route match else metres × per-km then min-fare, then surcharges. All classes in one response. Amounts `null` until a live version. |
| **QUOTE-04** Holds 30 minutes; expired refused at payment **by the server** | §5 D47 D48 D49 | Signed lock; Postgres `now()` at checkout; UI countdown decorative; `curl` of an expired token 409s; charge gate is the second clock. No mutating sweep. |
| **QUOTE-05** Stored breakdown + rate version; later changes never alter a historical booking | §3 §4 §9 D42 D43 | Snapshot embeds `basis` + `source_row` + `rate_version_id` + `engine_version`; lines-reconcile trigger; read never recompute. |
| **QUOTE-06** Coupon reduces the quote; refused outside window or past cap | §6 D50 | Seven named refusals; consume at PI creation with `FOR UPDATE`; abandoned quote does not burn a use. |
| **QUOTE-07** Refused inside min advance or outside area, message says which | §7 D54 | Three reason codes (`out_of_service_area`, `min_advance`, `service_area_undefined`). Advance from `settings_versions`, never a constant. NULL advance skipped; NULL polygon fail-closed. |
| **QUOTE-08** Flight number fills in landing time | §11 D55 | `GET /api/flight/:no`; actual › estimated › scheduled; no buffer; degrade to manual time; no background poll. |
| **QUOTE-09** Rate-limited; challenges repeated anonymous visitors | §12 D56 | Zone RL + Worker `ratelimits` + Turnstile from the 3rd request; bogus geometry rejected before Mapbox. |
| **QUOTE-10** Until matrix approved: `pricing_live=false`, checkout disabled, every amount `CHF 000` | §8 D9 D59 | No live row; `total_rappen` null; 409 `pricing_not_live`; trigger has no off switch. |
| **QUOTE-11** Child seat, additional stop, oversized luggage each as its own priced line | §10 D51 | Three surcharge codes; stops as waypoints **and** an `extra_stop` line; amounts null until priced; checkout reprice. |

All eleven have a coverage entry.

---

## Wave B / C / D checklist

Every question the handoff named, answered or UNCERTAIN with the exact check.

### Wave B

| Lane | Question | Answer |
|---|---|---|
| `quote-pipeline-order` | Exact order and why; D6 rounding; recompute from stored lines = total | §1 D41, §3 D43. Fare → surcharge(% of fare) → extras → round-trip(% of fare) → coupon(% of pre-coupon). Identity enforced by `tg_snapshot_lines_reconcile`. |
| `class-eligibility` | Pax/bags clamp; no class eligible | §2 D44. `LEAST`; 200 + `no_eligible_class`, not 422. |
| `snapshot-write-shape` | jsonb `lines` + `policy`; **settle U6** | §4 D42, §13. Chosen-class-only + `shown_alternatives`. Contradicts Phase 2. Worked example `amount_rappen: null`. |
| `pricing-live-gate` | QUOTE-10 end to end; impossible to charge with no live version | §8. Five layers; last has no off switch. |
| `quote-lock-expiry` | Where the lock lives; checkout re-check; clock; Cron vs D19; expire mid-checkout + rate change | §5 D47–D49. Named contradiction with U6; signed token + two clocks; no mutating Cron; fresh re-quote; pin `rate_version_id`. |
| `determinism-audit` | What breaks QUOTE-05 and how each is prevented | §9 T1–T10. |

### Wave C

| Lane | Question | Answer |
|---|---|---|
| `geocoding-search` | Current Mapbox version; session tokens; Zurich bias; Arabic place names | §7 D53. Search Box + v6 reverse; session = one billable unit; `country=CH` + HB proximity; place names are Mapbox data / `.vt-dir-keep`; UI chrome is four-language. |
| `distance-routing-cache` | Directions vs Matrix; what is stored on the leg; KV key 24 h | **Directions `driving`.** `estimated_duration_minutes` from seconds. **KV cache of Mapbox is barred (U33).** Live every quote. Geometry on the quote response for QUOTE-01; not persisted from a Navigation API unless an Order says so. |
| `service-area-advance` | How the area is defined; server check; which-rule message; advance from settings | §7 D54. Two-path; Worker PIP; three i18n keys; `min_advance_minutes` from `settings_versions`, NULL skip. |
| `flight-autofill` | AeroDataBox shape, auth, limits, scheduled/estimated/actual, ambiguity, buffer, KV TTL, degrade, line vs LATER-01 | §11 D55. One-shot; no buffer; no poll; 90 s / 30 min / 6 h; three failure messages. U44/U45 open. |
| `coupons` | Validate against `coupons`; named refusals; **settle U7**; abandoned quote; last-use race | §6 D50. Seven keys; consume at PI creation; `FOR UPDATE`; no KV. Contradicts Phase 2's KV reservation. |
| `extras-lines` | Own priced line; catalogue; per-booking vs per-leg; extra stop vs routed distance | §10 D51. `surcharges`; duplication U40/U51; waypoints **and** `extra_stop` line. |

### Wave D

| Lane | Question | Answer |
|---|---|---|
| `abuse-ratelimit` | Plan tier; key (IP weak); 429 vs challenge; Turnstile placement; siteverify; Turnstile down; WAF false-positive; KV counter; bogus geometry before Mapbox; threshold for re-quotes; how an attack is noticed without Logpush | §12 D56. Presumed Free → recommend Pro (U36). `ip+vamos_qs`. `managed_challenge` at edge, 429/403 in Worker. Invisible, enforce from 3rd. Fail open below threshold / edge challenge above if siteverify down. CRS log-first. KV is the **daily** breaker not the per-visitor gate. Analytics Engine + 10 min Cron + Resend. |

No Wave B/C/D question is unanswered. Open items are UNCERTAIN with checks, not silent guesses.

---

## Proposed Phase 4 plan split

Everything except real numbers ships behind no-live-row. **CHF-matrix-blocked work is last and small.** Phase 3 is a hard gate for anything that talks to Hyperdrive; the pure engine and the HTTP contract can be unit-tested without it.

| # | Plan | Goal | Depends on | Parallel with | Blocked on matrix? |
|---|---|---|---|---|---|
| **P1** | **Kernel** | `round.ts`, `eligibility.ts`, `predicates.ts`, `priceQuote()` pure, property tests, no I/O | Phase 2 types (can stub) | P4 authoring | No — all amounts null |
| **P2** | **HTTP contract** | `POST /api/quote` + signed lock + `POST /api/quote/reprice` against fixture metres; `pricing_live: false` path; 422 vocabulary | P1 | P6 | No |
| **P3** | **Geo** | `/api/geo/suggest|retrieve|reverse`, Directions live (no Mapbox KV), service-area PIP, QUOTE-07 | P2; Mapbox account | P4, P5 | No (U33 blocks only the cache, which we are not building) |
| **P4** | **Flight** | `GET /api/flight/:no`, KV TTL tiers, three degradations, no poll | RapidAPI key (degrades without it) | P3, P5 | No |
| **P5** | **Coupons & extras** | `evaluate_coupon()`, extras quantities on reprice, ninth surcharge seed, `quantity_source` / `predicate` columns | P1; Phase 2 `0008_coupons` | P3 | Amounts stay null |
| **P6** | **Abuse** | `vamos_qs`, Worker `ratelimits`, Turnstile escalate, zod, daily breaker (sentinel ceiling), Analytics Engine | P2 | P3 | No |
| **P7** | **Snapshot write + gates** | `shown_alternatives`, lines-reconcile trigger, D58 charge-gate, coupon-reserve trigger, checkout-intent **shape** (handler may stub until Phase 7), `quote_lock_minutes` | P2, P5; Phase 2 P5 tables | — | No — writes null totals, charge gate still refuses |
| **P8** | **Matrix landing (last, small)** | Seed real rappen into a **draft** version; owner confirms predicates (U38) and U16; staging `PRICING_PREVIEW`; publish runbook. Production flip is the launch trigger, not this plan's merge. | Owner matrix; P1–P7 | nothing | **Yes** |

```
P1 ── P2 ──┬── P3
           ├── P4
           ├── P5 ── P7 ── P8
           └── P6
```

P8 is the only plan that may contain a real number, and even then only in a draft version on staging until the owner types `UPDATE rate_versions SET status='live'`.

---

## Standard Stack

### Core (inherited; not re-chosen)

| Library | Version | Purpose | Why standard |
|---|---|---|---|
| Next.js 15 App Router + TypeScript strict | pinned in Phase 1 | Route handlers for `/api/quote` etc. | Fixed by the stack |
| `@opennextjs/cloudflare` | Phase 1 pin | Worker bundle | No Vercel |
| `postgres.js` via Hyperdrive | Phase 3 | Rate book + writes | D1–D3 |
| `next-intl` | Phase 1 pin | ICU messages, four locales | D-13 / Law 03 |
| `zod` | current at plan time | Request-body schema; reject unknown fields before Mapbox | Standard at the Worker boundary; see Don't Hand-Roll |

### This phase adds

| Library / service | Purpose | When to use |
|---|---|---|
| Mapbox Search Box API + Geocoding v6 + Directions v5 | QUOTE-01 / 07 inputs | Server-side only; token is a wrangler secret |
| AeroDataBox (RapidAPI) | QUOTE-08 | `FLIGHT_API_KEY` secret; never in the browser |
| Cloudflare Turnstile | QUOTE-09 invisible widget + `siteverify` | After pickup+dropoff touched; enforced from 3rd quote |
| Workers Rate Limiting binding | QUOTE-09 per-visitor | `QUOTE_RATE_LIMITER` in `wrangler.jsonc` |
| Workers Analytics Engine | Abuse notice without Logpush | `QUOTE_ABUSE_METRICS` dataset |
| `fast-check` (dev) | Property tests on `roundHalfUp` / `percentOf` / commutativity | Kernel tests only; integers, never CHF figures |

### Alternatives considered

| Instead of | Could use | Tradeoff |
|---|---|---|
| Search Box API | Geocoding v6 forward for type-ahead | Works; billed per keystroke unless we invent our own session grouping. Search Box's session token **is** that grouping. |
| Directions | Matrix + a second geometry call | Matrix has no route line; QUOTE-01 fails. |
| AeroDataBox | FlightAware AeroAPI | $200/month floor for a tracking product. Rejected on cost model. |
| HMAC lock token | KV document as the lock | KV 60 s lag; rejected by the lock lane and kept rejected after U6. |
| HMAC lock token | `price_snapshots` row as the lock | Requires quote-time insert; rejected by D42. |
| Worker PIP | PostGIS | Not installed; disproportionate for one boolean. |
| Integer kernel | `numeric` throughout | postgres.js returns `numeric` as string and `int8` as string; Stripe wants int4 minor units; D6 already chose `rappen`. |

---

## Architecture Patterns

### System architecture (quote request)

```
Browser booking widget
  │  Search Box session_token (one per widget-open)
  │  vamos_qs cookie (HttpOnly)
  │  Turnstile token (invisible, may be missing on 1st/2nd quote)
  ▼
Cloudflare edge
  │  Zone rate-limit rule (30/60, managed_challenge)     — Layer 1
  ▼
Worker  POST /api/quote
  │  1. zod body; reject distance/total/class-price
  │  2. Worker ratelimits (ip+vamos_qs / bare-IP)        — Layer 2
  │  3. Turnstile siteverify (log / enforce from 3rd)    — Layer 3
  │  4. Daily Mapbox breaker (QUOTE_ABUSE KV)
  │  5. Retrieve coords (Search Box / reverse) ── live Mapbox, no KV
  │  6. QUOTE-07 two-path (named pair ∥ polygon)
  │  7. min_advance from settings_versions (skip if NULL)
  │  8. Directions driving ── live Mapbox, no KV
  │  9. loadRateBook via HYPERDRIVE (cached, no now())
  │ 10. priceQuote() pure integer kernel
  │ 11. Mint quote_id; SELECT now() + quote_lock_minutes; HMAC pin
  ▼
JSON  QuoteResponse (totals null while no live rate version)
  │
  … later …
  ▼
POST /api/quote/reprice     (lock + extras + coupon, still no snapshot write)
POST /api/checkout/intent   Phase 7 handler, Phase 4 contract:
                            verify lock against Postgres now()
                            recompute == locked totals
                            ONE tx: snapshot (chosen class) + booking + legs
                                    + coupon_redemptions + booking_payments
                            charge gate + coupon FOR UPDATE
```

### Pattern 1 — Pure engine, injected clock

`priceQuote(book, inputs, ctx)` takes everything as arguments. No I/O, no `Date.now()`, no `Intl`. That is what makes QUOTE-05 a unit test rather than a staging ritual.

### Pattern 2 — Pin inputs, never a client amount

The lock carries metres, version ids, engine version, per-class totals the **server** computed. Checkout recomputes and asserts equality. A client-supplied total is schema-rejected.

### Pattern 3 — Two Hyperdrive configs, no `now()` on the cached one

Pick "settings current as of `computedAt`" in JS. Coupon path stays NOCACHE.

### Pattern 4 — Fail closed on definitions, skip on thresholds

NULL polygon = refuse ad-hoc quotes. NULL min-advance = skip. NULL waiting = TBC pill, never 60. NULL coupon value = refuse to apply. The kind of the missing thing decides the default, not a universal "NULL means skip."

### Anti-patterns

- Inventing a CHF figure in a test so a rounding story "looks real."
- Caching Directions in `GEO_CACHE` because GSD-LAUNCH still says to.
- Writing four snapshot rows per debounce.
- Consuming a coupon on `/api/quote`.
- `parseFloat` on a `numeric` percent.
- Re-running today's engine over yesterday's inputs and calling it a refund.
- Porting `lineWaiting: '60 min airport waiting'`.
- Accepting `mode: "hourly"` with no rate table.
- Putting PII in a KV key.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead | Why |
|---|---|---|---|
| Address type-ahead | Photon in production, or a custom prefix index | Mapbox Search Box, proxied | Session-token billing; the mock's Photon is UI scaffolding |
| Driving distance + geometry | Haversine "as the crow flies"; Matrix then a second geometry call | Directions v5 `mapbox/driving` | QUOTE-01 needs the line; haversine is the wrong fare basis |
| Per-visitor rate limit | A KV INCR | Workers `ratelimits` binding | KV is 1 write/s/key and last-write-wins |
| Bot challenge | A home-grown CAPTCHA | Turnstile invisible + edge `managed_challenge` | "Under a minute"; edge challenge survives siteverify outage |
| Request validation | Ad-hoc `if (typeof body.pax !== 'number')` | `zod` (already the TS-side standard) | Unknown fields (client totals) must be structurally impossible |
| Half-up money | `Math.round(x * 100) / 100` | Integer `roundHalfUp` in this repo | Float ties; this is the one kernel we **do** own |
| Point-in-polygon | PostGIS for one check | ~20-line even-odd ray-casting | PostGIS is not in Phase 2 extensions |
| i18n concatenation | `"Up to " + n + " passengers"` | ICU via `next-intl` | Law 03; Arabic plural; German length |
| JWKS / identity | Re-derive in the quote handler | Phase 3 `withIdentity` | Quote is anonymous (`anon` / cookie); checkout may be `authenticated` |

**Key insight:** the money kernel is the honest hand-roll — no package correctly implements "half-up integer rappen, metres in, percent-as-string, total = sum of lines" against this schema. Everything around it (geo provider, challenge, schema parser, i18n) has a mature answer.

---

## Common Pitfalls

### Pitfall 1: Treating GSD-LAUNCH's KV cache as already allowed
Building `GEO_CACHE.put(placePair, directionsJson)` "for now" is a terms breach under the 21 July 2026 PDF. The cache is an owner decision (U33), not a Phase 4 default.

### Pitfall 2: Writing snapshots from `/api/quote` because the unique index exists
The index is for class-change mid-checkout, not for 30 debounce inserts. D42.

### Pitfall 3: Extending `expires_at` at PaymentIntent creation
D19 forbids the UPDATE. The extension comment in `02-SCHEMA-DRAFT.md` is wrong; delete it when that migration is written.

### Pitfall 4: `parseFloat` on `surcharges.percent`
postgres.js returns `numeric` as a string. `parseFloat('7.35') * 100` is not 735.

### Pitfall 5: Evaluating the night window with `new Date()` in the Worker
That is "was it night at the moment we quoted," not "is the agreed pickup in the window." Use `scheduled_local`.

### Pitfall 6: Failing open on a NULL service-area polygon
That quotes Earth. Fail closed; TBC copy, not "we don't serve Zurich."

### Pitfall 7: Inventing 60 minutes of airport waiting in flight autofill
ADR-002. Pickup = landing time. Waiting is a NULL setting.

### Pitfall 8: Porting the mock's 45 s flight poll
That is LATER-01 / live tracking. QUOTE-08 is one lookup.

### Pitfall 9: Turnstile on the first keystroke of pickup
Burns siteverify on the most price-sensitive request and adds latency to "under a minute." Escalate from the 3rd.

### Pitfall 10: OWASP CRS in Block on day one
`O'Brien` and `LX318` will false-positive. Log first.

### Pitfall 11: A 100 % coupon producing `total_rappen = 0` then inserting `booking_payments`
`charged_rappen > 0` CHECK. A free booking cannot take this payment path. Do not "fix" it by charging 1 rappen. Raise as a Phase 7 concern if the owner ever issues a 100 % code; not settled here.

### Pitfall 12: Client-supplied `distance_m` sneaking through reprice
Reprice must use the **lock's** metres even if the body also contains coordinates. Schema-reject distance/duration/total on every route.

---

## Code Examples

### Integer kernel (no money figures)

```ts
// apps/web/lib/pricing/round.ts
const MAX_NUMERATOR = 2_147_483_647 * 10_000;

export function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0)
    throw new RangeError("roundHalfUp: numerator");
  if (!Number.isSafeInteger(denominator) || denominator <= 0 || denominator % 2 !== 0)
    throw new RangeError("roundHalfUp: denominator");
  if (numerator > MAX_NUMERATOR) throw new RangeError("roundHalfUp: range");
  return (numerator + denominator / 2 - ((numerator + denominator / 2) % denominator)) / denominator;
}

export function percentToHundredths(text: string): number {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) throw new PricingError("percent_unparseable");
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export const percentOf = (base: number, hundredths: number): number =>
  roundHalfUp(base * hundredths, 10_000);

export const perKm = (perKmRappen: number, distanceM: number): number =>
  roundHalfUp(perKmRappen * distanceM, 1_000);
```

### Eligibility

```ts
export function classEligibility(cls: VehicleClassRow, rate: DistanceRateRow | undefined, pax: number, bags: number) {
  const effective_max_pax = rate ? Math.min(cls.passenger_capacity, rate.max_pax) : cls.passenger_capacity;
  const max_bags = cls.luggage_capacity;
  if (!rate)           return { eligible: false, reason: "no_rate" as const, effective_max_pax, max_bags };
  if (!rate.available) return { eligible: false, reason: "unavailable" as const, effective_max_pax, max_bags };
  if (pax > effective_max_pax) return { eligible: false, reason: "pax" as const, effective_max_pax, max_bags };
  if (bags > max_bags)         return { eligible: false, reason: "bags" as const, effective_max_pax, max_bags };
  return { eligible: true, reason: null, effective_max_pax, max_bags };
}
```

### Night window — wall clock, no Date

```ts
function inLocalWindow(scheduledLocal: string, from: string, to: string): boolean {
  const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const t = mins(scheduledLocal.slice(11, 16));
  const a = mins(from), b = mins(to);
  return a <= b ? (t >= a && t < b) : (t >= a || t < b);
}
```

### Totals derived from lines

```ts
export function assembleTotals(lines: Line[]) {
  const priced = (l: Line) => l.kind !== "included";
  const anyPriced = lines.some((l) => priced(l) && l.amount_rappen != null);
  const allPriced = lines.every((l) => !priced(l) || l.amount_rappen != null);
  if (!allPriced) {
    if (anyPriced) throw new PricingError("partially_priced_class");
    return { subtotal: null, surcharges: null, discount: null, total: null };
  }
  const subtotal   = sum(lines.filter((l) => l.kind === "fare"));
  const surcharges = sum(lines.filter((l) => l.kind === "surcharge"));
  const discount   = -sum(lines.filter((l) => l.kind === "discount"));
  return { subtotal, surcharges, discount, total: subtotal + surcharges - discount };
}
```

`formatRappen(null)` at the render boundary is `"CHF 000"` (or the display-currency mark plus `000`). No UI branch on `pricing_live`.

---

## Sources

- Harvested lanes (read in full): `research/quote-engine-core.md`, `coupons-extras.md`, `geo-routing.md`, `quote-lock-expiry.md`, `abuse-ratelimit.md`, `flight-autofill.md`
- `.planning/handoff/PHASE-3-4-HANDOFF.md` §§2–3, Wave B/C/D, definition of done
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-RESEARCH.md` D1–D24, U1–U22
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` §6 coupons, §9 snapshots, §10 append-only, charge gate
- `.planning/REQUIREMENTS.md` QUOTE-01–11; `.planning/ROADMAP.md` Phase 4
- `docs/build/SPEC-home-booking-widget.md`; `app/home/home.dc.html` field list; `app/pages/checkout.dc.html` extras + coupon
- Mapbox Product Terms PDF dated **21 July 2026**, linked from `https://www.mapbox.com/legal/product-terms` (independent check 2026-08-22)
- Stripe currencies; PostgreSQL mathematical functions; Hyperdrive query caching; Workers Rate Limiting binding; Turnstile siteverify; Cloudflare KV write limits

---

## Metadata

- **Phase:** 4 — Quote & Pricing Engine
- **Decisions:** D41–D60
- **U-items opened here:** U33–U53 (plus carried U5, U8, U9, U16, U20, U22)
- **Contradictions named:** U6 vs Phase 2; U7 vs Phase 2 KV reservation; lock-as-snapshot vs D42; Mapbox KV vs terms; four GSD-LAUNCH vs Phase 2 schema conflicts (unresolved owner rulings)
- **Amounts in this file:** `CHF 000` and `amount_rappen: null` only
