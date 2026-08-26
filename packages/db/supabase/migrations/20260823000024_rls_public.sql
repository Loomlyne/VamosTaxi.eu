-- 20260823000024_rls_public.sql
--
-- D-03: vamos_public / anon / authenticated read the four cacheable public-content tables plus
-- one curated settings_public view -- nothing else is ever granted to vamos_public. These four
-- tables plus the view are the whole surface of the cached HYPERDRIVE binding.

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
-- NOT `security_invoker`. That option makes the base table's permission check and RLS run as
-- the caller -- and the caller is anon/vamos_public, which holds no grant and matches no policy
-- on public.settings. Every SiteFooter render and the contact page would get 42501 permission
-- denied for table settings. A view that exists precisely to publish a narrowed subset of a
-- locked table is the textbook case for definer semantics: the view is the grant surface, the
-- WHERE and the column list are the policy. A signed-in customer needs the same footer/contact
-- data as a visitor, so `authenticated` is granted here too, alongside `anon`/`vamos_public`.
create view public.settings_public as
  select phone, email, default_lang, default_currency,
         accepts_card, accepts_twint, accepts_cash
    from public.settings where id = 1;
grant select on public.settings_public to vamos_public, anon, authenticated, vamos_staff;
-- and nothing else: public.settings itself stays revoked from every public role.

-- record_consent()'s grant to anon/authenticated/vamos_guest/vamos_public already lives in
-- ...18_consent_log.sql -- not repeated here.
