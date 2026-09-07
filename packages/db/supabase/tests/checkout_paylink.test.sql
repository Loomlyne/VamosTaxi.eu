-- checkout_paylink.test.sql
--
-- D-34…D-38: company + pay-link columns and RPCs exist. Charge gate source
-- is untouched. Isolated — no CHF figures, no hosted apply.

begin;
select plan(12);

select has_column(
  'public',
  'bookings',
  'payer_email',
  'bookings.payer_email exists (D-37)'
);

select has_column(
  'public',
  'bookings',
  'pay_link_sent_at',
  'bookings.pay_link_sent_at exists (D-37 clock)'
);

select has_column(
  'public',
  'bookings',
  'company_vat',
  'bookings.company_vat exists (D-36)'
);

select has_column(
  'public',
  'bookings',
  'billing_kind',
  'bookings.billing_kind exists'
);

select has_function(
  'public',
  'checkout_set_pay_link',
  'checkout_set_pay_link exists'
);

select has_function(
  'public',
  'checkout_attach_payment',
  'checkout_attach_payment exists (whoever-first)'
);

select has_function(
  'public',
  'checkout_pay_link_by_hash',
  'checkout_pay_link_by_hash exists'
);

select ok(
  pg_get_constraintdef(oid) like '%pay%',
  'booking_access_tokens purpose allows pay'
)
from pg_constraint
where conrelid = 'public.booking_access_tokens'::regclass
  and conname = 'booking_access_tokens_purpose_check';

select ok(
  pg_get_functiondef('public.tg_payment_matches_snapshot()'::regprocedure)
    like '%expires_at%',
  'charge gate still reads snapshot.expires_at'
);

select ok(
  pg_get_functiondef('public.tg_payment_matches_snapshot()'::regprocedure)
    not like '%payer_email%',
  'charge gate does not mention payer_email'
);

select ok(
  pg_get_functiondef('public.checkout_set_pay_link(uuid,text,text,text,text,text,bytea,timestamptz)'::regprocedure)
    like '%coalesce(v_sent, now())%',
  'resend does not restart pay_link_sent_at'
);

select ok(
  pg_get_functiondef('public.checkout_attach_payment(uuid,text,text,public.rappen)'::regprocedure)
    like '%quote_already_booked%',
  'second settle on a non-pending booking is refused'
);

select * from finish();
rollback;
