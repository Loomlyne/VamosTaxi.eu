-- 20260823000023_rls_staff.sql
--
-- DATA-04 / AUTH-05 (D-05: every staff policy is AS RESTRICTIVE, `aal2` required). Five
-- corrections from the adversarial review folded in, each tagged below with its finding id:
--   F-05  the two per-table revoke loops must not name `authenticated` or `vamos_guest` --
--         doing so would strip the grants ...21/...22 just gave them on customers/bookings/
--         booking_legs/price_snapshots/price_snapshot_legs, raising 42501 on every signed-in
--         customer query after a clean reset. `vamos_guest`'s absence is deliberate design
--         (it is absent because ...22 grants it bookings/booking_legs), not luck.
--   F-02  settings_versions removed from the generic working-set loop -- append-only history,
--         select+insert only, admin-only insert policy
--   F-08  booking_access_tokens removed from the generic working-set loop -- token_hash is a
--         bearer credential, not a verifier; staff get select (...) excluding it, plus
--         update (revoked_at) only
--   F-11  stripe_events removed from the generic ledger loop -- payload is the raw Stripe
--         object (cardholder name, billing address, card brand/last four); staff get a
--         column-scoped select excluding payload
--   F-18  the three pricing tables' _admin_update carve-out calls app.rate_version_published(),
--         a SECURITY DEFINER helper, instead of an inline EXISTS against rate_versions -- the
--         inline form evaluates AS vamos_staff, which rate_versions_admin_write (restrictive
--         FOR ALL) hides every row from, collapsing the carve-out to always-false while its own
--         comment promised a dispatcher carve-out

/**
 * F-18: the definer helper the three `_admin_update` policies below call. The naive inline form
 * -- an EXISTS subquery against public.rate_versions written directly inside the policy --
 * evaluates as the INVOKING role (vamos_staff), and rate_versions_admin_write (below, restrictive
 * FOR ALL) hides every row of that table from a dispatcher, making the subquery always return
 * false and silently collapsing the carve-out to `app.is_admin()` alone. SECURITY DEFINER lets
 * this read the table as its owner regardless of the caller's own grants.
 *
 * The obvious repair is wrong and is named here so it is not reinvented: narrowing
 * rate_versions_admin_write from FOR ALL to FOR INSERT, UPDATE, DELETE would restore dispatcher
 * SELECT on rate_versions AND re-open `update rate_versions set status = 'live'` through the
 * permissive rate_versions_staff_all -- the exact hazard the restrictive policy exists to close.
 * `coalesce(bool_or(...), false)` (rather than `exists (select 1 from ...)`) is deliberate
 * phrasing, not a style choice -- it keeps this function's own body from resembling the broken
 * inline pattern it replaces.
 */
create or replace function app.rate_version_published(p_id bigint) returns boolean
  language sql stable security definer set search_path = '' as $$
  select coalesce(bool_or(rv.status <> 'draft'), false)
    from public.rate_versions rv
   where rv.id = p_id
$$;
revoke all on function app.rate_version_published(bigint) from public;
grant execute on function app.rate_version_published(bigint) to vamos_staff;

