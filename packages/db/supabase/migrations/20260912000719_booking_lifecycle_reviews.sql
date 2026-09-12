-- 20260912000719_booking_lifecycle_reviews.sql
--
-- 09-03: reviews.booking_id + star columns + submit_review RPCs.
-- Hosted apply is 09-04, not this plan. Charge gate untouched. No CHF.

alter table public.reviews
  add column booking_id uuid references public.bookings(id) on delete restrict,
  add column rating_company smallint,
  add column rating_chauffeur smallint,
  add column rating_overall smallint,
  add column photo_path text,
  add constraint reviews_booking_id_key unique (booking_id),
  add constraint reviews_rating_company_check
    check (rating_company is null or rating_company between 1 and 5),
  add constraint reviews_rating_chauffeur_check
    check (rating_chauffeur is null or rating_chauffeur between 1 and 5),
  add constraint reviews_rating_overall_check
    check (rating_overall is null or rating_overall between 1 and 5);

comment on column public.reviews.booking_id is
  '09-03 D-21: unique one customer review per booking. Null for imported seed. ON DELETE RESTRICT.';
comment on column public.reviews.rating_company is
  '09-03 D-19: 1–5 required on customer submit; null for imported seed.';
comment on column public.reviews.rating_chauffeur is
  '09-03 D-19: 1–5 required on customer submit; null for imported seed.';
comment on column public.reviews.rating_overall is
  '09-03 D-19: 1–5 required on customer submit; null for imported seed. Copied onto rating for home.';
comment on column public.reviews.photo_path is
  '09-03 D-19: optional R2 object key. Upload is 09-12.';
comment on column public.reviews.published is
  'D-20: imported seed defaults true; customer submit_review inserts false. Ops publish/hide unchanged.';

-- ---------------------------------------------------------------------------
-- booking_events.kind: additive review.submitted (CHECK is closed).
-- ---------------------------------------------------------------------------
alter table public.booking_events
  drop constraint booking_events_kind_check;

alter table public.booking_events
  add constraint booking_events_kind_check
  check (kind in (
    'booking.created',
    'booking.status_changed',
    'booking.modified',
    'booking.claimed',
    'price.quoted',
    'price.repriced',
    'price.superseded',
    'payment.intent_created',
    'payment.succeeded',
    'payment.failed',
    'refund.requested',
    'refund.issued',
    'assignment.chauffeur_set',
    'assignment.vehicle_set',
    'assignment.cleared',
    'flight.delayed',
    'note.added',
    'flight.autofilled',
    'review.submitted'
  ));

comment on constraint booking_events_kind_check on public.booking_events is
  'Nineteen kinds. review.submitted (09-03 LIFE-08) is additive; flight.autofilled stays distinct from flight.delayed.';

-- ---------------------------------------------------------------------------
-- Shared insert. Caller holds the bookings row lock.
-- D-18: succeeded payment AND status NOT IN (quote, pending, cancelled, partially_cancelled).
-- Cancelled never, even after Stripe refund. Unpaid never.
-- ---------------------------------------------------------------------------
create function app.insert_customer_review(
  p_booking_id pg_catalog.uuid,
  p_company pg_catalog.int2,
  p_chauffeur pg_catalog.int2,
  p_overall pg_catalog.int2,
  p_comment pg_catalog.text,
  p_photo_path pg_catalog.text,
  p_actor_kind pg_catalog.text,
  p_actor_label pg_catalog.text
) returns pg_catalog.uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.bookings%rowtype;
  v_review_id pg_catalog.uuid;
begin
  select b.*
    into v
    from public.bookings as b
   where b.id = p_booking_id;

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if v.status in (
       'quote'::public.booking_status,
       'pending'::public.booking_status,
       'cancelled'::public.booking_status,
       'partially_cancelled'::public.booking_status
     ) then
    raise exception 'not_reviewable' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
      from public.booking_payments as p
     where p.booking_id = v.id
       and p.status = 'succeeded'
  ) then
    raise exception 'not_reviewable' using errcode = 'P0001';
  end if;

  if p_company is null or p_chauffeur is null or p_overall is null
     or p_company < 1 or p_company > 5
     or p_chauffeur < 1 or p_chauffeur > 5
     or p_overall < 1 or p_overall > 5 then
    raise exception 'invalid_rating' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.reviews as r where r.booking_id = v.id
  ) then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;

  insert into public.reviews (
    booking_id,
    source,
    author_name,
    body,
    rating,
    rating_company,
    rating_chauffeur,
    rating_overall,
    photo_path,
    verified,
    published
  ) values (
    v.id,
    'manual'::public.review_source,
    v.contact_name,
    coalesce(p_comment, ''),
    p_overall,
    p_company,
    p_chauffeur,
    p_overall,
    p_photo_path,
    true,
    false
  )
  returning id into v_review_id;

  insert into public.booking_events (
    booking_id, kind, actor_kind, actor_label, payload
  ) values (
    v.id,
    'review.submitted',
    p_actor_kind,
    p_actor_label,
    pg_catalog.jsonb_build_object(
      'review_id', v_review_id,
      'rating_company', p_company,
      'rating_chauffeur', p_chauffeur,
      'rating_overall', p_overall
    )
  );

  return v_review_id;
