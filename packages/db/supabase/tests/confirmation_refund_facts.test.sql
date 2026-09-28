-- confirmation_refund_facts.test.sql
--
-- 26.1-19 (26.1-18 deferred): the confirmation page read carries the refund facts, so the
-- voucher's refund line (status word + amount, D-23a) survives a reload. Grants stay as
-- strict as 20260924004100_confirmation_read.sql made them.
-- Rolled back. Synthetic integer rappen only, never a product CHF.
begin;
select plan(12);

insert into public.bookings (contact_name, contact_email, status)
values ('CRF Refunded', 'crf-refunded@vamostaxi.eu', 'cancelled'),
       ('CRF None', 'crf-none@vamostaxi.eu', 'pending');

set local session_replication_role = replica;
update public.bookings
   set refund_status = 'refunded', refund_owed_rappen = 8000, refunded_rappen = 8000
 where contact_email = 'crf-refunded@vamostaxi.eu';
set local session_replication_role = origin;

create temporary table crf as
select
  public.confirmation_payload((select id from public.bookings where contact_email = 'crf-refunded@vamostaxi.eu')) as refunded,
  public.confirmation_payload((select id from public.bookings where contact_email = 'crf-none@vamostaxi.eu')) as untouched;

select is((select refunded -> 'booking' ->> 'refund_status' from crf), 'refunded',
  'the confirmation read carries refund_status');
select is((select (refunded -> 'booking' ->> 'refund_owed_rappen')::int from crf), 8000,
  'the confirmation read carries refund_owed_rappen');
select is((select (refunded -> 'booking' ->> 'refunded_rappen')::int from crf), 8000,
  'the confirmation read carries refunded_rappen');
select is((select untouched -> 'booking' ->> 'refund_status' from crf), 'none',
  'a booking with no refund reads refund_status none');
select ok((select (untouched -> 'booking') ? 'refund_owed_rappen' from crf),
  'refund_owed_rappen is present (null) when nothing is owed');

-- Grants unchanged.
select ok(not has_function_privilege('anon', 'public.confirmation_payload(uuid)', 'execute'),
  'anon cannot execute confirmation_payload');
select ok(not has_function_privilege('authenticated', 'public.confirmation_payload(uuid)', 'execute'),
  'authenticated cannot execute confirmation_payload');
select ok(not has_function_privilege('vamos_guest', 'public.confirmation_payload(uuid)', 'execute'),
  'vamos_guest cannot execute confirmation_payload');
select ok(not has_function_privilege('anon', 'public.guest_confirmation_read(text, bytea)', 'execute'),
  'anon cannot execute guest_confirmation_read');
select ok(has_function_privilege('vamos_guest', 'public.guest_confirmation_read(text, bytea)', 'execute'),
  'vamos_guest executes guest_confirmation_read');
select ok(has_function_privilege('authenticated', 'public.customer_confirmation_read(text, uuid)', 'execute'),
  'authenticated executes customer_confirmation_read');
select ok(not has_function_privilege('vamos_guest', 'public.customer_confirmation_read(text, uuid)', 'execute'),
  'vamos_guest cannot execute customer_confirmation_read');

select * from finish();
rollback;
