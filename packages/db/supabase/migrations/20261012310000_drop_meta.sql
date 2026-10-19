-- 20261012310000_drop_meta.sql
--
-- The owner removed the Meta (Facebook) integration from the site (PR #86): no pixel, no Conversions
-- API, no Purchase event. This file removes what Phases 28 and 29 put in the database for it
-- (20261007240000_booking_meta_click_ids, 20261007260000_meta_purchase,
-- 20261007270000_meta_purchase_lock_order):
--   - table public.meta_purchase_events (with its primary key, unique event_id, two foreign keys,
--     two checks and row level security; no policies, grants, sequences or triggers of its own);
--   - functions public.meta_purchase_claim, meta_purchase_finish, meta_purchase_clear_ids,
--     meta_purchase_sweep, both overloads of public.checkout_set_meta_click_ids, and the trigger
--     function public.tg_bookings_meta_click_ids_pending_only with its trigger on public.bookings;
--   - columns public.bookings.meta_fbp, meta_fbc (with checks bookings_meta_fbp_format,
--     bookings_meta_fbc_format) and meta_consent_subject.
-- No other function, view, index or trigger references these objects (git grep of every migration,
-- 2026-10-19: 20261007280000 names meta_purchase_claim only in a comment), so nothing is recreated.
-- public.consent_log and the consent reader are untouched. No CASCADE: a surprise dependency must
-- abort the apply. No CHF amounts. Applied verbatim with the Supabase MCP apply_migration, one
-- transaction, only on the owner's word and after the Worker without the Meta code is live; never
-- `supabase db push`.
begin;

-- Brief ACCESS EXCLUSIVE locks on bookings and booking_payments (the table's foreign keys): give up
-- fast instead of queueing behind a long transaction.
set local lock_timeout = '5s';

drop function if exists public.meta_purchase_claim(pg_catalog.uuid, pg_catalog.int8, pg_catalog.text, pg_catalog.bool, pg_catalog.bool, pg_catalog.text);
drop function if exists public.meta_purchase_finish(pg_catalog.uuid, pg_catalog.uuid, pg_catalog.text, pg_catalog.int4, pg_catalog.int4, pg_catalog.int4);
drop function if exists public.meta_purchase_clear_ids(pg_catalog.uuid);
drop function if exists public.meta_purchase_sweep();
drop function if exists public.checkout_set_meta_click_ids(pg_catalog.uuid, pg_catalog.text, pg_catalog.text, pg_catalog.uuid);
drop function if exists public.checkout_set_meta_click_ids(pg_catalog.uuid, pg_catalog.text, pg_catalog.text);

drop table if exists public.meta_purchase_events;

drop trigger if exists bookings_meta_click_ids_pending_only on public.bookings;
drop function if exists public.tg_bookings_meta_click_ids_pending_only();

alter table public.bookings drop constraint if exists bookings_meta_fbp_format;
alter table public.bookings drop constraint if exists bookings_meta_fbc_format;
alter table public.bookings drop column if exists meta_fbp;
alter table public.bookings drop column if exists meta_fbc;
alter table public.bookings drop column if exists meta_consent_subject;

commit;
