# Phase 2 — Proposed Schema (DRAFT FOR REVIEW)

> **This is a draft. No migration has been written, committed or applied.** Nothing under
> `packages/db/` has been created beyond the Phase 1 scaffold (`README.md`, `package.json`).
> The SQL below is the reviewable proposal; the migration files in the closing section are the
> intended layout, not files that exist. Review, then execute.
>
> **Revision 2 — post-review.** Three adversarial passes (security, forward-compatibility,
> correctness) raised 36 findings against revision 1; all 36 are folded in above. The changes with
> the widest blast radius: `citext` is installed (revision 1 could not migrate at all), the Custom
> Access Token Hook now has the policy it needs to read `staff` (revision 1 minted every staff JWT
> without a role claim), staff hold SELECT-only on the ledger tables (revision 1 granted them
> INSERT on `booking_events`), publishing a rate version is admin-only and validated, a quote no
> longer requires a `bookings` row, and the leg exclusion range can no longer be empty. §18 records
> the three places where the applied fix differs from the proposed one.
>
> Companion: `02-RESEARCH.md` in this directory carries the reasoning, the citations and the
> UNCERTAIN list. Where this draft contradicts `docs/build/GSD-LAUNCH.md` §Phase 2, the research
> document says so explicitly and says which we follow — three lines are superseded:
> `bookings.price_chf numeric`, `bookings.manage_token uuid`, and `bookings.assigned_chauffeur_id`.

---

## 0. Conventions held throughout

**Enums.** Native Postgres `ENUM` types for closed, stable domains that appear across tables and
are read by policies or by TypeScript (`supabase gen types` renders them as union types).
`CHECK (x in (…))` for churn-prone taxonomies — event kinds, actor kinds, consent method — because
`ALTER TYPE … ADD VALUE` is cheap but renaming or removing an enum label is not, and event
taxonomies churn most. One convention, held: nothing in this file uses a CHECK where an enum
exists, or an enum where the list is expected to grow unpredictably.

**Money.** One domain, `rappen` (`integer`, CHF minor units), everywhere. No `numeric`, no
per-currency columns (ADR-004). A pending amount is `NULL`, never `'000'` — `'000'` is a rendering
of `NULL`, produced by `VamosLocale.money(null)`.

**Identity.** Every table is `uuid` keyed except append-only logs and versioned pricing rows,
which use `bigint generated always as identity` (monotonic, compact, and a natural read order).
`bookings.reference` is the human key; `bookings.id` is the machine key.

**Timezone.** Every instant is `timestamptz`. Pickup times are entered as Europe/Zurich wall clock
and converted at the edge; the snapshot separately records the local wall-clock string, because
recomputing "was this 23:10?" from a UTC instant months later is a DST bug.

**Copy.** No table holds rendered English prose that a customer will read. Labels are i18n keys
resolved through `content_strings`, which carries `en`, `de`, `fr`, `ar` in the same row (Law 03).
The one deliberate exception is `data-tok`-class internal labels, which stay English (ADR-011).

---

## 1. Extensions

```sql
-- 0001_extensions.sql
create schema if not exists extensions;
grant usage on schema extensions to public;

create extension if not exists pgcrypto  with schema extensions;  -- gen_random_uuid()
create extension if not exists btree_gist with schema extensions; -- equality + range in one GiST index
create extension if not exists citext     with schema extensions; -- case-insensitive email
create extension if not exists pgtap     with schema extensions;  -- supabase test db

-- Every later migration resolves citext, gen_random_uuid() and the btree_gist opclasses through
-- this search_path. Set on the database so a fresh `supabase db reset` session inherits it, and
-- repeated as `set local search_path = public, extensions;` at the top of every migration file
-- so a session that connects with a different default still applies cleanly.
alter database postgres set search_path = "$user", public, extensions;
```

`btree_gist` is what lets `EXCLUDE USING gist (chauffeur_id WITH =, range WITH &&)` mix a scalar
equality column with a range-overlap column. It ships with core Postgres and Supabase demonstrates
it on managed Postgres. Installed into `extensions`, per Supabase convention, not `public`.

`citext` is installed here because `customers.email` and `bookings.contact_email` use it; without
it, migration 0006 aborts with `type "citext" does not exist` and the whole `supabase db reset`
gate red-lines before a single pgTAP file runs. Both columns are written **schema-qualified** as
`extensions.citext` so they do not depend on `search_path` at DDL time. `gist_uuid_ops` (needed by
the `booking_legs` exclusion constraints on a `uuid` column) comes from `btree_gist` and resolves
through the same path — `0001` therefore ends with a pgTAP-checkable assertion that all four
extensions exist, run as the first test in the suite (`extensions.test.sql`).

---

## 2. Roles, the `app` schema, and identity helpers

The security boundary is the **grant**, not the claim. `vamos_edge` — the role Hyperdrive logs in
as for every identity-scoped query — owns nothing and is granted nothing on any table. A query
issued without the transaction wrapper raises `42501 insufficient_privilege`; it does not return
the previous request's rows. That is DATA-06 made structural rather than tested.

```sql
-- 0002_roles_and_helpers.sql
create schema if not exists app;
revoke all on schema app from public;

-- Application roles. NOLOGIN: only ever reached via set_config('role', …, true).
create role vamos_guest nologin;   -- holder of a valid manage token          (DATA-03)
create role vamos_staff nologin;   -- dispatcher / admin                      (DATA-04)
-- anon and authenticated already exist on Supabase.

grant usage on schema app to anon, authenticated, vamos_guest, vamos_staff;

-- The login role for identity-scoped queries. Zero privileges until it SET ROLEs.
create role vamos_edge login password :'vamos_edge_password' noinherit;
grant anon          to vamos_edge with inherit false, set true;
grant authenticated to vamos_edge with inherit false, set true;
grant vamos_guest   to vamos_edge with inherit false, set true;
grant vamos_staff   to vamos_edge with inherit false, set true;

-- The login role for the cached Hyperdrive config: public content only, no memberships.
create role vamos_public login password :'vamos_public_password' noinherit;

-- Nothing new ever leaks a grant to ANY client-facing role by default.
-- `anon` and `authenticated` are in this list deliberately: a Supabase project ships with
-- `alter default privileges in schema public grant all on tables to anon, authenticated,
-- service_role`, so without this line every table these migrations create as `postgres`
-- would carry full CRUD for a customer JWT and the "grant first, policy second" boundary
-- would exist only for the four roles we invented.
alter default privileges in schema public
  revoke all on tables    from vamos_edge, vamos_public, anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from vamos_edge, vamos_public, anon, authenticated;
alter default privileges in schema public
  revoke all on functions from vamos_edge, vamos_public, anon, authenticated;
```

Passwords arrive as psql variables from CI secrets, never as literals in a committed file.
Do **not** `GRANT postgres TO vamos_edge` — `postgres` owns these tables and bypasses every policy.

```sql
-- Identity helpers. Ours, in app.*, so policies do not depend on auth.* internals
-- and pgTAP can test them directly.
create or replace function app.jwt() returns jsonb
  language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function app.uid() returns uuid
  language sql stable set search_path = '' as $$
  select nullif(app.jwt() ->> 'sub', '')::uuid
$$;

/** Hex-encoded sha256 of the manage token supplied on this request, or NULL.
    The raw token never reaches SQL — the Worker hashes it first, so it cannot
    appear in pg_stat_statements or a query log. */
create or replace function app.manage_token_hash() returns bytea
  language sql stable set search_path = '' as $$
  select decode(nullif(current_setting('request.vamos.manage_token_hash', true), ''), 'hex')
$$;

/**
 * Staff authorisation. Three independent conditions, all required:
 *  1. the verified JWT carries a staff app_metadata role                    (DATA-04)
 *  2. the session passed a second factor — enforced in SQL, not only in
 *     middleware, so a forgotten route guard is not a bypass                (AUTH-05)
 *  3. the staff row is still active — a JWT lives up to an hour, so this
 *     makes revocation immediate.
 * SECURITY DEFINER so vamos_staff needs no grant on public.staff.
 */
create or replace function app.is_staff() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(app.jwt() -> 'app_metadata' ->> 'vamos_role', '') in ('dispatcher','admin')
     and coalesce(app.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (select 1 from public.staff s where s.user_id = app.uid() and s.active)
$$;

create or replace function app.is_admin() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(app.jwt() -> 'app_metadata' ->> 'vamos_role', '') = 'admin'
     and coalesce(app.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (select 1 from public.staff s where s.user_id = app.uid() and s.active)
$$;

/** Guest manage-token check, as a SECURITY DEFINER helper rather than an inline subquery.
    An RLS policy expression is evaluated as the INVOKING role, so a policy that reads
    public.booking_access_tokens directly raises `42501 permission denied for table
    booking_access_tokens` for vamos_guest — which holds no grant on that table by design.
    The definer helper is what lets the guest prove possession of a token without ever being
    able to enumerate, read or join the token table. (DATA-03) */
create or replace function app.booking_has_manage_token(p_booking uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.booking_access_tokens t
     where t.booking_id  = p_booking
       and t.token_hash  = app.manage_token_hash()
       and t.revoked_at is null
       and t.expires_at  > now()
  )
$$;

revoke all on function app.is_staff(), app.is_admin() from public;
revoke all on function app.booking_has_manage_token(uuid) from public;
grant execute on function app.is_staff(), app.is_admin() to vamos_staff;
-- `authenticated` also needs app.is_staff(): the Realtime authorization policy on
-- realtime.messages (§14f) runs as `authenticated`, because Realtime connects with the
-- staff member's JWT and never SET ROLEs into vamos_staff. The function only ever reports
-- on the caller's own verified JWT, so granting it wider is not a widening of data access.
grant execute on function app.is_staff() to authenticated;
grant execute on function app.jwt(), app.uid() to anon, authenticated, vamos_guest, vamos_staff;
grant execute on function app.manage_token_hash() to vamos_guest;
grant execute on function app.booking_has_manage_token(uuid) to vamos_guest;
```

`app.booking_has_manage_token` reads `public.booking_access_tokens`, which does not exist until
`0011`. A `language sql` body **is** validated at creation time (`check_function_bodies` is on),
so the function itself ships in `0011` next to the table it reads; only its `REVOKE`/`GRANT` lines
are shown here, with the other identity helpers, because it is part of the same identity surface.
The pgTAP suite asserts it returns `false` — not an error — when the GUC is unset.

---

## 3. Enum types and the money domain

```sql
-- 0003_types.sql

-- VamosOps VEHICLE_STATUS
create type vehicle_status   as enum ('service', 'idle', 'workshop');
-- VamosOps CHAUFFEUR_STATUS
create type chauffeur_status as enum ('shift', 'off', 'leave');
-- VamosOps BOOKING_STATUS. 'no-show' becomes 'no_show' — hyphen dropped for label hygiene;
-- the display string is an i18n key, so no surface is affected.
--
-- 'partially_cancelled' and 'partially_completed' are booking-level ONLY and exist because
-- ADR-006 lets a customer cancel just the return leg while the outbound has already run. Without
-- them, `manage_booking_cancel` would have to flip a fully-earned outbound trip to 'cancelled' on
-- the ops board and in the account list, and the refund basis would be ambiguous between the
-- booking total and `price_snapshot_legs.leg_subtotal_rappen`.
--
-- ROLL-UP RULE, binding on Phase 9 (written here so the shape is not invented later):
--   every leg cancelled                       -> booking 'cancelled'
--   every leg completed                       -> booking 'completed'
--   ≥1 cancelled AND ≥1 completed             -> booking 'partially_completed'
--   ≥1 cancelled AND ≥1 still live (not terminal) -> booking 'partially_cancelled'
--   otherwise the booking keeps its own commercial status (quote/pending/paid/…)
-- Phase 9 lands the trigger that maintains it; Phase 2 lands the vocabulary and the rule.
create type booking_status   as enum ('quote','pending','paid','confirmed','assigned',
                                      'completed','cancelled','partially_cancelled',
                                      'partially_completed','refunded','no_show');
create type leg_direction    as enum ('outbound', 'return');
-- VamosOps CUSTOMER_TYPES. 'corporate' stays in the schema per ADR-008: it records who the
-- customer is, not a payment feature. Pay-by-invoice does not ship in V1.
create type customer_type    as enum ('private', 'corporate');
create type coupon_kind      as enum ('percent', 'amount');
create type surcharge_kind   as enum ('amount', 'percent', 'included');
create type review_source    as enum ('google','tripadvisor','trustpilot','manual');
create type staff_role       as enum ('dispatcher', 'admin');
create type rate_version_status as enum ('draft', 'live', 'retired');
-- Display currencies only. ADR-004: the switch changes the mark, never the number.
create type display_currency as enum ('CHF','EUR','USD','AED');

/**
 * CHF minor units (1/100 CHF).
 * int4 and not numeric: Stripe's `amount` is already an integer minor unit for CHF, so the
 * number in the row IS the number sent to Stripe; postgres.js returns numeric and int8 as
 * strings while int4 arrives as a plain JS number. Ceiling CHF 21'474'836.47.
 *
 * ROUNDING RULE, binding on the Phase 4 engine: each price line is rounded half-up to the
 * whole rappen when computed; a total is the sum of ALREADY-ROUNDED lines, never the rounding
 * of an unrounded sum — otherwise the lines the customer reads do not add up to the total
 * they are charged.
 */
create domain rappen as integer;
```

---

## 4. Settings — a mutable singleton and an immutable policy history

