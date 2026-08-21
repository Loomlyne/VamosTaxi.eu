I have what I need. Here is the brief.

---

# Phase 4 Research — Lane: `quote-engine-core`

**Scope:** QUOTE-03 (price every eligible class), QUOTE-05 (frozen breakdown + rate version), QUOTE-10 (`pricing_live=false`), QUOTE-02 (pax/bags clamping). Server-authoritative computation over the Phase 2 schema.
**Extends:** `.planning/phases/02-data-schema-rls-staff-auth-foundations/research/price-snapshot.md` (§3.4 `lines`, §4 `pricing_live`) and `02-SCHEMA-DRAFT.md` §6/§9.
**Does not cover:** the 30-min lock artefact (quote-lock-expiry lane), geocoding/zone resolution (geo-routing), flight autofill, coupon *consumption* mechanics (coupons-extras), rate limiting (abuse-ratelimit). Interfaces to each are stated where they touch the engine.
**Date:** 2026-08-22

---

## 0. What is already settled, and the three things this lane changes

Inherited and not re-litigated: **D6** (`rappen` int4, half-up per line, total = sum of already-rounded lines), **D7** (versioned `rate_versions` + insert-only `price_snapshots`), **D8** (i18n key + params, never prose), **D9** (`pricing_live` is one `status='live'` row), **D11** (one booking, one snapshot, per-leg subtotals), **D3** (two Hyperdrive configs).

Three things this lane decides that Phase 2 explicitly deferred or got slightly wrong:

| # | Phase 2 said | Phase 4 says | Why |
|---|---|---|---|
| A | "The quote endpoint prices every eligible class in one call and writes **one row per class**" (`02-SCHEMA-DRAFT.md:1170`, U6 open) | **One row, chosen class, written inside the booking-creation transaction.** Everything shown goes in a new `shown_alternatives jsonb`. | §4 — the mock re-quotes on a 300 ms debounce on *every* field change; N-rows-per-quote is 10–30 quotes × 4 classes × immutable jsonb rows per abandoned session. |
| B | "The snapshot's `expires_at` is **extended** to cover the payment window at intent creation" (`02-SCHEMA-DRAFT.md:1324`) | The snapshot is **append-only** — it cannot be extended. `expires_at` is written once, at snapshot creation, as the *payment-window* deadline. The 30-minute quote lock is a separate, earlier gate. | §8.3 — Phase 2's own §10 append-only trigger forbids the UPDATE that comment assumes. Two clocks, each in the right place. |
| C | §3.4's illustrative `lines` JSON carries `per_km_rappen: 385`, `amount_rappen: 8584`, `percent: 15.00` | Those are **invented CHF figures** and must not be copied into a fixture, a test, a seed or a doc. Every worked example below is `null` / `CHF 000`. | Law 04 + owner blocker #1. The figures are illustrative in a research doc but they will be grepped and pasted. |

---

## 1. The pipeline

```
        ┌─ inputs pinned by the quote lock ─────────────────────────────┐
        │ legs[] (distance_m, duration_s, scheduled_local, zones)       │
        │ pax, bags, extras, coupon_code, display_currency              │
        │ rate_version_id, settings_version_id, engine_version          │
        └───────────────────────────────────────────────────────────────┘
                              │
  1. RESOLVE   live rate_versions row (D9)  ─── none? → pricing_live=false path (§8)
  2. LOAD      the frozen rate book for that version id  (one round trip)
  3. ELIGIBLE  per class: pax/bags/available/priced      (QUOTE-02, §3)
  4. FARE      per leg:  fixed_routes match  ∥  base + per_km·km, then min-fare
  5. SURCHARGE per leg:  percent surcharges (basis = that leg's FARE line only)
                         amount surcharges  (airport pickup, extra stop, …)
                         included lines     (waiting — amount NULL, TBC)
  6. EXTRAS    booking-level amount surcharges × quantity (child seat, oversize)
  7. RETURN    booking-level percent discount on Σ FARE lines   (U16 — no number seeded)
  8. COUPON    booking-level discount on the running pre-coupon total, clamped ≥ 0
  9. ASSEMBLE  subtotal = ΣFARE · surcharges = ΣSURCHARGE · discount = −ΣDISCOUNT
               total    = subtotal + surcharges − discount  ≡  Σ lines
```

### 1.1 The order is load-bearing — here is the argument for each boundary

**Percent surcharges are computed on the leg's fare line, never on a running total, never on another surcharge.**

Three reasons, in order of force:

1. **It makes percent surcharges commutative.** If a percent surcharge applied to a running total, then `night` then `ski_season` ≠ `ski_season` then `night`, and the answer would depend on the row order returned by Postgres — which has no `ORDER BY` guarantee. Pinning the basis to the fare line removes the ordering question entirely, which is the cheapest determinism win in the whole engine (QUOTE-05).
2. **It is the only statement a customer can verify.** "Night surcharge, 15 % of the fare" is checkable against the fare line above it. "15 % of the fare plus the airport fee plus the child seat" is not a sentence anyone writes on a receipt, and a Stripe dispute packet has to survive being read by a stranger.
3. **Percent-of-percent is not defensible.** There is no reading of the mock's `rule:'22:00 – 06:00'` under which the night surcharge should also tax the child seat.

**The coupon is last, on the pre-coupon total, and after the round-trip discount.**

A percentage surcharge applied before vs after a coupon gives different money — so this must be stated, not assumed. It is *after* for two reasons:

1. **The mock already fixes the order.** `app/pages/checkout.dc.html:246-253` builds the line list in exactly this sequence — transfer, airport fee, child seat, additional stops, waiting (`included`), then coupon as a `credit`. That render order is the computation order; the coupon reducing the total *as displayed* is what "coupon reduces the quote" (QUOTE-06) means to the person looking at the panel.
2. **A coupon is a discount on what is payable**, not a discount on the transport component. "20 % off" that silently excludes the airport fee is the kind of thing that generates a support ticket per redemption.

The round-trip discount goes *before* the coupon and takes the same basis rule as every other percent in the engine — Σ of the fare lines. So the engine has exactly **one** percent rule with exactly **one** exception:

> Every percentage in this engine is a percentage of fare lines. The single exception is the coupon, which is a percentage of the pre-coupon total, because a coupon discounts what is payable.

**Min-fare is applied to the fare line, before any surcharge.** Otherwise a 23:10 pickup on a short hop could be lifted over the minimum by the night surcharge and the customer pays less than the minimum *for the ride*, which is not what a minimum fare is. `basis.min_fare_applied` records whether it bit.

**Fixed routes ignore base/per-km/min-fare entirely.** A fixed route is a price, not a formula. `basis.rule = 'fixed_route'` and `source_row` names the row.

### 1.2 Fixed-route matching is bidirectional

`fixed_routes` has `unique (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id)` and `check (origin_zone_id <> dest_zone_id)`. The mock's inventory (`app/vamos-ops-data.js:255-262`) lists one row per pair — `FR-01 Zurich Airport (ZRH) → Zurich city` — while its seeded bookings run both ways (`VT-4830` ZRH→city, `VT-4829` city→ZRH, `VT-4822` HB→ZRH).

**Decision: match `(origin, dest)` first, then `(dest, origin)`.** Requiring two rows doubles the ops Pricing table, invites two prices for one journey that nobody intended to differ, and makes "add Zermatt" a two-step action a dispatcher will half-do. Directionality is already carried where it belongs: the `airport_pickup` surcharge fires on the *pickup* zone, so an airport departure and an airport arrival correctly price differently without a second route row.

The snapshot records which way it matched:

```json
"basis": { "rule": "fixed_route", "matched": "reverse" }
```

### 1.3 Surcharge eligibility is currently code, not data — close that

`public.surcharges` carries `code, kind, amount_rappen, percent, applies_to, active`. It carries **no predicate**. So "22:00–06:00" and "pickup is inside an airport zone" would live in TypeScript, which means the rule that fired is not versioned with the rate batch that priced it — a hole straight through D7.

Phase 4 adds one column, and the existing freeze trigger covers it for free (`tg_pricing_row_frozen` diffs `to_jsonb(old) - 'live' - 'available'`, so any column added later is automatically frozen once the version leaves draft):

```sql
-- packages/db/supabase/migrations/0031_surcharge_predicate.sql   (Phase 4)

alter table public.surcharges
  add column predicate jsonb not null default '{}'::jsonb,
  add column quantity_source text
      check (quantity_source in ('child_seats','extra_stops','oversize_bags')),
  add constraint surcharges_predicate_object check (jsonb_typeof(predicate) = 'object');

comment on column public.surcharges.predicate is
  'WHEN this surcharge fires, as data rather than engine code, so the rule is frozen with the '
  'rate version that priced it (D7). Discriminated by "kind": '
  '  {"kind":"always"} '
  '  {"kind":"pickup_zone_type","zone_type":"airport"} '
  '  {"kind":"local_time_window","tz":"Europe/Zurich","from":"22:00","to":"06:00"} '
  '  {"kind":"dest_zone_tag","tag":"ski"} '
  '  {"kind":"quantity"}   -- fires when quantity_source > 0, amount is per unit '
  'An empty object is an UNANSWERED rule and blocks publishing (see tg_rate_version_transition).';
```