do $$
declare t text;
begin
  -- The ops working set: SEVENTEEN tables a dispatcher legitimately edits. `settings_versions`
  -- (F-02) and `booking_access_tokens` (F-08) are deliberately absent from this array -- they
  -- get their own column-scoped blocks below, not this loop's blanket CRUD.
  foreach t in array array[
    'chauffeurs','vehicles','vehicle_classes','service_zones','customers','staff',
    'coupons','coupon_redemptions','rate_versions','distance_rates','fixed_routes','surcharges',
    'bookings','booking_legs','settings','content_strings','reviews'
  ] loop
    -- F-05: `authenticated` and `vamos_guest` are NOT named here -- doing so would strip the
    -- grants ...21/...22 just gave them on three of these seventeen tables (customers, bookings,
    -- booking_legs), raising 42501 on every signed-in customer query the moment this file
    -- landed. This per-table revoke is a belt over the ...21 fail-closed baseline (which already
    -- covers every client-facing role on every table), not the primary gate.
    execute format('revoke all on public.%I from anon, vamos_edge, vamos_public', t);
    execute format('grant select, insert, update, delete on public.%I to vamos_staff', t);
    -- DATA-04 + AUTH-05: role claim AND aal2 AND an active staff row, all three (app.is_staff()).
    -- RESTRICTIVE so a permissive policy added later cannot OR its way past it.
    execute format($p$create policy %I on public.%I as restrictive for all to vamos_staff
                      using ((select app.is_staff())) with check ((select app.is_staff()))$p$,
                   t || '_staff_gate', t);
    execute format($p$create policy %I on public.%I for all to vamos_staff
                      using (true) with check (true)$p$, t || '_staff_all', t);
  end loop;

  -- The ledger set: SIX tables, SELECT only, for anyone below the service role. `stripe_events`
  -- (F-11) is deliberately absent -- its own column-scoped block below excludes `payload`.
  --
  -- A dispatcher session (or a stolen dispatcher JWT at aal2) holding INSERT here could forge a
  -- settlement -- `insert into booking_events (kind, actor_kind, actor_label) values
  -- ('payment.succeeded','stripe','Stripe')` -- or a `refund.issued` covering a cash refund
  -- pocketed at the kerb, and the append-only triggers then make the forgery PERMANENT because
  -- nobody, admin included, can delete it. With INSERT on price_snapshots and booking_payments
  -- they could manufacture a paid booking end to end, bypassing the Phase 4 engine entirely.
  foreach t in array array[
    'booking_events','price_snapshots','price_snapshot_legs','booking_payments','booking_refunds',
    'booking_notifications'
  ] loop
    execute format('revoke all on public.%I from anon, vamos_edge, vamos_public, vamos_staff', t);
    execute format('grant select on public.%I to vamos_staff', t);
    execute format($p$create policy %I on public.%I as restrictive for all to vamos_staff
                      using ((select app.is_staff())) with check (false)$p$,
                   t || '_staff_gate', t);
    execute format($p$create policy %I on public.%I for select to vamos_staff
                      using (true)$p$, t || '_staff_read', t);
  end loop;
end $$;

-- F-02: settings_versions is documented immutable (...04_settings.sql, ...19_append_only.sql)
-- and price_snapshots.settings_version_id is `on delete restrict` precisely so a sold booking's
-- policy provenance cannot move -- but the working-set loop above would have handed every
-- dispatcher full CRUD on it. select+insert only (never update/delete -- ...19's append-only
-- revoke already closes those and its trigger raises anyway), plus an admin-only restrictive
-- INSERT policy mirroring rate_versions_admin_write.
revoke all on public.settings_versions from anon, vamos_edge, vamos_public;
grant select, insert on public.settings_versions to vamos_staff;
create policy settings_versions_staff_gate on public.settings_versions
  as restrictive for all to vamos_staff
  using ((select app.is_staff())) with check ((select app.is_staff()));
create policy settings_versions_staff_all on public.settings_versions
  for all to vamos_staff using (true) with check (true);
create policy settings_versions_admin_write on public.settings_versions
  as restrictive for insert to vamos_staff
  with check ((select app.is_admin()));

