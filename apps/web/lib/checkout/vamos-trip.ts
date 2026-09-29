// apps/web/lib/checkout/vamos-trip.ts
//
// Home Continue writes localStorage `vamosTrip` (pickup/dropoff/pax/bags).
// Booking draft uses sessionStorage `vamosTrip` (pickup/destination/passengers).
// Checkout reads both so the trip they typed is not blank (D-29).
// Money is never taken from this object — Stripe charges the lock.
// Display may peek class_totals from the lock payload (unsigned). Never invent.

import { base64urlDecode } from "../crypto/hmac";

export type VamosTripContact = {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
};

export type VamosTrip = {
  pickup?: string;
  dropoff?: string;
  destination?: string;
  date?: string;
  time?: string;
  pax?: number;
  bags?: number;
  passengers?: number;
  luggage?: number;
  vehicle?: string;
  vehicleClass?: string;
  vehicleName?: string;
  quote_id?: string;
  quoteId?: string;
  lock?: string;
  expires_at?: string;
  pickupPlace?: unknown;
  dropoffPlace?: unknown;
  scheduled_local?: string;
  locale?: string;
  display_currency?: string;
  /** Comment 11. Home writes this. Checkout relock must send the same key. */
  fare_kind?: "one_way" | "airport_pickup" | "city_to_city";
  classes?: string[];
  classOffers?: {
    slug: string;
    name?: string;
    photo?: string;
    pax?: number;
    bags?: number;
  }[];
  detailsComplete?: boolean;
  contact?: VamosTripContact;
  guest?: boolean;
  airline?: string;
  notes?: string;
  childSeat?: boolean;
  oversizedLuggage?: boolean;
  skiRack?: boolean;
  extrasOn?: string[];
  meetGreet?: boolean;
  freeWait?: boolean;
  billingKind?: "individual" | "company";
  stops?: number;
  flight?: string;
  flightNumber?: string;
};

const LOCAL_KEY = "vamosTrip";
const LOCK_KEY = "vamosQuoteLock";

function parseTrip(raw: string | null): VamosTrip | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as VamosTrip;
  } catch {
    return null;
  }
}

export function readVamosTrip(): VamosTrip | null {
  if (typeof window === "undefined") return null;
  let trip = parseTrip(window.localStorage.getItem(LOCAL_KEY));
  if (!trip) {
    try {
      trip = parseTrip(window.sessionStorage.getItem(LOCAL_KEY));
    } catch {
      trip = null;
    }
  }
  if (!trip) trip = {};
  try {
    const lock = window.sessionStorage.getItem(LOCK_KEY);
    if (lock && !trip.lock) trip = { ...trip, lock };
  } catch {
    // private mode
  }
  const id = trip.quote_id || trip.quoteId;
  const lock = trip.lock;
  const pickup = trip.pickup || "";
  const dropoff = trip.dropoff || trip.destination || "";
  if (!id && !lock && !pickup && !dropoff) return null;
  return trip;
}

/** New quote_id = new booking flow. Do not carry the last trip's flight number. */
export function mergeVamosTrip(current: VamosTrip, patch: Partial<VamosTrip>): VamosTrip {
  const nextId = patch.quote_id || patch.quoteId;
  const curId = current.quote_id || current.quoteId;
  const quoteChanged = Boolean(nextId && curId && nextId !== curId);
  if (!quoteChanged) return { ...current, ...patch };
  const keepExtras =
    "childSeat" in patch ||
    "oversizedLuggage" in patch ||
    "skiRack" in patch ||
    "stops" in patch;
  const extras = keepExtras
    ? {
        childSeat: Boolean(patch.childSeat),
        oversizedLuggage: Boolean(patch.oversizedLuggage),
        skiRack: Boolean(patch.skiRack),
        stops: typeof patch.stops === "number" ? patch.stops : 0,
      }
    : { childSeat: false, oversizedLuggage: false, skiRack: false, stops: 0 };
  return {
    ...current,
    flight: "",
    flightNumber: "",
    ...patch,
    ...extras,
    detailsComplete: keepExtras ? Boolean(current.detailsComplete || patch.detailsComplete) : false,
    ...(keepExtras
      ? {}
      : { contact: undefined, guest: undefined, airline: "", notes: "" }),
  };
}

