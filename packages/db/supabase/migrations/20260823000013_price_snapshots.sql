-- 20260823000013_price_snapshots.sql
--
-- D-07: price durability is three objects, never a mutable column on bookings and never a
-- live-joined recompute. Rejected shapes: `bookings.price_json` (mutated by dispatch, so the
-- "sold under" price drifts with every edit); FK'd normalised lines (a live FK resolves to
-- TODAY's label/rate, not the one the customer read); SCD-2 recompute (reproduces the INPUTS
-- to a price, not the DECISION itself -- a later change to the rounding rule would silently
-- rewrite history). Supersedes GSD-LAUNCH's `bookings.price_chf numeric` (ADR-014 §2 Q1).
-- QUOTE-05, LIFE-03, Phase 4/7/9 all bind to this shape.
--
-- D-34: every priced column below is nullable `rappen` with no default -- no numeric CHF
-- literal appears anywhere in this file. The owner's CHF matrix is still open; nothing here
-- forces a snapshot to carry an amount before one exists.

create table public.price_snapshots (
  id                   bigint generated always as identity primary key,
  -- NULLABLE, and this is load-bearing. `/api/quote` is public, anonymous and rate-limited
  -- (QUOTE-03/09) and runs BEFORE checkout collects a name or an email, so a NOT NULL booking
  -- FK would force the quote endpoint either to fabricate `contact_name`/`contact_email` to
  -- satisfy the booking row's NOT NULLs, or to burn a `VT-YY-#####` reference on every
  -- anonymous price check. A pre-purchase snapshot is anchored on `quote_id` alone;
  -- `booking_id` is set in the single transaction that creates the booking (the one mutation
  -- the append-only trigger permits in `...19_append_only.sql` (Plan 02-07), NULL -> non-NULL
  -- only).
  booking_id           uuid   references public.bookings(id) on delete restrict,
  supersedes_id        bigint references public.price_snapshots(id) on delete restrict,

  -- The quote endpoint prices every eligible class in one call, one row per class sharing
  -- quote_id (U6 -- Phase 4's `/api/quote` contract decides whether every row or only the
  -- chosen one ships to the customer; this table supports either answer). The customer's pick
  -- sets bookings.price_snapshot_id; the unchosen rows stay as evidence of what was shown and
  -- expire by expires_at.
  quote_id             uuid   not null,
  vehicle_class_id     uuid   not null references public.vehicle_classes(id) on delete restrict,

  -- provenance
  rate_version_id      bigint not null references public.rate_versions(id) on delete restrict,
  -- DERIVED AT INSERT BY TRIGGER, never accepted from the caller. A generated column cannot
  -- reference another table, so this has to be a copy -- but a copy the writer supplies is a
  -- boolean anyone with INSERT can set to `true` against a draft version, which would make
  -- `is_chargeable` true and let a real customer be charged a placeholder amount. The BEFORE
  -- INSERT trigger below (tg_snapshot_rate_version_flag) overwrites whatever was passed with
  -- the truth from rate_versions.
  rate_version_is_live boolean not null,
  settings_version_id  bigint not null references public.settings_versions(id) on delete restrict,
  engine_version       text   not null,            -- 'quote-engine@<git-sha>'
  computed_at          timestamptz not null default now(),
  computed_by          uuid references auth.users(id) on delete set null,   -- null = public endpoint
  source               text not null default 'web'
                       check (source in ('web','ops_phone','modification')),

  -- money the system does arithmetic on
  currency             char(3) not null default 'CHF' check (currency = 'CHF'),
  display_currency     display_currency not null default 'CHF',  -- what the customer saw. D-31
                        -- (ADR-014 §1): the customer sees an amount CONVERTED to their chosen
                        -- display currency, not "only ever CHF" -- so this column is needed,
                        -- not merely harmless. Exact display copy is Phase 7's job.
  subtotal_rappen      rappen check (subtotal_rappen   >= 0),
  surcharges_rappen    rappen check (surcharges_rappen >= 0),
  discount_rappen      rappen check (discount_rappen   >= 0),
  total_rappen         rappen check (total_rappen      >= 0),

  -- typed inputs Phase 9 filters and re-prices on
  distance_km          numeric(7,2) check (distance_km >= 0),
  duration_min         integer      check (duration_min >= 0),
  pax                  smallint not null check (pax  >= 1),
  bags                 smallint not null check (bags >= 0),
  coupon_id            bigint references public.coupons(id) on delete restrict,
  coupon_code          text,     -- as the customer typed it, not as it reads today

  -- D-08: an i18n key + numeric params, never rendered English prose -- the mock's
  -- `label:'Airport pickup'` pattern is not ported, or every German confirmation email
  -- freezes an English price line into an immutable row. Shape in 02-RESEARCH.md Lane 2,
  -- binding on Phase 4; validated here only by `jsonb_typeof(lines) = 'array'`.
  lines                jsonb not null,
  -- D-11: the round-trip discount, when one applies, is a booking-level LINE in this array
  -- (never a separate column) whose percent comes from
  -- `settings_versions.round_trip_discount_percent` (D-35) -- one snapshot, one lines array,
  -- covering both legs.
  policy               jsonb not null,

  expires_at           timestamptz not null,   -- QUOTE-04, the 30-minute lock

  -- QUOTE-10. STORED explicitly (D-28). Both operands are plain columns of this row, so
  -- the expression is IMMUTABLE.
  is_chargeable boolean not null generated always as (total_rappen is not null and rate_version_is_live) stored,

  constraint price_snapshots_total_sums check (
    total_rappen is null
    or total_rappen = coalesce(subtotal_rappen,0)
                    + coalesce(surcharges_rappen,0)
                    - coalesce(discount_rappen,0)
  ),
  -- Either the matrix has landed for this class or it has not. No half-priced rows.
  -- `surcharges_rappen` and `discount_rappen` are in the list because `price_snapshots_total_sums`
  -- coalesces them to 0: a snapshot with a real total and a NULL surcharge component would pass
  -- both checks while recording a fare whose night surcharge was silently omitted, and record
  -- that omission immutably as if it were correct. `num_nonnulls(...) in (0, 4)` is exactly
  -- "all four null or all four non-null" -- functionally identical to the two-clause OR form,
  -- written this way rather than four `is (not) null` clauses.
  constraint price_snapshots_all_or_nothing check (
    num_nonnulls(total_rappen, subtotal_rappen, surcharges_rappen, discount_rappen) in (0, 4)
  ),
  constraint price_snapshots_lines_array check (jsonb_typeof(lines) = 'array'),
  -- LIFE-03: a snapshot without its policy cannot answer a refund. Refuse it at write time.
  -- The five keys are exactly the settings_versions (D-35) values a refund/cancellation
  -- decision reads back out of this row, never the live table, months later.
  constraint price_snapshots_policy_shape check (
       policy ? 'cancellation_tiers' and policy ? 'free_cancel_hours'
   and policy ? 'airport_waiting_minutes' and policy ? 'city_waiting_minutes'
   and policy ? 'settings_version_id'
  ),
  constraint price_snapshots_coupon_pair check ((coupon_id is null) = (coupon_code is null))
);
comment on table public.price_snapshots is 'Insert-only pricing decision: the rules, policy and rate version a booking was sold under. Never updated; a re-price inserts a superseding row (QUOTE-05, LIFE-03).';

