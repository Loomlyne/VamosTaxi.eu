# Phase 2: Data Schema, RLS & Staff Auth Foundations - Pattern Map

**Mapped:** 2026-08-23
**Files analyzed:** ~48 (23 migrations + 1 config + ~18 pgTAP tests + seed generator + seed.sql +
database.types.ts + package.json + 3 CI workflow edits, grouped into the 7 plans CONTEXT.md's
"Proposed plan split" names)
**Analogs found:** 48 / 48 — **but read the caveat below before trusting that number.**

## Caveat that matters more than the count

`packages/db/` is an **empty scaffold** (`README.md` + a bare `package.json`, confirmed by
listing the directory — no `supabase/` folder exists yet). There is **no sibling SQL file, no
pgTAP file, no `.mjs` seed script anywhere in this repo** to copy a Postgres pattern from. For
every migration and test file below, the "analog" is **`02-SCHEMA-DRAFT.md`**, the reviewed
(revision 2, 36 findings folded in) DDL every migration must be cut from almost verbatim — it is
a design document, not a codebase file, and the planner should treat the excerpts below as "the
exact SQL to place in this migration," not "a similar file to imitate." The only file-to-file
codebase analogs in this phase are the **tooling** layer: the seed generator's shape borrows from
`scripts/migrate-dictionary.mjs` / `scripts/check-i18n-coverage.mjs`, and the three CI workflow
edits are literal insertions into the three files that already exist and already run.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `packages/db/supabase/config.toml` | config | batch | *(none — `supabase init` output)* | no analog |
| `packages/db/supabase/migrations/0001_extensions.sql` | migration | CRUD (DDL) | `02-SCHEMA-DRAFT.md` §1 | design-doc analog |
| `packages/db/supabase/migrations/0002_roles_and_helpers.sql` | migration | CRUD (DDL) + request-response (helper fns) | `02-SCHEMA-DRAFT.md` §2 | design-doc analog |
| `packages/db/supabase/migrations/0003_types.sql` | migration | CRUD (DDL) | `02-SCHEMA-DRAFT.md` §3 | design-doc analog |
| `packages/db/supabase/tests/extensions.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 test table | design-doc analog |
| `packages/db/supabase/migrations/0004_settings.sql` | migration | CRUD (DDL) | `02-SCHEMA-DRAFT.md` §4 | design-doc analog |
| `packages/db/supabase/migrations/0005_fleet.sql` | migration | CRUD (DDL) | `02-SCHEMA-DRAFT.md` §5 | design-doc analog |
| `packages/db/supabase/migrations/0006_customers_and_staff.sql` | migration | CRUD (DDL) + event-driven (hook fn) | `02-SCHEMA-DRAFT.md` §5 (staff/hook) | design-doc analog |
| `packages/db/supabase/tests/staff_hook_claim.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/supabase/migrations/0007_rate_versions.sql` | migration | CRUD (DDL) + event-driven (transition/freeze triggers) | `02-SCHEMA-DRAFT.md` §6 | design-doc analog |
| `packages/db/supabase/migrations/0008_coupons.sql` | migration | CRUD (DDL) | `02-SCHEMA-DRAFT.md` §6 | design-doc analog |
| `packages/db/supabase/tests/rate_version_publish.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/supabase/migrations/0009_bookings.sql` | migration | CRUD (DDL) + transform (ref generator) | `02-SCHEMA-DRAFT.md` §7 | design-doc analog |
| `packages/db/supabase/migrations/0010_booking_legs.sql` | migration | CRUD (DDL) + event-driven (exclusion + buffer trigger) | `02-SCHEMA-DRAFT.md` §7 | design-doc analog |
| `packages/db/supabase/migrations/0011_booking_access_tokens.sql` | migration | CRUD (DDL) + request-response (definer RPCs) | `02-SCHEMA-DRAFT.md` §8 | design-doc analog |
| `packages/db/supabase/migrations/0011a_coupon_redemptions.sql` | migration | CRUD (DDL) | `02-SCHEMA-DRAFT.md` §6 (coupons) | design-doc analog |
| `packages/db/supabase/tests/exclusion.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/supabase/tests/reference_format.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/supabase/migrations/0012_price_snapshots.sql` | migration | CRUD (DDL) + event-driven (rate-version-flag trigger) | `02-SCHEMA-DRAFT.md` §9 | design-doc analog |
| `packages/db/supabase/migrations/0013_payments_refunds.sql` | migration | CRUD (DDL) + event-driven (charge-gate trigger) | `02-SCHEMA-DRAFT.md` §9 | design-doc analog |
| `packages/db/supabase/migrations/0014_booking_events.sql` | migration | CRUD (DDL) | `02-SCHEMA-DRAFT.md` §10 | design-doc analog |
| `packages/db/supabase/migrations/0015_audit_log.sql` | migration | CRUD (DDL) + event-driven (`tg_audit_row`) | `02-SCHEMA-DRAFT.md` §10 | design-doc analog |
| `packages/db/supabase/migrations/0015a_consent_log.sql` | migration | CRUD (DDL) | `02-SCHEMA-DRAFT.md` §11 | design-doc analog |
| `packages/db/supabase/migrations/0016_append_only.sql` | migration | event-driven (4-layer enforcement) | `02-SCHEMA-DRAFT.md` §10 | design-doc analog |
| `packages/db/supabase/tests/charge_gate.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/supabase/tests/append_only.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/supabase/tests/consent_write.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/supabase/migrations/0018_content_and_reviews.sql` | migration | CRUD (DDL) | `02-SCHEMA-DRAFT.md` §12 | design-doc analog |
| `packages/db/supabase/migrations/0019_rls_enable.sql` | migration | CRUD (DDL) | `02-SCHEMA-DRAFT.md` §13 | design-doc analog |
| `packages/db/supabase/migrations/0020_rls_customer.sql` | migration | CRUD (DDL, RLS policies) | `02-SCHEMA-DRAFT.md` §14a | design-doc analog |
| `packages/db/supabase/migrations/0021_rls_guest.sql` | migration | CRUD (DDL, RLS policies) | `02-SCHEMA-DRAFT.md` §14b | design-doc analog |
| `packages/db/supabase/migrations/0022_rls_staff.sql` | migration | CRUD (DDL, RLS policies) | `02-SCHEMA-DRAFT.md` §14c | design-doc analog |
| `packages/db/supabase/migrations/0023_rls_public.sql` | migration | CRUD (DDL, RLS policies) + pub-sub (Realtime authorization) | `02-SCHEMA-DRAFT.md` §14d–14f | design-doc analog |
| `packages/db/supabase/tests/bookings_customer_rls.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/supabase/tests/bookings_manage_token_rls.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/supabase/tests/ops_role_rls.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/supabase/tests/ops_write_denied.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/supabase/tests/customer_columns.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/supabase/tests/settings_public.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/supabase/tests/fail_closed.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15 | design-doc analog |
| `packages/db/seed/generate-seed.mjs` | utility (generator) | transform / batch | `scripts/migrate-dictionary.mjs` | **real codebase analog** |
| `packages/db/supabase/seed.sql` | migration (generated data) | batch | `apps/web/i18n/messages/*.json` (generated-output sibling) + `02-SCHEMA-DRAFT.md` §17 | mixed |
| `packages/db/database.types.ts` | config/utility (generated types) | transform | `apps/web/lib/env.d.ts` (committed typed surface) + `apps/web/i18n/key-map.json` (generated, drift-checked) | **real codebase analog (convention only, not shape)** |
| `packages/db/package.json` | config | — | `apps/web/package.json` (sibling workspace package) | **real codebase analog** |
| `packages/db/supabase/tests/seed_idempotent.test.sql` | test | request-response | `02-SCHEMA-DRAFT.md` §15/§17 | design-doc analog |
| `.github/workflows/pr.yml` (edit) | config (CI) | batch | itself, current committed version | **real codebase analog — same file** |
| `.github/workflows/deploy-staging.yml` (edit) | config (CI) | batch | itself, current committed version | **real codebase analog — same file** |
| `.github/workflows/deploy-production.yml` (edit) | config (CI) | batch | itself, current committed version | **real codebase analog — same file** |

