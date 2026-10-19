-- 20261019000000_staff_insert_service_role.sql
--
-- The staff invite (apps/web/app/[locale]/(ops)/api/staff/invite/route.ts, the only service-role write)
-- inserts the public.staff row with the service-role key. Until now that INSERT came from Supabase's
-- project default ("grant all on tables to service_role" for tables postgres creates), never from a
-- migration of ours. The first from-zero run on a GitHub runner (PR #86, 2026-10-19, Supabase CLI
-- 2.115.0, Postgres 17 image) came up without it and pgTAP test 25 of
-- db_privilege_hardening.test.sql failed: "service_role keeps what the staff invite needs: INSERT on
-- public.staff". The schema now states the grant itself, so the invite does not depend on an image
-- default. Idempotent on a database that already has it. No data change, no CHF amounts.
-- Applied by the controller verbatim after Ship; never `supabase db push`.

grant insert on table public.staff to service_role;