The mock's one `SETTINGS` object splits in two. Contact details and channel toggles are ordinary
mutable configuration. **Policy** — anything a customer was promised — is versioned, because
LIFE-03 requires the policy the booking was sold under, not the one in force today.

```sql
-- 0004_settings.sql

-- Operational configuration. One row, id = 1. Nothing here is a customer promise.
create table public.settings (
  -- `default 1`, NOT `generated always as identity`: the seed is
  -- `insert … (id, …) values (1, …) on conflict (id) do update`, and an identity column rejects
  -- a supplied value with 428C9 unless every seed statement carries OVERRIDING SYSTEM VALUE —
  -- while omitting the id makes the second `db push --include-seed` allocate id=2 and trip the
  -- CHECK. A singleton has no need of a sequence.
  id                          smallint primary key default 1 check (id = 1),
  company                     text not null default '',
  address                     text not null default '',
  uid_number                  text not null default '',   -- Swiss UID
  phone                       text not null default '',
  email                       text not null default '',
  default_lang                text not null default 'en' check (default_lang in ('en','de','fr','ar')),
  default_currency            display_currency not null default 'CHF',
  accepts_cash                boolean not null default false,
  accepts_card                boolean not null default true,
  accepts_twint               boolean not null default false,
  accepts_invoice             boolean not null default false,
  email_confirmation          boolean not null default true,
  email_reminder              boolean not null default true,
  sms_reminder                boolean not null default false,
  ops_alerts                  boolean not null default true,
  -- Internal dispatch parameter, never rendered on a public surface, so ADR-002's
  -- seed-NULL rule does not apply. Seeded 30: NULL would coalesce to a zero buffer
  -- and under-block the exclusion constraint, which is the dangerous direction.
  chauffeur_turnaround_minutes integer not null default 30 check (chauffeur_turnaround_minutes >= 0),
  -- Manage-link validity after the last leg. NULL until the owner names it (UNCERTAIN U5);
  -- issuance must refuse rather than pick a number.
  manage_link_validity_days   integer check (manage_link_validity_days > 0),
  updated_at                  timestamptz not null default now()
);
comment on table public.settings is 'Operational singleton: contact details, payment and notification toggles, internal dispatch parameters.';

-- Versioned customer-facing policy. Immutable. A booking pins the version it was sold under.
create table public.settings_versions (
  id                          bigint generated always as identity primary key,
  -- The natural key the seed conflicts on. Without it every `db push --include-seed` appends
  -- another policy version dated now(), the "current" version silently changes id on each
  -- deploy, and LIFE-03's promise that a booking pins the policy it was sold under becomes
  -- untestable because the baseline is not stable.
  slug                        text not null unique,
  label                       text not null,
  effective_from              timestamptz not null default now(),
  created_by                  uuid references auth.users(id) on delete set null,

  -- ADR-005: one key, one fact. Six-plus surfaces in four languages read these.
  free_cancel_hours           integer check (free_cancel_hours >= 0),
  modification_deadline_hours integer check (modification_deadline_hours >= 0),
  min_advance_minutes         integer check (min_advance_minutes >= 0),

  -- ADR-002: SEED NULL. Never 60 / 15. NULL is what renders the Law 04 TBC pill.
  airport_waiting_minutes     integer check (airport_waiting_minutes >= 0),
  city_waiting_minutes        integer check (city_waiting_minutes >= 0),

  -- [{"from_hours_before":24,"refund_percent":100},
  --  {"from_hours_before":0,"refund_percent":75},
  --  {"no_show":true,"refund_percent":0}]
  cancellation_tiers          jsonb not null default '[]'::jsonb,

  policy_doc_slug             text,   -- pins the legal page version the customer agreed to
  policy_doc_version          text,

  constraint settings_versions_tiers_array check (jsonb_typeof(cancellation_tiers) = 'array')
);
comment on table public.settings_versions is 'Immutable policy history. The current version is the newest effective_from <= now(); a booking pins its own.';

create index settings_versions_effective on public.settings_versions (effective_from desc);
```

---

## 5. Fleet and people

```sql
-- 0005_fleet.sql

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
comment on table public.vehicle_classes is 'Economy / Business / First / Van with their capacities. Display names live in content_strings (vehicle.class.<slug>), not here.';

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
```

```sql
-- 0006_customers_and_staff.sql

create table public.customers (
  id           uuid primary key default extensions.gen_random_uuid(),
  -- Nullable: a guest books without an account (PAY-03) and may claim it later (AUTH-06).
  user_id      uuid unique references auth.users(id) on delete set null,
  full_name    text not null,
  email        extensions.citext not null,   -- schema-qualified: never depends on search_path
  phone        text not null default '',
  type         customer_type not null default 'private',
  company      text not null default '',
  since        date not null default current_date,
  note         text not null default '',
  -- Redact-in-place erasure. The row is never deleted while any FK'd booking is still
  -- inside the Swiss CO Art. 958f 10-year window.
  erased_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.customers is 'Customers, with or without an auth account. Erasure redacts identifiers in place; the row survives for the accounting record.';

create unique index customers_email_unique on public.customers (email) where erased_at is null;
create index customers_user_id on public.customers (user_id) where user_id is not null;

/** `erased_at` is an erasure fact, not a profile field. A customer must never be able to set it
    (it would drop them out of `customers_email_unique`, letting the same person create a second
    row and splitting a decade of Art. 958f history) and must never be able to clear it
    (un-erasing a row Phase 10 redacted). The column-scoped grant in §14a is the first gate;
    this trigger is the one that also binds a compromised ops session. */
-- SECURITY DEFINER because app.is_admin() is granted to vamos_staff only; an `authenticated`
-- session must be able to trip this guard without holding EXECUTE on it.
create or replace function public.tg_customers_erasure_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.erased_at is distinct from old.erased_at
     and not coalesce(app.is_admin(), false) then
    raise exception 'erased_at is set by the erasure routine, not by an ordinary update'
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger customers_erasure_guard before update on public.customers
  for each row execute function public.tg_customers_erasure_guard();

-- `trips` in the mock is a derived count, not a stored column — read it from bookings.

/**
 * Staff. The authoritative role source read by the Custom Access Token Hook on every
 * token mint, so revoking a staff member takes effect on their next token. Never
 * user_metadata: that is writable by the user themselves.                     (AUTH-05, DATA-04)
 */
create table public.staff (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  role          staff_role not null,
  full_name     text not null default '',
  phone         text not null default '',
  lang          text not null default 'en' check (lang in ('en','de','fr','ar')),
  avatar_path   text,
  mfa_enrolled  boolean not null default false,   -- UX gate; the aal2 check in SQL is the security
  digest_email  boolean not null default true,
  active        boolean not null default true,
  invited_by    uuid references auth.users(id) on delete set null,
  invited_at    timestamptz not null default now(),
  accepted_at   timestamptz
);
comment on table public.staff is 'Invitation-only ops accounts. Source of the app_metadata.vamos_role claim; active=false revokes on next token mint.';

-- The hook runs AS `supabase_auth_admin`, which is not a superuser and does not carry BYPASSRLS.
-- RLS is enabled on public.staff in 0019, so the grant alone is not enough: without an explicit
-- policy for this role the hook's SELECT matches no policy, returns zero rows, and every staff
-- JWT is minted with no `vamos_role` — app.is_staff() then returns false for everybody and the
-- entire ops console reads zero rows on day one, with no error to diagnose it by. Supabase's own
-- Custom Access Token Hook documentation requires exactly this policy for exactly this reason.
grant usage  on schema public       to supabase_auth_admin;
grant select on table public.staff  to supabase_auth_admin;
create policy staff_auth_admin_read on public.staff
  as permissive for select to supabase_auth_admin using (true);
```

The `create policy` line above belongs to `0019`/`0022` chronologically (RLS is enabled there), but
it ships in `0006` alongside the grant it completes — a policy may be created before RLS is enabled
on the table, and keeping the two lines together is what stops a future reader deleting one of them.

The Custom Access Token Hook and the invite route are application-side; the hook function itself
ships in this phase:

```sql
-- `set search_path = ''` is mandatory on a hook function (Supabase hardening guidance): the hook
-- executes on the auth server's connection, whose search_path is not ours. Every name is
-- therefore schema-qualified. SECURITY INVOKER is correct — the policy above is what admits it,
-- so a reader can see in one place which role reads staff and under which rule.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable set search_path = '' as $$
declare claims jsonb; v_role text;
begin
  select s.role::text into v_role from public.staff s
   where s.user_id = (event->>'user_id')::uuid and s.active;
  claims := event->'claims';
  if v_role is not null then
    claims := jsonb_set(claims, '{app_metadata,vamos_role}', to_jsonb(v_role));
  end if;
  return jsonb_set(event, '{claims}', claims);
end; $$;

grant execute on function public.custom_access_token_hook to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook from authenticated, anon, public;
```

`staff_hook_claim.test.sql` calls the hook as `supabase_auth_admin` with a seeded active staff row
and asserts the returned claims object contains `app_metadata.vamos_role` — the one test that would
have caught the missing policy. It also asserts the claim is **absent** for `active = false`.

Never write the top-level `role` claim — its schema is constrained to `anon | authenticated` and it
is the *Postgres* role, not the app role.

---

## 6. Pricing — versioned batches

Every priced row belongs to exactly one `rate_versions` batch. Publishing a price change inserts a
new version; it never `UPDATE`s a live row. `pricing_live` is *"exactly one version has
`status='live'`"*, not a boolean anyone can flip.

