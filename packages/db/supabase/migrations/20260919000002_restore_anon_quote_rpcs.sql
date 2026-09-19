-- Phase 20 follow-up. Owner applies in the Supabase SQL editor.
-- Agent does not `supabase db push`. No DROP FUNCTION. No row writes.
--
-- 20260919000001 revoked EXECUTE from anon. Public quote uses asQuote
-- which SET ROLE anon, then calls these four RPCs. Live GET /api/quote
-- then fail-closed to empty classes. Restore those four only.
-- Keep rls_auto_enable and create_quote_snapshot off anon.

GRANT EXECUTE ON FUNCTION public.quote_rate_book TO anon;
GRANT EXECUTE ON FUNCTION public.evaluate_coupon TO anon;
GRANT EXECUTE ON FUNCTION public.quote_lock_deadline TO anon;
GRANT EXECUTE ON FUNCTION public.quote_settings_version TO anon;
