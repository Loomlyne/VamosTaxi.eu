// apps/web/lib/quote/lock.ts
//
// QUOTE-04 lock token: mint / verify / dual-secret rotation (D-24, D-27, D-28).
// The lock (D-20 / D-31 remainder) is a server-signed HMAC-SHA256 pin of
// inputs and version ids — not a KV document (60 s cross-PoP lag is wrong for
// a gate) and not a price_snapshots row (D-21 forbids the quote-time write).
// Quote lock length is hardcoded 24 hours = 1440 minutes at Publish (Phase 18 D-13).
// There is no hours field on /pricing. Postgres quote_lock_deadline() bakes
// quote_lock_minutes from the live row at lock time — never created_at + 24 hours,
// never the new book's hours after a later Publish.
//
// Three pieces of negative space:
//  1. This module never authors a deadline — `exp` arrives from Postgres via
//     quote_lock_deadline() (plan 04-06). No wall-clock API lives in this file.
//  2. It never decides an HTTP response code — reason "invalid" maps to
//     quote_not_found and reason "expired" maps to quote_expired in plan 04-11;
//     both are opaque to the customer.
//  3. It is not the enforcement point — the authoritative refusal is Postgres
//     now() inside the snapshot-write transaction and tg_payment_matches_snapshot
//     reading quote_lock_expires_at (plan 04-05).
//
// The Worker-side check and the UI countdown are decorative, and any copy or
// comment implying otherwise is wrong.
//
// Token: kid + "." + base64url(canonicalJson(payload)) + "." + base64url(mac)
// MAC over the base64url payload segment (never re-canonicalise attacker JSON).

import {
  base64urlDecode,
  base64urlEncode,
  canonicalJson,
  signHmac,
  verifyHmac,
} from "../crypto/hmac";
import type { CurrencyCode } from "../currency";

/** Current key id stamped on every newly minted lock (D-28). */
export const LOCK_KID_CURRENT = "v1";

/** Previous key id accepted only while QUOTE_LOCK_SECRET_PREVIOUS is bound. */
export const LOCK_KID_PREVIOUS = "v0";

/** Hardcoded quote lock (D-13). 24 hours. Not a /pricing field. */
export const QUOTE_LOCK_MINUTES = 1440;

/**
 * Place pin on a lock leg. Coordinates are numbers the engine already resolved;
 * text is the display string shown to the customer.
 */
export interface LockPlace {
  lng: number;
  lat: number;
  text: string;
  place_id?: string;
}

/**
 * One leg inside the lock pin. `flight_no` / `landing_source` ride here (D-20)
 * so Phase 7 intent can refuse a disagreeing body and Phase 9 can shift a delayed
 * flight it actually stored.
 */
export interface QuoteLockLeg {
  leg_seq: 1 | 2;
  pickup: LockPlace;
  dropoff: LockPlace;
  scheduled_local: string;
  distance_m: number;
  duration_s: number;
  origin_zone_id: string | null;
  dest_zone_id: string | null;
  /** Comment 18. Optional so locks minted before canton was pinned still verify. */
  origin_canton?: string | null;
  dest_canton?: string | null;
  /**
   * 26.1-09: Mapbox context.place.mapbox_id — language-independent city identity
   * for D-09 pair matching. Optional so locks minted before this field still verify.
   */
  origin_city_id?: string | null;
  dest_city_id?: string | null;
  /**
   * 26.1-11: Mapbox context.place.name at quote time — display only (the pair
   * row label). Optional so older locks still verify; missing means the row
   * reads the plain "Route price" label.
   */
  origin_city_name?: string | null;
  dest_city_name?: string | null;
  /**
   * 26.1-09/D-08b: true when the pickup resolved to a Mapbox airport place.
   * Optional so locks minted before this field still verify (undefined prices
   * as not-an-airport, never a guess in the other direction).
   */
  origin_is_airport?: boolean;
  /**
   * Legacy, before 26.2-p4 D: an old lock carries an empty stop list here.
   * There is no stop on the way; nothing writes this any more. verifyLock
   * refuses a lock whose list is not empty and drops the empty one.
   */
  waypoints?: [];
  flight_no: string | null;
  landing_source: string | null;
}

