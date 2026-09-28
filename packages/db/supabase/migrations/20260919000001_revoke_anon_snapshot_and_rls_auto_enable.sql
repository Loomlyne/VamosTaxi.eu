-- Phase 20. Owner applies in the Supabase SQL editor.
-- Agent does not `supabase db push`. No DROP FUNCTION. No row writes.

REVOKE ALL ON FUNCTION public.create_quote_snapshot FROM PUBLIC, anon, authenticated;

-- rls_auto_enable() is the hosted Supabase project's event-trigger helper. No
-- migration here creates it, so a local `supabase start` / db reset from zero
-- has no such function. Revoke only where it exists; hosted behaviour is unchanged.
DO $$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.quote_rate_book FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evaluate_coupon FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.quote_lock_deadline FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.quote_settings_version FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vamos_public') THEN
    GRANT EXECUTE ON FUNCTION public.quote_rate_book TO vamos_public;
    GRANT EXECUTE ON FUNCTION public.evaluate_coupon TO vamos_public;
    GRANT EXECUTE ON FUNCTION public.quote_lock_deadline TO vamos_public;
    GRANT EXECUTE ON FUNCTION public.quote_settings_version TO vamos_public;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vamos_edge') THEN
    GRANT EXECUTE ON FUNCTION public.create_quote_snapshot TO vamos_edge;
    GRANT EXECUTE ON FUNCTION public.quote_rate_book TO vamos_edge;
    GRANT EXECUTE ON FUNCTION public.evaluate_coupon TO vamos_edge;
    GRANT EXECUTE ON FUNCTION public.quote_lock_deadline TO vamos_edge;
    GRANT EXECUTE ON FUNCTION public.quote_settings_version TO vamos_edge;
  END IF;
END $$;
