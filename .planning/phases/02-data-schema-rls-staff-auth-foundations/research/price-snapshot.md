# Price/Policy Snapshot — Phase 2 Research Brief

**Lane:** price-snapshot · **Phase:** 2 (Data Schema, RLS & Staff Auth Foundations)
**Downstream consumers:** Phase 4 (QUOTE-03/04/05/06/10/11), Phase 7 (PAY-01/02/04/05), Phase 9 (LIFE-01/02/03/06/07), Phase 8 (DATA-08, OPS-05)
**Date:** 2026-08-21

---

## 0. What the repo already commits us to

Read before designing anything (all read-only, all confirmed in this pass):

| Source | Binding fact |
|---|---|
| `/Users/koss/Developer/VamosTaxi.eu/.planning/ADR-004-currency-display-only.md` | "one CHF amount per rate, per route and per surcharge — no per-currency columns anywhere in the pricing tables". Currency switch changes the mark, never the number. Stripe settles CHF. |
| `/Users/koss/Developer/VamosTaxi.eu/.planning/ADR-006-return-trips-booking-legs.md` | `bookings` = the commercial record (customer, payment, **price**, reference, refund). `booking_legs` = the dispatchable units. Round-trip discount is "a pricing rule that sits on top of either model" and is **not decided** there. |
| `/Users/koss/Developer/VamosTaxi.eu/.planning/ADR-002-waiting-allowances-null.md` | `airport_waiting_minutes` / `city_waiting_minutes` seed **NULL**, never 60/15. NULL is what renders the Law-04 TBC pill. |
| `/Users/koss/Developer/VamosTaxi.eu/.planning/ADR-005-cancellation-copy-settings-driven.md` | The 24 h cancellation promise becomes one settings-driven value read by ≥6 surfaces in 4 languages. |
| `/Users/koss/Developer/VamosTaxi.eu/.planning/REQUIREMENTS.md:87` (LIFE-03) | "A refund is calculated from the policy stored **on the booking**, not from whatever the policy says today." |
| `/Users/koss/Developer/VamosTaxi.eu/.planning/REQUIREMENTS.md:70` (QUOTE-10) | Behind `pricing_live=false`: checkout disabled in production, every amount reads `CHF 000`. |
| `/Users/koss/Developer/VamosTaxi.eu/app/pages/manage-booking.dc.html:552` | Customer-facing copy: *"keep it, because that is what your refund is calculated from."* |
| `/Users/koss/Developer/VamosTaxi.eu/app/pages/manage-booking.dc.html:404` | Modification re-prices: *"If it comes to more you pay the difference, if it comes to less we refund it — never more than the difference."* |
| `/Users/koss/Developer/VamosTaxi.eu/app/pages/checkout.dc.html:246-253` | Rendered line shape today: `{ label, value, muted?, credit? }` — transfer, airport fee, child seat, additional stop ×N, waiting (`included`, muted), coupon (`credit`). |
| `/Users/koss/Developer/VamosTaxi.eu/app/vamos-ops-data.js:295-303` | Eight seeded surcharges, three kinds (`amount`/`percent`/`included`), each with an **English label and an English rule string**. |

That last row is a trap worth naming up front: the mock stores `label:'Airport pickup'` and `rule:'22:00 – 06:00'` as English prose on the pricing row. Porting that literally into the snapshot means every German confirmation email carries an English price line, forever, unfixable — a Law-03 breach baked into immutable rows. The snapshot stores **i18n keys plus numeric params**, never rendered label text. See §3.4.

---

## RECOMMENDATION (one decision)

> **Snapshot the whole rule set, not the amount.**
>
> Build **three** objects, not one:
>
> 1. **`rate_versions`** — an immutable, publishable batch. Every pricing row (`distance_rates`, `fixed_routes`, `surcharges`) belongs to exactly one version. Publishing a price change means inserting a new version, never `UPDATE`-ing a live row. `pricing_live` is *"exactly one row in `rate_versions` has `status='live'`"* — enforced by a partial unique index. There is **no `settings.pricing_live` boolean anywhere.**
> 2. **`price_snapshots`** — one **insert-only** row per pricing decision, at the **booking** level (one row covers both legs of a return). Typed `integer` rappen columns for the money the system does arithmetic on; a `jsonb lines` array for the line-by-line derivation (i18n key + params + `basis` + `source_row`, no rendered text); a `jsonb policy` object carrying the cancellation tiers, waiting allowances and legal-doc version **as they stood at quote time**. Provenance columns: `rate_version_id`, `settings_version_id`, `engine_version`, `computed_at`. Never updated, never deleted; a re-price inserts a new row and repoints `bookings.price_snapshot_id`.
> 3. **`booking_events`** — append-only *who-did-what-when*. It **references** a snapshot on price events; it never **contains** a price. It is not the same object as the snapshot and must not be made to do the snapshot's job.
>
> **Money is `integer` CHF rappen (int4).** Not `numeric`, not `bigint`, not text. Not per-currency.
>
> **The charge gate is in the database, not the route handler:** `price_snapshots.is_chargeable` is a `STORED` generated column, and a `BEFORE` trigger on `booking_payments` refuses any charge whose amount ≠ the snapshot total, whose snapshot is not chargeable, or whose snapshot has expired. A stale Worker deploy cannot charge the wrong number.

Everything below is the justification and the DDL.

---

## 1. Quote time vs payment time: what gets written, and why the whole rule set

### 1.1 Two moments, two different writes

**At quote time** (Phase 4, `POST /api/quote`) — write the **full snapshot**. This is the server-authoritative lock (QUOTE-04). It carries: the resolved total, every line with its derivation, the rate version, the settings/policy version, the engine version, `expires_at = now() + 30 min`.

**At payment time** (Phase 7) — **do not re-snapshot.** Re-*validate* the existing snapshot and record settlement facts on a separate `booking_payments` row: Stripe PaymentIntent id, amount actually charged, the currency actually charged. The charged amount is read **from the snapshot row**, never from the request body. A repeat webhook hits the `stripe_payment_intent_id` unique index (PAY-05).

**At modification time** (Phase 9, `manage-booking.dc.html:404`) — insert a **new** snapshot with `supersedes_id` pointing at the old one, and repoint `bookings.price_snapshot_id`. The delta charged or refunded is `new.total_rappen - old.total_rappen`. Both rows survive; the difference is arithmetic on two immutable numbers, not a diff of a mutated column.

