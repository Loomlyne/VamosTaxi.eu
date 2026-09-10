export const dynamic = "force-dynamic";

import type { PayLinkExtraCode } from "@vamos/emails/confirmation";
import { asCustomer, asGuest, asSystem, type VamosClaims } from "../db/identity";
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
  "quoted_at",
  "engine_version",
  "policy",
  "quote_id",
  "lines",
  "subtotal_rappen",
  "vat_rappen",
  "total_rappen",
  "currency",
  "valid_until",
  "created_at",
] as const;

export type HiddenBooking = { visible: false };

export type VisibleBooking = {
  visible: true;
  reference: string;
  status: string;
  pickupText: string;
  dropoffText: string;
  scheduledLocal: string;
  vehicleClassId: string;
  pax: number;
  bags: number;
  extras: PayLinkExtraCode[];
};

export type BookingRead = HiddenBooking | VisibleBooking;

export type StatusRead =
  | { visible: false }
  | { visible: true; status: string; reference: string; paymentStatus: string | null };

type BookingRow = {
  id: string;
  reference: string;
  status: string;
};

type LegRow = {
  pickup_text: string;
  dropoff_text: string;
  scheduled_local: string;
  vehicle_class_id: string;
  pax: number;
  bags: number;
};

const HIDDEN: HiddenBooking = { visible: false };

type SqlTag = Parameters<Parameters<typeof asGuest>[2]>[0];

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

function firstLeg(rows: LegRow[]): Omit<VisibleBooking, "visible" | "reference" | "status" | "extras"> {
  const row = rows[0];
  if (!row) {
    return {
      pickupText: "",
      dropoffText: "",
      scheduledLocal: "",
      vehicleClassId: "",
      pax: 0,
      bags: 0,
    };
  }
  return {
    pickupText: asText(row.pickup_text),
    dropoffText: asText(row.dropoff_text),
    scheduledLocal: asText(row.scheduled_local),
    vehicleClassId: asText(row.vehicle_class_id),
    pax: Number(row.pax) || 0,
    bags: Number(row.bags) || 0,
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
      quoted_at,
      engine_version,
      policy,
      quote_id,
      lines,
      subtotal_rappen,
      vat_rappen,
      total_rappen,
      currency,
      valid_until,
      created_at
    from public.price_snapshots
    where booking_id = ${booking.id}
  `) as unknown as { policy?: unknown }[];
  const extras = extrasFromPolicy(snaps[0]?.policy);
  const leg = firstLeg(legs);
  return {
    visible: true as const,
    reference: booking.reference,
    status: booking.status,
    pickupText: leg.pickupText,
    dropoffText: leg.dropoffText,
    scheduledLocal: leg.scheduledLocal,
    vehicleClassId: leg.vehicleClassId,
    pax: leg.pax,
    bags: leg.bags,
    extras,
  };
}

async function loadGuestBooking(
  env: CloudflareEnv,
  rawCookie: string,
  reference: string,
): Promise<VisibleBooking | null> {
  if (!rawCookie || !BOOKING_REFERENCE_RE.test(reference)) return null;
  const manageTokenHashHex = await hashManageToken(rawCookie);
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

async function readLatestPaymentStatus(env: CloudflareEnv, reference: string): Promise<string | null> {
  try {
    const rows = await asSystem(env, async (sql) => {
      return sql`
        select bp.status
        from public.booking_payments bp
        inner join public.bookings b on b.id = bp.booking_id
        where b.reference = ${reference}
        order by bp.created_at desc
        limit 1
      `;
    });
    const status = rows[0] && typeof rows[0] === "object" && "status" in rows[0] ? rows[0].status : null;
    return typeof status === "string" ? status : null;
  } catch {
    return null;
  }
}

export async function readBookingStatus(
  env: CloudflareEnv,
  rawCookie: string,
  reference: string,
  claims?: VamosClaims | null,
): Promise<StatusRead> {
  const row = await readBookingForConfirmation(env, rawCookie, reference, claims);
  if (!row.visible) return HIDDEN;
  const paymentStatus = await readLatestPaymentStatus(env, row.reference);
  return { visible: true, status: row.status, reference: row.reference, paymentStatus };
}
