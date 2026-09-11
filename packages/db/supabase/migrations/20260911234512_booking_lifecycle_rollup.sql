-- 20260911234512_booking_lifecycle_rollup.sql
--
-- 09-02 Task 1: freeze original pickup (D-26) and U21 status roll-up.
-- Hosted apply is 09-04, not this plan.
--
-- D-10: all-cancelled legs → bookings.status cancelled. Never the refunded
-- booking_status label (refund is a money line).
-- D-31: no auto no-show; ops marks no_show later.

alter table public.booking_legs
  add column original_scheduled_at timestamptz;

update public.booking_legs
   set original_scheduled_at = scheduled_at
 where original_scheduled_at is null;

alter table public.booking_legs
  alter column original_scheduled_at set not null;

comment on column public.booking_legs.original_scheduled_at is
  '09-02 D-26: original pickup instant, frozen at INSERT. Cancel windows use this, never shifted scheduled_at.';

create function public.tg_booking_leg_freeze_original_scheduled_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.original_scheduled_at := new.scheduled_at;
  else
    new.original_scheduled_at := old.original_scheduled_at;
  end if;
  return new;
end;
$$;

revoke all on function public.tg_booking_leg_freeze_original_scheduled_at() from public;

create trigger booking_legs_freeze_original_scheduled_at
  before insert or update on public.booking_legs
  for each row
  execute function public.tg_booking_leg_freeze_original_scheduled_at();

comment on function public.tg_booking_leg_freeze_original_scheduled_at() is
  '09-02 D-26: BEFORE INSERT copies scheduled_at once; UPDATE cannot change original_scheduled_at.';

-- D-26: booking_edit_apply_payload updates scheduled_at / scheduled_local only.
-- It must never assign original_scheduled_at (the freeze trigger is the belt).
comment on function public.booking_edit_apply_payload(
  pg_catalog.uuid, pg_catalog.int8, pg_catalog.jsonb, pg_catalog.uuid, pg_catalog.text, pg_catalog.text
) is
  '08-07 apply accepted payload. 09-02 D-26: time changes update scheduled_at / scheduled_local only; never original_scheduled_at.';

create function app.recompute_booking_status(p_booking_id pg_catalog.uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_n pg_catalog.int4;
  v_cancelled pg_catalog.int4;
  v_completed pg_catalog.int4;
  v_no_show pg_catalog.int4;
  v_live pg_catalog.int4;
  v_done pg_catalog.int4;
  v_new public.booking_status;
begin
  select
    pg_catalog.count(*)::pg_catalog.int4,
    pg_catalog.count(*) filter (where l.status = 'cancelled'::public.booking_status)::pg_catalog.int4,
    pg_catalog.count(*) filter (where l.status = 'completed'::public.booking_status)::pg_catalog.int4,
    pg_catalog.count(*) filter (where l.status = 'no_show'::public.booking_status)::pg_catalog.int4
    into v_n, v_cancelled, v_completed, v_no_show
    from public.booking_legs as l
   where l.booking_id = p_booking_id;

  if v_n is null or v_n = 0 then
    return;
  end if;

  v_done := v_completed + v_no_show;
  v_live := v_n - v_cancelled - v_done;

  -- No-op until a leg is terminal (cancelled / completed / no_show).
  if v_cancelled + v_done = 0 then
    return;
  end if;

  if v_cancelled = v_n then
    v_new := 'cancelled'::public.booking_status;
  elsif v_completed = v_n then
    v_new := 'completed'::public.booking_status;
  elsif v_no_show = v_n then
    v_new := 'no_show'::public.booking_status;
  elsif v_live > 0 and v_cancelled > 0 then
    v_new := 'partially_cancelled'::public.booking_status;
  elsif v_done > 0 and v_cancelled > 0 then
    v_new := 'partially_completed'::public.booking_status;
  else
    return;
  end if;

  update public.bookings
     set status = v_new,
         updated_at = pg_catalog.now()
   where id = p_booking_id
     and status is distinct from v_new;
end;
$$;

create function public.recompute_booking_status(p_booking_id pg_catalog.uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.recompute_booking_status(p_booking_id);
end;
$$;

create function app.tg_booking_legs_recompute_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.recompute_booking_status(new.booking_id);
  return new;
end;
$$;

create trigger booking_legs_recompute_status
  after insert or update of status on public.booking_legs
  for each row
  execute function app.tg_booking_legs_recompute_status();

revoke all on function app.recompute_booking_status(pg_catalog.uuid) from public;
revoke all on function public.recompute_booking_status(pg_catalog.uuid) from public;
revoke all on function app.tg_booking_legs_recompute_status() from public;

grant execute on function app.recompute_booking_status(pg_catalog.uuid) to vamos_system, postgres;
grant execute on function public.recompute_booking_status(pg_catalog.uuid) to vamos_system, postgres;

comment on function app.recompute_booking_status(pg_catalog.uuid) is
  '09-02 U21 roll-up. D-10: all-cancelled → cancelled. D-31: no auto no-show; ops marks no_show later.';

comment on function public.recompute_booking_status(pg_catalog.uuid) is
  '09-02 public wrapper for app.recompute_booking_status. EXECUTE vamos_system + postgres (pgTAP).';
