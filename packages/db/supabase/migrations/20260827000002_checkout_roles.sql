-- 20260827000002_checkout_roles.sql
--
-- Deliberate deviation from 07-CONTEXT.md's <specifics> sketch
-- (`grant execute` on the checkout RPC for Data API roles anon/authenticated):
-- Supabase's Data API is enabled over the `public` schema (`config.toml` `[api]
-- schemas = ["public", …]`), so a function executable by the Data API anon role is
-- callable by anyone holding the publishable key. `checkout_create_booking`
-- (plan 07-02) calls `public.next_booking_reference()`, whose EXECUTE was revoked from
-- `anon`/`authenticated` in `…010_bookings.sql` for exactly the counter-exhaustion threat
-- T-02-13 names — "let any session call it until the year's serial space is exhausted,
-- permanently breaking booking creation for the rest of the calendar year". Granting the
-- checkout RPC for the Data API anon role re-opens T-02-13 through the Data API. The project's own answer
-- already exists: `manage_booking_cancel()` is granted to `vamos_guest`, a nologin role
-- reachable only by `vamos_edge`'s `SET ROLE` and never by PostgREST. These two roles
-- apply the same shape to the two Phase 7 write paths.

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'vamos_checkout') then
    -- the anonymous or signed-in customer's checkout write path; holds EXECUTE on
    -- public.checkout_create_booking and nothing else (plan 07-02 issues that grant).
    create role vamos_checkout nologin;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'vamos_system') then
    -- the non-user, server-triggered identity: the Stripe webhook fetch handler, the
    -- Queue consumer's settlement state machine, and the notification sweep; holds
    -- EXECUTE on plan 07-03's settlement/notification RPCs and nothing else.
    create role vamos_system nologin;
  end if;
end $$;

-- Without SET, every pgTAP test in this phase that impersonates either role fails with
-- "permission denied to set role". GRANT re-issued by the same grantor merges into the
-- existing membership row (same idiom as …002_roles_and_helpers.sql).
grant vamos_checkout to postgres with inherit false, set true;
grant vamos_system   to postgres with inherit false, set true;

-- The SET ROLE path plan 07-04's withIdentity uses.
grant vamos_checkout to vamos_edge with inherit false, set true;
grant vamos_system   to vamos_edge with inherit false, set true;

-- Belt on the Supabase default-privileges surface, so both roles start at literally
-- zero and each later grant is explicit and greppable.
revoke all on all tables in schema public from vamos_checkout, vamos_system;
revoke all on all sequences in schema public from vamos_checkout, vamos_system;
revoke all on all functions in schema public from vamos_checkout, vamos_system;

-- Neither role reaches the app helper schema directly.
revoke all on schema app from vamos_checkout, vamos_system;

-- F-21: both roles are SET-able by whoever holds the vamos_edge password, so they
-- raise no new secret-tier question, and neither may ever hold membership in
-- anon, authenticated, vamos_public or vamos_staff.
