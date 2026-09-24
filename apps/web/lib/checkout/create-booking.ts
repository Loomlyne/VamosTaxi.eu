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

function byteaHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function jsonHex(value: unknown): string {
  return byteaHex(new TextEncoder().encode(JSON.stringify(value)));
}

export async function createBooking(
  sql: postgres.TransactionSql,
  args: CreateBookingArgs,
): Promise<CheckoutRpcResult> {
  const tokenHex = byteaHex(args.manageTokenHash);
  const contactHex = jsonHex({
    contact_name: args.contact.name,
    contact_email: args.contact.email,
    contact_phone: args.contact.phone,
  });
  const snapshotHex = jsonHex(args.snapshot);
  const legsHex = jsonHex(args.legs);
  const rows = await sql`
    select * from public.checkout_create_booking(
      ${args.quoteId}::uuid,
      ${args.idempotencyKey},
      convert_from(decode(${contactHex}, 'hex'), 'utf8')::jsonb,
      ${args.locale},
      ${args.displayCurrency},
      convert_from(decode(${snapshotHex}, 'hex'), 'utf8')::jsonb,
      convert_from(decode(${legsHex}, 'hex'), 'utf8')::jsonb,
      ${args.couponId},
      ${args.couponCode},
      decode(${tokenHex}, 'hex'),
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

export async function issueManageToken(
  sql: postgres.TransactionSql,
  args: { bookingId: string; hash: Uint8Array; expiresAt: Date },
): Promise<void> {
  const tokenHex = byteaHex(args.hash);
  await sql`
    select public.checkout_issue_manage_token(
      ${args.bookingId}::uuid,
      decode(${tokenHex}, 'hex'),
      ${args.expiresAt.toISOString()}::timestamptz
    )
  `;
}