---

## Pattern Assignments

Grouped by the seven plans CONTEXT.md's proposed split names (P1–P7), because that is how a
planner will actually slice tasks, and because every migration in a group shares one analog
section of `02-SCHEMA-DRAFT.md`.

### P1 — Foundation: `0001_extensions.sql`, `0002_roles_and_helpers.sql`, `0003_types.sql`, `tests/extensions.test.sql`, `config.toml`

**Analog:** `.planning/phases/02-data-schema-rls-staff-auth-foundations/02-SCHEMA-DRAFT.md` §1–§3
(lines 51–345 as read).

**File header / provenance-comment convention** — every migration should open with a `-- NNNN_name.sql`
comment naming itself, exactly as the draft's fenced blocks do (`-- 0001_extensions.sql`), and inline
comments should cite the decision they encode, matching the repo-wide convention already used in
`apps/web/lib/env.d.ts` and `apps/web/i18n/request.ts` (see Shared Patterns below).

**Extensions — copy verbatim** (`02-SCHEMA-DRAFT.md` lines 53–68):
```sql
-- 0001_extensions.sql
create schema if not exists extensions;
grant usage on schema extensions to public;

create extension if not exists pgcrypto  with schema extensions;  -- gen_random_uuid()
create extension if not exists btree_gist with schema extensions; -- equality + range in one GiST index
create extension if not exists citext     with schema extensions; -- case-insensitive email
create extension if not exists pgtap     with schema extensions;  -- supabase test db

alter database postgres set search_path = "$user", public, extensions;
```
Order matters: `citext` must land here or migration `0006` aborts the whole `supabase db reset`
gate (the exact failure the schema-draft review pass caught).

**Roles — the security-boundary pattern to copy** (lines 91–125): privilege-less login role,
`NOINHERIT`, memberships granted `WITH INHERIT FALSE, SET TRUE`, followed by a default-privilege
revoke so the Supabase project defaults (`anon`/`authenticated`/`service_role` get `ALL` by
default) cannot leak a grant to any of the four new roles:
```sql
create role vamos_edge login password :'vamos_edge_password' noinherit;
grant anon          to vamos_edge with inherit false, set true;
grant authenticated to vamos_edge with inherit false, set true;
grant vamos_guest   to vamos_edge with inherit false, set true;
grant vamos_staff   to vamos_edge with inherit false, set true;

alter default privileges in schema public
  revoke all on tables    from vamos_edge, vamos_public, anon, authenticated;
```
Never `GRANT postgres TO vamos_edge` — the note in the draft is explicit that `postgres` owns the
tables and bypasses every policy.