### 1.2 Why the resolved amount alone is not enough

Five concrete failures an amount-only design cannot survive:

1. **LIFE-03, literally.** "A refund is calculated from the policy stored on the booking, not from whatever the policy says today." The policy is *tiers plus a boundary hour* (100 % / 75 % / 0 % at 24 h, per `PROJECT.md` and ADR-005). If the owner moves the boundary to 48 h in month 4, a customer who booked in month 2 is owed the month-2 tier. An amount column knows the fare; it does not know the tier that governed it. `settings.free_cancel_hours` in month 7 is the *wrong* number by construction.
2. **The refund has to be explainable to a human.** `manage-booking.dc.html:511-526` renders a refund panel with a share and a base amount, and a note that every refund is checked by a person. That person, in month 7, must be able to answer *"why 75 % of CHF 000?"* — which is "because your booking recorded a 24 h boundary and you cancelled 6 h out". Without the stored tier, the answer is a git-blame archaeology dig.
3. **The modification path needs line-level comparability.** "If it comes to more you pay the difference." Comparing two totals gives you a number; comparing two breakdowns gives you the *reason* (`the night surcharge no longer applies because you moved the pickup to 14:00`) — which is what the diff list at `manage-booking.dc.html:823` (`this.diffList()`) is already designed to render.
4. **Chargeback / dispute evidence.** Stripe dispute evidence expects the itemised rationale for the charge, not a lump sum. The breakdown *is* the evidence packet.
5. **Swiss consumer-protection exposure.** ADR-002's whole argument is that an unconfirmed number quietly becoming a live promise is the failure mode this project has already been bitten by. A booking that cannot prove which promise it was sold under is the same failure with a receipt attached.

### 1.3 But snapshot the *decision*, not a copy of the tables

The snapshot is **not** "SELECT * from the pricing tables into jsonb". It is a derivation record: for each line, *which* row fired, *why* it fired, *what number* it contributed. Copying the whole matrix into every booking would be ~8 surcharges × 4 classes × N routes of dead weight per row, and it still would not say *why* the night surcharge applied.

Redundancy that **is** deliberate: the snapshot carries both an FK to `rate_versions` **and** an embedded copy of the numbers it used. The FK answers the ops question ("which bookings were priced off version 7?"); the embedded copy means a refund in month 7 reads one row and cannot be wrong even if someone later mis-edits a version row. That redundancy is the point, not an oversight.

---

## 2. Table design — what I rejected, and why

