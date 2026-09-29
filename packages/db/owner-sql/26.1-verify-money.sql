-- 26.1-verify-money.sql
--
-- Read-only. Owner runs after the four files. Paste the output back.
--
-- Plan 26.1-12. Run this in the Supabase SQL editor for the hosted project, after the
-- 26.1 migration files have been applied in filename order. It is one SELECT statement,
-- so the SQL editor shows its whole result as one table: copy every row and paste it back.
--
-- It reads the system catalog only: function signatures, return columns, security
-- settings, grants and a body fingerprint (md5 of the function source), check
-- constraints, the booking_disputes table and its RLS policies, and one count of canton
-- zones. It reads no booking, payment, customer, name, email or card data, and it
-- changes nothing.
--
-- The expected output (local database, all 26.1 migrations applied) is recorded in
-- .planning/phases/26.1-payment-pricing-integrity/26.1-12-SUMMARY.md. A row whose value
-- differs, or a row with value MISSING, means that file did not land as written.
--
-- Sources:
--   20260927140000_checkout_abandon_unpaid.sql       checkout_abandon_gate, checkout_quote_left
--   20260927180000_ops_refund_record_rappen_cast.sql ops_refund_record (rappen cast)
--   20260928100000_settle_revive_pi_duplicate.sql    checkout_payment_settle,
--                                                    checkout_duplicate_refund_record,
--                                                    tg_payment_update_whitelist,
--                                                    booking_payments / booking_refunds /
--                                                    booking_events checks
--   20260928110000_unpaid_cancel_session_expiry.sql  app.release_unpaid_coupon,
--                                                    checkout_cancel_unpaid,
--                                                    checkout_expire_unpaid,
--                                                    ops_cancel_booking,
--                                                    checkout_abandon_unpaid,
--                                                    checkout_requote_cancel
--   20260928120000_stripe_refund_dispute_events.sql  booking_disputes, stripe_charge_refunded_record,
--                                                    stripe_dispute_upsert, booking_refunds reason check
--   20260928130000_canton_city_zones.sql             service_zones zone_type check, 26 canton zones,
--                                                    ops_fill_canton_pairs
--   (pre-existing)                                   checkout_capture_gate must still exist: the
--                                                    Worker live today calls it until Ship.

