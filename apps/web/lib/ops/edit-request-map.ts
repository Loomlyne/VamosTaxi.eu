// apps/web/lib/ops/edit-request-map.ts
//
// 08-07: pure paid-edit mapping. No identity, no Hyperdrive.

import { OPS_SQLSTATE } from "./sqlstate";
import { sqlErrorCode } from "./refund-map";

export type EditPayload = {
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  note?: string;
  pickup_text?: string;
  dropoff_text?: string;
  flight_no?: string;
  scheduled_local?: string;
  pax?: number;
  bags?: number;
  vehicle_class_slug?: string;
};

export type AcceptOutcome =
  | "applied"
  | "extra_required"
  | "refund_immediate"
  | "refund_click"
  | "must-fix";

export type EditAcceptFail = { ok: false; code: string };

export function fareDifferenceRappen(newTotal: number, originalCaptured: number): number {
  if (!Number.isFinite(newTotal) || !Number.isFinite(originalCaptured)) return 0;
  return newTotal - originalCaptured;
}

export function extraCheckoutMetadata(bookingId: string, extraId: string): {
  booking_id: string;
  kind: "extra";
  extra_id: string;
} {
  return { booking_id: bookingId, kind: "extra", extra_id: extraId };
}

export function shouldExpireOldExtraSession(oldAmount: number | null, newAmount: number): boolean {
  if (oldAmount == null) return false;
  return oldAmount !== newAmount;
}

export function unpaidFieldPatchRefused(paid: boolean): boolean {
  return !paid;
}

function messageOf(err: unknown): string {
  if (typeof err !== "object" || err === null || !("message" in err)) return "";
  const message = (err as { message: unknown }).message;
  return typeof message === "string" ? message : "";
}

export function mapEditSqlError(err: unknown): EditAcceptFail {
  const message = messageOf(err);
  for (const name of [
    "unpaid",
    "not-found",
    "not-requested",
    "capacity",
    "snapshot-mismatch",
    "invalid_actor",
    "invalid_difference",
  ]) {
    if (message === name || message.startsWith(`${name}\n`) || message.startsWith(`${name} `)) {
      if (name === "capacity") return { ok: false, code: "must-fix" };
      return { ok: false, code: name };
    }
  }
  if (sqlErrorCode(err) === OPS_SQLSTATE.noData) return { ok: false, code: "not-found" };
  if (sqlErrorCode(err) === OPS_SQLSTATE.exclusion) return { ok: false, code: "must-fix" };
  return { ok: false, code: "unknown" };
}

export function failStatus(code: string): number {
  if (code === "not-found") return 404;
  if (code === "unpaid") return 409;
  if (code === "must-fix" || code === "capacity" || code === "not-requested") return 409;
  if (code === "stripe-failed" || code === "stripe-test-only") return 502;
  return 400;
}
