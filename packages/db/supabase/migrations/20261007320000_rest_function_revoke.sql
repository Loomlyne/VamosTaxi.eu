-- 20261007320000_rest_function_revoke.sql
--
-- 261005 money hardening, S6 step 2 of 2 (contract). Apply ONLY AFTER the Worker of fix/money-db-hardening
-- is live: the Worker live before it calls these functions as anon (asQuote, asAnon) and would get 42501
-- on every quote, voucher, extras list and cookie-banner write. 20261007310000 (step 1) already gave
-- vamos_checkout EXECUTE, and the new Worker calls all eight as vamos_checkout (asCheckout, no claims).
--
-- The Supabase security advisors (read 2026-10-05) list these as callable through Supabase REST
-- (/rest/v1/rpc/...) by anon and/or authenticated: no Worker in front, so no rate limit, no Turnstile.
-- REST's authenticator can become anon, authenticated or service_role, never a vamos_* role. Each
-- Worker caller, before -> after (apps/web, same branch):
--
--   function                       Worker caller                                    before      after
--   quote_rate_book(boolean)       lib/db/quote.ts loadRateBook, loadLaunchFlags    asQuote     asCheckout
--                                  lib/ops/rate-book.ts preview (asStaff)           vamos_staff unchanged
--   quote_settings_version(tstz)   lib/db/quote.ts loadSettingsVersion              asQuote     asCheckout
--   quote_lock_deadline(bigint)    lib/db/quote.ts mintLockDeadline                 asQuote     asCheckout
--   evaluate_coupon(text,uuid,ci)  lib/db/quote.ts evaluateCoupon                   asQuote     asCheckout
--   extra_labels_read()            lib/checkout/checkout-catalog.ts                 asQuote     asCheckout
--                                  rate-book route (asStaff)                        vamos_staff unchanged
--   consent_choice(text,tstz)      app/api/consent/state, app/api/checkout/intent   asAnon      asCheckout
--   record_consent(...)            app/api/consent (POST)                           asAnon      asCheckout
--   checkout_account_settings()    lib/checkout/account-notice.ts                   asCheckout  unchanged
--
-- asQuote and asAnon both run as anon. asCheckout with null claims runs as vamos_checkout and binds no
-- identity, as before. The Worker's own limits (quote buckets, consent rate limit and Turnstile) stay in
-- front. No other caller exists: no DC page, e-mail, cron or the dashboard gateway calls these through REST
-- or as anon (searched 2026-10-05); a definer function calling one runs it as the owner.
--
-- Live ACLs read 2026-10-05 (before 20261007310000):
--   quote_rate_book           postgres, service_role, anon, vamos_staff
--   quote_settings_version    postgres, service_role, anon
--   quote_lock_deadline       postgres, service_role, anon
--   evaluate_coupon           postgres, service_role, anon
--   extra_labels_read         postgres, service_role, anon, vamos_staff
--   consent_choice            postgres, service_role, anon
--   record_consent            postgres, service_role, anon, authenticated
--   checkout_account_settings postgres, service_role, anon, authenticated, vamos_checkout, vamos_system
-- After this file: anon, authenticated and PUBLIC hold none of them; vamos_checkout holds all eight;
-- vamos_staff keeps quote_rate_book and extra_labels_read; vamos_system keeps checkout_account_settings;
-- service_role (Supabase's default grant, the server key) is left as it is.
--
-- Left on purpose (the advisor still lists them for authenticated): checkout_cancel_unpaid,
-- customer_booking_extras, customer_claim_guest_bookings and customer_confirmation_read are called by the
-- Worker as the signed-in customer, and that identity IS the role authenticated (asCustomer). Each takes
-- the customer from the session (app.uid() / the token's e-mail), so through REST a customer reaches only
-- what the Worker already shows them. Moving them needs a customer role of the Worker's own (open question
-- in the hand-over). staff_claim_invite is called through REST by design (app/api/staff/claim-invite,
-- supabase.rpc) and scopes to app.uid().
--
-- Grants only: no function body, table or row changes. No CHF amount.
-- One transaction: apply it verbatim as a whole (connector apply_migration).
begin;

revoke execute on function public.quote_rate_book(pg_catalog.bool) from public, anon, authenticated;
revoke execute on function public.quote_settings_version(pg_catalog.timestamptz) from public, anon, authenticated;
revoke execute on function public.quote_lock_deadline(pg_catalog.int8) from public, anon, authenticated;
revoke execute on function public.evaluate_coupon(pg_catalog.text, pg_catalog.uuid, extensions.citext)
  from public, anon, authenticated;
revoke execute on function public.extra_labels_read() from public, anon, authenticated;
revoke execute on function public.consent_choice(pg_catalog.text, pg_catalog.timestamptz)
  from public, anon, authenticated;
revoke execute on function public.record_consent(
  pg_catalog.bool, pg_catalog.bool, pg_catalog.bool, pg_catalog.bool,
  pg_catalog.text, pg_catalog.text, pg_catalog.text, pg_catalog.uuid, pg_catalog.text, pg_catalog.inet
) from public, anon, authenticated;
revoke execute on function public.checkout_account_settings() from public, anon, authenticated;

commit;