/** The flag is the truth about the referenced version, not the caller's opinion of it. */
create or replace function public.tg_snapshot_rate_version_flag() returns trigger
language plpgsql set search_path = '' as $$
begin
  select (status = 'live') into new.rate_version_is_live
    from public.rate_versions where id = new.rate_version_id;
  if new.rate_version_is_live is null then
    raise exception 'rate_version % does not exist', new.rate_version_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

revoke all on function public.tg_snapshot_rate_version_flag() from public;

create trigger price_snapshots_rate_version_flag
  before insert on public.price_snapshots
  for each row execute function public.tg_snapshot_rate_version_flag();

create unique index price_snapshots_quote_class on public.price_snapshots (quote_id, vehicle_class_id);
create index price_snapshots_booking      on public.price_snapshots (booking_id, computed_at desc)
  where booking_id is not null;
-- Unbound quotes: the sweep that expires them, and the lookup that binds one to a booking.
create index price_snapshots_unbound      on public.price_snapshots (quote_id)
  where booking_id is null;
create index price_snapshots_rate_version on public.price_snapshots (rate_version_id);
create index price_snapshots_expiry       on public.price_snapshots (expires_at)
  where total_rappen is not null;

-- Legs SHARE one snapshot; they do not duplicate it (D-11 -- one booking, one shared snapshot,
-- never two snapshots for a return trip, never a `return_at` column, never two bookings). A
-- leg does not get its own rate version, coupon or policy -- those are booking-level facts. It
-- does get its own subtotal, because a customer may cancel only the return leg.
create table public.price_snapshot_legs (
  snapshot_id         bigint   not null references public.price_snapshots(id) on delete restrict,
  leg_seq             smallint not null check (leg_seq in (1,2)),
  booking_leg_id      uuid     references public.booking_legs(id) on delete restrict,
  distance_km         numeric(7,2) check (distance_km >= 0),
  duration_min        integer      check (duration_min >= 0),
  leg_subtotal_rappen rappen       check (leg_subtotal_rappen >= 0),
  primary key (snapshot_id, leg_seq)
);
comment on table public.price_snapshot_legs is 'Per-leg subtotals under one shared booking-level snapshot; the refund basis for a single-leg cancellation.';

