-- M3_staff_aal2_dropped.sql
--
-- Mutant (D-18 / INT-09 / D-16a): drops the "aal2 once a verified factor exists" clause from
-- app.is_admin(), restoring the pre-26.1-20 shape where a phished password alone opens every
-- admin gate even after the admin enrolled a second factor (audit S1). The staff_aal2_factor
-- suite asserts a verified-factor admin at aal1 is refused, so it must go red.
--
-- TARGET: pgtap:supabase/tests/staff_aal2_factor.test.sql
--
-- The target above must go red when this mutant is applied. Never part of the migration
-- sequence (D-31) -- applied and restored only by `scripts/mutation-gate.mjs`, via
-- `supabase db reset`.
create or replace function app.is_admin() returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(app.jwt() -> 'app_metadata' ->> 'vamos_role', '') = 'admin'
     and exists (
       select 1
         from public.staff s
        where s.user_id = app.uid()
          and s.active
          and s.accepted_at is not null
     )
$$;
