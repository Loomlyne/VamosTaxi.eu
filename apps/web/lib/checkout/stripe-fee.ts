// apps/web/lib/checkout/stripe-fee.ts
//
// Owner decision 2026-10-04 (.planning/decisions/2026-10-04-dashboard-numbers.md, answer 3, "Record it
// from Stripe"): each payment saves the fee Stripe actually took. The dashboard's Expenses and Net
// already sum booking_payments.stripe_fee_rappen.
//
// Where the fee comes from: the balance transaction of the payment's charge. Stripe may attach it after
// the payment succeeded (it then sends charge.updated, which the webhook endpoint is not subscribed to),
// so the fee is not read during settlement. The Worker's hourly cron lists captured payments of the last
// 30 days whose fee is still NULL (checkout_payment_fee_pending) and records each fee Stripe reports in
// CHF (checkout_payment_fee_record, write-once, migration 20261007290000). The same run fills in the
// payments made before the migration (controller decision 2026-10-04: no one reads Stripe by hand).
//
// Rules: a payment never waits on this; a failed Stripe or database call leaves the fee NULL and the
// next hour tries again; a payment Stripe does not know (404, e.g. one made on the retired test account)
// is skipped; a balance transaction in another currency is never converted (the fee stays NULL); nothing
// is guessed. Only transient Stripe errors (network, 5xx, rate limit) count toward stopping a run. Logs
// carry counts only.

import type Stripe from "stripe";
import { asSystem } from "../db/identity";
import { CHARGE_CURRENCY } from "./currency";
import { stripeFromEnv } from "./stripe";

/** What one charge says about its fee. Only `fee` is ever written. */
export type StripeFeeRead =
  | { kind: "fee"; feeRappen: number }
  /** The charge has no balance transaction yet (or is still processing): try again next hour. */
  | { kind: "pending" }
  | { kind: "skip"; reason: "not_captured" | "no_fee" | "not_chf" | "unexpected" };

/** Payments one hourly run reads at most. */
export const STRIPE_FEE_SWEEP_LIMIT = 20;

/** Transient Stripe failures in a row after which a run stops (Stripe is down or refusing calls). */
export const STRIPE_FEE_MAX_FAILURES_IN_A_ROW = 3;

/** The Stripe ids a payment row can store: its PaymentIntent, or its Checkout Session before the write-back. */
const STRIPE_PAYMENT_ID = /^(pi|cs)_[A-Za-z0-9_]{1,250}$/;

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

/**
 * The fee of a charge whose `balance_transaction` is expanded. CHF rappen only, a whole number above 0
 * and below the charge's own settled amount; anything else is not a fee to record.
 */
export function stripeFeeOfCharge(charge: unknown): StripeFeeRead {
  const c = objectOrNull(charge);
  if (!c) return { kind: "skip", reason: "unexpected" };
  if (c.status === "pending") return { kind: "pending" };
  if (c.status !== "succeeded") return { kind: "skip", reason: "not_captured" };
  const raw = c.balance_transaction;
  if (raw === null || raw === undefined) return { kind: "pending" };
  const bt = objectOrNull(raw);
  if (!bt) return { kind: "skip", reason: "unexpected" };
  const currency = typeof bt.currency === "string" ? bt.currency.toLowerCase() : "";
  if (currency !== CHARGE_CURRENCY) return { kind: "skip", reason: "not_chf" };
  const fee = bt.fee;
  if (fee === 0) return { kind: "skip", reason: "no_fee" };
  if (typeof fee !== "number" || !Number.isSafeInteger(fee) || fee < 0) return { kind: "skip", reason: "unexpected" };
  const amount = bt.amount;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || fee >= amount) {
    return { kind: "skip", reason: "unexpected" };
  }
  return { kind: "fee", feeRappen: fee };
}

/**
 * Reads the fee of a payment's charge from Stripe: a PaymentIntent (pi_) directly, a Checkout Session
 * (cs_) through its PaymentIntent. A Stripe error is thrown to the caller (the sweep sorts it with
 * stripeReadErrorKind); an id of any other shape never reaches Stripe.
 */
export async function readStripeFee(stripe: Stripe, stripeId: string): Promise<StripeFeeRead> {
  if (!STRIPE_PAYMENT_ID.test(stripeId)) return { kind: "skip", reason: "unexpected" };
  if (stripeId.startsWith("cs_")) {
    const session = await stripe.checkout.sessions.retrieve(stripeId, {
      expand: ["payment_intent.latest_charge.balance_transaction"],
    });
    const pi = objectOrNull(session.payment_intent);
    return pi ? stripeFeeOfCharge(pi.latest_charge) : { kind: "skip", reason: "unexpected" };
  }
  const pi = await stripe.paymentIntents.retrieve(stripeId, {
    expand: ["latest_charge.balance_transaction"],
  });
  return stripeFeeOfCharge(pi.latest_charge);
}