exception
  when unique_violation then
    raise exception 'already_reviewed' using errcode = 'P0001';
end;
$$;

revoke all on function app.insert_customer_review(
  pg_catalog.uuid, pg_catalog.int2, pg_catalog.int2, pg_catalog.int2,
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.text
) from public;

-- ---------------------------------------------------------------------------
-- Guest token submit. D-21: hash match + not revoked; do not check expires_at.
-- Token miss = generic not_found P0002.
-- ---------------------------------------------------------------------------
create function public.submit_review(
  p_token_hash bytea,
  p_company smallint,
  p_chauffeur smallint,
  p_overall smallint,
  p_comment text,
  p_photo_path text
) returns table (
  review_id pg_catalog.uuid,
  booking_id pg_catalog.uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.bookings%rowtype;
  v_review_id pg_catalog.uuid;
begin
  select b.*
    into v
    from public.bookings as b
    join public.booking_access_tokens as t on t.booking_id = b.id
   where t.token_hash = p_token_hash
     and t.revoked_at is null
   for update of b;

  if v.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_review_id := app.insert_customer_review(
    v.id,
    p_company,
    p_chauffeur,
    p_overall,
    p_comment,
    p_photo_path,
    'guest',
    'manage link'
  );

  update public.booking_access_tokens
     set last_used_at = pg_catalog.now(),
         use_count = use_count + 1
   where token_hash = p_token_hash
     and revoked_at is null;

  review_id := v_review_id;
  booking_id := v.id;
  return next;
end;
$$;

revoke all on function public.submit_review(bytea, smallint, smallint, smallint, text, text) from public;
revoke all on function public.submit_review(bytea, smallint, smallint, smallint, text, text) from anon, authenticated;
grant execute on function public.submit_review(bytea, smallint, smallint, smallint, text, text) to vamos_guest;

comment on function public.submit_review(bytea, smallint, smallint, smallint, text, text) is
  '09-03 D-18/D-19/D-21: guest review submit. Forever token (no expires_at). Unique booking_id. published false. EXECUTE vamos_guest.';

-- ---------------------------------------------------------------------------
-- Signed-in submit. Worker owns asCustomer / JWT email check.
-- ---------------------------------------------------------------------------
create function public.submit_review_customer(
  p_booking_id uuid,
  p_company smallint,
  p_chauffeur smallint,
  p_overall smallint,
  p_comment text,
  p_photo_path text
) returns table (
  review_id pg_catalog.uuid,
  booking_id pg_catalog.uuid
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v public.bookings%rowtype;
  v_review_id pg_catalog.uuid;
begin
  select b.*
    into v
    from public.bookings as b
   where b.id = p_booking_id
     and b.erased_at is null
   for update;

  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_review_id := app.insert_customer_review(
    v.id,
    p_company,
    p_chauffeur,
    p_overall,
    p_comment,
    p_photo_path,
    'customer',
    'account'
  );

  review_id := v_review_id;
  booking_id := v.id;
  return next;
end;
$$;

revoke all on function public.submit_review_customer(uuid, smallint, smallint, smallint, text, text) from public;
revoke all on function public.submit_review_customer(uuid, smallint, smallint, smallint, text, text) from anon, authenticated;
grant execute on function public.submit_review_customer(uuid, smallint, smallint, smallint, text, text) to vamos_system;

comment on function public.submit_review_customer(uuid, smallint, smallint, smallint, text, text) is
  '09-03: signed-in review submit. Same D-18/D-19 rules. EXECUTE vamos_system. Worker owns ownership check. No customer UPDATE.';