-- F-08: booking_access_tokens' `token_hash` is compared hash-to-hash by
-- app.booking_has_manage_token and taken DIRECTLY as an argument by manage_booking_cancel, so
-- possession of the hash is possession of the credential -- a dispatcher with a table-wide read
-- would harvest every customer's manage link permanently and gain an unaudited mutation path
-- that records `actor_kind = 'guest'`. The resend-link flow needs id/booking_id/expires_at/
-- revoked_at/use_count and never the hash; token ISSUANCE moves to a SECURITY DEFINER function
-- in Phase 4/7 (see this plan's <deferred> block), which is why INSERT is not granted here.
revoke all on public.booking_access_tokens
  from anon, authenticated, vamos_guest, vamos_edge, vamos_public, vamos_staff;
grant select (id, booking_id, purpose, created_at, expires_at, revoked_at, last_used_at, use_count)
  on public.booking_access_tokens to vamos_staff;
grant update (revoked_at) on public.booking_access_tokens to vamos_staff;
create policy booking_access_tokens_staff_gate on public.booking_access_tokens
  as restrictive for all to vamos_staff
  using ((select app.is_staff())) with check ((select app.is_staff()));
create policy booking_access_tokens_staff_all on public.booking_access_tokens
  for all to vamos_staff using (true) with check (true);

-- F-11: `payload` is the raw Stripe event object -- cardholder name, billing address, email,
-- card brand and last four, and for `customer.*` events the whole customer object. A column
-- grant cannot be conditioned by a policy, so `payload` is simply not granted; an admin-only
-- read, if the ops console ever needs one, is a SECURITY DEFINER function in a later phase.
revoke all on public.stripe_events
  from anon, authenticated, vamos_guest, vamos_edge, vamos_public, vamos_staff;
grant select (id, type, stripe_created, object_id, received_at, processed_at, attempts, last_error)
  on public.stripe_events to vamos_staff;
create policy stripe_events_staff_gate on public.stripe_events
  as restrictive for all to vamos_staff
  using ((select app.is_staff())) with check (false);
create policy stripe_events_staff_read on public.stripe_events
  for select to vamos_staff using (true);

-- Admin-only reads. Evidence, not an ops workflow.
grant select on public.audit_log, public.consent_log to vamos_staff;
create policy audit_log_admin_select on public.audit_log
  for select to vamos_staff using ((select app.is_admin()));
create policy consent_log_admin_select on public.consent_log
  for select to vamos_staff using ((select app.is_admin()));

-- Admin-only writes on the tables that change money or access. FOR ALL, not FOR INSERT --
-- `for insert` would leave UPDATE covered only by the permissive rate_versions_staff_all /
-- staff_all, which would let a dispatcher run `update rate_versions set status='live'`: the
-- launch trigger, the single statement that opens the charge gate on the whole platform, before
-- the owner has approved a CHF matrix. tg_rate_version_transition (...08) is the second lock on
-- the same door.
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
    -- UPDATE stays open to a dispatcher because tg_pricing_row_frozen (...08) has already
    -- narrowed it to the live/available/active availability toggle once the version is
    -- published; on a draft version, `%I_admin_update` closes it. F-18: the carve-out below
    -- calls app.rate_version_published(...) instead of an inline subquery against
    -- rate_versions, which would evaluate as vamos_staff and always fail under the restrictive
    -- rate_versions_admin_write policy above.
    execute format($p$create policy %I on public.%I
                      as restrictive for update to vamos_staff
                      using ((select app.is_admin())
                             or app.rate_version_published(%I.rate_version_id))
                      with check ((select app.is_admin())
                             or app.rate_version_published(%I.rate_version_id))$p$,
                   t || '_admin_update', t, t, t);
  end loop;
end $$;

-- Section 14f: Realtime authorization for the ops board (OPS-01). Postgres Changes is not
-- usable here -- Realtime's Postgres Changes authorizer connects with the staff member's JWT
-- and evaluates RLS as the JWT's `role` claim, which is always `authenticated`, never
-- `vamos_staff` -- a dispatcher would match bookings_select_own, find no customers row with
-- user_id = their uid, and receive zero events forever, with the failure looking like a
-- Realtime configuration problem rather than an RLS one.
--
-- So: Broadcast from the database, on a private `ops:board` channel, authorized by a policy on
-- realtime.messages -- not on any of our tables. No ops table ever joins the supabase_realtime
-- publication, and no permissive `authenticated` policy is added to any ops table; what a
-- dispatcher can SEE is still decided entirely by this file. Guarded so a local stack without
-- realtime.messages does not abort the whole reset. Phase 8 lands the broadcast trigger and the
-- client subscription; this migration lands only the authorization.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $p$create policy ops_board_broadcast_read on realtime.messages
              for select to authenticated
              using (realtime.topic() = 'ops:board' and (select app.is_staff()))$p$;
    -- Clients never publish on this topic; only the database does.
    execute $p$create policy ops_board_broadcast_no_write on realtime.messages
              as restrictive for insert to authenticated with check (false)$p$;
  else
    raise notice 'realtime.messages absent -- Realtime policies skipped (local stack without realtime)';
  end if;
end $$;
