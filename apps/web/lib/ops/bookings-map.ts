// apps/web/lib/ops/bookings-map.ts
//
// Pure board mapping. Keep Hyperdrive out of this file so vitest can import it.

const CLASS_LABEL: Record<string, string> = {
  economy: "Economy",
  business: "Business",
  first: "First",
  van: "Van",
};

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
  refundRappen: number;
  stripeFeeRappen: number | null;
};

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
  refund_rappen?: number | string | null;
  stripe_fee_rappen?: number | string | null;
};

function str(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value);
}

function classLabel(slug: string | null): string {
  if (!slug) return "Economy";
  return CLASS_LABEL[slug.toLowerCase()] ?? slug.charAt(0).toUpperCase() + slug.slice(1);
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
    totalRappen: paid ? rappen(row.charged_rappen) : 0,
    refundRappen: rappen(row.refund_rappen),
    stripeFeeRappen,
  };
}
