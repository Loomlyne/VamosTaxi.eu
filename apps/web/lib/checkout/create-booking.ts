// apps/web/lib/checkout/create-booking.ts
//
// The only write from POST /api/checkout/intent. One sql template,
// public.checkout_create_booking — no INSERT of our own (D-01). The
// asCheckout wrapper lives on the Route Handler (D-06 / D-08).

import type postgres from "postgres";

export type CheckoutRpcResult = {
  booking_id: string;
  reference: string;
  snapshot_id: number;
  payment_id: number;
  replayed: boolean;
};

export type CreateBookingArgs = {
  quoteId: string;
  idempotencyKey: string;
  contact: { name: string; email: string; phone: string };
  locale: string;
  displayCurrency: string;
  snapshot: Record<string, unknown>;
  legs: unknown;
  couponId: number | null;
  couponCode: string | null;
  manageTokenHash: Uint8Array;
  manageTokenExpiresAt: Date;
  stripePaymentIntentId: string;
  stripeCheckoutSessionId: string;
  chargedRappen: number;
  actorCustomerId: string | null;
};

export async function createBooking(
  sql: postgres.TransactionSql,
  args: CreateBookingArgs,
): Promise<CheckoutRpcResult> {
  const rows = await sql`
    select * from public.checkout_create_booking(
      ${args.quoteId}::uuid,
      ${args.idempotencyKey},
      ${JSON.stringify({
        contact_name: args.contact.name,
        contact_email: args.contact.email,
        contact_phone: args.contact.phone,
      })}::jsonb,
      ${args.locale},
      ${args.displayCurrency},
      ${JSON.stringify(args.snapshot)}::jsonb,
      ${JSON.stringify(args.legs)}::jsonb,
      ${args.couponId},
      ${args.couponCode},
      ${args.manageTokenHash},
      ${args.manageTokenExpiresAt.toISOString()}::timestamptz,
      ${args.stripePaymentIntentId},
      ${args.stripeCheckoutSessionId},
      ${args.chargedRappen},
      ${args.actorCustomerId}
    )
  `;
  const row = rows[0];
  if (!row) {
    throw new Error("checkout_create_booking returned no row");
  }
  return {
    booking_id: String(row.booking_id),
    reference: String(row.reference),
    snapshot_id: Number(row.snapshot_id),
    payment_id: Number(row.payment_id),
    replayed: Boolean(row.replayed),
  };
}
