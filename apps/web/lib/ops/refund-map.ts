// apps/web/lib/ops/refund-map.ts
//
// 08-05: SQLSTATE → staff refund/cancel envelope. No identity, no Hyperdrive.

import { OPS_SQLSTATE } from "./sqlstate";

export type RefundFail = { ok: false; code: string };

/** 20-10: one payment's part of a refund click. `unrecorded` = Stripe accepted, the database write failed. */
export type RefundPart = {
  paymentId: number;
  amountRappen: number;
  state: "sent" | "failed" | "unrecorded";
};

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
  /** 20-10: totals after the batch. `refundStatus` is `pending_ops` while part of a full-tier refund is still due. */
  refundStatus: string;
  refundedRappen: number;
  dueRappen: number;
  parts: RefundPart[];
};

/** 20-10: some part did not go through. HTTP 502; no "Refund issued" mail until the batch is complete. */
export type RefundPartial = {
  ok: false;
  code: "refund-partial" | "stripe-failed";
  refundedRappen: number;
  dueRappen: number;
  parts: RefundPart[];
};

export type RefundResult = RefundOk | RefundFail | RefundPartial;

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

export function mapRefundSqlError(err: unknown): RefundFail {
  const message = messageOf(err);
  for (const name of NAMED) {
    if (message === name || message.startsWith(`${name}\n`) || message.startsWith(`${name} `)) {
      return { ok: false, code: name };
    }
  }
  if (codeOf(err) === OPS_SQLSTATE.noData) return { ok: false, code: "not-found" };
  // ops_refund_decide raises 42501 unless app.is_admin() (T-26.1-53).
  if (codeOf(err) === OPS_SQLSTATE.privilege) return { ok: false, code: "not-admin" };
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

export type RefundRequest = {
  /** One captured payment; absent = every captured payment. */
  paymentId?: number;
  /** Percent of what was paid on each chosen payment, capped at what is left. Never with amountRappen. */
  percent?: number;
  /** Exact amount, only with one chosen payment, capped at what is left. Never with percent. */
  amountRappen?: number;
  postTrip?: boolean;
  /** Resume the open (intended / failed) parts only. Alone. */
  retry?: boolean;
};

export type ParsedRefundBody =
  | { ok: true; value: RefundRequest }
  | { ok: false; code: "invalid-percent" | "invalid-body" | "invalid-amount" };

/**
 * 26.1-17 D-24/D-25 + 20-10 (T-26.1-54): the admin refund body. `{}` = every payment, all that is
 * left; `{ percent }` = an integer 0-100 of what was paid; `{ amountRappen }` (legacy `rappen`) =
 * an exact amount; never both. `{ paymentId }` limits it to one payment (an exact amount needs
 * one payment: the route checks that against the booking). `{ postTrip: true }` = the post-trip
 * accept and cannot be combined with an amount or a payment. `{ retry: true }` stands alone.
 * The amount itself is always computed server-side.
 */
export function parseRefundBody(body: unknown): ParsedRefundBody {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: true, value: {} };
  const record = body as Record<string, unknown>;
  const out: RefundRequest = {};
  if ("percent" in record && record.percent !== undefined) {
    const p = record.percent;
    if (typeof p !== "number" || !Number.isInteger(p) || p < 0 || p > 100) {
      return { ok: false, code: "invalid-percent" };
    }
    out.percent = p;
  }
  const rawAmount = record.amountRappen !== undefined ? record.amountRappen : record.rappen;
  if (record.amountRappen !== undefined && record.rappen !== undefined) {
    return { ok: false, code: "invalid-body" };
  }
  if (rawAmount !== undefined) {
    if (typeof rawAmount !== "number" || !Number.isFinite(rawAmount)) {
      return { ok: false, code: "invalid-amount" };
    }
    const amount = Math.trunc(rawAmount);
    if (amount <= 0) return { ok: false, code: "invalid-amount" };
    out.amountRappen = amount;
  }
  if (out.percent !== undefined && out.amountRappen !== undefined) {
    return { ok: false, code: "invalid-body" };
  }
  if ("paymentId" in record && record.paymentId !== undefined) {
    const id = record.paymentId;
    if (typeof id !== "number" || !Number.isInteger(id) || id <= 0) {
      return { ok: false, code: "invalid-body" };
    }
    out.paymentId = id;
  }
  if ("postTrip" in record && record.postTrip !== undefined) {
    if (typeof record.postTrip !== "boolean") return { ok: false, code: "invalid-body" };
    if (record.postTrip) {
      if (out.percent !== undefined || out.amountRappen !== undefined || out.paymentId !== undefined) {
        return { ok: false, code: "invalid-body" };
      }
      out.postTrip = true;
    }
  }
  if ("retry" in record && record.retry !== undefined) {
    if (typeof record.retry !== "boolean") return { ok: false, code: "invalid-body" };
    if (record.retry) {
      if (Object.keys(out).length > 0) return { ok: false, code: "invalid-body" };
      out.retry = true;
    }
  }
  return { ok: true, value: out };
}

export type RefundDecision = "decline" | "reject";

/** 26.1-17 D-24 decline / D-25 reject. Anything else is null (the route answers 400). */
export function parseRefundDecision(body: unknown): RefundDecision | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const decision = (body as Record<string, unknown>).decision;
  if (decision === "decline" || decision === "reject") return decision;
  return null;
}
