-- 20260930120000_claim_guest_bookings.sql
--
-- Plan 26.3-07 Task 2 (D-32, T-26.3-07-04): a signed-in customer with a CONFIRMED e-mail links
-- the guest bookings made with that same e-mail. An unconfirmed e-mail links nothing, so
-- signing up with someone else's address never exposes their trips. Idempotent: only rows with
-- customer_id null are touched, and each link writes one booking.linked event.

alter table public.booking_events drop constraint booking_events_kind_check;
alter table public.booking_events
  add constraint booking_events_kind_check
  check (kind = any (array[
    'booking.created', 'booking.status_changed', 'booking.modified', 'booking.claimed',
    'booking.revived', 'booking.linked', 'price.quoted', 'price.repriced', 'price.superseded',
    'payment.intent_created', 'payment.succeeded', 'payment.failed', 'payment.duplicate',
    'refund.requested', 'refund.issued', 'refund.declined', 'refund.rejected',
    'assignment.chauffeur_set', 'assignment.vehicle_set', 'assignment.cleared',
    'flight.delayed', 'note.added', 'flight.autofilled', 'review.submitted'
  ]::text[]));

create or replace function public.customer_claim_guest_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_customer uuid;
  v_count integer := 0;
  r record;
begin
  if v_uid is null then
    return 0;
  end if;

  select u.email, u.email_confirmed_at into v_email, v_confirmed
    from auth.users u where u.id = v_uid;
  if v_email is null or btrim(v_email) = '' or v_confirmed is null then
    return 0;
  end if;

  select c.id into v_customer from public.customers c
   where c.user_id = v_uid and c.erased_at is null;
  if v_customer is null then
    return 0;
  end if;

  for r in
    update public.bookings b
       set customer_id = v_customer
     where b.customer_id is null
       and b.erased_at is null
       and lower(b.contact_email::text) = lower(v_email)
    returning b.id
  loop
    insert into public.booking_events (booking_id, kind, actor_kind, actor_id, actor_label, payload)
    values (r.id, 'booking.linked', 'customer', v_uid, 'confirmed e-mail',
            jsonb_build_object('via', 'claim_guest_bookings'));
    v_count := v_count + 1;
  end loop;

  return v_count;
end
$$;

revoke all on function public.customer_claim_guest_bookings() from public;
grant execute on function public.customer_claim_guest_bookings() to authenticated;

comment on function public.customer_claim_guest_bookings() is
  'D-32: links guest bookings (customer_id null) whose contact_email equals the caller''s CONFIRMED auth e-mail; one booking.linked event each; returns the count. Unconfirmed e-mail or no customers row: 0. EXECUTE: authenticated.';