**Identity helpers — the `app.*` function pattern every later RLS policy calls** (lines 130–202):
`language sql stable set search_path = ''`, schema-qualified everywhere, `SECURITY DEFINER` only
on the two that must read a table the calling role holds no grant on:
```sql
create or replace function app.jwt() returns jsonb
  language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

create or replace function app.is_staff() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(app.jwt() -> 'app_metadata' ->> 'vamos_role', '') in ('dispatcher','admin')
     and coalesce(app.jwt() ->> 'aal', 'aal1') = 'aal2'
     and exists (select 1 from public.staff s where s.user_id = app.uid() and s.active)
$$;
```
Every helper ends with an explicit `revoke all ... from public` followed by a narrow `grant execute`
— copy that shape for any new SQL function in this phase, not just these six.

**Enum vs. CHECK convention (binding on every later migration's column choices)** — native `enum`
for closed cross-table domains, `CHECK (x in (...))` for churn-prone taxonomies. `02-SCHEMA-DRAFT.md`
§0 states the rule; §3 (lines 212–267) is the exhaustive list to copy type names from verbatim
(`vehicle_status`, `chauffeur_status`, `booking_status`, `leg_direction`, `customer_type`,
`coupon_kind`, `surcharge_kind`, `review_source`, `staff_role`, `rate_version_status`,
`display_currency`) plus the money domain: `create domain rappen as integer;` (line 263).

**Test file convention** — one file per pgTAP claim, named after the claim not the migration
(`extensions.test.sql`, not `0001.test.sql`); `02-SCHEMA-DRAFT.md` §15 (lines 2156–2178) is the
authoritative table naming all ~18 files and exactly what each proves. Copy the table's "Proves"
column text into each file's opening comment.

---

### P2 — Reference data: `0004_settings.sql`, `0005_fleet.sql`, `0006_customers_and_staff.sql`, `tests/staff_hook_claim.test.sql`

**Analog:** `02-SCHEMA-DRAFT.md` §4–§5 (lines 268–521 as read).

**Mutable-singleton vs. immutable-history split** (lines 274–345) — the pattern to copy for any
future "current config + booked-at-the-time policy" pair:
```sql
create table public.settings (
  id smallint primary key default 1 check (id = 1),   -- singleton: default value, not identity
  ...
  chauffeur_turnaround_minutes integer not null default 30 check (chauffeur_turnaround_minutes >= 0),
  manage_link_validity_days   integer check (manage_link_validity_days > 0),  -- NULL until owner names it
  updated_at timestamptz not null default now()
);

create table public.settings_versions (
  id   bigint generated always as identity primary key,
  slug text not null unique,                -- the ON CONFLICT natural key the seed needs
  ...
  airport_waiting_minutes integer check (airport_waiting_minutes >= 0),  -- ADR-002: seed NULL
  cancellation_tiers jsonb not null default '[]'::jsonb,
  constraint settings_versions_tiers_array check (jsonb_typeof(cancellation_tiers) = 'array')
);
```
**D-35 correction the planner must apply on top of this excerpt:** ADR-014 §5 (2026-08-22)
confirms `free_cancel_hours=24`, the 100/75/0 tiers, `airport_waiting_minutes=60`,
`city_waiting_minutes=15`, `min_advance_minutes=180`, `manage_link_validity_days=30`,
`round_trip_discount_percent=10` — the schema-draft text above still says "seed NULL" for these
specific fields because it predates ADR-014. The **column definitions** (types, checks, the
`settings`/`settings_versions` split itself) are unaffected; only the **seed values** in P7 change.

**Erasure-guard trigger pattern** (lines 430–449) — reusable shape for "this column may only be
set by a privileged path, never an ordinary UPDATE":
```sql
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
```

**The Custom Access Token Hook — the exact fix the review pass added** (lines 474–513), including
the policy that is easy to forget (the hook runs as `supabase_auth_admin`, which has no BYPASSRLS):
```sql
grant usage  on schema public       to supabase_auth_admin;
grant select on table public.staff  to supabase_auth_admin;
create policy staff_auth_admin_read on public.staff
  as permissive for select to supabase_auth_admin using (true);

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
Never write the top-level `role` claim (schema-constrained to `anon`/`authenticated`) — write
`app_metadata.vamos_role` only, per the comment directly above this block in the draft.

---

### P3 — Pricing: `0007_rate_versions.sql`, `0008_coupons.sql`, `tests/rate_version_publish.test.sql`

**Analog:** `02-SCHEMA-DRAFT.md` §6 (lines 524–763, partially read via grep line-index; the
`rate_versions_one_live` partial unique index at line 553 and the `tg_rate_version_transition`
trigger at line 570 are the load-bearing pieces — read that range directly before writing this
plan's migration, since it was located but not fully paged into this pattern map).

**Pattern to copy — "exactly one live row" via partial unique index, never a boolean:**
```sql
create unique index rate_versions_one_live
  on public.rate_versions ((true)) where status = 'live';
```
Pair with a `BEFORE UPDATE` transition trigger restricting `status` to `draft→live` /
`live→retired` only, refusing to publish a matrix with any NULL priced row (the review-pass
finding that a dispatcher, not just an admin, could originally flip this).

**Freeze-on-publish trigger pattern** (`tg_pricing_row_frozen`, referenced at lines 685–713) —
applies to `distance_rates`, `surcharges`, `fixed_routes`: once a `rate_versions` row transitions
out of `draft`, its child pricing rows become immutable. Copy the same `BEFORE UPDATE OR DELETE`
trigger shape used by `tg_append_only` (P5) rather than inventing a second mechanism.

---

### P4 — Booking core: `0009_bookings.sql`, `0010_booking_legs.sql`, `0011_booking_access_tokens.sql`, `0011a_coupon_redemptions.sql`, `tests/exclusion.test.sql`, `tests/reference_format.test.sql`

**Analog:** `02-SCHEMA-DRAFT.md` §7–§8 (lines 765–1145 as read).

**The two exclusion constraints — copy verbatim, this is the OPS-03 forward design** (lines
958–997):
```sql
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
```
`scheduled_range` must be a **`STORED` generated column** (`tstzrange(...)`), never a live-joined
value — a generated column cannot subquery `settings`, which is exactly why the buffer is
snapshotted by trigger instead. Violation SQLSTATE is `23P01`; the Worker-side catch pattern
(`err.code === '23P01'`, never message text, `err.constraint_name` to disambiguate) is documented
for Phase 8 but the constraint **names** (`booking_legs_chauffeur_no_overlap`,
`booking_legs_vehicle_no_overlap`) are fixed here and must not drift.

**Manage-token table + read/write split — copy the shape, not just the columns** (lines 1031–1136):
table is a separate append-adjacent table (not a `bookings` column); reads go through an RLS
policy (P6) calling a `SECURITY DEFINER` helper; mutations go through a `SECURITY DEFINER` RPC
doing `SELECT ... FOR UPDATE` + state-machine check + write + `booking_events` row in one
transaction:
```sql
create table public.booking_access_tokens (
  id           uuid primary key default extensions.gen_random_uuid(),
  booking_id   uuid not null references public.bookings(id) on delete cascade,
  purpose      text not null default 'manage' check (purpose in ('manage')),
  token_hash   bytea not null unique,
  expires_at   timestamptz not null,   -- NOT NULL: issuance refuses rather than inventing a window
  revoked_at   timestamptz,
  use_count    integer not null default 0,
  constraint booking_access_tokens_hash_len check (octet_length(token_hash) = 32)
);
```
```sql
create or replace function public.manage_booking_cancel(p_token_hash bytea,
                                                        p_leg_seq smallint default null)
returns table (booking_id uuid, refund_percent numeric)
language plpgsql security definer set search_path = '' as $$
declare v public.bookings%rowtype; ...
begin
  select b.* into v from public.bookings b
    join public.booking_access_tokens t on t.booking_id = b.id
   where t.token_hash = p_token_hash and t.revoked_at is null and t.expires_at > now()
   for update of b;
  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';   -- same generic error for every failure
  end if;
  ...
end $$;

revoke all on function public.manage_booking_cancel(bytea, smallint) from public;
grant execute on function public.manage_booking_cancel(bytea, smallint) to vamos_guest;
```
Every failure path (wrong token, expired, revoked, not found) raises the **same** generic error —
copy this "no oracle" discipline into every guest-facing definer function this phase adds.

---

### P5 — Money and evidence: `0012_price_snapshots.sql`, `0013_payments_refunds.sql`, `0014_booking_events.sql`, `0015_audit_log.sql`, `0015a_consent_log.sql`, `0016_append_only.sql`, plus their tests

**Analog:** `02-SCHEMA-DRAFT.md` §9–§11 (lines 1148–1691, with §9's payments/charge-gate block and
§10's append-only block read in full above).

**The charge gate — the trigger with no off switch, copy verbatim including the comment block**
(lines 1310–1366):
```sql
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
  select status into v_status from public.rate_versions where id = s.rate_version_id;
  if v_status = 'draft' then
    raise exception 'snapshot % cites rate_version % which is still draft', s.id, s.rate_version_id
      using errcode = 'restrict_violation';
  end if;
  if s.expires_at <= now() then
    raise exception 'quote % expired at %', s.id, s.expires_at using errcode = 'restrict_violation';
  end if;
  if new.charged_rappen is distinct from s.total_rappen then
    raise exception 'charge % does not match snapshot % total %',
      new.charged_rappen, s.id, s.total_rappen using errcode = 'restrict_violation';
  end if;
  return new;
end $$;

create trigger booking_payments_match_snapshot
  before insert on public.booking_payments
  for each row execute function public.tg_payment_matches_snapshot();
```

**UPDATE-column-whitelist pattern** (lines 1374–1388) — the one deliberate exception to
append-only, for `booking_payments` only, because Stripe legitimately moves status:
```sql
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
```

**The four-layer append-only pattern — copy verbatim, reused across six tables** (lines
1591–1641):
```sql
create or replace function public.tg_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'append-only table %.%: % is not permitted',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation',
          hint = 'Insert a superseding row; never mutate history.';
end $$;

create trigger price_snapshots_append_only before update or delete on public.price_snapshots
  for each row execute function public.tg_append_only();
-- repeat for price_snapshot_legs, booking_events, booking_refunds, audit_log, consent_log

revoke update, delete on public.price_snapshots, public.price_snapshot_legs,
                          public.booking_events, public.booking_refunds,
                          public.audit_log, public.consent_log
  from anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public, service_role;

alter table public.price_snapshots     force row level security;
-- repeat for the other five
```
Note the one carved-out exception in the trigger body (`price_snapshots.booking_id` NULL→non-NULL,
nothing else changed) — copy that `if` guard, don't drop it; it's what lets a pre-purchase quote
bind to the booking it became without breaking the append-only guarantee for every other field.

**Generic trigger-written audit log** (`tg_audit_row`, referenced lines 1560–1584) attaches to
plain-CRUD admin tables (`settings`, coupons, chauffeurs, vehicles, rates, routes, surcharges,
content strings, reviews) — this is the second, trigger-driven half of D-18's audit split; do not
confuse it with `booking_events`, which is **application-written** and has no trigger at all.

---

### P6 — RLS: `0018`–`0023`, plus the seven `tests/*_rls*` / `ops_write_denied` / `customer_columns` / `settings_public` / `fail_closed` files

**Analog:** `02-SCHEMA-DRAFT.md` §13–§14 (lines 1763–2156, four of six actor sections read in full
above; §14d anon/public and §14e/§14f service-role/Realtime were located by line number — 2017–2156
— but not paged in full; read that range directly when writing `0023_rls_public.sql`).

**RLS-enable loop — copy the `do $$ ... $$` shape, do not hand-write 29 `ALTER TABLE` lines**
(lines 1765–1780):
```sql
do $$
declare t text;
begin
  foreach t in array array[
    'settings','settings_versions','vehicle_classes', /* ...every table... */
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
```

**The ordering rule that is load-bearing, not stylistic** (lines 1858–1862): `0020` must run
`revoke all on all tables in schema public from anon, authenticated, vamos_guest, vamos_staff,
vamos_edge, vamos_public;` **first**, before any grant in `0020`–`0023`. This is what makes
`fail_closed.test.sql` and `ops_role_rls.test.sql` assert `42501` (grant-layer denial) rather than
an empty result (RLS-only denial, which would mean the grant boundary is missing).

**Column-scoped grant pattern (not row-scoped)** — copy for any table where some columns are
customer-visible and others are staff-only (lines 1809–1816):
```sql
grant select (id, user_id, full_name, email, phone, type, company, since, created_at)
  on public.customers to authenticated;
grant update (full_name, phone, company) on public.customers to authenticated;
```

**Guest RLS policy — the "helper function, not inline subquery" pattern** and why (lines
1869–1899): `vamos_guest` holds **zero** grant on `booking_access_tokens`, so a policy that reads
it inline raises `42501` for every guest, 100% of the time. The `SECURITY DEFINER` helper from P1
is what makes the read possible:
```sql
create policy bookings_select_by_manage_token on public.bookings
  for select to vamos_guest
  using (
    app.manage_token_hash() is not null
    and app.booking_has_manage_token(bookings.id)
  );
```

**Staff RLS — two grant lists, deliberately** (lines 1906–1922): one loop grants
`select, insert, update, delete` on the ops working set; the **ledger** tables (`booking_events`,
`price_snapshots`, `booking_payments`, `booking_refunds`, `stripe_events`) get `select` only for
`vamos_staff` — this is the review-pass finding that a convenience loop originally over-granted
INSERT on evidence tables. Every staff policy is `AS RESTRICTIVE`, not `AS PERMISSIVE`:
```sql
execute format('grant select, insert, update, delete on public.%I to vamos_staff', t);
-- ... policy created "as restrictive for all to vamos_staff using (app.is_staff())" per §2's app.is_staff()
```

---

### P7 — Seed, types and the CI gate: `packages/db/seed/generate-seed.mjs`, `packages/db/supabase/seed.sql`, `packages/db/database.types.ts`, `.github/workflows/{pr,deploy-staging,deploy-production}.yml`, `tests/seed_idempotent.test.sql`, `packages/db/package.json`

This is the one group with **real codebase analogs**, not just the schema draft.

#### `packages/db/seed/generate-seed.mjs`

**Analog:** `/Users/koss/Developer/VamosTaxi.eu/scripts/migrate-dictionary.mjs` (811 lines, ESM,
Node's built-in `fs`/`path`/`url` only, no dependency) — the shape to copy is "read committed
source-of-truth files, transform deterministically, write a committed output file, support a
`--check` drift mode that fails CI instead of writing."

**Imports / header convention** (`scripts/migrate-dictionary.mjs` lines 1–59):
```js
#!/usr/bin/env node
// scripts/migrate-dictionary.mjs
//
// D-13's one-time, re-runnable transform: ... -> ... (dotted keys, ICU messages) + ...
//
// Usage:
//   node scripts/migrate-dictionary.mjs            # regenerate the four locale files + key-map
//   node scripts/migrate-dictionary.mjs --check     # dry run: fail if regenerating would change
//                                                    # what's committed (drift detector)

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(scriptDir, "..");
const CHECK = process.argv.includes("--check");
```
`packages/db/seed/generate-seed.mjs` sits one level deeper (`packages/db/seed/` not `scripts/`),
so `repoRoot` becomes `join(scriptDir, "..", "..", "..")` — verify this path arithmetic in the
plan, it is the one concrete deviation from the analog's boilerplate.

**Reading the JS seed array as a data source — the exact loader shape to copy** for
`app/vamos-reviews.js`'s `SEED` array (`migrate-dictionary.mjs` lines 62–72, its `loadDict()`):
```js
function loadDict() {
  const src = readFileSync(DICT_PATH, "utf8");
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: DICT_PATH });
  const dict = sandbox.window.VamosI18n;
  if (!dict || !dict.strings || !dict.patterns) {
    throw new Error(`Could not load window.VamosI18n from ${DICT_PATH}`);
  }
  return dict;
}
```
`app/vamos-reviews.js` assigns `window.VamosReviews = { SOURCES, SEED-derived .all()/.get()/... }`
inside an IIFE (`/Users/koss/Developer/VamosTaxi.eu/app/vamos-reviews.js` lines 14, 118+) — the
raw `SEED` array itself is a plain JS array literal at lines 26–47, five objects
(`rv-1`…`rv-5`), each with `source`, `name`, `role`, `text`, `rating`, `route`, `vehicleClass`,
`avatar`, `url`, `verified`, `published`. The generator must read this array (via the same
`vm.runInContext` sandbox-load trick, or a plain regex/`vm` extraction of the `SEED = [...]`
literal) and map each row to a `reviews` INSERT keyed on `external_ref = 'rv-1'..'rv-5'`, carrying
each row's **own** `source` (not forcing `'manual'`) per D-36/§17 of the schema draft.

**Reading the four locale JSON files — the exact source path and shape**:
`/Users/koss/Developer/VamosTaxi.eu/apps/web/i18n/messages/{en,de,fr,ar}.json`, each a nested
object plus a top-level `$meta: { pendingValueKeys: [...], nonTranslatableKeys: [...],
noParamKeys: { key: reason } }` — `check-i18n-coverage.mjs`'s `flatten()` (lines 90–108) is the
exact dotted-key flattening algorithm to reuse for turning the nested JSON into `content_strings`
rows, and its rule "skip any top-level key starting with `$`" is what keeps `$meta` out of the
seeded rows while still being read for the three derived columns
(`pending_value`/`non_translatable`/`no_param_reason`).

**`--check` drift-mode pattern — copy verbatim for `seed.sql` drift-checking** (`migrate-
dictionary.mjs` lines 781–801):
```js
if (CHECK) {
  let drift = false;
  for (const [file, obj] of Object.entries(outputs)) {
    const p = join(MESSAGES_DIR, file);
    const current = existsSync(p) ? readFileSync(p, "utf8") : "";
    const next = JSON.stringify(obj, null, 2) + "\n";
    if (current !== next) {
      drift = true;
      console.error(`DRIFT: ${file} differs from what's committed — re-run without --check to regenerate.`);
    }
  }
  if (drift) process.exit(1);
  console.log("migrate-dictionary --check: no drift.");
  return;
}
```
`generate-seed.mjs --check` should do the byte-identical comparison against
`packages/db/supabase/seed.sql` and `process.exit(1)` on drift — this is the mechanism
02-RESEARCH.md's Lane 6 names ("A CI check next to the existing `pnpm i18n:check` must fail when
the committed `seed.sql` differs from what the generator would now produce").

**`ON CONFLICT` natural-key discipline (SQL output, not JS) — from `02-SCHEMA-DRAFT.md` §17**
(lines 2234–2257, table + explanatory paragraph): every generated `INSERT` needs an explicit
natural key to conflict on (`slug` for `vehicle_classes`/`service_zones`/`rate_versions`, `id=1`
for `settings`, `external_ref` for `reviews`, `key` for `content_strings`) — five of the nine
seed targets had **no** natural key in the schema draft's first pass and had to be given one
specifically so `ON CONFLICT ... DO UPDATE` has something to target. The generator's SQL-emitting
functions should each hard-code their own conflict target as a constant, not infer it.

#### `packages/db/database.types.ts`

**Analog (convention, not shape):** `apps/web/lib/env.d.ts` (63 lines) for the "committed,
hand-documented typed surface with inline decision-comments and no ambient
`export`/`import`" convention, and `apps/web/i18n/key-map.json` + `check-i18n-coverage.mjs`'s
usage-resolution logic for the "generated file, committed, CI-verified against its source of
truth" workflow. The file itself is produced by `supabase gen types typescript --local >
packages/db/database.types.ts` (D-23) — there is nothing to hand-author — but the CI wiring
should mirror the existing `pnpm i18n:check` blocking-step pattern in `pr.yml` (see below), i.e. a
new step that regenerates into a temp path and runs `git diff --exit-code` against the committed
file, not a step that trusts the committed file blindly.

#### `packages/db/package.json`

**Analog:** `/Users/koss/Developer/VamosTaxi.eu/apps/web/package.json` (sibling workspace
package) for script-naming convention (`typecheck`, colon-namespaced script names like
`lint:css`/`check:public-env` in the root `package.json`) and **exact-pinned devDependency style**
— every version in `apps/web/package.json` is a bare version string with no `^`/`~`
(`"next": "15.5.23"`, `"wrangler": "4.124.0"`), matching D-21's "pinned exact devDependency"
requirement for the `supabase` CLI (`pnpm add -D -w supabase` — note: at the **workspace root**
`package.json`, not `packages/db/package.json`, per Lane 6's "installed as a pinned exact
devDependency at the workspace root, mirrored in CI by `supabase/setup-cli@v1`").

#### `.github/workflows/pr.yml`, `deploy-staging.yml`, `deploy-production.yml` (edits)

**Analog:** the three files themselves, current committed content (read in full above) — these are
edits to existing, already-passing CI files, not new files.

**`pr.yml` — insert a new job (or new steps in `gate`) following the existing blocking-step style**
(`pr.yml` lines 16–86): every step is a single `run:` line bound to a `package.json` script or a
pinned third-party action, checkout uses `fetch-depth: 0` only for the secret-scan job. The new
Supabase job needs **no secrets** (Lane 6: `supabase start` → `supabase db reset` → `supabase test
db` → `supabase gen types typescript --local` + `git diff --exit-code`) and should follow the same
`Set up pnpm` / `Set up Node` / `pnpm install --frozen-lockfile` preamble already used verbatim in
all three workflows:
```yaml
- name: Set up pnpm
  uses: pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10
  with:
    version: 11.7.0