export function writeVamosTrip(patch: Partial<VamosTrip>): VamosTrip {
  const current = readVamosTrip() ?? {};
  const next: VamosTrip = mergeVamosTrip(current, patch);
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
  } catch {
    // quota
  }
  try {
    if (next.lock) window.sessionStorage.setItem(LOCK_KEY, next.lock);
    else window.sessionStorage.removeItem(LOCK_KEY);
  } catch {
    // private mode
  }
  return next;
}

export function tripPickup(trip: VamosTrip | null | undefined): string {
  return trip?.pickup ?? "";
}

export function tripDropoff(trip: VamosTrip | null | undefined): string {
  return trip?.dropoff || trip?.destination || "";
}

export function placeText(place: unknown, fallback: string): string {
  if (!place || typeof place !== "object") return fallback;
  const p = place as Record<string, unknown>;
  const text = typeof p.text === "string" ? p.text.trim() : "";
  const sub = typeof p.s === "string" ? p.s.trim() : "";
  if (text && sub && !text.includes(sub)) return `${text}, ${sub}`;
  if (text) return text;
  return fallback;
}

export function tripVehicle(trip: VamosTrip | null | undefined): string {
  return trip?.vehicle || trip?.vehicleClass || "";
}

export function tripQuoteId(trip: VamosTrip | null | undefined): string {
  return trip?.quote_id || trip?.quoteId || "";
}

export function tripPax(trip: VamosTrip | null | undefined): number {
  const n = trip?.pax ?? trip?.passengers;
  return typeof n === "number" && Number.isFinite(n) && n >= 1 ? n : 1;
}

export function tripBags(trip: VamosTrip | null | undefined): number {
  const n = trip?.bags ?? trip?.luggage;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : 0;
}

/**
 * Display-only. Does not verify HMAC. Missing/unreadable lock → null (CHF 000).
 * Never invent a fare.
 */
export function peekLockClassRappen(lock: string | undefined, slug: string): number | null {
  if (!lock || !slug) return null;
  const parts = lock.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = new TextDecoder().decode(base64urlDecode(parts[1]));
    const payload: unknown = JSON.parse(json);
    if (!payload || typeof payload !== "object") return null;
    const totals = (payload as { class_totals?: unknown }).class_totals;
    if (!Array.isArray(totals)) return null;
    for (const row of totals) {
      if (!row || typeof row !== "object") continue;
      const r = row as { slug?: unknown; total_rappen?: unknown };
      if (r.slug !== slug) continue;
      if (typeof r.total_rappen !== "number" || !Number.isFinite(r.total_rappen) || r.total_rappen < 0) {
        return null;
      }
      return r.total_rappen;
    }
    return null;
  } catch {
    return null;
  }
}

export type LockClassTotal = { slug: string; total_rappen: number | null };

