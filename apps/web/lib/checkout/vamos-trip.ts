// apps/web/lib/checkout/vamos-trip.ts
//
// Home Continue writes localStorage `vamosTrip` (pickup/dropoff/pax/bags).
// Booking draft uses sessionStorage `vamosTrip` (pickup/destination/passengers).
// Checkout reads both so the trip they typed is not blank (D-29).
// Money is never taken from this object — Stripe charges the lock.

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
  classes?: string[];
  detailsComplete?: boolean;
  contact?: VamosTripContact;
  guest?: boolean;
  airline?: string;
  notes?: string;
  childSeat?: boolean;
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

export function writeVamosTrip(patch: Partial<VamosTrip>): VamosTrip {
  const current = readVamosTrip() ?? {};
  const next: VamosTrip = { ...current, ...patch };
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

export function tripVehicle(trip: VamosTrip | null | undefined): string {
  return trip?.vehicle || trip?.vehicleClass || "economy";
}

export function tripQuoteId(trip: VamosTrip | null | undefined): string {
  return trip?.quote_id || trip?.quoteId || "";
}
