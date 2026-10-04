begin;
set local session_replication_role = replica;
-- A fare captured at 00:30 Zurich on 2026-10-04 (22:30 UTC on the 3rd), on the lab's unpaid row 26.
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, status, captured_at, created_at)
select b.id, s.id, 'pi_lab_dash_boundary', 5000, 'succeeded', '2026-10-03 22:30:00+00', '2026-10-03 22:30:00+00'
  from public.bookings b join public.price_snapshots s on s.booking_id = b.id where b.reference = 'VT-26-9026';
select 'session TimeZone', current_setting('TimeZone');
select 'old: ''2026-10-04''::date at time zone', count(*), sum(charged_rappen)
  from public.booking_payments p where p.captured_at is not null and p.captured_at >= ('2026-10-04'::date at time zone 'Europe/Zurich');
select 'new: ''2026-10-03T22:00:00.000Z''::timestamptz', count(*), sum(charged_rappen)
  from public.booking_payments p where p.captured_at is not null and p.captured_at >= '2026-10-03T22:00:00.000Z'::timestamptz;
rollback;
