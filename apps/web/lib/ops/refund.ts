// apps/web/lib/ops/refund.ts
//
// 08-05 + 09-05: Stripe-first refund. createRefund then ops_refund_record.
// D-12 remaining until 0. Fail returns ok:false and leaves the trip as-is.
// Never staff INSERT into refunds. Never mark bookings.status refunded.

import { asStaff, asSystem, type VamosClaims } from "../db/identity";
import { applyStripeRefund } from "../lifecycle/paid-cancel";
import { createRefund, stripeFromEnv } from "../checkout/stripe";
import {
  mapRefundSqlError,
  opsRefundAmount,
  stripeFeeRappen,
  type RefundResult,
} from "./refund-map";
import { resolveStaffBookingId } from "./resolve-booking-id";

export const dynamic = "force-dynamic";

export type { RefundFail, RefundOk, RefundResult } from "./refund-map";
export { opsRefundAmount } from "./refund-map";

export type RefundAmountInput = {
  percent?: number;
  rappen?: number;
};

type LoadedPayment = {
  bookingId: string;
  paymentId: number;
  paymentIntentId: string;
  chargedRappen: number;
  refundedRappen: number;
};

async function loadMail(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingId: string,
  paymentId: number,
  refundId: number,
): Promise<RefundResult> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<
      {
        contact_email: string | null;
        payer_email: string | null;
        contact_name: string | null;
        locale: string | null;
        reference: string;
      }[]
    >`
      select b.contact_email, b.payer_email, b.contact_name, b.locale, b.reference
        from public.bookings as b
       where b.id = ${bookingId}::uuid
       limit 1
    `;
    const row = rows[0];
    if (!row) return { ok: false, code: "unknown" };
    return {
      ok: true,
      bookingId,
      refundId,
      paymentId,
      contactEmail: String(row.contact_email ?? ""),
      payerEmail: String(row.payer_email ?? ""),
      contactName: String(row.contact_name ?? ""),
      locale: String(row.locale ?? "en"),
      reference: String(row.reference),
    };
  });
}

export async function refundBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
  requested?: RefundAmountInput,
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
    const sums = await sql<{ refunded: number | string | null }[]>`
      select coalesce(sum(r.refund_rappen), 0) as refunded
        from public.booking_refunds as r
       where r.booking_id = ${bookingId}::uuid
    `;
    return {
      bookingId,
      paymentId: Number(first.id),
      paymentIntentId: String(first.stripe_payment_intent_id),
      chargedRappen,
      refundedRappen: Number(sums[0]?.refunded ?? 0),
    };
  });

  if ("ok" in loaded && loaded.ok === false) return loaded;

  const payment = loaded as LoadedPayment;
  const { remaining, amount } = opsRefundAmount({
    capturedRappen: payment.chargedRappen,
    refundedRappen: payment.refundedRappen,
    percent: requested?.percent,
    rappen: requested?.rappen,
  });
  if (remaining <= 0 || amount <= 0) return { ok: false, code: "already-refunded" };

  if (amount < remaining) {
    const partial = await applyStripeRefund(env, {
      bookingId: payment.bookingId,
      paymentId: payment.paymentId,
      paymentIntentId: payment.paymentIntentId,
      amountRappen: amount,
      idempotencyKey: `refund:${payment.bookingId}:${payment.paymentId}:ops-remaining:${amount}`,
    });
    if (!partial.ok) return { ok: false, code: partial.code };
    return loadMail(env, claims, payment.bookingId, payment.paymentId, 0);
  }

  let refundId = "";
  let fee: number | null = null;
  try {
    const stripe = stripeFromEnv(env);
    const refund = await createRefund(stripe, {
      paymentIntentId: payment.paymentIntentId,
      amountRappen: amount,
      idempotencyKey: `refund:${payment.bookingId}:${payment.paymentId}:ops-remaining:${amount}`,
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
