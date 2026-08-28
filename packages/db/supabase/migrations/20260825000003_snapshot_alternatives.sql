-- 20260825000003_snapshot_alternatives.sql
--
-- D-21 / D-22 / D-25: the board the customer saw, the second clock the charge gate can see,
-- and an arithmetic identity the snapshot row itself refuses to break.
--
-- What this file deliberately does NOT do:
--   - it adds no INSERT grant on price_snapshots. Plan 04-06's definer RPC is the write door
--     (D-44a); this migration only shapes the row the RPC will write.
--   - it writes no seed row and invents no CHF amount (D-46).
--   - it does not touch expires_at's meaning. expires_at remains the payment window Phase 2
--     gave it (written once, never extended). quote_lock_expires_at is a SECOND column for
--     QUOTE-04's 30-minute quote lock — same length today (ADR-014 §5 / D-43), never the same
--     field. settings_versions.quote_lock_minutes already exists from ...004_settings.sql and
--     is only READ here, never re-added.
--
-- D-46: no CHF amount enters this file.

-- ---------------------------------------------------------------------------
-- shown_alternatives (D-22)
-- ---------------------------------------------------------------------------
-- Thickened per class so a dispute can answer "why was Van cheaper?" (min-fare / no night
-- surcharge), not only "what were the four totals?". Element shape:
--   [{ "class_slug": "economy", "eligible": true, "total_rappen": null,
--      "ineligible_reason": null, "chosen": false, "fixed_route": false,
--      "effective_max_pax": 3, "max_bags": 3,
--      "lines": [{ "code": "distance_fare", "kind": "fare", "amount_rappen": null }] }]
-- Unchosen classes keep code/kind/amount_rappen only on their lines; full basis/source_row
-- derivation lives on the CHOSEN snapshot's own lines column, never duplicated here.

alter table public.price_snapshots
  add column shown_alternatives jsonb not null default '[]'::jsonb;

alter table public.price_snapshots
  add constraint price_snapshots_alternatives_array
  check (jsonb_typeof(shown_alternatives) = 'array');

comment on column public.price_snapshots.shown_alternatives is
  'D-22: the board the customer saw — thickened per class (eligible, totals, line codes/kinds/amounts, capacities). Totals alone cannot answer a dispute. Default empty array; never an index (small JSON, not a join key).';

-- ---------------------------------------------------------------------------
-- quote_lock_expires_at (D-25 / D-43) — three statements, not one
-- ---------------------------------------------------------------------------
-- Why three and not `add column … not null default …`:
--   1. add nullable so existing environments can be backfilled without a single-step failure;
--   2. UPDATE backfill quote_lock_expires_at = expires_at where null;
--   3. set not null.
-- The backfill is a no-op on a table with no rows (the seed writes none, D-21), but it is an
-- UPDATE, so it would trip tg_append_only if any row ever existed. Suspending append-only
-- enforcement for the backfill is NOT acceptable here. Recorded limitation: this migration
-- is proven against an empty table; a future non-empty environment needs the tg_append_only
-- carve-out extended for this column before re-running the backfill.
--
-- Two clocks, same length today (ADR-014 §5 gives both 30 minutes, D-43), never the same field:
--   expires_at            — payment window (settings_versions.checkout_window_minutes), written
--                           once, NEVER extended (append-only, Phase 2 D-18)
--   quote_lock_expires_at — QUOTE-04 lock (settings_versions.quote_lock_minutes), minted from
--                           Postgres now() + quote_lock_minutes at snapshot write

alter table public.price_snapshots
  add column quote_lock_expires_at timestamptz;

-- Empty-table no-op in practice (D-21). See comment above if rows ever exist.
update public.price_snapshots
   set quote_lock_expires_at = expires_at
 where quote_lock_expires_at is null;

alter table public.price_snapshots
  alter column quote_lock_expires_at set not null;

comment on column public.price_snapshots.quote_lock_expires_at is
  'D-25/D-43: QUOTE-04 30-minute quote lock. Distinct from expires_at (payment window). Same length today per ADR-014 §5; never the same column. Minted now() + settings_versions.quote_lock_minutes; never extended (tg_append_only).';

