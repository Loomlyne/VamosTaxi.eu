// apps/web/lib/lifecycle/paid-cancel.ts
//
// 09-05: compute RPC → createRefund → record_booking_refund. Stripe network
// outside the DB tx. D-08 never restores a prior status. D-07 persists Stripe facts only.

export const dynamic = "force-dynamic";

import { CHARGE_CURRENCY } from "../checkout/currency";
import { createRefund, retrieveRefund, stripeFromEnv } from "../checkout/stripe";
import { asCustomer, asGuest, asSystem, type VamosClaims } from "../db/identity";

export type PaidCancelOk = {
  ok: true;
  bookingId: string;
  refundMode: string;
  refundStatus: string;
  refundRappen: number;
  payoutCountry?: string | null;
  availableOn?: string | null;
};

export type PaidCancelFail = { ok: false; code: string };

export type PaidCancelResult = PaidCancelOk | PaidCancelFail;

export type ApplyStripeRefundInput = {
  bookingId: string;
  paymentId: number;
  paymentIntentId: string;
  amountRappen: number;
  idempotencyKey: string;
};

export type ApplyStripeRefundOk = {
  ok: true;
  stripeRefundId: string;
  payoutCountry: string;
  availableOn: string | null;
};

export type ApplyStripeRefundResult = ApplyStripeRefundOk | PaidCancelFail;

type CancelledRow = {
  booking_id: string;
  refund_mode: string;
  refund_rappen: number | string | null;
  stripe_payment_intent_id: string | null;
};

type LoadedPayment = {
  paymentId: number;
  paymentIntentId: string;
  chargedRappen: number;
};

function messageOf(err: unknown): string {
  if (typeof err !== "object" || err === null || !("message" in err)) return "";
  const message = (err as { message: unknown }).message;
  return typeof message === "string" ? message : "";
}

function sqlCodeOf(err: unknown): string {
  if (typeof err !== "object" || err === null || !("code" in err)) return "";
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : "";
}

export function mapCancelSqlError(err: unknown): PaidCancelFail {
  const message = messageOf(err);
  const code = sqlCodeOf(err);
  if (message === "not_found" || message === "not-found" || code === "P0002") {
    return { ok: false, code: "not-found" };
  }
  if (message.startsWith("not_cancellable") || message.startsWith("not-cancellable")) {
    return { ok: false, code: "not-cancellable" };
  }
  if (message.startsWith("unpaid_use_hard_delete")) {
    return { ok: false, code: "unpaid-use-hard-delete" };
  }
  return { ok: false, code: "unknown" };
}

export function payoutFactsFromRefund(refund: {
  charge?: unknown;
  balance_transaction?: unknown;
}): { payoutCountry: string; availableOn: string | null } {
  let payoutCountry = "CH";
  const charge = refund.charge;
  if (charge && typeof charge === "object") {
    const details = (charge as { payment_method_details?: { card?: { country?: string | null } } })
      .payment_method_details;
    const country = details?.card?.country;
    if (typeof country === "string" && country.trim()) {
      payoutCountry = country.trim().toUpperCase();
    }
  }

  let availableOn: string | null = null;
  const bt = refund.balance_transaction;
  if (bt && typeof bt === "object") {
    const unix = (bt as { available_on?: unknown }).available_on;
    if (typeof unix === "number" && Number.isFinite(unix) && unix > 0) {
      availableOn = new Date(unix * 1000).toISOString();
    }
  }
  return { payoutCountry, availableOn };
}

