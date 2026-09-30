// apps/web/lib/ops/refund.ts
//
// 20-10 refunds by hand. The admin's Refund click: ops_refund_plan writes one intent per payment
// (nothing is sent yet), then one Stripe refund per intent with the key `refund-intent:<id>`, then
// ops_refund_intent_sent / ops_refund_intent_failed. If the database write fails after Stripe
// accepted, the booking stays `processing` (never `failed`) and Retry finds the refund at Stripe.
// A press while intents are open only resumes them. Never staff INSERT into refunds. Never mark
// bookings.status refunded.
// 26.1-17 D-24/D-25: the admin refunds a percentage (or, 20-10, an exact amount), accepts a
// post-trip request (reason post_trip), or declines/rejects (decideRefund -> ops_refund_decide).
// 20-10 owner rule: a booking cancelled more than 24 h ahead (pending_ops with an owed amount)
// gets the full amount only: no lower percent, no exact amount below what is left, no decline.
// The live-key refusal below stays until the sandbox proof (20-10 spec D.3).

import { asStaff, asSystem, type VamosClaims } from "../db/identity";
import {
  createRefund,
  findRefundByIntent,
  resolvePaymentIntentId,
  retrieveRefund,
  stripeFromEnv,
} from "../checkout/stripe";
import { payoutFactsFromRefund } from "../lifecycle/paid-cancel";
import {
  mapRefundSqlError,
  stripeFeeRappen,
  type RefundDecision,
  type RefundFail,
  type RefundPart,
  type RefundResult,
} from "./refund-map";
import { resolveStaffBookingId } from "./resolve-booking-id";

export const dynamic = "force-dynamic";

export type { RefundFail, RefundOk, RefundPart, RefundPartial, RefundResult } from "./refund-map";
export { opsRefundAmount } from "./refund-map";

export type RefundAmountInput = {
  /** One captured payment; absent = every captured payment. */
  paymentId?: number;
  percent?: number;
  /** Exact amount, one payment only. Never with percent. */
  amountRappen?: number;
  /** D-25 accept: everything left on every payment, recorded with reason post_trip. */
  postTrip?: boolean;
  /** Resume the open intents only. */
  retry?: boolean;
};

/** Booking statuses where the trip happened (D-25 post-trip accept / reject). */
const POST_TRIP_STATUSES: readonly string[] = Object.freeze([
  "completed",
  "partially_completed",
  "no_show",
]);

type PayRow = {
  id: number | string;
  stripe_payment_intent_id: string;
  charged_rappen: number | string;
  captured_at: string | Date | null;
  is_extra: boolean;
  refunded: number | string | null;
  open_amount: number | string | null;
  open_state: string | null;
};

type BookingRow = {
  status: string;
  refund_status: string;
  refund_owed_rappen: number | string | null;
  refunded_rappen: number | string | null;
};

export type RefundPayment = {
  id: number;
  kind: "trip" | "extra";
  capturedAt: string | null;
  chargedRappen: number;
  refundedRappen: number;
  leftRappen: number;
  open: { amountRappen: number; state: string } | null;
};

type RefundState = {
  status: string;
  refundStatus: string;
  owedRappen: number;
  refundedRappen: number;
  dueRappen: number;
  fullTier: boolean;
  payments: RefundPayment[];
};

const n = (v: number | string | null | undefined): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** Reads as staff: the system role has no SELECT on these tables. */
async function readRefundState(env: CloudflareEnv, claims: VamosClaims, bookingId: string): Promise<RefundState | null> {
  return asStaff(env, claims, async (sql): Promise<RefundState | null> => {
    const bookings = await sql<BookingRow[]>`
      select b.status::text as status,
             b.refund_status::text as refund_status,
             b.refund_owed_rappen,
             b.refunded_rappen
        from public.bookings as b
       where b.id = ${bookingId}::uuid
       limit 1
    `;
    const b = bookings[0];
    if (!b) return null;
    const pays = await sql<PayRow[]>`
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
             ), 0) as refunded,
             i.amount_rappen as open_amount,
             i.state::text as open_state
        from public.booking_payments as p
        left join public.booking_refund_intents as i
          on i.payment_id = p.id and i.state in ('intended', 'failed')
       where p.booking_id = ${bookingId}::uuid
         and p.captured_at is not null
       order by p.id
    `;
    const payments: RefundPayment[] = pays.map((p) => {
      const charged = n(p.charged_rappen);
      const refunded = n(p.refunded);
      return {
        id: n(p.id),
        kind: p.is_extra ? "extra" : "trip",
        capturedAt: p.captured_at ? new Date(p.captured_at).toISOString() : null,
        chargedRappen: charged,
        refundedRappen: refunded,
        leftRappen: Math.max(0, charged - refunded),
        open: p.open_state ? { amountRappen: n(p.open_amount), state: String(p.open_state) } : null,
      };
    });
    const owed = n(b.refund_owed_rappen);
    const refunded = n(b.refunded_rappen);
    return {
      status: String(b.status),
      refundStatus: String(b.refund_status),
      owedRappen: owed,
      refundedRappen: refunded,
      dueRappen: Math.max(0, owed - refunded),
      fullTier: String(b.refund_status) === "pending_ops" && owed > 0,
      payments,
    };
  });
}

