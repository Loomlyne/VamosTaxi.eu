// apps/web/lib/ops/bookings-map.ts
//
// Pure board mapping. Keep Hyperdrive out of this file so vitest can import it.

import { humaniseCode } from "../checkout/extras-catalog";
import { classDisplayName } from "./class-slug";

export type OpsBookingRow = {
  id: string;
  bookingId: string;
  time: string;
  date: string;
  dateIso: string;
  pickupAt: string;
  capturedAt: string;
  customer: string;
  email: string;
  phone: string;
  company: string;
  pickup: string;
  dropoff: string;
  klass: string;
  vehicle: string;
  pax: number;
  bags: number;
  status: string;
  chauffeur: string;
  driver: string;
  chauffeurEmail: string;
  assignedChauffeurId: string;
  assignedVehicleId: string;
  flight: string;
  note: string;
  paid: boolean;
  paidByCard: boolean;
  payLinkSent: boolean;
  cardSession: boolean;
  sessionExpiresAt: string;
  totalRappen: number;
  extraRappen: number;
  refundRappen: number;
  /** bookings.refund_status: none | pending_ops | processing | refunded | failed | declined. */
  refundStatus: string;
  /** Amount the admin decided to refund; null until decided (D-24). */
  refundOwedRappen: number | null;
  /** Every captured charge on the booking (base + extras). */
  capturedRappen: number;
  /** Earliest leg's original pickup is at or before SQL now() (D-25). */
  tripPassed: boolean;
  /** Latest Stripe dispute mirror (D-07); status word and reason code only. */
  dispute: OpsBookingDispute | null;
  stripeFeeRappen: number | null;
  pendingEditId: string;
  pendingEditActor: string;
  pendingEditQuoteRappen: number;
  pendingEditExtraSessionId: string;
  /** 26.2 P1: the class a change waits to become (dearer: until the difference is paid), or "". */
  pendingEditClass: string;
  /** 26.2 P1: the difference to pay, rappen (0 when none). */
  pendingEditDifferenceRappen: number;
  /** 26.2 P1: until when the difference can be paid (ISO), or "". */
  pendingEditPayUntil: string;
  durationMin: number;
  distanceKm: number | null;
  couponCode: string;
  extras: string[];
  fareLines: OpsFareLine[];
  arrivedAt: string;
};

export type OpsBookingDispute = { status: string; reason: string };

export type SqlBoardRow = {
  id: string;
  reference: string;
  status: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  company_name: string | null;
  note: string | null;
  pay_link_sent_at: string | Date | null;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | null;
  scheduled_at: string | Date | null;
  flight_no: string | null;
  pax: number | null;
  bags: number | null;
  class_slug: string | null;
  chauffeur_name: string | null;
  chauffeur_email?: string | null;
  assigned_chauffeur_id?: string | null;
  assigned_vehicle_id?: string | null;
  vehicle_plate?: string | null;
  vehicle_model?: string | null;
  payment_status: string | null;
  captured_at: string | Date | null;
  payment_created_at: string | Date | null;
  stripe_checkout_session_id: string | null;
  charged_rappen: number | string | null;
  snapshot_total_rappen?: number | string | null;
  extra_rappen?: number | string | null;
  refund_rappen?: number | string | null;
  refund_status?: string | null;
  refund_owed_rappen?: number | string | null;
  captured_rappen?: number | string | null;
  trip_passed?: boolean | null;
  dispute_status?: string | null;
  dispute_reason?: string | null;
  stripe_fee_rappen?: number | string | null;
  edit_request_id?: string | null;
  edit_actor?: string | null;
  edit_quote_total?: number | string | null;
  extra_session_id?: string | null;
  edit_class_slug?: string | null;
  edit_class_name?: string | null;
  edit_extra_rappen?: number | string | null;
  edit_extra_expires_at?: string | Date | null;
  estimated_duration_minutes?: number | string | null;
  duration_min?: number | string | null;
  distance_km?: number | string | null;
  coupon_code?: string | null;
  policy?: unknown;
  lines?: unknown;
  arrived_at?: string | Date | null;
};

