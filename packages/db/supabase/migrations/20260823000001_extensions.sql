-- 20260823000001_extensions.sql
--
-- Foundation extensions this schema needs before any table exists (D-20, research
-- local-toolchain-probe.md "pgTAP install path for P1"): pgtap (1.3.3), citext (1.6) and
-- btree_gist (1.7) are available on the local Postgres image but NOT installed by default —
-- there is no CLI/config toggle that installs them for you, so each must be created here as
-- a real migration statement.
create schema if not exists extensions;
grant usage on schema extensions to public;

create extension if not exists pgcrypto  with schema extensions;  -- gen_random_uuid()
create extension if not exists btree_gist with schema extensions; -- equality + range in one GiST index (Phase 8 booking_legs exclusion constraints)
create extension if not exists citext     with schema extensions; -- case-insensitive email (customers.email, bookings.contact_email — Plan 02-03)
create extension if not exists pgtap      with schema extensions; -- supabase test db

-- citext must land in THIS, the first, migration: without it, the customers_and_staff
-- migration (Plan 02-03) aborts with `type "citext" does not exist` and the whole
-- `supabase db reset` gate red-lines before a single pgTAP file runs (02-SCHEMA-DRAFT.md §1).
--
-- Every later migration resolves citext, gen_random_uuid() and the btree_gist opclasses
-- through this search_path. Set on the database so a fresh `supabase db reset` session
-- inherits it, and repeated as `set local search_path = public, extensions;` at the top of
-- any migration file written by a session that connects with a different default.
alter database postgres set search_path = "$user", public, extensions;