export type RefundPicker = {
  ok: true;
  payments: RefundPayment[];
  owedRappen: number;
  refundedRappen: number;
  dueRappen: number;
  refundStatus: string;
  /** pending_ops with an owed amount: full amount only, no decline. */
  fullTier: boolean;
};

/** GET …/refund: what the picker and a reloaded page need. Admin only (the route wraps it). */
export async function loadRefundPicker(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
): Promise<RefundPicker | RefundFail> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };
  const bookingId = await resolveStaffBookingId(env, claims, key);
  if (!bookingId) return { ok: false, code: "not-found" };
  const state = await readRefundState(env, claims, bookingId);
  if (!state) return { ok: false, code: "not-found" };
  return {
    ok: true,
    payments: state.payments,
    owedRappen: state.owedRappen,
    refundedRappen: state.refundedRappen,
    dueRappen: state.dueRappen,
    refundStatus: state.refundStatus,
    fullTier: state.fullTier,
  };
}

type PlanRow = {
  intent_id: number | string;
  payment_id: number | string;
  stripe_payment_intent_id: string;
  amount_rappen: number | string;
  idempotency_key: string;
  state: string;
  attempts: number | string;
  resumed: boolean;
};

type SentRow = {
  booking_id: string;
  refund_id: number | string;
  payment_id: number | string;
  refund_rappen: number | string;
  contact_email: string | null;
  payer_email: string | null;
  contact_name: string | null;
  locale: string | null;
  reference: string;
  open_intents: number | string;
  refunded_rappen: number | string;
  due_rappen: number | string;
  refund_status: string;
};

/**
 * Stored in booking_refund_intents.last_error. The prefix tells Retry what happened:
 * "stripe:" = Stripe answered and refused (an API error with a response, or a refund it marked failed /
 * canceled); "transport:" = no answer (timeout, network, our own error). Stripe replays a stored refusal
 * for 24 h under the same idempotency key, so only after "stripe:" does a Retry use a new key.
 */
function errorText(err: unknown): string {
  let message = "stripe-error";
  if (typeof err === "object" && err !== null && "message" in err) {
    const m = (err as { message: unknown }).message;
    if (typeof m === "string") message = m;
  }
  const answered =
    (typeof err === "object" &&
      err !== null &&
      typeof (err as { statusCode?: unknown }).statusCode === "number") ||
    message === "stripe-refund-not-created";
  return `${answered ? "stripe" : "transport"}: ${message}`.slice(0, 500);
}

/** What ops_refund_intent_failed kept for this intent, or null. A read failure means "unknown" (same key). */
async function lastErrorOf(env: CloudflareEnv, claims: VamosClaims, intentId: number): Promise<string | null> {
  try {
    return await asStaff(env, claims, async (sql) => {
      const rows = await sql<{ last_error: string | null }[]>`
        select i.last_error from public.booking_refund_intents as i where i.id = ${intentId}::int8 limit 1
      `;
      return rows[0]?.last_error ?? null;
    });
  } catch {
    return null;
  }
}

function stripeCodeOf(err: unknown): string {
  if (typeof err === "object" && err !== null && "code" in err) {
    const c = (err as { code: unknown }).code;
    if (typeof c === "string") return c;
  }
  return "";
}

/**
 * Validates the click against what the booking is now. Runs only when no intent is open (an open
 * intent is resumed as it is). Returns a refusal, or the plan arguments.
 */
