-- 20260912033121_booking_lifecycle_ops_complete.sql
--
-- 09-11 Task 1: ops_mark_complete / ops_mark_no_show.
-- Hosted apply is 09-11 Task 3, not this file. Charge gate untouched.
-- D-31: only ops marks Completed and No-show. Paid no-show does not auto-refund.
-- D-17: Worker sends review-request after success; this RPC may store a manage token hash.

create function app.ops_mark_booking_outcome(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid,
  p_outcome public.booking_status,
  p_review_token_hash pg_catalog.bytea
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  email pg_catalog.text,
  name pg_catalog.text,
  locale pg_catalog.text,
  paid pg_catalog.bool,
  pickup_text pg_catalog.text,
  dropoff_text pg_catalog.text,
  scheduled_local pg_catalog.text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_booking public.bookings%rowtype;
  v_actor_label pg_catalog.text;
  v_from public.booking_status;
  v_paid pg_catalog.bool;
  v_to public.booking_status;
  v_pickup pg_catalog.text;
  v_dropoff pg_catalog.text;
  v_when pg_catalog.text;
  v_actor_id pg_catalog.uuid;
begin
  if p_outcome is distinct from 'completed'::public.booking_status
     and p_outcome is distinct from 'no_show'::public.booking_status then
    raise exception 'invalid-outcome' using errcode = 'P0001';
  end if;

  select b.*
    into v_booking
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null
   for update;

  if not found then
    raise exception 'not-found' using errcode = 'P0002';
  end if;

  if v_booking.status in (
       'completed'::public.booking_status,
       'cancelled'::public.booking_status,
       'refunded'::public.booking_status,
       'no_show'::public.booking_status,
       'partially_cancelled'::public.booking_status,
       'partially_completed'::public.booking_status
     ) then
    raise exception 'frozen' using errcode = 'P0001';
  end if;

  select exists (
    select 1
      from public.booking_payments as p
     where p.booking_id = v_booking.id
       and p.captured_at is not null
  ) into v_paid;

  select coalesce(s.full_name, '')
    into v_actor_label
    from public.staff as s
   where s.user_id = p_actor_id;

  if v_actor_label is null then
    v_actor_label := '';
  end if;

  if p_actor_id is not null
     and exists (select 1 from auth.users as u where u.id = p_actor_id) then
    v_actor_id := p_actor_id;
  else
    v_actor_id := null;
  end if;

  v_from := v_booking.status;

  update public.booking_legs
     set status = p_outcome,
         updated_at = pg_catalog.now()
   where booking_id = v_booking.id
     and status not in (
       'completed'::public.booking_status,
       'no_show'::public.booking_status,
       'cancelled'::public.booking_status
     );

  perform public.recompute_booking_status(v_booking.id);

  select b.status
    into v_to
    from public.bookings as b
   where b.id = v_booking.id;

  insert into public.booking_events (
    booking_id,
    kind,
    actor_kind,
    actor_id,
    actor_label,
    from_status,
    to_status,
    payload
  ) values (
    v_booking.id,
    'booking.status_changed',
    'staff',
    v_actor_id,
    v_actor_label,
    v_from,
    v_to,
    pg_catalog.jsonb_build_object(
      'via', 'ops',
      'paid', v_paid,
      'outcome', p_outcome::pg_catalog.text
    )
  );

  if p_review_token_hash is not null
     and pg_catalog.octet_length(p_review_token_hash) = 32 then
    insert into public.booking_access_tokens (
      booking_id,
      token_hash,
      purpose,
      expires_at
    ) values (
      v_booking.id,
      p_review_token_hash,
      'manage',
      'infinity'::pg_catalog.timestamptz
    );
  end if;

  select l.pickup_text, l.dropoff_text, l.scheduled_local
    into v_pickup, v_dropoff, v_when
    from public.booking_legs as l
   where l.booking_id = v_booking.id
   order by l.leg_seq
   limit 1;

  return query
    select v_booking.id,
           v_booking.reference,
           v_booking.contact_email::pg_catalog.text,
           v_booking.contact_name,
           coalesce(v_booking.locale, 'en'),
           v_paid,
           v_pickup,
           v_dropoff,
           v_when;
  return;
end
$$;

create function public.ops_mark_complete(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid,
  p_review_token_hash pg_catalog.bytea default null
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  email pg_catalog.text,
  name pg_catalog.text,
  locale pg_catalog.text,
  paid pg_catalog.bool,
  pickup_text pg_catalog.text,
  dropoff_text pg_catalog.text,
  scheduled_local pg_catalog.text
)
language sql
security definer
set search_path = ''
as $$
  select *
    from app.ops_mark_booking_outcome(
      p_booking_id,
      p_actor_id,
      'completed'::public.booking_status,
      p_review_token_hash
    );
$$;

create function public.ops_mark_no_show(
  p_booking_id pg_catalog.uuid,
  p_actor_id pg_catalog.uuid,
  p_review_token_hash pg_catalog.bytea default null
)
returns table (
  booking_id pg_catalog.uuid,
  reference pg_catalog.text,
  email pg_catalog.text,
  name pg_catalog.text,
  locale pg_catalog.text,
  paid pg_catalog.bool,
  pickup_text pg_catalog.text,
  dropoff_text pg_catalog.text,
  scheduled_local pg_catalog.text
)
language sql
security definer
set search_path = ''
as $$
  select *
    from app.ops_mark_booking_outcome(
      p_booking_id,
      p_actor_id,
      'no_show'::public.booking_status,
      p_review_token_hash
    );
$$;

revoke all on function app.ops_mark_booking_outcome(
  pg_catalog.uuid,
  pg_catalog.uuid,
  public.booking_status,
  pg_catalog.bytea
) from public;

revoke all on function public.ops_mark_complete(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.bytea
) from public;

revoke all on function public.ops_mark_no_show(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.bytea
) from public;

grant execute on function public.ops_mark_complete(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.bytea
) to vamos_system;

grant execute on function public.ops_mark_no_show(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.bytea
) to vamos_system;

comment on function public.ops_mark_complete(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.bytea
) is
  '09-11 D-31: ops marks legs completed, recomputes booking status, writes booking.events. No refund. EXECUTE vamos_system only.';

comment on function public.ops_mark_no_show(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.bytea
) is
  '09-11 D-31: ops marks legs no_show, recomputes booking status, writes booking.events. Paid no-show does not auto-refund. EXECUTE vamos_system only.';

-- Account list needs to see the customer's own unpublished review row (D-21 Reviewed chip).
-- Customer identity is `authenticated` (PG_ROLE.customer), not a vamos_customer role.
-- Own-booking only (contact_email / customers.user_id). Never all reviews with a booking_id.
do $grant$
begin
  if exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename = 'reviews'
       and policyname = 'reviews_customer_own_booking'
  ) then
    return;
  end if;
  execute $pol$
    create policy reviews_customer_own_booking on public.reviews
      for select to authenticated
      using (
        booking_id is not null
        and exists (
          select 1
            from public.bookings as b
           where b.id = reviews.booking_id
             and (
               (b.customer_id in (
                 select c.id from public.customers as c
                  where c.user_id = (select app.uid())
               ))
               or (
                 b.contact_email is not null
                 and pg_catalog.length(pg_catalog.btrim(b.contact_email::pg_catalog.text)) > 0
                 and pg_catalog.lower(b.contact_email::pg_catalog.text)
                   = pg_catalog.lower(
                       nullif((select app.jwt() ->> 'email'::pg_catalog.text), ''::pg_catalog.text)
                     )
               )
             )
        )
      )
  $pol$;
end
$grant$;
