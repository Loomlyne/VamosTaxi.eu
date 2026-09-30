-- 20261001130000_checkout_pay_press_cap.sql
--
-- Phase 26.5 plan 04, owner decision D-20: at most 5 Pay presses per price (quote).
--
-- One tiny table remembers which Pay presses (by idempotency key) a quote has had, and one
-- narrow SECURITY DEFINER function counts them. A replay -- the same idempotency key on the
-- same quote -- is not a new press. The 6th distinct key is refused and is not stored, so
-- refused attempts cannot push the count of earlier presses out of reach. No role gets a
-- table grant; the Worker (vamos_checkout) can only call the function.

create table public.checkout_pay_presses (
  quote_id         pg_catalog.uuid not null,
  idempotency_key  pg_catalog.text not null check (pg_catalog.btrim(idempotency_key) <> ''),
  pressed_at       pg_catalog.timestamptz not null default pg_catalog.now(),
  primary key (quote_id, idempotency_key)
);

comment on table public.checkout_pay_presses is
  'One row per distinct Pay press on a quote (D-20). Written only by checkout_note_pay_press. No personal data: a quote id and a client-made key.';

alter table public.checkout_pay_presses enable row level security;
revoke all on table public.checkout_pay_presses from public, anon, authenticated;

-- Returns 'ok' (a new press within the cap), 'replay' (this key was already counted) or
-- 'limit' (a sixth distinct key; nothing is stored).
create or replace function public.checkout_note_pay_press(
  p_quote_id         pg_catalog.uuid,
  p_idempotency_key  pg_catalog.text
)
returns pg_catalog.text
language plpgsql security definer set search_path = ''
as $$
declare
  v_count pg_catalog.int4;
begin
  if p_quote_id is null or p_idempotency_key is null or pg_catalog.btrim(p_idempotency_key) = '' then
    raise exception 'checkout_note_pay_press: quote and key required' using errcode = '22023';
  end if;

  -- Two presses on one quote take turns, so the cap cannot be beaten by a race.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_quote_id::pg_catalog.text, 26504));

  if exists (
    select 1 from public.checkout_pay_presses as p
     where p.quote_id = p_quote_id and p.idempotency_key = p_idempotency_key
  ) then
    return 'replay';
  end if;

  select pg_catalog.count(*)::pg_catalog.int4 into v_count
    from public.checkout_pay_presses as p where p.quote_id = p_quote_id;
  if v_count >= 5 then
    return 'limit';
  end if;

  insert into public.checkout_pay_presses (quote_id, idempotency_key) values (p_quote_id, p_idempotency_key);
  return 'ok';
end
$$;

revoke all on function public.checkout_note_pay_press(pg_catalog.uuid, pg_catalog.text) from public;
grant execute on function public.checkout_note_pay_press(pg_catalog.uuid, pg_catalog.text) to vamos_checkout;
comment on function public.checkout_note_pay_press(pg_catalog.uuid, pg_catalog.text) is
  'D-20: counts Pay presses per quote. ok / replay / limit (the 6th distinct key). vamos_checkout only.';