function str(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function classLabel(slug: string | null): string {
  if (!slug) return "Economy";
  // 26.1-19 D-14: live and legacy slugs read Economy / Business / Van luxury.
  return classDisplayName(slug) ?? slug.charAt(0).toUpperCase() + slug.slice(1);
}

function boardParts(scheduledLocal: string | null): { date: string; time: string; dateIso: string } {
  const raw = str(scheduledLocal);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (!match || !match[1] || !match[2]) {
    return { date: "", time: "", dateIso: "" };
  }
  const dateIso = match[1];
  const time = match[2];
  const bits = dateIso.split("-");
  const year = Number(bits[0]);
  const month = Number(bits[1]);
  const day = Number(bits[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return { date: "", time, dateIso };
  }
  const utcNoon = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const parts: Record<string, string> = {};
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
  })
    .formatToParts(utcNoon)
    .forEach((part) => {
      parts[part.type] = part.value;
    });
  return {
    date: `${parts.weekday ?? ""} ${parts.day ?? ""} ${parts.month ?? ""}`.trim(),
    time,
    dateIso,
  };
}

function addHours(value: string | Date, hours: number): string {
  const ms = typeof value === "string" ? Date.parse(value) : value.getTime();
  if (!Number.isFinite(ms)) return "";
  return new Date(ms + hours * 3600 * 1000).toISOString();
}

function iso(value: string | Date | null | undefined): string {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : "";
  }
  const raw = String(value).trim();
  if (!raw) return "";
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
}

function rappen(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function minutes(primary: number | string | null | undefined, fallback: number | string | null | undefined): number {
  const a = Number(primary);
  if (Number.isFinite(a) && a > 0) return Math.round(a);
  const b = Number(fallback);
  if (Number.isFinite(b) && b > 0) return Math.round(b);
  return 0;
}

function kmOrNull(value: number | string | null | undefined): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 10) / 10;
}

export type OpsFareLine = {
  kind: string;
  code: string;
  label: string;
  /** Owner-typed names per language (surcharge lines). Ops picks by its own locale. */
  names: Record<string, string> | null;
  /** Signed: the voucher is negative. Each amount is shown once, never derived. */
  rappen: number | null;
};

function cleanNames(raw: unknown): Record<string, string> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const lang of ["en", "de", "fr", "ar"]) {
    const v = (raw as Record<string, unknown>)[lang];
    if (typeof v === "string" && v.trim()) out[lang] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

function lineParams(rec: Record<string, unknown>): Record<string, unknown> {
  const p = rec.params;
  return p && typeof p === "object" && !Array.isArray(p) ? (p as Record<string, unknown>) : {};
}

function finite(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * D-35: the snapshot lines as ops prints them. Amounts are copied from the
 * lines: a fare or surcharge that took part of a voucher shows its list amount
 * (params.list_rappen) and the coupon line shows the discount, negative, so
 * the rows add up to the total without any derived arithmetic.
 */
function mapFareLines(raw: unknown, klass: string): OpsFareLine[] {
  if (!Array.isArray(raw)) return [];
  const out: OpsFareLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const kind = str(rec.kind);
    const code = str(rec.code || rec.kind);
    const params = lineParams(rec);
    const names = cleanNames(params.names);
    let rappenValue = finite(rec.amount_rappen ?? rec.amountRappen);
    if (kind === "coupon" || code === "coupon") {
      const discount = finite(params.discount_rappen);
      if (discount != null && discount > 0) rappenValue = -discount;
    } else {
      const list = finite(params.list_rappen);
      if (list != null) rappenValue = list;
    }
    let label: string;
    if (kind === "fare" || code === "distance_fare" || code === "fare" || code === "transfer") {
      label = `Transfer, ${klass}`;
    } else if (kind === "coupon" || code === "coupon") label = "Coupon";
    else if (kind === "vat" || code === "vat") label = "VAT";
    else {
      const named = typeof params.name === "string" && params.name.trim() ? params.name.trim() : "";
      label = names?.en ?? (named || humaniseCode(code));
    }
    out.push({ kind, code, label, names, rappen: rappenValue });
  }
  return out;
}

/**
 * D-35: every ticked extra by its own code. Snapshot surcharge lines first
 * (they are what was charged), policy.extras as the fallback for snapshots
 * without lines. Nothing is matched against a code list.
 */
function extrasFromSnapshot(policy: unknown, lines: unknown): string[] {
  const out: string[] = [];
  const push = (code: string) => {
    const c = code.trim();
    if (c && !out.includes(c)) out.push(c);
  };
  if (Array.isArray(lines)) {
    for (const item of lines) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const rec = item as Record<string, unknown>;
      if (str(rec.kind) === "surcharge") push(str(rec.code));
    }
  }
  if (out.length) return out;
  if (!policy || typeof policy !== "object") return [];
  const raw = (policy as { extras?: unknown }).extras;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
      if (val) push(key);
    }
    return out;
  }
  if (!Array.isArray(raw)) return [];
  for (const item of raw) {
    if (typeof item === "string") push(item);
  }
  return out;
}

