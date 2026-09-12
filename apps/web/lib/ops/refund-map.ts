// apps/web/lib/ops/refund-map.ts
//
// 08-05: SQLSTATE → staff refund/cancel envelope. No identity, no Hyperdrive.

import { OPS_SQLSTATE } from "./sqlstate";

export type RefundFail = { ok: false; code: string };

export type RefundOk = {
  ok: true;
  bookingId: string;
  refundId: number;
  paymentId: number;
  contactEmail: string;
  payerEmail: string;
  contactName: string;
  locale: string;
  reference: string;
};

export type RefundResult = RefundOk | RefundFail;

const NAMED = new Set([
  "not-found",
  "not-paid",
  "already-refunded",
  "stripe-refund-id-required",
  "frozen",
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

export function mapRefundSqlError(err: unknown): RefundFail {
  const message = messageOf(err);
  for (const name of NAMED) {
    if (message === name || message.startsWith(`${name}\n`) || message.startsWith(`${name} `)) {
      return { ok: false, code: name };
    }
  }
  if (codeOf(err) === OPS_SQLSTATE.noData) return { ok: false, code: "not-found" };
  return { ok: false, code: "unknown" };
}

export function stripeFeeRappen(refund: {
  balance_transaction?: unknown;
}): number | null {
  const bt = refund.balance_transaction;
  if (!bt || typeof bt === "string") return null;
  if (typeof bt !== "object") return null;
  const fee = (bt as { fee?: unknown }).fee;
  if (typeof fee === "number" && Number.isFinite(fee) && fee > 0) return fee;
  return null;
}

/** D-12: remaining = captured minus refunded. already-refunded only when remaining is 0. */
export function opsRefundAmount(input: {
  capturedRappen: number;
  refundedRappen: number;
  percent?: number;
  rappen?: number;
}): { remaining: number; amount: number } {
  const captured = Number.isFinite(input.capturedRappen) ? Math.trunc(input.capturedRappen) : 0;
  const refunded = Number.isFinite(input.refundedRappen) ? Math.trunc(input.refundedRappen) : 0;
  const remaining = Math.max(0, captured - Math.max(0, refunded));
  if (remaining <= 0) return { remaining: 0, amount: 0 };
  let amount = remaining;
  if (typeof input.rappen === "number" && Number.isFinite(input.rappen)) {
    amount = Math.trunc(input.rappen);
  } else if (typeof input.percent === "number" && Number.isFinite(input.percent)) {
    amount = Math.round((captured * input.percent) / 100);
  }
  if (amount > remaining) amount = remaining;
  if (amount < 0) amount = 0;
  return { remaining, amount };
}