```sql
-- 0007_rate_versions.sql

create table public.rate_versions (
  id           bigint generated always as identity primary key,
  -- The natural key the seed and the child pricing tables conflict on. An identity id is a fresh
  -- value on every push, so without a slug `insert … on conflict` has no target and each deploy
  -- appends another draft version with a full duplicate matrix under it.
  slug         text not null unique,
  label        text not null,
  status       rate_version_status not null default 'draft',
  note         text not null default '',
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  constraint rate_versions_published_stamp
    check (status = 'draft' or published_at is not null)
);
comment on table public.rate_versions is 'Immutable pricing batches. Exactly one live row = pricing_live. Publishing is the launch trigger (QUOTE-10).';

-- QUOTE-10, structurally: before the owner's CHF matrix is approved, no row is live, so no
-- snapshot is chargeable, so the payment trigger refuses every charge.
create unique index rate_versions_one_live
  on public.rate_versions ((true)) where status = 'live';

/**
 * Publishing is the launch trigger, so it is the most guarded statement in the schema. Three
 * things this trigger enforces that nothing else can:
 *
 *  1. LEGAL TRANSITIONS ONLY — draft→live and live→retired. A live version can never return to
 *     'draft': if it could, tg_pricing_row_frozen would stop raising and the distance_rates /
 *     surcharges rows that immutable price_snapshots cite as `source_row` would become editable,
 *     so a snapshot's provenance would start pointing at mutated rows. That is the exact failure
 *     price_snapshots exists to prevent. 'retired' is terminal.
 *  2. COMPLETENESS — a version may not go live half-priced. Publishing with `surcharges.night`
 *     still NULL would let a 23:10 pickup be quoted and charged with the night surcharge silently
 *     omitted, recorded in an immutable snapshot as if that were correct.
 *  3. ATTRIBUTION — published_at / published_by are stamped here, not trusted from the caller.
 */
create or replace function public.tg_rate_version_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_missing integer;
begin
  if new.status is distinct from old.status then
    if not ((old.status = 'draft' and new.status = 'live')
         or (old.status = 'live'  and new.status = 'retired')) then
      raise exception 'illegal rate_version transition % -> %', old.status, new.status
        using errcode = 'restrict_violation',
              hint = 'Only draft->live and live->retired are legal. Publish a new version instead.';
    end if;
  end if;

  if new.status = 'live' and old.status = 'draft' then
    select count(*) into v_missing from public.distance_rates r
     where r.rate_version_id = new.id and r.available
       and (r.base_fare_rappen is null or r.per_km_rappen is null or r.min_fare_rappen is null);
    if v_missing > 0 then
      raise exception 'rate_version % has % unpriced distance_rates rows', new.id, v_missing
        using errcode = 'restrict_violation';
    end if;

    select count(*) into v_missing from public.surcharges s
     where s.rate_version_id = new.id and s.active and s.kind <> 'included'
       and coalesce(s.amount_rappen, (s.percent * 100)::integer) is null;
    if v_missing > 0 then
      raise exception 'rate_version % has % unpriced surcharges', new.id, v_missing
        using errcode = 'restrict_violation';
    end if;

    select count(*) into v_missing from public.fixed_routes f
     where f.rate_version_id = new.id and f.live and f.price_rappen is null;
    if v_missing > 0 then
      raise exception 'rate_version % has % unpriced live fixed_routes', new.id, v_missing
        using errcode = 'restrict_violation';
    end if;

    new.published_at := now();
    new.published_by := app.uid();
  end if;
  return new;
end $$;

create trigger rate_versions_transition before update on public.rate_versions
  for each row execute function public.tg_rate_version_transition();

-- Service zones for fixed routes. Seeded from the mock's LOCATIONS list.
create table public.service_zones (
  id     uuid primary key default extensions.gen_random_uuid(),
  slug   text not null unique,       -- 'zrh-airport','gva-airport','zurich-city','zermatt'…
  iata   text,                       -- 'ZRH' where it applies; .vt-dir-keep in Arabic
  active boolean not null default true
);
comment on table public.service_zones is 'Named pickup/dropoff zones for fixed routes. Display names live in content_strings (zone.<slug>).';

-- VamosOps `rates`: per class per km. One CHF amount, ADR-004.
create table public.distance_rates (
  id               bigint generated always as identity primary key,
  rate_version_id  bigint not null references public.rate_versions(id) on delete restrict,
  vehicle_class_id uuid   not null references public.vehicle_classes(id) on delete restrict,
  base_fare_rappen rappen check (base_fare_rappen >= 0),  -- NULL until the matrix lands
  per_km_rappen    rappen check (per_km_rappen    >= 0),  -- see UNCERTAIN U8 (sub-rappen)
  min_fare_rappen  rappen check (min_fare_rappen  >= 0),
  max_pax          smallint not null check (max_pax between 1 and 16),
  available        boolean not null default true,
  unique (rate_version_id, vehicle_class_id)
);
comment on table public.distance_rates is 'Per-class distance pricing for one rate version. All amounts NULL until the owner CHF matrix lands.';

-- VamosOps `routes`: fixed point-to-point prices, one CHF amount per class.
create table public.fixed_routes (
  id               bigint generated always as identity primary key,
  rate_version_id  bigint not null references public.rate_versions(id) on delete restrict,
  origin_zone_id   uuid   not null references public.service_zones(id) on delete restrict,
  dest_zone_id     uuid   not null references public.service_zones(id) on delete restrict,
  vehicle_class_id uuid   not null references public.vehicle_classes(id) on delete restrict,
  price_rappen     rappen check (price_rappen >= 0),   -- NULL until the matrix lands
  live             boolean not null default false,
  unique (rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id),
  constraint fixed_routes_distinct_zones check (origin_zone_id <> dest_zone_id)
);
comment on table public.fixed_routes is 'Fixed-price routes for one rate version. The mock stored four currencies per class; ADR-004 collapses that to one CHF amount.';

create table public.surcharges (
  id              bigint generated always as identity primary key,
  rate_version_id bigint not null references public.rate_versions(id) on delete restrict,
  -- Stable identity and i18n key stem: 'airport_pickup','night','waiting_airport',
  -- 'waiting_city','extra_stop','child_seat','meet_greet','ski_rack'.
  -- The mock's English `label` and `rule` strings do NOT port here — they live in
  -- content_strings as price.surcharge.<code>.label / .rule in en/de/fr/ar (Law 03).
  code            text not null,
  kind            surcharge_kind not null default 'amount',
  amount_rappen   rappen       check (amount_rappen >= 0),
  percent         numeric(5,2) check (percent between 0 and 100),
  applies_to      text not null default 'leg' check (applies_to in ('leg','booking')),
  active          boolean not null default true,
  unique (rate_version_id, code),
  constraint surcharges_kind_field check (
       (kind = 'amount'   and percent is null)
    or (kind = 'percent'  and amount_rappen is null)
    or (kind = 'included' and amount_rappen is null and percent is null)
  )
);
comment on table public.surcharges is 'Night, airport, child-seat and similar rules for one rate version. Labels are i18n keys, never stored prose.';

/**
 * A pricing row's AMOUNTS are immutable once its version leaves draft, so every snapshot FK stays
 * honest. Its OFFER AVAILABILITY is not: `fixed_routes.live` and `distance_rates.available` are
 * live ops controls, not pricing data — `app/ops/OpsPricing.dc.html:279` renders a per-route
 * switch hinted "Off keeps the route on file but hides it from the booking flow", and :311 an
 * `Available` switch per class. Freezing those two columns would mean taking Zermatt off sale for
 * a weekend requires publishing a whole new rate version, which would also rewrite the provenance
 * of every snapshot that follows. So the freeze is column-scoped: everything except the
 * availability flag is immutable, and toggling the flag is an ordinary audited UPDATE.
 */
create or replace function public.tg_pricing_row_frozen()
returns trigger language plpgsql as $$
declare v_status rate_version_status; v_old jsonb; v_new jsonb;
begin
  select status into v_status from public.rate_versions
   where id = coalesce(new.rate_version_id, old.rate_version_id);

  if v_status is distinct from 'draft' then
    if tg_op = 'UPDATE' then
      -- Compare every column except the availability flag for this table.
      v_old := to_jsonb(old) - 'live' - 'available';
      v_new := to_jsonb(new) - 'live' - 'available';
      if v_old = v_new then
        return new;   -- availability-only change: allowed, and audited by tg_audit_row
      end if;
    end if;
    raise exception 'pricing rows are immutable once their rate_version leaves draft (%.% id=%)',
      tg_table_schema, tg_table_name, coalesce(new.id, old.id)
      using errcode = 'restrict_violation',
            hint = 'Publish a new rate_version instead of editing a live one. Only `live` / `available` may still be toggled.';
  end if;
  return coalesce(new, old);
end $$;

create trigger distance_rates_frozen before update or delete on public.distance_rates
  for each row execute function public.tg_pricing_row_frozen();
create trigger surcharges_frozen before update or delete on public.surcharges
  for each row execute function public.tg_pricing_row_frozen();
create trigger fixed_routes_frozen before update or delete on public.fixed_routes
  for each row execute function public.tg_pricing_row_frozen();
```

```sql
-- 0008_coupons.sql

create table public.coupons (
  id           bigint generated always as identity primary key,
  code         text not null unique check (code = upper(code)),
  kind         coupon_kind not null default 'percent',
  percent      numeric(5,2) check (percent between 0 and 100),
  amount_rappen rappen check (amount_rappen >= 0),
  valid_from   timestamptz,
  valid_until  timestamptz,
  global_limit integer check (global_limit >= 0),   -- NULL = unlimited
  per_user_limit integer check (per_user_limit >= 0),
  active       boolean not null default true,
  note         text not null default '',
  created_at   timestamptz not null default now(),
  -- NULL is legal, exactly as it is on `surcharges`: a discount value is part of the owner's
  -- unlanded CHF matrix (the mock seeds WELCOME / CORPORATE / SKI with value '00',
  -- `app/vamos-ops-data.js:234-236`). Requiring a number here would mean the only way to register
  -- a code before the discount is agreed is to invent one — the thing §17 forbids outright.
  -- The non-NULL requirement lives where it belongs: the quote engine refuses to APPLY an
  -- unpriced coupon, and redemption re-checks it.
  constraint coupons_kind_field check (
       (kind = 'percent' and amount_rappen is null)
    or (kind = 'amount'  and percent is null)
  ),
  constraint coupons_window check (valid_until is null or valid_from is null or valid_until > valid_from)
);
comment on table public.coupons is 'Discount codes with a window and usage caps (QUOTE-06). The mock stored value as a string; here it is percent or rappen by kind.';

create table public.coupon_redemptions (
  id          bigint generated always as identity primary key,
  coupon_id   bigint not null references public.coupons(id) on delete restrict,
  booking_id  uuid   not null references public.bookings(id) on delete restrict,
  customer_id uuid   references public.customers(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  unique (coupon_id, booking_id)
);
comment on table public.coupon_redemptions is 'One row per applied coupon use; enforces per-user and global caps. Consumed at payment time pending UNCERTAIN U7.';

create index coupon_redemptions_customer on public.coupon_redemptions (coupon_id, customer_id);
```

`coupon_redemptions` references `bookings`, so its migration file runs after `0009`. Listed here for
narrative continuity; the file layout in §16 has the real order.

---

## 7. Bookings, legs, and the reference generator

`bookings` is the commercial record — customer, payment, price, reference, refund. `booking_legs`
carries the dispatchable units, one row for a one-way trip and two for a return (ADR-006).

```sql
-- 0009_bookings.sql

-- ADR-003: VT-YY-####. The year segment partitions the numeric space, so a collision only
-- has to be checked against the current year. Digits stay because dispatchers read
-- references aloud. Enumerable by construction — which is exactly why the manage link is a
-- token and must never become a lookup by reference alone.
create table public.booking_reference_counters (
  year_2      smallint primary key check (year_2 between 0 and 99),
  -- Five digits, from the start. ADR-003's shape already tolerates it (the reference regex is
  -- `[0-9]{4,5}`), and a four-digit ceiling turns "the year's references are used up" into a
  -- total booking outage with no rollback: the counter advance commits in the caller's own
  -- transaction, so it cannot be undone by refusing the 10 001st call.
  last_serial integer not null default 0 check (last_serial between 0 and 99999)
);

/**
 * A reference is allocated by a purchase, never by a price check. Two things enforce that:
 *  - a quote no longer inserts a `bookings` row at all (see price_snapshots.booking_id, §9), so
 *    an anonymous scraper cannot consume the year's space by asking for prices;
 *  - EXECUTE is granted to `service_role` only. A SECURITY DEFINER function is granted to PUBLIC
 *    by default, which would let any session — anon included — call it 100 000 times in one
 *    statement and permanently break booking creation for the rest of the calendar year.
 */
create or replace function public.next_booking_reference() returns text
language plpgsql security definer set search_path = '' as $$
declare y smallint := (extract(year from (now() at time zone 'Europe/Zurich'))::int % 100);
        n integer;
begin
  insert into public.booking_reference_counters (year_2, last_serial)
  values (y, 1)
  on conflict (year_2) do update set last_serial = public.booking_reference_counters.last_serial + 1
  returning last_serial into n;

  if n > 99999 then
    raise exception 'booking reference space exhausted for year %', y
      using errcode = 'restrict_violation',
            hint = 'ADR-003 allows a wider serial within a year without changing the shape.';
  end if;
  return format('VT-%s-%s', lpad(y::text, 2, '0'), lpad(n::text, 4, '0'));
end $$;

revoke all on function public.next_booking_reference() from public;
grant execute on function public.next_booking_reference() to service_role;

create table public.bookings (
  id                  uuid primary key default extensions.gen_random_uuid(),
  reference           text not null unique default public.next_booking_reference()
                        check (reference ~ '^VT-[0-9]{2}-[0-9]{4,5}$'),
  -- Nullable: a guest books without an account (PAY-03); AUTH-06 sets it on claim.
  customer_id         uuid references public.customers(id) on delete restrict,
  -- Contact details as given at booking time, so a guest booking is self-contained and a
  -- later account edit does not rewrite what the confirmation said.
  contact_name        text not null,
  contact_email       extensions.citext not null,
  contact_phone       text not null default '',
  -- PAY-05 / project constraint "idempotent payment AND booking creation". The unique on
  -- booking_payments.stripe_payment_intent_id covers the payment, not the purchase: a
  -- double-clicked checkout or a retried POST creates two bookings, two references and two
  -- PaymentIntents, and the customer can be charged twice with nothing at the DB level in the
  -- way. Client-generated, echoed to Stripe as its `Idempotency-Key`.
  idempotency_key     text,
  -- One quote can become at most one booking. Cheap belt on the same failure.
  quote_id            uuid,
  is_return           boolean not null default false,
  status              booking_status not null default 'quote',
  locale              text not null default 'en' check (locale in ('en','de','fr','ar')),
  display_currency    display_currency not null default 'CHF',
  -- The authoritative price. Replaces GSD-LAUNCH's `price_chf numeric` (superseded).
  price_snapshot_id   bigint,   -- FK added in 0012 once price_snapshots exists
  -- Denormalised CACHE for the ops board's list query (OPS-01). Maintained by trigger.
  -- Never written by hand. Not the truth.
  price_total_rappen  rappen,
  note                text not null default '',
  erased_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.bookings is 'The commercial record: one per purchase, one reference, one price, one Stripe charge. Trip details live on booking_legs (ADR-006).';

create index bookings_customer     on public.bookings (customer_id) where customer_id is not null;
create index bookings_status_time  on public.bookings (status, created_at desc);
create index bookings_reference    on public.bookings (reference);
create unique index bookings_idempotency on public.bookings (idempotency_key)
  where idempotency_key is not null;
create unique index bookings_quote       on public.bookings (quote_id)
  where quote_id is not null;
```

**A `bookings` row is a purchase, not a price check.** `contact_name` and `contact_email` are NOT
NULL and `reference` is allocated on insert, which is only coherent because the quote path does not
touch this table: `app/pages/checkout.dc.html:159` collects the name and the email at the *Details*
step, after pricing, and §9's `price_snapshots.booking_id` is nullable precisely so the quote
endpoint has somewhere to write without inventing contact details or burning a reference. The row
is created in the transaction that binds the chosen snapshot — see §9.

