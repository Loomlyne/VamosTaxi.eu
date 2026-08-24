-- 20260823000020_rls_enable.sql
--
-- The hard gate of the phase: row-level security enabled on every one of the 29 tables in
-- schema public. Grants (...21-...24) decide WHETHER AT ALL and raise 42501 before any policy
-- runs; RLS decides WHICH ROWS. Both matter, and the grant is the stronger of the two.
--
-- FORCE ROW LEVEL SECURITY is already applied to the nine append-only/ledger tables in
-- ...19_append_only.sql (Plan 02-07). It is deliberately NOT applied to the rest here, because
-- migrations and the seed run as the table owner and must not be filtered by their own RLS.

do $$
declare t text;
begin
  foreach t in array array[
    'settings','settings_versions','vehicle_classes','vehicles','chauffeurs','customers','staff',
    'service_zones','rate_versions','distance_rates','fixed_routes','surcharges','coupons',
    'coupon_redemptions','bookings','booking_legs','booking_access_tokens','booking_reference_counters',
    'price_snapshots','price_snapshot_legs','booking_payments','booking_refunds','stripe_events',
    'booking_notifications','booking_events','audit_log','consent_log','content_strings','reviews'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Coverage assertion: a public table added by a future migration without RLS must fail the
-- reset, not ship open. This is what keeps the 29-table count above honest as the schema grows
-- -- the whole point of this plan being a hard gate rather than a checklist item.
do $$
declare v_ungoverned integer;
begin
  select count(*) into v_ungoverned
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_ungoverned > 0 then
    raise exception 'a public table has RLS disabled (% table(s))', v_ungoverned
      using errcode = 'restrict_violation',
            hint = 'Add the table to the array in this migration''s DO block, or a later migration''s own enable statement.';
  end if;
end $$;