function liveKeyRefused(env: CloudflareEnv): boolean {
  return (env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_");
}

async function markRefundFailed(env: CloudflareEnv, bookingId: string): Promise<void> {
  try {
    await asSystem(env, async (sql) => {
      await sql`select public.bookings_set_refund_failed(${bookingId}::uuid)`;
    });
  } catch {
    // D-08: stay cancelled even if the failed stamp misses.
  }
}

export async function applyStripeRefund(
  env: CloudflareEnv,
  input: ApplyStripeRefundInput,
): Promise<ApplyStripeRefundResult> {
  if (liveKeyRefused(env)) {
    return { ok: false, code: "stripe-test-only" };
  }
  if (!input.paymentIntentId || input.amountRappen <= 0) {
    await markRefundFailed(env, input.bookingId);
    return { ok: false, code: "stripe-failed" };
  }

  let stripeRefundId = "";
  let facts = { payoutCountry: "CH", availableOn: null as string | null };
  try {
    const stripe = stripeFromEnv(env);
    const created = await createRefund(stripe, {
      paymentIntentId: input.paymentIntentId,
      amountRappen: input.amountRappen,
      idempotencyKey: input.idempotencyKey,
    });
    if (!created?.id) {
      await markRefundFailed(env, input.bookingId);
      return { ok: false, code: "stripe-failed" };
    }
    stripeRefundId = created.id;
    const currency = created.currency?.toLowerCase();
    if (currency && currency !== CHARGE_CURRENCY) {
      await markRefundFailed(env, input.bookingId);
      return { ok: false, code: "stripe-failed" };
    }
    let expanded = created;
    try {
      expanded = await retrieveRefund(stripe, created.id);
    } catch {
      expanded = created;
    }
    facts = payoutFactsFromRefund(expanded);
  } catch {
    await markRefundFailed(env, input.bookingId);
    return { ok: false, code: "stripe-failed" };
  }

  try {
    await asSystem(env, async (sql) => {
      await sql`
        select * from public.record_booking_refund(
          ${input.bookingId}::uuid,
          ${stripeRefundId}::text,
          ${facts.payoutCountry}::text,
          ${facts.availableOn}::timestamptz,
          ${input.amountRappen}
        )
      `;
    });
  } catch {
    return { ok: false, code: "unknown" };
  }

  return {
    ok: true,
    stripeRefundId,
    payoutCountry: facts.payoutCountry,
    availableOn: facts.availableOn,
  };
}

async function loadCapturedPayment(env: CloudflareEnv, bookingId: string): Promise<LoadedPayment | null> {
  return asSystem(env, async (sql) => {
    const rows = await sql<{ id: number; stripe_payment_intent_id: string; charged_rappen: number }[]>`
      select p.id, p.stripe_payment_intent_id, p.charged_rappen
        from public.booking_payments as p
       where p.booking_id = ${bookingId}::uuid
         and p.captured_at is not null
       order by p.id
       limit 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      paymentId: Number(row.id),
      paymentIntentId: String(row.stripe_payment_intent_id),
      chargedRappen: Number(row.charged_rappen),
    };
  });
}

async function setRefundProcessing(env: CloudflareEnv, bookingId: string): Promise<void> {
  try {
    await asSystem(env, async (sql) => {
      await sql`
        update public.bookings
           set refund_status = 'processing',
               updated_at = now()
         where id = ${bookingId}::uuid
      `;
    });
  } catch {
    // Cancel already committed. Stripe still runs; D-08 never restores status.
  }
}

export async function finishPaidCancel(
  env: CloudflareEnv,
  row: CancelledRow,
  idempotencySuffix = "customer-cancel",
): Promise<PaidCancelResult> {
  const bookingId = String(row.booking_id);
  const refundMode = String(row.refund_mode ?? "");
  const refundRappen = Number(row.refund_rappen ?? 0);

  if (refundMode !== "auto_full") {
    return {
      ok: true,
      bookingId,
      refundMode,
      refundStatus: refundMode === "pending_ops" ? "pending_ops" : "none",
      refundRappen: Number.isFinite(refundRappen) ? refundRappen : 0,
    };
  }

  if (liveKeyRefused(env)) {
    await markRefundFailed(env, bookingId);
    return { ok: false, code: "stripe-test-only" };
  }

  const payment = await loadCapturedPayment(env, bookingId);
  const paymentIntentId = payment?.paymentIntentId || String(row.stripe_payment_intent_id ?? "");
  if (!payment || !paymentIntentId) {
    await markRefundFailed(env, bookingId);
    return { ok: false, code: "stripe-failed" };
  }

  const amountRappen =
    Number.isFinite(refundRappen) && refundRappen > 0 ? refundRappen : payment.chargedRappen;

  await setRefundProcessing(env, bookingId);

  const refunded = await applyStripeRefund(env, {
    bookingId,
    paymentId: payment.paymentId,
    paymentIntentId,
    amountRappen,
    idempotencyKey: `refund:${bookingId}:${payment.paymentId}:${idempotencySuffix}`,
  });

  if (!refunded.ok) {
    return { ok: false, code: refunded.code };
  }

  return {
    ok: true,
    bookingId,
    refundMode: "auto_full",
    refundStatus: "refunded",
    refundRappen: amountRappen,
    payoutCountry: refunded.payoutCountry,
    availableOn: refunded.availableOn,
  };
}

export async function paidCancelGuest(
  env: CloudflareEnv,
  tokenHashHex: string,
): Promise<PaidCancelResult> {
  if (!tokenHashHex) return { ok: false, code: "not-found" };
  let row: CancelledRow | undefined;
  try {
    row = await asGuest(env, tokenHashHex, async (sql) => {
      const rows = await sql<CancelledRow[]>`
        select * from public.manage_booking_cancel(decode(${tokenHashHex}, 'hex'))
      `;
      return rows[0];
    });
  } catch (err) {
    return mapCancelSqlError(err);
  }
  if (!row?.booking_id) return { ok: false, code: "not-found" };
  return finishPaidCancel(env, row, "customer-cancel");
}

const BOOKING_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOOKING_REF = /^VT-\d{2}-\d{4,5}$/i;

export async function paidCancelCustomer(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
): Promise<PaidCancelResult> {
  const key = bookingKey.trim();
  if (!key || (!BOOKING_UUID.test(key) && !BOOKING_REF.test(key))) {
    return { ok: false, code: "not-found" };
  }
  const email = typeof claims.email === "string" ? claims.email : "";
  if (!email) return { ok: false, code: "unauthorized" };

  let bookingId: string | undefined;
  try {
    bookingId = await asCustomer(env, claims, async (sql) => {
      const rows = await sql<{ id: string }[]>`
        select b.id
          from public.bookings as b
         where b.erased_at is null
           and lower(b.contact_email::text) = lower(${email})
           and (b.id::text = ${key} or b.reference = ${key})
         limit 1
      `;
      return rows[0]?.id;
    });
  } catch (err) {
    return mapCancelSqlError(err);
  }
  if (!bookingId) return { ok: false, code: "not-found" };

  let row: CancelledRow | undefined;
  try {
    row = await asSystem(env, async (sql) => {
      const rows = await sql<CancelledRow[]>`
        select * from public.customer_paid_cancel(${bookingId}::uuid)
      `;
      return rows[0];
    });
  } catch (err) {
    return mapCancelSqlError(err);
  }
  if (!row?.booking_id) return { ok: false, code: "not-found" };
  return finishPaidCancel(env, row, "customer-cancel");
}
