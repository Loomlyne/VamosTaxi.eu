-- Phase 20. Owner applies AFTER staging verifies POST /api/contact still
-- works (Turnstile + CSRF). Agent does not `supabase db push`.
-- No DROP FUNCTION. No row writes.
--
-- Removes Data API / publishable-key EXECUTE on submit_contact_message.
-- Keep vamos_system. Do not revoke quote RPCs.

REVOKE EXECUTE ON FUNCTION public.submit_contact_message(text, text, citext, text, text, text, text)
  FROM anon, authenticated;