/**
 * Extras pin (D-27). Quantity-only. No stop on the way (26.2-p4 D): a lock
 * minted before that may still name `extra_stops` / `waypoints` here;
 * verifyLock accepts it only with no stop in them and drops both.
 */
export interface QuoteLockExtras {
  child_seats?: 0 | 1;
  oversized_luggage?: boolean;
}

/**
 * QuoteLockPayload field names locked by 04-CONTEXT.md specifics.
 *
 * D-27: `extras` and `coupon` are pinned so a reprice re-signs `class_totals`
 * and those fields while keeping `quote_id` and `exp` when metres are unchanged.
 * Comparing a stale pre-coupon board is how a legitimate code produces a
 * price_changed refusal on the happy path.
 *
 * Mode / class slug unions match plan 04-02's VehicleClassSlug / QuoteMode
 * (this branch depends on 04-01 only — types live here until 04-02 merges).
 */
export interface QuoteLockPayload {
  v: 1;
  quote_id: string;
  /** Postgres-authored ISO timestamptz — never a Worker wall-clock call. */
  exp: string;
  engine_version: string;
  rate_version_id: number | null;
  settings_version_id: number;
  computed_at: string;
  display_currency: CurrencyCode;
  mode: "one_way" | "return";
  /**
   * Comment 11. Optional so locks minted before this field still verify.
   * Missing means one way. Present must be one of the three formula keys.
   */
  fare_kind?: "one_way" | "airport_pickup" | "city_to_city";
  pax: number;
  bags: number;
  legs: QuoteLockLeg[];
  extras: QuoteLockExtras | null;
  coupon: string | null;
  class_totals: Array<{ slug: string; total_rappen: number | null }>;
  /**
   * 26.1-11 / UI-SPEC §8: per class, the airport pickup fee and matched route
   * pair lines so checkout shows them as their own rows. Display only — never
   * read by intent, pay-link or the booking RPC. Omitted when no class has one.
   */
  price_rows?: Array<{ slug: string; lines: LockPriceRow[] }>;
}

/** 26.1-11: one display row pinned on the lock (airport fee or route pair). */
export interface LockPriceRow {
  code: "airport_fee" | "fixed_route";
  leg_seq: number;
  amount_rappen: number | null;
  params?: { origin: string; destination: string };
}

export interface LockSecrets {
  current: string;
  previous?: string;
}

export type VerifyLockResult =
  | { ok: true; payload: QuoteLockPayload; rotated?: true }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "expired"; payload: QuoteLockPayload };

/** One failure object for every public HMAC failure — oracle-free (D-28). */
const INVALID: { ok: false; reason: "invalid" } = { ok: false, reason: "invalid" };

/**
 * Mint a lock token. `payload.exp` is required at the type level — there is no
 * default and no clock in this module.
 */
export async function mintLock(
  secrets: LockSecrets,
  payload: QuoteLockPayload,
): Promise<string> {
  const payloadB64 = base64urlEncode(
    new TextEncoder().encode(canonicalJson(payload)),
  );
  const mac = await signHmac(secrets.current, payloadB64);
  return `${LOCK_KID_CURRENT}.${payloadB64}.${mac}`;
}

/**
 * Verify a lock token.
 *
 * `nowIso` is injected by the caller (decorative Worker check). Comparison is
 * string lexicographic on ISO-8601 Z timestamps — same order as timestamptz.
 * Every malformed / bad-MAC / unknown-kid path returns the same INVALID object
 * so an attacker cannot distinguish "unknown kid" from "bad MAC" (D-28).
 */
