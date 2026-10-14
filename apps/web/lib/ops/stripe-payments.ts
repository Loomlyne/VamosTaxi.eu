// apps/web/lib/ops/stripe-payments.ts
//
// Phase 31 (D-01, D-06, D-14): the owner refunds in Stripe; the dashboard only points at the
// payment. This reads a booking's succeeded Stripe payments (PaymentIntent ids only) as staff and
// pairs each with its Stripe Dashboard link, newest first. Admin only: the route wraps it in
// withAdmin. Nothing is written and nothing is sent to Stripe.
//
// The mode comes from the Worker's secret key, the account from the plain var STRIPE_ACCOUNT_ID;
// no request value reaches the link (stripePaymentUrl checks both ids). A payment whose id gives
// no link is left out. Fully refunded payments stay in the list: the dashboard page decides what
// it shows (UI-SPEC "Which payments are listed").

export const dynamic = "force-dynamic";

import { stripePaymentUrl } from "@/lib/checkout/stripe-dashboard-url";
import { stripeSecretKeyMode, type StripeMode } from "@/lib/checkout/stripe-mode";
import { asStaff, type VamosClaims } from "@/lib/db/identity";
import { resolveStaffBookingId } from "@/lib/ops/resolve-booking-id";

/** One payment as the dashboard sees it. No ids, names or e-mails. */
export type StripePaymentRow = {
  kind: "trip" | "extra";
  chargedRappen: number;
  /** What was charged minus refunds that were not reversed; never below 0. */
  leftRappen: number;
  capturedAt: string | null;
  url: string;
};

/** A row as the payments query returns it. */
export type StripePaymentSqlRow = {
  id: number | string;
  stripe_payment_intent_id: string;
  charged_rappen: number | string | null;
  captured_at: Date | string | null;
  is_extra: boolean;
  refunded: number | string | null;
};

export type StripePaymentsResult =
  | { ok: true; rows: StripePaymentRow[] }
  | { ok: false; code: "not-found" | "stripe-mode-unknown" };

const num = (v: number | string | null | undefined): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

function isoOrNull(v: Date | string | null): string | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Pure: query rows to dashboard rows, in the query's order; a row with no link is dropped. */
export function mapStripePaymentRows(
  rows: readonly StripePaymentSqlRow[],
  mode: StripeMode | null,
  accountId: string | null | undefined,
): StripePaymentRow[] {
  const out: StripePaymentRow[] = [];
  for (const p of rows) {
    const url = stripePaymentUrl({ mode, accountId, paymentIntentId: p.stripe_payment_intent_id });
    if (!url) continue;
    const charged = num(p.charged_rappen);
    const refunded = num(p.refunded);
    out.push({
      kind: p.is_extra ? "extra" : "trip",
      chargedRappen: charged,
      leftRappen: Math.max(0, charged - refunded),
      capturedAt: isoOrNull(p.captured_at),
      url,
    });
  }
  return out;
}

/**
 * GET …/stripe-payments: the booking's succeeded PaymentIntent payments with their Stripe links.
 * An unknown, erased or invisible booking key is not-found; a Worker key of no known mode is
 * stripe-mode-unknown (never a guessed mode). SQL refusals are not caught here.
 */
export async function loadStripePayments(
  env: CloudflareEnv,
  claims: VamosClaims,
  key: string,
): Promise<StripePaymentsResult> {
  const bookingKey = key.trim();
  if (!bookingKey) return { ok: false, code: "not-found" };
  const bookingId = await resolveStaffBookingId(env, claims, bookingKey);
  if (!bookingId) return { ok: false, code: "not-found" };
  const mode = stripeSecretKeyMode(env.STRIPE_SECRET_KEY);
  if (!mode) return { ok: false, code: "stripe-mode-unknown" };
  // Staff read: the system role has no SELECT on these tables. `pi\\_%` reaches Postgres as
  // `pi\_%`, a literal underscore (the template literal would otherwise drop the backslash).
  const rows = await asStaff(env, claims, async (sql) => {
    return sql<StripePaymentSqlRow[]>`
      select p.id,
             p.stripe_payment_intent_id,
             p.charged_rappen,
             p.captured_at,
             exists (
               select 1 from public.booking_edit_requests as e
                where e.extra_snapshot_id = p.snapshot_id
             ) as is_extra,
             coalesce((
               select sum(r.refund_rappen) from public.booking_refunds as r where r.payment_id = p.id
                  and not exists (select 1 from public.booking_refund_reversals as x where x.refund_id = r.id)
             ), 0) as refunded
        from public.booking_payments as p
       where p.booking_id = ${bookingId}::uuid
         and p.status = 'succeeded'
         and p.stripe_payment_intent_id like 'pi\\_%'
       order by p.captured_at desc nulls last, p.id desc
    `;
  });
  return { ok: true, rows: mapStripePaymentRows(rows, mode, env.STRIPE_ACCOUNT_ID) };
}
