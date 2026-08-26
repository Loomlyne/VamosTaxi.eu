# Phase 4: Quote & Pricing Engine - Context

**Gathered:** 2026-08-23
**Status:** Ready for planning after /gsd-ui-phase 4 and Phase 3
**Source:** Research express path (04-RESEARCH.md, ADR-014, Phase 2 CONTEXT)

<domain>
## Phase Boundary

A pure, integer-only pricing kernel and the anonymous HTTP surface around it: the booking
widget asks for a price, the server geocodes, routes, checks the journey against the service
area and the minimum advance, prices every eligible vehicle class from a **frozen** rate
version, and hands back a **server-signed 30-minute lock** — never a row, never a client
amount. The snapshot that becomes evidence is written once, later, inside the booking
transaction (Phase 7's handler, this phase's contract).

Requirements covered: QUOTE-01, QUOTE-02, QUOTE-03, QUOTE-04, QUOTE-05, QUOTE-06, QUOTE-07,
QUOTE-08, QUOTE-09, QUOTE-10, QUOTE-11.

**In scope:**
- `apps/web/lib/pricing/` — `round.ts`, `eligibility.ts`, `predicates.ts`, `priceQuote()`:
  no I/O, no `Date`, no float, injected clock, property-tested with unit-free integers.
- `POST /api/quote`, `POST /api/quote/reprice`, `GET /api/geo/{suggest,retrieve,reverse}`,
  `GET /api/flight/:no`, and the quote-side rules of `POST /api/checkout/intent`.
- The HMAC quote lock (mint, verify, rotate) and the two clocks it implies.
- Additive Phase 4 migrations in `packages/db/supabase/migrations/` — predicates, zone types,
  `shown_alternatives`, `quote_lock_expires_at`, coupon release, flight provenance, and the
  three trigger hardenings. Additive only; Phase 2's shapes are not rewritten.
- QUOTE-09's three abuse layers plus the daily Mapbox breaker and the zod boundary.
- Every customer-visible string this phase introduces, in en/de/fr/ar, ICU, in the same plan
  that lands the route it belongs to.

**Out of scope:**
- No checkout handler, no Stripe call, no booking row, no `VT-YY-####` — Phase 7 owns the
  transaction; Phase 4 owns the shape it must satisfy.
- No booking-widget React port — Phase 5. Phase 4 ships the contract the widget consumes.
- No `POST /api/ops/quote` — specified here, built in Phase 8 (U22).
- No live flight tracking, no delay shift — Phase 9 (LATER-01, LIFE-06).
- No CHF price matrix. Every priced value stays NULL, no `rate_versions` row is published
  `live`, every amount renders `CHF 000` (Phase 2 D-34).
- No Mapbox response cache. Barred by terms until an Order exists (U33) — do not plan it.

**Gate before planning:** this phase is UI-bearing (booking widget board, per-class cards,
the 30-minute countdown, the four-language refusal copy). **`/gsd-ui-phase 4` must run before
`/gsd-plan-phase 4`** — the UI gate will demand `04-UI-SPEC.md`. This CONTEXT deliberately
does not write one.

</domain>

<decisions>
## Implementation Decisions

Every bullet cites its originating research decision (`research D41`–`D75`) or uncertainty
(`research Un`) for traceability back to `04-RESEARCH.md` and `04-API-CONTRACT.md`.
Where ADR-014 (owner sitting, 2026-08-22) post-dates the research and disagrees with it,
**ADR-014 governs** and the superseded line is named.

### Eligibility, modes and intent gates (QUOTE-02)
- **D-01:** (research D44) Class caps are `effective_max_pax = LEAST(vehicle_classes.passenger_capacity, distance_rates.max_pax)`; bags come from `vehicle_classes.luggage_capacity` only — never a second `max_bags` column. Max-over-legs. Its Van=7 conclusion is superseded by D-38 below. — QUOTE-02.
- **D-02:** (research D44) No eligible class is **HTTP 200** with every class labelled and `no_eligible_class: true` — categorically not a 422. The API returns the board; the widget owns the auto-move and `quote.moved_to`. — QUOTE-02.
- **D-03:** (research D57) `hourlyEnabled=false`. `mode: "hourly"` is `422 mode_not_offered`, never a silently-priced third product — there is no `hourly_rates` table (U50). — QUOTE-02.
- **D-04:** (research D68) Widget tokens are preprocessed **before** the strict Zod union: `one-way` → `one_way`; `hourly` → 422 (not `400 untrusted_input`); `hours` rejected in §0. — `/api/quote` request schema.
- **D-05:** (research D70) Checkout intent refuses `pax < 1`, an ineligible chosen class, and `estimated_duration_minutes = round(duration_s/60) > 0` failing. **No silent 30-minute floor** — that under-blocks a long alpine run in Phase 8's exclusion constraint. — QUOTE-02, OPS-03.

