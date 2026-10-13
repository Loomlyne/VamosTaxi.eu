// apps/web/lib/ops/refund-map.ts
//
// 08-05: SQLSTATE → staff refund/cancel envelope. No identity, no Hyperdrive.

import { OPS_SQLSTATE } from "./sqlstate";

export type RefundFail = { ok: false; code: string };

const NAMED: readonly string[] = Object.freeze([
  "not-found",
  "not-paid",
  "already-refunded",
  "stripe-refund-id-required",
  "frozen",
  // 26.1-17 (20260928150000_refund_review_tiers.sql)
  "refund-exceeds-remaining",
  "invalid-amount",
  "invalid-reason",
  "invalid-decision",
  "not-pending",
  "not-post-trip",
  "not-open",
  // 20-10 refunds by hand (the database refuses these too)
  "nothing-to-retry",
  "full-refund-only",
]);

function codeOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) return undefined;
  const code = (err as { code: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function messageOf(err: unknown): string {
  if (typeof err !== "object" || err === null) return "";
  if (!("message" in err)) return "";
  const message = (err as { message: unknown }).message;
  return typeof message === "string" ? message : "";
}

export function sqlErrorCode(err: unknown): string | undefined {
  return codeOf(err);
}

/**
 * 261004 lock order (migration 20261007280000): a payment settled for the same booking in the same
 * instant. Nine functions raise `payment-changed` with SQLSTATE 40001 and write nothing, so pressing
 * the same button again is safe. One name for every dashboard answer (Refund, Accept, class and trip
 * change); the three maps (refund, edit-request, booking-change) share this test.
 */
export const PAYMENT_CHANGED = "payment-changed";
const SERIALIZATION_FAILURE = "40001";

export function isPaymentChanged(err: unknown): boolean {
  const message = messageOf(err);
  if (message === PAYMENT_CHANGED || message.startsWith(`${PAYMENT_CHANGED}\n`) || message.startsWith(`${PAYMENT_CHANGED} `)) {
    return true;
  }
  return codeOf(err) === SERIALIZATION_FAILURE;
}

export function mapRefundSqlError(err: unknown): RefundFail {
  const message = messageOf(err);
  for (const name of NAMED) {
    if (message === name || message.startsWith(`${name}\n`) || message.startsWith(`${name} `)) {
      return { ok: false, code: name };
    }
  }
  if (isPaymentChanged(err)) return { ok: false, code: PAYMENT_CHANGED };
  if (codeOf(err) === OPS_SQLSTATE.noData) return { ok: false, code: "not-found" };
  // ops_refund_decide raises 42501 unless app.is_admin() (T-26.1-53).
  if (codeOf(err) === OPS_SQLSTATE.privilege) return { ok: false, code: "not-admin" };
  return { ok: false, code: "unknown" };
}

/**
 * HTTP status of a refund answer (POST ../refund). A conflict the owner answers by looking again
 * (409): not-paid, already-refunded, … and `payment-changed` (a payment settled in the same instant;
 * nothing was written, press Refund again). Stripe trouble is 502; anything unnamed is 400.
 */
export function refundFailStatus(code: string): number {
  if (code === "not-found") return 404;
  if (code === "csrf" || code === "not-admin") return 403;
  if (
    code === "frozen" ||
    code === "not-paid" ||
    code === "already-refunded" ||
    code === "not-post-trip" ||
    code === "refund-exceeds-remaining" ||
    code === "nothing-to-retry" ||
    code === "full-refund-only" ||
    code === PAYMENT_CHANGED
  ) {
    return 409;
  }
  if (code === "stripe-failed") return 502;
  return 400;
}
