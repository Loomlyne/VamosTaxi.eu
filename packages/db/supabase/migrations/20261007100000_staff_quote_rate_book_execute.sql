-- 20261007100000_staff_quote_rate_book_execute.sql
--
-- Phase 26.2 (unit 10, finding A3). The dashboard price preview
-- (apps/web/lib/ops/rate-book.ts, the branch taken when no draft price book row exists)
-- calls public.quote_rate_book(true) through asStaff, i.e. as role vamos_staff.
-- 20260919000001 revoked EXECUTE from PUBLIC, anon and authenticated and granted it back to
-- vamos_public and vamos_edge only (20260919000002 restored anon). vamos_staff was never
-- granted, so that preview answers 42501. Read on live 2026-09-30:
-- has_function_privilege('vamos_staff', 'public.quote_rate_book(boolean)', 'execute') = false.
--
-- Grant only. No function body, no table grant, no row is changed. The function is
-- SECURITY DEFINER and returns the live price book, or the newest draft when there is no
-- live one and p_prefer_draft is true; staff already read the same tables on the dashboard.

do $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'vamos_staff') then
    grant execute on function public.quote_rate_book(boolean) to vamos_staff;
  end if;
end $$;