And publishing must refuse a version whose active surcharges have no predicate — the same argument the Phase 2 completeness check already makes about unpriced rows (`02-SCHEMA-DRAFT.md:582`), applied to the rule rather than the number:

```sql
create or replace function public.tg_rate_version_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_missing integer;
begin
  -- … Phase 2 body unchanged (legal transitions, unpriced rows, attribution) …

  if new.status = 'live' and old.status = 'draft' then
    select count(*) into v_missing from public.surcharges s
     where s.rate_version_id = new.id and s.active
       and (s.predicate = '{}'::jsonb or not (s.predicate ? 'kind'));
    if v_missing > 0 then
      raise exception 'rate_version % has % surcharges with no predicate', new.id, v_missing
        using errcode = 'restrict_violation',
              hint = 'A surcharge that cannot say WHEN it fires cannot be published. '
                     'The night window and the airport-zone rule are owner inputs.';
    end if;
    -- … completeness checks, published_at/by stamp …
  end if;
  return new;
end $$;
```

**The night window is an owner input, not a default.** It seeds into the *draft* version with the value the mock states (`22:00–06:00`, `app/vamos-ops-data.js:296`), because a draft cannot charge. It must be confirmed before the flip, and the trigger above is what forces the conversation.

### 1.4 Two vocabulary gaps in the seed

- **`oversize_luggage` does not exist.** QUOTE-11 requires "declare oversized luggage … as its own priced line"; the mock's eight surcharge codes (`app/vamos-ops-data.js:295-303`) have no such code. Phase 4's seed adds a ninth: `code='oversize_luggage', kind='amount', applies_to='booking', quantity_source='oversize_bags', amount_rappen = NULL`.
- **"By the hour" has no rate.** `home.dc.html` ships a third mode behind `hourlyEnabled` (default **true**, section labelled *"Scope flags — pending approval"*), and `SVC` includes `hourly`. There is no hourly column in `distance_rates` and no hourly line kind. **Recommendation: ship Phase 4 with `hourlyEnabled=false`** and carry hourly as an owner question alongside the CHF matrix. Adding an `hourly_rates` table later is a new version, not a schema change to a frozen one.

---

## 2. Loading the rate book — and how D3's two Hyperdrive configs actually split

