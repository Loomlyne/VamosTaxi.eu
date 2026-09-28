-- 26.1-verify-signin.sql
--
-- Read-only. 26.1-24 Task 1. Confirms the aal2-when-enrolled rule and the sign-in
-- method column on a database (local or live). No writes, no personal data.

select 'fn' as kind,
       n.nspname || '.' || p.proname as item,
       md5(p.prosrc) as value
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where (n.nspname = 'app' and p.proname in ('is_staff', 'is_admin'))
    or (n.nspname = 'public' and p.proname = 'staff_set_sign_in_method')
union all
select 'fn mentions mfa_factors',
       n.nspname || '.' || p.proname,
       (p.prosrc like '%mfa_factors%')::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'app' and p.proname in ('is_staff', 'is_admin')
union all
select 'column', 'staff.sign_in_method', data_type || ' default ' || coalesce(column_default, 'none')
  from information_schema.columns
 where table_schema = 'public' and table_name = 'staff' and column_name = 'sign_in_method'
union all
select 'check', conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conname = 'staff_sign_in_method_check'
union all
select 'setter args', 'public.staff_set_sign_in_method', pg_get_function_identity_arguments(p.oid)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'staff_set_sign_in_method'
order by 1, 2;
