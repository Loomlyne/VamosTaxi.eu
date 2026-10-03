-- 20261007240000_booking_meta_click_ids.sql
--
-- Phase 28 (META-09, D-09..D-11): the two Meta cookie values (_fbp, _fbc) on the unpaid booking.
-- Additive: two nullable columns with no default, format checks, one guard trigger, one definer
-- writer for the checkout role. No existing row is changed.

alter table public.bookings add column if not exists meta_fbp text;
alter table public.bookings add column if not exists meta_fbc text;

-- Meta's own cookie format: fb.<subdomainIndex>.<creationTime ms>.<random | click id>, with an
-- optional appendix (AQ, Ag, Aw, BA, BQ, Bg, or 8 url-safe characters). Postgres regex repetition
-- is capped at 255, so the click id length is bounded by the length() check instead.
alter table public.bookings add constraint bookings_meta_fbp_format check (
  meta_fbp is null or (
    length(meta_fbp) <= 64
    and meta_fbp ~ '^fb\.[0-9]\.[0-9]{10,13}\.[0-9]{1,20}(\.(AQ|Ag|Aw|BA|BQ|Bg|[A-Za-z0-9_-]{8}))?$'
  )
);
alter table public.bookings add constraint bookings_meta_fbc_format check (
  meta_fbc is null or (
    length(meta_fbc) <= 600
    and meta_fbc ~ '^fb\.[0-9]\.[0-9]{10,13}\.[A-Za-z0-9_-]+(\.(AQ|Ag|Aw|BA|BQ|Bg|[A-Za-z0-9_-]{8}))?$'
  )
);

comment on column public.bookings.meta_fbp is
  'Phase 28 D-09: Meta browser id (_fbp cookie), saved at the Pay press with marketing consent. Pending bookings only.';
comment on column public.bookings.meta_fbc is
  'Phase 28 D-09: Meta click id (_fbc cookie), saved at the Pay press with marketing consent. Pending bookings only.';

-- A booking that is not pending can never be given or changed a value, whoever asks (the checkout
-- role, staff with whole-table UPDATE, the database owner). Setting a value to NULL is always allowed
-- so an erasure is never blocked. The effective status is the old one on UPDATE, the new one on INSERT.
create or replace function public.tg_bookings_meta_click_ids_pending_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.meta_fbp is not null or new.meta_fbc is not null)
     and (tg_op = 'INSERT'
          or new.meta_fbp is distinct from old.meta_fbp
          or new.meta_fbc is distinct from old.meta_fbc)
     and (case when tg_op = 'UPDATE' then old.status else new.status end) <> 'pending'::public.booking_status then
    raise exception 'meta click ids: booking is not pending' using errcode = '55000';
  end if;
  return new;
end
$$;

revoke all on function public.tg_bookings_meta_click_ids_pending_only() from public;

create trigger bookings_meta_click_ids_pending_only
  before insert or update of meta_fbp, meta_fbc on public.bookings
  for each row execute function public.tg_bookings_meta_click_ids_pending_only();

create or replace function public.checkout_set_meta_click_ids(
  p_booking_id uuid,
  p_fbp text,
  p_fbc text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.booking_status;
begin
  select b.status into v_status from public.bookings b where b.id = p_booking_id for update;
  if not found then
    raise exception 'checkout_set_meta_click_ids: booking not found' using errcode = 'P0002';
  end if;
  if v_status <> 'pending'::public.booking_status then
    raise exception 'checkout_set_meta_click_ids: booking is not pending' using errcode = '55000';
  end if;

  -- Both values every time, NULLs included: a later Pay press without consent clears earlier values.
  update public.bookings set meta_fbp = p_fbp, meta_fbc = p_fbc where id = p_booking_id;
end
$$;

revoke all on function public.checkout_set_meta_click_ids(uuid, text, text) from public;
grant execute on function public.checkout_set_meta_click_ids(uuid, text, text) to vamos_checkout;

comment on function public.checkout_set_meta_click_ids(uuid, text, text) is
  'Phase 28 D-09/D-10: stores _fbp/_fbc on a PENDING booking (55000 otherwise); NULLs clear. EXECUTE: vamos_checkout only.';
