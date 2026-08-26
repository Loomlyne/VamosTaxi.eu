-- 20260823000019_append_only.sql
--
-- D-18: append-only is four layers together -- trigger (raises on UPDATE/DELETE) + REVOKE
-- UPDATE/DELETE/TRUNCATE + RLS-with-no-policy + FORCE ROW LEVEL SECURITY. Layers 2-4 are
-- bypassed by `service_role` (BYPASSRLS) and by superusers; only the trigger catches a
-- migration or a `psql` session running as `postgres`. That is why all four ship together and
-- why the trigger is not redundant with the grants.
--
-- Six corrections vs the schema draft's illustrative shape, each folded in from the adversarial
-- review (research/schema-draft-adversarial-review.md) and its triage
-- (research/adversarial-findings-triage.md), each tagged with its finding id below:
--   F-02  settings_versions joins the append-only set (was documented immutable, had none of
--         the four layers, and sat in a dispatcher-writable working set)
--   F-03  TRUNCATE is closed too -- a row trigger never fires on TRUNCATE, and RLS (including
--         FORCE) does not filter TRUNCATE at all, so layer 1 had a hole exactly where layers
--         2-4 cannot see
--   F-10  the tg_append_only carve-out gains a second case: the documented consent_log
--         erasure write (customer_id -> NULL) is made reachable, since the trigger and the
--         blanket revoke otherwise block the very step D-19 documents
--   F-11  stripe_events / booking_notifications legitimately keep UPDATE (Stripe/notification
--         status), but lose DELETE and TRUNCATE from every role including service_role -- a
--         dropped stripe_events row is the idempotency-drop that lets a replayed webhook re-run
--   F-20  set search_path = '' on the function signature, like every other function in this
--         migration set
--   F-22  the postgres-role BYPASSRLS dependency that makes the two definer write paths
--         (tg_audit_row, record_consent) work under FORCE RLS with no INSERT policy is asserted
--         in append_only.test.sql rather than left unstated (no DDL change in this file)

/**
 * F-20: set search_path = '' pinned on the signature, consistent with every other function in
 * this migration set. F-10: a second carve-out beside the drafted price_snapshots one -- the
 * ONLY two permitted mutations in the whole append-only set.
 *
 * DEVIATION (Rule 1, bug fix): the naive shape -- one combined boolean expression per carve-out,
 * e.g. `if tg_op = 'UPDATE' and tg_table_name = 'price_snapshots' and old.booking_id is null ...
 * then`, with a second such combined expression for consent_log right after it -- raises
 * `42703 record "old" has no field "customer_id"` (or "booking_id") the moment this ONE shared
 * function fires on a table that lacks the OTHER carve-out's column, regardless of the
 * tg_table_name guard placed earlier in the same AND chain. PL/pgSQL resolves every OLD/NEW
 * record-field reference appearing anywhere in an expression by fetching its value BEFORE the
 * combined expression is handed to the SQL executor for boolean evaluation -- so the SQL-level
 * short-circuit the tg_table_name check appears to promise never actually protects the later
 * old.field reference; empirically confirmed against this local Postgres image while writing
 * append_only.test.sql (Task 2), not merely theoretical. This makes the SAME bug latent in the
 * drafted single-carve-out version too, since the six originally-drafted attached tables do not
 * all carry a `booking_id` column either (price_snapshot_legs, audit_log do not).
 *
 * Fixed by making the table-name check its own PL/pgSQL IF/ELSIF branch -- a distinct statement,
 * evaluated and dispatched BEFORE the nested condition that references OLD/NEW is ever reached --
 * so old.booking_id is only evaluated once execution has already entered the price_snapshots
 * branch (where the column exists), and old.customer_id only inside the consent_log branch.
 * Neither outer IF/ELSIF condition references a record field, so both are ordinary TG_*
 * comparisons the SQL executor evaluates cheaply and unconditionally, with no crash risk on any
 * table shape -- including a BEFORE TRUNCATE STATEMENT trigger, where OLD/NEW are unbound: TG_OP
 * is 'TRUNCATE' there, so neither branch's outer condition is true and no field is ever touched.
 */
