update public.bookings set status = 'paid' where id = '0a66ef23-6410-49a0-8c1f-ed7e2a19820c';
insert into public.booking_payments (booking_id, snapshot_id, stripe_payment_intent_id, charged_rappen, charged_currency, status, captured_at)
values ('0a66ef23-6410-49a0-8c1f-ed7e2a19820c', 1, 'pi_lab_hide_ids_1', 49, 'CHF', 'succeeded', now());
insert into public.booking_access_tokens (booking_id, token_hash, purpose, expires_at)
values ('0a66ef23-6410-49a0-8c1f-ed7e2a19820c', decode('ae216c2ef5247a3782c135efa279a3e4cdc61094270f5d2be58c6204b7a612c9','hex'), 'manage', 'infinity') on conflict do nothing;
delete from public.reviews where booking_id = '0a66ef23-6410-49a0-8c1f-ed7e2a19820c';
select id, status from public.bookings where id = '0a66ef23-6410-49a0-8c1f-ed7e2a19820c';
select booking_id, status from public.booking_payments where booking_id = '0a66ef23-6410-49a0-8c1f-ed7e2a19820c';
select booking_id, purpose, expires_at from public.booking_access_tokens where booking_id = '0a66ef23-6410-49a0-8c1f-ed7e2a19820c';
