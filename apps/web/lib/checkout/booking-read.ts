export const dynamic = "force-dynamic";

import type { PayLinkExtraCode } from "@vamos/emails/confirmation";
import { asCustomer, asGuest, type VamosClaims } from "../db/identity";
import { hashManageToken } from "./manage-token";
import { receiptRows, type ReceiptRow } from "./confirmation-receipt";
import { BOOKING_REFERENCE_RE } from "./booking-status";

export {
  BOOKING_REFERENCE_RE,
  isCapturedPayment,
  isFailedPayment,
  isFailedStatus,
  isProcessingStatus,
  isVoucherStatus,
} from "./booking-status";

// Confirmation reads go through security definers. vamos_guest and
// authenticated have no SELECT on bookings. A missing token returns null.
// The page stays hidden. A 42501 must not be the steady state.

export const BOOKING_COLUMNS = [
  "id",
  "reference",
  "customer_id",
  "contact_name",
  "contact_email",
  "contact_phone",
  "is_return",
  "status",
  "locale",
  "display_currency",
  "price_snapshot_id",
  "price_total_rappen",
  "created_at",
  "updated_at",
] as const;

export const LEG_COLUMNS = [
  "id",
  "booking_id",
  "leg_seq",
  "direction",
  "pickup_text",
  "pickup_place_id",
  "pickup_lat",
  "pickup_lng",
  "dropoff_text",
  "dropoff_place_id",
  "dropoff_lat",
  "dropoff_lng",
  "origin_zone_id",
  "dest_zone_id",
  "scheduled_at",
  "scheduled_local",
  "flight_no",
  "vehicle_class_id",
  "pax",
  "bags",
  "status",
  "scheduled_range",
  "created_at",
  "updated_at",
] as const;

export const SNAPSHOT_COLUMNS = [
  "id",
  "booking_id",
  "engine_version",
  "policy",
  "quote_id",
  "lines",
  "subtotal_rappen",
  "discount_rappen",
  "total_rappen",
  "currency",
  "coupon_code",
  "duration_min",
  "distance_km",
] as const;

export type ConfirmationFareLine = {
  code: string;
  vehicleClass: string;
  amountRappen: number;
  /** Snapshot line kind (fare, surcharge, coupon, vat). Absent on very old lines. */
  kind?: string;
  i18nKey?: string;
  params?: Record<string, unknown>;
};

export type BookingReceipt = {
  rows: ReceiptRow[];
  chargedRappen: number | null;
  /** Set only when the customer paid in a currency other than CHF. */
  presentment: { amountMinor: number; currency: string } | null;
  vehicleClassName: string | null;
};

export type HiddenBooking = { visible: false };

export type VisibleBooking = {
  visible: true;
  reference: string;
  status: string;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  vehicleClassId: string;
  vehicleClassSlug: string;
  pax: number;
  bags: number;
  flightNo: string;
  extras: PayLinkExtraCode[];
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  couponCode: string | null;
  discountRappen: number | null;
  subtotalRappen: number | null;
  priceTotalRappen: number | null;
  fareLines: ConfirmationFareLine[];
  durationMin: number | null;
  distanceKm: number | null;
  paidAt: string | null;
  paymentStatus: string | null;
  /** 26.1-19: refund facts from the confirmation read, so the voucher refund line survives a reload (D-23a). */
  refundStatus: string | null;
  refundOwedRappen: number | null;
  refundedRappen: number | null;
  /** 26.3-09: the receipt, from the snapshot lines only. */
  receipt: BookingReceipt;
};

export type BookingRead = HiddenBooking | VisibleBooking;

export type StatusRead =
  | { visible: false }
  | { visible: true; status: string; reference: string; paymentStatus: string | null };

type BookingRow = {
  id: string;
  reference: string;
  status: string;
  price_total_rappen: number | string | null;
  refund_status?: string | null;
  refund_owed_rappen?: number | string | null;
  refunded_rappen?: number | string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  locale?: string | null;
};

type SnapshotRow = {
  policy?: unknown;
  lines?: unknown;
  total_rappen?: number | string | null;
  subtotal_rappen?: number | string | null;
  discount_rappen?: number | string | null;
  coupon_code?: string | null;
  duration_min?: number | string | null;
  distance_km?: number | string | null;
};

