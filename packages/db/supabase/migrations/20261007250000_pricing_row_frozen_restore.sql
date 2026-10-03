-- Restore public.tg_pricing_row_frozen() to the body the live database runs (owner decision
-- .planning/decisions/2026-10-02-live-extras-draft-then-publish.md, Phase 20 finding D1).
--
-- 20260911000002_live_passenger_extras.sql was never applied on live. It let seven extras, picked by
-- name, be edited on a published price book; the owner's rule is that an extra changes like every
-- other price (draft, then Publish) and that no rule is keyed on an extra's name. Live kept the first
-- version (20260823000008). This migration makes a from-zero replay match live. On live it is a no-op:
-- the body below is live's, copied verbatim (read 2026-10-03, md5 of pg_get_functiondef
-- 39df856a4f7f191c1eacdfcd09b3b38a). The old file is not edited in place.
--
-- Migration number 20261007250000: to be confirmed by the controller (230000 fare lines, 240000 phase 28).

CREATE OR REPLACE FUNCTION public.tg_pricing_row_frozen()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_status public.rate_version_status; v_old jsonb; v_new jsonb;
begin
  select status into v_status from public.rate_versions
   where id = coalesce(new.rate_version_id, old.rate_version_id);

  if v_status is distinct from 'draft' then
    if tg_op = 'UPDATE' then
      -- Compare every column except the availability flag for this table. The three tables
      -- share this function but spell their flag differently — 'available' (distance_rates),
      -- 'live' (fixed_routes), 'active' (surcharges) — so all three are excluded on every
      -- call; subtracting a jsonb key a given table doesn't have is a harmless no-op.
      v_old := to_jsonb(old) - 'live' - 'available' - 'active';
      v_new := to_jsonb(new) - 'live' - 'available' - 'active';
      if v_old = v_new then
        return new;   -- availability-only change: allowed, and audited by tg_audit_row
      end if;
    end if;
    raise exception 'pricing rows are immutable once their rate_version leaves draft (%.% id=%)',
      tg_table_schema, tg_table_name, coalesce(new.id, old.id)
      using errcode = 'restrict_violation',
            hint = 'Publish a new rate_version instead of editing a live one. Only `live` / `available` / `active` may still be toggled.';
  end if;
  return coalesce(new, old);
end $function$;
