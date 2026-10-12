-- 20261012130000_guest_resume_quote.sql
--
-- J5 (payments review W3-06). The confirmation page of an UNPAID booking shows FINISH PAYMENT.
-- It used to link to the bare, empty checkout. The checkout can refill a booking
-- (`/checkout?resume=<quote_id>`, checkout_resume_read), but the confirmation read does not
-- carry the quote id. This adds the one narrow read the page needs.
--
-- public.guest_resume_quote(reference, token_hash) returns the quote id of that booking, only
-- when (a) the hash is an active manage token of that booking, (b) the booking is still
-- `pending` (unpaid) and (c) it has a quote id. Anything else returns null. Same door as
-- guest_confirmation_read: the manage cookie's hash. EXECUTE: vamos_guest only.
--
-- No amounts, no existing function changed. The migration number was not assigned to J5 by the
-- controller; the controller applies it verbatim, before the Worker that calls it (the Worker
-- treats a missing function as "no finish link", so the order is not critical).

begin;

create or replace function public.guest_resume_quote(
  p_reference pg_catalog.text,
  p_token_hash pg_catalog.bytea
)
returns pg_catalog.uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.quote_id
    from public.bookings as b
    join public.booking_access_tokens as t on t.booking_id = b.id
   where p_token_hash is not null
     and pg_catalog.octet_length(p_token_hash) = 32
     and b.reference = p_reference
     and b.status = 'pending'
     and b.quote_id is not null
     and b.erased_at is null
     and t.token_hash = p_token_hash
     and t.purpose = 'manage'
     and t.revoked_at is null
     and t.expires_at > pg_catalog.now()
   limit 1;
$$;

revoke all on function public.guest_resume_quote(pg_catalog.text, pg_catalog.bytea) from public;
revoke all on function public.guest_resume_quote(pg_catalog.text, pg_catalog.bytea) from anon;
revoke all on function public.guest_resume_quote(pg_catalog.text, pg_catalog.bytea) from authenticated;
grant execute on function public.guest_resume_quote(pg_catalog.text, pg_catalog.bytea) to vamos_guest;

comment on function public.guest_resume_quote(pg_catalog.text, pg_catalog.bytea) is
  'J5 W3-06: quote id of an UNPAID (pending) booking, only for an active manage token of that booking. Null otherwise. Lets the confirmation page link FINISH PAYMENT to the checkout resume. EXECUTE: vamos_guest.';

commit;
