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
  chauffeur_name?: string | null;
  vehicle_plate?: string | null;
  vehicle_model?: string | null;
  has_review?: boolean | null;
  is_test?: boolean | null;
};

export type AccountBooking = {
  ref: string;
  href: string;
  date: string;
  time: string;
  route: string;
  pickup: string;
  dropoff: string;
  vehicle: string;
  chauffeur: string;
  pax: number;
  priceRappen: number;
  status: "unpaid" | "new" | "confirmed" | "assigned" | "completed" | "cancelled";
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

function rowStatus(status: string): AccountBooking["status"] {
  const s = status.toLowerCase();
  if (s === "pending") return "unpaid";
  if (s === "cancelled" || s === "refunded" || s === "no_show") return "cancelled";
  if (s === "completed" || s === "partially_completed") return "completed";
  if (s === "assigned") return "assigned";
  if (s === "confirmed" || s === "paid") return "confirmed";
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
  const isTest = row.is_test === true;
  const unpaid = uiStatus === "unpaid";
  return {
    ref,
    href: unpaid
      ? isTest
        ? ref
          ? `/confirmation/${ref}`
          : "/account"
        : "/checkout/payment"
      : ref
        ? `/confirmation/${ref}`
        : "/account",
    pay_url: unpaid && !isTest ? "/checkout/payment" : null,
    payable: unpaid && !isTest,
    date: when.date,
    time: when.time,
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
