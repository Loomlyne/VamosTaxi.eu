-- Unpaid pending bookings: the signed-in customer can cancel by reference;
-- the hourly cron cancels any still pending after 24 hours. Pending never
-- took a card, so pickup-in-the-past does not block. Not granted to anon.

create or replace function public.checkout_cancel_unpaid(p_reference text)
returns table (booking_id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
  v_email text;
  v_cut integer;
begin
  v_email := lower(nullif(btrim(coalesce(app.jwt() ->> 'email', '')), ''));
  if v_email is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select b.* into v
    from public.bookings b
   where b.reference = p_reference
   for update of b;

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v.status is distinct from 'pending' then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;
  if lower(v.contact_email::text) is distinct from v_email then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update public.booking_legs bl
     set status = 'cancelled'
   where bl.booking_id = v.id
     and bl.status not in ('completed', 'no_show', 'cancelled');
  get diagnostics v_cut = row_count;
  if v_cut = 0 then
    raise exception 'not_cancellable' using errcode = 'P0001';
  end if;

  update public.bookings
     set status = 'cancelled'
   where id = v.id;

  insert into public.booking_events (
    booking_id, booking_leg_id, kind, actor_kind, actor_label,
    from_status, to_status, payload
  ) values (
    v.id, null, 'booking.status_changed', 'customer', 'account cancel',
    v.status, 'cancelled',
    jsonb_build_object('via', 'account_cancel')
  );

  return query select v.id, v.reference::text;
end
$$;

revoke all on function public.checkout_cancel_unpaid(text) from public;
grant execute on function public.checkout_cancel_unpaid(text) to authenticated;

create or replace function public.checkout_expire_unpaid()
returns table (booking_id uuid, reference text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.bookings%rowtype;
  v_cut integer;
begin
  for v in
    select b.*
      from public.bookings b
     where b.status = 'pending'
       and b.created_at < now() - interval '24 hours'
     order by b.created_at
     for update of b skip locked
  loop
    update public.booking_legs bl
       set status = 'cancelled'
     where bl.booking_id = v.id
       and bl.status not in ('completed', 'no_show', 'cancelled');
    get diagnostics v_cut = row_count;
    if v_cut = 0 then
      continue;
    end if;

    update public.bookings
       set status = 'cancelled'
     where id = v.id;

    insert into public.booking_events (
      booking_id, booking_leg_id, kind, actor_kind, actor_label,
      from_status, to_status, payload
    ) values (
      v.id, null, 'booking.status_changed', 'cron', 'unpaid 24h',
      v.status, 'cancelled',
      jsonb_build_object('via', 'expire_unpaid', 'hours', 24)
    );

    booking_id := v.id;
    reference := v.reference;
    return next;
  end loop;
end
$$;

revoke all on function public.checkout_expire_unpaid() from public;
grant execute on function public.checkout_expire_unpaid() to vamos_system;
