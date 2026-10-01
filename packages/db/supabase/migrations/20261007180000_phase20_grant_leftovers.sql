-- 20261007180000_phase20_grant_leftovers.sql
--
-- Phase 20 security leftovers (re-check 2026-10-01, reports/phase-20-recheck-2026-10-01.md).
-- Owner signed the plan 2026-10-01. Grants and one RLS switch only: no function body, no table
-- shape and no row is changed. Every grant removed below was read on live (read-only) on
-- 2026-10-01 and is held by a role that never calls the function:
--
--   The Worker logs in as vamos_edge (HYPERDRIVE_NOCACHE) and always SET LOCAL ROLE's before a
--   query (packages/db/src/identity.ts withIdentity): quotes run as anon (asQuote), consent as
--   anon (app/api/consent/route.ts asAnon), the price editor as vamos_staff (asStaff).
--   vamos_public (HYPERDRIVE, publicSql) only reads content_strings and reviews/vehicle_classes
--   (lib/content/messages.ts, lib/db/content.ts, lib/public/reviews.ts); it calls no function.
--   create_quote_snapshot is only called inside checkout_create_booking, a security definer
--   function that runs as its owner, so no caller role needs EXECUTE on it.
--
-- (G7)  public.staff_daily_digests has RLS on in live; the migration that created it
--       (20260901000002) never said so, so a from-zero replay left it off. No policy is added:
--       only service_role (bypasses RLS) and the definer digest functions touch it.
-- (G10) quote_rate_book, evaluate_coupon, quote_lock_deadline, quote_settings_version: off
--       vamos_edge and vamos_public (granted by 20260919000001). anon keeps all four,
--       vamos_staff keeps quote_rate_book (20261007100000). create_quote_snapshot: off
--       vamos_edge, its only grantee.
-- (G11) record_consent: off vamos_guest and vamos_public. anon and authenticated keep it.
-- (G12) extra_labels_read: off authenticated, vamos_checkout and vamos_system. anon (checkout
--       catalog, lib/checkout/checkout-catalog.ts) and vamos_staff (price editor) keep it.

-- (G7)
alter table public.staff_daily_digests enable row level security;

-- (G10)
revoke execute on function public.quote_rate_book(boolean) from vamos_edge, vamos_public;
revoke execute on function public.evaluate_coupon(text, uuid, extensions.citext) from vamos_edge, vamos_public;
revoke execute on function public.quote_lock_deadline(bigint) from vamos_edge, vamos_public;
revoke execute on function public.quote_settings_version(timestamptz) from vamos_edge, vamos_public;
revoke execute on function public.create_quote_snapshot(
  pg_catalog.uuid,
  pg_catalog.uuid,
  pg_catalog.int8,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.timestamptz,
  pg_catalog.int2,
  pg_catalog.int2,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  pg_catalog.jsonb,
  public.display_currency,
  pg_catalog.text,
  public.rappen,
  public.rappen,
  public.rappen,
  public.rappen,
  pg_catalog.numeric,
  pg_catalog.int4,
  pg_catalog.int8,
  pg_catalog.text,
  pg_catalog.uuid
) from vamos_edge;

-- (G11)
revoke execute on function public.record_consent(boolean, boolean, boolean, boolean, text, text, text, uuid, text, inet)
  from vamos_guest, vamos_public;

-- (G12)
revoke execute on function public.extra_labels_read() from authenticated, vamos_checkout, vamos_system;