```sql
-- 0010_booking_legs.sql

create table public.booking_legs (
  id                    uuid primary key default extensions.gen_random_uuid(),
  booking_id            uuid not null references public.bookings(id) on delete restrict,
  leg_seq               smallint not null check (leg_seq in (1,2)),
  direction             leg_direction not null,

  pickup_text           text not null,
  pickup_place_id       text,
  pickup_lat            numeric(9,6),
  pickup_lng            numeric(9,6),
  dropoff_text          text not null,
  dropoff_place_id      text,
  dropoff_lat           numeric(9,6),
  dropoff_lng           numeric(9,6),
  origin_zone_id        uuid references public.service_zones(id) on delete set null,
  dest_zone_id          uuid references public.service_zones(id) on delete set null,

  scheduled_at          timestamptz not null,           -- entered as Europe/Zurich wall clock
  scheduled_local       text not null,                  -- 'YYYY-MM-DDTHH:MM', the fact the
                                                        -- customer agreed to; DST-proof for audit
  flight_no             text,
  vehicle_class_id      uuid not null references public.vehicle_classes(id) on delete restrict,
  pax                   smallint not null default 1 check (pax between 1 and 16),
  bags                  smallint not null default 0 check (bags between 0 and 16),
  status                booking_status not null default 'quote',

  assigned_chauffeur_id uuid references public.chauffeurs(id) on delete restrict,
  assigned_vehicle_id   uuid references public.vehicles(id)   on delete restrict,

  -- Snapshotted, never joined live. A generated column cannot subquery another table, and
  -- QUOTE-05's rule applies anyway: a later settings change must not silently recompute a
  -- historical leg's exclusion range.
  estimated_duration_minutes integer check (estimated_duration_minutes >= 0),
  turnaround_buffer_minutes  integer check (turnaround_buffer_minutes  >= 0),

  -- STORED explicitly: PG17 has no VIRTUAL, PG18 defaults to VIRTUAL. Correct on both.
  --
  -- `greatest(…, 30)` on the duration is not a fudge, it is the difference between a constraint
  -- and a no-op. `tstzrange(t, t, '[)')` is the EMPTY range, and `&&` is false for an empty range
  -- against everything — so a leg with no duration and no buffer would be accepted against any
  -- other leg, silently, with no error anywhere. The 30-minute floor means the worst case of an
  -- unestimated leg is *under*-blocking by a bounded amount rather than not blocking at all; the
  -- assignability CHECK below is what stops it happening on an assigned leg in the first place.
  scheduled_range tstzrange generated always as (
    tstzrange(
      scheduled_at,
      scheduled_at + (greatest(coalesce(estimated_duration_minutes, 0), 30)
                    + coalesce(turnaround_buffer_minutes, 0)) * interval '1 minute',
      '[)'
    )
  ) stored,

  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (booking_id, leg_seq),

  -- OPS-03 is only real if the range is real. A leg taken over the phone (OPS-04) or created
  -- during a Mapbox outage has no duration estimate; a ZRH→Zermatt run is ~3 h, and a leg whose
  -- range is just the turnaround buffer lets dispatch put the same driver on a 09:00 Zermatt
  -- transfer and a 09:40 airport pickup with the constraint reporting no conflict. Refuse the
  -- assignment instead: dispatch must enter a duration (the ops assign dialog carries the field,
  -- pre-filled from Mapbox when it is available).
  constraint booking_legs_assignable check (
    (assigned_chauffeur_id is null and assigned_vehicle_id is null)
    or (estimated_duration_minutes is not null and estimated_duration_minutes > 0
        and turnaround_buffer_minutes is not null)
  ),
  constraint booking_legs_range_nonempty check (
    (assigned_chauffeur_id is null and assigned_vehicle_id is null)
    or not isempty(scheduled_range)
  )
);
comment on table public.booking_legs is 'The dispatchable unit: one row one-way, two for a return. Own driver, vehicle, time, flight and status (ADR-006).';

create index booking_legs_booking   on public.booking_legs (booking_id, leg_seq);
create index booking_legs_schedule  on public.booking_legs (scheduled_at)
  where status not in ('cancelled','no_show');
create index booking_legs_chauffeur on public.booking_legs (assigned_chauffeur_id, scheduled_at)
  where assigned_chauffeur_id is not null;
```

### The exclusion constraints (forward-designed for Phase 8, OPS-03)

Two independent partial constraints, never one combined — a combined `(chauffeur_id, vehicle_id)
WITH =` would only block the exact *pair* recurring, not either resource double-booked with a
different partner.

```sql
-- 0010_booking_legs.sql (continued)

-- DEFERRABLE INITIALLY IMMEDIATE: checked per statement by default, so ordinary assignment still
-- fails fast with 23P01 — but a transaction that ends in a legal state may ask for the check to be
-- postponed to COMMIT with `set constraints … deferred`. Two Phase 8/9 paths need that and would
-- otherwise be impossible: swapping two overlapping legs between drivers A and B (the first UPDATE
-- raises even though the final state is legal), and LIFE-06's flight-delay shift, which moves
-- `scheduled_at` into a later assignment's window and must report a conflict, not hard-fail the
-- delay handler mid-way.
alter table public.booking_legs
  add constraint booking_legs_chauffeur_no_overlap
  exclude using gist (assigned_chauffeur_id with =, scheduled_range with &&)
  where (assigned_chauffeur_id is not null and status not in ('cancelled','no_show'))
  deferrable initially immediate;

alter table public.booking_legs
  add constraint booking_legs_vehicle_no_overlap
  exclude using gist (assigned_vehicle_id with =, scheduled_range with &&)
  where (assigned_vehicle_id is not null and status not in ('cancelled','no_show'))
  deferrable initially immediate;

-- Snapshot the buffer the first time EITHER resource is assigned. Firing on the chauffeur column
-- alone leaves a vehicle-only assignment with a NULL buffer, and a vehicle can be double-booked
-- just as expensively as a driver.
create or replace function public.tg_leg_snapshot_buffer()
returns trigger language plpgsql as $$
begin
  if (new.assigned_chauffeur_id is not null or new.assigned_vehicle_id is not null)
     and new.turnaround_buffer_minutes is null then
    select greatest(chauffeur_turnaround_minutes, 1) into new.turnaround_buffer_minutes
      from public.settings where id = 1;
  end if;
  return new;
end $$;

create trigger booking_legs_snapshot_buffer
  before insert or update of assigned_chauffeur_id, assigned_vehicle_id on public.booking_legs
  for each row execute function public.tg_leg_snapshot_buffer();
```

`greatest(chauffeur_turnaround_minutes, 1)` is the second half of the empty-range defence: if the
buffer is ever configured to `0` and a duration is missing, the range would collapse to `[t,t)` and
the constraint would quietly stop constraining. One minute is enough to keep the range non-empty
and is invisible operationally.

Violation raises SQLSTATE **`23P01`** (`exclusion_violation`). The Phase 8 assignment handler tests
`err instanceof postgres.PostgresError && err.code === '23P01'` — never message text — and reads
`err.constraint_name` to tell the chauffeur constraint from the vehicle one, returning **409**, not
500. The `booking_events` row is written in the **same transaction**, so a violation atomically
prevents both the bad assignment and a false audit entry. Rejected *attempts* go to Logpush, not
`booking_events`.

Note for Phase 8: RLS does not weaken this. Exclusion checks run against the full underlying index
regardless of row visibility, which in principle lets a narrow session infer a hidden row — not a
real leak here, because only `dispatcher`/`admin` write to `booking_legs` and that role already
reads every ops row.

---

## 8. The manage token (DATA-03)

A separate table, not a column on `bookings`, so a link can be rotated and reissued without
destroying the audit trail, and so the resend-link support flow has somewhere to live. This
supersedes GSD-LAUNCH's `bookings.manage_token uuid`.

The token is 32 bytes from `crypto.getRandomValues`, base64url in the emailed link. Postgres only
ever sees `sha256(raw bytes)` — the Worker hashes first, so the raw value never reaches
`pg_stat_statements` or a query log. Plain SHA-256, not bcrypt/argon2: 256 bits of unknown entropy
already make offline brute force infeasible, and a slow hash would only add latency and a free DoS
lever. **Reusable, not single-use** — corporate mail gateways prefetch links inside HTML email, and
a burn-on-read token would be consumed by the scanner before the customer ever clicks.

```sql
-- 0011_booking_access_tokens.sql

create table public.booking_access_tokens (
  id           uuid primary key default extensions.gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  purpose      text not null default 'manage' check (purpose in ('manage')),
  token_hash   bytea not null unique,          -- sha256 of the raw token bytes, 32 bytes
  created_at   timestamptz not null default now(),
  -- last leg's scheduled_at + settings.manage_link_validity_days. NOT NULL: issuance must
  -- refuse rather than invent a window while UNCERTAIN U5 is open.
  expires_at   timestamptz not null,
  revoked_at   timestamptz,                    -- claim into an account, fraud, or reissue
  last_used_at timestamptz,                    -- observability only, never part of the check
  use_count    integer not null default 0,
  constraint booking_access_tokens_hash_len check (octet_length(token_hash) = 32)
);
comment on table public.booking_access_tokens is 'Hashed guest manage-link bearer tokens. Reusable, revocable, rotatable. Read access is via RLS; mutations go through SECURITY DEFINER functions.';

create index booking_access_tokens_booking on public.booking_access_tokens (booking_id)
  where revoked_at is null;

-- The read-side helper the §14b policy calls. Declared here, next to the table it reads, because
-- a `language sql` body is validated at creation time; its grants are in §2 with the other
-- identity helpers.
create or replace function app.booking_has_manage_token(p_booking uuid) returns boolean
  language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.booking_access_tokens t
     where t.booking_id  = p_booking
       and t.token_hash  = app.manage_token_hash()
       and t.revoked_at is null
       and t.expires_at  > now()
  )
$$;
revoke all on function app.booking_has_manage_token(uuid) from public;
grant execute on function app.booking_has_manage_token(uuid) to vamos_guest;
```

**Reads** go through the RLS policy in §14 under the `vamos_guest` role. **Mutations** go through
`SECURITY DEFINER` functions, because token validation, the booking state-machine check, the write
and the `booking_events` row must be one atomic unit with `FOR UPDATE`, not a check-then-act round
trip from the Worker:

```sql
/**
 * p_leg_seq NULL cancels the whole booking; p_leg_seq = 1|2 cancels one leg. ADR-006 requires
 * the second form — a customer may cancel the return while the outbound has already run — and
 * `booking_refunds.booking_leg_id` and `price_snapshot_legs.leg_subtotal_rappen` exist for it.
 * Without the argument, cancelling a return would flip a completed, fully-earned outbound trip
 * to 'cancelled' on the ops board and leave the refund basis ambiguous.
 */
create or replace function public.manage_booking_cancel(p_token_hash bytea,
                                                        p_leg_seq smallint default null)
returns table (booking_id uuid, refund_percent numeric)
language plpgsql security definer set search_path = '' as $$
declare v public.bookings%rowtype; v_live integer; v_done integer; v_cut integer;
begin
  select b.* into v
    from public.bookings b
    join public.booking_access_tokens t on t.booking_id = b.id
   where t.token_hash = p_token_hash
     and t.revoked_at is null
     and t.expires_at > now()
   for update of b;

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';   -- same generic error for every failure
  end if;
  if v.status not in ('pending','paid','confirmed','assigned','partially_completed',
                      'partially_cancelled') then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  update public.booking_legs set status = 'cancelled'
   where booking_id = v.id
     and status not in ('completed','no_show','cancelled')
     and (p_leg_seq is null or leg_seq = p_leg_seq);
  get diagnostics v_cut = row_count;
  if v_cut = 0 then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  -- Roll the booking status up from its legs (§3). Never a blanket 'cancelled'.
  select count(*) filter (where status not in ('cancelled','completed','no_show')),
         count(*) filter (where status in ('completed','no_show'))
    into v_live, v_done
    from public.booking_legs where booking_id = v.id;

  update public.bookings set status = case
      when v_live = 0 and v_done = 0 then 'cancelled'
      when v_live = 0 and v_done > 0 then 'partially_completed'
      else 'partially_cancelled' end
   where id = v.id;

  update public.booking_access_tokens
     set last_used_at = now(), use_count = use_count + 1 where token_hash = p_token_hash;

  -- The refund percent comes from the snapshot's stored policy, never today's settings (LIFE-03),
  -- and its basis is the leg subtotal when p_leg_seq is given.
  return query select v.id, null::numeric;   -- Phase 9 fills the tier calculation
end $$;

revoke all on function public.manage_booking_cancel(bytea, smallint) from public;
grant execute on function public.manage_booking_cancel(bytea, smallint) to vamos_guest;
```

`AUTH-06` (Phase 8) revokes every live token for a booking **in the same transaction** as setting
`bookings.customer_id`. Terminal booking status does **not** revoke — the guest should still see a
receipt; mutability is gated on booking state instead.

Every failure — wrong token, expired, revoked, no such booking — must surface as the **same generic
message and status** at the API, so there is no oracle distinguishing "booking exists, token wrong"
from "no such booking".

---

## 9. The price / policy snapshot

One insert-only row per pricing decision, at the **booking** level (one row covers both legs of a
return). Typed rappen columns for the money the system computes on; `jsonb` for the derivation a
human reads and for the policy the refund engine will quote in month 7.

