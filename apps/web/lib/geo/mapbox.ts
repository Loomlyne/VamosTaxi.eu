// apps/web/lib/geo/mapbox.ts
//
// The only module that holds MAPBOX_TOKEN. Search Box suggest + retrieve,
// Geocoding v6 reverse, Directions v5 driving, and Tilequery (snap a pin
// onto a valley road when driving returns NoRoute). Degraded shapes let
// the widget keep working before the owner has an account (D-47).
//
// D-14 / Product Terms §1.9 / §2.7.2 / §2.10.1 (PDF 21 July 2026): this
// module writes nothing to KV, builds no Response, decides no HTTP status,
// and knows nothing about the service area. Kilometres are Mapbox: driving
// metres when a road exists, otherwise WGS84 metres between the same pins
// (Mapbox GL / Turf sphere — not a guessed taxi km). GEO_CACHE is not
// consulted. The one legal KV use lives in session.ts, not here.
//
// D-15: language= on suggest, retrieve, and reverse. D-16: profile driving,
// never Matrix, never driving-traffic. D-51: no permanent parameter on any
// call — the persist path is Phase 7's checkout-time Geocoding v6 call.
//
// fetch is injected and defaults to globalThis.fetch so every case runs with
// no network: a geo client that can only be tested against a paid account is
// a geo client that stops being tested.

import { withRequestContext } from "../logger";
import type { QuoteErrorCode } from "../quote/errors";
import { sphereMetres } from "./serviceArea";

export const MAPBOX_FETCH_TIMEOUT_MS = 8_000;

/** Search Box typeahead. Two characters is enough for IATA prefixes and postcodes. */
export const MIN_SUGGEST_Q = 2;

/** Zurich HB. Bias only — QUOTE-07 / serviceArea.ts is the gate. */
const DEFAULT_PROXIMITY = "8.5417,47.3769";

const SEARCHBOX_SUGGEST = "https://api.mapbox.com/search/searchbox/v1/suggest";
const SEARCHBOX_RETRIEVE = "https://api.mapbox.com/search/searchbox/v1/retrieve";
const GEOCODE_REVERSE = "https://api.mapbox.com/search/geocode/v6/reverse";
const DIRECTIONS_DRIVING = "https://api.mapbox.com/directions/v5/mapbox/driving";
const TILEQUERY =
  "https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/tilequery";

const MAJOR_ROAD = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
  "primary",
  "primary_link",
  "secondary",
  "secondary_link",
  "tertiary",
  "tertiary_link",
]);

const SKIP_ROAD = new Set([
  "path",
  "footway",
  "steps",
  "pedestrian",
  "cycleway",
  "bridleway",
  "piste",
  "ferry",
  "aerialway",
  "track",
  "crossing",
  "sidewalk",
]);

/** Car-free towns sit on a local graph. The valley road is kilometres out. */
const LOCAL_ISLAND_M = 2_500;
const TILEQUERY_RADIUS_M = 25_000;
const SNAP_NUDGE_M = 8_000;

export type GeoLanguage = "en" | "de" | "fr" | "ar";

export type GeoPoint = { lng: number; lat: number };

export type MapboxEnv = { MAPBOX_TOKEN?: string };

export type MapboxDeps = {
  fetch?: typeof globalThis.fetch;
};

export type SuggestInput = {
  q: string;
  sessionToken: string;
  language: GeoLanguage;
  proximity?: GeoPoint;
};

export type SuggestHit = {
  mapbox_id: string;
  name: string;
  address: string;
  context: string;
};

export type SuggestResult = {
  suggestions: SuggestHit[];
  degraded?: true;
};

export type RetrieveInput = {
  mapboxId: string;
  sessionToken: string;
  language: GeoLanguage;
};

export type RetrievedPlace = {
  mapbox_id: string;
  name: string;
  address: string;
  lng: number;
  lat: number;
  /** D-20: Mapbox region code (ZH). Matching only — not a suggest fence. */
  canton: string | null;
};

export type RetrieveResult = { place: RetrievedPlace | null };

export type ReverseInput = {
  lng: number;
  lat: number;
  language: GeoLanguage;
};

export type ReversePlace = {
  name: string;
  address: string;
  lng: number;
  lat: number;
};

