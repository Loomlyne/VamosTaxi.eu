// Customer account list. Pure mapping — identity + Hyperdrive stay in the route (Ban #5).
// vehicle is fleet plate/model or empty until assigned (D-50). Never the class slug.

const TERMINAL: Record<string, true> = {
  cancelled: true,
  refunded: true,
  completed: true,
  no_show: true,
  partially_completed: true,
};

export type AccountSqlRow = {
  reference: string;
  status: string;
  price_total_rappen: number | string | null;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | null;
  scheduled_at: string | Date | null;
  pax: number | null;
  /** 26.2 P6 (D19): the flight number on the first leg, so the account view can show and change it. */
  flight_no?: string | null;
  /** 26.2 P6 (D19): the booking's address (the signed-in e-mail: the list is chosen by it). */
  contact_email?: string | null;
  chauffeur_name?: string | null;
  vehicle_plate?: string | null;
  vehicle_model?: string | null;
  has_review?: boolean | null;
  is_test?: boolean | null;
  pay_link_sent_at?: string | Date | null;
};

export type AccountBooking = {
  ref: string;
  href: string;
  date: string;
  time: string;
  /** 26.2 P6 (D13): the booked day as YYYY-MM-DD (a time change from the account view needs it). */
  dateIso: string;
  /** 26.2 P6 (D19): the flight number as booked ("" when none); the account view's flight row needs it. */
  flightNo: string;
  /** 26.2 P6 (D19): where the confirmation goes; the account view's Resend row names it. */
  contactEmail: string;
  route: string;
  pickup: string;
  dropoff: string;
  vehicle: string;
  chauffeur: string;
  pax: number;
  priceRappen: number;
  status: "awaiting_payment" | "booked" | "new" | "completed" | "cancelled";
  when: "upcoming" | "past";
  group: string;
  reviewState: "none" | "requested" | "reviewed";
  reviewHref: string;
  pay_url: string | null;
  payable: boolean;
};

function str(value: unknown): string {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

function fleetVehicle(plate: string, model: string): string {
  if (plate && model) return `${plate} · ${model}`;
  return plate || model;
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

function groupLabel(dateIso: string): string {
  const bits = dateIso.split("-");
  const year = Number(bits[0]);
  const month = Number(bits[1]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1) return dateIso;
  const utcNoon = new Date(Date.UTC(year, month - 1, 15, 12, 0, 0));
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(utcNoon);
}

function reviewOf(
  status: string,
  hasReview: boolean,
  ref: string,
): { reviewState: AccountBooking["reviewState"]; reviewHref: string } {
  if (hasReview) return { reviewState: "reviewed", reviewHref: "/review" };
  const s = status.toLowerCase();
  if (s === "completed" || s === "partially_completed" || s === "no_show") {
    return {
      reviewState: "requested",
      reviewHref: ref ? `/review?ref=${encodeURIComponent(ref)}` : "/review",
    };
  }
  return { reviewState: "none", reviewHref: "" };
}

/** D-32/D-28: a paid booking is "booked" whether or not a pay link ever went out; only an unpaid one with a sent link is listed as awaiting payment. */
function rowStatus(status: string): AccountBooking["status"] {
  const s = status.toLowerCase();
  if (s === "pending") return "awaiting_payment";
  if (s === "cancelled" || s === "refunded" || s === "no_show") return "cancelled";
  if (s === "completed" || s === "partially_completed") return "completed";
  if (s === "assigned" || s === "confirmed" || s === "paid") return "booked";
  return "new";
}

function whenFor(status: string, scheduledAt: string | Date | null, now: Date): AccountBooking["when"] {
  if (TERMINAL[status.toLowerCase()]) return "past";
  if (status.toLowerCase() === "pending") return "upcoming";
  if (scheduledAt == null) return "upcoming";
  const ms = typeof scheduledAt === "string" ? Date.parse(scheduledAt) : scheduledAt.getTime();
  if (!Number.isFinite(ms)) return "upcoming";
  return ms >= now.getTime() ? "upcoming" : "past";
}

export function mapAccountBooking(row: AccountSqlRow, now = new Date()): AccountBooking {
  const status = str(row.status) || "pending";
  const when = boardParts(row.scheduled_local);
  const pickup = str(row.pickup_text);
  const dropoff = str(row.dropoff_text);
  const ref = str(row.reference);
  const uiStatus = rowStatus(status);
  const review = reviewOf(status, row.has_review === true, ref);
  return {
    ref,
    href: ref ? `/confirmation/${ref}` : "/account",
    pay_url: null,
    payable: false,
    date: when.date,
    time: when.time,
    dateIso: when.dateIso,
    flightNo: str(row.flight_no),
    contactEmail: str(row.contact_email),
    route: pickup && dropoff ? `${pickup} → ${dropoff}` : pickup || dropoff,
    pickup,
    dropoff,
    vehicle: fleetVehicle(str(row.vehicle_plate), str(row.vehicle_model)),
    chauffeur: str(row.chauffeur_name),
    pax: Number(row.pax ?? 1) || 1,
    priceRappen: Number(row.price_total_rappen ?? 0) || 0,
    status: uiStatus,
    when: whenFor(status, row.scheduled_at, now),
    group: groupLabel(when.dateIso),
    reviewState: review.reviewState,
    reviewHref: review.reviewHref,
  };
}