```sql
-- 0012_price_snapshots.sql

create table public.price_snapshots (
  id                   bigint generated always as identity primary key,
  -- NULLABLE, and this is load-bearing. `/api/quote` is public, anonymous and rate-limited
  -- (QUOTE-03/09) and runs BEFORE checkout collects a name or an email, so a NOT NULL booking FK
  -- would force the quote endpoint either to fabricate `contact_name`/`contact_email` to satisfy
  -- the booking row's NOT NULLs, or to burn a `VT-YY-#####` reference on every anonymous price
  -- check. A pre-purchase snapshot is anchored on `quote_id` alone; `booking_id` is set in the
  -- single transaction that creates the booking (the one mutation §10's append-only trigger
  -- permits, and only NULL → non-NULL).
  booking_id           uuid   references public.bookings(id) on delete restrict,
  supersedes_id        bigint references public.price_snapshots(id) on delete restrict,

  -- The quote endpoint prices every eligible class in one call, one row per class sharing
  -- quote_id. The customer's pick sets bookings.price_snapshot_id; the unchosen rows stay
  -- as evidence of what was shown and expire by expires_at. (UNCERTAIN U6.)
  quote_id             uuid   not null,
  vehicle_class_id     uuid   not null references public.vehicle_classes(id) on delete restrict,

  -- provenance
  rate_version_id      bigint not null references public.rate_versions(id) on delete restrict,
  -- DERIVED AT INSERT BY TRIGGER, never accepted from the caller. A generated column cannot
  -- reference another table, so this has to be a copy — but a copy the writer supplies is a
  -- boolean anyone with INSERT can set to `true` against a draft version, which would make
  -- `is_chargeable` true and let a real customer be charged a placeholder amount. The BEFORE
  -- INSERT trigger below overwrites whatever was passed with the truth from rate_versions.
  rate_version_is_live boolean not null,
  settings_version_id  bigint not null references public.settings_versions(id) on delete restrict,
  engine_version       text   not null,            -- 'quote-engine@<git-sha>'
  computed_at          timestamptz not null default now(),
  computed_by          uuid references auth.users(id) on delete set null,   -- null = public endpoint
  source               text not null default 'web'
                       check (source in ('web','ops_phone','modification')),

  -- money the system does arithmetic on
  currency             char(3) not null default 'CHF' check (currency = 'CHF'),
  display_currency     display_currency not null default 'CHF',  -- what the customer saw (U9)
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

  lines                jsonb not null,   -- shape in 02-RESEARCH.md §Lane 2, binding on Phase 4
  policy               jsonb not null,

  expires_at           timestamptz not null,   -- QUOTE-04, the 30-minute lock

  -- QUOTE-10. STORED explicitly; both operands are plain columns of this row.
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
  -- `surcharges_rappen` and `discount_rappen` are in the list because `price_snapshots_total_sums`
  -- coalesces them to 0: a snapshot with a real total and a NULL surcharge component would pass
  -- both checks while recording a fare whose night surcharge was silently omitted, and record
  -- that omission immutably as if it were correct.
  constraint price_snapshots_all_or_nothing check (
    (total_rappen is null and subtotal_rappen is null
     and surcharges_rappen is null and discount_rappen is null)
    or (total_rappen is not null and subtotal_rappen is not null
        and surcharges_rappen is not null and discount_rappen is not null)
  ),
  constraint price_snapshots_lines_array check (jsonb_typeof(lines) = 'array'),
  -- LIFE-03: a snapshot without its policy cannot answer a refund. Refuse it at write time.
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
language plpgsql as $$
begin
  select (status = 'live') into new.rate_version_is_live
    from public.rate_versions where id = new.rate_version_id;
  if new.rate_version_is_live is null then
    raise exception 'rate_version % does not exist', new.rate_version_id
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

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

-- Legs SHARE one snapshot; they do not duplicate it. A leg does not get its own rate version,
-- coupon or policy — those are booking-level facts. It does get its own subtotal, because a
-- customer may cancel only the return leg.
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

alter table public.bookings
  add constraint bookings_price_snapshot_fk
  foreign key (price_snapshot_id) references public.price_snapshots(id) on delete restrict;
create index bookings_price_snapshot on public.bookings (price_snapshot_id);
```

### Payments, refunds, and the charge gate

```sql
-- 0013_payments_refunds.sql

create table public.booking_payments (
  id                       bigint generated always as identity primary key,
  booking_id               uuid   not null references public.bookings(id) on delete restrict,
  snapshot_id              bigint not null references public.price_snapshots(id) on delete restrict,
  stripe_payment_intent_id text   not null unique,      -- PAY-05 idempotency
  charged_rappen           rappen not null check (charged_rappen > 0),
  charged_currency         char(3) not null default 'CHF' check (charged_currency = 'CHF'),
  status                   text not null check (status in
                             ('requires_payment','succeeded','failed','canceled')),
  captured_at              timestamptz,
  created_at               timestamptz not null default now()
);
comment on table public.booking_payments is 'Stripe settlement facts. The charged amount is read from the snapshot, never from a request body.';

/**
 * The server-authoritative charge gate. A CHECK cannot reach another table, so this is a
 * trigger — and it holds even if a Worker deploy is stale, an ops user runs raw SQL, or the
 * checkout route is bypassed entirely. This is the layer of QUOTE-10 with no off switch.
 *
 * WHERE IN THE FLOW THIS FIRES, and why it matters: the `booking_payments` row is inserted when
 * the PaymentIntent is CREATED, with `status='requires_payment'`. The webhook does not insert; it
 * only UPDATEs `status`/`captured_at` under the column whitelist below. That ordering is what
 * makes the `expires_at` check safe. If the gate ran on the webhook path instead, a customer who
 * sat in the 3-D Secure / TWINT sheet for 31 minutes would be charged by Stripe and then have the
 * settlement row refused by our own trigger — money taken, booking stuck 'pending' forever, and
 * every Stripe retry failing the same way.
 *
 * The snapshot's `expires_at` is extended to cover the payment window at intent creation, in the
 * same transaction as this insert; QUOTE-04 is enforced at the moment the customer commits to pay,
 * which is the moment it means something.
 */