function checkRequest(
  state: RefundState,
  requested: RefundAmountInput,
): RefundFail | { paymentId: number | null; percent: number | null; amountRappen: number | null; reason: string | null } {
  const postTrip = requested.postTrip === true;
  if (postTrip && !POST_TRIP_STATUSES.includes(state.status)) return { ok: false, code: "not-post-trip" };
  if (state.payments.length === 0) return { ok: false, code: "not-paid" };

  let chosen: RefundPayment | null = null;
  if (requested.paymentId !== undefined) {
    chosen = state.payments.find((p) => p.id === requested.paymentId) ?? null;
    if (!chosen) return { ok: false, code: "not-paid" };
  }
  if (requested.amountRappen !== undefined) {
    // An exact amount belongs to one payment: the chosen one, or the only one.
    if (!chosen) {
      if (state.payments.length !== 1) return { ok: false, code: "invalid-body" };
      chosen = state.payments[0] ?? null;
    }
  }
  const scope = chosen ? [chosen] : state.payments;
  if (scope.every((p) => p.leftRappen <= 0)) return { ok: false, code: "already-refunded" };

  const percent = postTrip ? null : (requested.percent ?? null);
  const amount = postTrip ? null : (requested.amountRappen ?? null);

  if (percent !== null && percent <= 0) return { ok: false, code: "invalid-amount" };
  if (amount !== null && chosen) {
    if (amount > chosen.leftRappen) return { ok: false, code: "refund-exceeds-remaining" };
  }
  if (state.fullTier) {
    if (percent !== null && percent < 100) return { ok: false, code: "full-refund-only" };
    if (amount !== null && chosen && amount < chosen.leftRappen) return { ok: false, code: "full-refund-only" };
  }
  return {
    paymentId: chosen ? chosen.id : null,
    percent,
    amountRappen: amount,
    reason: postTrip ? "post_trip" : null,
  };
}

