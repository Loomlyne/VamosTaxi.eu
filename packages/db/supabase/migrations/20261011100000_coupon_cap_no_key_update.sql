-- tg_coupon_redemption_caps: lock the coupon row FOR NO KEY UPDATE, not FOR UPDATE.
--
-- Found by packages/db/test/local/coupon-race.test.ts (phase 04, QUOTE-06). Two payers
-- checking out with the same limited coupon at the same moment deadlocked (SQLSTATE
-- 40P01) instead of one getting the clean "coupon global limit reached" refusal: each
-- checkout's price snapshot takes a FOR KEY SHARE lock on the coupon row (foreign key),
-- both then queue on booking_reference_counters, and the first one's FOR UPDATE here
-- waits on the other's key share. FOR NO KEY UPDATE still conflicts with itself, so
-- concurrent redemptions still serialise and the count check stays race-free, but it
-- does not conflict with FOR KEY SHARE, so the cycle is gone.
--
-- Body is otherwise identical to 20260825000006_coupon_release.sql. create or replace
-- restores the default PUBLIC EXECUTE, so the revoke is re-issued.

create or replace function public.tg_coupon_redemption_caps() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c public.coupons%rowtype; v_global_count integer; v_user_count integer;
begin
  select * into c from public.coupons where id = new.coupon_id for no key update;

  if c.id is null or not c.active then
    raise exception 'coupon unavailable' using errcode = 'restrict_violation';
  end if;

  if (c.valid_from is not null and now() < c.valid_from)
     or (c.valid_until is not null and now() >= c.valid_until) then
    raise exception 'coupon outside its window' using errcode = 'restrict_violation';
  end if;

  if c.global_limit is not null then
    select count(*) into v_global_count
      from public.coupon_redemptions where coupon_id = new.coupon_id and released_at is null;
    if v_global_count >= c.global_limit then
      raise exception 'coupon global limit reached' using errcode = 'restrict_violation';
    end if;
  end if;

  if c.per_user_limit is not null and new.customer_id is not null then
    select count(*) into v_user_count
      from public.coupon_redemptions
     where coupon_id = new.coupon_id and customer_id = new.customer_id and released_at is null;
    if v_user_count >= c.per_user_limit then
      raise exception 'coupon per-user limit reached' using errcode = 'restrict_violation';
    end if;
  end if;

  return new;
end $$;

revoke all on function public.tg_coupon_redemption_caps() from public;
