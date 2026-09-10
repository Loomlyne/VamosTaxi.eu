export const dynamic = "force-dynamic";

import type { PayLinkExtraCode } from "@vamos/emails/confirmation";
import { asCustomer, asGuest, type VamosClaims } from "../db/identity";
import { hashManageToken } from "./manage-token";
import { extrasFromPolicy } from "./pay-link";
import { BOOKING_REFERENCE_RE } from "./booking-status";

export {
  BOOKING_REFERENCE_RE,
  isCapturedPayment,
  isFailedPayment,
  isFailedStatus,
  isProcessingStatus,
  isVoucherStatus,
} from "./booking-status";

// Guest SELECT only — columns named in 20260823000022_rls_guest.sql. Never
// `SELECT *`. RLS is the gate: a missing or unknown token hashes to "" or a
// 64-char hex that matches no row, and the policy returns zero rows.

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
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
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
};

type LegRow = {
  pickup_text: string;
  dropoff_text: string;
  scheduled_local: string;
  vehicle_class_id: string;
  pax: number;
  bags: number;
  flight_no?: string | null;
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
    out.push({ code, vehicleClass, amountRappen: Math.round(amount) });
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

function mergeExtraCodes(policy: PayLinkExtraCode[], lines: ConfirmationFareLine[]): PayLinkExtraCode[] {
  const out = [...policy];
  for (const line of lines) {
    if (line.code !== "child_seat" && line.code !== "oversized_luggage" && line.code !== "extra_stop") {
      continue;
    }
    if (!out.includes(line.code)) out.push(line.code);
  }
  return out;
}

function firstLeg(rows: LegRow[]): {
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  vehicleClassId: string;
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
    pax: Number(row.pax) || 0,
    bags: Number(row.bags) || 0,
    flightNo: asText(row.flight_no).trim(),
  };
}

async function selectVisibleBooking(sql: SqlTag, reference: string): Promise<VisibleBooking | null> {
  const bookings = (await sql`
    select
      id,
      reference,
      customer_id,
      contact_name,
      contact_email,
      contact_phone,
      is_return,
      status,
      locale,
      display_currency,
      price_snapshot_id,
      price_total_rappen,
      created_at,
      updated_at
    from public.bookings
    where reference = ${reference}
  `) as unknown as BookingRow[];
  const booking = bookings[0];
  if (!booking) return null;
  const legs = (await sql`
    select
      id,
      booking_id,
      leg_seq,
      direction,
      pickup_text,
      pickup_place_id,
      pickup_lat,
      pickup_lng,
      dropoff_text,
      dropoff_place_id,
      dropoff_lat,
      dropoff_lng,
      origin_zone_id,
      dest_zone_id,
      scheduled_at,
      scheduled_local,
      flight_no,
      vehicle_class_id,
      pax,
      bags,
      status,
      scheduled_range,
      created_at,
      updated_at
    from public.booking_legs
    where booking_id = ${booking.id}
    order by leg_seq
  `) as unknown as LegRow[];
  const snaps = (await sql`
    select
      id,
      booking_id,
      engine_version,
      policy,
      quote_id,
      lines,
      subtotal_rappen,
      discount_rappen,
      total_rappen,
      currency,
      coupon_code,
      duration_min,
      distance_km
    from public.price_snapshots
    where booking_id = ${booking.id}
    order by computed_at desc nulls last
    limit 1
  `) as unknown as SnapshotRow[];
  const payments = (await sql`
    select status, captured_at, charged_rappen
    from public.booking_payments
    where booking_id = ${booking.id}
    order by captured_at desc nulls last, created_at desc
    limit 1
  `) as unknown as PaymentRow[];
  const fareLines = parseFareLines(snaps[0]?.lines);
  const extras = mergeExtraCodes(extrasFromPolicy(snaps[0]?.policy), fareLines);
  const payment = payments[0];
  const priceTotalRappen =
    rappenOrNull(booking.price_total_rappen) ??
    rappenOrNull(snaps[0]?.total_rappen) ??
    rappenOrNull(payment?.charged_rappen);
  const vehicleClassSlug = fareLines[0]?.vehicleClass ?? "";
  const couponCode = asText(snaps[0]?.coupon_code).trim() || null;
  const leg = firstLeg(legs);
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
    discountRappen: rappenOrNull(snaps[0]?.discount_rappen),
    subtotalRappen: rappenOrNull(snaps[0]?.subtotal_rappen),
    priceTotalRappen,
    fareLines,
    durationMin: rappenOrNull(snaps[0]?.duration_min),
    distanceKm: kmOrNull(snaps[0]?.distance_km),
    paidAt: capturedAtIso(payment?.captured_at),
    paymentStatus: typeof payment?.status === "string" ? payment.status : null,
  };
}

async function loadGuestBooking(
  env: CloudflareEnv,
  rawCookie: string,
  reference: string,
): Promise<VisibleBooking | null> {
  if (!BOOKING_REFERENCE_RE.test(reference)) return null;
  const manageTokenHashHex = rawCookie ? await hashManageToken(rawCookie) : "";
  return asGuest(env, manageTokenHashHex, async (sql) => selectVisibleBooking(sql, reference));
}

async function loadCustomerBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  reference: string,
): Promise<VisibleBooking | null> {
  if (!BOOKING_REFERENCE_RE.test(reference)) return null;
  return asCustomer(env, claims, async (sql) => selectVisibleBooking(sql, reference));
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