-- F-06 / T-02-46 deviation, recorded so a later reviewer does not read this as an oversight:
-- the adversarial review also proposed
--   `create unique index price_snapshots_one_per_booking on price_snapshots (booking_id)
--    where booking_id is not null;`
-- NOT added here. `supersedes_id` and `source = 'modification'` make more than one bound
-- snapshot per booking the DELIBERATE shape of the Phase 9 modification path (a re-price after
-- a flight-delay reschedule inserts a new snapshot and binds the booking to it, without
-- deleting or nulling the old one), and `price_snapshots_booking (booking_id, computed_at
-- desc)` above is a history index for exactly that reason. F-06 is closed instead by binding
-- the charge gate (...014_payments_refunds.sql, tg_payment_matches_snapshot) to
-- `bookings.price_snapshot_id` -- which is tighter than a one-bound-snapshot index would have
-- been, because it names the CHOSEN snapshot, not merely a bound one: the index would still
-- have let a payment cite any one of several rows for a booking with only one bound snapshot
-- so far, while the FK-equality check names the exact row the booking is settling against.
alter table public.bookings
  add constraint bookings_price_snapshot_fk
  foreign key (price_snapshot_id) references public.price_snapshots(id) on delete restrict;
create index bookings_price_snapshot on public.bookings (price_snapshot_id);

/**
 * Denormalised ops-board cache (OPS-01). `bookings.price_total_rappen` is documented on that
 * column (...010_bookings.sql) as "never written by hand, never the truth" -- this is the one
 * place that writes it, copying the CHOSEN snapshot's total the moment `price_snapshot_id` is
 * set or changed. D-34: `total_rappen` is itself nullable until the CHF matrix lands, so the
 * cache stays NULL in a fresh environment exactly like the column it mirrors -- `select ...
 * into` sets the target to NULL when the snapshot has no total, or when `price_snapshot_id` is
 * cleared to NULL (the subquery then matches zero rows, which also yields NULL).
 */
create or replace function public.tg_booking_price_cache() returns trigger
language plpgsql set search_path = '' as $$
begin
  select s.total_rappen into new.price_total_rappen
    from public.price_snapshots s where s.id = new.price_snapshot_id;
  return new;
end $$;

revoke all on function public.tg_booking_price_cache() from public;

create trigger bookings_price_cache
  before update of price_snapshot_id on public.bookings
  for each row execute function public.tg_booking_price_cache();
