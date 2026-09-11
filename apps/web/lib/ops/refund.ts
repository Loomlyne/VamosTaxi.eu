// apps/web/lib/ops/refund.ts
//
// 08-05: Stripe-first full refund. createRefund then ops_refund_record.
// Fail returns ok:false and leaves paid. Never staff INSERT into refunds.

import { asStaff, asSystem, type VamosClaims } from "../db/identity";
import { createRefund, stripeFromEnv } from "../checkout/stripe";
import {
  mapRefundSqlError,
  stripeFeeRappen,
  type RefundResult,
} from "./refund-map";
import { resolveStaffBookingId } from "./resolve-booking-id";

export const dynamic = "force-dynamic";

export type { RefundFail, RefundOk, RefundResult } from "./refund-map";

type LoadedPayment = {
  bookingId: string;
  paymentId: number;
  paymentIntentId: string;
  chargedRappen: number;
};

export async function refundBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
): Promise<RefundResult> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };

  const secret = env.STRIPE_SECRET_KEY ?? "";
  if (secret.startsWith("sk_live_")) {
    return { ok: false, code: "stripe-test-only" };
  }

  const bookingId = await resolveStaffBookingId(env, claims, key);
  if (!bookingId) return { ok: false, code: "not-found" };

  const loaded = await asStaff(env, claims, async (sql): Promise<LoadedPayment | RefundResult> => {
    const pays = await sql<
      { id: number; stripe_payment_intent_id: string; charged_rappen: number }[]
    >`
      select p.id, p.stripe_payment_intent_id, p.charged_rappen
        from public.booking_payments as p
       where p.booking_id = ${bookingId}::uuid
         and p.captured_at is not null
       order by p.id
    `;
    if (pays.length === 0) return { ok: false, code: "not-paid" };
    const chargedRappen = pays.reduce((sum, row) => sum + Number(row.charged_rappen), 0);
    const first = pays[0];
    if (!first || chargedRappen <= 0) return { ok: false, code: "not-paid" };
    const existing = await sql<{ id: number }[]>`
      select r.id
        from public.booking_refunds as r
       where r.payment_id = ${first.id}
       limit 1
    `;
    if (existing[0]) return { ok: false, code: "already-refunded" };
    return {
      bookingId,
      paymentId: Number(first.id),
      paymentIntentId: String(first.stripe_payment_intent_id),
      chargedRappen,
    };
  });

  if ("ok" in loaded && loaded.ok === false) return loaded;

  const payment = loaded as LoadedPayment;

  let refundId = "";
  let fee: number | null = null;
  try {
    const stripe = stripeFromEnv(env);
    const refund = await createRefund(stripe, {
      paymentIntentId: payment.paymentIntentId,
      amountRappen: payment.chargedRappen,
      idempotencyKey: `refund:${payment.bookingId}:${payment.paymentId}`,
    });
    if (!refund?.id) return { ok: false, code: "stripe-failed" };
    refundId = refund.id;
    fee = stripeFeeRappen(refund);
  } catch {
    return { ok: false, code: "stripe-failed" };
  }

  return asSystem(env, async (sql) => {
    try {
      const rows = await sql<
        {
          booking_id: string;
          refund_id: number;
          payment_id: number;
          contact_email: string | null;
          payer_email: string | null;
          contact_name: string | null;
          locale: string | null;
          reference: string;
        }[]
      >`
        select * from public.ops_refund_record(
          ${payment.bookingId}::uuid,
          ${payment.paymentId}::bigint,
          ${refundId}::text,
          ${claims.sub}::uuid,
          ${fee}
        )
      `;
      const row = rows[0];
      if (!row) return { ok: false, code: "unknown" };
      return {
        ok: true,
        bookingId: String(row.booking_id),
        refundId: Number(row.refund_id),
        paymentId: Number(row.payment_id),
        contactEmail: String(row.contact_email ?? ""),
        payerEmail: String(row.payer_email ?? ""),
        contactName: String(row.contact_name ?? ""),
        locale: String(row.locale ?? "en"),
        reference: String(row.reference),
      };
    } catch (err) {
      return mapRefundSqlError(err);
    }
  });
}
