-- launch-purge-2026-10-08.sql
--
-- Owner-run, once, in the Supabase SQL editor (project VamosTaxi, eu-central-2), before go-live.
-- Removes every test booking, payment, ticket, customer, chauffeur and calendar row.
-- Keeps: pricing, routes, zones, surcharges, coupons, rate versions, settings, content strings,
--        vehicle classes, staff, audit_log, booking_reference_counters.
-- Also keeps the 2 real customers and their data:
--        mariamahdouni@gmail.com (booking VT-26-0754, a guest booking) and wasis8173@gmail.com.
--
-- All-or-nothing: any error rolls the whole thing back. Read the counts at the end before COMMIT.
-- session_replication_role = replica skips FK and append-only triggers for this transaction only
-- (bookings and price_snapshots reference each other, booking_events is append-only).

begin;
set local session_replication_role = replica;

do $$
declare kb uuid[]; kc uuid[]; ks uuid[];
begin
  select coalesce(array_agg(id), '{}') into kb from public.bookings where reference = 'VT-26-0754';
  select coalesce(array_agg(id), '{}') into kc from public.customers
   where id in ('826c79bd-6329-4e99-b3ce-04f81a27fc28', '1c8fab88-9a13-4442-88f5-0fdae95b6baf');
  select coalesce(array_agg(id), '{}') into ks from public.price_snapshots where booking_id = any(kb);
  if cardinality(kb) <> 1 or cardinality(kc) <> 2 then
    raise exception 'keep-set wrong: % bookings, % customers', cardinality(kb), cardinality(kc);
  end if;

  -- support tickets
  delete from public.contact_delivery_outbox;
  delete from public.support_message_files;
  delete from public.support_messages;
  delete from public.contact_submissions;
  delete from public.support_inbound_events;

  -- bookings and everything hanging off them
  delete from public.reviews where not booking_id = any(kb);
  delete from public.booking_legs where not booking_id = any(kb);
  delete from public.booking_access_tokens where not booking_id = any(kb);
  delete from public.booking_refund_intents where not booking_id = any(kb);
  delete from public.booking_refunds where not booking_id = any(kb);
  delete from public.booking_payments where not booking_id = any(kb);
  delete from public.booking_notifications where not booking_id = any(kb);
  delete from public.coupon_redemptions;
  delete from public.booking_events where not booking_id = any(kb);
  delete from public.booking_edit_requests where not booking_id = any(kb);
  delete from public.booking_disputes where not booking_id = any(kb);
  delete from public.meta_purchase_events where not booking_id = any(kb);
  delete from public.account_agreement_records where booking_id is not null and not booking_id = any(kb);
  delete from public.price_snapshot_legs where not snapshot_id = any(ks);
  delete from public.price_snapshots where not id = any(ks);
  delete from public.bookings where not id = any(kb);
  delete from public.consent_log where not (booking_id = any(kb) or customer_id = any(kc));
  delete from public.checkout_pay_presses;
  delete from public.stripe_events;

  -- calendar, chauffeurs, digests
  delete from public.chauffeur_leave_ranges;
  delete from public.vehicle_seats;
  delete from public.chauffeurs;
  delete from public.vehicles;
  delete from public.staff_daily_digests;
  delete from public.account_finish_pending;

  -- customers
  delete from public.customers where not id = any(kc);
end $$;

-- Sign-in accounts of the deleted customers (never staff, never the 2 kept).
-- FK cascades must run here, so replication role goes back to normal first.
set local session_replication_role = origin;
delete from auth.users u
 where u.email not in ('mariamahdouni@gmail.com', 'wasis8173@gmail.com')
   and not exists (select 1 from public.staff s where s.user_id = u.id);

-- Check before COMMIT. Expect: bookings 1, customers 2, auth_users 4 (koussayzayeni, vamostaxich once invited, + 2 kept; 3 if not invited yet),
-- everything else 0 except pricing/route tables.
select (select count(*) from public.bookings) bookings,
       (select count(*) from public.booking_payments) payments,
       (select count(*) from public.customers) customers,
       (select count(*) from public.contact_submissions) tickets,
       (select count(*) from public.chauffeurs) chauffeurs,
       (select count(*) from auth.users) auth_users,
       (select count(*) from public.fixed_routes) routes,
       (select count(*) from public.rate_versions) rate_versions;

commit;