with expected_fn(sort, schema_name, fn_name) as (
  values
    (10, 'public', 'checkout_abandon_gate'),
    (11, 'public', 'checkout_quote_left'),
    (12, 'public', 'checkout_abandon_unpaid'),
    (20, 'public', 'ops_refund_record'),
    (30, 'public', 'tg_payment_update_whitelist'),
    (31, 'public', 'checkout_payment_settle'),
    (32, 'public', 'checkout_duplicate_refund_record'),
    (40, 'app',    'release_unpaid_coupon'),
    (41, 'public', 'checkout_cancel_unpaid'),
    (42, 'public', 'checkout_expire_unpaid'),
    (43, 'public', 'ops_cancel_booking'),
    (44, 'public', 'checkout_requote_cancel'),
    (50, 'public', 'stripe_charge_refunded_record'),
    (51, 'public', 'stripe_dispute_upsert'),
    (60, 'public', 'ops_fill_canton_pairs'),
    (70, 'public', 'checkout_capture_gate')
),
fn as (
  select e.sort, e.schema_name || '.' || e.fn_name as obj, p.oid, p.prosrc, p.prosecdef,
         p.proconfig, p.proacl
    from expected_fn e
    left join pg_catalog.pg_namespace n on n.nspname = e.schema_name
    left join pg_catalog.pg_proc p on p.pronamespace = n.oid and p.proname = e.fn_name
),
fn_rows as (
  select sort, obj, 1 as sub, 'overloads' as attr,
         pg_catalog.count(oid)::text as val
    from fn group by sort, obj
  union all
  select sort, obj, 2, 'args', coalesce(pg_catalog.pg_get_function_identity_arguments(oid), 'MISSING')
    from fn
  union all
  select sort, obj, 3, 'returns', coalesce(pg_catalog.pg_get_function_result(oid), 'MISSING')
    from fn
  union all
  select sort, obj, 4, 'security_definer', coalesce(prosecdef::text, 'MISSING')
    from fn
  union all
  select sort, obj, 5, 'config', coalesce(pg_catalog.array_to_string(proconfig, ','), case when oid is null then 'MISSING' else '' end)
    from fn
  union all
  select sort, obj, 6, 'grants',
         case when oid is null then 'MISSING'
              else coalesce((select pg_catalog.string_agg(a::text, ',' order by a::text)
                               from pg_catalog.unnest(proacl) as a), '(default)')
         end
    from fn
  union all
  select sort, obj, 7, 'body_md5', coalesce(pg_catalog.md5(prosrc), 'MISSING')
    from fn
),
cast_row as (
  select 21 as sort, 'public.ops_refund_record' as obj, 8 as sub, 'rappen_casts_to_int4' as attr,
         coalesce((
           select ((pg_catalog.length(p.prosrc)
                    - pg_catalog.length(pg_catalog.replace(p.prosrc, 'v_refund.refund_rappen::pg_catalog.int4', '')))
                   / pg_catalog.length('v_refund.refund_rappen::pg_catalog.int4'))::text
             from pg_catalog.pg_proc p
             join pg_catalog.pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'ops_refund_record'
            limit 1), 'MISSING') as val
),
expected_con(sort, tbl, con_name) as (
  values
    (100, 'booking_payments', 'booking_payments_status_check'),
    (101, 'booking_refunds',  'booking_refunds_reason_check'),
    (102, 'booking_events',   'booking_events_kind_check'),
    (103, 'service_zones',    'service_zones_zone_type_check')
),
con_rows as (
  select e.sort, 'public.' || e.tbl || '.' || e.con_name as obj, 1 as sub, 'definition' as attr,
         coalesce(pg_catalog.pg_get_constraintdef(c.oid), 'MISSING') as val
    from expected_con e
    left join pg_catalog.pg_class t
      on t.relname = e.tbl
     and t.relnamespace = 'public'::pg_catalog.regnamespace
    left join pg_catalog.pg_constraint c
      on c.conrelid = t.oid and c.conname = e.con_name
),
disputes_rows as (
  select 200 as sort, 'public.booking_disputes' as obj, 1 as sub, 'table_exists' as attr,
         (pg_catalog.count(*) > 0)::text as val
    from information_schema.tables
   where table_schema = 'public' and table_name = 'booking_disputes'
  union all
  select 200, 'public.booking_disputes', 2, 'columns',
         coalesce(pg_catalog.string_agg(column_name || ' ' || data_type || case when is_nullable = 'NO' then ' not null' else '' end,
                                        ', ' order by ordinal_position), 'MISSING')
    from information_schema.columns
   where table_schema = 'public' and table_name = 'booking_disputes'
  union all
  select 200, 'public.booking_disputes', 3, 'rls_enabled',
         coalesce((select c.relrowsecurity::text from pg_catalog.pg_class c
                    where c.oid = pg_catalog.to_regclass('public.booking_disputes')), 'MISSING')
  union all
  select 200, 'public.booking_disputes', 4, 'rls_forced',
         coalesce((select c.relforcerowsecurity::text from pg_catalog.pg_class c
                    where c.oid = pg_catalog.to_regclass('public.booking_disputes')), 'MISSING')
  union all
  select 200, 'public.booking_disputes', 5, 'table_grants',
         coalesce((select coalesce((select pg_catalog.string_agg(a::text, ',' order by a::text)
                                      from pg_catalog.unnest(c.relacl) as a), '(default)')
                     from pg_catalog.pg_class c
                    where c.oid = pg_catalog.to_regclass('public.booking_disputes')), 'MISSING')
  union all
  select 200, 'public.booking_disputes', 6, 'indexes',
         coalesce(pg_catalog.string_agg(indexname, ',' order by indexname), 'MISSING')
    from pg_catalog.pg_indexes
   where schemaname = 'public' and tablename = 'booking_disputes'
  union all
  select 200, 'public.booking_disputes', 7, 'policy_count', pg_catalog.count(*)::text
    from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'booking_disputes'
),
policy_rows as (
  select 201 as sort, 'policy ' || policyname as obj, 1 as sub, 'definition' as attr,
         permissive || ' ' || cmd || ' to ' || pg_catalog.array_to_string(roles, ',')
           || ' using (' || coalesce(qual, '') || ') check (' || coalesce(with_check, '') || ')' as val
    from pg_catalog.pg_policies
   where schemaname = 'public' and tablename = 'booking_disputes'
),
zone_rows as (
  select 300 as sort, 'public.service_zones' as obj, 1 as sub, 'canton_zone_count' as attr,
         pg_catalog.count(*)::text as val
    from public.service_zones
   where zone_type = 'canton'
)
select obj as object, attr as attribute, val as value
  from (
    select * from fn_rows
    union all select * from cast_row
    union all select * from con_rows
    union all select * from disputes_rows
    union all select * from policy_rows
    union all select * from zone_rows
  ) r
 order by sort, obj, sub;