- name: Set up Node
  uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
  with:
    node-version: "22"
    cache: pnpm
- name: Install dependencies
  run: pnpm install --frozen-lockfile
```
Add `supabase/setup-cli@v1` (pinned to a commit SHA, matching every other action in these three
files — none uses a bare `@v4` tag, all use `@<sha> # v-comment`) as the next step, then the four
Supabase CLI commands as individual named steps, matching the granularity of the existing
`i18n:check` / `check:public-env` steps (one step per check, not one shell script bundling four
checks).

**`deploy-staging.yml` / `deploy-production.yml` — insert the migration-push step before the
existing `Deploy Worker` step** (`deploy-staging.yml` lines 68–98): the `deploy` job's step order
is `Checkout` → `Set up pnpm/Node` → `Install dependencies` → **[new: `supabase link` +
`supabase db push --include-seed`]** → `Deploy Worker (staging environment)` → smoke tests. The
three new secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`) are
consumed the same way `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` already are — as `env:` on
the one step that needs them, never as a workflow-level `env:` block:
```yaml
- name: Deploy Worker (staging environment)
  run: pnpm --filter web deploy --env staging
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```
`deploy-production.yml`'s `deploy` job has an explicit comment explaining why its smoke test is a
no-op until Phase 11 cutover (lines 98–106) — the new migration-push step needs no equivalent
justification, since staging already proves the push mechanics; production's job should be
structurally identical to staging's new step, just against the production project ref/secrets.

---

## Shared Patterns

### Comment-driven decision provenance (repo-wide convention, applies to every new file)
**Source:** `apps/web/lib/env.d.ts`, `apps/web/i18n/request.ts`, `.github/workflows/pr.yml`,
`02-SCHEMA-DRAFT.md` itself.
**Apply to:** every migration, every pgTAP test, the seed generator, the CI edits.

Every non-trivial block in this codebase's TypeScript, SQL and YAML carries an inline comment
naming the decision it encodes (`D-NN`, `ADR-NNN`, a requirement ID like `AUTH-05`/`DATA-03`) and,
where relevant, *why* the alternative was rejected — not just *what* the code does. `env.d.ts`'s
`HYPERDRIVE?: Hyperdrive;` comment is a good template: names the source config, the owning phase,
and the specific hazard (a consumer reading it without a null check) the design guards against.
`02-SCHEMA-DRAFT.md` does this relentlessly for SQL (see every excerpt above). New migrations
should carry the same density of comments, quoting the `D-NN`/`ADR-NNN` citation exactly as
CONTEXT.md's decision list states it.

### Money — `rappen` integer, never invent a price
**Source:** `02-SCHEMA-DRAFT.md` §0, §3 (line 263), §17 (lines 2259–2263); `CLAUDE.md` Law 04.
**Apply to:** every migration and the seed generator that touches a priced column.

`create domain rappen as integer` everywhere; every priced column stays nullable and seeds `NULL`
until the CHF matrix lands, never a placeholder number, "not even in a fixture, not even in a
screenshot." The seed inserts **no** `rate_versions` row with `status='live'`.

### `SECURITY DEFINER` + `set search_path = ''` for any function crossing a grant boundary
**Source:** `02-SCHEMA-DRAFT.md` §2 (`app.is_staff`, `app.booking_has_manage_token`), §8
(`manage_booking_cancel`), §5 (`custom_access_token_hook`).
**Apply to:** every new SQL function this phase adds.

Every function that must read a table the calling role holds no grant on is `security definer`
with `set search_path = ''` and fully schema-qualified names — never relying on the caller's
`search_path`. Every one of these functions ends with an explicit `revoke all ... from public`
followed by a narrow `grant execute to <one role>`.

### Grants first, policies second — fail closed
**Source:** `02-SCHEMA-DRAFT.md` §13–§14 (`0020`'s `revoke all on all tables`), Lane 1 of
`02-RESEARCH.md`.
**Apply to:** every RLS migration (`0019`–`0023`).

A denial must be `42501` (grant-layer), not an empty result (RLS-layer only) — `fail_closed.test.sql`
and `ops_role_rls.test.sql` exist specifically to prove this. `0020` opens with `revoke all on all
tables in schema public` before its first `grant`, and every later policy migration is additive on
top of that clean slate — this is why P6 in CONTEXT.md's proposed split is a hard, unparallelised
gate.

### `--check` drift-mode CI gate, generated-and-committed file
**Source:** `scripts/migrate-dictionary.mjs` (`--check` flag), `scripts/check-i18n-coverage.mjs`,
`pr.yml`'s existing `pnpm i18n:check` / `pnpm check:public-env` steps.
**Apply to:** `generate-seed.mjs` → `seed.sql` drift check, `supabase gen types` → `database.types.ts`
drift check, both new `pr.yml` steps.

A generated file is committed to the repo (never generated at deploy time only) and a CI step
regenerates it into a scratch location and `git diff --exit-code`s (or does an in-memory string
comparison, per `migrate-dictionary.mjs`'s pattern) against the committed copy, failing the PR gate
on drift. This is the same shape `apps/web/i18n/messages/*.json` + `key-map.json` already use for
Phase 1's i18n migration.

### Exact-pinned devDependency versions, no caret
**Source:** `apps/web/package.json` (every dependency and devDependency is a bare version string).
**Apply to:** the workspace-root `package.json`'s new `supabase` devDependency (D-21).

`pnpm add -D -w supabase` must land as `"supabase": "X.Y.Z"`, not `"^X.Y.Z"` — matching every
existing dependency in this monorepo and D-21's explicit "pinned exact devDependency" requirement.

### Pinned third-party GitHub Actions (commit SHA, not tag)
**Source:** all three existing workflow files — every `uses:` line is `owner/action@<full-sha> #
vX.Y.Z` never a bare `@v4`.
**Apply to:** the new `supabase/setup-cli@v1` step in all three workflows.

Resolve `supabase/setup-cli`'s current release to a commit SHA before committing the workflow
edit, matching `gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e # v3.0.0`'s
existing style exactly.

---

## No Analog Found

Mechanisms this phase introduces with no precedent anywhere in the codebase — the planner should
lean on `02-RESEARCH.md` / `02-SCHEMA-DRAFT.md` prose (not a code excerpt) for these:

| File / Concern | Role | Data Flow | Reason |
|---|---|---|---|
| Realtime Broadcast authorization policy on `realtime.messages` (§14f, part of `0023_rls_public.sql`) | migration | pub-sub | No pub/sub or Realtime code exists anywhere in the repo yet (mocks use `localStorage` + custom DOM events only); the `create policy ops_board_broadcast_read on realtime.messages` shape at `02-SCHEMA-DRAFT.md` lines 2140–2145 is itself the only reference |
| Custom Access Token Hook **dashboard enablement** (Authentication → Hooks, Supabase project settings) | config (external, not a repo file) | event-driven | Not expressible as a committed file at all — U15 in 02-RESEARCH.md flags this as a manual/staging confirmation step, not code |
| R2 bucket `jurisdiction: "eu"` creation call (D-24) | config (external Cloudflare API call, not a repo file) | file-I/O | No R2 bucket exists yet in this repo (`apps/web/wrangler.jsonc`'s `PHOTOS` binding points at buckets not yet created with a jurisdiction flag); irreversible one-time API call, not a migration |
| `pgTAP` test **framework** itself (`supabase test db` runner, `pg_prove`-style assertions: `throws_ok`, `is`, `results_eq`) | test | request-response | Zero `.sql` test files exist anywhere in this repo today; every pgTAP idiom in this phase's tests must be sourced from pgTAP's own documentation, not a repo analog — `02-SCHEMA-DRAFT.md` §15's table names *what* each file proves but not pgTAP assertion syntax |

---

## Metadata

**Analog search scope:** `packages/db/`, `.github/workflows/`, `scripts/`, `apps/web/i18n/`,
`apps/web/lib/`, `apps/web/package.json`, root `package.json`/`pnpm-workspace.yaml`,
`app/vamos-ops-data.js`, `app/vamos-reviews.js`, `docs/build/GSD-LAUNCH.md`, and the phase's own
`02-CONTEXT.md` / `02-RESEARCH.md` / `02-SCHEMA-DRAFT.md`.
**Files scanned:** ~25 directly read/greped (CONTEXT.md, RESEARCH.md in full; SCHEMA-DRAFT.md via
targeted grep + 5 non-overlapping range reads covering §0–§11, §13–§17; both scripts/*.mjs files in
full; all three CI workflow files in full; `apps/web/i18n/request.ts`, `apps/web/lib/env.d.ts`,
`apps/web/package.json`, root `package.json`, `pnpm-workspace.yaml`, `.gitleaks.toml`,
`app/vamos-ops-data.js` and `app/vamos-reviews.js` headers, `docs/build/GSD-LAUNCH.md` §Phase 2).
**Pattern extraction date:** 2026-08-23