function fleetVehicle(plate: string, model: string): string {
  if (plate && model) return `${plate} · ${model}`;
  return plate || model;
}

export function mapBoardBooking(row: SqlBoardRow): OpsBookingRow {
  const status = str(row.status) || "pending";
  const capturedAt = iso(row.captured_at);
  const paid = capturedAt.length > 0;
  const payLinkSent = row.pay_link_sent_at != null;
  const cardSession = str(row.stripe_checkout_session_id).length > 0;
  const sessionExpiresAt =
    !paid && str(row.payment_status) === "requires_payment" && row.payment_created_at
      ? addHours(row.payment_created_at, 24)
      : "";
  const klass = classLabel(row.class_slug);
  const when = boardParts(row.scheduled_local);
  const chauffeur = str(row.chauffeur_name);
  const feeRaw = row.stripe_fee_rappen;
  const stripeFeeRappen =
    feeRaw === undefined || feeRaw === null || String(feeRaw).trim() === "" ? null : rappen(feeRaw);
  return {
    id: str(row.reference) || str(row.id),
    bookingId: str(row.id),
    time: when.time,
    date: when.date,
    dateIso: when.dateIso,
    pickupAt: iso(row.scheduled_at),
    capturedAt,
    customer: str(row.contact_name),
    email: str(row.contact_email),
    phone: str(row.contact_phone),
    company: str(row.company_name),
    pickup: str(row.pickup_text),
    dropoff: str(row.dropoff_text),
    klass,
    vehicle: fleetVehicle(str(row.vehicle_plate), str(row.vehicle_model)),
    pax: Number(row.pax ?? 1) || 1,
    bags: Number(row.bags ?? 0) || 0,
    status,
    chauffeur,
    driver: chauffeur,
    chauffeurEmail: str(row.chauffeur_email),
    assignedChauffeurId: str(row.assigned_chauffeur_id),
    assignedVehicleId: str(row.assigned_vehicle_id),
    flight: str(row.flight_no),
    note: str(row.note),
    paid,
    paidByCard: paid,
    payLinkSent,
    cardSession,
    sessionExpiresAt,
    totalRappen: rappen(row.snapshot_total_rappen) || rappen(row.charged_rappen),
    extraRappen: rappen(row.extra_rappen),
    refundRappen: rappen(row.refund_rappen),
    refundStatus: str(row.refund_status) || "none",
    refundOwedRappen:
      row.refund_owed_rappen == null || String(row.refund_owed_rappen).trim() === ""
        ? null
        : rappen(row.refund_owed_rappen),
    capturedRappen: rappen(row.captured_rappen),
    tripPassed: row.trip_passed === true,
    dispute: str(row.dispute_status)
      ? { status: str(row.dispute_status), reason: str(row.dispute_reason) }
      : null,
    stripeFeeRappen,
    pendingEditId: str(row.edit_request_id),
    pendingEditActor: str(row.edit_actor),
    pendingEditQuoteRappen: rappen(row.edit_quote_total),
    pendingEditExtraSessionId: str(row.extra_session_id),
    // 26.2 P1: a class change waiting for the difference (name as the owner typed it, else the D-14 name).
    pendingEditClass: str(row.edit_class_name).trim() || (row.edit_class_slug ? classDisplayName(str(row.edit_class_slug)) ?? str(row.edit_class_slug) : ""),
    pendingEditDifferenceRappen: rappen(row.edit_extra_rappen),
    pendingEditPayUntil: iso(row.edit_extra_expires_at),
    durationMin: minutes(row.duration_min, row.estimated_duration_minutes),
    distanceKm: kmOrNull(row.distance_km),
    couponCode: str(row.coupon_code).trim(),
    extras: extrasFromSnapshot(row.policy, row.lines),
    fareLines: mapFareLines(row.lines, klass),
    arrivedAt: iso(row.arrived_at),
  };
}
