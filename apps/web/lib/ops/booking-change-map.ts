// apps/web/lib/ops/booking-change-map.ts
//
// 26.2 P1: pure rules and mappings of a change on a PAID trip (the admin's class change). No
// identity, no Hyperdrive. The database (booking_staff_change, migration 20261007140000) checks
// the same rules again inside the write.

import { sqlErrorCode } from "./refund-map";
import { OPS_SQLSTATE } from "./sqlstate";

/** Every named refusal a change can answer. The dashboard has a sentence for each. */
export const CHANGE_FAIL_CODES = [
  "not-found",
  "invalid-body",
  "unpaid",
  "not-editable",
  "too-late",
  "refund-open",
  "customer-request-waiting",
  "unknown-class",
  "same-class",
  "class-too-small",
  "class-not-sold",
  "trip-data",
  "pricing-not-live",
  "price-book-changed",
  "price-changed",
  "paid-changed",
  "must-fix",
  "stripe-test-only",
  "stripe-failed",
  "unknown",
] as const;

export type ChangeFailCode = (typeof CHANGE_FAIL_CODES)[number];
export type ChangeFail = { ok: false; code: ChangeFailCode };

/** Booking states a class can still change in (paid, not yet driven, not cancelled). */
const EDITABLE_STATUSES: readonly string[] = Object.freeze(["paid", "confirmed", "assigned"]);

export type ChangeRuleFacts = {
  /** A captured payment exists. */
  paid: boolean;
  /** bookings.status */
  status: string;
  /** bookings.refund_status */
  refundStatus: string;
  /** Earliest leg pickup instant (ms), null when unknown. */
  pickupAtMs: number | null;
  /** A customer's own change request waits on the booking. */
  customerRequestWaiting: boolean;
};

/**
 * Plan rules (signed 2026-09-30): no change on an unpaid booking (cancel and make a new trip);
 * only until the pickup time (D8; the Settings deadline binds customers only); not while a refund
 * is being sent; not while a customer's own request waits (it would be replaced without a word).
 */
export function changeRefusal(facts: ChangeRuleFacts, nowMs: number): ChangeFailCode | null {
  if (!facts.paid) return "unpaid";
  if (!EDITABLE_STATUSES.includes(facts.status)) return "not-editable";
  if (facts.pickupAtMs == null || !Number.isFinite(facts.pickupAtMs) || facts.pickupAtMs <= nowMs) return "too-late";
  if (facts.refundStatus === "processing" || facts.refundStatus === "failed") return "refund-open";
  if (facts.customerRequestWaiting) return "customer-request-waiting";
  return null;
}

const SQL_REFUSALS: readonly ChangeFailCode[] = Object.freeze([
  "not-found",
  "unpaid",
  "not-editable",
  "too-late",
  "refund-open",
  "customer-request-waiting",
  "unknown-class",
  "same-class",
  "class-too-small",
  "price-book-changed",
  "paid-changed",
]);

function messageOf(err: unknown): string {
  if (typeof err !== "object" || err === null || !("message" in err)) return "";
  const message = (err as { message: unknown }).message;
  return typeof message === "string" ? message : "";
}

/** A refusal raised by booking_staff_change (mapped AROUND asSystem: begin() rethrows). */
export function mapChangeSqlError(err: unknown): ChangeFail {
  const message = messageOf(err);
  for (const name of SQL_REFUSALS) {
    if (message === name || message.startsWith(`${name}\n`) || message.startsWith(`${name} `)) {
      return { ok: false, code: name };
    }
  }
  if (message === "capacity") return { ok: false, code: "must-fix" };
  const code = sqlErrorCode(err);
  if (code === OPS_SQLSTATE.noData) return { ok: false, code: "not-found" };
  if (code === OPS_SQLSTATE.exclusion) return { ok: false, code: "must-fix" };
  return { ok: false, code: "unknown" };
}

export function changeFailStatus(code: ChangeFailCode): number {
  if (code === "not-found") return 404;
  if (code === "stripe-failed" || code === "stripe-test-only") return 502;
  if (code === "invalid-body" || code === "unknown") return 400;
  return 409;
}

export type ChangeBody = {
  /** Target class slug, as the preview listed it. */
  klass: string | null;
  /** The new total the admin was shown (confirm only). */
  expectTotalRappen: number | null;
  /** The "paid so far" the admin was shown (confirm only). */
  expectPaidRappen: number | null;
};

const BODY_KEYS = new Set(["klass", "expectTotalRappen", "expectPaidRappen"]);

function rappenOrNull(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  return undefined;
}

/**
 * The browser sends a class slug and the two figures it showed, nothing else: no amount is ever
 * taken from it, and no changed field (place, time, name) is copied from it at confirm.
 */
export function parseChangeBody(raw: unknown): { ok: true; value: ChangeBody } | { ok: false; code: "invalid-body" } {
  if (raw === undefined || raw === null) return { ok: true, value: { klass: null, expectTotalRappen: null, expectPaidRappen: null } };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, code: "invalid-body" };
  const rec = raw as Record<string, unknown>;
  for (const key of Object.keys(rec)) if (!BODY_KEYS.has(key)) return { ok: false, code: "invalid-body" };
  let klass: string | null = null;
  if (rec.klass !== undefined && rec.klass !== null) {
    if (typeof rec.klass !== "string") return { ok: false, code: "invalid-body" };
    const slug = rec.klass.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return { ok: false, code: "invalid-body" };
    klass = slug;
  }
  const total = rappenOrNull(rec.expectTotalRappen);
  const paid = rappenOrNull(rec.expectPaidRappen);
  if (total === undefined || paid === undefined) return { ok: false, code: "invalid-body" };
  return { ok: true, value: { klass, expectTotalRappen: total, expectPaidRappen: paid } };
}
