// apps/web/lib/geo/serviceArea.ts
//
// QUOTE-07's two-path service-area check and the pre-Mapbox refusals
// (same-place, country box, min-advance). Pure functions: the polygon, the
// fixed-route list and the current instant all arrive as arguments, supplied
// by plan 04-11's handler from plan 04-09's quote_settings_version read.
//
// D-17: named live fixed_routes pair in either order, otherwise both ends
// inside Europe. D-39 used to mean both pins inside the published snapshot
// polygon; the owner gate is now Europe, not that polygon. NYC–Beijing is
// out; London, Chamonix, Malpensa and Zermatt are in.
//
// Negative space: no I/O, no clock, no Mapbox, no database. Point-in-polygon
// is ray-casting here because PostGIS is not installed (Phase 2 ships
// pgcrypto, btree_gist, citext, pgtap) and will not be installed for one
// boolean.

import type { QuoteErrorCode } from "../quote/errors";

/** ~10 m — two pins this close are the same place (QUOTE-07 / I-02). */
export const SAME_COORDINATE_METRES = 10;

/**
 * Generous Switzerland-plus-neighbours box. Bias / leftover — not the
 * service area. Quotes use EUROPE_BOX.
 */
export const COUNTRY_BOX = {
  lngMin: 3.5,
  lngMax: 14.5,
  latMin: 43.0,
  latMax: 49.5,
} as const;

/**
 * Continental Europe plus nearby islands (Iceland, Azores, Canaries, Cyprus).
 * Both pins must sit in this envelope, unless a live named pair matches.
 * North African coast at the same latitudes as Sicily can slip in; NYC and
 * Dubai cannot.
 */
export const EUROPE_BOX = {
  lngMin: -31.5,
  lngMax: 40.0,
  latMin: 27.5,
  latMax: 72.0,
} as const;

/** WGS84 mean radius in metres — haversine, not a spherical-soccer-ball guess. */
const WGS84_MEAN_RADIUS_M = 6_371_008.8;

const ZURICH_TZ = "Europe/Zurich";

export type GeoPoint = { lng: number; lat: number };

export type Position = [number, number];
export type LinearRing = Position[];

export type PolygonGeometry = {
  type: "Polygon";
  coordinates: LinearRing[];
};

export type MultiPolygonGeometry = {
  type: "MultiPolygon";
  coordinates: LinearRing[][];
};

export type ServiceAreaGeoJSON = PolygonGeometry | MultiPolygonGeometry;

/**
 * Polygon the quote checks is the published snapshot field
 * (`rate_versions.service_area_geojson` copied onto settings at Publish).
 */
export function publishedServiceAreaPolygon(
  value: unknown,
): ServiceAreaGeoJSON | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const rec = value as { type?: unknown };
  if (rec.type === "Polygon" || rec.type === "MultiPolygon") {
    return value as ServiceAreaGeoJSON;
  }
  return null;
}

export type FixedRoutePair = {
  origin_zone_id: string;
  dest_zone_id: string;
  live: boolean;
};

export type ServiceAreaInput = {
  origin: GeoPoint & { zoneId?: string | null };
  dest: GeoPoint & { zoneId?: string | null };
  polygon: ServiceAreaGeoJSON | null;
  fixedRoutes: readonly FixedRoutePair[];
};

export type ServiceAreaOk = { ok: true; matched?: "forward" | "reverse" };

export type ServiceAreaFail = {
  ok: false;
  code: Extract<QuoteErrorCode, "service_area_undefined" | "out_of_service_area">;
};

export type ServiceAreaResult = ServiceAreaOk | ServiceAreaFail;

export type MinAdvanceInput = {
  scheduledLocal: string;
  minAdvanceMinutes: number | null;
  nowMs: number;
};

export type MinAdvanceResult =
  | { ok: true }
  | {
      ok: false;
      code: Extract<QuoteErrorCode, "min_advance">;
      params: { minutes: number };
    };

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Mapbox GL / Turf WGS84 sphere metres between two pins. */
export function sphereMetres(a: GeoPoint, b: GeoPoint): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * WGS84_MEAN_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(hav)));
}

export function sameCoordinate(a: GeoPoint, b: GeoPoint): boolean {
  return sphereMetres(a, b) <= SAME_COORDINATE_METRES;
}

export function insideCountryBox(point: GeoPoint): boolean {
  return (
    point.lng >= COUNTRY_BOX.lngMin &&
    point.lng <= COUNTRY_BOX.lngMax &&
    point.lat >= COUNTRY_BOX.latMin &&
    point.lat <= COUNTRY_BOX.latMax
  );
}

export function insideEurope(point: GeoPoint): boolean {
  return (
    point.lng >= EUROPE_BOX.lngMin &&
    point.lng <= EUROPE_BOX.lngMax &&
    point.lat >= EUROPE_BOX.latMin &&
    point.lat <= EUROPE_BOX.latMax
  );
}

