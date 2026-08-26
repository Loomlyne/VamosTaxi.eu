-- 20260823000004_settings.sql
--
-- D-10: policy durability splits immutable `settings_versions` (fields a refund or a
-- cancellation depends on, and that ADR-005 requires the sold-under version of) from a
-- mutable `settings` singleton (contacts, toggles, internal dispatch parameters). Supersedes
-- GSD-LAUNCH's one-mutable-settings sketch (Q4, ADR-014 §2) — this migration carries only
-- this two-table shape, never a single mutable settings row for policy fields.

-- Operational configuration. One row, id = 1. Nothing here is a customer promise.
create table public.settings (
  -- `default 1`, NOT `generated always as identity`: the seed is
  -- `insert … (id, …) values (1, …) on conflict (id) do update`, and an identity column rejects
  -- a supplied value with 428C9 unless every seed statement carries OVERRIDING SYSTEM VALUE —
  -- while omitting the id makes the second `db push --include-seed` allocate id=2 and trip the
  -- CHECK. A singleton has no need of a sequence.
  id                            smallint primary key default 1 check (id = 1),
  company                       text not null default '',
  address                       text not null default '',
  uid_number                    text not null default '',   -- Swiss UID
  phone                         text not null default '',
  email                         text not null default '',
  default_lang                  text not null default 'en' check (default_lang in ('en','de','fr','ar')),
  default_currency              display_currency not null default 'CHF',
  accepts_cash                  boolean not null default false,
  accepts_card                  boolean not null default true,
  accepts_twint                 boolean not null default false,
  accepts_invoice                boolean not null default false,
  email_confirmation             boolean not null default true,
  email_reminder                 boolean not null default true,
  sms_reminder                   boolean not null default false,
  ops_alerts                     boolean not null default true,
  -- D-14: the one internal dispatch parameter that defaults to a number, not NULL. It never
  -- renders on a public surface, so ADR-002's seed-NULL discipline does not apply to it. NULL
  -- would coalesce to a zero buffer between two legs assigned to the same chauffeur/vehicle —
  -- under-blocking the OPS-03 exclusion constraint, which is the dangerous direction. 30 is the
  -- safe default until dispatch tunes it.
  chauffeur_turnaround_minutes integer not null default 30 check (chauffeur_turnaround_minutes >= 0),
  updated_at                     timestamptz not null default now()
);
comment on table public.settings is 'D-10: operational singleton — contact details, payment and notification toggles, internal dispatch parameters. Never a customer-facing policy promise; those live in settings_versions.';

-- Versioned customer-facing policy. Immutable. A booking pins the version it was sold under
-- (LIFE-03). D-35 (ADR-014 §5, 2026-08-22, binding on this migration) adds six columns below
-- the ADR-002 waiting-time pair: the manage-link validity window (moved out of `settings` —
-- one key, one fact, now a versioned policy value, not operational config), the round-trip
-- discount, the night-window predicate, the quote lock and the checkout window.
create table public.settings_versions (
  id                            bigint generated always as identity primary key,
  -- The natural key the seed conflicts on. Without it every `db push --include-seed` appends
  -- another policy version dated now(), the "current" version silently changes id on each
  -- deploy, and LIFE-03's promise that a booking pins the policy it was sold under becomes
  -- untestable because the baseline is not stable.
  slug                          text not null unique,
  label                         text not null,
  effective_from                timestamptz not null default now(),
  created_by                    uuid references auth.users(id) on delete set null,

  -- ADR-005: one key, one fact. Six-plus surfaces in four languages read these.
  free_cancel_hours             integer check (free_cancel_hours >= 0),
  modification_deadline_hours   integer check (modification_deadline_hours >= 0),
  min_advance_minutes           integer check (min_advance_minutes >= 0),

  -- ADR-014 §5 (D-35) confirmed 60 / 15 / 180 / 30 days / 10 % / 20:00–06:00 / 30 / 30 — seeded
  -- by the generator (Plan 02-09), never by a migration; columns stay nullable so an
  -- unconfirmed future value can be a labelled gap (ADR-002). This migration writes no number.
  airport_waiting_minutes       integer check (airport_waiting_minutes >= 0),
  city_waiting_minutes          integer check (city_waiting_minutes >= 0),

  -- D-35: moved out of `settings` — the manage-booking link's validity window is a customer
  -- promise a booking is sold under (LIFE-03), not operational config. Lives ONLY here.
  manage_link_validity_days integer check (manage_link_validity_days > 0),
  -- D-35: the round-trip discount rate (ADR-014 §5, closes research U16).
  round_trip_discount_percent numeric(5,2) check (round_trip_discount_percent between 0 and 100),
  -- D-35: the night-surcharge predicate window, Europe/Zurich wall clock (ADR-014 §5 —
  -- 20:00–06:00, not the mock's/research's example 22:00–06:00).
  night_window_start time,
  night_window_end time,
  night_window_tz text not null default 'Europe/Zurich',
  -- D-35: how long a locked quote holds its CHF total before it must be re-quoted.
  quote_lock_minutes integer check (quote_lock_minutes > 0),
  -- D-35: the payment/checkout window, same clock as quote_lock_minutes (ADR-014 §5, closes
  -- research U49).
  checkout_window_minutes integer check (checkout_window_minutes > 0),

  -- [{"from_hours_before":24,"refund_percent":100},
  --  {"from_hours_before":0,"refund_percent":75},
  --  {"no_show":true,"refund_percent":0}]
  cancellation_tiers            jsonb not null default '[]'::jsonb,

  policy_doc_slug                text,   -- pins the legal page version the customer agreed to
  policy_doc_version              text,

  constraint settings_versions_tiers_array check (jsonb_typeof(cancellation_tiers) = 'array')
);
comment on table public.settings_versions is 'D-10/ADR-005: immutable policy history. The current version is the newest effective_from <= now(); a booking pins its own. D-35 (ADR-014 §5) adds the manage-link validity, round-trip discount, night-window and lock/checkout-window columns on top of the free-cancel/waiting/advance columns.';

create index settings_versions_effective on public.settings_versions (effective_from desc);
