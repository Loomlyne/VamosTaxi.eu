-- 20260823000015_coupon_redemptions.sql
--
-- D-29 (ADR-014 §6): coupon consumption happens at PAYMENT, never at an abandoned quote.
-- `payment_id` FKs a `booking_payments` row -- that FK IS the consumption record. This file
-- runs after `...14_payments_refunds.sql` in the migration order (packages/db/README.md's
-- numbering table) precisely because it needs that table to exist first.

create table public.coupon_redemptions (
  id          bigint generated always as identity primary key,
  coupon_id   bigint not null references public.coupons(id) on delete restrict,
  booking_id  uuid   not null references public.bookings(id) on delete restrict,
  -- D-29 / ADR-014 §6: consumed at payment -- the FK to `booking_payments` is the consumption
  -- record; an abandoned quote never burns a use. A soft KV reservation for the checkout
  -- window is Phase 7 work, not a schema concern.
  payment_id  bigint not null references public.booking_payments(id) on delete restrict,
  customer_id uuid   references public.customers(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  -- One-redemption-per-booking. Not a cap by itself -- tg_coupon_redemption_caps (F-07) below
  -- is what enforces global_limit / per_user_limit. `unique (payment_id)` is NOT added: a
  -- payment applies at most one coupon in this shape, and the (coupon_id, booking_id) pair
  -- already prevents the same coupon being redeemed twice for the same booking.
  unique (coupon_id, booking_id)
);
comment on table public.coupon_redemptions is 'One row per applied coupon use; enforces per-user and global caps via tg_coupon_redemption_caps (F-07). D-29/ADR-014 §6: consumed at payment, never at an abandoned quote.';

create index coupon_redemptions_customer on public.coupon_redemptions (coupon_id, customer_id);

/**
 * F-07 / T-02-48: `coupons.global_limit`/`per_user_limit` carried a `>= 0` CHECK and nothing
 * else enforcing it, and `unique (coupon_id, booking_id)` is one-redemption-PER-BOOKING, not a
 * cap -- a coupon with `global_limit = 1` could still be redeemed by every booking that tried.
 * Under the default READ COMMITTED isolation, two concurrent sessions redeeming the same
 * single-use code both read a count of 0 against `global_limit = 1` and both insert; the
 * `FOR UPDATE` on the `coupons` row below -- not the count -- is what serialises them, by
 * making the second session block until the first commits (or rolls back), at which point it
 * re-evaluates the count against the row the first session just changed the world under. D-29
 * moving consumption to payment time narrows the window a stale reservation could exploit; it
 * does not close it -- this trigger is what closes it.
 *
 * SECURITY DEFINER: the inserting role (vamos_edge acting for a customer, or vamos_staff for a
 * phone booking) does not need UPDATE on `coupons` for this lock to work -- the function runs
 * as its owner. `set search_path = ''`: every name below is schema-qualified.
 */
create or replace function public.tg_coupon_redemption_caps() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.coupons%rowtype; v_global_count integer; v_user_count integer;
begin
  select * into c from public.coupons where id = new.coupon_id for update;

  if c.id is null or not c.active then
    raise exception 'coupon unavailable' using errcode = 'restrict_violation';
  end if;

  if (c.valid_from is not null and now() < c.valid_from)
     or (c.valid_until is not null and now() >= c.valid_until) then
    raise exception 'coupon outside its window' using errcode = 'restrict_violation';
  end if;

  if c.global_limit is not null then
    select count(*) into v_global_count
      from public.coupon_redemptions where coupon_id = new.coupon_id;
    if v_global_count >= c.global_limit then
      raise exception 'coupon global limit reached' using errcode = 'restrict_violation';
    end if;
  end if;

  if c.per_user_limit is not null and new.customer_id is not null then
    select count(*) into v_user_count
      from public.coupon_redemptions
     where coupon_id = new.coupon_id and customer_id = new.customer_id;
    if v_user_count >= c.per_user_limit then
      raise exception 'coupon per-user limit reached' using errcode = 'restrict_violation';
    end if;
  end if;

  return new;
end $$;

revoke all on function public.tg_coupon_redemption_caps() from public;

create trigger coupon_redemptions_caps before insert on public.coupon_redemptions
  for each row execute function public.tg_coupon_redemption_caps();