create or replace function public.tg_payment_matches_snapshot()
returns trigger language plpgsql as $$
declare s public.price_snapshots%rowtype; v_status rate_version_status;
begin
  select * into s from public.price_snapshots where id = new.snapshot_id;

  if not s.is_chargeable then
    raise exception 'snapshot % is not chargeable (total=%, rate_version_is_live=%)',
      s.id, s.total_rappen, s.rate_version_is_live
      using errcode = 'restrict_violation',
            hint = 'QUOTE-10: no rate_version is live, or this class has no priced matrix row.';
  end if;
  -- Re-read the version at charge time, not only the flag copied at quote time. A quote priced
  -- under a version that has since been RETIRED is still honoured (the customer was shown that
  -- price minutes ago and the version's rows are frozen); a version that never left DRAFT can
  -- never be charged against, whatever any copied flag says.
  select status into v_status from public.rate_versions where id = s.rate_version_id;
  if v_status = 'draft' then
    raise exception 'snapshot % cites rate_version % which is still draft', s.id, s.rate_version_id
      using errcode = 'restrict_violation';
  end if;
  -- QUOTE-04: an expired quote is refused when the customer commits to pay, by the server, not
  -- merely hidden in the UI.
  if s.expires_at <= now() then
    raise exception 'quote % expired at %', s.id, s.expires_at using errcode = 'restrict_violation';
  end if;
  if new.charged_rappen is distinct from s.total_rappen then
    raise exception 'charge % does not match snapshot % total %',
      new.charged_rappen, s.id, s.total_rappen using errcode = 'restrict_violation';
  end if;
  if s.booking_id is null or new.booking_id is distinct from s.booking_id then
    raise exception 'snapshot % belongs to booking %, not %', s.id, s.booking_id, new.booking_id
      using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger booking_payments_match_snapshot
  before insert on public.booking_payments
  for each row execute function public.tg_payment_matches_snapshot();

/**
 * The UPDATE-column whitelist §10 promises. Without it, the only gate on this table is INSERT-only,
 * so a staff session (or a stolen staff JWT) can `update booking_payments set charged_rappen=100,
 * status='succeeded'` and the amount/snapshot reconciliation the design advertises never runs on
 * the mutated row — day revenue and Stripe dispute evidence then disagree with Stripe itself.
 */
create or replace function public.tg_payment_update_whitelist()
returns trigger language plpgsql as $$
begin
  if to_jsonb(new) - 'status' - 'captured_at'
     is distinct from to_jsonb(old) - 'status' - 'captured_at' then
    raise exception 'booking_payments: only status and captured_at may be updated'
      using errcode = 'restrict_violation',
            hint = 'A corrected settlement is a new row plus a compensating booking_event.';
  end if;
  return new;
end $$;

create trigger booking_payments_column_whitelist
  before update on public.booking_payments
  for each row execute function public.tg_payment_update_whitelist();

create table public.booking_refunds (
  id               bigint generated always as identity primary key,
  booking_id       uuid   not null references public.bookings(id) on delete restrict,
  snapshot_id      bigint not null references public.price_snapshots(id) on delete restrict,
  payment_id       bigint not null references public.booking_payments(id) on delete restrict,
  booking_leg_id   uuid   references public.booking_legs(id) on delete restrict,  -- null = whole booking
  reason           text   not null check (reason in
                     ('customer_cancel','ops_cancel','no_driver','modification_credit','no_show')),
  basis_rappen     rappen not null check (basis_rappen >= 0),
  refund_percent   numeric(5,2) not null check (refund_percent between 0 and 100),
  refund_rappen    rappen not null check (refund_rappen >= 0),
  -- LIFE-03 made self-evident: the exact tier object copied out of snapshot.policy at decision
  -- time, plus the hours-before that selected it. This one row answers "why 75 % of CHF 000?".
  tier_applied     jsonb  not null,
  hours_before     numeric(8,2) not null,
  stripe_refund_id text unique,
  decided_by       uuid references auth.users(id) on delete set null,
  decided_at       timestamptz not null default now(),
  constraint booking_refunds_not_more_than_basis check (refund_rappen <= basis_rappen)
);
comment on table public.booking_refunds is 'One row per refund decision, carrying the tier it was calculated from — not the tier in force today (LIFE-03).';

/**
 * Stripe webhook deduplication (Phase 5). "Insert, and discard a duplicate" is only idempotent if
 * the insert is the last thing that can fail — and it is not. Real sequence: Stripe delivers
 * `payment_intent.succeeded`, we insert the ledger row, then the Queue publish or the
 * `booking_payments` update throws (or the isolate is evicted). Stripe retries; the retry hits the
 * primary key, is "discarded silently" with a 200, and the customer has been charged while the
 * booking stays 'pending' forever with nothing recording that the event was never processed.
 *
 * So the ledger records ATTEMPTED and PROCESSED separately: dedupe on `insert … on conflict (id)
 * do nothing`, but skip the handler only when the existing row has `processed_at is not null`.
 * `stripe_created` + `object_id` are what let PAY-05's out-of-order case be detected at all — a
 * `payment_intent.canceled` delivered after `succeeded` is only visible as out-of-order if the
 * handler orders on Stripe's own timestamp per object, never on our `received_at`.
 */
create table public.stripe_events (
  id             text primary key,           -- Stripe's own event id
  type           text not null,
  stripe_created timestamptz not null,       -- Stripe's `created`, the ordering key
  object_id      text,                       -- pi_… / re_… — the object the event is about
  received_at    timestamptz not null default now(),
  processed_at   timestamptz,
  attempts       integer not null default 0,
  last_error     text,
  payload        jsonb not null
);
comment on table public.stripe_events is 'Webhook ledger: dedupe by event id, but a replay re-runs the handler unless processed_at is set. Ordering is (object_id, stripe_created), never received_at.';

-- The cron sweep that finds events accepted but never finished.
create index stripe_events_unprocessed on public.stripe_events (received_at)
  where processed_at is null;
create index stripe_events_object      on public.stripe_events (object_id, stripe_created)
  where object_id is not null;
```

### The notification ledger (PAY-05's third clause, LIFE-05)

```sql
-- 0013_payments_refunds.sql (continued)

/**
 * PAY-05 is "cannot double-charge, double-confirm OR double-send an email". Webhook dedupe covers
 * the first two and nothing covers the third: a Resend call that times out but actually delivered
 * and is then retried sends the confirmation twice, and the Phase 9 reminder cron has nothing to
 * consult to know whether leg X's 24-hour reminder already went out, so every tick re-sends it.
 * Ship the ledger now — it is a plain additive table today and a live-data reconciliation later.
 */
create table public.booking_notifications (
  id                  bigint generated always as identity primary key,
  booking_id          uuid not null references public.bookings(id) on delete restrict,
  booking_leg_id      uuid references public.booking_legs(id) on delete restrict,
  kind                text not null check (kind in ('confirmation','reminder_24h','assignment',
                        'cancellation','refund','review_request','manage_link_resend')),
  channel             text not null default 'email' check (channel in ('email','sms')),
  locale              text not null check (locale in ('en','de','fr','ar')),
  template_version    text not null default '',
  provider_message_id text unique,
  -- booking_id || ':' || kind || ':' || coalesce(booking_leg_id::text,'') — the send is claimed by
  -- inserting this row, so two workers racing the same reminder produce one email.
  dedupe_key          text not null unique,
  sent_at             timestamptz,
  failed_at           timestamptz,
  error               text,
  created_at          timestamptz not null default now()
);
comment on table public.booking_notifications is 'One row per outbound message, claimed before sending. dedupe_key makes a retried send a no-op (PAY-05, LIFE-05).';

create index booking_notifications_pending on public.booking_notifications (created_at)
  where sent_at is null and failed_at is null;
create index booking_notifications_booking on public.booking_notifications (booking_id, created_at desc);
```

---

## 10. Booking events and the generic audit log (DATA-08)

Two tables, not one, and not N per-domain tables.

`booking_events` is **application-written inside the state-change transaction using the service
role**, never by a trigger: a trigger sees an old/new diff but cannot express *why* ("customer
cancelled" and "no-show sweep cancelled" both just flip `status`), and cannot see an actor for a
Stripe webhook or a cron job running without a JWT. It survives tampering by having **no
INSERT/UPDATE/DELETE policy at all** for any client-facing role, so even a compromised `admin` JWT
cannot forge or delete an event. Corrections are compensating events.

`price_snapshots` and `booking_events` are not the same object. The snapshot answers *what was
true* (contains money, authoritative, ~1–2 rows per booking). The event answers *what happened, who
did it, when* (contains no money, **references** a snapshot, ~10–30 rows per booking).

```sql
-- 0014_booking_events.sql

create table public.booking_events (
  id             bigint generated always as identity primary key,
  booking_id     uuid not null references public.bookings(id) on delete restrict,
  booking_leg_id uuid references public.booking_legs(id) on delete restrict,
  at             timestamptz not null default now(),
  -- CHECK, not an enum: event taxonomies churn most, and renaming an enum label is painful.
  kind           text not null check (kind in (
                   'booking.created','booking.status_changed','booking.modified','booking.claimed',
                   'price.quoted','price.repriced','price.superseded',
                   'payment.intent_created','payment.succeeded','payment.failed',
                   'refund.requested','refund.issued',
                   'assignment.chauffeur_set','assignment.vehicle_set','assignment.cleared',
                   'flight.delayed','note.added')),
  actor_kind     text not null check (actor_kind in ('customer','guest','staff','system','stripe','cron')),
  actor_id       uuid references auth.users(id) on delete set null,
  -- Frozen at write. The timeline must still read "Sara, dispatch" after Sara's row is gone;
  -- a join to a live profile row would render blank or, worse, someone else.
  actor_label    text not null default '',
  snapshot_id    bigint references public.price_snapshots(id) on delete restrict,
  payment_id     bigint references public.booking_payments(id) on delete restrict,
  refund_id      bigint references public.booking_refunds(id) on delete restrict,
  from_status    booking_status,
  to_status      booking_status,
  payload        jsonb not null default '{}'::jsonb,

  -- A price event that cannot point at the price it changed is not an audit trail.
  constraint booking_events_price_has_snapshot check (
    kind not like 'price.%' or snapshot_id is not null),
  constraint booking_events_status_pair check (
    kind <> 'booking.status_changed' or (from_status is not null and to_status is not null))
);
comment on table public.booking_events is 'Append-only booking timeline: who, what, when. References a snapshot for price events; never contains money (DATA-08).';

create index booking_events_timeline on public.booking_events (booking_id, at desc);
```

```sql
-- 0015_audit_log.sql

-- Generic, trigger-written audit for the operational tables ops edits directly. A trigger is
-- right HERE (unlike booking_events) because these are plain CRUD with no semantic "why"
-- beyond the diff, and a trigger fires even if a future ops screen forgets an audit helper.
create table public.audit_log (
  id           bigint generated always as identity primary key,
  table_name   text not null,
  record_id    text not null,
  action       text not null check (action in ('insert','update','delete')),
  actor_kind   text not null check (actor_kind in ('staff','system')),
  actor_id     uuid references auth.users(id) on delete set null,
  before_value jsonb,
  after_value  jsonb,
  created_at   timestamptz not null default now()
);
comment on table public.audit_log is 'Trigger-written before/after diffs for operational tables: settings, coupons, fleet, rates, routes, surcharges, content strings, reviews.';

create index audit_log_record on public.audit_log (table_name, record_id, created_at desc);

create or replace function public.tg_audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (table_name, record_id, action, actor_kind, actor_id,
                                before_value, after_value)
  values (tg_table_name,
          coalesce(new.id::text, old.id::text),
          lower(tg_op),
          case when app.uid() is null then 'system' else 'staff' end,
          app.uid(),
          case when tg_op in ('update','delete') then to_jsonb(old) end,
          case when tg_op in ('insert','update') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

-- Attached to: settings, settings_versions, coupons, chauffeurs, vehicles, vehicle_classes,
-- distance_rates, fixed_routes, surcharges, rate_versions, content_strings, reviews, staff,
-- service_zones, and **customers** — the last one because §14a lets a signed-in customer edit
-- their own profile columns, and a self-service edit to a row ops also curates has to be
-- attributable. `before_value`/`after_value` on customers are the redaction evidence Phase 10
-- needs as well.
create trigger audit_settings after insert or update or delete on public.settings
  for each row execute function public.tg_audit_row();
-- … one per table, generated by a DO block in the migration.
```

### Append-only enforcement — four layers, because three are bypassable

```sql
-- 0016_append_only.sql

create or replace function public.tg_append_only() returns trigger
language plpgsql as $$
begin
  -- The ONE permitted mutation in the whole append-only set: binding a pre-purchase quote
  -- snapshot to the booking it became. NULL → non-NULL on `booking_id`, nothing else on the row,
  -- and never the reverse. Everything the snapshot asserts about price, policy and provenance is
  -- still immutable; only the fact "this quote was bought" is written after the fact.
  if tg_op = 'UPDATE' and tg_table_name = 'price_snapshots'
     and old.booking_id is null and new.booking_id is not null
     and to_jsonb(new) - 'booking_id' = to_jsonb(old) - 'booking_id' then
    return new;
  end if;

  raise exception 'append-only table %.%: % is not permitted',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation',
          hint = 'Insert a superseding row; never mutate history.';
end $$;

create trigger price_snapshots_append_only     before update or delete on public.price_snapshots
  for each row execute function public.tg_append_only();
create trigger price_snapshot_legs_append_only before update or delete on public.price_snapshot_legs
  for each row execute function public.tg_append_only();
create trigger booking_events_append_only      before update or delete on public.booking_events
  for each row execute function public.tg_append_only();
create trigger booking_refunds_append_only     before update or delete on public.booking_refunds
  for each row execute function public.tg_append_only();
create trigger audit_log_append_only           before update or delete on public.audit_log
  for each row execute function public.tg_append_only();
create trigger consent_log_append_only         before update or delete on public.consent_log
  for each row execute function public.tg_append_only();
-- booking_payments is the exception: Stripe legitimately moves a PaymentIntent through
-- statuses. It gets an UPDATE-column whitelist (status, captured_at) instead of a hard block.

revoke update, delete on public.price_snapshots, public.price_snapshot_legs,
                          public.booking_events, public.booking_refunds,
                          public.audit_log, public.consent_log
  from anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public, service_role;

-- The single exception, column-scoped: binding a quote snapshot to the booking it became. The
-- trigger above is what makes this narrow (NULL → non-NULL on that column and nothing else);
-- this grant is what makes it possible at all, since the blanket revoke above also covers the
-- service role that performs it.
grant update (booking_id) on public.price_snapshots to service_role;

alter table public.price_snapshots     force row level security;
alter table public.price_snapshot_legs force row level security;
alter table public.booking_events      force row level security;
alter table public.booking_refunds     force row level security;
alter table public.audit_log           force row level security;
alter table public.consent_log         force row level security;
```

Layers 2–4 are bypassed by `service_role` (`BYPASSRLS`) and by superusers; **only the trigger
catches a migration or a `psql` session running as `postgres`**. That is why all four ship together
and why the trigger is not redundant with the grants.

---

## 11. Consent log

Server-side and provable, and it must survive an account that does not exist yet. The anchor is
`consent_subject_id`, set in a first-party functional cookie **before** any account exists — a
cookie itself exempt from consent-gating because it exists to *prove* consent. Signing up inserts a
**new** row with `customer_id` set; nothing is ever rewritten. Withdrawal is a new row.

```sql
-- 0015a_consent_log.sql  (BEFORE 0016: that file attaches this table's append-only trigger)

create table public.consent_log (
  id                 bigint generated always as identity primary key,
  consent_subject_id uuid not null,
  customer_id        uuid references public.customers(id) on delete set null,
  booking_id         uuid references public.bookings(id)  on delete set null,
  policy_version     text not null,
  -- CHECK, not an enum: the banner's interaction vocabulary may grow.
  method             text not null check (method in
                       ('accept_all','reject_all','save_choices','settings_change')),
  -- The four categories in app/pages/CookieBanner.dc.html, no more and no fewer.
  necessary          boolean not null default true,
  functional         boolean not null default false,
  analytics          boolean not null default false,
  marketing          boolean not null default false,
  locale             text not null check (locale in ('en','de','fr','ar')),
  user_agent         text,
  ip_truncated       inet,     -- last octet / /64 zeroed BEFORE insert; never a raw IP (U10)
  recorded_at        timestamptz not null default now()
);
comment on table public.consent_log is 'Append-only proof of cookie consent, anchored on an anonymous subject id so a guest choice survives having no account (nFADP / GDPR).';

create index consent_log_subject  on public.consent_log (consent_subject_id, recorded_at desc);
create index consent_log_customer on public.consent_log (customer_id, recorded_at desc)
  where customer_id is not null;
```

Retention: a row tied to a `booking_id` that is itself inside the Swiss CO Art. 958f 10-year window
is kept at least as long as that booking — it is part of the record's evidentiary basis, so it does
not get a shorter TTL. On erasure, `customer_id → NULL`; the row itself stays.

---

## 12. Content and reviews

```sql
-- 0018_content_and_reviews.sql

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
```

---

## 13. Row-level security — enabled everywhere

```sql
-- 0019_rls_enable.sql
do $$
declare t text;
begin
  foreach t in array array[
    'settings','settings_versions','vehicle_classes','vehicles','chauffeurs','customers','staff',
    'service_zones','rate_versions','distance_rates','fixed_routes','surcharges','coupons',
    'coupon_redemptions','bookings','booking_legs','booking_access_tokens','booking_reference_counters',
    'price_snapshots','price_snapshot_legs','booking_payments','booking_refunds','stripe_events',
    'booking_notifications','booking_events','audit_log','consent_log','content_strings','reviews'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
```

`FORCE ROW LEVEL SECURITY` is applied only to the six append-only tables (§10). It is deliberately
**not** applied to the rest, because migrations and the seed run as the table owner and must not be
filtered.

---

## 14. Policies, grouped by actor

Grants decide *whether at all* and raise `42501` before any policy runs; policies decide *which
rows*. Both matter, and the grant is the stronger of the two.

### 14a. Customer — `authenticated` (DATA-02)

```sql
-- 0020_rls_customer.sql

-- Start from zero on every table in the schema, whatever a Supabase project default or an
-- earlier migration left behind. This is the line that makes "the grant is the stronger of the
-- two gates" true rather than aspirational; without it, `authenticated` retains the project's
-- default `ALL` on every table these migrations created and only default-deny RLS stands between
-- a customer JWT and the ops tables.
revoke all on all tables in schema public
  from anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public;

grant select on public.bookings, public.booking_legs,
                public.price_snapshots, public.price_snapshot_legs to authenticated;

-- COLUMN-SCOPED, not table-wide. `customers` also carries `note` (dispatch's private note about
-- this customer — the mock seeds 'Invoiced monthly'), `type`, `company`, `since` and `erased_at`.
-- A row policy constrains WHICH ROW, never which column: with `grant update` a customer could set
-- `type='corporate'` to reach corporate-only pricing, or clear `erased_at` to resurrect a redacted
-- row. With `grant select` they could read a note written for staff eyes about themselves.
grant select (id, user_id, full_name, email, phone, type, company, since, created_at)
  on public.customers to authenticated;
grant update (full_name, phone, company) on public.customers to authenticated;

-- DATA-02 — a customer reads only their own bookings.
create policy bookings_select_own on public.bookings
  for select to authenticated
  using ((select app.uid()) is not null
         and customer_id in (select c.id from public.customers c where c.user_id = (select app.uid())));

-- Belt: a RESTRICTIVE policy refusing to serve `authenticated` when no identity was bound at
-- all. Restrictive policies AND with the permissive set, so nothing added later can OR past it.
create policy bookings_require_identity on public.bookings
  as restrictive for all to authenticated
  using ((select app.uid()) is not null);

-- Child rows reach identity through the parent; the inner select is itself RLS-filtered as the
-- same role, so the two can never disagree.
create policy legs_select_via_parent on public.booking_legs
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_legs.booking_id));

create policy snapshots_select_via_parent on public.price_snapshots
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = price_snapshots.booking_id));

create policy snapshot_legs_select_via_parent on public.price_snapshot_legs
  for select to authenticated
  using (exists (select 1 from public.price_snapshots s where s.id = price_snapshot_legs.snapshot_id));

-- A customer reads and edits only their own customer row.
create policy customers_select_own on public.customers
  for select to authenticated using (user_id = (select app.uid()));
create policy customers_update_own on public.customers
  for update to authenticated
  using (user_id = (select app.uid())) with check (user_id = (select app.uid()));

-- No INSERT policy on bookings for `authenticated`: a quote is created by a server-authoritative
-- route, never by the browser.
```

`(select app.uid())` is wrapped in a sub-select deliberately — Postgres caches it as an initPlan
once per statement rather than re-evaluating per row.

`0020` runs `revoke all on all tables in schema public` **before** its first grant, so it must be
the first of the four policy migrations and every later grant in `0021`–`0023` is additive on top
of a clean slate. `ops_role_rls.test.sql` asserts the consequence directly: `authenticated`
selecting `public.chauffeurs` gets `42501`, not an empty result — an empty result would mean the
grant layer is missing and only RLS is holding.

### 14b. Guest with a manage token — `vamos_guest` (DATA-03)

```sql
-- 0021_rls_guest.sql

grant select on public.bookings, public.booking_legs,
                public.price_snapshots, public.price_snapshot_legs to vamos_guest;
-- vamos_guest gets NO grant on booking_access_tokens itself, so the policy CANNOT read that table
-- inline: an RLS expression is evaluated as the invoking role, and an inline subquery here would
-- raise `42501 permission denied for table booking_access_tokens` on every guest read — every
-- DATA-03 path failing 100 % of the time, and the pgTAP case erroring instead of returning zero
-- rows. The SECURITY DEFINER helper from §8 is what reads it.

-- DATA-03 — a guest opens their booking with a valid manage token and nothing else.
-- The raw token exists only in the emailed link; the DB stores and compares hashes.
create policy bookings_select_by_manage_token on public.bookings
  for select to vamos_guest
  using (
    app.manage_token_hash() is not null
    and app.booking_has_manage_token(bookings.id)
  );

create policy legs_select_guest on public.booking_legs
  for select to vamos_guest
  using (exists (select 1 from public.bookings b where b.id = booking_legs.booking_id));
create policy snapshots_select_guest on public.price_snapshots
  for select to vamos_guest
  using (exists (select 1 from public.bookings b where b.id = price_snapshots.booking_id));
