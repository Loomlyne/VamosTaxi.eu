-- 20261002110000_signup_agreement_grant.sql
--
-- Phase 27 plan 17, D-03a and 26.5 D-19. The /sign-up route writes the account agreement as
-- vamos_system (through asSystem). anon and authenticated never get EXECUTE; no table grant;
-- the function body is unchanged.

grant execute on function public.record_account_agreement(
  pg_catalog.text, pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.text,
  pg_catalog.text, pg_catalog.text, pg_catalog.inet) to vamos_system;
