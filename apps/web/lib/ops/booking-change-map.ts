// apps/web/lib/ops/booking-change-map.ts
//
// 26.2 P1: pure rules and mappings of a change on a PAID trip (the admin's class change). No
// identity, no Hyperdrive. The database (booking_staff_change, migration 20261007140000) checks
// the same rules again inside the write.
// 26.2 P6: the trip part of the same body (places from the address search, date and time,
// passengers, bags, the signed trip facts, the driver choice) and its refusals; the database
// (booking_staff_trip_change, migration 20261007150000) checks them again.

import { zurichLocalToUtcMs } from "../geo/serviceArea";
import { sqlErrorCode } from "./refund-map";
import { OPS_SQLSTATE } from "./sqlstate";

/** Every named refusal a change can answer. The dashboard has a sentence for each. */
export const CHANGE_FAIL_CODES = [
  "not-found",
  "invalid-body",
  "unpaid",
  "not-editable",
  "too-late",
  "refund-open",
  "customer-request-waiting",
  "unknown-class",
  "same-class",
  "class-too-small",
  "class-not-sold",
  "trip-data",
  "pricing-not-live",
  "price-book-changed",
  "price-changed",
  "paid-changed",
  "must-fix",
  "stripe-test-only",
  "stripe-failed",
  // 26.2 P1 Withdraw (owner sign-off 2026-10-01)
  "nothing-waiting",
  "already-paid",
  // 26.2 P6 (place, time and party changes)
  "past-time",
  "place-not-served",
  "same-place",
  "no-route",
  "no-change",
  "invalid-change",
  "flight-needed",
  "lock-invalid",
  "driver-choice-needed",
  "driver-overlap",
  "temporarily-unavailable",
  "unknown",
] as const;

export type ChangeFailCode = (typeof CHANGE_FAIL_CODES)[number];
/** A refusal; `field` names the Edit field it belongs under (P6: pickup, dropoff, when). */
export type ChangeFail = { ok: false; code: ChangeFailCode; field?: "pickup" | "dropoff" | "when" };

/** Booking states a class can still change in (paid, not yet driven, not cancelled). */
const EDITABLE_STATUSES: readonly string[] = Object.freeze(["paid", "confirmed", "assigned"]);

export type ChangeRuleFacts = {
  /** A captured payment exists. */
  paid: boolean;
  /** bookings.status */
  status: string;
  /** bookings.refund_status */
  refundStatus: string;
  /** Earliest leg pickup instant (ms), null when unknown. */
  pickupAtMs: number | null;
  /** A customer's own change request waits on the booking. */
  customerRequestWaiting: boolean;
};

/**
 * Plan rules (signed 2026-09-30): no change on an unpaid booking (cancel and make a new trip);
 * only until the pickup time (D8; the Settings deadline binds customers only); not while a refund
 * is being sent; not while a customer's own request waits (it would be replaced without a word).
 */
export function changeRefusal(facts: ChangeRuleFacts, nowMs: number): ChangeFailCode | null {
  if (!facts.paid) return "unpaid";
  if (!EDITABLE_STATUSES.includes(facts.status)) return "not-editable";
  if (facts.pickupAtMs == null || !Number.isFinite(facts.pickupAtMs) || facts.pickupAtMs <= nowMs) return "too-late";
  if (facts.refundStatus === "processing" || facts.refundStatus === "failed") return "refund-open";
  if (facts.customerRequestWaiting) return "customer-request-waiting";
  return null;
}

const SQL_REFUSALS: readonly ChangeFailCode[] = Object.freeze([
  "not-found",
  "unpaid",
  "not-editable",
  "too-late",
  "refund-open",
  "customer-request-waiting",
  "unknown-class",
  "same-class",
  "class-too-small",
  "price-book-changed",
  "paid-changed",
  "nothing-waiting",
  "already-paid",
  // 26.2 P6 (booking_staff_trip_change)
  "past-time",
  "no-change",
  "invalid-change",
  "driver-choice-needed",
  "driver-overlap",
]);

function messageOf(err: unknown): string {
  if (typeof err !== "object" || err === null || !("message" in err)) return "";
  const message = (err as { message: unknown }).message;
  return typeof message === "string" ? message : "";
}

