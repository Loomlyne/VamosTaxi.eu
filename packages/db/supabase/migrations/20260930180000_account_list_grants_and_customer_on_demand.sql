-- 20260930180000_account_list_grants_and_customer_on_demand.sql
--
-- Quick 260929-acl. Two live account faults after the 26.3 ship:
--   1. GET /api/account/bookings selects bookings.pay_link_sent_at and bookings.is_test as role
--      `authenticated`, which holds no column grant on either (42501 -> 500 -> "no bookings").
--      Live also drifted on is_test, so both are granted here; GRANT is idempotent.
--   2. An auth user with no public.customers row (signed up before the link trigger, or the row
--      was never made) never links guest bookings. The row is now created ON DEMAND.
--
-- Additive: one grant, one private helper, two function bodies replaced (signatures, grants and
-- every other behaviour identical to 20260930120000 and 20260930100000).

grant select (pay_link_sent_at, is_test) on public.bookings to authenticated;

-- ---------------------------------------------------------------------------
-- app.ensure_customer_for_user: same conflict rule as tg_link_customer_on_signup
-- (20260828000001): upsert by e-mail among live (erased_at is null) rows and set user_id only
-- when it is null. A confirmed auth e-mail is required, so nobody links an address they have
-- not proved. Erased customers are never touched. Returns the customers.id or null.
-- ---------------------------------------------------------------------------
create or replace function app.ensure_customer_for_user(p_user_id pg_catalog.uuid)
returns pg_catalog.uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email pg_catalog.text;
  v_confirmed pg_catalog.timestamptz;
  v_name pg_catalog.text;
  v_id pg_catalog.uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  select c.id into v_id from public.customers c
   where c.user_id = p_user_id and c.erased_at is null;
  if v_id is not null then
    return v_id;
  end if;

  -- An erased row that still names this user blocks a new one (user_id is unique).
  if exists (select 1 from public.customers c where c.user_id = p_user_id) then
    return null;
  end if;

  select u.email, u.email_confirmed_at, coalesce(u.raw_user_meta_data->>'full_name', '')
    into v_email, v_confirmed, v_name
    from auth.users u where u.id = p_user_id;
  if v_email is null or pg_catalog.btrim(v_email) = '' or v_confirmed is null then
    return null;
  end if;

  insert into public.customers (user_id, email, full_name)
  values (p_user_id, v_email, v_name)
  on conflict (email) where erased_at is null
  do update
    set user_id = excluded.user_id,
        updated_at = pg_catalog.now()
    where public.customers.user_id is null;

  select c.id into v_id from public.customers c
   where c.user_id = p_user_id and c.erased_at is null;
  return v_id;
end
$$;

revoke all on function app.ensure_customer_for_user(pg_catalog.uuid) from public;

comment on function app.ensure_customer_for_user(pg_catalog.uuid) is
  'Quick 260929-acl: customers.id for a CONFIRMED auth user, creating or linking the row by e-mail (same rule as tg_link_customer_on_signup). Null for unconfirmed, erased or e-mail owned by another user. No caller EXECUTE: reached only through the definer RPCs below.';

-- ---------------------------------------------------------------------------
-- customer_claim_guest_bookings: 20260930120000 body, with the customer looked up on demand.
-- ---------------------------------------------------------------------------
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

  v_customer := app.ensure_customer_for_user(v_uid);
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
  'D-32: links guest bookings (customer_id null) whose contact_email equals the caller''s CONFIRMED auth e-mail; one booking.linked event each; returns the count. Creates the customers row on demand (app.ensure_customer_for_user). Unconfirmed e-mail: 0. EXECUTE: authenticated.';

-- ---------------------------------------------------------------------------
-- customer_id_for_user: 20260930100000 contract (vamos_checkout only, null for none or erased),
-- now creating the row on demand for a confirmed user. Volatile because it may insert.
-- ---------------------------------------------------------------------------
create or replace function public.customer_id_for_user(p_user_id pg_catalog.uuid)
returns pg_catalog.uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  return app.ensure_customer_for_user(p_user_id);
end
$$;

revoke all on function public.customer_id_for_user(pg_catalog.uuid) from public;
grant execute on function public.customer_id_for_user(pg_catalog.uuid) to vamos_checkout;

comment on function public.customer_id_for_user(pg_catalog.uuid) is
  '26.3-01 D-32: customers.id for a verified auth user id, created on demand when the user is confirmed (null when unconfirmed or erased). EXECUTE: vamos_checkout only.';