function closeRing(ring: LinearRing): LinearRing {
  if (ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return ring;
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

function pointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  const ab2 = (bx - ax) ** 2 + (by - ay) ** 2;
  const eps = 1e-12 * Math.max(1, ab2);
  if (cross * cross > eps) return false;
  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  if (dot < 0) return false;
  return dot <= ab2;
}

type RingHit = "edge" | "in" | "out";

function hitRing(lng: number, lat: number, ring: LinearRing): RingHit {
  const closed = closeRing(ring);
  if (closed.length < 4) return "out";
  let inside = false;
  for (let i = 1; i < closed.length; i += 1) {
    const prev = closed[i - 1];
    const curr = closed[i];
    if (!prev || !curr) continue;
    const [xj, yj] = prev;
    const [xi, yi] = curr;
    if (pointOnSegment(lng, lat, xj, yj, xi, yi)) {
      // On-edge is INSIDE. The choice is arbitrary but must be STABLE — a
      // customer standing on the boundary must not get a different answer
      // on two consecutive requests.
      return "edge";
    }
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside ? "in" : "out";
}

function inPolygon(lng: number, lat: number, rings: LinearRing[]): boolean {
  if (rings.length === 0) return false;
  const outer = rings[0];
  if (!outer) return false;
  const outerHit = hitRing(lng, lat, outer);
  if (outerHit === "edge") return true;
  if (outerHit === "out") return false;
  for (let i = 1; i < rings.length; i += 1) {
    const hole = rings[i];
    if (!hole) continue;
    const holeHit = hitRing(lng, lat, hole);
    if (holeHit === "edge") return true;
    if (holeHit === "in") return false;
  }
  return true;
}

export function pointInPolygon(
  point: GeoPoint,
  geometry: ServiceAreaGeoJSON,
): boolean {
  if (geometry.type === "Polygon") {
    return inPolygon(point.lng, point.lat, geometry.coordinates);
  }
  for (const polygon of geometry.coordinates) {
    if (inPolygon(point.lng, point.lat, polygon)) return true;
  }
  return false;
}

export function checkServiceArea(input: ServiceAreaInput): ServiceAreaResult {
  const originZone = input.origin.zoneId;
  const destZone = input.dest.zoneId;
  if (
    typeof originZone === "string" &&
    originZone.length > 0 &&
    typeof destZone === "string" &&
    destZone.length > 0
  ) {
    // Named-pair path FIRST — this is what keeps Zermatt bookable without a
    // polygon that reaches it (D-17). The polygon is not consulted.
    for (const row of input.fixedRoutes) {
      if (!row.live) continue;
      if (
        row.origin_zone_id === originZone &&
        row.dest_zone_id === destZone
      ) {
        return { ok: true, matched: "forward" };
      }
      if (
        row.origin_zone_id === destZone &&
        row.dest_zone_id === originZone
      ) {
        return { ok: true, matched: "reverse" };
      }
    }
  }

  // Both pins in Europe. One in / one out is out_of_service_area.
  // The published polygon is not the gate — Europe is.
  if (insideEurope(input.origin) && insideEurope(input.dest)) {
    return { ok: true };
  }
  return { ok: false, code: "out_of_service_area" };
}

function tzOffsetMs(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(utcMs))) {
    parts[part.type] = part.value;
  }
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUTC - utcMs;
}

/**
 * D-36: the Europe/Zurich wall clock (`YYYY-MM-DDTHH:MM`, optional `:SS`) as
 * the UTC instant in ms. Two-pass offset lookup gives PostgreSQL's rules: an
 * ambiguous fall-back time prefers standard time, a nonexistent spring-forward
 * time lands one hour later. Min-advance and the stored `scheduled_at` share
 * this one conversion. Null when the text is not a wall clock.
 */
export function zurichLocalToUtcMs(scheduledLocal: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    scheduledLocal,
  );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] ? Number(match[6]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null;
  }
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = utcGuess - tzOffsetMs(utcGuess, ZURICH_TZ);
  utc = utcGuess - tzOffsetMs(utc, ZURICH_TZ);
  return utc;
}

const scheduledLocalToMs = zurichLocalToUtcMs;

export function checkMinAdvance(input: MinAdvanceInput): MinAdvanceResult {
  if (input.minAdvanceMinutes === null) {
    // NULL threshold and "no rule" are the same observable — skip, never
    // default. The engine refuses to invent a number even though ADR-014 §5
    // has since answered one: the number lives on the row, and this module
    // reads the argument it is given (D-41).
    return { ok: true };
  }
  const pickupMs = scheduledLocalToMs(input.scheduledLocal);
  if (pickupMs === null) {
    return {
      ok: false,
      code: "min_advance",
      params: { minutes: input.minAdvanceMinutes },
    };
  }
  // DST: Europe/Zurich spring-forward (last Sunday of March, 02:00 → 03:00).
  // Elapsed minutes are instant-to-instant, not wall-clock subtraction, so a
  // pickup that looks two hours away on the clock but is one hour away in
  // civil time is measured as one hour.
  const deltaMs = pickupMs - input.nowMs;
  const neededMs = input.minAdvanceMinutes * 60_000;
  if (deltaMs < neededMs) {
    return {
      ok: false,
      code: "min_advance",
      params: { minutes: input.minAdvanceMinutes },
    };
  }
  return { ok: true };
}
