-- Phase 20. Owner applies in the Supabase SQL editor.
-- Agent does not `supabase db push`. No DROP FUNCTION. No row writes.
--
-- Additive GRANT only. submit_contact_message is SECURITY DEFINER and
-- currently EXECUTE for anon/authenticated, so the publishable key can
-- skip Turnstile. The Worker will call it via asSystem (vamos_system),
-- same pattern as claim_contact_delivery. Keep anon until the app
-- deploy is live, then apply 20260920000002 to revoke.

GRANT EXECUTE ON FUNCTION public.submit_contact_message(text, text, citext, text, text, text, text)
  TO vamos_system;