create or replace function public.tg_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'price_snapshots' then
    -- Carve-out 1 (drafted): binding a pre-purchase quote snapshot to the booking it became.
    -- NULL -> non-NULL on `booking_id`, nothing else on the row, and never the reverse.
    -- Everything the snapshot asserts about price, policy and provenance is still immutable;
    -- only the fact "this quote was bought" is written after the fact.
    --
    -- DEVIATION (Rule 1, bug fix): Postgres does NOT populate a STORED GENERATED column's value
    -- in NEW during a BEFORE ROW UPDATE trigger -- it reads NULL there and is recomputed by the
    -- executor only after the BEFORE trigger chain returns -- so NEW.is_chargeable read NULL
    -- while OLD.is_chargeable held the real stored value the moment this trigger ran, and even
    -- the single-column, otherwise-legal carve-out update failed the equality check every time.
    -- Confirmed empirically while writing append_only.test.sql (Task 2) by diffing
    -- to_jsonb(new)/to_jsonb(old) key-by-key inside a scratch trigger. Carrying OLD's value
    -- forward into NEW for the comparison's sake closes the gap without widening what the
    -- carve-out actually permits -- is_chargeable is a pure function of total_rappen and
    -- rate_version_is_live, both still covered by the comparison below, so it cannot itself
    -- carry an unnoticed mutation. This assignment has no effect on the row Postgres actually
    -- stores: the executor recomputes is_chargeable correctly from the real
    -- total_rappen/rate_version_is_live once this trigger returns, overwriting whatever is
    -- assigned here (confirmed empirically: the same assignment made in an EARLIER trigger does
    -- not survive being read by a LATER one, so it must happen in this function, immediately
    -- before the comparison it exists to fix).
    new.is_chargeable := old.is_chargeable;
    if old.booking_id is null and new.booking_id is not null
       and to_jsonb(new) - 'booking_id' = to_jsonb(old) - 'booking_id' then
      return new;
    end if;
  elsif tg_op = 'UPDATE' and tg_table_name = 'consent_log' then
    -- Carve-out 2 (F-10): the documented erasure step -- "on erasure, customer_id -> NULL; the
    -- row itself stays" -- was blocked by this very trigger and by the blanket revoke below, so
    -- the documented behaviour had no reachable path. This makes it reachable and nothing wider.
    -- The routine that USES this carve-out is still Phase 10 (D-19); only the path opens here.
    if old.customer_id is not null and new.customer_id is null
       and to_jsonb(new) - 'customer_id' = to_jsonb(old) - 'customer_id' then
      return new;
    end if;
  end if;

  raise exception 'append-only table %.%: % is not permitted',
    tg_table_schema, tg_table_name, tg_op
    using errcode = 'restrict_violation',
          hint = 'Insert a superseding row; never mutate history.';
end $$;

revoke all on function public.tg_append_only() from public;

-- Row-level triggers, SEVEN tables (the drafted six plus settings_versions, F-02).
create trigger price_snapshots_append_only before update or delete on public.price_snapshots
  for each row execute function public.tg_append_only();
create trigger price_snapshot_legs_append_only before update or delete on public.price_snapshot_legs
  for each row execute function public.tg_append_only();
create trigger booking_events_append_only before update or delete on public.booking_events
  for each row execute function public.tg_append_only();
create trigger booking_refunds_append_only before update or delete on public.booking_refunds
  for each row execute function public.tg_append_only();
create trigger audit_log_append_only before update or delete on public.audit_log
  for each row execute function public.tg_append_only();
create trigger consent_log_append_only before update or delete on public.consent_log
  for each row execute function public.tg_append_only();
