// apps/web/lib/ops/bookings-map.ts
//
// Pure board mapping. Keep Hyperdrive out of this file so vitest can import it.

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
  durationMin: number;
  distanceKm: number | null;
  couponCode: string;
  extras: string[];
  fareLines: { code: string; label: string; rappen: number | null }[];
  arrivedAt: string;
  extraWaitMinutes: number;
  extraWaitRappen: number;
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
  estimated_duration_minutes?: number | string | null;
  duration_min?: number | string | null;
  distance_km?: number | string | null;
  coupon_code?: string | null;
  policy?: unknown;
  lines?: unknown;
  arrived_at?: string | Date | null;
  free_wait_minutes?: number | string | null;
  waiting_amount_rappen?: number | string | null;
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

/** D-38: extra wait after published free_wait_minutes. Display only — never a Stripe amount. */
export function extraWaitFromArrival(args: {
  arrivedAt: string | Date | null | undefined;
  scheduledAt: string | Date | null | undefined;
  freeWaitMinutes: number | null | undefined;
  unitMinutes?: number | null;
  amountRappen: number | null | undefined;
}): { extraMinutes: number; extraRappen: number } {
  if (args.arrivedAt == null || args.scheduledAt == null) {
    return { extraMinutes: 0, extraRappen: 0 };
  }
  const arrived =
    args.arrivedAt instanceof Date ? args.arrivedAt.getTime() : Date.parse(String(args.arrivedAt));
  const scheduled =
    args.scheduledAt instanceof Date
      ? args.scheduledAt.getTime()
      : Date.parse(String(args.scheduledAt));
  if (!Number.isFinite(arrived) || !Number.isFinite(scheduled)) {
    return { extraMinutes: 0, extraRappen: 0 };
  }
  const elapsed = Math.max(0, Math.floor((arrived - scheduled) / 60_000));
  const free =
    typeof args.freeWaitMinutes === "number" && Number.isFinite(args.freeWaitMinutes)
      ? Math.max(0, Math.trunc(args.freeWaitMinutes))
      : 0;
  const extraMinutes = Math.max(0, elapsed - free);
  if (extraMinutes <= 0) return { extraMinutes: 0, extraRappen: 0 };
  const amount =
    typeof args.amountRappen === "number" && Number.isFinite(args.amountRappen)
      ? Math.max(0, Math.trunc(args.amountRappen))
      : 0;
  if (amount <= 0) return { extraMinutes, extraRappen: 0 };
  const unit =
    typeof args.unitMinutes === "number" && Number.isFinite(args.unitMinutes) && args.unitMinutes > 0
      ? Math.trunc(args.unitMinutes)
      : null;
  const extraRappen = unit != null ? Math.ceil(extraMinutes / unit) * amount : amount;
  return { extraMinutes, extraRappen };
}

const EXTRA_CODES = ["child_seat", "oversized_luggage", "extra_stop"] as const;

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

function mapFareLines(raw: unknown, klass: string): { code: string; label: string; rappen: number | null }[] {
  if (!Array.isArray(raw)) return [];
  const out: { code: string; label: string; rappen: number | null }[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const code = str(rec.code || rec.kind);
    const amount = rec.amount_rappen ?? rec.amountRappen;
    const n = amount == null || amount === "" ? NaN : Number(amount);
    const rappenValue = Number.isFinite(n) ? n : null;
    let label = "";
    if (code === "distance_fare" || code === "fare" || code === "transfer") label = `Transfer, ${klass}`;
    else if (code === "child_seat") label = "Child seat";
    else if (code === "oversized_luggage") label = "Oversized luggage";
    else if (code === "extra_stop") label = "Extra stop";
    else if (code === "meet_greet") label = "Meet and greet";
    else if (code === "coupon") label = "Coupon";
    else label = code.replace(/_/g, " ");
    out.push({ code, label, rappen: rappenValue });
  }
  return out;
}

function extrasFromPolicy(policy: unknown): string[] {
  if (!policy || typeof policy !== "object") return [];
  const raw = (policy as { extras?: unknown }).extras;
  const out: string[] = [];
  const push = (code: string) => {
    if (EXTRA_CODES.includes(code as (typeof EXTRA_CODES)[number]) && !out.includes(code)) out.push(code);
  };
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
  const extraWait = extraWaitFromArrival({
    arrivedAt: row.arrived_at,
    scheduledAt: row.scheduled_at,
    freeWaitMinutes:
      row.free_wait_minutes == null || row.free_wait_minutes === ""
        ? null
        : Number(row.free_wait_minutes),
    amountRappen:
      row.waiting_amount_rappen == null || row.waiting_amount_rappen === ""
        ? null
        : Number(row.waiting_amount_rappen),
  });
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
    durationMin: minutes(row.duration_min, row.estimated_duration_minutes),
    distanceKm: kmOrNull(row.distance_km),
    couponCode: str(row.coupon_code).trim(),
    extras: extrasFromPolicy(row.policy),
    fareLines: mapFareLines(row.lines, klass),
    arrivedAt: iso(row.arrived_at),
    extraWaitMinutes: extraWait.extraMinutes,
    extraWaitRappen: extraWait.extraRappen,
  };
}
