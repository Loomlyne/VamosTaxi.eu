// apps/web/lib/ops/refund.ts
//
// 08-05 + 09-05: Stripe-first refund. createRefund then ops_refund_record.
// D-12 remaining until 0. Fail returns ok:false and leaves the trip as-is.
// Never staff INSERT into refunds. Never mark bookings.status refunded.
// 26.1-17 D-24/D-25: the admin refunds a percentage, accepts a post-trip request
// (reason post_trip), or declines/rejects (decideRefund -> ops_refund_decide).
// Every admin refund is recorded by ops_refund_record, so decided_by is the admin.

import { asStaff, asSystem, type VamosClaims } from "../db/identity";
import { createRefund, resolvePaymentIntentId, stripeFromEnv } from "../checkout/stripe";
import {
  mapRefundSqlError,
  opsRefundAmount,
  stripeFeeRappen,
  type RefundDecision,
  type RefundFail,
  type RefundResult,
} from "./refund-map";
import { resolveStaffBookingId } from "./resolve-booking-id";

export const dynamic = "force-dynamic";

export type { RefundFail, RefundOk, RefundResult } from "./refund-map";
export { opsRefundAmount } from "./refund-map";

export type RefundAmountInput = {
  percent?: number;
  rappen?: number;
  /** D-25 accept: full remaining, recorded with reason post_trip. */
  postTrip?: boolean;
};

/** Booking statuses where the trip happened (D-25 post-trip accept / reject). */
const POST_TRIP_STATUSES: readonly string[] = Object.freeze([
  "completed",
  "partially_completed",
  "no_show",
]);

type LoadedPayment = {
  bookingId: string;
  bookingStatus: string;
  paymentId: number;
  paymentIntentId: string;
  chargedRappen: number;
  refundedRappen: number;
  /** What ops_refund_record can still record against this one payment. */
  paymentRemainingRappen: number;
};

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
    const bookings = await sql<{ status: string }[]>`
      select b.status::text as status
        from public.bookings as b
       where b.id = ${bookingId}::uuid
       limit 1
    `;
    if (!bookings[0]) return { ok: false, code: "not-found" };
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
    const sums = await sql<{ refunded: number | string | null; on_first: number | string | null }[]>`
      select coalesce(sum(r.refund_rappen), 0) as refunded,
             coalesce(sum(r.refund_rappen) filter (where r.payment_id = ${first.id}::bigint), 0) as on_first
        from public.booking_refunds as r
       where r.booking_id = ${bookingId}::uuid
    `;
    return {
      bookingId,
      bookingStatus: String(bookings[0].status),
      paymentId: Number(first.id),
      paymentIntentId: String(first.stripe_payment_intent_id),
      chargedRappen,
      refundedRappen: Number(sums[0]?.refunded ?? 0),
      paymentRemainingRappen: Number(first.charged_rappen) - Number(sums[0]?.on_first ?? 0),
    };
  });

  if ("ok" in loaded && loaded.ok === false) return loaded;

  const payment = loaded as LoadedPayment;
  const postTrip = requested?.postTrip === true;
  if (postTrip && !POST_TRIP_STATUSES.includes(payment.bookingStatus)) {
    return { ok: false, code: "not-post-trip" };
  }
  const { remaining, amount } = opsRefundAmount({
    capturedRappen: payment.chargedRappen,
    refundedRappen: payment.refundedRappen,
    percent: postTrip ? undefined : requested?.percent,
    rappen: postTrip ? undefined : requested?.rappen,
  });
  if (remaining <= 0) return { ok: false, code: "already-refunded" };
  if (amount <= 0) return { ok: false, code: "zero-amount" };
  // ops_refund_record records against one payment; never move money it would refuse.
  if (amount > payment.paymentRemainingRappen) return { ok: false, code: "refund-exceeds-remaining" };

  const explicit =
    !postTrip && (typeof requested?.percent === "number" || typeof requested?.rappen === "number");
  const decidedRappen: number | null = explicit ? amount : null;
  const reason: string | null = postTrip ? "post_trip" : null;
  const kind = postTrip ? "ops-post-trip" : explicit ? "ops-decided" : "ops-remaining";

  let refundId = "";
  let fee: number | null = null;
  try {
    const stripe = stripeFromEnv(env);
    const paymentIntentId = await resolvePaymentIntentId(stripe, payment.paymentIntentId);
    if (!paymentIntentId) return { ok: false, code: "stripe-failed" };
    const refund = await createRefund(stripe, {
      paymentIntentId,
      amountRappen: amount,
      idempotencyKey: `refund:${payment.bookingId}:${payment.paymentId}:${kind}:${amount}`,
      bookingId: payment.bookingId,
      paymentId: payment.paymentId,
      reason: postTrip ? "post_trip" : explicit ? "ops_decided" : "ops_remaining",
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
          ${fee},
          ${reason}::text,
          ${decidedRappen}
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

export type DecideRefundResult =
  | { ok: true; bookingId: string; refundStatus: string; reference: string }
  | RefundFail;

/**
 * 26.1-17 D-24 decline / D-25 reject. No money moves. Runs as the staff identity so
 * ops_refund_decide can check app.is_admin() itself (T-26.1-53) and record the admin
 * on the refund.declined / refund.rejected event (T-26.1-55).
 */
export async function decideRefund(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
  decision: RefundDecision,
): Promise<DecideRefundResult> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };
  const bookingId = await resolveStaffBookingId(env, claims, key);
  if (!bookingId) return { ok: false, code: "not-found" };
  return asStaff(env, claims, async (sql): Promise<DecideRefundResult> => {
    try {
      const rows = await sql<{ booking_id: string; refund_status: string; reference: string }[]>`
        select * from public.ops_refund_decide(${bookingId}::uuid, ${decision}::text)
      `;
      const row = rows[0];
      if (!row) return { ok: false, code: "unknown" };
      return {
        ok: true,
        bookingId: String(row.booking_id),
        refundStatus: String(row.refund_status),
        reference: String(row.reference),
      };
    } catch (err) {
      return mapRefundSqlError(err);
    }
  });
}