create policy snapshot_legs_select_guest on public.price_snapshot_legs
  for select to vamos_guest
  using (exists (select 1 from public.price_snapshots s where s.id = price_snapshot_legs.snapshot_id));
```

If the GUC is unset, `app.manage_token_hash()` is NULL and the policy is false — zero rows, never
someone else's booking. Mutations do not go through these policies; they go through the
`SECURITY DEFINER` functions in §8, whose bodies re-validate the token on every call.

### 14c. Staff — `vamos_staff` (DATA-04, AUTH-05)

```sql
-- 0022_rls_staff.sql

-- TWO lists, deliberately. The first is the ops working set: tables a dispatcher legitimately
-- edits. The second is the LEDGER set — the evidence tables — which staff may read and may never
-- write, because §10 and §14e promise exactly that and a `grant insert` in a convenience loop is
-- how that promise gets silently broken.
do $$
declare t text;
begin
  foreach t in array array[
    'chauffeurs','vehicles','vehicle_classes','service_zones','customers','staff',
    'coupons','coupon_redemptions','rate_versions','distance_rates','fixed_routes','surcharges',
    'bookings','booking_legs','booking_access_tokens','settings','settings_versions',
    'content_strings','reviews'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated, vamos_edge, vamos_public', t);
    execute format('grant select, insert, update, delete on public.%I to vamos_staff', t);
    -- DATA-04 + AUTH-05: role claim AND aal2 AND an active staff row, all three.
    -- RESTRICTIVE so a permissive policy added later cannot OR its way past it.
    execute format($p$create policy %I on public.%I as restrictive for all to vamos_staff
                      using ((select app.is_staff())) with check ((select app.is_staff()))$p$,
                   t || '_staff_gate', t);
    execute format($p$create policy %I on public.%I for all to vamos_staff
                      using (true) with check (true)$p$, t || '_staff_all', t);
  end loop;

  -- The ledger set: SELECT only, for anyone below the service role.
  --
  -- A dispatcher session (or a stolen dispatcher JWT at aal2) holding INSERT here can forge a
  -- settlement — `insert into booking_events (kind, actor_kind, actor_label) values
  -- ('payment.succeeded','stripe','Stripe')` — or a `refund.issued` covering a cash refund
  -- pocketed at the kerb, and the append-only triggers then make the forgery PERMANENT because
  -- nobody, admin included, can delete it. With INSERT on price_snapshots and booking_payments
  -- they can manufacture a paid booking end to end, bypassing the Phase 4 engine entirely. With
  -- DELETE on stripe_events they can drop an idempotency row so a replayed webhook re-runs.
  foreach t in array array[
    'booking_events','price_snapshots','price_snapshot_legs','booking_payments','booking_refunds',
    'stripe_events','booking_notifications'
  ] loop
    execute format('revoke all on public.%I from anon, authenticated, vamos_edge, vamos_public, vamos_staff', t);
    execute format('grant select on public.%I to vamos_staff', t);
    execute format($p$create policy %I on public.%I as restrictive for all to vamos_staff
                      using ((select app.is_staff())) with check (false)$p$,
                   t || '_staff_gate', t);
    execute format($p$create policy %I on public.%I for select to vamos_staff
                      using (true)$p$, t || '_staff_read', t);
  end loop;
end $$;
```

Every write to the ledger set goes through the **service role** (which bypasses RLS, never ships to
a browser, and is only reachable from server code) or through a `SECURITY DEFINER` function granted
to `vamos_staff` — the ops "issue a refund" action is the latter, so the refund row, the
`booking_events` row and the Stripe call are one auditable unit rather than a raw INSERT.
`ops_write_denied.test.sql` asserts `insert into public.booking_events` and `delete from
public.stripe_events` both raise `42501` as `vamos_staff` at `aal2`.

```sql
-- Admin-only reads. Evidence, not an ops workflow.
grant select on public.audit_log, public.consent_log to vamos_staff;
create policy audit_log_admin_select   on public.audit_log
  for select to vamos_staff using ((select app.is_admin()));
create policy consent_log_admin_select on public.consent_log
  for select to vamos_staff using ((select app.is_admin()));

-- Admin-only writes on the tables that change money or access.
--
-- FOR ALL, not FOR INSERT. `for insert` leaves UPDATE covered only by the permissive
-- `rate_versions_staff_all`, which means a dispatcher — the lowest ops role — can run
-- `update rate_versions set status='live'`: the launch trigger, the single statement that opens
-- the charge gate on the whole platform, before the owner has approved a CHF matrix. The
-- transition trigger in §6 is the second lock on the same door.
create policy rate_versions_admin_write on public.rate_versions
  as restrictive for all to vamos_staff
  using ((select app.is_admin())) with check ((select app.is_admin()));
create policy staff_admin_write on public.staff
  as restrictive for all to vamos_staff
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- The priced children of a rate version follow their parent: only an admin may write an amount.
-- A dispatcher must not be able to fill a draft matrix with arbitrary CHF figures and wait for
-- someone to publish it.
do $$
declare t text;
begin
  foreach t in array array['distance_rates','fixed_routes','surcharges'] loop
    execute format($p$create policy %I on public.%I
                      as restrictive for insert to vamos_staff
                      with check ((select app.is_admin()))$p$, t || '_admin_insert', t);
    execute format($p$create policy %I on public.%I
                      as restrictive for delete to vamos_staff
                      using ((select app.is_admin()))$p$, t || '_admin_delete', t);
    -- UPDATE stays open to a dispatcher because the freeze trigger (§6) has already narrowed it
    -- to the `live` / `available` availability toggle once the version is published; on a draft
    -- version, `%I_admin_update` closes it.
    execute format($p$create policy %I on public.%I
                      as restrictive for update to vamos_staff
                      using ((select app.is_admin())
                             or exists (select 1 from public.rate_versions rv
                                         where rv.id = %I.rate_version_id and rv.status <> 'draft'))
                      with check ((select app.is_admin())
                             or exists (select 1 from public.rate_versions rv
                                         where rv.id = %I.rate_version_id and rv.status <> 'draft'))$p$,
                   t || '_admin_update', t, t, t);
  end loop;
end $$;
```

`rate_versions_admin_write` is `AS RESTRICTIVE ... FOR ALL`, so it ANDs with the permissive
`rate_versions_staff_all` on **read** as well — a dispatcher cannot see the pricing batches at all.
That is deliberate: the ops Pricing screen is an admin surface, and a dispatcher who needs a price
reads it off the booking's snapshot, which is the number that was actually sold.

### 14d. Anonymous / public content — `vamos_public` and `anon`

```sql
-- 0023_rls_public.sql

do $$
declare t text;
begin
  foreach t in array array['content_strings','reviews','vehicle_classes','service_zones'] loop
    execute format('revoke all on public.%I from vamos_edge, vamos_guest', t);
    execute format('grant select on public.%I to vamos_public, anon, authenticated, vamos_staff', t);
  end loop;
end $$;

create policy reviews_public_read on public.reviews
  for select to vamos_public, anon, authenticated using (published);
create policy content_strings_public_read on public.content_strings
  for select to vamos_public, anon, authenticated using (true);
create policy vehicle_classes_public_read on public.vehicle_classes
  for select to vamos_public, anon, authenticated using (active);
create policy service_zones_public_read on public.service_zones
  for select to vamos_public, anon, authenticated using (active);

-- Settings are NOT exposed raw. A curated projection publishes only the customer-facing subset.
--
-- NOT `security_invoker`. That option makes the base table's permission check and RLS run as the
-- caller — and the caller is `anon`/`vamos_public`, which holds no grant and matches no policy on
-- `public.settings`. Every SiteFooter render and the contact page would get `42501 permission
-- denied for table settings` (SITE-02, SITE-09 dead on the first render of Phase 5). A view that
-- exists precisely to publish a narrowed subset of a locked table is the textbook case for
-- definer semantics: the view is the grant surface, the WHERE and the column list are the policy.
create view public.settings_public as
  select phone, email, default_lang, default_currency,
         accepts_card, accepts_twint, accepts_cash
    from public.settings where id = 1;
grant select on public.settings_public to vamos_public, anon, authenticated, vamos_staff;
-- and nothing else: `public.settings` itself stays revoked from every public role.
```

**Consent is written through one function, never by a direct INSERT.** A `grant insert` plus
`with check (true)` accepts every column from an unauthenticated caller — including `customer_id`
and `consent_subject_id`. An attacker could then post `{customer_id: <victim>, marketing: true}`
and the table whose entire purpose is proving consent to a regulator would hold attacker-authored
rows attributing marketing consent to someone who never gave it, unremovable because the table is
append-only. The same policy is an unbounded write amplifier: an anon loop fills the disk and takes
the bookings database down with it.

```sql
/**
 * The only write path into consent_log. `consent_subject_id` comes from the server-set GUC the
 * Worker fills from the first-party consent cookie, and `customer_id` from the verified JWT —
 * neither is ever an argument, so neither can be forged by the caller.
 */
create or replace function public.record_consent(
  p_necessary boolean, p_functional boolean, p_analytics boolean, p_marketing boolean,
  p_method text, p_locale text, p_policy_version text,
  p_booking_id uuid default null, p_user_agent text default null, p_ip_truncated inet default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_subject uuid;
begin
  v_subject := nullif(current_setting('request.vamos.consent_subject', true), '')::uuid;
  if v_subject is null then
    raise exception 'no consent subject bound to this request' using errcode = 'P0001';
  end if;

  insert into public.consent_log (consent_subject_id, customer_id, booking_id, policy_version,
                                  method, necessary, functional, analytics, marketing, locale,
                                  user_agent, ip_truncated)
  values (v_subject,
          (select c.id from public.customers c where c.user_id = app.uid()),
          p_booking_id, p_policy_version, p_method,
          coalesce(p_necessary, true), p_functional, p_analytics, p_marketing, p_locale,
          left(p_user_agent, 512), p_ip_truncated);
end $$;

revoke all on function public.record_consent(boolean,boolean,boolean,boolean,text,text,text,uuid,text,inet)
  from public;
grant execute on function public.record_consent(boolean,boolean,boolean,boolean,text,text,text,uuid,text,inet)
  to anon, authenticated, vamos_guest, vamos_public;

-- No table grant and no policy for these roles at all: you can record a choice through the
-- function, you cannot INSERT arbitrary rows and you cannot read the ledger.
```

Rate limiting on the consent endpoint (Cloudflare, keyed per subject id and per IP) is the second
half of the amplifier defence and belongs to the Phase 10 banner work; the function shape is what
makes it enforceable at all.

### 14e. Service role

`booking_events`, `price_snapshots`, `price_snapshot_legs`, `booking_payments`, `booking_refunds`,
`booking_notifications` and `stripe_events` are written by server code holding the service-role key,
which bypasses RLS by Supabase design and never ships to a browser. **No client-facing role holds
INSERT, UPDATE or DELETE on any of them** — §14c grants `vamos_staff` `SELECT` only and pairs it
with a restrictive `WITH CHECK (false)` gate, so even a compromised `admin` JWT cannot forge, edit
or delete a timeline entry, a snapshot or a settlement. The append-only triggers in §10 still bind
the service role, because a trigger is not RLS.

### 14f. Realtime — how the ops board actually gets its updates (OPS-01)

Decided here rather than in Phase 8, because it determines which policies exist.

**Postgres Changes is not usable for the ops board.** Realtime's Postgres Changes authorizer
connects with the staff member's JWT and evaluates RLS as the JWT's `role` claim — which is
`authenticated`, always. It never issues `set_config('role','vamos_staff')`, so a dispatcher would
be matched against `bookings_select_own`, find no `customers` row with `user_id = their uid`, and
receive **zero events, forever**, with the failure looking like a Realtime configuration problem
rather than an RLS one. Making it work would mean adding a permissive
`for select to authenticated using (app.is_staff())` policy to every ops table the board reads —
re-opening the customer role on exactly the tables §14c exists to close — and adding those tables
to the `supabase_realtime` publication.

**So: Broadcast from the database, on a private channel.** A trigger calls
`realtime.broadcast_changes()` on the topic `ops:board`; the ops client subscribes to that private
channel and authorization is a policy on `realtime.messages`, not on our tables. No ops table joins
the `supabase_realtime` publication, no permissive `authenticated` policy is added to any ops table,
and the payload is a change notification the client uses as a cue to refetch through the normal
`vamos_staff` path — so what a dispatcher can *see* is still decided by §14c and by nothing else.

```sql
-- 0022_rls_staff.sql (continued)

create policy ops_board_broadcast_read on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'ops:board' and (select app.is_staff()));

-- Clients never publish on this topic; only the database does.
create policy ops_board_broadcast_no_write on realtime.messages
  as restrictive for insert to authenticated with check (false);
```

`app.is_staff()` still requires the role claim **and** `aal2` **and** an active `staff` row, so the
board is closed to a customer JWT and to a staff session that has not passed its second factor —
the same three conditions as every other ops surface. Phase 8 lands the trigger and the client
subscription; Phase 2 lands the authorization.

---

## 15. pgTAP tests (the proof artefacts, not a nice-to-have)

`packages/db/supabase/tests/`, run by `supabase test db` in the PR gate. One file per claim:

| File | Proves |
|---|---|
| `extensions.test.sql` | `pgcrypto`, `btree_gist`, `citext`, `pgtap` all installed — runs first, because a missing `citext` aborts every later migration |
| `bookings_customer_rls.test.sql` | DATA-02: customer A sees A's bookings, zero of B's |
| `bookings_manage_token_rls.test.sql` | DATA-03: correct hash → one row; wrong/expired/revoked hash → zero rows; **unset GUC returns zero rows, not `42501`** (the inline-subquery bug) |
| `ops_role_rls.test.sql` | DATA-04: `authenticated` gets `42501` on `public.chauffeurs`; `vamos_staff` with `aal1` gets zero rows; with `aal2` and an active row, gets rows |
| `ops_write_denied.test.sql` | `vamos_staff` at aal2 gets `42501` on `insert into booking_events`, `insert into price_snapshots`, `update booking_payments`, `delete from stripe_events` |
| `staff_hook_claim.test.sql` | AUTH-05: called as `supabase_auth_admin`, `custom_access_token_hook` returns claims carrying `app_metadata.vamos_role` for an active staff row and no claim for `active=false` |
| `rate_version_publish.test.sql` | A dispatcher's `update rate_versions set status='live'` raises; an admin's raises while any priced row is NULL; `live → draft` raises; `draft → live` on a complete matrix succeeds and stamps `published_by` |
| `customer_columns.test.sql` | `authenticated` cannot update `customers.type` or `customers.erased_at`, and cannot select `customers.note` |
| `consent_write.test.sql` | `anon` cannot `insert into consent_log` directly; `record_consent()` ignores a forged `customer_id` and refuses with no bound subject |
| `settings_public.test.sql` | `anon` selects `settings_public` and gets the row; `anon` selecting `public.settings` raises `42501` |
| `fail_closed.test.sql` | The grant layer: `vamos_edge` has `SELECT` on no table in `public`, and neither does `authenticated` on any ops table |
| `append_only.test.sql` | `UPDATE`/`DELETE` on each append-only table raises `restrict_violation`; binding `price_snapshots.booking_id` NULL → non-NULL succeeds and a second change to it raises |
| `charge_gate.test.sql` | Inserting `booking_payments` against a draft rate version raises; against an expired snapshot raises; with a mismatched amount raises; a forged `rate_version_is_live => true` is overwritten to `false` by the trigger |
| `exclusion.test.sql` | Overlapping chauffeur assignment raises `23P01`; a cancelled leg does not block; **a 3-hour leg blocks a second assignment 40 minutes later**; assigning a chauffeur to a leg with a NULL duration raises `23514`; the same for a vehicle |
| `reference_format.test.sql` | `next_booking_reference()` returns `VT-YY-####`, increments within a year, and is not executable by `anon` / `authenticated` / `vamos_staff` |
| `seed_idempotent.test.sql` | Running `seed.sql` twice against a scratch database leaves identical row counts on all nine seeded tables |

---

## 16. Migration file layout (`packages/db/supabase/migrations/`)

Created with `supabase migration new <name>` so timestamps never collide. One file per concern; a
table's DDL, its indexes and its triggers ship together, with RLS enablement and policies in the
0019–0023 block so the per-actor grouping stays readable in review.

| # | File | Contents |
|---|---|---|
| 0001 | `extensions` | `pgcrypto`, `btree_gist`, **`citext`**, `pgtap` into `extensions`; database `search_path` |
| 0002 | `roles_and_helpers` | `vamos_edge`, `vamos_public`, `vamos_guest`, `vamos_staff`; `app` schema; `app.jwt/uid/manage_token_hash/is_staff/is_admin`; default-privilege revokes |
| 0003 | `types` | every enum type; the `rappen` domain |
| 0004 | `settings` | `settings`, `settings_versions` |
| 0005 | `fleet` | `vehicle_classes`, `vehicles`, `chauffeurs` |
| 0006 | `customers_and_staff` | `customers`, `staff`, `custom_access_token_hook` |
| 0007 | `rate_versions` | `rate_versions`, `service_zones`, `distance_rates`, `fixed_routes`, `surcharges`, freeze trigger |
| 0008 | `coupons` | `coupons` only (redemptions move to 0011a, after `bookings`) |
| 0009 | `bookings` | reference counter + generator, `bookings` |
| 0010 | `booking_legs` | `booking_legs`, both exclusion constraints, buffer-snapshot trigger |
| 0011 | `booking_access_tokens` | token table, `app.booking_has_manage_token`, `manage_booking_*` SECURITY DEFINER functions |
| 0011a | `coupon_redemptions` | `coupon_redemptions` (needs `bookings`) |
| 0012 | `price_snapshots` | `price_snapshots`, `price_snapshot_legs`, rate-version-flag trigger, `bookings.price_snapshot_id` FK, ops-cache trigger |
| 0013 | `payments_refunds` | `booking_payments` + charge gate + update whitelist, `booking_refunds`, `stripe_events`, `booking_notifications` |
| 0014 | `booking_events` | `booking_events` |
| 0015 | `audit_log` | `audit_log`, `tg_audit_row`, per-table triggers |
| 0015a | `consent_log` | `consent_log`, `record_consent()` — **before** 0016, which attaches its append-only trigger |
| 0016 | `append_only` | `tg_append_only` (incl. the snapshot-binding carve-out), triggers, revokes, `FORCE ROW LEVEL SECURITY` |
| 0018 | `content_and_reviews` | `content_strings`, `reviews` |
| 0019 | `rls_enable` | `ENABLE ROW LEVEL SECURITY` on every table |
| 0020 | `rls_customer` | `revoke all on all tables` baseline (must run first), DATA-02 column-scoped grants + policies |
| 0021 | `rls_guest` | DATA-03 grants + policies |
| 0022 | `rls_staff` | DATA-04 / AUTH-05 grants + policies, ledger tables SELECT-only, admin-write restrictions, `realtime.messages` board authorization |
| 0023 | `rls_public` | anon/`vamos_public` content grants, `settings_public` view (definer), `record_consent()` grant |

Two ordering facts are load-bearing and were wrong in the first draft of this table:

- **`consent_log` must exist before `0016`.** `0016` creates its append-only trigger, revokes
  UPDATE/DELETE on it and forces RLS on it; with the table created in `0017` the whole reset aborts
  at `relation "public.consent_log" does not exist`. It is now `0015a`.
- **`0020` must be the first policy migration**, because it opens with
  `revoke all on all tables in schema public` and every later grant depends on that clean slate.

Forward-only. There is no `supabase migration down` and no `down.sql` convention here — a bad
migration is corrected by a new forward migration, and a destructive one by Point-in-Time Recovery
(Pro plan, 7-day window).

---

## 17. Seed (DATA-07)

`packages/db/seed/generate-seed.mjs` is a build-time generator writing a committed, reviewable,
idempotent `packages/db/supabase/seed.sql`. Applied by `supabase db reset` locally and
`supabase db push --include-seed` on deploy (pending UNCERTAIN U3).

| Target | Source | Natural key (the `ON CONFLICT` target) | Rules |
|---|---|---|---|
| `vehicle_classes` | hard-coded in the generator | `slug` | economy 3/3, business, first, van 8/8. Display names are **not** here — they are `vehicle.class.<slug>` in `content_strings` |
| `service_zones` | the mock's `LOCATIONS` list | `slug` | slugs + IATA codes; names go to `content_strings` as `zone.<slug>` |
| `settings` | hard-coded | `id` (= 1, a plain `default 1` column) | one row. `chauffeur_turnaround_minutes = 30`. `manage_link_validity_days = NULL` |
| `settings_versions` | hard-coded | `slug` = `'launch-baseline'` | one dated row. `free_cancel_hours = 24` and the 100/75/0 `cancellation_tiers` (owner decision 2). `airport_waiting_minutes` and `city_waiting_minutes` **NULL** (ADR-002). `min_advance_minutes` NULL |
| `rate_versions` | hard-coded | `slug` = `'seed-placeholder'` | **one `draft` row, never `live`.** Label: "Staging matrix — placeholder, not owner-approved" |
| `distance_rates` | hard-coded | `(rate_version_id, vehicle_class_id)`, the parent resolved by `slug` subselect | one row per class, **every amount NULL**, `max_pax` from the class |
| `surcharges` | the eight codes in `app/vamos-ops-data.js:295-303` | `(rate_version_id, code)`, parent by `slug` | codes and `kind` preserved; `amount_rappen`/`percent` **NULL**; labels **not** here |
| `fixed_routes` | none | `(rate_version_id, origin_zone_id, dest_zone_id, vehicle_class_id)` | seeded empty; `live = false` when rows arrive |
| `content_strings` | `apps/web/i18n/messages/{en,de,fr,ar}.json` | `key` | flatten to dotted keys, strip `$meta`, then map all **three** `$meta` lists: `pending_value = true` for `$meta.pendingValueKeys` (Law 04 / ADR-011), `non_translatable = true` for `$meta.nonTranslatableKeys` (ADR-012), `no_param_reason` from `$meta.noParamKeys` (I18N-06). Add `price.line.*` and `price.surcharge.<code>.{label,rule}` in all four languages |
| `reviews` | `app/vamos-reviews.js` `SEED` array | `external_ref` = `'rv-1'`…`'rv-5'` | **each review's real `source`** — `rv-1`/`rv-4` `google`, `rv-2` `tripadvisor`, `rv-3` `trustpilot`, `rv-5` `manual`. Forcing `'manual'` would flip the generated `locked` column from true to false on four rows and strip the platform provenance the ops Reviews screen and the home cards render. `locked` is generated, never seeded |

Every statement is `INSERT … ON CONFLICT (<natural key>) DO UPDATE`, and the table above exists
because **five of the nine targets had no natural key to conflict on** in the first draft: a
`uuid` PK with a default and a `bigint … generated always as identity` are a fresh value on every
run, so `ON CONFLICT` had no target and a second push would render ten reviews on the home page,
two rate versions and sixteen surcharges. `db reset` truncates locally, but staging and production
only push forward, so `ON CONFLICT` is the only thing making a second `--include-seed` push safe.

The claim is CI-checked, not asserted: the PR job runs `seed.sql` **twice** against a scratch
database and diffs row counts across all nine tables (`seed_idempotent.test.sql`). U3 — whether
`db push --include-seed` re-runs the seed at all — is what makes this load-bearing rather than
theoretical.

**Never invent a CHF price**, not in a migration, not in the seed, not in a fixture, not in a
screenshot. With no live rate version, every `price_snapshots.is_chargeable` is false, the charge
gate refuses every `booking_payments` insert, and every amount renders `CHF 000` **by data** rather
than by a UI conditional. That is the correct state of a fresh environment until the owner approves
the matrix.

A CI check next to the existing `pnpm i18n:check` must fail when the committed `seed.sql` differs
from what the generator would now produce — until Phase 6, the JSON files are the only thing the app
renders from, so the DB mirror goes stale silently otherwise.

---

## 18. Reviewed and rejected

Three adversarial review passes (security, forward-compatibility, correctness) raised 36 findings
against the first draft. **All 36 were accepted and the DDL above is the corrected version** — none
was rejected as wrong. This section exists so the record is complete, and so the three places where
the *fix applied differs from the fix proposed* are visible rather than buried in a diff.

### Applied with a different fix than the reviewer proposed

| Finding | Proposed | Applied instead | Why |
|---|---|---|---|
| `price_snapshots.rate_version_is_live` is caller-supplied and forgeable | Drop the column and have the charge gate join `rate_versions` live at charge time | Derive the flag by `BEFORE INSERT` trigger (the caller's value is overwritten) **and** have the charge gate refuse any snapshot whose version is still `draft` | A pure live re-read also refuses a quote priced under a version that has since been legitimately retired — the customer was shown that price minutes ago and the version's rows are frozen, so honouring it is correct. Refusing `draft` blocks the placeholder-matrix charge, which is the actual risk. |
| Realtime board sees zero events under `authenticated` | Add `bookings_select_staff for select to authenticated using (app.is_staff())` and publish the tables, **or** use Broadcast | Broadcast from the database on a private `ops:board` channel, authorized by a policy on `realtime.messages` (§14f) | The first option re-opens the customer role on the exact tables §14c exists to close, and every ops table added to the board later would need the same re-opening. Broadcast keeps ops visibility decided in one place. |
| No status expresses "return cancelled, outbound already run" | Add `partially_cancelled`, or make `bookings.status` a trigger-maintained roll-up | Both enum values (`partially_cancelled`, `partially_completed`) plus `manage_booking_cancel(p_token_hash, p_leg_seq)` computing the roll-up inline; the general trigger that maintains the roll-up for every other status path lands in **Phase 9** | Phase 2 owns the vocabulary and the rule (written into the `booking_status` comment); Phase 9 owns the state machine that has to honour it on the ops paths that do not exist yet. |

### Findings whose *consequences* extend past this phase

Applied here as schema, but carrying a follow-up that Phase 3, 4, 8 or 9 must honour — each is
also recorded in `02-RESEARCH.md`'s UNCERTAIN table with its owning phase:

- The exclusion constraints are now `DEFERRABLE INITIALLY IMMEDIATE`; **Phase 9** owns the
  flight-delay shift policy that uses `SET CONSTRAINTS … DEFERRED` and decides what a conflict
  surfaced at COMMIT looks like to a dispatcher.
- `booking_notifications` ships as a table with a `dedupe_key` contract; **Phase 7** owns the
  claim-then-send discipline and the template-version vocabulary that fills it.
- `stripe_events.processed_at` / `attempts` ship as columns; **Phase 5/7** own the retry sweep and
  the out-of-order handler that reads `(object_id, stripe_created)`.
- `bookings.idempotency_key` ships as a unique partial index; **Phase 7** owns generating the key
  in the browser and echoing it to Stripe as its `Idempotency-Key`.