/** A refusal raised by booking_staff_change (mapped AROUND asSystem: begin() rethrows). */
export function mapChangeSqlError(err: unknown): ChangeFail {
  const message = messageOf(err);
  for (const name of SQL_REFUSALS) {
    if (message === name || message.startsWith(`${name}\n`) || message.startsWith(`${name} `)) {
      return { ok: false, code: name };
    }
  }
  if (message === "capacity") return { ok: false, code: "must-fix" };
  const code = sqlErrorCode(err);
  if (code === OPS_SQLSTATE.noData) return { ok: false, code: "not-found" };
  if (code === OPS_SQLSTATE.exclusion) return { ok: false, code: "must-fix" };
  return { ok: false, code: "unknown" };
}

export function changeFailStatus(code: ChangeFailCode): number {
  if (code === "not-found") return 404;
  if (code === "stripe-failed" || code === "stripe-test-only") return 502;
  if (code === "temporarily-unavailable") return 503;
  if (code === "invalid-body" || code === "unknown") return 400;
  return 409;
}

export type ChangeBody = {
  /** Target class slug, as the preview listed it. */
  klass: string | null;
  /** The new total the admin was shown (confirm only). */
  expectTotalRappen: number | null;
  /** The "paid so far" the admin was shown (confirm only). */
  expectPaidRappen: number | null;
};

const BODY_KEYS: readonly string[] = Object.freeze(["klass", "expectTotalRappen", "expectPaidRappen"]);

function rappenOrNull(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
  return undefined;
}

/**
 * The browser sends a class slug and the two figures it showed, nothing else: no amount is ever
 * taken from it, and no changed field (place, time, name) is copied from it at confirm.
 */
export function parseChangeBody(raw: unknown): { ok: true; value: ChangeBody } | { ok: false; code: "invalid-body" } {
  if (raw === undefined || raw === null) return { ok: true, value: { klass: null, expectTotalRappen: null, expectPaidRappen: null } };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, code: "invalid-body" };
  const rec = raw as Record<string, unknown>;
  for (const key of Object.keys(rec)) if (!BODY_KEYS.includes(key)) return { ok: false, code: "invalid-body" };
  let klass: string | null = null;
  if (rec.klass !== undefined && rec.klass !== null) {
    if (typeof rec.klass !== "string") return { ok: false, code: "invalid-body" };
    const slug = rec.klass.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return { ok: false, code: "invalid-body" };
    klass = slug;
  }
  const total = rappenOrNull(rec.expectTotalRappen);
  const paid = rappenOrNull(rec.expectPaidRappen);
  if (total === undefined || paid === undefined) return { ok: false, code: "invalid-body" };
  return { ok: true, value: { klass, expectTotalRappen: total, expectPaidRappen: paid } };
}

// ---------------------------------------------------------------------------
// 26.2 P6: the trip part of a change
// ---------------------------------------------------------------------------

/** A place picked from the address search, as the quote reads it (never typed text, never coordinates). */
export type PlacePick = { kind: "retrieve"; mapbox_id: string; session_token: string; text: string };

/** What the owner changed in the trip, only the fields that changed (null = as booked). */
export type TripChangeInput = {
  pickup: PlacePick | null;
  dropoff: PlacePick | null;
  /** Europe/Zurich wall clock "YYYY-MM-DDTHH:MM" (date and time travel together). */
  scheduledLocal: string | null;
  pax: number | null;
  bags: number | null;
  /** The signed trip facts of the preview (confirm only): no second Mapbox call, nothing from the browser. */
  lock: string | null;
  /** The owner's answer to a clash with another trip of the assigned driver (D7). */
  driver: "keep" | "unassign" | null;
};

export type ChangeRequest = ChangeBody & { trip: TripChangeInput | null };

const TRIP_KEYS: readonly string[] = Object.freeze(["pickup", "dropoff", "dateIso", "time", "pax", "bags", "lock", "driver"]);
const PLACE_KEYS: readonly string[] = Object.freeze(["kind", "mapbox_id", "session_token", "text"]);

function placePick(value: unknown): PlacePick | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const rec = value as Record<string, unknown>;
  for (const key of Object.keys(rec)) if (!PLACE_KEYS.includes(key)) return undefined;
  if (rec.kind !== "retrieve") return undefined;
  const id = typeof rec.mapbox_id === "string" ? rec.mapbox_id.trim() : "";
  const token = typeof rec.session_token === "string" ? rec.session_token.trim() : "";
  const text = typeof rec.text === "string" ? rec.text.trim() : "";
  if (!id || id.length > 256 || !token || token.length > 128 || text.length < 2 || text.length > 200) return undefined;
  return { kind: "retrieve", mapbox_id: id, session_token: token, text };
}