/** Display-only. Does not verify HMAC. Never invents a fare. */
export function peekLockClassTotals(lock: string | undefined): LockClassTotal[] {
  if (!lock) return [];
  const parts = lock.split(".");
  if (parts.length !== 3 || !parts[1]) return [];
  try {
    const json = new TextDecoder().decode(base64urlDecode(parts[1]));
    const payload: unknown = JSON.parse(json);
    if (!payload || typeof payload !== "object") return [];
    const totals = (payload as { class_totals?: unknown }).class_totals;
    if (!Array.isArray(totals)) return [];
    const out: LockClassTotal[] = [];
    for (const row of totals) {
      if (!row || typeof row !== "object") continue;
      const slug = (row as { slug?: unknown }).slug;
      if (typeof slug !== "string" || !slug) continue;
      const total = (row as { total_rappen?: unknown }).total_rappen;
      const rappen =
        typeof total === "number" && Number.isFinite(total) && total >= 0 ? total : null;
      out.push({ slug, total_rappen: rappen });
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Preferred slug when that class has a fare, otherwise the first priced class
 * on the lock. Empty when the quote has no fare. Does not invent a price.
 * An idle slug with a null total is skipped.
 */
export function firstPricedLockSlug(lock: string | undefined, preferred: readonly string[]): string {
  const totals = peekLockClassTotals(lock);
  const priced = new Set(
    totals.filter((row) => row.total_rappen != null).map((row) => row.slug),
  );
  for (const slug of preferred) {
    if (slug && priced.has(slug)) return slug;
  }
  for (const row of totals) {
    if (row.total_rappen != null) return row.slug;
  }
  return "";
}

/** Lock rappen → francs for PriceSummary. Null stays the 000 mark. */
export function rappenToFrancs(rappen: number | null): number | null {
  if (rappen == null) return null;
  return rappen / 100;
}

/**
 * The coupon code the lock was priced with, for display and the reload
 * restore only. Display-only. Does not verify HMAC — the server re-derives the
 * coupon from the verified lock at payment (26.1-32, D-11).
 */
export function peekLockCoupon(lock: string | undefined): string | null {
  if (!lock) return null;
  const parts = lock.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = new TextDecoder().decode(base64urlDecode(parts[1]));
    const payload: unknown = JSON.parse(json);
    if (!payload || typeof payload !== "object") return null;
    const coupon = (payload as { coupon?: unknown }).coupon;
    return typeof coupon === "string" && coupon.trim() ? coupon : null;
  } catch {
    return null;
  }
}

export function peekLockExtras(lock: string | undefined): {
  child_seats?: number | null;
  extra_stops?: number | null;
  oversized_luggage?: boolean | null;
} | null {
  if (!lock) return null;
  const parts = lock.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = new TextDecoder().decode(base64urlDecode(parts[1]));
    const payload: unknown = JSON.parse(json);
    if (!payload || typeof payload !== "object") return null;
    const extras = (payload as { extras?: unknown }).extras;
    if (!extras || typeof extras !== "object") return null;
    const row = extras as {
      child_seats?: unknown;
      extra_stops?: unknown;
      oversized_luggage?: unknown;
    };
    return {
      child_seats: typeof row.child_seats === "number" ? row.child_seats : null,
      extra_stops: typeof row.extra_stops === "number" ? row.extra_stops : null,
      oversized_luggage: typeof row.oversized_luggage === "boolean" ? row.oversized_luggage : null,
    };
  } catch {
    return null;
  }
}

export function peekLockDistanceM(lock: string | undefined): number | null {
  if (!lock) return null;
  const parts = lock.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = new TextDecoder().decode(base64urlDecode(parts[1]));
    const payload: unknown = JSON.parse(json);
    if (!payload || typeof payload !== "object") return null;
    const legs = (payload as { legs?: unknown }).legs;
    if (!Array.isArray(legs) || !legs[0] || typeof legs[0] !== "object") return null;
    const metres = (legs[0] as { distance_m?: unknown }).distance_m;
    if (typeof metres !== "number" || !Number.isFinite(metres) || metres <= 0) return null;
    return Math.trunc(metres);
  } catch {
    return null;
  }
}

export function formatDistanceKm(metres: number): string {
  const km = metres / 1000;
  if (km < 10) {
    const one = Math.round(km * 10) / 10;
    return Number.isInteger(one) ? String(one) : one.toFixed(1);
  }
  return String(Math.round(km));
}

export function geoLocale(locale: string): "en" | "de" | "fr" | "ar" {
  if (locale === "de" || locale === "fr" || locale === "ar") return locale;
  return "en";
}

export function placeMapboxId(place: unknown): string {
  if (!place || typeof place !== "object") return "";
  const id = (place as { mapbox_id?: unknown }).mapbox_id;
  return typeof id === "string" ? id : "";
}

export function formatRailDate(iso: string, locale: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
      .format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
      .replace(/,/g, "");
  } catch {
    return iso;
  }
}

/**
 * After a payment went through: drop the local trip draft, its quote lock and the
 * stored payment session. Without this the account page showed the paid trip as a
 * leftover "waiting payment" card. Storage can throw in private windows.
 */
export function clearPaidTripDraft(): void {
  if (typeof window === "undefined") return;
  for (const key of ["vamosTrip", "vamosQuoteLock", "vamosCheckoutSession"]) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* storage blocked */
    }
    try {
      window.sessionStorage.removeItem(key);
    } catch {
      /* storage blocked */
    }
  }
}