### Pipeline, rounding and determinism (QUOTE-03, QUOTE-05)
- **D-06:** (research D41) Pipeline order is fare → surcharges (percent **of that leg's fare line**) → extras → round-trip (percent of Σ fare) → coupon (percent of the pre-coupon total). Percent-of-running-total and the coupons-extras additive sketch are rejected: pinning the basis makes percents commutative and row order irrelevant. — QUOTE-03, refunds.
- **D-07:** (research D43) Integer kernel: exact ratios, half-up **once** per line, metres in (never 2-dp km), `numeric` percent parsed from string hundredths with a digit regex. `Math.round` and `parseFloat` are banned. `total_rappen ≡ Σ lines[].amount_rappen` is an identity `assembleTotals` derives, not recomputes. — QUOTE-05.
- **D-08:** (research D45) Fixed-route match is bidirectional — `(origin,dest)` then `(dest,origin)` — recording `matched: "forward"|"reverse"`. A fixed route ignores base/per-km/min-fare entirely (`basis.rule = 'fixed_route'`). — QUOTE-03.
- **D-09:** (research D46) Surcharge eligibility is **data**: `surcharges.predicate jsonb not null default '{}'` + `quantity_source`, with five discriminators (`always`, `pickup_zone_type`, `local_time_window`, `dest_zone_tag`, `quantity`). An empty predicate blocks `draft → live`. A TypeScript `if (hour >= 22)` is a hole through Phase 2 D-07. — QUOTE-03.
- **D-10:** (research D66) The predicates need columns `service_zones` does not have: add `zone_type text check (in 'airport','city','ski','other')` and `tags text[]` in the same migration. Inferring "airport" from `iata IS NOT NULL` is the engine-code hole D-09 exists to close. — QUOTE-03.
- **D-11:** (research D51, U51) Extras are `surcharges` rows — no parallel extras table. Ninth code `oversized_luggage`, `applies_to='leg'` per the Phase 2 seed. Quantities come from the client, **amounts only ever from the pinned rate version**. — QUOTE-11.
- **D-12:** (research D72) Seed a tenth surcharge `return_trip` (`kind=percent`, `applies_to=booking`, `predicate {"kind":"always"}`) so the publish gate has a row to refuse; do not synthesise the line without one. — QUOTE-03.
- **D-13:** (research D75) One error → one i18n key, four locales, ICU not concatenation: dedicated `same_place`, `place_out_of_box`, `pick_one`, and class `unavailable`/`no_rate`/`route_off`. The coupons-extras `patterns`-regex instruction for `price.line.coupon` is superseded. — Law 03, QUOTE-07.

### Distance, geo and service area (QUOTE-01, QUOTE-07)
- **D-14:** (research D52) **No KV cache of Mapbox.** Live Mapbox on every quote; `GEO_CACHE` holds only our polygon and hand-curated fixed-route geometry. GSD-LAUNCH's "cached in KV 24 h by place-id pair" is barred by Product Terms §1.9/§2.7.2/§2.10.1 (PDF 21 July 2026). Do not plan the cache. — QUOTE-01, U33.
- **D-15:** (research D53) Providers: Search Box `/suggest`+`/retrieve` (one session token per widget-open, proxied), Geocoding v6 `/reverse` for a dropped pin, Directions v5 `mapbox/driving` for metres/seconds/geometry. Never an unrestricted browser token; `language=` forwarded on all three. — QUOTE-01.
- **D-16:** (research D53) Directions, not Matrix (Matrix has no geometry, QUOTE-01 needs the line) and not `driving-traffic` (a live duration is the wrong input for a pickup weeks away). One call per **quote**, not per class. A failed call is `422 route_unavailable` — never invented metres. — QUOTE-01.
- **D-17:** (research D54) Service area is a two-path check, server-side: a named live `fixed_routes` pair in either order **or** both ends inside `settings_versions.service_area_geojson`. NULL polygon **fails closed** (`422 service_area_undefined`, rendered as a TBC gap); NULL `min_advance_minutes` **skips** the threshold. Point-in-polygon is ~20 lines of ray-casting in the Worker — PostGIS is not installed. — QUOTE-07.
- **D-18:** (research D67) Extra stop at MVP is **quantity-only**, count 0–3. A count without `waypoints[]` is a legal payload, not a 422; when waypoints are sent, `length === extra_stops` and Directions re-runs. Detour km is U41. — QUOTE-11.
- **D-19:** (research D55) Flight provider is AeroDataBox, **one-shot**: no background poll (that is Phase 9 tracking), landing time `actual › estimated › scheduled`, no invented buffer, three named degradations (400/404/503) that leave the pickup time editable. `date` binds to the pickup civil date when the WhenPicker has one. — QUOTE-08.
- **D-20:** (research D74) `flight_no` and `landing_source` ride on `QuoteLockPayload.legs[]`; intent 400s a body that disagrees, and writes `flight_checked_at`/`flight_time_source` from the lock. Phase 9 cannot shift a delayed flight it never stored. — QUOTE-08, LIFE-06.

### Snapshot cardinality and the two clocks (QUOTE-04, QUOTE-05)
- **D-21:** (research D42) **U6 settled against Phase 2's recommendation:** one `price_snapshots` row per booking, for the **chosen class**, written inside the booking transaction. `/api/quote` writes nothing. A 300 ms-debounced public endpoint × four classes is 40–120 immutable jsonb rows per abandoned session. — QUOTE-05, LIFE-07.
- **D-22:** (research D73) `price_snapshots.shown_alternatives jsonb` carries the board the customer saw, thickened per class (`fixed_route`, `effective_max_pax`, `max_bags`, `lines`) — totals alone cannot answer "why was Van cheaper?". Class change is one intent POST, one snapshot. — QUOTE-05.
- **D-23:** (research D47) **Two clocks.** The 30-minute quote lock (QUOTE-04) lives on the signed token and on `price_snapshots.quote_lock_expires_at`; `price_snapshots.expires_at` is the separate **payment window**, written once and never extended (Phase 2 D-18 append-only). — QUOTE-04.
- **D-24:** (research D48) The lock is a **server-signed HMAC-SHA256 pin** of inputs and version ids (`quote_id`, `exp`, `rate_version_id`, `settings_version_id`, `engine_version`, per-leg metres/seconds, per-class totals) — not a KV document (60 s lag is wrong for a gate) and not a snapshot row (D-21 forbids it). `exp` is authored by Postgres `now()`, never `Date.now()`. — QUOTE-04.
- **D-25:** (research D61) The quote-lock clock must be **trigger-visible**: raise inside the snapshot-write transaction on `lock.exp <= now()`, persist `quote_lock_expires_at`, and extend `tg_payment_matches_snapshot` to refuse a past lock **even when** the payment-window `expires_at` is in the future. A handler that forgets the `if` still dies. — QUOTE-04.
- **D-26:** (research D62) Set `rate_version_is_live = (status in ('live','retired'))` — "was published", not "is live this instant". A republish under a live lock must not force the customer onto the new matrix. `draft` is still refused. — QUOTE-04, QUOTE-10.
- **D-27:** (research D64) The lock pins **extras and coupon**; reprice always re-signs `class_totals`, and checkout 400s a body that disagrees with the lock. Comparing a stale pre-coupon board is how a legitimate code 409s on the happy path. — QUOTE-06, QUOTE-11.
- **D-28:** (research D65) Lock token is `kid.payload.mac`; rotation dual-verifies `QUOTE_LOCK_SECRET` then `QUOTE_LOCK_SECRET_PREVIOUS` for one lock TTL. Public HMAC failure stays `404 quote_not_found` (oracle-free); `lock_secret_rotated` is ops-only. — QUOTE-04.
- **D-29:** (research D49) **No Cron that mutates `price_snapshots`.** `expires_at <= now() AND booking_id IS NULL` already *is* expired; GSD-LAUNCH's "Cron expire stale quotes" is a holdover from a mutable status column. LIFE-07's no-show half stays Phase 9. — LIFE-07.

### Coupons (QUOTE-06)
- **D-30:** (research D50) **U7 settled against Phase 2's KV half:** validate at reprice with `evaluate_coupon()` (seven ordered refusals, each its own i18n key), consume **at PaymentIntent creation** under `SELECT … FOR UPDATE` on the `coupons` row, in the same transaction as `booking_payments`. No KV reservation. Lookup is `upper($1)`; the snapshot stores the code **as typed**. — QUOTE-06.
- **D-31:** (research D69) `coupon_redemptions.released_at timestamptz`; `evaluate_coupon` counts `released_at is null`. Abandon sweep and a Phase 9 full refund **SET** it — never DELETE, so the unique `(coupon_id, booking_id)` and the evidence both survive. A partial refund does not release. — QUOTE-06.

### `pricing_live=false` and the charge gate (QUOTE-10)
- **D-32:** (research D58) Harden `tg_payment_matches_snapshot` to `SECURITY DEFINER`, `search_path = ''`, explicit `IF NOT FOUND`. As drafted it runs as invoker; an RLS-filtered miss leaves the row all-NULL and every `IF` skips. — QUOTE-10.
- **D-33:** (research D59) `PRICING_PREVIEW=true` is **staging-only and absent in production** — a missing binding is a boot error, a typo'd `"false"` string is truthy. A snapshot citing a draft has `rate_version_is_live = false` set *by trigger from the table*, never from the caller, so preview cannot charge. — QUOTE-10.
- **D-34:** (research D60, corrected on harden) Rate book, `settings_versions`, coupons and snapshot writes **all** go through `asQuote`/definer RPCs on `HYPERDRIVE_NOCACHE` (Phase 3 D79). Cached `HYPERDRIVE` stays content-only: a ~75 s lag on a `pricing_live` flip is not an acceptable billing read. — QUOTE-10, Phase 3.

### Abuse layer (QUOTE-09)
- **D-35:** (research D56) Three layers, cheapest-first: zone Rate Limiting 30/60 s `managed_challenge` over `/api/quote*` **and** `/api/geo/*`; Workers `ratelimits` binding at 8/60 on `ip + verified vamos_qs` (4/60 bare or unverifiable); invisible Turnstile logged on the 1st–2nd request and **enforced from the 3rd per IP**. Plus a zod boundary that structurally rejects any client-supplied distance, duration, total or class price. — QUOTE-09.
- **D-36:** (research D63) `vamos_qs` is **HMAC-signed**. An unsigned UUID is client-mintable: a fresh cookie would buy a new 8/60 bucket and reset Turnstile's counter. Unverifiable or missing falls to the 4/60 bare-IP bucket, never into a new identity. — QUOTE-09.
- **D-37:** (research D71) The daily Mapbox breaker in a dedicated `QUOTE_ABUSE` KV namespace increments on **every** Mapbox call — suggest, retrieve, reverse and Directions — not only `/api/quote`; `kind: "coords"` requires a session seen on `/suggest`. Geo stays Turnstile-off; the breaker does not stay off geo. — QUOTE-09.

### ADR-014 corrections — the owner sitting supersedes the research where they differ
- **D-38:** **ADR-014 §6 governs vehicle classes: Economy 3/3, Business 3/3, Van 8/8, and `first` does not ship in V1.** Research D44's derivation (`LEAST(passenger_capacity, max_pax)` = 7, "ops-seed 8 rejected", 04-RESEARCH.md line ~189) is **superseded**; the owner's instruction is "fix the widget's Van 7". U39 is closed. The `LEAST` **rule** in D-01 stands — with 8/8 seeded it resolves to 8. — QUOTE-02, Phase 2 D-36.
- **D-39:** **Night-window predicate is `20:00–06:00 Europe/Zurich`** (ADR-014 §5), not the mock's/research's `22:00–06:00` (04-RESEARCH.md lines ~136, ~154 and the §13 worked example). The value still lives in `surcharges.predicate` on the versioned batch, never as an engine constant; U38's "owner must confirm before publish" is now answered for the window. — QUOTE-03.
- **D-40:** **Round-trip discount is 10 % of the fare** (ADR-014 §5). This **closes research U16** — its "do not seed a number, not even in a fixture" line no longer holds. The percentage lives in the `return_trip` surcharge row inside `rate_versions`/`settings_versions`, never in TypeScript. — QUOTE-03.
- **D-41:** **`min_advance_minutes` is 180** (ADR-014 §5), closing the research's owner blocker #3 ("do not seed 180"). The engine still reads it from `settings_versions` as of `computedAt` and still keeps the NULL-skip branch (D-17) for any version that predates the value. — QUOTE-07.
- **D-42:** **Waiting allowances are 60 minutes airport / 15 minutes city** (ADR-014 §5), superseding every "NULL per ADR-002" line in the research (§13 `included_minutes: null`, the flight-autofill "no private 60"). Included lines now carry real `{minutes}`; `amount_rappen` stays `null` because waiting is free, not because it is unknown. Flight autofill still does not invent a buffer — it reads the setting. — QUOTE-08, QUOTE-11.
- **D-43:** **Payment window is 30 minutes, on the same clock as the quote lock** (ADR-014 §5), closing research U49. `price_snapshots.expires_at` is still a distinct column written once (D-23) — same length, not the same field, and still never extended. — QUOTE-04.
- **D-44:** **Manage-link validity is 30 days after the last leg** (ADR-014 §5), closing research U5. Phase 4 issues no manage link; the number is recorded here so Phase 7 does not reopen it. — Phase 7, LIFE-04.
- **D-45:** **Child seat and oversized luggage apply to both legs of a return** (ADR-014 §6), closing research U40 — one checkbox, two lines, one per `leg_seq`, never one `leg_seq: null` line covering both. **Child seats are max 1 in V1, final** (closing U43): the control stays a checkbox and `n` is always passed to ICU, including `n=1`. Extra stop stays a flat fee, count 0–3. — QUOTE-11.
- **D-46:** **The CHF matrix itself is still open and stays a labelled gap.** Every priced value NULL, no `rate_versions` row published `live`, every amount rendered `CHF 000` by data and not by a UI branch (Phase 2 D-34). Never write a CHF amount in a migration, a fixture, a test, a screenshot or a plan. — QUOTE-10.
- **D-47:** **Three external dependencies stay owner-held and must degrade, not block:** Mapbox account (ADR-014 §3/§4 — owner creates when asked, after the sales email; the U33 Order is separate), AeroDataBox/RapidAPI (**explicitly deferred** — flight autofill degrades to manual time), and the Cloudflare zone plan for a second Rate Limiting rule + OWASP CRS (research U36 — Free ships one rule; Pro is a new cost line the owner signs off). — QUOTE-01, QUOTE-08, QUOTE-09.
- **D-48:** Research U53's "no measured Frankfurt→Mapbox number" must be **restated against Zurich**: the Supabase project is Central Europe (Zurich), ref `yaumjzvylngfjhtuffqs` (Phase 2 D-37), not the Frankfurt `eu-central` the research and ADR-007 assume. GSD-LAUNCH's "< 800 ms warm" stays an unmeasured claim; do not assert it before both accounts exist. — Phase 8.

### Execution-time checks the plan must run (research UNCERTAIN items, with fallback)
- **D-49:** (U46) Before the checkout-intent lock comparison is written, confirm `now()` is frozen at transaction start across sequential `sql.begin` awaits: `begin; select now(); select pg_sleep(2); select now();` — expect both equal. Fallback: take the deadline from a single `select` and pass it forward. — Blocks the lock re-check.
- **D-50:** (U52) Prove the `SECURITY DEFINER` charge gate (D-32) and the `booking_payments` column-whitelist trigger do not shadow each other: pgTAP `charge_gate.test.sql` run as `authenticated` **and** as `vamos_guest` on a local Supabase. Trigger name order is load-bearing (`…match_snapshot` before `…reserve_coupon`). — Blocks D-32 landing.
- **D-51:** (U34) At Mapbox sign-up, read the live Search Box `/retrieve` parameter list for `permanent`. If absent — the current expectation — the compliant store path is a checkout-time Geocoding v6 call with `permanent=true` before coordinates land on `booking_legs`. — Blocks checkout address persist (Phase 7).
- **D-52:** (U45) Before shipping flight autofill against a live key, look up a known red-eye on **both** civil dates, with and without `dateLocalRole`. Fallback and default either way: never take `j[0]` — surface `action: "disambiguate"` with `quote.flight.pick_one`. — QUOTE-08.
- **D-53:** (U8) When the CHF matrix lands, read it for a fractional-rappen per-km figure. `perKm` divides by 1 000; the fix is `per_km_millirappen` with a 10 000 denominator. The line **amount** stays integer rappen either way. Do not pre-emptively widen. — Safe to defer.
- **D-54:** (U54/U37) Until a Mapbox plan exists there is no CHF ceiling for the breaker. Ship `MAPBOX_DAILY_UNIT_SENTINEL` as a wrangler var holding a **unit count, never a guessed CHF figure**, and trip on it (not log-only). Replace with `DAILY_MAPBOX_QUOTE_BUDGET` at ~70 % of the monthly-tolerable ceiling / 30 once the account exists. — QUOTE-09.
- **D-55:** (U42) `checkout_abandon_release_minutes` does not exist. Until Phase 5/7 lands the number, the coupon-reservation release sweep **must not run** rather than invent a wait. `released_at` (D-31) ships regardless. — QUOTE-06.
- **D-56:** (U41) Extra-stop detour km is unspecified. Until the matrix answers whether a detour bills at the same per-km rate, the `extra_stop` line is `amount_rappen × extra_stops` and nothing else (D-18). Do not 422 a count-only payload to force the question. — QUOTE-11.
- **D-57:** (U20) `idempotency_key` is **required** on `POST /api/checkout/intent`, forwarded, and not interpreted by the quote engine. Do **not** derive it from `quote_id` — that would silently settle U20, which is Phase 7's to answer. Waypoint reprice records `supersedes_quote_id`. — Phase 7.

### Claude's Discretion
- File granularity inside `apps/web/lib/pricing/` beyond `round.ts` / `eligibility.ts` /
  `predicates.ts` / `priceQuote()` — extra modules for line assembly, the rate-book loader or
  the policy builder are the planner's call.
- Route-handler layout under `apps/web/app/api/` (one file per endpoint vs. a shared handler
  factory) and where the shared zod schemas and error-mapping table live.
- How the additive migrations are split across files — the six named in `<specifics>` are a
  grouping, not a contract; merging or splitting within the same wave is fine as long as
  every column, trigger and function listed lands.
- pgTAP and Vitest test-file granularity beyond "one file per QUOTE-0x claim".
- Whether the Analytics Engine dataset and the 10-minute anomaly Cron ship in the abuse plan
  or as a trailing observability task.

### Proposed plan split `[informational]`
Reproduced verbatim from 04-RESEARCH.md's "Proposed Phase 4 plan split" — a recommendation
the planner may adopt, adapt or replace; not a locked decision. The coverage gate should not
treat this table or the wave diagram as D-NN items.

Everything except real numbers ships behind no-live-row. **CHF-matrix-blocked work is last and
small.** Phase 3 is a hard gate for anything that talks to Hyperdrive; the pure engine and the
HTTP contract can be unit-tested without it.

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

P8 is the only plan that may contain a real number, and even then only in a draft version on
staging until the owner types `UPDATE rate_versions SET status='live'`.

</decisions>

<specifics>
## Specific Ideas

- **Endpoints, exact:** `POST /api/quote`, `POST /api/quote/reprice`,
  `GET /api/geo/suggest`, `GET /api/geo/retrieve`, `GET /api/geo/reverse`,
  `GET /api/flight/:no?date=YYYY-MM-DD&locale={en|de|fr|ar}`, and the quote-side rules of
  `POST /api/checkout/intent` (Phase 7 owns the handler). `POST /api/ops/quote` is specified
  for Phase 8 and not built here.
- **`QuoteResponse` field names, exact:** `ok`, `quote_id`, `lock`, `expires_at`,
  `engine_version`, `pricing_live`, `rate_version {id, slug} | null`, `settings_version_id`,
  `display_currency`, `route.legs[] {leg_seq, distance_m, duration_s, geometry,
  origin_zone_id, dest_zone_id}`, `no_eligible_class`, `classes[] {slug, eligible,
  ineligible_reason, effective_max_pax, max_bags, fixed_route, total_rappen, lines[]}`,
  `policy`. `ineligible_reason ∈ pax | bags | unavailable | no_rate | route_off | null`.
- **`QuoteLockPayload` field names, exact:** `v`, `quote_id`, `exp`, `engine_version`,
  `rate_version_id`, `settings_version_id`, `computed_at`, `display_currency`, `mode`, `pax`,
  `bags`, `legs[] {leg_seq, pickup, dropoff, scheduled_local, distance_m, duration_s,
  origin_zone_id, dest_zone_id, waypoints[], flight_no, landing_source}`, `extras`, `coupon`,
  `class_totals[]`. Token format `kid + "." + base64url(payload) + "." + base64url(mac)`,
  HMAC-SHA256 over canonical JSON (sorted keys, no whitespace).
- **Lock TTL:** `settings_versions.quote_lock_minutes integer check (> 0)` — ALREADY APPLIED by Phase 2 migration `20260823000004_settings.sql:80` on the immutable `settings_versions` row (not the `settings` singleton; the research predates that split) — seeded 30 by Phase 2 P9 — an engine
  parameter the quote reads from the live `settings_versions` row. `exp` is minted
  from a Postgres `select now() + quote_lock_minutes`.
- **KV key shapes, exact:** flight — `flight:{NUMBER}:{YYYY-MM-DD}` (TTL 90 s same-day /
  30 min next-day / 6 h beyond; KV refuses TTL < 60 s); daily breaker —
  `quote:mapbox-budget:YYYY-MM-DD` in a **dedicated `QUOTE_ABUSE` namespace**, never
  `GEO_CACHE`. **No Mapbox response key scheme exists** (D-14). No customer or booking id
  ever appears in a KV key.
- **Bindings and secrets this phase adds:** `MAPBOX_TOKEN`, `QUOTE_LOCK_SECRET`,
  `QUOTE_LOCK_SECRET_PREVIOUS`, `VAMOS_QS_SECRET`, `TURNSTILE_SECRET`, `FLIGHT_API_KEY`
  (wrangler secrets); `QUOTE_RATE_LIMITER` (`ratelimits`), `QUOTE_ABUSE` (new KV),
  `QUOTE_ABUSE_METRICS` (Analytics Engine), `MAPBOX_DAILY_UNIT_SENTINEL` (var),
  `PRICING_PREVIEW` (staging only, absent in production).
- **Additive migrations — `packages/db/supabase/migrations/` (Phase 2 D-38 layout, created
  with `supabase migration new`, never a hand-typed timestamp):**
  - `packages/db/supabase/migrations/<ts>_surcharge_predicate.sql` — `surcharges.predicate jsonb`, `surcharges.quantity_source`, publish gate refuses `{}` (D-09).
  - `packages/db/supabase/migrations/<ts>_service_zone_types.sql` — `service_zones.zone_type`, `service_zones.tags` (D-10).
  - `packages/db/supabase/migrations/<ts>_snapshot_alternatives.sql` — `price_snapshots.shown_alternatives`, `price_snapshots.quote_lock_expires_at`, extended `price_snapshots_policy_shape` CHECK, lines-reconcile trigger (D-22, D-25).
  - `packages/db/supabase/migrations/<ts>_coupon_release.sql` — `coupon_redemptions.released_at`, `evaluate_coupon()`, `booking_payments_reserve_coupon` (D-30, D-31).
  - `packages/db/supabase/migrations/<ts>_quote_gates.sql` — `tg_payment_matches_snapshot` as `SECURITY DEFINER`, `tg_snapshot_rate_version_flag` to `status in ('live','retired')`, `settings_versions.service_area_geojson` (`quote_lock_minutes` and `checkout_window_minutes` already exist on `settings_versions` from Phase 2 — read them, do not re-add) (D-26, D-32).
  - `packages/db/supabase/migrations/<ts>_flight_provenance.sql` — `booking_legs.flight_checked_at`, `booking_legs.flight_time_source`, event kind `flight.autofilled` (D-20).
- **Test commands the plan is built around:**
  - **Vitest is not installed** — `grep -rn vitest package.json apps/web/package.json packages/*/package.json` returns nothing. **Wave 0 installs it** (`pnpm add -D --filter web vitest fast-check`) plus `apps/web/vitest.config.ts`. Kernel property tests for `round.ts` / `eligibility.ts` run as `pnpm --filter web exec vitest run lib/pricing`.
  - pgTAP through the Phase 2 CLI wrapper: `pnpm --filter @vamos/db run test:db` (`supabase test db`, which accepts file/directory arguments for a per-file run). Local stack is Postgres 17.6 / Supabase CLI 2.109.1.
  - Playwright **does** exist (`@playwright/test` 1.62.1, `apps/web/playwright.config.ts`, specs under `apps/web/tests/`): `pnpm test:visual` → `pnpm --filter web exec playwright test`.
- **The `CHF 000` rule at the boundary:** `formatRappen(null)` returns `CHF 000` (or the
  display mark plus `000`). There is no UI branch on `pricing_live`.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase research (primary source for this CONTEXT)
- `.planning/phases/04-quote-pricing-engine/04-RESEARCH.md` — the full synthesis: §1 pipeline,
  §2 eligibility, §3 rounding, §4 U6/snapshot cardinality, §5 lock and expiry, §6 U7/coupons,
  §7 geo + Mapbox terms + service area, §8 `pricing_live=false`, §9 determinism T1–T10,
  §10 extras, §11 flight, §12 abuse, §13 lines/policy shape, §14 the four-language string
  table, the D41–D75 table, the UNCERTAIN table (carried U5/U8/U9/U16/U20/U22 + U33–U58),
  the owner blockers, the QUOTE-01…11 coverage table and the 8-plan split.
- `.planning/phases/04-quote-pricing-engine/04-API-CONTRACT.md` — the HTTP contract:
  §0 what the widget collects, §1 conventions, §2 `/api/quote` + lock pin, §3 reprice,
  §4 geo proxies, §5 flight, §6 checkout-intent quote re-check, §7 error vocabulary,
  §8 rate limit/Turnstile table, §9 `pricing_live=false`, §11 test proofs, §12 secrets.
- `.planning/phases/04-quote-pricing-engine/04-HARDEN.md` — the 37-finding ledger behind
  D61–D75 and U54–U58 (AM-01…04, FC-01…11, F1…F8, I-01…I-10, OR-F-01…04).
- `.planning/phases/04-quote-pricing-engine/research/quote-engine-core.md` — kernel, pipeline,
  eligibility, snapshot shape.
- `.planning/phases/04-quote-pricing-engine/research/quote-lock-expiry.md` — the lock lane
  (its "lock is `price_snapshots.expires_at`" settlement is superseded by D-21/D-24).
- `.planning/phases/04-quote-pricing-engine/research/coupons-extras.md` (+ `.RETURN-SUMMARY.md`)
  — coupon rules, extras catalogue; its additive dual-discount and `patterns`-regex sketches
  are rejected (D-06, D-13).
- `.planning/phases/04-quote-pricing-engine/research/geo-routing.md` (+ `.RETURN-SUMMARY.md`)
  — providers, session tokens, Zurich bias, the Mapbox terms check.
- `.planning/phases/04-quote-pricing-engine/research/flight-autofill.md` — AeroDataBox shape,
  TTL tiers, degradations.
- `.planning/phases/04-quote-pricing-engine/research/abuse-ratelimit.md` — the three layers,
  plan-tier analysis, observability without Logpush.
- `.planning/phases/04-quote-pricing-engine/verify/{abuse-money,forward-compat,fidelity,i18n-rtl,ops-reality}.md`
  — the five returned verify lenses the harden ledger folds in.
- `.planning/handoff/PHASE-3-4-HANDOFF.md` §§2–3 — the Wave B/C/D questions and definition of
  done this research answers.
- `.planning/handoff/MAPBOX-SALES-EMAIL.md` and `.planning/handoff/OWNER-RULINGS-NEEDED.md` —
  the owner-facing side of U33 and the open rulings.

### Upstream phase context this phase binds to
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-CONTEXT.md` — D-06 (rappen),
  D-07 (snapshots), D-09 (`pricing_live` as a row, not a boolean), D-10 (`settings` +
  `settings_versions`), D-11 (return trips), D-12 (reference), D-18 (append-only), D-34
  (matrix nullability), D-35 (ADR-014 numbers), D-36 (vehicle classes), D-37 (hosted project,
  Zurich, ref `yaumjzvylngfjhtuffqs`), D-38 (`packages/db/supabase/` layout).
- `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` §6 coupons,
  §9 snapshots + charge gate, §10 append-only, §14c grants — the tables Phase 4 alters.
- `.planning/phases/03-hyperdrive-data-access-wiring/03-RESEARCH.md` — D76 (`withIdentity`
  single signature), D79 (`asQuote` on `HYPERDRIVE_NOCACHE`; billing never on the cached
  binding), D83 (Queues/Cron placement). Phase 3 has no CONTEXT.md yet; read the research.

### Architecture decisions that bind this phase
- `.planning/ADR-014-owner-sitting-2026-08-22.md` — **the most recent binding source.**
  §1 currency (Stripe FX, supersedes ADR-004's display/charge halves), §3 Mapbox, §4 accounts
  (AeroDataBox deferred), §5 the policy numbers (D-39…D-44), §6 product (D-38, D-45). Read in
  full: several numbers contradict what 04-RESEARCH.md still describes as open or NULL.
- `.planning/ADR-002-waiting-allowances-null.md` — **superseded by ADR-014 §5** for
  `airport_waiting_minutes`/`city_waiting_minutes` (D-42). The NULL discipline still governs
  any policy number the owner has not confirmed.
- `.planning/ADR-004-currency-display-only.md` — schema half stands (one CHF amount, no
  per-currency price lists); display/charge halves superseded by ADR-014 §1 (U9).
- `.planning/ADR-006-return-trips-booking-legs.md` — one booking, two legs, one snapshot.
- `.planning/ADR-003-booking-reference-format.md` — `VT-YY-####`, minted at booking, never at
  quote.
- `.planning/ADR-011-data-tok-labels-stay-english.md` — `quote.error.service_area_undefined`
  and the other TBC pills stay English on purpose.
- `.planning/ADR-012-dictionary-duplicates-and-product-names.md` — `Economy`/`Business`/`Van`
  are literals wearing `.vt-dir-keep`.
- `.planning/ADR-007-edge-data-residency.md` — the placement question D-48 restates against
  Zurich.

### Requirements and roadmap
- `.planning/ROADMAP.md` § Phase 4 — goal, the eleven requirement ids, the five success
  criteria, `UI hint: yes`.
- `.planning/REQUIREMENTS.md` — QUOTE-01…QUOTE-11 in full (lines 61–71; status table lines
  212–222).
- `docs/build/GSD-LAUNCH.md` § Phase 4 (lines 109–127) — the original sketch, **superseded on
  five points**: the 24 h place-id-pair KV cache (D-14); `quote_id` as a `bookings` row with
  status `quote` (D-21/D-24); coupon applied on the quote call (D-30); `settings` as the
  min-advance source (Phase 2 D-10); flat 20/min/IP rate limiting (D-35). Its "< 800 ms warm"
  and "200 rps, p95 < 1.5 s" done-when remain unmeasured (D-48).
- `docs/build/OWNER-ANSWERS.md`, `docs/build/OPEN-QUESTIONS.md`,
  `docs/build/LEGAL-PLACEHOLDER-CHECKLIST.md` — where the remaining blanks are tracked.
- `docs/build/SPEC-home-booking-widget.md`, `docs/build/SPEC-home-flight-autofill.md`,
  `docs/build/SPEC-checkout-confirmation.md` — the reviewed mock behaviour the contract must
  keep (the widget's Van 7 is the line D-37 fixes).
- `app/home/home.dc.html`, `app/pages/checkout.dc.html` — the field lists and the price-line
  renderer the snapshot shape maps onto with no UI change.

### External documentation the research cites
- Mapbox Product Terms, PDF dated **21 July 2026**, linked from
  `https://www.mapbox.com/legal/product-terms` — §1.9(v), §2.7.2, §2.7.3, §2.10.1, §3.51.
  This is the source of D-14 and U33; re-read before any caching decision.
- Mapbox Search Box API (`/search/searchbox/v1/suggest`, `/retrieve`), Geocoding v6
  (`/reverse`, `permanent=true`), Directions v5 (`/directions/v5/mapbox/driving`) —
  `https://docs.mapbox.com/api/search/` and `https://docs.mapbox.com/api/navigation/`.
- `https://www.mapbox.com/pricing` — unit prices, undated on the page (U35); re-fetch at
  sign-up.
- AeroDataBox via RapidAPI (`aerodatabox.p.rapidapi.com`) — flight status fields
  `scheduledTime` / `revisedTime` / `runwayTime`, `dateLocalRole` (U44, U45).
- Cloudflare: Turnstile `siteverify`, Workers Rate Limiting binding, KV write limits,
  Hyperdrive query caching, WAF Rate Limiting Rules and OWASP CRS sensitivity levels.
- Stripe supported currencies (CHF minor unit == the stored `rappen` integer).

### Project rules
- `CLAUDE.md` — Law 03 (four languages in the same pass, ICU, Arabic first-class RTL,
  logical properties) and Law 04 (a pending value is a labelled gap; never invent a price).
- `.claude/CLAUDE.md` — the fixed stack, the security posture (server-authoritative quotes,
  idempotent creation, no secrets in the repo) and the `CHF 000` convention. Note that
  ADR-014 §1 marks the "currency switch changes the mark, never the number" sentence as
  product-wrong; the **engine** still returns one CHF number.

</canonical_refs>

<deferred>
## Deferred Ideas

Owner-, counsel- or later-phase-only items the research raised that are not trackable Phase 4
engineering decisions. Phase 4 ships a shape that survives whichever answer lands; none of
these block planning.

**Owner / commercial**
- **U33 — a Mapbox Order covering stored Directions distance, duration, geometry and
  per-booking coordinates.** Send `.planning/handoff/MAPBOX-SALES-EMAIL.md` before sign-up.
  Until an Order or a written refusal exists, the 30-minute pin of `distance_m`/`duration_s`
  inside the lock is a named legal risk the owner accepts; the cache is not planned (D-14).
- **U35 / U44 — Mapbox and AeroDataBox unit prices.** Re-fetch at sign-up; both feed the cost
  model, neither blocks code.
- **U36 — the Cloudflare zone plan.** Free ships one Rate Limiting rule and no CRS; Pro is a
  new cost line. Layers 2–3 (D-35) ship either way.
- **U37 — `DAILY_MAPBOX_QUOTE_BUDGET`.** Needs a plan that does not exist; D-54's engineering
  sentinel is the stand-in.
- **U38 — the remaining surcharge predicates.** ADR-014 §5 answered the night window (D-38);
  the airport-zone and ski-tag predicates still need owner confirmation before `draft → live`.
- **U50 — the hourly-hire rate model.** Owner question alongside the matrix; Phase 4 ships
  `hourlyEnabled=false` (D-03).
- **U48 — retention of unbound `ops_phone` `price_snapshots`.** GDPR-minimisation question on
  the ADR-002 channel. Do not build `purge_unbought_quotes` in Phase 4.
- **The CHF matrix itself** — the one blocker that gates P8 and the launch flip (D-46).

**Later phases**
- **U9 — one line of checkout copy stating the charge currency, four languages.** Phase 7,
  under ADR-014 §1's Stripe-FX rule.
- **U20 — who mints `bookings.idempotency_key` and its lifetime.** Phase 7 checkout POST
  contract; Phase 4 only requires the field (D-57).
- **U22 — `POST /api/ops/quote`: phone-booking pricing *and* duration with no Mapbox.**
  Specified in research §7, built in Phase 8 (OPS-03/OPS-04). The web funnel must never
  invent a duration.
- **U42 — `checkout_abandon_release_minutes`.** Phase 5/7, same "how long do we wait for
  Stripe" decision as U19.
- **U47 — Stripe auto-cancel of an unconfirmed `requires_payment_method` PaymentIntent.**
  Phase 7; treat an explicit `paymentIntents.cancel()` on rollback as mandatory.
- **U55 — closed or seasonal roads on the travel day.** Named residual: dispatcher sees a
  named via + duration band, never GeoJSON (U33). No `driving-traffic`, no metre override.
- **U56 — customer note + locale on the ops surface.** Phase 7 persists `bookings.locale` and
  `bookings.note`; Phase 8's OpsDetail renders them with `dir` from `locale`. Never
  auto-translate, never freeze Arabic prose into an i18n key.
- **U57 — flight term-search (`GET /flights/search/term`).** Named drop; Phase 4 is
  lookup-only and the Phase 5 widget does not autocomplete flights.
- **U58 — the HMAC lock-secret rotation runbook.** Ops documentation, not a product number;
  D-28 ships the dual-verify mechanism it describes.
- **A KV soft-reservation for visibly scarce coupon campaigns.** Legitimate future UX, purely
  additive, must key `(coupon_id, quote_id)` and never an email or customer id. Not built.

</deferred>

---

*Phase: 04-quote-pricing-engine*
*Context gathered: 2026-08-23 via research express path*