/**
 * How a failed Stripe read counts. `missing`: Stripe does not know the object (404 / resource_missing),
 * skipped for this run. `transient`: no answer, a 5xx or a rate limit; counts toward stopping the run.
 * `other`: any other refusal (400, 401, 403, ...); counted as failed, never stops the run.
 */
export function stripeReadErrorKind(err: unknown): "missing" | "transient" | "other" {
  const e = objectOrNull(err);
  const status = e && typeof e.statusCode === "number" ? e.statusCode : null;
  const code = e && typeof e.code === "string" ? e.code : "";
  const type = e && typeof e.type === "string" ? e.type : "";
  if (code === "resource_missing" || status === 404) return "missing";
  if (type === "StripeConnectionError" || type === "StripeAPIError" || type === "StripeRateLimitError") {
    return "transient";
  }
  if (status === null || status === 429 || status >= 500) return "transient";
  return "other";
}

export type StripeFeeSweepDeps = {
  /** Stripe ids still without a fee. A database error is thrown (the run then fails as a whole). */
  pending: (limit: number) => Promise<string[]>;
  read: (stripeId: string) => Promise<StripeFeeRead>;
  /** true when the fee was written; false when the row refused it (already set, not captured, out of range). */
  record: (stripeId: string, feeRappen: number) => Promise<boolean>;
};

export type StripeFeeSweepResult = {
  checked: number;
  recorded: number;
  /** No balance transaction yet. */
  waiting: number;
  /** The balance transaction is not in CHF: never converted, the fee stays empty. */
  notChf: number;
  /** Stripe does not know the payment (404), e.g. one made on the retired test account. */
  missing: number;
  /** Anything else that is not a fee to record, or a row that refused the fee. */
  skipped: number;
  failed: number;
  stopped: boolean;
};

/** One hourly run. Never writes anything but a fee Stripe reported in CHF. */
export async function sweepStripeFeesWithDeps(deps: StripeFeeSweepDeps): Promise<StripeFeeSweepResult> {
  const result: StripeFeeSweepResult = {
    checked: 0,
    recorded: 0,
    waiting: 0,
    notChf: 0,
    missing: 0,
    skipped: 0,
    failed: 0,
    stopped: false,
  };
  const ids = await deps.pending(STRIPE_FEE_SWEEP_LIMIT);
  let transientInARow = 0;
  for (const id of ids) {
    if (transientInARow >= STRIPE_FEE_MAX_FAILURES_IN_A_ROW) {
      result.stopped = true;
      break;
    }
    result.checked += 1;
    let read: StripeFeeRead;
    try {
      read = await deps.read(id);
      transientInARow = 0;
    } catch (err) {
      const kind = stripeReadErrorKind(err);
      if (kind === "missing") {
        result.missing += 1;
        transientInARow = 0;
      } else if (kind === "transient") {
        result.failed += 1;
        transientInARow += 1;
      } else {
        result.failed += 1;
        transientInARow = 0;
      }
      continue;
    }
    if (read.kind === "pending") {
      result.waiting += 1;
      continue;
    }
    if (read.kind === "skip") {
      if (read.reason === "not_chf") result.notChf += 1;
      else result.skipped += 1;
      continue;
    }
    try {
      if (await deps.record(id, read.feeRappen)) result.recorded += 1;
      else result.skipped += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

/** The two database calls, as vamos_system through the definer functions of 20261007290000. */
export function stripeFeeDbDeps(env: CloudflareEnv): Pick<StripeFeeSweepDeps, "pending" | "record"> {
  return {
    pending: async (limit) => {
      const rows = await asSystem(env, async (sql) => {
        return sql<{ stripe_payment_intent_id: string | null }[]>`
          select stripe_payment_intent_id from public.checkout_payment_fee_pending(${limit}::int4)
        `;
      });
      return rows.map((row) => String(row.stripe_payment_intent_id ?? "")).filter((id) => STRIPE_PAYMENT_ID.test(id));
    },
    record: async (stripeId, feeRappen) => {
      const rows = await asSystem(env, async (sql) => {
        return sql<{ recorded: boolean | null }[]>`
          select public.checkout_payment_fee_record(${stripeId}::text, ${feeRappen}::int4) as recorded
        `;
      });
      return rows[0]?.recorded === true;
    },
  };
}

/** Production wiring for the hourly cron (worker.ts). Throws only when the run cannot start. */
export async function sweepStripeFees(env: CloudflareEnv): Promise<StripeFeeSweepResult> {
  const stripe = stripeFromEnv(env);
  return sweepStripeFeesWithDeps({
    ...stripeFeeDbDeps(env),
    read: (stripeId) => readStripeFee(stripe, stripeId),
  });
}