-- F-02: settings_versions is documented immutable (...04_settings.sql: "an immutable dated
-- history") and price_snapshots.settings_version_id is `on delete restrict` precisely so a sold
-- booking's policy provenance cannot move -- but the draft gave it none of the four layers and
-- put it in the dispatcher CRUD working set, so a dispatcher at aal2 could
-- `update settings_versions set free_cancel_hours = 0, cancellation_tiers = '[...]'::jsonb
-- where slug = 'launch-baseline'` after the fact. tg_audit_row recorded that change; nothing
-- prevented it. Plan 02-08 removes settings_versions from the dispatcher working set and adds
-- an admin-only restrictive INSERT policy (append is still the one legal write).
create trigger settings_versions_append_only before update or delete on public.settings_versions
  for each row execute function public.tg_append_only();

-- Layer 2, extended to include TRUNCATE (F-03) and service_role (was already drafted for the
-- six client-facing roles; the blanket revoke below is the one place this exact phrase appears).
revoke update, delete, truncate on public.price_snapshots, public.price_snapshot_legs,
                          public.booking_events, public.booking_refunds,
                          public.audit_log, public.consent_log, public.settings_versions
  from anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public, service_role;

-- The two carve-out grants, column-scoped: the blanket revoke above also covers the service
-- role that performs each documented exception, so these are what make each one possible at
-- all. The trigger above is what makes each one narrow.
grant update (booking_id) on public.price_snapshots to service_role;
grant update (customer_id) on public.consent_log to service_role;

-- F-03: TRUNCATE never fires a ROW trigger (Postgres does not define one), and RLS -- including
-- FORCE -- does not apply to TRUNCATE at all, so the revoke above closes the grant but nothing
-- yet closes the trigger layer for this one verb. Nine BEFORE TRUNCATE STATEMENT triggers,
-- reusing tg_append_only (both its carve-outs are guarded by tg_op = 'UPDATE', so a TRUNCATE
-- falls straight through to the raise): the seven append-only tables plus stripe_events and
-- booking_notifications (F-11 -- those two are not append-only, but TRUNCATE is still refused).
create trigger price_snapshots_no_truncate before truncate on public.price_snapshots execute function public.tg_append_only();
create trigger price_snapshot_legs_no_truncate before truncate on public.price_snapshot_legs execute function public.tg_append_only();
create trigger booking_events_no_truncate before truncate on public.booking_events execute function public.tg_append_only();
create trigger booking_refunds_no_truncate before truncate on public.booking_refunds execute function public.tg_append_only();
create trigger audit_log_no_truncate before truncate on public.audit_log execute function public.tg_append_only();
create trigger consent_log_no_truncate before truncate on public.consent_log execute function public.tg_append_only();
create trigger settings_versions_no_truncate before truncate on public.settings_versions execute function public.tg_append_only();
create trigger stripe_events_no_truncate before truncate on public.stripe_events execute function public.tg_append_only();
create trigger booking_notifications_no_truncate before truncate on public.booking_notifications execute function public.tg_append_only();

-- F-03, the belt: close TRUNCATE everywhere in schema public for every client-facing role AND
-- service_role, and close it for every FUTURE table service_role would otherwise inherit it on.
-- Supabase's project default is `alter default privileges in schema public grant all on tables
-- to ... service_role`, where ALL includes TRUNCATE -- not theoretical, it is this project's own
-- bootstrap. The per-table triggers above are the real stop (a role can still hold the
-- privilege and be refused by the trigger); this is defence in depth so the privilege itself
-- does not exist to be exercised in the first place.
revoke truncate on all tables in schema public
  from anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public, service_role;
alter default privileges in schema public revoke truncate on tables from service_role;

-- F-11: stripe_events and booking_notifications legitimately take UPDATE (processed_at/
-- attempts/last_error; sent_at/failed_at) -- Stripe and the notification sender move status --
-- so neither joins the append-only trigger set above and neither loses UPDATE here. What closes
-- instead is DELETE and TRUNCATE, from every role INCLUDING service_role: service_role keeping
-- plain DELETE on stripe_events was the idempotency-drop that lets a replayed webhook re-run --
-- the exact attack this table's own header comment describes, closed for vamos_staff (never
-- granted anything on this table) and for the role far more likely to leak into a Queue
-- consumer.
revoke delete, truncate on public.stripe_events, public.booking_notifications
  from anon, authenticated, vamos_guest, vamos_staff, vamos_edge, vamos_public, service_role;
create trigger stripe_events_no_delete before delete on public.stripe_events for each row execute function public.tg_append_only();
create trigger booking_notifications_no_delete before delete on public.booking_notifications for each row execute function public.tg_append_only();

-- Layer 4, NINE tables: the seven append-only plus stripe_events and booking_notifications
-- (F-11 -- FORCE RLS applies even though those two keep UPDATE, so the owner cannot bypass the
-- DELETE/TRUNCATE closure above by relying on table ownership instead of a grant).
alter table public.price_snapshots     force row level security;
alter table public.price_snapshot_legs force row level security;
alter table public.booking_events      force row level security;
alter table public.booking_refunds     force row level security;
alter table public.audit_log           force row level security;
alter table public.consent_log         force row level security;
alter table public.settings_versions   force row level security;
alter table public.stripe_events       force row level security;
alter table public.booking_notifications force row level security;