type PaymentRow = {
  status?: string | null;
  captured_at?: unknown;
  charged_rappen?: number | string | null;
  presentment_amount_minor?: number | string | null;
  presentment_currency?: string | null;
};

type LegRow = {
  pickup_text: string;
  dropoff_text: string;
  scheduled_local: string;
  vehicle_class_id: string;
  pax: number;
  bags: number;
  flight_no?: string | null;
  vehicle_class_name?: string | null;
};

const HIDDEN: HiddenBooking = { visible: false };

type SqlTag = Parameters<Parameters<typeof asGuest>[2]>[0];

export function parseFareLines(raw: unknown): ConfirmationFareLine[] {
  if (!Array.isArray(raw)) return [];
  const out: ConfirmationFareLine[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const amount = Number(rec.amount_rappen);
    if (!Number.isFinite(amount)) continue;
    const params =
      rec.params && typeof rec.params === "object" ? (rec.params as Record<string, unknown>) : {};
    const vehicleClass = typeof params.vehicleClass === "string" ? params.vehicleClass.trim() : "";
    const code = typeof rec.code === "string" ? rec.code : "";
    const line: ConfirmationFareLine = { code, vehicleClass, amountRappen: Math.round(amount) };
    if (typeof rec.kind === "string") line.kind = rec.kind;
    if (typeof rec.i18n_key === "string") line.i18nKey = rec.i18n_key;
    if (Object.keys(params).length) line.params = params;
    out.push(line);
  }
  return out;
}

function rappenOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function kmOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function capturedAtIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

/** Legacy three-code extras, read from the snapshot lines only (BookingVoucher until plan 14). */
function legacyExtraCodes(lines: ConfirmationFareLine[]): PayLinkExtraCode[] {
  const out: PayLinkExtraCode[] = [];
  for (const line of lines) {
    if (line.code !== "child_seat" && line.code !== "oversized_luggage" && line.code !== "extra_stop") {
      continue;
    }
    if (!out.includes(line.code)) out.push(line.code);
  }
  return out;
}

function presentmentOrNull(payment: PaymentRow | undefined): BookingReceipt["presentment"] {
  const currency = asText(payment?.presentment_currency).trim().toUpperCase();
  const minor = rappenOrNull(payment?.presentment_amount_minor);
  if (!currency || currency === "CHF" || minor == null || minor <= 0) return null;
  return { amountMinor: minor, currency };
}

function firstLeg(rows: LegRow[]): {
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  vehicleClassId: string;
  vehicleClassName: string;
  pax: number;
  bags: number;
  flightNo: string;
} {
  const row = rows[0];
  if (!row) {
    return {
      pickupText: "",
      dropoffText: "",
      scheduledLocal: "",
      vehicleClassId: "",
      vehicleClassName: "",
      pax: 0,
      bags: 0,
      flightNo: "",
    };
  }
  return {
    pickupText: asText(row.pickup_text),
    dropoffText: asText(row.dropoff_text),
    scheduledLocal: asText(row.scheduled_local),
    vehicleClassId: asText(row.vehicle_class_id),
    vehicleClassName: asText(row.vehicle_class_name).trim(),
    pax: Number(row.pax) || 0,
    bags: Number(row.bags) || 0,
    flightNo: asText(row.flight_no).trim(),
  };
}

