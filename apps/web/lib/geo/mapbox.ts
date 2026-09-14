// apps/web/lib/geo/mapbox.ts
//
// The only module that holds MAPBOX_TOKEN. Four upstream calls — Search Box
// suggest + retrieve, Geocoding v6 reverse, Directions v5 driving — and the
// degraded shapes that let the widget keep working before the owner has an
// account (D-47).
//
// D-14 / Product Terms §1.9 / §2.7.2 / §2.10.1 (PDF 21 July 2026): this
// module writes nothing to KV, builds no Response, decides no HTTP status,
// knows nothing about the service area, and never invents a distance. The
// one legal KV use (our own session-token set, not Licensed Map Content)
// lives in session.ts, not here. GEO_CACHE is not consulted.
//
// D-15: language= on suggest, retrieve, and reverse. D-16: one Directions
// call per leg, profile driving, never a number we did not receive. D-51:
// no permanent parameter on any call — the persist path is Phase 7's
// checkout-time Geocoding v6 call; plan 04-14 re-reads the live parameter
// list at sign-up — this file does not guess it.
//
// fetch is injected and defaults to globalThis.fetch so every case runs with
// no network: a geo client that can only be tested against a paid account is
// a geo client that stops being tested.

import { withRequestContext } from "../logger";
import type { QuoteErrorCode } from "../quote/errors";

export const MAPBOX_FETCH_TIMEOUT_MS = 8_000;

/** Zurich HB. Bias only — QUOTE-07 / serviceArea.ts is the gate. */
const DEFAULT_PROXIMITY = "8.5417,47.3769";

const SEARCHBOX_SUGGEST = "https://api.mapbox.com/search/searchbox/v1/suggest";
const SEARCHBOX_RETRIEVE = "https://api.mapbox.com/search/searchbox/v1/retrieve";
const GEOCODE_REVERSE = "https://api.mapbox.com/search/geocode/v6/reverse";
const DIRECTIONS_DRIVING = "https://api.mapbox.com/directions/v5/mapbox/driving";

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
  if (input.q.length < 3) {
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
  // outside CH. Operating countries are a later owner gate on the quote
  // service area, not on typeahead.
  params.set("proximity", proximityParam(input.proximity));
  params.set("types", "address,poi,street,place");
  params.set("limit", "8");
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

function coordinatePath(leg: RouteLegInput): string {
  const points = [leg.origin, ...(leg.waypoints ?? []), leg.destination];
  return points.map((p) => `${p.lng},${p.lat}`).join(";");
}

function mapRoute(body: unknown): Omit<RouteLeg, "leg_seq"> | null {
  const rec = asRecord(body);
  if (!rec) return null;
  if (rec.code === "NoRoute") return null;
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
    const url = new URL(`${DIRECTIONS_DRIVING}/${coordinatePath(leg)}`);
    const params = url.searchParams;
    params.set("geometries", "geojson");
    params.set("overview", "full");
    params.set("alternatives", "false");
    params.set("steps", "false");
    params.set("access_token", access);
    const result = await upstreamGet(fetchImpl, url, emit, "directions");
    if (result.body === null) {
      return { ok: false, code: "route_unavailable" };
    }
    const parsed = mapRoute(result.body);
    if (!parsed) {
      return { ok: false, code: "route_unavailable" };
    }
    const seq: 1 | 2 = i === 0 ? 1 : 2;
    mapped.push({ leg_seq: seq, ...parsed });
  }
  return { ok: true, legs: mapped };
}