export type ReverseResult = { place: ReversePlace | null };

export type RouteLegInput = {
  origin: GeoPoint;
  destination: GeoPoint;
  waypoints?: GeoPoint[];
};

export type RouteLeg = {
  leg_seq: 1 | 2;
  distance_m: number;
  duration_s: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  /** False when metres are Mapbox sphere (no driving line), not a road. */
  road?: boolean;
};

export type RouteResult =
  | { ok: true; legs: RouteLeg[] }
  | { ok: false; code: Extract<QuoteErrorCode, "route_unavailable"> };

type Emit = ReturnType<typeof withRequestContext>;

function tokenOf(env: MapboxEnv): string | undefined {
  const token = env.MAPBOX_TOKEN;
  return typeof token === "string" && token.length > 0 ? token : undefined;
}

function emitFor(route: string, locale: string | null): Emit {
  return withRequestContext({
    requestId: crypto.randomUUID(),
    route,
    locale,
  });
}

function proximityParam(point: GeoPoint | undefined): string {
  if (!point) return DEFAULT_PROXIMITY;
  return `${point.lng},${point.lat}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function textField(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

function suggestionContext(raw: Record<string, unknown>): string {
  const formatted = textField(raw, "place_formatted");
  if (formatted) return formatted;
  const ctx = asRecord(raw.context);
  if (!ctx) return "";
  const place = asRecord(ctx.place);
  const country = asRecord(ctx.country);
  const parts = [
    typeof place?.name === "string" ? place.name : "",
    typeof country?.name === "string" ? country.name : "",
  ].filter((p) => p.length > 0);
  return parts.join(", ");
}

function mapSuggestion(raw: unknown): SuggestHit | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const mapboxId = rec.mapbox_id;
  if (typeof mapboxId !== "string" || mapboxId.length === 0) return null;
  return {
    mapbox_id: mapboxId,
    name: textField(rec, "name"),
    address: textField(rec, "full_address", "address", "place_formatted"),
    context: suggestionContext(rec),
  };
}

function cantonFromProperties(props: Record<string, unknown>): string | null {
  const ctx = asRecord(props.context);
  const region = asRecord(ctx?.region);
  const full =
    typeof region?.region_code_full === "string" ? region.region_code_full : "";
  const code = typeof region?.region_code === "string" ? region.region_code : "";
  const raw = (full || code).trim().toUpperCase();
  if (!raw) return null;
  const iso = /^(?:CH-)?([A-Z]{2})$/.exec(raw);
  return iso?.[1] ?? raw.replace(/^CH-/, "");
}

function pointFromGeometry(geometry: unknown): GeoPoint | null {
  const geo = asRecord(geometry);
  if (!geo || !Array.isArray(geo.coordinates)) return null;
  const lng = geo.coordinates[0];
  const lat = geo.coordinates[1];
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { lng, lat };
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function upstreamGet(
  fetchImpl: typeof fetch,
  url: URL,
  emit: Emit,
  call: string,
): Promise<{ status: number; body: unknown } | { status: number; body: null }> {
  const started = Date.now();
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      signal: AbortSignal.timeout(MAPBOX_FETCH_TIMEOUT_MS),
    });
    const elapsed_ms = Date.now() - started;
    emit("info", "mapbox_call", {
      call,
      upstream_status: res.status,
      elapsed_ms,
    });
    if (!res.ok) {
      return { status: res.status, body: null };
    }
    return { status: res.status, body: await readJson(res) };
  } catch {
    emit("warn", "mapbox_call", {
      call,
      upstream_status: 0,
      elapsed_ms: Date.now() - started,
    });
    return { status: 0, body: null };
  }
}

export async function suggest(
  input: SuggestInput,
  env: MapboxEnv,
  deps: MapboxDeps = {},
): Promise<SuggestResult> {
  const emit = emitFor("geo.suggest", input.language);
  if (input.q.length < MIN_SUGGEST_Q) {
    return { suggestions: [] };
  }
  const access = tokenOf(env);
  if (!access) {
    return { suggestions: [], degraded: true };
  }
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const url = new URL(SEARCHBOX_SUGGEST);
  const params = url.searchParams;
  params.set("q", input.q);
  params.set("session_token", input.sessionToken);
  params.set("language", input.language);
  // Search is worldwide. proximity is rank bias only (Zurich HB default).
  // country= is a Mapbox FILTER, not a bias — it dropped Dubai / anywhere
  // outside CH. types= is also a FILTER: address,poi,street,place hid
  // postcodes, regions, localities and some airport/IATA hits. Omit it so
  // a name, a code, or a postcode can all find the same place.
  params.set("proximity", proximityParam(input.proximity));
  params.set("limit", "10");
  params.set("access_token", access);
  const result = await upstreamGet(fetchImpl, url, emit, "suggest");
  if (result.body === null) {
    return { suggestions: [], degraded: true };
  }
  const body = asRecord(result.body);
  const rawList = body?.suggestions;
  if (!Array.isArray(rawList)) {
    return { suggestions: [], degraded: true };
  }
  const suggestions: SuggestHit[] = [];
  for (const raw of rawList) {
    const hit = mapSuggestion(raw);
    if (hit) suggestions.push(hit);
  }
  return { suggestions };
}

export async function retrieve(
  input: RetrieveInput,
  env: MapboxEnv,
  deps: MapboxDeps = {},
): Promise<RetrieveResult> {
  const emit = emitFor("geo.retrieve", input.language);
  const access = tokenOf(env);
  if (!access) {
    return { place: null };
  }
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const url = new URL(
    `${SEARCHBOX_RETRIEVE}/${encodeURIComponent(input.mapboxId)}`,
  );
  const params = url.searchParams;
  params.set("session_token", input.sessionToken);
  // I-05: retrieve was the read path missing language= — forward it here too.
  params.set("language", input.language);
  params.set("access_token", access);
  const result = await upstreamGet(fetchImpl, url, emit, "retrieve");
  if (result.body === null) {
    return { place: null };
  }
  const body = asRecord(result.body);
  const features = body?.features;
  if (!Array.isArray(features) || features.length === 0) {
    return { place: null };
  }
  const feature = asRecord(features[0]);
  if (!feature) return { place: null };
  const props = asRecord(feature.properties) ?? {};
  const point = pointFromGeometry(feature.geometry);
  const mapboxId =
    typeof props.mapbox_id === "string" && props.mapbox_id.length > 0
      ? props.mapbox_id
      : input.mapboxId;
  if (!point) return { place: null };
  return {
    place: {
      mapbox_id: mapboxId,
      name: textField(props, "name"),
      address: textField(props, "full_address", "address", "place_formatted"),
      lng: point.lng,
      lat: point.lat,
      canton: cantonFromProperties(props),
    },
  };
}

export async function reverse(
  input: ReverseInput,
  env: MapboxEnv,
  deps: MapboxDeps = {},
): Promise<ReverseResult> {
  const emit = emitFor("geo.reverse", input.language);
  const access = tokenOf(env);
  if (!access) {
    return { place: null };
  }
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const url = new URL(GEOCODE_REVERSE);
  const params = url.searchParams;
  params.set("longitude", String(input.lng));
  params.set("latitude", String(input.lat));
  params.set("types", "address,poi");
  params.set("language", input.language);
  params.set("access_token", access);
  const result = await upstreamGet(fetchImpl, url, emit, "reverse");
  if (result.body === null) {
    return { place: null };
  }
  const body = asRecord(result.body);
  const features = body?.features;
  if (!Array.isArray(features) || features.length === 0) {
    return { place: null };
  }
  const feature = asRecord(features[0]);
  if (!feature) return { place: null };
  const props = asRecord(feature.properties) ?? {};
  const point = pointFromGeometry(feature.geometry);
  if (!point) return { place: null };
  return {
    place: {
      name: textField(props, "name"),
      address: textField(props, "full_address", "place_formatted", "address"),
      lng: point.lng,
      lat: point.lat,
    },
  };
}

function pointsOf(leg: RouteLegInput): GeoPoint[] {
  return [leg.origin, ...(leg.waypoints ?? []), leg.destination];
}

function coordinatePath(leg: RouteLegInput): string {
  return pointsOf(leg)
    .map((p) => `${p.lng},${p.lat}`)
    .join(";");
}

function snapRadiuses(leg: RouteLegInput): string {
  const n = pointsOf(leg).length;
  return Array.from({ length: n }, () => "unlimited").join(";");
}

function mapRoute(body: unknown): Omit<RouteLeg, "leg_seq" | "road"> | null {
  const rec = asRecord(body);
  if (!rec) return null;
  if (rec.code === "NoRoute" || rec.code === "NoSegment") return null;
  const routes = rec.routes;
  if (!Array.isArray(routes) || routes.length === 0) return null;
  const route = asRecord(routes[0]);
  if (!route) return null;
  if (typeof route.distance !== "number" || !Number.isFinite(route.distance)) {
    return null;
  }
  if (typeof route.duration !== "number" || !Number.isFinite(route.duration)) {
    return null;
  }
  const geometry = asRecord(route.geometry);
  if (!geometry || geometry.type !== "LineString") return null;
  if (!Array.isArray(geometry.coordinates)) return null;
  return {
    distance_m: Math.trunc(route.distance),
    duration_s: Math.trunc(route.duration),
    geometry: route.geometry as RouteLeg["geometry"],
  };
}

function sphereLeg(leg: RouteLegInput): Omit<RouteLeg, "leg_seq"> {
  const points = pointsOf(leg);
  let metres = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1];
    const next = points[i];
    if (!prev || !next) continue;
    metres += sphereMetres(prev, next);
  }
  return {
    distance_m: Math.trunc(metres),
    duration_s: 0,
    geometry: {
      type: "LineString",
      coordinates: points.map((p) => [p.lng, p.lat] as [number, number]),
    },
    road: false,
  };
}

type RoadCand = { point: GeoPoint; className: string; distance: number };

type RoadHit = { point: GeoPoint; major: boolean };

function roadHitFromTilequery(body: unknown): RoadHit | null {
  const rec = asRecord(body);
  const features = rec?.features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const cands: RoadCand[] = [];
  for (const raw of features) {
    const feature = asRecord(raw);
    if (!feature) continue;
    const point = pointFromGeometry(feature.geometry);
    if (!point) continue;
    const props = asRecord(feature.properties) ?? {};
    const className =
      typeof props.class === "string" ? props.class.toLowerCase() : "";
    if (SKIP_ROAD.has(className)) continue;
    const tq = asRecord(props.tilequery);
    const distance =
      typeof tq?.distance === "number" && Number.isFinite(tq.distance)
        ? tq.distance
        : 0;
    cands.push({ point, className, distance });
  }
  if (cands.length === 0) return null;
  const majorFar = cands.filter(
    (c) => MAJOR_ROAD.has(c.className) && c.distance >= LOCAL_ISLAND_M,
  );
  const major = cands.filter((c) => MAJOR_ROAD.has(c.className));
  const pool =
    majorFar.length > 0 ? majorFar : major.length > 0 ? major : cands;
  const pick = pool.slice().sort((a, b) => a.distance - b.distance)[0];
  if (!pick) return null;
  return { point: pick.point, major: MAJOR_ROAD.has(pick.className) };
}

function samePin(a: GeoPoint, b: GeoPoint): boolean {
  return a.lng === b.lng && a.lat === b.lat;
}

function nudgeToward(from: GeoPoint, toward: GeoPoint, metres: number): GeoPoint {
  const total = sphereMetres(from, toward);
  if (!(total > 0)) return from;
  const t = Math.min(1, metres / total);
  return {
    lng: from.lng + (toward.lng - from.lng) * t,
    lat: from.lat + (toward.lat - from.lat) * t,
  };
}

type DirHit =
  | { kind: "route"; value: Omit<RouteLeg, "leg_seq" | "road"> }
  | { kind: "none" }
  | { kind: "down" };

async function fetchDriving(
  fetchImpl: typeof fetch,
  access: string,
  emit: Emit,
  leg: RouteLegInput,
): Promise<DirHit> {
  const url = new URL(`${DIRECTIONS_DRIVING}/${coordinatePath(leg)}`);
  const params = url.searchParams;
  params.set("geometries", "geojson");
  params.set("overview", "full");
  params.set("alternatives", "false");
  params.set("steps", "false");
  params.set("radiuses", snapRadiuses(leg));
  params.set("access_token", access);
  const result = await upstreamGet(fetchImpl, url, emit, "directions");
  if (result.body === null) return { kind: "down" };
  const parsed = mapRoute(result.body);
  if (!parsed) return { kind: "none" };
  return { kind: "route", value: parsed };
}

async function queryRoads(
  fetchImpl: typeof fetch,
  access: string,
  emit: Emit,
  pin: GeoPoint,
): Promise<RoadHit | null> {
  const url = new URL(`${TILEQUERY}/${pin.lng},${pin.lat}.json`);
  const params = url.searchParams;
  params.set("radius", String(TILEQUERY_RADIUS_M));
  params.set("limit", "10");
  params.set("layers", "road");
  params.set("dedupe", "true");
  params.set("access_token", access);
  const result = await upstreamGet(fetchImpl, url, emit, "tilequery");
  if (result.body === null) return null;
  return roadHitFromTilequery(result.body);
}

async function snapPinToRoad(
  fetchImpl: typeof fetch,
  access: string,
  emit: Emit,
  pin: GeoPoint,
  other: GeoPoint,
): Promise<GeoPoint> {
  const nudged = nudgeToward(pin, other, SNAP_NUDGE_M);
  if (!samePin(nudged, pin)) {
    const far = await queryRoads(fetchImpl, access, emit, nudged);
    if (far?.point) return far.point;
  }
  const near = await queryRoads(fetchImpl, access, emit, pin);
  return near?.point ?? pin;
}

async function snapLegToRoads(
  fetchImpl: typeof fetch,
  access: string,
  emit: Emit,
  leg: RouteLegInput,
): Promise<RouteLegInput> {
  const origin = await snapPinToRoad(
    fetchImpl,
    access,
    emit,
    leg.origin,
    leg.destination,
  );
  const destination = await snapPinToRoad(
    fetchImpl,
    access,
    emit,
    leg.destination,
    leg.origin,
  );
  const waypoints = [];
  for (const wp of leg.waypoints ?? []) {
    waypoints.push(
      await snapPinToRoad(fetchImpl, access, emit, wp, leg.destination),
    );
  }
  return {
    origin,
    destination,
    ...(waypoints.length > 0 ? { waypoints } : {}),
  };
}

function snapChanged(a: RouteLegInput, b: RouteLegInput): boolean {
  if (!samePin(a.origin, b.origin)) return true;
  if (!samePin(a.destination, b.destination)) return true;
  const aw = a.waypoints ?? [];
  const bw = b.waypoints ?? [];
  if (aw.length !== bw.length) return true;
  for (let i = 0; i < aw.length; i += 1) {
    const left = aw[i];
    const right = bw[i];
    if (!left || !right || !samePin(left, right)) return true;
  }
  return false;
}

export async function routeLegs(
  legs: RouteLegInput[],
  env: MapboxEnv,
  deps: MapboxDeps = {},
): Promise<RouteResult> {
  const emit = emitFor("geo.directions", null);
  const access = tokenOf(env);
  if (!access) {
    return { ok: false, code: "route_unavailable" };
  }
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const mapped: RouteLeg[] = [];
  for (let i = 0; i < legs.length; i += 1) {
    const leg = legs[i];
    if (!leg) {
      return { ok: false, code: "route_unavailable" };
    }
    // D-16: profile is mapbox/driving. driving-traffic is a live duration for
    // *now* and the wrong input for a pickup weeks away. Matrix has no
    // geometry, and QUOTE-01 needs the line.
    const first = await fetchDriving(fetchImpl, access, emit, leg);
    if (first.kind === "down") {
      return { ok: false, code: "route_unavailable" };
    }
    const seq: 1 | 2 = i === 0 ? 1 : 2;
    if (first.kind === "route") {
      mapped.push({ leg_seq: seq, ...first.value, road: true });
      continue;
    }
    const snapped = await snapLegToRoads(fetchImpl, access, emit, leg);
    if (snapChanged(leg, snapped)) {
      const second = await fetchDriving(fetchImpl, access, emit, snapped);
      if (second.kind === "down") {
        return { ok: false, code: "route_unavailable" };
      }
      if (second.kind === "route") {
        mapped.push({ leg_seq: seq, ...second.value, road: true });
        continue;
      }
    }
    mapped.push({ leg_seq: seq, ...sphereLeg(leg) });
  }
  return { ok: true, legs: mapped };
}