export async function verifyLock(
  secrets: LockSecrets,
  token: string,
  nowIso: string,
): Promise<VerifyLockResult> {
  // Collapse every failure into one shape before returning: build the failure
  // object once (INVALID) and return that same object from every failing branch.
  // An attacker who can distinguish "unknown kid" from "bad MAC" learns whether
  // a rotation is in progress.
  if (typeof token !== "string" || token.length === 0) {
    return INVALID;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return INVALID;
  }

  const [kid, payloadB64, mac] = parts as [string, string, string];
  if (!kid || !payloadB64 || !mac) {
    return INVALID;
  }

  let secret: string | undefined;
  let rotated = false;
  if (kid === LOCK_KID_CURRENT) {
    secret = secrets.current;
  } else if (kid === LOCK_KID_PREVIOUS) {
    if (!secrets.previous) {
      // Rotation window closed — not a special case, just invalid.
      return INVALID;
    }
    secret = secrets.previous;
    rotated = true;
  } else {
    return INVALID;
  }

  const macOk = await verifyHmac(secret, payloadB64, mac);
  if (!macOk) {
    return INVALID;
  }

  let payload: QuoteLockPayload;
  try {
    const jsonBytes = base64urlDecode(payloadB64);
    const json = new TextDecoder().decode(jsonBytes);
    payload = JSON.parse(json) as QuoteLockPayload;
  } catch {
    // Valid base64url that is not JSON, or truncated JSON — same INVALID.
    return INVALID;
  }

  if (!isQuoteLockPayload(payload)) {
    return INVALID;
  }

  const withoutStops = withoutLegacyStopFields(payload);
  if (!withoutStops) {
    return INVALID;
  }
  payload = withoutStops;

  // Decorative Worker check against the injected clock — authoritative expiry
  // is Postgres now() at checkout (plan 04-05 / 04-06).
  if (payload.exp <= nowIso) {
    return { ok: false, reason: "expired", payload };
  }

  if (rotated) {
    // `rotated: true` is ops-only log material; never a customer-facing field.
    return { ok: true, payload, rotated: true };
  }
  return { ok: true, payload };
}

function isEmptyList(value: unknown): boolean {
  return Array.isArray(value) && value.length === 0;
}

/**
 * 26.2-p4 D: there is no stop on the way. A lock minted before that change
 * carries the old stop fields: an empty `waypoints` list on every leg and,
 * when the request sent extras, `extra_stops` / `waypoints` inside `extras`.
 * Such a lock stays valid for as long as it lives (its own `exp`, or a
 * pay-link hold) when it carries NO stop: the empty fields are dropped here,
 * so nothing after verifyLock ever reads them. A lock that carries a stop is
 * refused (null → INVALID); nothing can honour a stop any more.
 * Runs after the MAC check on the original segment, so the signed bytes, the
 * secret and the algorithm are untouched. Removable in a later cleanup once
 * no lock minted before the ship can still be presented.
 */
function withoutLegacyStopFields(payload: QuoteLockPayload): QuoteLockPayload | null {
  const legs: QuoteLockLeg[] = [];
  for (const leg of payload.legs as unknown[]) {
    if (leg === null || typeof leg !== "object" || Array.isArray(leg) || !("waypoints" in leg)) {
      legs.push(leg as QuoteLockLeg);
      continue;
    }
    const rec: Record<string, unknown> = { ...(leg as Record<string, unknown>) };
    if (!isEmptyList(rec.waypoints)) return null;
    delete rec.waypoints;
    legs.push(rec as unknown as QuoteLockLeg);
  }

  let extras: QuoteLockExtras | null = payload.extras;
  if (extras !== null && typeof extras === "object" && !Array.isArray(extras)) {
    const rec: Record<string, unknown> = { ...(extras as Record<string, unknown>) };
    if ("extra_stops" in rec) {
      if (rec.extra_stops !== 0) return null;
      delete rec.extra_stops;
    }
    if ("waypoints" in rec) {
      if (!isEmptyList(rec.waypoints)) return null;
      delete rec.waypoints;
    }
    extras = rec as QuoteLockExtras;
  }

  return { ...payload, legs, extras };
}

/** Structural guard so a signed but empty/wrong-shape object is still invalid. */
function isQuoteLockPayload(value: unknown): value is QuoteLockPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const p = value as Record<string, unknown>;
  return (
    p.v === 1 &&
    typeof p.quote_id === "string" &&
    typeof p.exp === "string" &&
    typeof p.engine_version === "string" &&
    typeof p.settings_version_id === "number" &&
    typeof p.computed_at === "string" &&
    typeof p.mode === "string" &&
    (p.fare_kind === undefined ||
      p.fare_kind === "one_way" ||
      p.fare_kind === "airport_pickup" ||
      p.fare_kind === "city_to_city") &&
    typeof p.pax === "number" &&
    typeof p.bags === "number" &&
    Array.isArray(p.legs) &&
    Array.isArray(p.class_totals)
  );
}
