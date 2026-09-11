-- Passenger extras (child seat, meet & greet, extra stop, oversized, ski, pet)
-- are a live catalog, not the frozen fare kernel. Ops add/edit/remove must
-- persist on the live rate_version so checkout extras stay in sync. Night /
-- waiting / airport_pickup stay frozen.

create or replace function public.tg_pricing_row_frozen()
returns trigger
language plpgsql
set search_path to ''
as $function$
declare
  v_status public.rate_version_status;
  v_old jsonb;
  v_new jsonb;
  v_code text;
begin
  select status into v_status from public.rate_versions
   where id = coalesce(new.rate_version_id, old.rate_version_id);

  if v_status is distinct from 'draft' then
    if tg_table_name = 'surcharges' then
      v_code := coalesce(new.code, old.code);
      if v_code in (
        'child_seat', 'meet_greet', 'extra_stop', 'oversized_luggage',
        'ski_rack', 'ski', 'pet'
      ) then
        if tg_op = 'DELETE' then
          return old;
        end if;
        if tg_op = 'INSERT' then
          return new;
        end if;
        if tg_op = 'UPDATE'
           and old.code in (
             'child_seat', 'meet_greet', 'extra_stop', 'oversized_luggage',
             'ski_rack', 'ski', 'pet'
           ) then
          return new;
        end if;
      end if;
    end if;
    if tg_op = 'UPDATE' then
      v_old := to_jsonb(old) - 'live' - 'available' - 'active';
      v_new := to_jsonb(new) - 'live' - 'available' - 'active';
      if v_old = v_new then
        return new;
      end if;
    end if;
    raise exception 'pricing rows are immutable once their rate_version leaves draft (%.% id=%)',
      tg_table_schema, tg_table_name, coalesce(new.id, old.id)
      using errcode = 'restrict_violation',
            hint = 'Publish a new rate_version instead of editing a live one. Only `live` / `available` / `active` may still be toggled.';
  end if;
  return coalesce(new, old);
end
$function$;
