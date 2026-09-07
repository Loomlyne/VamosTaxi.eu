// apps/web/lib/checkout/attach-payment.ts
//
// Second PaymentIntent on a pending booking (D-35 whoever-first).
// asCheckout stays on the Route Handler.

import type postgres from "postgres";

export async function attachPayment(
  sql: postgres.TransactionSql,
  args: {
    quoteId: string;
    stripePaymentIntentId: string;
    stripeCheckoutSessionId: string;
    chargedRappen: number;
  },
): Promise<{ booking_id: string; reference: string; snapshot_id: number; payment_id: number; replayed: boolean }> {
  const rows = await sql`
    select * from public.checkout_attach_payment(
      ${args.quoteId}::uuid,
      ${args.stripePaymentIntentId},
      ${args.stripeCheckoutSessionId},
      ${args.chargedRappen}::public.rappen
    )
  `;
  const row = rows[0];
  if (!row) throw new Error("checkout_attach_payment returned no row");
  return {
    booking_id: String(row.booking_id),
    reference: String(row.reference),
    snapshot_id: Number(row.snapshot_id),
    payment_id: Number(row.payment_id),
    replayed: false,
  };
}
