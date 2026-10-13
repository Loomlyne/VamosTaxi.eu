-- 20261012250000_pricing_staff_policies.sql
--
-- Owner-signed fix: .planning/decisions/2026-10-13-p30-ship-p31-lines-rls-fix.md item 2,
-- finding D-30-03-1.
--
-- public.distance_bands (20260906000001) and public.rate_version_rules (20260913180000) carry only
-- RESTRICTIVE policies for vamos_staff. Postgres grants row access only when at least one PERMISSIVE
-- policy passes, so every staff session saw zero rows: Pricing could not save a city-pair extra or a
-- distance band, and forkLiveRateVersion silently copied none of them into a new draft.
--
-- This mirrors distance_rates (20260823000023_rls_staff.sql): a permissive using(true) / with check(true)
-- policy for vamos_staff next to the restrictive gate. Here the existing restrictive `*_staff_all`
-- policies (role claim + aal2 + active staff row, app.is_staff()) already play the gate role.
--
-- Everything else stays and still applies on top of these policies: the restrictive is_staff gate, the
-- admin-only insert / update / delete policies, and the frozen triggers (tg_pricing_row_frozen: rows of a
-- published price book are immutable). No grant change, no data change.
--
-- region_premiums has the same restrictive-only shape. It is deliberately NOT changed here (not in the
-- signed scope).

drop policy if exists distance_bands_staff_read_write on public.distance_bands;
create policy distance_bands_staff_read_write on public.distance_bands
  as permissive for all to vamos_staff
  using (true) with check (true);

drop policy if exists rate_version_rules_staff_read_write on public.rate_version_rules;
create policy rate_version_rules_staff_read_write on public.rate_version_rules
  as permissive for all to vamos_staff
  using (true) with check (true);