function visibleFromPayload(raw: unknown): VisibleBooking | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as {
    booking?: BookingRow;
    legs?: LegRow[];
    snapshot?: SnapshotRow | null;
    payment?: PaymentRow | null;
  };
  const booking = payload.booking;
  if (!booking?.reference) return null;
  const legs = Array.isArray(payload.legs) ? payload.legs : [];
  const snap = payload.snapshot ?? undefined;
  const payment = payload.payment ?? undefined;
  const fareLines = parseFareLines(snap?.lines);
  const extras = legacyExtraCodes(fareLines);
  const priceTotalRappen =
    rappenOrNull(booking.price_total_rappen) ??
    rappenOrNull(snap?.total_rappen) ??
    rappenOrNull(payment?.charged_rappen);
  const vehicleClassSlug = fareLines[0]?.vehicleClass ?? "";
  const couponCode = asText(snap?.coupon_code).trim() || null;
  const leg = firstLeg(legs);
  const chargedRappen = rappenOrNull(payment?.charged_rappen) ?? priceTotalRappen;
  const presentment = presentmentOrNull(payment);
  const locale = asText((booking as { locale?: unknown }).locale).trim() || "en";
  return {
    visible: true as const,
    reference: booking.reference,
    status: booking.status,
    pickupText: leg.pickupText,
    dropoffText: leg.dropoffText,
    scheduledLocal: leg.scheduledLocal,
    vehicleClassId: leg.vehicleClassId,
    vehicleClassSlug,
    pax: leg.pax,
    bags: leg.bags,
    flightNo: leg.flightNo,
    extras,
    contactName: asText(booking.contact_name).trim(),
    contactEmail: asText(booking.contact_email).trim(),
    contactPhone: asText(booking.contact_phone).trim(),
    couponCode,
    discountRappen: rappenOrNull(snap?.discount_rappen),
    subtotalRappen: rappenOrNull(snap?.subtotal_rappen),
    priceTotalRappen,
    fareLines,
    durationMin: rappenOrNull(snap?.duration_min),
    distanceKm: kmOrNull(snap?.distance_km),
    paidAt: capturedAtIso(payment?.captured_at),
    paymentStatus: typeof payment?.status === "string" ? payment.status : null,
    refundStatus: typeof booking.refund_status === "string" ? booking.refund_status : null,
    refundOwedRappen: rappenOrNull(booking.refund_owed_rappen),
    refundedRappen: rappenOrNull(booking.refunded_rappen),
    receipt: {
      rows: receiptRows(fareLines, locale, chargedRappen, presentment),
      chargedRappen,
      presentment,
      vehicleClassName: leg.vehicleClassName || null,
    },
  };
}

async function selectVisibleBooking(
  sql: SqlTag,
  reference: string,
  tokenHashHex: string,
): Promise<VisibleBooking | null> {
  const rows = await sql<{ payload: unknown }[]>`
    select public.guest_confirmation_read(
      ${reference},
      decode(${tokenHashHex}, 'hex')
    ) as payload
  `;
  return visibleFromPayload(rows[0]?.payload);
}

async function selectCustomerBooking(
  sql: SqlTag,
  reference: string,
  customerId: string,
): Promise<VisibleBooking | null> {
  const rows = await sql<{ payload: unknown }[]>`
    select public.customer_confirmation_read(${reference}, ${customerId}::uuid) as payload
  `;
  return visibleFromPayload(rows[0]?.payload);
}

async function loadGuestBooking(
  env: CloudflareEnv,
  rawCookie: string,
  reference: string,
): Promise<VisibleBooking | null> {
  if (!BOOKING_REFERENCE_RE.test(reference)) return null;
  const manageTokenHashHex = rawCookie ? await hashManageToken(rawCookie) : "";
  return asGuest(env, manageTokenHashHex, async (sql) => selectVisibleBooking(sql, reference, manageTokenHashHex));
}

async function loadCustomerBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  reference: string,
): Promise<VisibleBooking | null> {
  if (!BOOKING_REFERENCE_RE.test(reference)) return null;
  return asCustomer(env, claims, async (sql) => selectCustomerBooking(sql, reference, claims.sub));
}

export async function readBookingForConfirmation(
  env: CloudflareEnv,
  rawCookie: string,
  reference: string,
  claims?: VamosClaims | null,
): Promise<BookingRead> {
  const guest = await loadGuestBooking(env, rawCookie, reference);
  if (guest) return guest;
  if (claims) {
    const own = await loadCustomerBooking(env, claims, reference);
    if (own) return own;
  }
  return HIDDEN;
}

export async function readBookingStatus(
  env: CloudflareEnv,
  rawCookie: string,
  reference: string,
  claims?: VamosClaims | null,
): Promise<StatusRead> {
  const row = await readBookingForConfirmation(env, rawCookie, reference, claims);
  if (!row.visible) return HIDDEN;
  return { visible: true, status: row.status, reference: row.reference, paymentStatus: row.paymentStatus };
}
