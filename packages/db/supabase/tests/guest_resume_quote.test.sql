-- guest_resume_quote.test.sql
--
-- J5 (W3-06). The confirmation page names the quote of an UNPAID booking so FINISH PAYMENT can
-- open the checkout resume. The read answers only to the SHA-256 of that booking's own active
-- manage token, only while the booking is pending, and only vamos_guest may execute it.
begin;
select plan(13);

create temporary table grq_q as select gen_random_uuid() as pending_q, gen_random_uuid() as paid_q;
grant select on grq_q to public;

insert into public.bookings (contact_name, contact_email, contact_phone, quote_id, status)
select 'Ada Rider', 'grq-a@example.test', '+41000000001', q.pending_q, 'pending' from grq_q q;
insert into public.bookings (contact_name, contact_email, contact_phone, quote_id, status)
select 'Bo Rider', 'grq-b@example.test', '+41000000002', q.paid_q, 'confirmed' from grq_q q;

insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('grq-a', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'grq-a@example.test';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('grq-a-old', 'sha256'), now() - interval '1 hour'
  from public.bookings b where b.contact_email = 'grq-a@example.test';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at, revoked_at)
select b.id, extensions.digest('grq-a-rev', 'sha256'), now() + interval '1 day', now()
  from public.bookings b where b.contact_email = 'grq-a@example.test';
insert into public.booking_access_tokens (booking_id, token_hash, expires_at)
select b.id, extensions.digest('grq-b', 'sha256'), now() + interval '1 day'
  from public.bookings b where b.contact_email = 'grq-b@example.test';

create temporary table grq_ref as
  select (select reference from public.bookings where contact_email = 'grq-a@example.test') as a,
         (select reference from public.bookings where contact_email = 'grq-b@example.test') as b;
grant select on grq_ref to public;

set local role vamos_guest;

select is(
  public.guest_resume_quote((select a from grq_ref), extensions.digest('grq-a', 'sha256')),
  (select pending_q from grq_q), '(1) the owner token returns the quote of the unpaid booking');
select is(
  public.guest_resume_quote((select a from grq_ref), extensions.digest('wrong', 'sha256')),
  null::uuid, '(2) a wrong hash returns null');
select is(
  public.guest_resume_quote((select a from grq_ref), extensions.digest('grq-a-old', 'sha256')),
  null::uuid, '(3) an expired token returns null');
select is(
  public.guest_resume_quote((select a from grq_ref), extensions.digest('grq-a-rev', 'sha256')),
  null::uuid, '(4) a revoked token returns null');
select is(
  public.guest_resume_quote((select a from grq_ref), extensions.digest('grq-b', 'sha256')),
  null::uuid, '(5) another booking''s token returns null for this reference');
select is(
  public.guest_resume_quote((select b from grq_ref), extensions.digest('grq-b', 'sha256')),
  null::uuid, '(6) a paid booking answers null even for its own token');
select is(
  public.guest_resume_quote((select a from grq_ref), null),
  null::uuid, '(7) a null hash returns null');
select is(
  public.guest_resume_quote((select a from grq_ref), '\x00'::bytea),
  null::uuid, '(8) a hash of the wrong length returns null');
select is(
  public.guest_resume_quote('VT-00-0000', extensions.digest('grq-a', 'sha256')),
  null::uuid, '(9) an unknown reference returns null');

reset role;
set local role anon;
select throws_ok(
  $$select public.guest_resume_quote('VT-00-0000', extensions.digest('x', 'sha256'))$$,
  '42501', null, '(10) anon cannot execute');
reset role;
set local role authenticated;
select throws_ok(
  $$select public.guest_resume_quote('VT-00-0000', extensions.digest('x', 'sha256'))$$,
  '42501', null, '(11) authenticated cannot execute');
reset role;
select ok(
  has_function_privilege('vamos_guest', 'public.guest_resume_quote(text, bytea)', 'execute')
  and not has_function_privilege('vamos_checkout', 'public.guest_resume_quote(text, bytea)', 'execute')
  and not has_function_privilege('vamos_system', 'public.guest_resume_quote(text, bytea)', 'execute'),
  '(12) vamos_guest yes, vamos_checkout and vamos_system no');
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     from pg_proc p where p.oid = 'public.guest_resume_quote(text, bytea)'::regprocedure),
  '(13) security definer with an empty search_path');

select * from finish();
rollback;
