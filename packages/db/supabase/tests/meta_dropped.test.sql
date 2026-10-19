-- meta_dropped.test.sql
--
-- 20261012310000_drop_meta: the Meta (Facebook) objects of Phases 28 and 29 are gone from the
-- database: the Purchase table, its functions, the click-id writers, the pending-only trigger and the
-- three booking columns. consent_log stays. Run as postgres by `supabase test db`.
begin;
select plan(13);

select hasnt_table('public', 'meta_purchase_events', 'meta_purchase_events is gone');

select hasnt_function('public', 'meta_purchase_claim', 'meta_purchase_claim is gone');
select hasnt_function('public', 'meta_purchase_finish', 'meta_purchase_finish is gone');
select hasnt_function('public', 'meta_purchase_clear_ids', 'meta_purchase_clear_ids is gone');
select hasnt_function('public', 'meta_purchase_sweep', 'meta_purchase_sweep is gone');
select hasnt_function('public', 'checkout_set_meta_click_ids', 'checkout_set_meta_click_ids is gone (both overloads)');
select hasnt_function('public', 'tg_bookings_meta_click_ids_pending_only', 'the pending-only trigger function is gone');
select hasnt_trigger('public', 'bookings', 'bookings_meta_click_ids_pending_only', 'the pending-only trigger is gone');

select hasnt_column('public', 'bookings', 'meta_fbp', 'bookings.meta_fbp is gone');
select hasnt_column('public', 'bookings', 'meta_fbc', 'bookings.meta_fbc is gone');
select hasnt_column('public', 'bookings', 'meta_consent_subject', 'bookings.meta_consent_subject is gone');

select is((select pg_catalog.count(*)::pg_catalog.int4 from pg_catalog.pg_proc p
            where p.pronamespace = 'public'::pg_catalog.regnamespace and p.proname like 'meta\_%'), 0,
          'no public function named meta_* is left');

select has_table('public', 'consent_log', 'consent_log stays');

select * from finish();
rollback;
