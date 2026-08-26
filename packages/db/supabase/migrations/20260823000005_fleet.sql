-- 20260823000005_fleet.sql
--
-- DATA-01: vehicle_classes, vehicles, chauffeurs mirror VamosOps.vehicles / .chauffeurs and
-- the VEHICLE_CLASSES class list. D-36 (ADR-014 §6): the seed (Plan 02-09) and pgTAP enforce
-- Economy 3/3, Business 3/3, Van 8/8 — no `first` class ships in V1. The schema itself stays
-- tolerant of the draft's full slug list (including 'first') so a future class does not need a
-- CHECK migration; only the seed and the tests are narrowed.

-- VamosOps VEHICLE_CLASSES becomes a table, not an enum: it carries capacities the quote
-- engine clamps against (QUOTE-02) and a stable slug used as an i18n key stem.
create table public.vehicle_classes (
  id                 uuid primary key default extensions.gen_random_uuid(),
  slug               text not null unique check (slug in ('economy','business','first','van')),
  passenger_capacity smallint not null check (passenger_capacity between 1 and 16),
  luggage_capacity   smallint not null check (luggage_capacity between 0 and 16),
  sort_order         smallint not null default 0,
  active             boolean not null default true
);
comment on table public.vehicle_classes is 'Economy / Business / First / Van with their capacities. Display names live in content_strings (vehicle.class.<slug>), not here. D-36: only economy/business/van are seeded in V1.';

create table public.vehicles (
  id               uuid primary key default extensions.gen_random_uuid(),
  vehicle_class_id uuid not null references public.vehicle_classes(id) on delete restrict,
  model            text not null,
  plate            text not null unique,
  first_registered smallint check (first_registered between 1990 and 2100),
  seats            smallint not null default 3 check (seats between 1 and 16),
  bags             smallint not null default 3 check (bags between 0 and 16),
  status           vehicle_status not null default 'service',
  photo_path       text,                       -- R2 object key; owner blocker #3, nullable
  note             text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.vehicles is 'Fleet vehicles. mock klass string becomes an FK to vehicle_classes.';

create table public.chauffeurs (
  id                 uuid primary key default extensions.gen_random_uuid(),
  -- Optional: a chauffeur may or may not have an auth account.
  user_id            uuid unique references auth.users(id) on delete set null,
  full_name          text not null,
  phone              text not null,
  email              text,
  -- The mock's chauffeur.vehicle string becomes a real FK. A chauffeur's default vehicle;
  -- a leg's actual vehicle is on booking_legs, because dispatch may swap it.
  default_vehicle_id uuid references public.vehicles(id) on delete set null,
  licence_number     text not null,
  licence_expires_on date,
  languages          text[] not null default '{}',   -- ISO codes, e.g. {en,de,fr}
  status             chauffeur_status not null default 'off',
  photo_path         text,
  note               text not null default '',
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.chauffeurs is 'Drivers. mock chauffeur.vehicle string becomes default_vehicle_id FK; languages becomes a real array.';