-- ---------------------------------------------------------------------------
-- Extended policy CHECK — eight keys (was five)
-- ---------------------------------------------------------------------------
-- apps/web/lib/pricing/policy.ts already emits all eight, so this tightens against a shape the
-- engine already produces. The three added keys distinguish "we forgot the waiting/modification
-- policy" from "the waiting policy is unanswered" at the row:
--   landed: settings_version_id, free_cancel_hours, airport_waiting_minutes,
--           city_waiting_minutes, cancellation_tiers
--   added:  modification_deadline_hours, min_advance_minutes, policy_doc

alter table public.price_snapshots
  drop constraint price_snapshots_policy_shape;

alter table public.price_snapshots
  add constraint price_snapshots_policy_shape check (
       policy ? 'cancellation_tiers'
   and policy ? 'free_cancel_hours'
   and policy ? 'airport_waiting_minutes'
   and policy ? 'city_waiting_minutes'
   and policy ? 'settings_version_id'
   and policy ? 'modification_deadline_hours'
   and policy ? 'min_advance_minutes'
   and policy ? 'policy_doc'
  );

-- ---------------------------------------------------------------------------
-- tg_snapshot_lines_reconcile (D-07 / QUOTE-05)
-- ---------------------------------------------------------------------------
-- BEFORE INSERT. Refuses mixed/broken arithmetic independently of the Worker's own assertion.
-- Trigger name order is load-bearing: Postgres fires same-event BEFORE triggers in name order.
-- price_snapshots_lines_reconcile runs before price_snapshots_rate_version_flag alphabetically;
-- both must run before any row is visible. Whoever adds the next BEFORE INSERT trigger must
-- keep this ordering intentional.

create or replace function public.tg_snapshot_lines_reconcile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line      jsonb;
  v_seq       pg_catalog.int4;
  v_amount    pg_catalog.numeric;
  v_sum       public.rappen := 0;
  v_any_amt   pg_catalog.bool := false;
begin
  -- Let price_snapshots_lines_array CHECK refuse non-arrays (BEFORE triggers run first).
  if pg_catalog.jsonb_typeof(new.lines) is distinct from 'array' then
    return new;
  end if;

  for v_line in
    select value from pg_catalog.jsonb_array_elements(new.lines)
  loop
    v_seq := nullif(v_line ->> 'seq', '')::pg_catalog.int4;

    if v_line ->> 'i18n_key' is null
       or v_line ->> 'kind' is null
       or v_line ->> 'code' is null
       or v_line ->> 'seq' is null then
      raise exception
        'price_snapshots.lines element seq=% missing required key (i18n_key, kind, code, or seq)',
        coalesce(v_seq::text, '?')
        using errcode = 'restrict_violation';
    end if;

    if v_line ? 'amount_rappen' and v_line -> 'amount_rappen' is not null
       and pg_catalog.jsonb_typeof(v_line -> 'amount_rappen') <> 'null' then
      if pg_catalog.jsonb_typeof(v_line -> 'amount_rappen') is distinct from 'number' then
        raise exception
          'price_snapshots.lines seq=% amount_rappen is not a number',
          v_seq
          using errcode = 'restrict_violation';
      end if;
      v_amount := (v_line ->> 'amount_rappen')::pg_catalog.numeric;
      if v_amount is distinct from pg_catalog.trunc(v_amount) then
        raise exception
          'price_snapshots.lines seq=% amount_rappen is not an integer',
          v_seq
          using errcode = 'restrict_violation';
      end if;
      v_any_amt := true;
      v_sum := v_sum + v_amount::public.rappen;
    end if;
  end loop;

  if new.total_rappen is not null then
    if new.total_rappen is distinct from v_sum then
      raise exception
        'price_snapshots.total_rappen (%) does not equal sum of lines amounts (%)',
        new.total_rappen, v_sum
        using errcode = 'restrict_violation';
    end if;
  elsif v_any_amt then
    -- Unpriced snapshot carrying a priced line — the mixed state assembleTotals also refuses.
    raise exception
      'price_snapshots.total_rappen is null but a line carries a non-null amount_rappen'
      using errcode = 'restrict_violation';
  end if;

  return new;
end;
$$;

revoke all on function public.tg_snapshot_lines_reconcile() from public;

create trigger price_snapshots_lines_reconcile
  before insert on public.price_snapshots
  for each row execute function public.tg_snapshot_lines_reconcile();