export async function refundBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
  requested: RefundAmountInput = {},
): Promise<RefundResult> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };

  const secret = env.STRIPE_SECRET_KEY ?? "";
  if (secret.startsWith("sk_live_")) {
    return { ok: false, code: "stripe-test-only" };
  }

  const bookingId = await resolveStaffBookingId(env, claims, key);
  if (!bookingId) return { ok: false, code: "not-found" };

  const state = await readRefundState(env, claims, bookingId);
  if (!state) return { ok: false, code: "not-found" };

  const anyOpen = state.payments.some((p) => p.open !== null);
  const retry = requested.retry === true;
  if (retry && !anyOpen) return { ok: false, code: "nothing-to-retry" };

  // A press while intents are open resumes them and creates nothing (the database does the same).
  let planArgs: { paymentId: number | null; percent: number | null; amountRappen: number | null; reason: string | null } = {
    paymentId: null,
    percent: null,
    amountRappen: null,
    reason: null,
  };
  if (!anyOpen) {
    const checked = checkRequest(state, requested);
    if ("ok" in checked) return checked;
    planArgs = checked;
  }

  let plan: PlanRow[];
  try {
    plan = await asSystem(env, async (sql) => {
      return sql<PlanRow[]>`
        select * from public.ops_refund_plan(
          ${bookingId}::uuid,
          ${claims.sub}::uuid,
          ${planArgs.paymentId}::int8,
          ${planArgs.percent}::numeric,
          ${planArgs.reason}::text,
          ${retry}::bool,
          ${planArgs.amountRappen}::int
        )
      `;
    });
  } catch (err) {
    return mapRefundSqlError(err);
  }
  if (plan.length === 0) return { ok: false, code: "already-refunded" };
  plan = [...plan].sort((a, b) => n(a.payment_id) - n(b.payment_id));

  const parts: RefundPart[] = [];
  let lastSent: SentRow | null = null;

  for (const intent of plan) {
    const intentId = n(intent.intent_id);
    const paymentId = n(intent.payment_id);
    const amountRappen = n(intent.amount_rappen);
    const part = (state: RefundPart["state"]) => parts.push({ paymentId, amountRappen, state });

    let refund: Awaited<ReturnType<typeof createRefund>> | null = null;
    let payout = { payoutCountry: "CH", availableOn: null as string | null };
    try {
      const stripe = stripeFromEnv(env);
      const paymentIntentId = await resolvePaymentIntentId(stripe, String(intent.stripe_payment_intent_id));
      if (!paymentIntentId) throw new Error("no-payment-intent");
      // Stripe keeps the answer to an idempotency key for 24 h, errors included. After a refusal the
      // retry is a new request (key:<attempts>); after a timeout it stays the same one.
      const attempts = n(intent.attempts);
      const idempotencyKey =
        attempts > 0 && (await lastErrorOf(env, claims, intentId))?.startsWith("stripe:")
          ? `${String(intent.idempotency_key)}:${attempts}`
          : String(intent.idempotency_key);
      // A retry, or a resumed press, may have a refund at Stripe already (its 24 h key window may be over).
      const existing =
        intent.resumed === true || n(intent.attempts) > 0
          ? await findRefundByIntent(stripe, paymentIntentId, intentId)
          : null;
      refund =
        existing ??
        (await createRefund(stripe, {
          paymentIntentId,
          amountRappen,
          idempotencyKey,
          bookingId,
          paymentId,
          reason: planArgs.reason === "post_trip" ? "post_trip" : "ops_refund",
          metadata: { vamos_intent: String(intentId) },
        }));
      if (!refund?.id || refund.status === "failed" || refund.status === "canceled") {
        throw new Error("stripe-refund-not-created");
      }
      let expanded = refund;
      try {
        expanded = await retrieveRefund(stripe, refund.id);
      } catch {
        expanded = refund;
      }
      payout = payoutFactsFromRefund(expanded);
    } catch (err) {
      // Stripe refused (or could not be reached): the intent is marked failed, the next payment still runs.
      const voided = stripeCodeOf(err) === "charge_already_refunded";
      try {
        await asSystem(env, async (sql) => {
          await sql`
            select public.ops_refund_intent_failed(${intentId}::int8, ${errorText(err)}::text, ${voided}::bool)
          `;
        });
      } catch {
        // The intent stays as it is; Retry picks it up.
      }
      part("failed");
      continue;
    }

    // Stripe accepted. From here a database failure must never mark the intent failed.
    const accepted = refund;
    const fee = stripeFeeRappen(accepted);
    try {
      const sent = await asSystem(env, async (sql) => {
        const rows = await sql<SentRow[]>`
          select * from public.ops_refund_intent_sent(
            ${intentId}::int8,
            ${accepted.id}::text,
            ${fee},
            ${payout.payoutCountry}::text,
            ${payout.availableOn}::timestamptz
          )
        `;
        return rows[0] ?? null;
      });
      if (!sent) {
        part("unrecorded");
        continue;
      }
      lastSent = sent;
      part("sent");
    } catch {
      part("unrecorded");
    }
  }

  const allSent = parts.length > 0 && parts.every((p) => p.state === "sent");
  if (allSent && lastSent) {
    const row: SentRow = lastSent;
    return {
      ok: true,
      bookingId: String(row.booking_id),
      refundId: n(row.refund_id),
      paymentId: n(row.payment_id),
      contactEmail: String(row.contact_email ?? ""),
      payerEmail: String(row.payer_email ?? ""),
      contactName: String(row.contact_name ?? ""),
      locale: String(row.locale ?? "en"),
      reference: String(row.reference),
      refundStatus: String(row.refund_status),
      refundedRappen: n(row.refunded_rappen),
      dueRappen: n(row.due_rappen),
      parts,
    };
  }

  // Not complete: read the booking again so the answer carries what went and what is still due.
  let refundedRappen = lastSent ? n((lastSent as SentRow).refunded_rappen) : state.refundedRappen;
  let dueRappen = lastSent ? n((lastSent as SentRow).due_rappen) : state.dueRappen;
  try {
    const after = await readRefundState(env, claims, bookingId);
    if (after) {
      refundedRappen = after.refundedRappen;
      dueRappen = after.dueRappen;
    }
  } catch {
    // keep the numbers we have
  }
  const anySent = parts.some((p) => p.state === "sent" || p.state === "unrecorded");
  return {
    ok: false,
    code: anySent ? "refund-partial" : "stripe-failed",
    refundedRappen,
    dueRappen,
    parts,
  };
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
  if (decision === "decline") {
    // 20-10 owner rule: a booking cancelled more than 24 h ahead is refunded in full, never declined.
    const state = await readRefundState(env, claims, bookingId);
    if (state?.fullTier) return { ok: false, code: "full-refund-only" };
  }
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
