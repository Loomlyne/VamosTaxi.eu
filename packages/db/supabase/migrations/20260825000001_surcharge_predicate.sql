-- 20260825000001_surcharge_predicate.sql
--
-- D-09: surcharge applicability is versioned data — `surcharges.predicate jsonb` carries the
-- frozen rule a customer was charged under, and `surcharges.quantity_source` names which
-- client-supplied count multiplies `amount_rappen` (never which amount; amounts always come
-- from the pinned rate version, D-11).
--
-- What this file deliberately does NOT do:
--   - it does not validate the predicate's SHAPE in SQL. A jsonb CHECK over the five
--     discriminators would be a second, drifting copy of apps/web/lib/pricing/predicates.ts's
--     union. The engine treats an unrecognised `kind` as not-applicable and reports it
--     (plan 04-02).
--   - it adds no GRANT. The function below only re-issues the Phase 2 REVOKE after
--     create or replace (which restores PUBLIC EXECUTE by default).
--   - it invents no airport-zone or ski-tag rule (U38). Empty predicates stay empty; the
--     publish gate refuses draft → live until the owner confirms those five rows.
--
-- D-46: no CHF amount enters this file.

alter table public.surcharges
  add column predicate jsonb not null default '{}'::jsonb,
  add column quantity_source text
    check (quantity_source in ('child_seats', 'extra_stops', 'oversize_bags'));

comment on column public.surcharges.predicate is
  'Frozen applicability rule for this surcharge row (D-09). Five discriminators: always, pickup_zone_type, local_time_window, dest_zone_tag, quantity. Empty {} is an unanswered rule and blocks draft→live.';

comment on column public.surcharges.quantity_source is
  'Which client-supplied count multiplies amount_rappen when predicate.kind = quantity (D-11). Never which amount — the amount is always the version''s.';

-- A quantity predicate with nothing to count is unanswerable; a quantity_source without the
-- quantity kind is the same hole the other way. Both directions refuse.
alter table public.surcharges
  add constraint surcharges_quantity_source_pairing check (
       (predicate ->> 'kind' = 'quantity' and quantity_source is not null)
    or (predicate ->> 'kind' is distinct from 'quantity' and quantity_source is null)
  );

/**
 * Phase 2's tg_rate_version_transition body is reproduced verbatim for its three completeness
 * clauses (unpriced distance_rates, unpriced surcharges, unpriced live fixed_routes). A fourth
 * clause refuses draft → live while any ACTIVE surcharge on the version carries predicate = {}.
 *
 * Why every active row, including kind='included': the three landed clauses skip `included`
 * rows because they carry no price, but an included row still needs a rule to decide whether
 * the airport or the city waiting line is emitted. A blank predicate on waiting_airport is
 * exactly as unanswered as one on airport_pickup (U38).
 *
 * create or replace keeps the existing rate_versions_transition trigger binding valid — do not
 * drop or recreate the trigger. Re-issue the revoke: create or replace restores PUBLIC EXECUTE.
 */
create or replace function public.tg_rate_version_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_missing integer;
begin
  if new.status is distinct from old.status then
    if not ((old.status = 'draft' and new.status = 'live')
         or (old.status = 'live'  and new.status = 'retired')) then
      raise exception 'illegal rate_version transition % -> %', old.status, new.status
        using errcode = 'restrict_violation',
              hint = 'Only draft->live and live->retired are legal. Publish a new version instead.';
    end if;
  end if;

  if new.status = 'live' and old.status = 'draft' then
    select count(*) into v_missing from public.distance_rates r
     where r.rate_version_id = new.id and r.available
       and (r.base_fare_rappen is null or r.per_km_rappen is null or r.min_fare_rappen is null);
    if v_missing > 0 then
      raise exception 'rate_version % has % unpriced distance_rates rows', new.id, v_missing
        using errcode = 'restrict_violation';
    end if;

    select count(*) into v_missing from public.surcharges s
     where s.rate_version_id = new.id and s.active and s.kind <> 'included'
       and coalesce(s.amount_rappen, (s.percent * 100)::integer) is null;
    if v_missing > 0 then
      raise exception 'rate_version % has % unpriced surcharges', new.id, v_missing
        using errcode = 'restrict_violation';
    end if;

    select count(*) into v_missing from public.fixed_routes f
     where f.rate_version_id = new.id and f.live and f.price_rappen is null;
    if v_missing > 0 then
      raise exception 'rate_version % has % unpriced live fixed_routes', new.id, v_missing
        using errcode = 'restrict_violation';
    end if;

    -- D-09 / U38: empty predicate is an unanswered rule. Covers EVERY active row regardless of
    -- kind — included rows still need a rule to decide which waiting line is emitted.
    select count(*) into v_missing from public.surcharges s
     where s.rate_version_id = new.id and s.active
       and s.predicate = '{}'::jsonb;
    if v_missing > 0 then
      raise exception 'rate_version % has % active surcharges with empty predicate', new.id, v_missing
        using errcode = 'restrict_violation',
              hint = 'An empty predicate is an unanswered rule (U38). Confirm airport-zone and ski-tag rules with the owner before publishing — do not default them.';
    end if;

    new.published_at := now();
    new.published_by := app.uid();
  end if;
  return new;
end $$;

revoke all on function public.tg_rate_version_transition() from public;
