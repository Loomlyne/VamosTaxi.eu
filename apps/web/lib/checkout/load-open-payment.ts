// apps/web/lib/checkout/load-open-payment.ts
//
// Unpaid checkout on this quote — reuse that Stripe session instead of
// 409 quote_already_booked (the card form never got client_secret).

import type postgres from "postgres";

export type OpenPayment = {
  booking_id: string;
  reference: string;
  stripe_checkout_session_id: string;
};

export async function loadOpenPayment(
  sql: postgres.TransactionSql,
  quoteId: string,
): Promise<OpenPayment | null> {
  const rows = await sql`
    select b.id as booking_id,
           b.reference,
           bp.stripe_checkout_session_id
    from public.bookings b
    inner join public.booking_payments bp on bp.booking_id = b.id
    where b.quote_id = ${quoteId}::uuid
      and bp.status = 'requires_payment'
      and bp.stripe_checkout_session_id is not null
    order by bp.created_at desc
    limit 1
  `;
  const row = rows[0];
  if (!row?.stripe_checkout_session_id) return null;
  return {
    booking_id: String(row.booking_id),
    reference: String(row.reference),
    stripe_checkout_session_id: String(row.stripe_checkout_session_id),
  };
}