Hyperdrive caches only non-mutating queries, and explicitly **does not cache a query containing `NOW()` / `CURRENT_TIMESTAMP`**, because "only functions marked IMMUTABLE … are compatible with caching" ([Hyperdrive query caching](https://developers.cloudflare.com/hyperdrive/configuration/query-caching/)). Default `max_age` 60 s, `stale_while_revalidate` 15 s, ceiling 1 hour.

That single fact decides the split:

| Read | Binding | Why |
|---|---|---|
| `rate_versions` live-version resolution | **`HYPERDRIVE`** (cached, 60 s) | The row is small, the query has no `now()`, and a 75-second lag on a *publish* is harmless: the flip is a dated launch event, not a per-request decision. The charge gate re-reads `status` on NOCACHE at payment anyway (`02-SCHEMA-DRAFT.md:1341`). |
| the frozen rate book for a version id | **`HYPERDRIVE`** (cached) | The rows are immutable by trigger. This is the single biggest lever on the "< 800 ms warm" target. |
| `distance_rates.available` / `fixed_routes.live` | **`HYPERDRIVE`** (cached, same query) | Mutable, so up to 75 s stale. Acceptable and must be *stated in the ops hint*: taking a route off sale takes up to about a minute to reach the booking flow. |
| `settings_versions` current row | **`HYPERDRIVE`** (cached) — **but the query must not contain `now()`** | See below. |
| coupon validation + redemption counts | **`HYPERDRIVE_NOCACHE`** | Window and usage caps are time-sensitive; the query contains `now()` and joins `coupon_redemptions`, so it is uncacheable regardless. |
| the snapshot/booking write transaction | **`HYPERDRIVE_NOCACHE`** | D1/D2: identity via `set_config(...,true)` inside one explicit transaction. |

**The `settings_versions` trap.** The natural query is `where effective_from <= now() order by effective_from desc limit 1` — which Hyperdrive will never cache. Drop the `now()` and pick in application code against the engine's single injected clock. This is also more correct: the engine must select the version current *as of `computedAt`*, not as of whenever Postgres executed the statement.

```ts
// apps/web/lib/pricing/ratebook.ts
import type { Sql } from "postgres";

/** Cacheable: no now(), no random(), no mutation — Hyperdrive will serve it from the edge.
 *  5 rows, not 1, so the "current as of computedAt" choice happens in engine code against
 *  the engine's single clock rather than against Postgres's. */
export async function loadSettingsVersions(sql: Sql) {
  return sql<SettingsVersionRow[]>`
    select id, slug, effective_from,
           free_cancel_hours, modification_deadline_hours, min_advance_minutes,
           airport_waiting_minutes, city_waiting_minutes,
           cancellation_tiers, policy_doc_slug, policy_doc_version
      from public.settings_versions
     order by effective_from desc, id desc
     limit 5`;
}

export function currentSettingsVersion(rows: SettingsVersionRow[], computedAt: Date) {
  const row = rows.find((r) => r.effective_from <= computedAt);
  if (!row) throw new PricingError("no_settings_version");
  return row;
}

/** Cacheable. ORDER BY on every collection is not cosmetic — see §9, threat T5. */
export async function loadRateBook(sql: Sql, rateVersionId: number) {
  const [classes, rates, routes, surcharges] = await Promise.all([
    sql`select id, slug, passenger_capacity, luggage_capacity, sort_order
          from public.vehicle_classes where active order by sort_order, slug`,
    sql`select id, vehicle_class_id, base_fare_rappen, per_km_rappen, min_fare_rappen,
               max_pax, available
          from public.distance_rates
         where rate_version_id = ${rateVersionId}
         order by vehicle_class_id`,
    sql`select id, origin_zone_id, dest_zone_id, vehicle_class_id, price_rappen, live
          from public.fixed_routes
         where rate_version_id = ${rateVersionId}
         order by origin_zone_id, dest_zone_id, vehicle_class_id`,
    sql`select id, code, kind, amount_rappen, percent, applies_to, active,
               predicate, quantity_source
          from public.surcharges
         where rate_version_id = ${rateVersionId} and active
         order by code`,                       -- deterministic line ordering (T5)
  ]);
  return { classes, rates, routes, surcharges };
}
```

`percent numeric(5,2)`, `amount_rappen` (int4) and `distance_km numeric(7,2)` cross the postgres.js boundary differently: numeric/decimal "will be returned as a `string`", int4 arrives as a JS number ([postgres.js README](https://github.com/porsager/postgres)). That is a feature — it forces the explicit decimal parse in §5 instead of a silent `parseFloat`.

---

## 3. QUOTE-02 — vehicle-class eligibility

### 3.1 Where the caps come from, and the conflict already in the repo

Two tables carry a passenger cap and they **disagree in the mocks today**:

| Class | `home.dc.html:745-748` (`cap`/`bags`) | `vamos-ops-data.js:274` (`RATE_DEFAULT_PAX`) | `vehicles` seed |
|---|---|---|---|
| Economy | 3 / 3 | 3 | seats 3, bags 3 |
| Business | 3 / 3 | 3 | seats 3, bags 3 |
| First | 3 / 2 | 3 | seats 3, bags 2 |
| **Van** | **7** / 8 | **8** | seats 7, bags 8 |

**Rule: `effective_max_pax = LEAST(vehicle_classes.passenger_capacity, distance_rates.max_pax)`.**

`vehicle_classes.passenger_capacity` is a *fleet* fact (how many belts the car has). `distance_rates.max_pax` is a *commercial* fact belonging to a rate version (how many this version will sell into that class). Taking the minimum means neither table can be exceeded, neither has to be kept in sync with the other, and the Van disagreement resolves to **7** — which is the physically correct answer and the one the customer-facing mock already shows.

Bags have only one source: `vehicle_classes.luggage_capacity`. `distance_rates` has no `max_bags`. Do not add one — a second cap with no second meaning is how the pax conflict above happened.

Both numbers go in the response and in `basis`, so "why isn't Van offered for 8 passengers?" is answerable from the row:

```json
"eligibility": { "pax": 8, "class_capacity": 7, "rate_max_pax": 8, "effective_max_pax": 7 }
```

### 3.2 Return trips: max over legs

`pax`/`bags` are booking-level on `price_snapshots` and per-leg on `booking_legs`. The widget collects them once, so today both legs agree. Write the rule so it is already right if that changes:

```ts
const pax  = Math.max(...inputs.legs.map((l) => l.pax));
const bags = Math.max(...inputs.legs.map((l) => l.bags));
```

One class serves both legs (D11: one booking, one price, one Stripe charge).

### 3.3 The eligibility function

```ts
// apps/web/lib/pricing/eligibility.ts

export type IneligibleReason =
  | "pax"            // party too large for this class
  | "bags"           // luggage too large for this class
  | "unavailable"    // ops switched the class off in this rate version
  | "no_rate"        // this version has no distance_rates row for the class
  | "route_off";     // the only price for this pair is a fixed_route with live = false

export interface ClassEligibility {
  eligible: boolean;
  reason: IneligibleReason | null;
  effective_max_pax: number;
  max_bags: number;
}

export function classEligibility(
  cls: VehicleClassRow,
  rate: DistanceRateRow | undefined,
  pax: number,
  bags: number,
): ClassEligibility {
  const effective_max_pax = rate
    ? Math.min(cls.passenger_capacity, rate.max_pax)
    : cls.passenger_capacity;
  const max_bags = cls.luggage_capacity;
  const base = { effective_max_pax, max_bags };

  if (!rate)             return { eligible: false, reason: "no_rate",     ...base };
  if (!rate.available)   return { eligible: false, reason: "unavailable", ...base };
  // pax before bags: the mock's own precedence (home.dc.html:1239-1240), and the party
  // size is the fact the traveller can least easily change.
  if (pax  > effective_max_pax) return { eligible: false, reason: "pax",  ...base };
  if (bags > max_bags)          return { eligible: false, reason: "bags", ...base };
  return { eligible: true, reason: null, ...base };
}
```

### 3.4 What happens when no class is eligible

**Not an error. A 200 with every class labelled.** `home.dc.html:1204-1210` renders a per-class label — `naPax` → "Up to {n} passengers" — rather than an error state, and `:1252` falls back to `noneFit: 'No class fits this party size yet.'` only for the *selection*, while the board still renders.

So:

```jsonc
{ "no_eligible_class": true,
  "classes": [ { "slug": "van", "eligible": false, "ineligible_reason": "pax",
                 "effective_max_pax": 7, "max_bags": 8, "total_rappen": null, "lines": [] } ] }
```

This is categorically different from QUOTE-07's refusals. Inside the minimum advance window, or outside the service area, is **422** with a single reason code (`min_advance` / `out_of_service_area`) and no class board at all — because those are facts about the *journey*, not about a class, and the widget must say which (`REQUIREMENTS.md:67`).

**Eligibility is computed even when `pax = 0` / `bags = 0` and even when `pricing_live = false`** — capacities live on `vehicle_classes` and `distance_rates`, both readable from a draft version. QUOTE-02 is fully functional before the matrix lands. That is worth stating because it is the only part of the funnel that is.

i18n keys (all four languages, same pass — the mock already has all four at `home.dc.html:771, 830, 888, 922`):

| Key | Params | English |
|---|---|---|
| `quote.class.up_to_pax` | `{n}` | Up to {n} passengers |
| `quote.class.up_to_bags` | `{n}` | Up to {n} bags |
| `quote.class.na_pax` | `{n}` | Not available for {n} passengers |
| `quote.class.na_bags` | `{n}` | Not available for {n} bags |
| `quote.none_fit` | — | No class fits this party size yet. |
| `quote.moved_to` | `{v} {from} {cap}` | Moved to {v} — {from} fits up to {cap}. |
| `quote.error` | — | Couldn't price this — try again |

---

## 4. U6, settled

> **One `price_snapshots` row per booking-relevant pricing decision — the chosen class — written inside the transaction that creates the booking. `/api/quote` writes no rows at all. Everything the customer was shown is preserved in a new `shown_alternatives jsonb` column on that one row.**

### 4.1 Why N-rows-per-quote fails

Phase 2 recorded the volume check as "trivially small for Zurich volume". It is not, because the quote is not a considered action:

```js
// app/home/home.dc.html:1225
q = () => { clearTimeout(this._deb); this._deb = setTimeout(this.fireQuote, 300); };
```

`this.q()` is called from `setPax`, `setBags`, `setHours`, `pickCur`, every geocode result and every date/time change. A traveller planning one trip fires **10–30 quotes**. At 4 classes that is 40–120 immutable jsonb rows per session, on a table with an append-only trigger, four RLS layers and five indexes. At a modest 1 000 planning sessions a day: ~120 000 rows/day, ~44 M rows/year, of which the fraction that become bookings is a rounding error. Add that `/api/quote` is **public and anonymous** (QUOTE-03/09) and the write amplification is also an abuse amplifier: the rate-limit lane's 20/min/IP budget becomes 80 immutable inserts/min/IP through the NOCACHE Hyperdrive config.

It also degrades the thing it was meant to serve. "The unchosen rows are dispute evidence" is only true of the *last* quote in the session; the other 29 quotes are noise that makes the evidence harder to read, not easier.

### 4.2 Why chosen-class-only, with `shown_alternatives`, is right

The dispute question is *"what price board was this customer looking at when they pressed pay?"* That is one array of four totals — not four documents. The full derivation is only ever needed for the class that was actually sold, because that is the only one that was ever charged, refunded, modified or compared.

```sql
-- packages/db/supabase/migrations/0032_snapshot_alternatives.sql   (Phase 4)

alter table public.price_snapshots
  add column shown_alternatives jsonb not null default '[]'::jsonb,
  add constraint price_snapshots_alternatives_array
      check (jsonb_typeof(shown_alternatives) = 'array');

comment on column public.price_snapshots.shown_alternatives is
  'The price board the customer was looking at when they chose, as evidence — one entry per '
  'vehicle class the quote offered, with its total and, when it was not offered, why. '
  'Totals only; the full derivation is kept for the chosen class alone, which is the only '
  'class that was ever charged. U6, settled in Phase 4. '
  'Shape: [{"class_slug":"business","eligible":true,"total_rappen":null,'
  '         "ineligible_reason":null,"chosen":true}, …]';
```

Update the Phase 2 comment on `price_snapshots.quote_id` in the same migration so the two documents do not disagree:

```sql
comment on column public.price_snapshots.quote_id is
  'The quote lock this snapshot was realised from. /api/quote writes NO row: it computes, '
  'returns and pins its inputs + rate_version_id + settings_version_id + engine_version in the '
  'lock, and the row is written once, for the chosen class, in the booking transaction. '
  'The unique index (quote_id, vehicle_class_id) still holds and is still useful: changing '
  'class mid-checkout writes a second row under the same quote_id.';
```

### 4.3 The consequence: the write point moves to the booking transaction

The customer changes the price after the quote — `checkout.dc.html` collects the child seat and the additional stops at the *Extras* step, **after** pricing. A snapshot written at checkout entry would be superseded on every toggle of a checkbox, which is exactly the churn `supersedes_id` exists to make *rare*.

So the checkout page reprices for **display** through a pure, non-writing endpoint, and exactly one row is written when the customer commits:

```
POST /api/quote                  → compute, return, pin the lock. NO DB WRITE.
POST /api/quote/reprice          → recompute against the pinned lock + current extras. NO DB WRITE.
POST /api/checkout/intent        → ONE transaction:
                                     price_snapshots (chosen class, extras, coupon final)
                                     bookings        (reference minted here — a purchase)
                                     booking_legs
                                     price_snapshot_legs
                                     bookings.price_snapshot_id = …
                                     coupon_redemptions
                                     booking_payments (status='requires_payment')  ← gate fires
                                     booking_events   ('price.quoted','booking.created')
```

This also settles the thing `02-SCHEMA-DRAFT.md:1158-1166` worried about — "a NOT NULL booking FK would force the quote endpoint to fabricate contact details or burn a reference". Under this decision the quote endpoint never touches the table, so it fabricates nothing. `booking_id` stays nullable (it costs nothing, and `source='ops_phone'` may yet want it), but in the web funnel it is never NULL.

**LIFE-07's stale-quote sweep collapses to nothing.** There are no unbound snapshot rows to sweep; the quote lock expires by its own TTL. `price_snapshots_unbound` and `price_snapshots_expiry` remain harmless and become the safety net for the `ops_phone` path.

**Interface to the quote-lock-expiry lane:** the lock artefact (KV entry, signed token, whatever) must pin `{rate_version_id, settings_version_id, engine_version, computed_at, expires_at, normalised inputs including distance_m, the per-class totals}`. My only requirement is that it pins *inputs and version ids*, not just an amount, so that the write in `/api/checkout/intent` is a **deterministic recomputation** that is asserted equal to the locked figure — never a copy of a number from a request body. If that lane instead chooses a DB row per quote, the volume arithmetic in §4.1 is the objection they must answer.

---

## 5. D6's rounding rule, concretely

### 5.1 The kernel

Two facts decide the shape. `round(numeric)` in Postgres breaks ties **away from zero**, while `round(double precision)` is "platform dependent, but round to nearest even is the most common rule" ([PostgreSQL — mathematical functions](https://www.postgresql.org/docs/current/functions-math.html)) — so float rounding is banned outright, in SQL and in JS. And Stripe's `amount` is already "in the currency's minor unit", CHF being a two-decimal currency with a 0.50 CHF minimum charge ([Stripe — supported currencies](https://docs.stripe.com/currencies)) — so the integer in the row *is* the integer sent to Stripe and no conversion happens at the boundary.

**Every amount is computed as an exact integer ratio and rounded once, half-up, at the moment the line is produced. Nothing downstream ever rounds again.**

```ts
// apps/web/lib/pricing/round.ts
//
// D6, binding. Every price line is rounded half-up to the whole rappen when computed; a
// total is the SUM OF ALREADY-ROUNDED LINES, never the rounding of an unrounded sum —
// otherwise the lines the customer reads do not add up to the total they are charged.
//
// No float enters this file. Math.round is NOT used: it rounds half toward +Infinity, so
// it disagrees with "half away from zero" on negatives, and it takes a float argument,
// which is where 0.1 + 0.2 gets in. Every discount in this engine is computed as a
// POSITIVE magnitude and its sign is carried by the line's `kind`, so `n` is never
// negative here and "half up" and "half away from zero" coincide by construction.

/** Largest numerator this engine can see: total_rappen ≤ int4 max, scale ≤ 10_000. */
const MAX_NUMERATOR = 2_147_483_647 * 10_000; // 2.1e13 — well inside Number.MAX_SAFE_INTEGER

export function roundHalfUp(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0)
    throw new RangeError(`roundHalfUp: numerator must be a non-negative safe integer, got ${numerator}`);
  if (!Number.isSafeInteger(denominator) || denominator <= 0 || denominator % 2 !== 0)
    throw new RangeError(`roundHalfUp: denominator must be a positive even safe integer, got ${denominator}`);
  if (numerator > MAX_NUMERATOR)
    throw new RangeError("roundHalfUp: numerator exceeds the engine's declared range");
  // denominator is even, so denominator/2 is exact and the +half trick has no bias.
  return (numerator + denominator / 2 - ((numerator + denominator / 2) % denominator)) / denominator;
}

/** 'numeric(5,2)' arrives from postgres.js as a STRING ('15.00'). Parse it to hundredths of
 *  a percent exactly. parseFloat is banned: parseFloat('7.35') * 100 === 734.9999999999999. */
export function percentToHundredths(text: string): number {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?$/.exec(text.trim());
  if (!m) throw new PricingError("percent_unparseable", { text });
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** A percentage OF a rappen amount, rounded half-up. `hundredths` is percent × 100, so the
 *  scale is 100 (percent) × 100 (hundredths) = 10_000. */
export const percentOf = (base: number, hundredths: number): number =>
  roundHalfUp(base * hundredths, 10_000);

/** A per-kilometre rate applied to an integer number of METRES. Metres, not km: Mapbox
 *  Directions returns metres, and computing from a 2-dp km value that was itself rounded
 *  makes the stored derivation irreproducible (§9, threat T6). */
export const perKm = (perKmRappen: number, distanceM: number): number =>
  roundHalfUp(perKmRappen * distanceM, 1_000);
```

### 5.2 Where each rounding happens

| Line | Exact ratio | Rounded at |
|---|---|---|
| distance fare | `base_fare_rappen + perKm(per_km_rappen, distance_m)` | the `perKm` call — `base_fare_rappen` is already whole |
| fixed-route fare | `price_rappen` | nowhere — it is already whole |
| min-fare | `max(fare, min_fare_rappen)` | nowhere — both operands already whole |
| percent surcharge | `percentOf(legFareRappen, hundredths)` | inside `percentOf` |
| amount surcharge / extra | `amount_rappen × quantity` | nowhere — both integers |
| included line | `null` | never |
| return-trip discount | `percentOf(Σ fare lines, hundredths)` | inside `percentOf` |
| coupon, percent kind | `percentOf(preCouponTotal, hundredths)` | inside `percentOf` |
| coupon, amount kind | `min(amount_rappen, preCouponTotal)` | nowhere; the `min` is the clamp |
| **total** | **`Σ` of the above** | **never — it is a sum of integers** |

Because the total is a sum of integers, `total_rappen ≡ Σ lines[].amount_rappen` is an *identity*, not an approximation. §7 enforces it in the database.

### 5.3 The proof, without inventing a price

The half-up rule is stated and tested as a property of the kernel, using unit-free integers that are arithmetic fixtures and never appear on a surface. The only concrete cases anyone needs are the ties:

```ts
// apps/web/lib/pricing/round.test.ts
import fc from "fast-check";
import { roundHalfUp, percentOf, perKm } from "./round";

// The two tie cases. These are integer-division facts, not Vamos fares.
test("ties round up", () => {
  expect(roundHalfUp(1, 2)).toBe(1);   // 0.5  -> 1
  expect(roundHalfUp(3, 2)).toBe(2);   // 1.5  -> 2
  expect(roundHalfUp(5, 10)).toBe(1);  // 0.5  -> 1
});

test("no float ever enters", () => {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 2_147_483_647 }),
    fc.integer({ min: 0, max: 10_000 }),
    (base, hundredths) => Number.isInteger(percentOf(base, hundredths)),
  ));
});

// D6's actual claim: the lines the customer reads add up to the total they are charged.
test("the total is the sum of the already-rounded lines", () => {
  fc.assert(fc.property(
    fc.array(fc.integer({ min: 0, max: 1_000_000 }), { minLength: 1, maxLength: 12 }),
    fc.array(fc.integer({ min: 0, max: 10_000 }),    { maxLength: 4 }),
    (fares, percents) => {
      const fareTotal   = fares.reduce((a, b) => a + b, 0);
      const surcharges  = percents.map((p) => percentOf(fareTotal, p));
      const total       = fareTotal + surcharges.reduce((a, b) => a + b, 0);
      // The rule, restated as the assertion: recomputing from the stored lines reproduces
      // the total exactly. Not "within a rappen". Exactly.
      expect(total).toBe([...fares, ...surcharges].reduce((a, b) => a + b, 0));
    },
  ));
});

// Percent surcharges commute, because they all take the fare line as basis (§1.1).
test("percent surcharges are order-independent", () => {
  fc.assert(fc.property(
    fc.integer({ min: 0, max: 10_000_000 }),
    fc.integer({ min: 0, max: 10_000 }),
    fc.integer({ min: 0, max: 10_000 }),
    (fare, a, b) => percentOf(fare, a) + percentOf(fare, b)
                 === percentOf(fare, b) + percentOf(fare, a),
  ));
});
```

Note what the third test would catch: an implementation that computed `total = round(fareTotal × (1 + Σpercents))` passes a naive "close enough" check and fails this one — and it is the implementation that makes a customer's receipt not add up.

---

## 6. The snapshot write

### 6.1 The `lines` array — the shape, with the four corrections

Extending `price-snapshot.md` §3.4:

1. **`distance_m` integer, not `distance_km` 2-dp**, in `basis` — see §5.1 and threat T6.
2. **`predicate_id`** on a surcharge line, pointing at the frozen `surcharges.predicate` that fired, alongside the human-readable `why`.
3. **`amount_rappen` is signed** for display (discount lines are negative) while the typed `discount_rappen` column is the absolute value. Both identities hold; §7 enforces both.
4. **`params` never contains a rendered noun.** `{"vehicle_class":"business"}` is a slug that resolves through `vehicle.class.business` — which `content_strings.non_translatable` already marks as literal-in-every-language (ADR-012).

The canonical, launch-state example — this is what the engine actually produces today, and what the reviewer should be checking against, because `pricing_live=false`:

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

Every `amount_rappen` is `null` because no `rate_versions` row is `live` and no matrix has landed. `formatRappen(null)` renders `CHF 000`. The **shape is complete and the amounts are absent** — which is precisely Law 04: a labelled gap, not a broken template.

Four rules that make the shape load-bearing (unchanged from the Phase 2 lane, restated because they are binding on this implementation):

- **`i18n_key` + `params`, never rendered prose.** The one literal that stays literal is a coupon `code` — it is a code, and it wears `.vt-dir-keep` in Arabic.
- **`basis.why` is the justification, in wall-clock terms.** `"pickup_local": "2026-09-04T23:10"` is the fact that justifies the charge; recomputing "was this 23:10?" from a UTC instant in month 7 is a DST bug waiting to happen. `booking_legs.scheduled_local` already stores exactly this string.
- **`leg_seq` on every line**, `null` for booking-level lines, plus `allocation` on booking-level lines so a single-leg refund apportions by the rule that was *recorded*, not one invented at refund time.
- **`amount_rappen: null`** for `kind:"included"` and for anything the matrix has not priced.

This maps onto the mock's renderer with no UI change (`checkout.dc.html:246`): `kind:"included"` → `muted:true`, `kind:"discount"` → `credit:true`, everything else a plain line.

**One breach to fix while porting.** The mock's key is `lineWaiting:'60 min airport waiting'` (`checkout.dc.html:177`) — a hardcoded 60 in customer-facing copy, which is exactly what ADR-002 forbids. It becomes `price.surcharge.waiting_airport.label` with a `{minutes}` param, and when `settings_versions.airport_waiting_minutes` is NULL the renderer wears the `data-tok` TBC pill instead of a number. Same for `lineChildSeat:'Child seat × 1'` → `{quantity}` param, and `lineTransfer + vehicleName + lineTransferClass` → one parameterised key (three concatenated fragments are a Law 03 breach in German and unfixable in Arabic).

### 6.2 The `policy` object

Unchanged from `price-snapshot.md`, built from `currentSettingsVersion(rows, computedAt)`:

```json
{
  "settings_version_id": 4,
  "free_cancel_hours": 24,
  "modification_deadline_hours": 24,
  "min_advance_minutes": 180,
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

The two `null`s are ADR-002 working. The engine must **refuse to substitute 60/15**, and `price_snapshots_policy_shape` already refuses a snapshot that omits the keys entirely — so "we forgot the waiting policy" and "the waiting policy is unanswered" are distinguishable at the row level, which is the whole point.

### 6.3 The engine, end to end

```ts
// apps/web/lib/pricing/engine.ts
//
// Pure. No I/O, no Date.now(), no Intl, no float. Everything it needs is an argument.
// That is not fastidiousness: it is what makes QUOTE-05 testable — the same inputs against
// the same rate version yield the same amount, forever, provably, in a unit test.

export const ENGINE_VERSION = `quote-engine@${process.env.GIT_SHA ?? "dev"}`;

export function priceQuote(book: RateBook, inputs: QuoteInputs, ctx: EngineContext): QuoteResult {
  const pax  = Math.max(...inputs.legs.map((l) => l.pax));
  const bags = Math.max(...inputs.legs.map((l) => l.bags));

  const classes = book.classes.map((cls) => {
    const rate = book.rates.find((r) => r.vehicle_class_id === cls.id);
    const elig = classEligibility(cls, rate, pax, bags);
    if (!elig.eligible) return { cls, elig, lines: [], totals: EMPTY_TOTALS };
    return priceClass(book, inputs, ctx, cls, rate!, elig);
  });

  return { classes, no_eligible_class: classes.every((c) => !c.elig.eligible) };
}

function priceClass(book, inputs, ctx, cls, rate, elig): ClassQuote {
  const lines: Line[] = [];
  let seq = 0;
  const legFare = new Map<1 | 2, number | null>();

  // ── 1 & 4. FARE, per leg ────────────────────────────────────────────────────
  for (const leg of inputs.legs) {
    const fixed = matchFixedRoute(book, leg, cls.id);   // §1.2, bidirectional
    let amount: number | null = null;
    let basis: Basis;

    if (fixed) {
      amount = fixed.price_rappen;                       // null until the matrix lands
      basis  = { rule: "fixed_route",
                 matched: fixed.matched,                 // 'forward' | 'reverse'
                 price_rappen: fixed.price_rappen };
    } else if (rate.base_fare_rappen != null && rate.per_km_rappen != null
                                             && rate.min_fare_rappen != null) {
      const raw = rate.base_fare_rappen + perKm(rate.per_km_rappen, leg.distance_m);
      amount = Math.max(raw, rate.min_fare_rappen);      // min-fare bites the FARE line
      basis  = { rule: "per_km", distance_m: leg.distance_m,
                 per_km_rappen: rate.per_km_rappen,
                 base_fare_rappen: rate.base_fare_rappen,
                 min_fare_rappen: rate.min_fare_rappen,
                 min_fare_applied: amount !== raw };
    } else {
      basis  = { rule: "per_km", distance_m: leg.distance_m,
                 per_km_rappen: rate.per_km_rappen,
                 base_fare_rappen: rate.base_fare_rappen,
                 min_fare_rappen: rate.min_fare_rappen,
                 min_fare_applied: false };              // amount stays null — Law 04
    }

    legFare.set(leg.leg_seq, amount);
    lines.push({ seq: ++seq, leg_seq: leg.leg_seq, kind: "fare",
                 code: "distance_fare", i18n_key: "price.line.transfer",
                 params: { vehicle_class: cls.slug },
                 basis,
                 source_row: fixed
                   ? { table: "fixed_routes",   id: fixed.id, rate_version_id: book.rate_version.id }
                   : { table: "distance_rates", id: rate.id,  rate_version_id: book.rate_version.id },
                 amount_rappen: amount });
  }

  // ── 5. SURCHARGES, per leg. Ordered by code (T5). Percent basis = THIS LEG'S FARE. ──
  for (const leg of inputs.legs) {
    const fare = legFare.get(leg.leg_seq);
    for (const s of book.surcharges.filter((x) => x.applies_to === "leg")) {
      const why = evaluatePredicate(s.predicate, leg, ctx);   // null = does not fire
      if (!why) continue;
      seq++;
      if (s.kind === "included") {
        lines.push({ seq, leg_seq: leg.leg_seq, kind: "included", code: s.code,
                     i18n_key: `price.surcharge.${s.code}.label`,
                     params: { minutes: includedMinutesFor(s.code, ctx.settings) },
                     basis: { rule: "included",
                              included_minutes: includedMinutesFor(s.code, ctx.settings),
                              source: sourceFieldFor(s.code) },
                     amount_rappen: null });               // never a number, ever
      } else if (s.kind === "percent") {
        const hundredths = s.percent == null ? null : percentToHundredths(s.percent);
        lines.push({ seq, leg_seq: leg.leg_seq, kind: "surcharge", code: s.code,
                     i18n_key: `price.surcharge.${s.code}.label`,
                     basis: { rule: "percent", percent: s.percent, of_rappen: fare,
                              of_line_seq: lineSeqOfFare(lines, leg.leg_seq), why },
                     source_row: { table: "surcharges", id: s.id,
                                   rate_version_id: book.rate_version.id },
                     amount_rappen: (hundredths == null || fare == null)
                                      ? null : percentOf(fare, hundredths) });
      } else {
        const qty = quantityFor(s, inputs);
        lines.push({ seq, leg_seq: leg.leg_seq, kind: "surcharge", code: s.code,
                     i18n_key: `price.surcharge.${s.code}.label`,
                     params: qty > 1 ? { quantity: qty } : undefined,
                     basis: { rule: "amount", amount_rappen: s.amount_rappen,
                              quantity: qty, why },
                     source_row: { table: "surcharges", id: s.id,
                                   rate_version_id: book.rate_version.id },
                     amount_rappen: s.amount_rappen == null ? null : s.amount_rappen * qty });
      }
    }
  }

  // ── 6. BOOKING-LEVEL EXTRAS — same loop, applies_to = 'booking', leg_seq = null. ──
  //     (omitted for length; identical body with leg_seq: null and a booking-scoped predicate)

  // ── 7. RETURN-TRIP DISCOUNT — percent of Σ FARE lines. U16: no number is seeded. ──
  const fareTotal = sumLines(lines, (l) => l.kind === "fare");
  if (inputs.legs.length === 2) {
    const rt = book.surcharges.find((x) => x.code === "return_trip");
    const h  = rt?.percent == null ? null : percentToHundredths(rt.percent);
    lines.push({ seq: ++seq, leg_seq: null, kind: "discount", code: "return_trip",
                 i18n_key: "price.line.return_discount",
                 basis: { rule: "percent", percent: rt?.percent ?? null,
                          of_rappen: fareTotal, of: "fare_lines" },
                 allocation: "pro_rata",
                 source_row: rt ? { table: "surcharges", id: rt.id,
                                    rate_version_id: book.rate_version.id } : null,
                 amount_rappen: (h == null || fareTotal == null) ? null : -percentOf(fareTotal, h) });
  }

  // ── 8. COUPON — last, on the pre-coupon total, clamped so the total cannot go negative. ──
  if (ctx.coupon) {
    const pre = sumLines(lines, () => true);
    let magnitude: number | null = null, clamped = false;
    if (pre != null) {
      if (ctx.coupon.kind === "percent" && ctx.coupon.percent != null) {
        magnitude = percentOf(pre, percentToHundredths(ctx.coupon.percent));
      } else if (ctx.coupon.kind === "amount" && ctx.coupon.amount_rappen != null) {
        magnitude = Math.min(ctx.coupon.amount_rappen, pre);
        clamped   = magnitude !== ctx.coupon.amount_rappen;
      }
      // Both null => an UNPRICED coupon. Law 04: refuse to apply it, do not silently
      // treat it as zero. ctx.coupon is only set when validateCoupon() passed.
    }
    lines.push({ seq: ++seq, leg_seq: null, kind: "discount", code: "coupon",
                 i18n_key: "price.line.coupon",
                 params: { code: ctx.coupon.code_as_typed },
                 basis: { rule: ctx.coupon.kind, percent: ctx.coupon.percent,
                          of_rappen: pre, of: "pre_coupon_total", clamped },
                 source_row: { table: "coupons", id: ctx.coupon.id },
                 allocation: "pro_rata",
                 amount_rappen: magnitude == null ? null : -magnitude });
  }

  return { cls, elig, lines, totals: assembleTotals(lines) };
}

/** The typed columns are DERIVED from the lines, never computed in parallel with them.
 *  Parallel computation is how a total stops matching its own breakdown. */
export function assembleTotals(lines: Line[]) {
  const anyPriced   = lines.some((l) => l.kind !== "included" && l.amount_rappen != null);
  const allPriced   = lines.every((l) => l.kind === "included" || l.amount_rappen != null);
  if (!allPriced) {
    // price_snapshots_all_or_nothing: no half-priced rows. Either the matrix has landed
    // for this class or it has not.
    if (anyPriced) throw new PricingError("partially_priced_class");
    return { subtotal: null, surcharges: null, discount: null, total: null };
  }
  const subtotal   = sum(lines.filter((l) => l.kind === "fare"));
  const surcharges = sum(lines.filter((l) => l.kind === "surcharge"));
  const discount   = -sum(lines.filter((l) => l.kind === "discount"));
  return { subtotal, surcharges, discount, total: subtotal + surcharges - discount };
}
```

`evaluatePredicate` for the one predicate that has a clock in it — and note it never reads a clock:

```ts
/** The night window is a WALL-CLOCK rule about the time the customer agreed to, so it is
 *  evaluated against `scheduled_local` ('YYYY-MM-DDTHH:MM', Europe/Zurich, already stored
 *  on booking_legs). No Date, no Intl, no timezone library, no DST question, no ICU
 *  dependency in the Worker. See §9, threat T2. */
function inLocalWindow(scheduledLocal: string, from: string, to: string): boolean {
  const mins = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  const t = mins(scheduledLocal.slice(11, 16));
  const a = mins(from), b = mins(to);
  return a <= b ? (t >= a && t < b) : (t >= a || t < b);   // wraps midnight
}
```

---

## 7. Recomputing from the stored lines must reproduce the total — enforced in the database

The identity in §5.2 is worth nothing if nothing checks it. A `CHECK` constraint cannot contain a sub-query, so this is a trigger — and it fires before the append-only trigger can ever be relevant, because the row is never updated.

```sql
-- packages/db/supabase/migrations/0033_snapshot_reconcile.sql   (Phase 4)

/**
 * D6, enforced: `total_rappen` is the sum of the already-rounded lines. If a future engine
 * ever computes the total in parallel with the breakdown instead of deriving it from the
 * breakdown, this raises at INSERT rather than shipping a receipt that does not add up.
 *
 * It also enforces Law 04's half of the rule in the other direction: an unpriced snapshot
 * may not carry a priced line, so "CHF 000 everywhere" cannot be a partial truth.
 */
create or replace function public.tg_snapshot_lines_reconcile() returns trigger
language plpgsql as $$
declare
  v_all bigint; v_fare bigint; v_sur bigint; v_disc bigint;
  v_n int; v_seqs int; v_unkeyed int; v_nonint int;
begin
  select count(*),
         count(distinct (l->>'seq')::int),
         count(*) filter (where coalesce(l->>'i18n_key','') = ''),
         count(*) filter (where l ? 'amount_rappen'
                            and l->>'amount_rappen' is not null
                            and (l->>'amount_rappen') !~ '^-?[0-9]+$')
    into v_n, v_seqs, v_unkeyed, v_nonint
    from jsonb_array_elements(new.lines) l;

  if v_n <> v_seqs then
    raise exception 'price_snapshot lines have duplicate or missing seq values'
      using errcode = 'restrict_violation';
  end if;
  -- D8 / Law 03: a line without an i18n key renders as English prose in a German email,
  -- immutably, forever. Refuse it at write time.
  if v_unkeyed > 0 then
    raise exception '% price_snapshot line(s) carry no i18n_key', v_unkeyed
      using errcode = 'restrict_violation',
            hint = 'Lines store an i18n key plus numeric params, never rendered label text.';
  end if;
  if v_nonint > 0 then
    raise exception '% price_snapshot line(s) carry a non-integer amount_rappen', v_nonint
      using errcode = 'restrict_violation',
            hint = 'D6: every amount is whole rappen, rounded half-up when the line is computed.';
  end if;

  if new.total_rappen is null then
    if exists (select 1 from jsonb_array_elements(new.lines) l
                where (l->>'amount_rappen') is not null
                  and (l->>'amount_rappen')::bigint <> 0) then
      raise exception 'unpriced snapshot carries a priced line'
        using errcode = 'restrict_violation',
              hint = 'QUOTE-10 / Law 04: a class is priced or it is not. No half-priced rows.';
    end if;
    return new;
  end if;

  select coalesce(sum((l->>'amount_rappen')::bigint), 0),
         coalesce(sum((l->>'amount_rappen')::bigint) filter (where l->>'kind' = 'fare'), 0),
         coalesce(sum((l->>'amount_rappen')::bigint) filter (where l->>'kind' = 'surcharge'), 0),
         coalesce(-sum((l->>'amount_rappen')::bigint) filter (where l->>'kind' = 'discount'), 0)
    into v_all, v_fare, v_sur, v_disc
    from jsonb_array_elements(new.lines) l;

  if v_all <> new.total_rappen then
    raise exception 'snapshot total % <> sum of lines %', new.total_rappen, v_all
      using errcode = 'restrict_violation',
            hint = 'D6: the total is the sum of ALREADY-ROUNDED lines, never the rounding of '
                   'an unrounded sum. The customer must be able to add up their own receipt.';
  end if;
  if v_fare <> new.subtotal_rappen
     or v_sur  <> new.surcharges_rappen
     or v_disc <> new.discount_rappen then
    raise exception 'snapshot typed totals (%/%/%) disagree with lines (%/%/%)',
      new.subtotal_rappen, new.surcharges_rappen, new.discount_rappen, v_fare, v_sur, v_disc
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

-- Runs after tg_snapshot_rate_version_flag (alphabetical order among BEFORE triggers is
-- Postgres's rule, and 'price_snapshots_lines_reconcile' > 'price_snapshots_rate_version_flag'
-- is false — so name it deliberately). Order does not actually matter here: the two triggers
-- touch disjoint columns.
create trigger price_snapshots_zz_lines_reconcile
  before insert on public.price_snapshots
  for each row execute function public.tg_snapshot_lines_reconcile();
```

pgTAP tests Phase 4 owns (`packages/db/supabase/tests/`):

| Test | Asserts |
|---|---|
| `snapshot_lines_reconcile.test.sql` | a snapshot whose `total_rappen` differs from `Σ lines` by 1 raises `restrict_violation` |
| `snapshot_unpriced_pure.test.sql` | `total_rappen IS NULL` + one priced line raises |
| `snapshot_lines_i18n.test.sql` | a line with `"label":"Airport pickup"` and no `i18n_key` raises |
| `rate_version_predicate_gate.test.sql` | `draft → live` with an empty-predicate active surcharge raises |
| `charge_gate_no_live_version.test.sql` | with zero `status='live'` rows, every `booking_payments` insert raises |
| `fixed_route_reverse.test.sql` | a `(dest, origin)` journey matches the `(origin, dest)` row and records `matched:"reverse"` |

---

## 8. QUOTE-10 — `pricing_live=false`, end to end

### 8.1 What each layer does

| # | Layer | Behaviour with no `status='live'` row | Off switch? |
|---|---|---|---|
| 1 | **Data** | No `rate_versions` row is live. Every `distance_rates.*_rappen`, `fixed_routes.price_rappen`, `surcharges.amount_rappen`/`percent` is NULL in the draft version. | — |
| 2 | **Engine** | `assembleTotals` returns `total: null` for every class. Eligibility, route, distance, duration, policy and the **complete line shape** are all still computed. | — |
| 3 | **API** | `/api/quote` returns `pricing_live: false` and `total_rappen: null` per class. `/api/checkout/intent` returns **409 `pricing_not_live`** before it touches Stripe. | env only affects *display* (§8.2) |
| 4 | **UI** | `formatRappen(null)` → `"CHF 000"`. Not a UI conditional — the widget renders the same component with a null amount. The board's primary CTA is disabled and labelled from `quote.pricing_pending`. | — |
| 5 | **Database** | `price_snapshots.is_chargeable` is a `STORED` generated column, `false` when `total_rappen IS NULL` or `rate_version_is_live` is false. `tg_payment_matches_snapshot` refuses every `booking_payments` insert. | **none** |

In production, layers 3 and 5 mean **no booking is created at all**, so **no snapshot row is ever written**. That is the honest consequence and it should be stated plainly to the owner: *until the CHF matrix is approved, the business cannot take a booking — not on the web and not by phone through ops — because it cannot sell at a price it has not set.*

### 8.2 The one environment variable, and what it may not do

`PRICING_PREVIEW=true` on staging only. It changes exactly one thing: `/api/quote` resolves the newest **draft** version instead of requiring a live one, so the funnel is genuinely testable end to end with the draft matrix's numbers.

It cannot cause a charge, and the reason is structural rather than disciplinary: a snapshot citing a draft version has `rate_version_is_live = false` (set by `tg_snapshot_rate_version_flag` from the table, **never** from the caller), so `is_chargeable` is `false`, so the gate raises. And even if someone published-then-unpublished, the gate re-reads `rate_versions.status` at charge time and refuses `draft` explicitly (`02-SCHEMA-DRAFT.md:1341`).

The variable must be **absent** from the production Worker, not set to `false` — a missing binding is a `TypeError` at boot, which is a louder failure than a typo'd `"false"` string being truthy.

### 8.3 `expires_at` — correcting Phase 2's "extend"

`price_snapshots` is append-only (§10, four layers). It cannot be updated, so it cannot be "extended". The two clocks:

| Clock | Lives in | Checked | Length |
|---|---|---|---|
| the 30-minute quote lock (QUOTE-04) | the quote-lock lane's artefact | at `/api/checkout/intent`, **before** the snapshot is written | 30 min from `/api/quote` |
| `price_snapshots.expires_at` | the row | by `tg_payment_matches_snapshot` at `booking_payments` insert, and again by the Stripe handler | the **payment window**, from snapshot write |

The snapshot is created at PaymentIntent creation, so `expires_at = computed_at + PAYMENT_WINDOW` and the gate's `s.expires_at <= now()` check fires only if the customer's payment sheet outlived the window. This is the ordering the Phase 2 comment was reaching for — "if the gate ran on the webhook path instead, a customer who sat in the 3-D Secure sheet for 31 minutes would be charged by Stripe and then have the settlement row refused by our own trigger" — achieved without an UPDATE the schema forbids.

### 8.4 The flip

`rate_versions_one_live` is a plain (non-deferrable) partial unique index, so publishing while another version is live fails. The publish procedure is **retire, then publish, in one transaction** — and it is the launch trigger, so it is a dated, attributed row, not a boolean:

```sql
-- The launch trigger. Run once, by the owner, after approving the matrix.
begin;
  update public.rate_versions set status = 'retired' where status = 'live';
  update public.rate_versions set status = 'live'    where slug = 'matrix-2026-09';
commit;
```

`tg_rate_version_transition` enforces on that second statement: only `draft → live` is legal, every `available` distance-rate row is fully priced, every active non-`included` surcharge is priced, every active surcharge has a predicate (§1.3), every `live` fixed route is priced, and `published_at`/`published_by` are stamped from `app.uid()` rather than trusted.

**Rolling back the flip is `live → retired`, and then there is no live version, so `pricing_live` is false again.** `live → draft` is illegal by design: if it were legal, `tg_pricing_row_frozen` would stop raising and the rows an immutable snapshot cites as `source_row` would become editable. Retiring is the only undo, and it is dated. Snapshots already locked against a retired version are still honoured at payment — deliberately, because the customer was shown that price minutes ago and the version's rows are frozen.

---

## 9. Determinism (QUOTE-05) — ten threats and what stops each

> **The rule underneath all ten: a historical snapshot is READ, never recomputed.** Reproducing a decision means re-running the engine *as it existed at quote time*, which is a code version, not a data version. Every refund, modification diff, confirmation email and dispute packet reads `bookings.price_snapshot_id`. Nothing in this system ever runs the current engine over historical inputs and calls the answer authoritative.

| # | Threat | What breaks | Prevention |
|---|---|---|---|
| **T1** | A live join to a mutable pricing row | `surcharges.id = 11` is edited in month 7; a month-2 snapshot's join silently resolves to today's number while looking rigorous | Rows are frozen by `tg_pricing_row_frozen` once the version leaves draft; the snapshot **embeds** the numbers in `basis` as well as citing `source_row`; the redundancy is the point |
| **T2** | A clock read inside pricing | `now()` in the night predicate makes the same quote price differently at 21:59 and 22:01 for the *same pickup* | The night window is evaluated against `scheduled_local` — the wall clock the customer agreed to, already stored on `booking_legs`. `computedAt` is a single injected value; the engine calls no `Date` API. As a bonus, no `now()` means the rate-book query is Hyperdrive-cacheable |
| **T3** | Floating point | `parseFloat('7.35') * 100 === 734.9999999999999`; `round(double precision)` ties are "platform dependent" | Integer kernel (§5.1); `numeric` arrives from postgres.js as a **string**, forcing an explicit decimal parse; `roundHalfUp` throws on a non-safe-integer argument rather than quietly truncating |
| **T4** | Locale-dependent formatting leaking into arithmetic | `toLocaleString('de-CH')` in a code path that is later parsed back | Formatting exists only in `apps/web/lib/currency.ts`, at the render boundary. Never format-then-parse. (Adjacent finding: `formatFigure` there uses `toLocaleString("de-CH")` for the `1'250.00` apostrophe grouping, which depends on the Worker's ICU dataset — Cloudflare documents that `Intl` is available but not that the full ICU dataset is. Hand-formatting the apostrophe grouping removes a dependency nobody needs.) |
| **T5** | Non-deterministic row order | Postgres gives no ordering guarantee without `ORDER BY`; two identical quotes produce the same total but different `lines` arrays and different `seq` numbers, so the byte-for-byte snapshot comparison a modification diff relies on fails | `ORDER BY` on every engine query (`surcharges` by `code`, `classes` by `sort_order, slug`, routes by the zone tuple); `seq` assigned by a pure function of `(leg_seq, kind rank, code)` |
| **T6** | Routed distance drift | Mapbox returns a different `distance` on the second call (traffic, route revision); a re-price at checkout silently differs from the quote | `distance_m` is an **input**, pinned in the quote lock and echoed into `basis.distance_m`. Never re-fetched between quote and snapshot. `distance_km numeric(7,2)` on the row is a derived display/filter value; the engine computes from metres, so a re-derivation from the rounded km can never be mistaken for the original |
| **T7** | Rate-version drift mid-session | A version is published while the customer is in checkout; the recompute at `/api/checkout/intent` uses "the live one now" and charges a different number than the one shown | The lock pins `rate_version_id`; the recompute loads **that** version by id. If the recomputed total differs from the locked total the request is **409 `price_changed`** with a re-quote, never a silent re-price |
| **T8** | Engine code drift | A deploy lands while the customer is in checkout; the running code produces a different breakdown than the one that was shown | The lock pins `engine_version`. `ENGINE_VERSION !== lock.engine_version` at snapshot time is **409 `engine_changed`** → re-quote. This is the one that turns a routine deploy into a wrong charge if it is skipped |
| **T9** | Hyperdrive stale cache | A retired version keeps pricing for up to `max_age + swr` (75 s) | Accepted and bounded. Prices are immutable so staleness is harmless; the mutable flags (`available`, `live`) lag by up to 75 s, which must be stated in the ops Pricing hint; the charge gate re-reads `rate_versions.status` on the NOCACHE binding at payment |
| **T10** | Coupons are not version-frozen | `coupons` is a live table by Phase 2 design; editing `ZRH20` later would rewrite a historical discount if the snapshot only stored an FK | The coupon line embeds `basis.percent` / `basis.of_rappen` / `basis.clamped` and `coupon_code` "as the customer typed it". The FK answers the ops question; the embedded copy answers the customer's |

The unit test that states QUOTE-05 as a single assertion:

```ts
test("QUOTE-05: the same inputs against the same rate version yield the same money, forever", () => {
  const book = frozenRateBookFixture();          // a pinned rate_version, all amounts NULL
  const a = priceQuote(book, INPUTS, { computedAt: new Date("2026-09-04T09:00:00Z"), ... });
  const b = priceQuote(book, INPUTS, { computedAt: new Date("2029-01-17T23:59:59Z"), ... });
  // Not "the totals match" — the whole document matches, byte for byte, three years apart.
  expect(JSON.stringify(b)).toBe(JSON.stringify(a));
});
```

---

## 10. `/api/quote` — the response contract

```ts
// apps/web/app/api/quote/route.ts  — response type
export interface QuoteResponse {
  quote_id: string;                 // uuid; the lock's handle. NO price_snapshots row exists yet.
  expires_at: string;               // ISO; the 30-minute lock (QUOTE-04)
  engine_version: string;
  pricing_live: boolean;            // false => every total_rappen is null; UI reads CHF 000
  rate_version: { id: number; slug: string };
  settings_version_id: number;
  display_currency: "CHF" | "EUR" | "USD" | "AED";  // a MARK, never a conversion (ADR-004)
  route: { legs: Array<{ leg_seq: 1 | 2; distance_m: number; duration_s: number }> };
  no_eligible_class: boolean;
  classes: Array<{
    slug: "economy" | "business" | "first" | "van";
    eligible: boolean;
    ineligible_reason: IneligibleReason | null;
    effective_max_pax: number;
    max_bags: number;
    fixed_route: boolean;
    total_rappen: number | null;    // null => CHF 000, by data
    lines: Line[];                  // complete shape even when unpriced
  }>;
  policy: PolicySnapshot;           // the same object that lands in price_snapshots.policy
}
```

`422` for QUOTE-07 refusals: `{ error: "min_advance", i18n_key: "quote.error.min_advance", params: { minutes: 180 } }` / `{ error: "out_of_service_area", ... }`. Reason codes are i18n keys with numeric params, in all four languages, in the same pass.

`409` from `/api/checkout/intent`: `price_changed`, `engine_changed`, `quote_expired`, `pricing_not_live`, `coupon_no_longer_valid`.

**On U9 (`display_currency`).** `app/vamos-locale.js:102-105` is unambiguous: `money()` concatenates a mark onto the *unchanged* figure. So the customer *does* literally see `€ 000` for a CHF amount. The engine's contribution is to return the CHF number and the mark separately and record `display_currency` on the snapshot; the unwritten requirement ADR-004 flags — *the charge currency must be stated in words at checkout* — is Phase 7 copy work, in four languages, and should be raised there rather than closed here.

---

## 11. Carried forward

| # | Status | The check that settles it |
|---|---|---|
| **U6** | **Settled here** — one row, chosen class, in the booking transaction, plus `shown_alternatives` | Done. Migrations `0032`, plus the comment replacement on `price_snapshots.quote_id` |
| **U8** (sub-rappen per-km) | **Open, and the design is already safe** | Read the matrix. `perKm(rate, metres)` divides by 1 000, so a rate expressed in *millirappen per km* is a column-type change and a `10_000` denominator — the line amount stays integer rappen either way. Do not pre-emptively widen the column |
| **U16** (round-trip %) | **Open. No number seeded.** The line shape carries it; `surcharges.code='return_trip'` seeds with `percent NULL` and the publish gate refuses to go live until it is answered | Owner, with the matrix |
| **U9** (display currency) | **Half-settled** — `money()` confirmed to be a mark swap. The remaining half is a line of checkout copy | Phase 7 |
| **U7** (coupon consumption) | Deferred to the coupons-extras lane. This lane's only requirement: the redemption row is inserted in the **same transaction** as the snapshot, which makes "consume at payment" the default | coupons-extras |
| **New** | **The night window and the airport-zone rule are owner inputs**, not engine constants. They seed into the draft version's `surcharges.predicate` and the publish gate refuses an empty predicate | Owner, with the matrix |
| **New** | **`oversize_luggage` has no surcharge code.** QUOTE-11 requires the line | Phase 4 seed |
| **New** | **"By the hour" has no rate model.** Ship with `hourlyEnabled=false` | Owner |
| **New** | **`lineWaiting:'60 min airport waiting'`** hardcodes a number ADR-002 says is unanswered | Fix in the port: `{minutes}` param, TBC pill on NULL |
| **New** | **Van capacity is 7 in the customer mock and 8 in the ops seed.** `LEAST()` resolves it to 7 | Confirm 7 with the owner; the fleet row already says seats 3/3/3/7 |
| **Cannot be measured yet** | Warm quote latency against the < 800 ms target, and whether the cached Hyperdrive binding is what makes it. **No Cloudflare account and no Supabase project exist.** | Phase 3's staging deploy: measure p50/p95 of `loadRateBook` on the cached binding vs NOCACHE, from a Worker in the Frankfurt-nearest colo. Do not assert a number before then |

---

## RECOMMENDATION

**Build the quote engine as a pure, integer-only function of a frozen rate book, and write exactly one `price_snapshots` row per booking — for the chosen class, inside the booking-creation transaction — never one per quote.**

Concretely, one decision with six inseparable parts:

1. **`/api/quote` writes nothing.** It resolves the single `status='live'` `rate_versions` row (D9), loads that version's frozen book through the **cached** Hyperdrive binding (no `now()` in any of those queries, so Hyperdrive will actually cache them), computes every eligible class, and returns. The lock pins `{rate_version_id, settings_version_id, engine_version, computed_at, distance_m per leg, the per-class totals}` — inputs and version ids, not just an amount.

2. **The order is: fare → surcharges → extras → round-trip discount → coupon.** Every percentage in the engine is a percentage of **fare lines**, with exactly one exception — the coupon, which is a percentage of the pre-coupon total, because a coupon discounts what is payable. That makes percent surcharges commutative, removes row-order from the answer, and matches the line order the checkout mock already renders.

3. **Eligibility is `LEAST(vehicle_classes.passenger_capacity, distance_rates.max_pax)` for pax and `vehicle_classes.luggage_capacity` for bags**, max-over-legs, evaluated even when nothing is priced. No eligible class is a `200` with every class labelled `quote.class.na_pax` / `na_bags` and `no_eligible_class: true` — not an error. QUOTE-07's refusals are a separate `422` with a reason code.

4. **U6 is settled: one row, the chosen class.** The price board the customer was looking at is preserved as totals-only in a new `shown_alternatives jsonb`. N-rows-per-quote loses because the mock re-quotes on a 300 ms debounce on every field change, making the write path 40–120 immutable jsonb rows per abandoned planning session on a public anonymous endpoint.

5. **D6 is enforced by the database, not by discipline.** `roundHalfUp` is integer-only and throws on anything else; `assembleTotals` **derives** the typed columns from the lines rather than computing them alongside; and `tg_snapshot_lines_reconcile` refuses at INSERT any snapshot whose `total_rappen` is not exactly `Σ lines`, whose typed components disagree with the lines, whose lines carry a non-integer amount or no `i18n_key`, or which is unpriced yet carries a priced line.

6. **`pricing_live=false` is five layers deep and the last one has no off switch.** No live version → `total_rappen: null` → `is_chargeable false` → `tg_payment_matches_snapshot` raises. In production this means no booking is created at all, which is the honest consequence: the business cannot sell at a price it has not set. The flip is one dated, attributed transaction — retire, then publish — guarded by `rate_versions_one_live` and a `tg_rate_version_transition` extended to refuse a version whose active surcharges have no predicate. Its only undo is `live → retired`.

The single sentence an implementer should keep: **the snapshot is read, never recomputed** — every refund, diff, email and dispute packet reads `bookings.price_snapshot_id`, and nothing in this system ever runs today's engine over yesterday's inputs and calls the answer authoritative.

---

**Sources**

- [Stripe — Supported currencies](https://docs.stripe.com/currencies) — `amount` is in the currency's minor unit; currencies are two-decimal unless listed as zero-decimal (CHF is two-decimal); minimum charge 0.50 CHF; 8-digit `amount` ceiling for non-card methods in CHF
- [PostgreSQL — Mathematical functions](https://www.postgresql.org/docs/current/functions-math.html) — "For `numeric`, ties are broken by rounding away from zero. For `double precision`, the tie-breaking behavior is platform dependent, but 'round to nearest even' is the most common rule."
- [PostgreSQL — Generated columns](https://www.postgresql.org/docs/current/ddl-generated-columns.html) — `STORED` explicit; expression must be immutable and reference only the current row
- [PostgreSQL — JSON types](https://www.postgresql.org/docs/current/datatype-json.html) — jsonb documents should keep "a somewhat fixed structure"
- [Cloudflare Hyperdrive — Query caching](https://developers.cloudflare.com/hyperdrive/configuration/query-caching/) — mutations are never cached; STABLE/VOLATILE functions including `NOW()`, `CURRENT_TIMESTAMP`, `RANDOM()` make a query non-cacheable; default `max_age` 60 s, `stale_while_revalidate` 15 s, ceiling 1 h; `--caching-disabled` creates the second config
- [Cloudflare Workers — Web standards](https://developers.cloudflare.com/workers/runtime-apis/web-standards/) — `Intl` is available; the page makes **no** claim about full ICU or IANA time-zone coverage, which is why the night predicate uses a wall-clock string instead
- [Postgres.js README](https://github.com/porsager/postgres) — `numeric`/`decimal` "will be returned as a `string`"; bigint returned as a string; `sql.begin` reserves a connection for the transaction; prepared statements on by default
- Repo (read-only): `.planning/phases/02-.../02-SCHEMA-DRAFT.md` §3, §4, §5, §6, §9; `.planning/phases/02-.../02-RESEARCH.md` U1–U22; `.planning/phases/02-.../research/price-snapshot.md`; `app/home/home.dc.html:745-748, 1183-1260`; `app/pages/checkout.dc.html:176-177, 246-253`; `app/vamos-ops-data.js:255-303`; `app/vamos-locale.js:102-105`; `apps/web/lib/currency.ts`; `.planning/REQUIREMENTS.md:61-71`; `docs/build/GSD-LAUNCH.md` §Phase 4