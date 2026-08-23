-- 20260823000007_content_and_reviews.sql
--
-- Ordering note: this file precedes …17_audit_log.sql (later in the phase, not yet written)
-- because `tg_audit_row` attaches to both tables below. The draft placed this content at 0018
-- (after the audit log); shipping it here instead is what lets `supabase db reset` apply from
-- zero without a forward reference to an audit trigger function that doesn't exist yet.

/**
 * Replaces vamos-i18n-dict.js at runtime (Phase 6/7). Four languages in the same row, so a
 * missing translation is visible as a NULL, not as a silently-absent key (Law 03). Seeded
 * from apps/web/i18n/messages/{en,de,fr,ar}.json.
 */
create table public.content_strings (
  key         text primary key,          -- dotted, e.g. 'home.hero.title'
  en          text not null,
  de          text,
  fr          text,
  ar          text,
  -- THREE facts, because `apps/web/i18n/messages/en.json` `$meta` carries three lists and they
  -- mean different things. One `translatable` boolean would collapse them and lose the most
  -- important one.
  --
  -- `pending_value` ← $meta.pendingValueKeys (20 keys, e.g. cookies.analytics-provider).
  --   ADR-011 / Law 04: the string is a value the client still owes us, English on purpose, and
  --   the renderer MUST wear a data-tok TBC pill. Drop this flag and, when Phase 6 renders from
  --   this table instead of the JSON, a pending value silently becomes a stated fact on the live
  --   cookie page — the exact failure ADR-002 and Law 04 exist to prevent.
  pending_value    boolean not null default false,
  -- `non_translatable` ← $meta.nonTranslatableKeys (8 keys: brand name, product/class names,
  --   payment marks). ADR-012: literal in every language, marked rather than duplicated.
  non_translatable boolean not null default false,
  -- `no_param_reason` ← $meta.noParamKeys (54 keys, each with a stated reason). I18N-06's
  --   reasoned opt-outs must survive the move, or `scripts/check-i18n-coverage.mjs` cannot be
  --   run against the DB mirror at all. NULL = not opted out.
  no_param_reason  text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);
comment on table public.content_strings is 'Every visible string in en/de/fr/ar, plus the three $meta facts: pending value (Law 04 data-tok), non-translatable (ADR-012), and the reasoned no-param opt-out (I18N-06).';

create table public.reviews (
  id            uuid primary key default extensions.gen_random_uuid(),
  -- The stable natural key the seed conflicts on ('rv-1'…'rv-5' from the mock, later the
  -- platform's own review id). A uuid PK with a `default` has no conflict target, so without
  -- this a second `db push --include-seed` renders ten reviews on the home section, then
  -- fifteen.
  external_ref  text unique,
  source        review_source not null default 'manual',
  author_name   text not null default '',
  author_role   text not null default '',
  body          text not null default '',
  rating        smallint not null default 0 check (rating between 0 and 5),
  route_label   text not null default '',
  -- The mock stored vehicleClass as a free string; here it is a real FK, nullable because an
  -- imported review may not name one.
  vehicle_class_id uuid references public.vehicle_classes(id) on delete set null,
  avatar_path   text,
  source_url    text,
  verified      boolean not null default false,
  published     boolean not null default true,
  sort_order    integer not null default 0,
  -- Derived, never seeded: an imported review's fields came from the platform.
  locked        boolean not null generated always as (source <> 'manual') stored,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.reviews is 'Published customer reviews feeding the home Reviews section. source stays in the schema per ADR-008; no platform import ships for launch.';

create index reviews_published on public.reviews (published, sort_order, created_at desc);