function intIn(value: unknown, min: number, max: number): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) return undefined;
  return value;
}

/** A Europe/Zurich wall clock from the Edit's date and time, or undefined when either is malformed. */
function wallClock(dateIso: unknown, time: unknown): string | null | undefined {
  if ((dateIso === undefined || dateIso === null) && (time === undefined || time === null)) return null;
  if (typeof dateIso !== "string" || typeof time !== "string") return undefined;
  const d = dateIso.trim();
  const t = time.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return undefined;
  const local = `${d}T${t}`;
  return zurichLocalToUtcMs(local) == null ? undefined : local;
}

/**
 * The whole change body: P1's class part (parseChangeBody) and P6's trip part. The browser sends
 * what the owner changed and the two figures he was shown; never an amount, coordinates, a
 * distance or a typed place. A body with no trip key is P1's class change, unchanged.
 */
export function parseChangeRequest(raw: unknown): { ok: true; value: ChangeRequest } | { ok: false; code: "invalid-body" } {
  if (raw === undefined || raw === null) return { ok: true, value: { klass: null, expectTotalRappen: null, expectPaidRappen: null, trip: null } };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, code: "invalid-body" };
  const rec = raw as Record<string, unknown>;
  const classPart: Record<string, unknown> = {};
  const tripPart: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rec)) {
    if (TRIP_KEYS.includes(key)) tripPart[key] = value;
    else classPart[key] = value;
  }
  const cls = parseChangeBody(classPart);
  if (!cls.ok) return cls;
  if (Object.keys(tripPart).length === 0) return { ok: true, value: { ...cls.value, trip: null } };

  const pickup = placePick(tripPart.pickup);
  const dropoff = placePick(tripPart.dropoff);
  const scheduledLocal = wallClock(tripPart.dateIso, tripPart.time);
  const pax = intIn(tripPart.pax, 1, 16);
  const bags = intIn(tripPart.bags, 0, 16);
  let lock: string | null = null;
  if (tripPart.lock !== undefined && tripPart.lock !== null) {
    if (typeof tripPart.lock !== "string" || !tripPart.lock.trim() || tripPart.lock.length > 8192) return { ok: false, code: "invalid-body" };
    lock = tripPart.lock.trim();
  }
  let driver: TripChangeInput["driver"] = null;
  if (tripPart.driver !== undefined && tripPart.driver !== null) {
    if (tripPart.driver !== "keep" && tripPart.driver !== "unassign") return { ok: false, code: "invalid-body" };
    driver = tripPart.driver;
  }
  if (pickup === undefined || dropoff === undefined || scheduledLocal === undefined || pax === undefined || bags === undefined) {
    return { ok: false, code: "invalid-body" };
  }
  return { ok: true, value: { ...cls.value, trip: { pickup, dropoff, scheduledLocal, pax, bags, lock, driver } } };
}

/** The trip as edited, against the trip as booked. */
export type TripTarget = {
  ok: true;
  scheduledLocal: string;
  pax: number;
  bags: number;
  placesChanged: boolean;
  timeChanged: boolean;
  partyChanged: boolean;
};

/**
 * What really changes (a value equal to the booking's is no change), and a time that has passed
 * refused under the time field. Staff may change until the pickup time (P1 D8); the customer's
 * minimum-advance rule does not bind the owner.
 */
export function tripTarget(
  leg: { scheduledLocal: string; pax: number; bags: number },
  trip: TripChangeInput,
  nowMs: number,
): TripTarget | ChangeFail {
  const booked = leg.scheduledLocal.slice(0, 16);
  const scheduledLocal = trip.scheduledLocal ?? booked;
  const timeChanged = trip.scheduledLocal != null && trip.scheduledLocal !== booked;
  if (timeChanged) {
    const at = zurichLocalToUtcMs(scheduledLocal);
    if (at == null || at <= nowMs) return { ok: false, code: "past-time", field: "when" };
  }
  const pax = trip.pax ?? leg.pax;
  const bags = trip.bags ?? leg.bags;
  return {
    ok: true,
    scheduledLocal,
    pax,
    bags,
    placesChanged: trip.pickup != null || trip.dropoff != null,
    timeChanged,
    partyChanged: pax !== leg.pax || bags !== leg.bags,
  };
}