| Option | Verdict | Reason |
|---|---|---|
| **A. `bookings.price_json jsonb`** — one column on the booking | **Rejected** | The booking row is *mutable* by design (status, chauffeur, vehicle, flight, notes — every dispatch action UPDATEs it). Putting the price history inside that row puts it in the blast radius of every `UPDATE bookings SET …`, and nothing at the DB level can stop a careless write clobbering it. PostgreSQL also notes that *"any update acquires a row-level lock on the whole row"* for large JSON documents ([PG docs, JSON types](https://www.postgresql.org/docs/current/datatype-json.html)) — the ops board would be taking booking-row locks to read a price breakdown. And there is no place for the second snapshot a modification creates. |
| **B. Fully normalised `price_snapshot_lines` with FKs to `surcharges.id`** | **Rejected** | The FK *is* the bug. `surcharges.id = 11` is a living row that ops edits (OPS-06 explicitly grants staff that power). Six months later the join resolves to today's label and today's amount, and the snapshot silently lies while looking rigorous. Making the FK safe requires making every pricing row immutable-forever — which is the versioned-rows design below anyway. Once rows are versioned and the line is self-describing, a fifth table buys nothing: the document is fixed-shape, write-once, always read whole. PG's own guidance is that jsonb suits exactly this — *"even for applications where maximal flexibility is desired, it is still recommended that JSON documents have a somewhat fixed structure."* |
| **C. SCD-2 `valid_from` / `valid_to` on the live tables, recompute "as of" at refund time** | **Rejected** | It reproduces the *inputs*, never the *decision*. Reproducing the decision means re-running the Phase 4 engine **as it existed at quote time** — that's a code version, not a data version, and the engine will change (new surcharge kinds, coupon stacking, rounding). An "as-of" query silently produces today's engine's answer over yesterday's inputs. Secondary problem: `valid_to` is a mutating column, so the "history" table is itself mutable and needs its own audit trail. Turtles. |
| **D. `numeric` money in jsonb only, no typed columns** | **Rejected** | Sorting the ops board by fare, summing a day's revenue, and comparing charged-vs-snapshot at the payment gate all become jsonb casts. Typed columns for the numbers the *system* computes on; jsonb for the explanation a *human* reads. |
| **E (chosen). Versioned rate batches + insert-only booking-level snapshot (typed totals + jsonb derivation) + separate append-only event log** | **Recommended** | Each object does one job. The version answers "what was published"; the snapshot answers "what was true for this booking"; the event log answers "who did what". |

---

## 3. The DDL

Target: **PostgreSQL 17** — Supabase's current default for new projects ([Supabase upgrading docs](https://supabase.com/docs/guides/platform/upgrading)). This matters in one place: generated columns are `STORED`-only before PG18 (PG18 makes them *virtual by default*), so every `GENERATED ALWAYS AS` below writes `STORED` explicitly and stays correct across an upgrade ([PG generated columns](https://www.postgresql.org/docs/current/ddl-generated-columns.html)).

### 3.1 Money

```sql
-- packages/db/migrations/0003_pricing_money.sql

-- Every amount in this schema is CHF minor units (rappen). ADR-004: CHF is the one
-- priced currency; EUR/USD/AED are a display mark, never a second price.
--
-- int4, deliberately, and not numeric:
--   * Stripe's `amount` is already an integer in the currency's minor unit, and CHF is
--     a two-decimal currency (min charge 0.50 CHF). Storing rappen means the number in
--     the row IS the number sent to Stripe — no conversion at the boundary where a
--     rounding bug becomes a wrong charge.
--     https://docs.stripe.com/currencies
--   * postgres.js returns `numeric` as a STRING ("There is currently no guaranteed way
--     to handle numeric / decimal types in native Javascript"), and int8 as a string
--     unless you configure `postgres.BigInt`. int4 arrives as a plain JS number.
--     https://github.com/porsager/postgres#readme
--   * PG docs recommend `numeric` for money — that recommendation is against binary
--     floating point, and integer minor units satisfy the same exactness requirement
--     with a type that survives the JS boundary intact. This is a considered departure,
--     not an oversight. https://www.postgresql.org/docs/current/datatype-numeric.html
--   * Ceiling: 2'147'483'647 rappen = CHF 21'474'836.47. A Zurich transfer will not reach it.
create domain rappen as integer;

comment on domain rappen is
  'CHF minor units (1/100 CHF). ROUNDING RULE, binding on the Phase 4 engine: each '
  'price line is rounded half-up to the whole rappen at the moment it is computed; a '
  'total is the sum of ALREADY-ROUNDED lines, never the rounding of an unrounded sum. '
  'Otherwise the lines the customer reads do not add up to the total they are charged.';
```

> **Law 04 note.** The mock's `'000'` / `'00'` / `'0.00'` placeholder strings do **not** port to a `text` column. They are a *rendering* convention produced by `VamosLocale.money(null)`. The column is `rappen NULL`; NULL is what makes the surface print `CHF 000`.

### 3.2 Versioned rate batches — and the real `pricing_live` gate

```sql
-- packages/db/migrations/0004_rate_versions.sql

create type rate_version_status as enum ('draft', 'live', 'retired');

create table public.rate_versions (
  id            bigint generated always as identity primary key,
  label         text        not null,
  status        rate_version_status not null default 'draft',
  note          text        not null default '',
  created_at    timestamptz not null default now(),
  created_by    uuid        references auth.users(id) on delete set null,
  published_at  timestamptz,
  published_by  uuid        references auth.users(id) on delete set null,
  constraint rate_versions_published_stamp
    check (status = 'draft' or published_at is not null)
);

-- QUOTE-10, structurally. "pricing_live" is not a boolean anyone can flip; it means
-- exactly "one rate_versions row has status='live'". Before the owner's CHF matrix
-- lands and is approved, no row is live, so no snapshot is chargeable, so the payment
-- trigger in 0007 refuses every charge. There is no settings.pricing_live column.
create unique index rate_versions_one_live
  on public.rate_versions ((true)) where status = 'live';
```

The priced rows hang off a version. Column names for `fixed_routes` / `distance_rates` / `surcharges` belong to the schema lane; these are the columns the snapshot depends on and the shape the versioning imposes:

```sql
create table public.distance_rates (
  id                bigint generated always as identity primary key,
  rate_version_id   bigint  not null references public.rate_versions(id) on delete restrict,
  vehicle_class_id  bigint  not null references public.vehicle_classes(id) on delete restrict,
  base_fare_rappen  rappen  check (base_fare_rappen >= 0),   -- NULL until the matrix lands
  per_km_rappen     rappen  check (per_km_rappen    >= 0),   -- see UNCERTAIN-7 (sub-rappen)
  min_fare_rappen   rappen  check (min_fare_rappen  >= 0),
  available         boolean not null default true,
  unique (rate_version_id, vehicle_class_id)
);

create type surcharge_kind as enum ('amount', 'percent', 'included');

create table public.surcharges (
  id               bigint generated always as identity primary key,
  rate_version_id  bigint not null references public.rate_versions(id) on delete restrict,
  -- `code` is the STABLE identity and the i18n key stem: 'airport_pickup', 'night',
  -- 'waiting_airport', 'waiting_city', 'extra_stop', 'child_seat', 'meet_greet', 'ski_rack'.
  -- The mock's English `label` and `rule` strings (app/vamos-ops-data.js:295-303) do NOT
  -- port to this table — they live in content_strings under
  -- 'price.surcharge.<code>.label' / '.rule' in en/de/fr/ar (Law 03).
  code             text not null,
  kind             surcharge_kind not null default 'amount',
  amount_rappen    rappen       check (amount_rappen >= 0),
  percent          numeric(5,2) check (percent >= 0 and percent <= 100),
  applies_to       text not null default 'leg' check (applies_to in ('leg','booking')),
  active           boolean not null default true,
  unique (rate_version_id, code),
  constraint surcharges_kind_field check (
       (kind = 'amount'   and percent is null)
    or (kind = 'percent'  and amount_rappen is null)
    or (kind = 'included' and amount_rappen is null and percent is null)
  )
);

create table public.fixed_routes (
  id                bigint generated always as identity primary key,
  rate_version_id   bigint not null references public.rate_versions(id) on delete restrict,
  origin_zone_id    bigint not null references public.service_zones(id) on delete restrict,
  dest_zone_id      bigint not null references public.service_zones(id) on delete restrict,
  vehicle_class_id  bigint not null references public.vehicle_classes(id) on delete restrict,
  price_rappen      rappen check (price_rappen >= 0),   -- NULL until the matrix lands
  live              boolean not null default false,
  unique (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id)
);
```

Freeze a version once it leaves `draft`, so every snapshot FK stays honest:

```sql
create or replace function public.tg_pricing_row_frozen()
returns trigger language plpgsql as $$
declare v_status rate_version_status;
begin
  select status into v_status from public.rate_versions
   where id = coalesce(new.rate_version_id, old.rate_version_id);
  if v_status is distinct from 'draft' then
    raise exception
      'pricing rows are immutable once their rate_version leaves draft (%.% id=%)',
      tg_table_schema, tg_table_name, coalesce(new.id, old.id)
      using errcode = 'restrict_violation',
            hint = 'Publish a new rate_version instead of editing a live one.';
  end if;
  return coalesce(new, old);
end $$;

create trigger distance_rates_frozen before update or delete on public.distance_rates
  for each row execute function public.tg_pricing_row_frozen();
create trigger surcharges_frozen     before update or delete on public.surcharges
  for each row execute function public.tg_pricing_row_frozen();
create trigger fixed_routes_frozen   before update or delete on public.fixed_routes
  for each row execute function public.tg_pricing_row_frozen();
```

### 3.3 Versioned policy (the ADR-005 / LIFE-03 half)

Split the mock's `SETTINGS` singleton in two. Contact details and channel toggles stay a plain mutable single row. **Policy** — anything a customer was promised — is versioned, because LIFE-03 requires the *booked* policy.

```sql
-- packages/db/migrations/0005_settings_versions.sql

create table public.settings_versions (
  id                            bigint generated always as identity primary key,
  label                         text        not null,
  effective_from                timestamptz not null default now(),
  created_by                    uuid references auth.users(id) on delete set null,

  -- ADR-005: one key, one fact. Six-plus surfaces in four languages read these.
  free_cancel_hours             integer  check (free_cancel_hours >= 0),
  modification_deadline_hours   integer  check (modification_deadline_hours >= 0),
  min_advance_minutes           integer  check (min_advance_minutes >= 0),

  -- ADR-002: SEED NULL. Never 60 / 15. NULL is what renders the Law-04 TBC pill.
  airport_waiting_minutes       integer  check (airport_waiting_minutes >= 0),
  city_waiting_minutes          integer  check (city_waiting_minutes    >= 0),

  -- [{ "from_hours_before": 24, "refund_percent": 100 },
  --  { "from_hours_before": 0,  "refund_percent": 75  },
  --  { "no_show": true,         "refund_percent": 0   }]
  cancellation_tiers            jsonb not null default '[]'::jsonb,

  -- Pins the legal page version the customer agreed to (Phase 5 versions /legal/*).
  policy_doc_slug               text,
  policy_doc_version            text,

  constraint settings_versions_tiers_array check (jsonb_typeof(cancellation_tiers) = 'array')
);

create unique index settings_versions_one_current
  on public.settings_versions ((true)) where effective_from <= now() and id = id;
-- NOTE: the "current" version is `order by effective_from desc limit 1`; the index above
-- is a placeholder — replace with a plain btree on (effective_from desc). See UNCERTAIN-5.
```

### 3.4 The snapshot

```sql
-- packages/db/migrations/0006_price_snapshots.sql

create table public.price_snapshots (
  id                     bigint generated always as identity primary key,

  -- Booking-level, per ADR-006: the bookings row is the commercial record. ONE snapshot
  -- covers both legs of a return; per-leg money lives in price_snapshot_legs (below).
  booking_id             bigint not null references public.bookings(id) on delete restrict,
  supersedes_id          bigint references public.price_snapshots(id) on delete restrict,

  -- The quote endpoint prices EVERY eligible class in one call and writes one row per
  -- class, all sharing quote_id. The customer's pick sets bookings.price_snapshot_id.
  -- The unchosen rows stay as evidence of what was shown, and expire by expires_at.
  quote_id               uuid   not null,
  vehicle_class_id       bigint not null references public.vehicle_classes(id) on delete restrict,

  -- ── provenance ────────────────────────────────────────────────────────────────
  rate_version_id        bigint not null references public.rate_versions(id) on delete restrict,
  -- Copied at insert, NOT joined at read: a generated column cannot reference another
  -- table, and this is the input to the charge gate. It is immutable by construction
  -- because a version never returns to 'live' once retired.
  rate_version_is_live   boolean not null,
  settings_version_id    bigint not null references public.settings_versions(id) on delete restrict,
  engine_version         text   not null,          -- 'quote-engine@<git-sha>'
  computed_at            timestamptz not null default now(),
  computed_by            uuid references auth.users(id) on delete set null,  -- null = public endpoint
  source                 text not null default 'web'
                         check (source in ('web','ops_phone','modification')),

  -- ── the money the system does arithmetic on ───────────────────────────────────
  currency               char(3) not null default 'CHF' check (currency = 'CHF'),
  -- ADR-004's stated cost: the mark shown may differ from the currency charged.
  -- Recorded so support can reconstruct what the customer actually saw. See UNCERTAIN-1.
  display_currency       char(3) not null default 'CHF'
                         check (display_currency in ('CHF','EUR','USD','AED')),
  subtotal_rappen        rappen check (subtotal_rappen   >= 0),
  surcharges_rappen      rappen check (surcharges_rappen >= 0),
  discount_rappen        rappen check (discount_rappen   >= 0),
  total_rappen           rappen check (total_rappen      >= 0),

  -- ── typed inputs Phase 9 filters and re-prices on ─────────────────────────────
  distance_km            numeric(7,2) check (distance_km >= 0),
  duration_min           integer      check (duration_min >= 0),
  pax                    smallint not null check (pax  >= 1),
  bags                   smallint not null check (bags >= 0),
  coupon_id              bigint references public.coupons(id) on delete restrict,
  coupon_code            text,     -- as the customer typed it, not as it reads today

  -- ── the explanation (see shape below) ─────────────────────────────────────────
  lines                  jsonb not null,
  policy                 jsonb not null,

  -- ── the lock (QUOTE-04) ───────────────────────────────────────────────────────
  expires_at             timestamptz not null,

  -- ── the charge gate (QUOTE-10) ────────────────────────────────────────────────
  -- STORED explicitly: PG17 has no VIRTUAL, PG18 defaults to VIRTUAL. Both operands are
  -- plain columns of this row, so the expression is trivially immutable.
  is_chargeable boolean not null generated always as (
    total_rappen is not null and rate_version_is_live
  ) stored,

  constraint price_snapshots_total_sums check (
    total_rappen is null
    or total_rappen = coalesce(subtotal_rappen,0)
                    + coalesce(surcharges_rappen,0)
                    - coalesce(discount_rappen,0)
  ),
  -- Either the matrix has landed for this class or it has not. No half-priced rows.
  constraint price_snapshots_all_or_nothing check (
    (total_rappen is null     and subtotal_rappen is null)
    or (total_rappen is not null and subtotal_rappen is not null)
  ),
  constraint price_snapshots_lines_array check (jsonb_typeof(lines) = 'array'),
  -- LIFE-03: a snapshot without its policy cannot answer a refund. Refuse it at write time.
  constraint price_snapshots_policy_shape check (
       policy ? 'cancellation_tiers'
   and policy ? 'free_cancel_hours'
   and policy ? 'airport_waiting_minutes'
   and policy ? 'city_waiting_minutes'
   and policy ? 'settings_version_id'
  ),
  constraint price_snapshots_coupon_pair check (
    (coupon_id is null) = (coupon_code is null)
  )
);

create unique index price_snapshots_quote_class
  on public.price_snapshots (quote_id, vehicle_class_id);
create index price_snapshots_booking
  on public.price_snapshots (booking_id, computed_at desc);
create index price_snapshots_rate_version
  on public.price_snapshots (rate_version_id);
-- LIFE-07 stale-quote sweep
create index price_snapshots_expiry
  on public.price_snapshots (expires_at) where total_rappen is not null;

-- Per-leg money. ADR-006: legs SHARE one snapshot; they do not duplicate it. A leg does
-- not get its own rate version, its own coupon or its own policy — those are booking-level
-- facts. It does get its own subtotal, because a customer may cancel only the return leg.
create table public.price_snapshot_legs (
  snapshot_id          bigint   not null references public.price_snapshots(id) on delete restrict,
  leg_seq              smallint not null check (leg_seq in (1,2)),
  booking_leg_id       bigint   references public.booking_legs(id) on delete restrict,
  distance_km          numeric(7,2) check (distance_km >= 0),
  duration_min         integer      check (duration_min >= 0),
  leg_subtotal_rappen  rappen       check (leg_subtotal_rappen >= 0),
  primary key (snapshot_id, leg_seq)
);
```

**`bookings` columns this lane owns:**

```sql
alter table public.bookings
  add column price_snapshot_id  bigint references public.price_snapshots(id) on delete restrict,
  -- Denormalised CACHE for the ops board's list query (OPS-01: sort/filter without a join).
  -- Maintained by trigger from price_snapshot_id. Never written by hand. Not the truth.
  add column price_total_rappen rappen;

create index bookings_price_snapshot on public.bookings (price_snapshot_id);
```

> **Conflict to record against `docs/build/GSD-LAUNCH.md` §Phase 2 line 66.** That document specifies `bookings.price_chf numeric nullable until matrix lands`. This design replaces it with `price_snapshot_id` + the `price_total_rappen` cache. A bare `price_chf numeric` on a mutable booking row is option A above, and it cannot satisfy QUOTE-05 or LIFE-03. Flag it in the phase plan so the two documents do not disagree in the migration.

#### `lines` — the shape, binding on Phase 4

```json
[
  { "seq": 1, "leg_seq": 1, "kind": "fare",
    "code": "distance_fare",
    "i18n_key": "price.line.transfer",
    "params": { "vehicle_class": "business" },
    "basis": { "rule": "per_km", "distance_km": 18.40, "per_km_rappen": 385,
               "base_fare_rappen": 1500, "min_fare_rappen": 6000, "min_fare_applied": false },
    "source_row": { "table": "distance_rates", "id": 42, "rate_version_id": 7 },
    "amount_rappen": 8584 },

  { "seq": 2, "leg_seq": 1, "kind": "surcharge",
    "code": "night", "i18n_key": "price.surcharge.night.label",
    "basis": { "rule": "percent", "percent": 15.00, "of_rappen": 8584,
               "why": { "pickup_local": "2026-09-04T23:10:00", "tz": "Europe/Zurich",
                        "window": "22:00-06:00" } },
    "source_row": { "table": "surcharges", "id": 11, "rate_version_id": 7 },
    "amount_rappen": 1288 },

  { "seq": 3, "leg_seq": 1, "kind": "included",
    "code": "waiting_airport", "i18n_key": "price.surcharge.waiting_airport.label",
    "basis": { "included_minutes": null },
    "amount_rappen": null },

  { "seq": 4, "leg_seq": null, "kind": "discount",
    "code": "coupon", "i18n_key": "price.line.coupon",
    "params": { "code": "ZRH20" },
    "basis": { "rule": "percent", "percent": 20.00, "of_rappen": 9872 },
    "source_row": { "table": "coupons", "id": 3 },
    "allocation": "pro_rata",
    "amount_rappen": -1974 }
]
```

Four rules that make this shape load-bearing rather than decorative:

- **`i18n_key` + `params`, never a rendered label.** The snapshot freezes the *number*; the *words* resolve through `content_strings` at render time, so a German customer's confirmation reads German and a 2029 re-render of a 2026 booking still reads correctly in all four languages. This is the single most important difference from the mock's `label:'Airport pickup'`. The one literal that stays literal is a coupon `code` (it is a code — `.vt-dir-keep` in Arabic).
- **`basis` is the *why*, not just the *what*.** `"why": { "pickup_local": "…23:10", "window": "22:00-06:00" }` is what a support agent needs in month 7. Note it records the **local wall-clock time** alongside the timezone: recomputing "was this 23:10?" from a UTC instant months later is a DST bug waiting to happen, and `23:10` is the fact that justifies the charge.
- **`leg_seq`** on every line, `null` for booking-level lines (round-trip discount, coupon). A leg-level cancellation reads `price_snapshot_legs.leg_subtotal_rappen` and apportions the booking-level lines by the **`allocation` rule recorded in the snapshot** — so the apportionment used at refund time is the one that was recorded, not one invented at refund time.
- **`amount_rappen: null`** for `kind:"included"` and for any line whose matrix value has not landed → renders `CHF 000` / the TBC pill, by data.

Mapping to what the mock already renders (`checkout.dc.html:246`, `manage-booking.dc.html:816`): `kind:"included"` → `muted:true`; `kind:"discount"` → `credit:true`; everything else → a plain line. No UI change is needed to consume this.

#### `policy` — the shape

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

The two `null`s are ADR-002 working as designed: the confirmation email and the manage-booking panel render TBC pills, and when the owner answers, only *new* bookings get the number — old bookings correctly keep the promise they were sold. That is the property an unversioned `settings` lookup destroys.

### 3.5 Payment and refund — the gate

```sql
-- packages/db/migrations/0007_payments_refunds.sql

create table public.booking_payments (
  id                        bigint generated always as identity primary key,
  booking_id                bigint not null references public.bookings(id) on delete restrict,
  snapshot_id               bigint not null references public.price_snapshots(id) on delete restrict,
  stripe_payment_intent_id  text   not null unique,     -- PAY-05 idempotency
  charged_rappen            rappen not null check (charged_rappen > 0),
  charged_currency          char(3) not null default 'CHF' check (charged_currency = 'CHF'),
  status                    text   not null check (status in
                              ('requires_payment','succeeded','failed','canceled')),
  captured_at               timestamptz,
  created_at                timestamptz not null default now()
);

-- The server-authoritative gate. A CHECK constraint cannot reach another table, so this
-- must be a trigger. It holds even if a Worker deploy is stale, even if an ops user runs
-- raw SQL, even if the checkout route is bypassed entirely.
create or replace function public.tg_payment_matches_snapshot()
returns trigger language plpgsql as $$
declare s public.price_snapshots%rowtype;
begin
  select * into s from public.price_snapshots where id = new.snapshot_id;

  if not s.is_chargeable then
    raise exception 'snapshot % is not chargeable (total=%, rate_version_is_live=%)',
      s.id, s.total_rappen, s.rate_version_is_live
      using errcode = 'restrict_violation',
            hint = 'QUOTE-10: no rate_version is live, or this class has no priced matrix row.';
  end if;

  -- QUOTE-04: "an expired quote is refused at payment time by the server, not merely
  -- hidden in the UI." now() is evaluated at INSERT, which is when the charge is created.
  if s.expires_at <= now() then
    raise exception 'quote % expired at %', s.id, s.expires_at
      using errcode = 'restrict_violation';
  end if;

  if new.charged_rappen is distinct from s.total_rappen then
    raise exception 'charge % does not match snapshot % total %',
      new.charged_rappen, s.id, s.total_rappen
      using errcode = 'restrict_violation';
  end if;

  if new.booking_id is distinct from s.booking_id then
    raise exception 'snapshot % belongs to booking %, not %', s.id, s.booking_id, new.booking_id
      using errcode = 'restrict_violation';
  end if;

  return new;
end $$;

create trigger booking_payments_match_snapshot
  before insert on public.booking_payments
  for each row execute function public.tg_payment_matches_snapshot();

create table public.booking_refunds (
  id               bigint generated always as identity primary key,
  booking_id       bigint not null references public.bookings(id) on delete restrict,
  snapshot_id      bigint not null references public.price_snapshots(id) on delete restrict,
  payment_id       bigint not null references public.booking_payments(id) on delete restrict,
  -- null = whole booking; set = one leg of a return (ADR-006)
  booking_leg_id   bigint references public.booking_legs(id) on delete restrict,
  reason           text   not null check (reason in
                     ('customer_cancel','ops_cancel','no_driver','modification_credit','no_show')),
  basis_rappen     rappen not null check (basis_rappen >= 0),
  refund_percent   numeric(5,2) not null check (refund_percent between 0 and 100),
  refund_rappen    rappen not null check (refund_rappen >= 0),
  -- LIFE-03, made self-evident: the exact tier object copied out of snapshot.policy at
  -- decision time, plus the hours-before that selected it. This one row answers
  -- "why 75 % of CHF 000?" without reading anything else.
  tier_applied     jsonb  not null,
  hours_before     numeric(8,2) not null,
  stripe_refund_id text unique,
  decided_by       uuid references auth.users(id) on delete set null,
  decided_at       timestamptz not null default now(),
  constraint booking_refunds_not_more_than_basis check (refund_rappen <= basis_rappen)
);
```

### 3.6 `booking_events` — the audit trail, and why it is a different object

```sql
-- packages/db/migrations/0008_booking_events.sql

create table public.booking_events (
  id              bigint generated always as identity primary key,
  booking_id      bigint not null references public.bookings(id) on delete restrict,
  booking_leg_id  bigint references public.booking_legs(id) on delete restrict,
  at              timestamptz not null default now(),
  kind            text not null check (kind in (
                    'booking.created','booking.status_changed','booking.modified',
                    'price.quoted','price.repriced','price.superseded',
                    'payment.intent_created','payment.succeeded','payment.failed',
                    'refund.requested','refund.issued',
                    'assignment.chauffeur_set','assignment.vehicle_set','assignment.cleared',
                    'flight.delayed','note.added')),
  actor_kind      text not null check (actor_kind in ('customer','staff','system','stripe','cron')),
  actor_id        uuid references auth.users(id) on delete set null,
  -- Frozen at write. The timeline must still read "Sara, dispatch" after Sara's profile
  -- row is gone — a join to a live profiles row would render blank or, worse, someone else.
  actor_label     text not null default '',
  snapshot_id     bigint references public.price_snapshots(id) on delete restrict,
  payment_id      bigint references public.booking_payments(id) on delete restrict,
  refund_id       bigint references public.booking_refunds(id) on delete restrict,
  from_status     public.booking_status,
  to_status       public.booking_status,
  payload         jsonb not null default '{}'::jsonb,

  -- A price event that cannot point at the price it changed is not an audit trail.
  constraint booking_events_price_has_snapshot check (
    kind not like 'price.%' or snapshot_id is not null
  ),
  constraint booking_events_status_pair check (
    kind <> 'booking.status_changed' or (from_status is not null and to_status is not null)
  )
);

create index booking_events_timeline on public.booking_events (booking_id, at desc);
```

**They are not the same thing.** Conflating them is the trap this section exists to close:

| | `price_snapshots` | `booking_events` |
|---|---|---|
| Question it answers | *What was true?* — the world the booking was priced under | *What happened, who did it, when?* |
| Grain | one row per pricing decision | one row per state change |
| Shape | a complete, self-contained document | a delta plus an actor |
| Primary reader | quote engine, refund engine, confirmation email, the customer | ops Detail timeline, audit, dispute evidence |
| Contains money? | yes, authoritatively | no — it **references** a snapshot |
| Growth | ~1–2 rows per booking (+ unchosen quote rows) | ~10–30 rows per booking |

DATA-08 requires events to cover *booking, price, payment and assignment* changes — so the log records **that** the price changed and **who** changed it; the snapshot records **what** the price was. Recomputing a refund by replaying the event log would be slow, fragile, and would break the moment an event kind is renamed. Reading it from `bookings.price_snapshot_id` is one indexed lookup.

### 3.7 Append-only enforcement — four layers, because three of them are bypassable

```sql
-- packages/db/migrations/0009_append_only.sql

create or replace function public.tg_append_only()
returns trigger language plpgsql as $$
begin
  raise exception 'append-only table %.%: % is not permitted',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation',
          hint = 'Insert a superseding row; never mutate history.';
end $$;

create trigger price_snapshots_append_only
  before update or delete on public.price_snapshots
  for each row execute function public.tg_append_only();
create trigger price_snapshot_legs_append_only
  before update or delete on public.price_snapshot_legs
  for each row execute function public.tg_append_only();
create trigger booking_events_append_only
  before update or delete on public.booking_events
  for each row execute function public.tg_append_only();
create trigger booking_refunds_append_only
  before update or delete on public.booking_refunds
  for each row execute function public.tg_append_only();
-- booking_payments is the exception: Stripe legitimately moves a PI through statuses.
-- It gets an UPDATE-column whitelist instead (status, captured_at) — same function
-- family, different predicate.

-- Layer 2: the privilege system. RLS is "in addition to the SQL-standard privilege
-- system available through GRANT" — it does not replace it.
-- https://www.postgresql.org/docs/current/ddl-rowsecurity.html
revoke update, delete on public.price_snapshots, public.price_snapshot_legs,
                          public.booking_events, public.booking_refunds
  from anon, authenticated, service_role;

-- Layer 3: RLS on, with no UPDATE/DELETE policy at all → default deny.
-- "Once RLS is enabled, no data is accessible ... until you create policies."
-- https://supabase.com/docs/guides/database/postgres/row-level-security
alter table public.price_snapshots     enable row level security;
alter table public.price_snapshot_legs enable row level security;
alter table public.booking_events      enable row level security;
alter table public.booking_refunds     enable row level security;

-- Layer 4: FORCE, so the table owner does not sail past its own policies. PG: "Table
-- owners normally bypass row security as well, though a table owner can choose to be
-- subject to row security with ALTER TABLE ... FORCE ROW LEVEL SECURITY."
alter table public.price_snapshots     force row level security;
alter table public.price_snapshot_legs force row level security;
alter table public.booking_events      force row level security;
alter table public.booking_refunds     force row level security;
```

Layers 2–4 are bypassed by `service_role` (which carries `bypassrls`) and by superusers; **only the trigger catches a migration or a `psql` session running as `postgres`**. That is why all four ship together, and why the trigger is not redundant with the grants.

### 3.8 RLS policies on the snapshot

```sql
-- SELECT: the owning customer, a valid manage-token session (DATA-03), or staff (DATA-04).
create policy price_snapshots_select_own on public.price_snapshots
  for select to authenticated
  using (exists (
    select 1 from public.bookings b
     where b.id = price_snapshots.booking_id
       and b.customer_id = (select auth.uid())     -- wrapped: initPlan caches per statement
  ));

create policy price_snapshots_select_staff on public.price_snapshots
  for select to authenticated
  using ((select auth.jwt()) ->> 'role' in ('dispatcher','admin'));

-- INSERT: staff, or the quote endpoint under its own least-privilege role.
create policy price_snapshots_insert_staff on public.price_snapshots
  for insert to authenticated
  with check ((select auth.jwt()) ->> 'role' in ('dispatcher','admin'));

-- No UPDATE policy. No DELETE policy. Default deny.
```

> **Interface to the Phase 3 lane.** The public quote endpoint must write snapshots without a signed-in user. Recommend a dedicated `vamos_quote` role granted `INSERT` on `price_snapshots` / `price_snapshot_legs` and `SELECT` on the pricing tables and *nothing else*, reached via `set local role` inside the request transaction. That keeps DATA-06's request-scoped-context proof intact — `set local` is transaction-scoped and cannot survive onto the next request sharing the Hyperdrive connection. Do **not** solve it by giving the Worker `service_role` for the quote path; `service_role` carries `bypassrls` and would make every RLS test above meaningless.

---

## 4. `pricing_live=false`, end to end

Four layers, only one of which is a config flag, and that one cannot cause a charge:

1. **Data.** No `rate_versions` row is `live`. Every snapshot's `rate_version_is_live` is `false`, so `is_chargeable` is `false`.
2. **Database.** `tg_payment_matches_snapshot` refuses every `booking_payments` insert. No code path — not a stale Worker, not an ops SQL session, not a replayed webhook — can create a charge. **This layer has no off switch.**
3. **Serialisation.** The quote API returns `total: null` when `is_chargeable` is false, so the UI receives `null` and `VamosLocale.money(null)` prints `CHF 000` by data, not by a UI conditional. **One environment variable, `PRICING_PREVIEW`, true on staging only**, lets staging return the draft matrix's real numbers so the funnel is genuinely testable end-to-end. It changes what is *shown*, never what can be *charged*.
4. **Launch trigger.** Publishing the owner-approved version — one `UPDATE rate_versions SET status='live'` guarded by `rate_versions_one_live` — is the flag flip. It is a dated, attributed row (`published_at`, `published_by`), not a boolean nobody can date.

**Rejected: `settings.pricing_live boolean`.** A single mutable boolean is exactly the thing an ops screen flips by accident, and it records nothing: it cannot answer "which version was live when this booking was quoted". The snapshot answers that from its own row.

---

## 5. Return trips: one snapshot, per-leg subtotals

**Legs share one snapshot. They do not each get one.** ADR-006's argument decides this: the customer bought *one* thing, at *one* price, under *one* reference, and Stripe charges once. Two snapshots would mean two totals with no row to hold the round-trip discount, which is a booking-level line by nature.

But refunds and cancellations happen per leg — "a customer can cancel or reschedule only the return leg while the outbound leg has already happened". So:

- `price_snapshot_legs` carries `leg_subtotal_rappen` per leg — the refund basis for a single-leg cancellation.
- Every entry in `lines` carries `leg_seq`; booking-level lines carry `leg_seq: null` plus an `allocation` rule (`"pro_rata"`) recorded **in the snapshot**, so a leg-2-only refund apportions the coupon by the rule that was recorded, not one invented at refund time.
- A leg-level refund inserts `booking_refunds` with `booking_leg_id` set, `basis_rappen = leg_subtotal_rappen ± allocated booking-level lines`, `refund_percent` from `snapshot.policy.cancellation_tiers`, and `tier_applied` copying the tier object.
- What a leg **does not** get: its own rate version, its own coupon, its own policy, its own expiry. Those are booking-level facts by definition.

Round-trip discount: the shape supports it as a booking-level `kind:"discount"` line with `code:"return_trip"`. The **percentage is not decided** — ADR-006 explicitly defers it to the CHF matrix under Q11. Do not invent one, not even in a fixture.

---

## 6. Seed obligations for this lane (DATA-07)

```sql
-- packages/db/seed/pricing.sql
insert into public.rate_versions (label, status, note)
values ('Staging matrix — placeholder, not owner-approved', 'draft',
        'Every amount NULL until the CHF matrix lands. Publishing this is NOT the launch trigger.');

-- distance_rates: one row per vehicle class, ALL amounts NULL.
-- surcharges: the eight codes from app/vamos-ops-data.js:295-303, kinds preserved,
--             amounts/percent NULL, labels NOT here (they go to content_strings).
-- settings_versions: one row. free_cancel_hours = 24 (ADR-005, owner decision 2, dated).
--                    airport_waiting_minutes = NULL, city_waiting_minutes = NULL (ADR-002).
--                    cancellation_tiers = the 100/75/0 array (PROJECT.md Key Decisions).
-- content_strings: price.line.* and price.surcharge.<code>.{label,rule} in en/de/fr/ar.
```

**No `rate_versions` row is seeded `live`.** A fresh environment therefore cannot charge, and every amount reads `CHF 000`, which is the correct state until the owner approves the matrix.

---

## 7. Adjacency note (other lane's ground, one line)

The driver double-booking exclusion (OPS-03, Phase 8) lands on `booking_legs`, not here, and needs `create extension btree_gist` to combine an equality column with a range: `EXCLUDE USING gist (chauffeur_id WITH =, scheduled_range WITH &&)`. btree_gist is available on Supabase. Flagged only because both migrations want that `CREATE EXTENSION` and it should be declared once, early.

---

## 8. UNCERTAIN — and the check that settles each

| # | Uncertainty | The check that settles it |
|---|---|---|
| **1** | Does the customer literally see `EUR 000` for a CHF 000 charge? `display_currency` is designed on that assumption, and ADR-004 flags "the charge currency must be stated in words" as an *unwritten requirement*. | Read `VamosLocale.money()` in `/Users/koss/Developer/VamosTaxi.eu/app/vamos-locale.js` to confirm the mark-swap behaviour, then get one line of checkout copy approved. If the answer is "we only ever show CHF", drop the column. |
| **2** | One snapshot row per **eligible class** per quote (recommended), or one row for the chosen class only? GSD-LAUNCH §Phase 4.1 is ambiguous: "Returns all classes + a `quote_id` (row in `bookings` …)". | Settle when the Phase 4 `/api/quote` response contract is written. Volume check: 4 classes × quote traffic × 30 min TTL — trivially small for Zurich volume, and the unchosen rows are excellent dispute evidence. Cheap either way; N is recommended. |
| **3** | Round-trip discount percentage. | Comes with the CHF matrix (ADR-006 defers it to Q11). The `lines` shape already carries it; **do not seed a number**, not even in a fixture. |
| **4** | Is a coupon use consumed at **quote** time (reserving) or at **payment** time? Affects whether `coupon_redemptions` FKs a snapshot or a payment. | Owner answer: *should an abandoned quote burn a coupon use?* Check `/Users/koss/Developer/VamosTaxi.eu/docs/build/OWNER-ANSWERS.md`. Recommendation pending that answer: consume at payment, with a soft KV reservation for the 30-min window. |
| **5** | Whether `settings_versions` should version the whole settings row or only the policy fields (recommended: policy only; contacts and toggles stay a mutable singleton). Also: the `settings_versions_one_current` index above is a placeholder — the real "current" is `order by effective_from desc limit 1`. | Grep which settings the ops Settings screen edits (`/Users/koss/Developer/VamosTaxi.eu/app/ops/OpsSettings.dc.html`) against which appear in customer-facing promises. Anything in the second list must be versioned. |
| **6** | Supabase project's actual Postgres version — decides whether `GENERATED ALWAYS AS … STORED` needs the explicit `STORED` (PG18 defaults to VIRTUAL). | `select version();` on the staging project. Writing `stored` explicitly is correct on both, so this is a confirmation, not a blocker. |
| **7** | Sub-rappen per-km rates. If the owner's matrix quotes e.g. CHF 3.855/km, `per_km_rappen integer` truncates. | Read the CHF matrix when it lands. Fix if needed: `per_km_millirappen integer` or `numeric(8,3)`. The **line amount** stays `integer` rappen either way — only the *rate* gains precision. |
| **8** | Whether `booking_events` needs a GIN index on `payload`. | Skip at launch. Add when the ops Detail screen actually needs to search inside payloads; the timeline index `(booking_id, at desc)` covers every launch query. |

---

## Sources

- [Stripe — Supported currencies](https://docs.stripe.com/currencies) (CHF is two-decimal; `amount` in the currency's minor unit; min charge 0.50 CHF)
- [PostgreSQL 18 — Numeric Types](https://www.postgresql.org/docs/current/datatype-numeric.html) (`numeric` recommended for money over floating point; `numeric(p,s)` rounds ties away from zero)
- [PostgreSQL 18 — JSON Types](https://www.postgresql.org/docs/current/datatype-json.html) (jsonb documents should have a "somewhat fixed structure"; row-level lock on update of the whole row)
- [PostgreSQL 18 — Generated Columns](https://www.postgresql.org/docs/current/ddl-generated-columns.html) (virtual by default in 18; expression must be immutable and reference only the current row)
- [PostgreSQL 18 — Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) (RLS is "in addition to" GRANT; table owners bypass unless `FORCE ROW LEVEL SECURITY`; `BYPASSRLS`)
- [PostgreSQL 18 — btree_gist](https://www.postgresql.org/docs/current/btree-gist.html)
- [Postgres.js README](https://github.com/porsager/postgres#readme) (`numeric`/`decimal` returned as string; `postgres.BigInt` custom type; prepared statements on by default)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security) (default deny; `auth.uid()` / `auth.jwt()`; wrap in `select` for initPlan caching; one policy per command)
- [Supabase — Roles](https://supabase.com/docs/guides/database/postgres/roles) (`service_role` carries `bypassrls`)
- [Supabase — Upgrading](https://supabase.com/docs/guides/platform/upgrading) (PG17 default for new projects)
- [Supabase — Postgres Extensions](https://supabase.com/docs/guides/database/extensions) (btree_gist available)