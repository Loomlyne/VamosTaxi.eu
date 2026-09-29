-- audit_trigger.test.sql
--
-- Proves the trigger-written half of D-17/D-18: tg_audit_row records before/after diffs,
-- derives actor_kind from app.uid() (no bound JWT -> 'system'; a bound sub -> 'staff'), and the
-- coalesce(id, user_id) adjustment lets the same function work on public.staff, whose primary
-- key is user_id, not id. Also proves the trigger is attached to exactly the 15 drafted tables.
--
-- Run as `postgres` by `supabase test db`.
begin;
select plan(14);

-- Fixtures ------------------------------------------------------------------------------------
insert into auth.users (id, email, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('b0000000-0000-0000-0000-000000000001', 'audit-fixture-staff@vamostaxi.eu', 'authenticated',
        'authenticated', '{}'::jsonb, '{}'::jsonb, now(), now());
insert into public.staff (user_id, role, active, full_name)
values ('b0000000-0000-0000-0000-000000000001', 'dispatcher', true, 'Audit Fixture Dispatcher');

insert into public.customers (full_name, email) values ('Audit Fixture Customer', 'audit-fixture-customer@example.test');

-- (1)-(5): insert, with no identity bound -- actor_kind='system', actor_id is null. -------------
insert into public.vehicle_classes (slug, passenger_capacity, luggage_capacity)
values ('first', 3, 3);

-- DEVIATION (Rule 1, bug fix -- Plan 02-09 seeds three vehicle_classes rows): a bare
-- `table_name = 'vehicle_classes' and action = 'insert'` now also matches the seed's own
-- economy/business/van audit_log rows, either overcounting (1) or raising "more than one row
-- returned by a subquery used as an expression" on (2)-(5)'s scalar comparisons. Every
-- assertion below is additionally scoped to this fixture's own `slug = 'first'` via the
-- recorded after_value, isolating it from the seed's rows regardless of how many exist.
select is(
  (select count(*) from public.audit_log where table_name = 'vehicle_classes' and action = 'insert' and after_value ->> 'slug' = 'first')::int,
  1,
  '(1) one audit_log row for the vehicle_classes insert'
);
select is(
  (select actor_kind from public.audit_log where table_name = 'vehicle_classes' and action = 'insert' and after_value ->> 'slug' = 'first'),
  'system',
  '(2) no bound identity -> actor_kind = ''system'''
);
select ok(
  (select actor_id is null from public.audit_log where table_name = 'vehicle_classes' and action = 'insert' and after_value ->> 'slug' = 'first'),
  '(3) no bound identity -> actor_id is null'
);
select is(
  (select after_value ->> 'slug' from public.audit_log where table_name = 'vehicle_classes' and action = 'insert' and after_value ->> 'slug' = 'first'),
  'first',
  '(4) after_value carries the inserted row (slug)'
);
select ok(
  (select before_value is null from public.audit_log where table_name = 'vehicle_classes' and action = 'insert' and after_value ->> 'slug' = 'first'),
  '(5) an insert has no before_value'
);

-- (6)-(9): update, with request.jwt.claims carrying an active staff sub. -------------------------
select set_config('request.jwt.claims',
  jsonb_build_object('sub', 'b0000000-0000-0000-0000-000000000001', 'role', 'authenticated',
                      'aal', 'aal2')::text, true);

update public.vehicle_classes set sort_order = 9 where slug = 'first';

select is(
  (select actor_kind from public.audit_log where table_name = 'vehicle_classes' and action = 'update' and after_value ->> 'slug' = 'first'),
  'staff',
  '(6) a bound sub -> actor_kind = ''staff'''
);
select is(
  (select actor_id from public.audit_log where table_name = 'vehicle_classes' and action = 'update' and after_value ->> 'slug' = 'first'),
  'b0000000-0000-0000-0000-000000000001'::uuid,
  '(7) actor_id = the bound sub'
);
select ok(
  (select before_value is not null from public.audit_log where table_name = 'vehicle_classes' and action = 'update' and after_value ->> 'slug' = 'first'),
  '(8) an update carries before_value'
);
select ok(
  (select after_value is not null from public.audit_log where table_name = 'vehicle_classes' and action = 'update' and after_value ->> 'slug' = 'first'),
  '(9) an update carries after_value'
);

-- (10)-(11): delete. -------------------------------------------------------------------------
delete from public.vehicle_classes where slug = 'first';

-- after_value is null on a delete row, so this fixture's row is isolated via before_value
-- instead (same reasoning as (1)-(9) above).
select is(
  (select count(*) from public.audit_log where table_name = 'vehicle_classes' and action = 'delete' and before_value ->> 'slug' = 'first')::int,
  1,
  '(10) one audit_log row for the vehicle_classes delete'
);
select ok(
  (select after_value is null from public.audit_log where table_name = 'vehicle_classes' and action = 'delete' and before_value ->> 'slug' = 'first'),
  '(11) a delete has no after_value'
);

select set_config('request.jwt.claims', '', true);

-- (12): customers is attached -- the redaction evidence Phase 10 needs (D-19). -------------------
update public.customers set phone = '+41 00 000 00 00' where email = 'audit-fixture-customer@example.test';
select is(
  (select count(*) from public.audit_log where table_name = 'customers' and action = 'update')::int,
  1,
  '(12) editing a customers row writes an audit_log row (table_name = customers)'
);

-- (13): the coalesce(id, user_id) adjustment -- staff's PK is user_id, not id. -------------------
update public.staff set full_name = 'Renamed Dispatcher' where user_id = 'b0000000-0000-0000-0000-000000000001';
select is(
  (select record_id from public.audit_log where table_name = 'staff' and action = 'update'),
  'b0000000-0000-0000-0000-000000000001',
  '(13) record_id on a staff audit row equals staff.user_id (the PK adjustment works)'
);

-- (14): exactly 15 triggers call tg_audit_row (one per drafted table). --------------------------
-- DEVIATION (Rule 1, bug fix, found while writing Task 2's ...19_append_only.sql): a
-- `tgname like 'audit\_%'` count collides with the table LITERALLY named `audit_log`, which
-- carries its own `audit_log_append_only` / `audit_log_no_truncate` triggers (F-03/D-18) --
-- both names legitimately start with "audit_" too, since the append-only naming convention is
-- `<table>_append_only`/`<table>_no_truncate`. A name-prefix match cannot tell "attached to
-- tg_audit_row" apart from "the table happens to be named audit_log"; filtering by the
-- trigger's OWN function (tgfoid) proves the intended claim regardless of table naming.
select is(
  (select count(*) from pg_trigger where tgfoid = 'public.tg_audit_row()'::regprocedure and not tgisinternal)::int,
  16,
  '(14) exactly 16 triggers (15 drafted + extra_labels, 26.3-07) call tg_audit_row (one per drafted table)'
);

select * from finish();
rollback;
