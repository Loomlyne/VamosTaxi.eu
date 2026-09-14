// apps/web/lib/quote/pipeline.ts
//
// Ordered §2 processing steps as data, plus the runner that walks them
// (04-API-CONTRACT.md §2). An ordering that only exists as the reading
// order of a long function is an ordering nobody can review. Steps 4 and
// 11 are the two whose position is worth money: the Mapbox breaker must
// trip BEFORE Directions is billed, and `exp` must be authored by
// Postgres, never a Worker clock.
//
// Negative space: this file contains no wall-clock call and does not
// read PRICING_PREVIEW — loadAndPrice (plan 04-09) owns that flag (D-33).
// Steps 2, 3 and 4 are injected guards defaulting to pass-through no-ops;
// plan 04-13 supplies the real Worker rate limit, Turnstile, and daily
// Mapbox breaker without moving a step.

import { ENGINE_VERSION } from "../version";
import type { CurrencyCode } from "../currency";
import { countMapboxUnit } from "../abuse/breaker";
import { hasSeenSession } from "../geo/session";
import {
  checkMinAdvance as defaultCheckMinAdvance,
  checkServiceArea as defaultCheckServiceArea,
  publishedServiceAreaPolygon,
  sameCoordinate,
  type FixedRoutePair,
} from "../geo/serviceArea";
import {
  retrieve as defaultRetrieve,
  reverse as defaultReverse,
  routeLegs as defaultRouteLegs,
  type GeoLanguage,
  type RouteLeg,
  type RouteLegInput,
} from "../geo/mapbox";
import { mintLockDeadline } from "../db/quote";
import { loadAndPrice as defaultLoadAndPrice, type LoadAndPriceCoupon } from "./engine";
import type { QuoteErrorCode } from "./errors";
import {
  mintLock as defaultMintLock,
  verifyLock as defaultVerifyLock,
  type LockSecrets,
  type QuoteLockPayload,
} from "./lock";
import type { ClassBoardEntry, PolicySnapshot, QuoteInput } from "../pricing/types";
import {
  parseQuoteRequest,
  parseRepriceRequest,
  type ExtrasInput,
  type PlaceInput,
  type QuoteRequest,
  type RepriceRequest,
} from "./schema";

export const QUOTE_STEPS = Object.freeze([
  Object.freeze({ id: "zod" }),
  Object.freeze({ id: "worker_rate_limit" }),
  Object.freeze({ id: "turnstile" }),
  Object.freeze({ id: "daily_mapbox_breaker" }),
  Object.freeze({ id: "resolve_coordinates" }),
  Object.freeze({ id: "same_place" }),
  Object.freeze({ id: "country_box" }),
  Object.freeze({ id: "service_area" }),
  Object.freeze({ id: "min_advance" }),
  Object.freeze({ id: "directions" }),
  Object.freeze({ id: "lock_deadline" }),
  Object.freeze({ id: "price_and_mint" }),
]);

export type QuoteStepId = (typeof QUOTE_STEPS)[number]["id"];

export type PipelineRefusal = {
  ok: false;
  code: QuoteErrorCode;
  params?: { minutes: number };
};

export type CouponInfo = {
  code: string;
  applied: boolean;
  rule:
    | "ok"
    | "not_found"
    | "inactive"
    | "not_yet_valid"
    | "expired"
    | "unpriced"
    | "usage_cap"
    | "per_user_cap";
  i18n_key: string;
  kind?: "percent" | "amount";
  percent?: number | string | null;
};

function couponRule(applied: boolean, key: string): CouponInfo["rule"] {
  if (applied) return "ok";
  if (key.endsWith("not_found")) return "not_found";
  if (key.endsWith("inactive")) return "inactive";
  if (key.endsWith("not_yet_valid")) return "not_yet_valid";
  if (key.endsWith("expired")) return "expired";
  if (key.endsWith("unpriced")) return "unpriced";
  if (key.endsWith("usage_cap")) return "usage_cap";
  if (key.endsWith("per_user_cap")) return "per_user_cap";
  return "unpriced";
}

function couponInfoFromEval(
  code: string | null | undefined,
  evaled: LoadAndPriceCoupon | null | undefined,
): CouponInfo | null {
  if (!code) return null;
  if (!evaled) {
    return {
      code: code.toUpperCase(),
      applied: false,
      rule: "unpriced",
      i18n_key: "quote.coupon.error.unpriced",
    };
  }
  return {
    code: evaled.code,
    applied: evaled.applied,
    rule: couponRule(evaled.applied, evaled.i18n_key),
    i18n_key: evaled.i18n_key,
    ...(evaled.applied && (evaled.kind === "percent" || evaled.kind === "amount")
      ? { kind: evaled.kind, percent: evaled.percent ?? null }
      : {}),
  };
}

export type QuoteRouteLeg = {
  leg_seq: 1 | 2;
  distance_m: number;
  duration_s: number;
  geometry: { type: "LineString"; coordinates: [number, number][] };
  origin_zone_id: string | null;
  dest_zone_id: string | null;
};

export type QuotePipelineOk = {
  ok: true;
  quote_id: string;
  lock: string;
  expires_at: string;
  engine_version: string;
  pricing_live: boolean;
  rate_version: { id: number; slug: string } | null;
  settings_version_id: number;
  display_currency: CurrencyCode;
  route: { legs: QuoteRouteLeg[] };
  no_eligible_class: boolean;
  classes: ClassBoardEntry[];
  policy: PolicySnapshot | null;
  coupon?: CouponInfo | null;
};

export type PipelineResult = QuotePipelineOk | PipelineRefusal;

export type QuoteSettingsSlice = {
  id: number;
  min_advance_minutes: number | null;
  service_area_geojson: unknown | null;
};

export type ResolvedPlace = {
  lng: number;
  lat: number;
  text: string;
  place_id?: string;
  zoneId?: string | null;
  canton?: string | null;
};

export type InjectedGuard = () =>
  | PipelineRefusal
  | { ok: true }
  | Promise<PipelineRefusal | { ok: true }>;

export type QuotePipelineDeps = {
  env: CloudflareEnv;
  lockSecrets: LockSecrets;
  /** Injected instant for min-advance. Never authored inside this file. */
  nowMs: number;
  /** Injected ISO for settings as-of and lock.computed_at. */
  computedAt: string;
  /** Injected ISO for verifyLock's decorative Worker check. */
  nowIso: string;
  quoteLockDeadline: (
    settingsVersionId: number,
  ) => Promise<string | null>;
  loadAndPrice: typeof defaultLoadAndPrice;
  loadSettings: () => Promise<QuoteSettingsSlice | null>;
  routeLegs: (legs: RouteLegInput[]) => Promise<
    { ok: true; legs: RouteLeg[] } | { ok: false; code: "route_unavailable" }
  >;
  resolvePlace?: (
    place: PlaceInput,
    locale: GeoLanguage,
  ) => Promise<ResolvedPlace | null>;
  rateLimit?: InjectedGuard;
  turnstile?: InjectedGuard;
  mapboxBreaker?: InjectedGuard;
  checkServiceArea?: typeof defaultCheckServiceArea;
  checkMinAdvance?: typeof defaultCheckMinAdvance;
  mintLock?: typeof defaultMintLock;
  verifyLock?: typeof defaultVerifyLock;
  mintQuoteId?: () => string;
  loadFixedRoutes?: () => Promise<readonly FixedRoutePair[]>;
  engineVersion?: string;
  retrieve?: typeof defaultRetrieve;
  reverse?: typeof defaultReverse;
  /** Verified vamos_qs subject, or null. Coords (AM-03) need this or a seen session. */
  qsSubject?: string | null;
  geoSession?: { token: string; bucket: string } | null;
};

type StepFail = PipelineRefusal;
type StepOk = { ok: true };
type StepResult = StepOk | StepFail;

const passGuard: InjectedGuard = () => ({ ok: true });

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extrasToRecord(
  extras: ExtrasInput | QuoteLockPayload["extras"] | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!extras) return out;
  if (typeof extras.extra_stops === "number") out.extra_stops = extras.extra_stops;
  if (typeof extras.child_seats === "number") out.child_seats = extras.child_seats;
  if (extras.oversized_luggage === true) out.oversized_luggage = 1;
  return out;
}

/**
 * D-18 / D-56: a count without waypoints is a LEGAL payload the mock's own
 * checkout produces. When waypoints ARE sent, length must equal extra_stops
 * or 422 extras_max_stops. Extra-stop money is the D-11 distance recipe on
 * the new path (D-37), not amount_rappen × extra_stops.
 */
function extraStopsWaypointMismatch(body: unknown): boolean {
  if (!isPlainObject(body)) return false;
  const extras = body.extras;
  if (!isPlainObject(extras)) return false;
  if (!("waypoints" in extras) || extras.waypoints === undefined) return false;
  if (!Array.isArray(extras.waypoints)) return false;
  const stops = typeof extras.extra_stops === "number" ? extras.extra_stops : 0;
  return extras.waypoints.length !== stops;
}

function waypointsChanged(
  lock: QuoteLockPayload,
  extras: ExtrasInput | undefined,
): boolean {
  if (!extras || extras.waypoints === undefined) return false;
  const previous =
    lock.extras?.waypoints ?? lock.legs[0]?.waypoints ?? [];
  if (extras.waypoints.length !== previous.length) return true;
  return extras.waypoints.some((w, i) => {
    const prev = previous[i];
    return !prev || prev.lng !== w.lng || prev.lat !== w.lat;
  });
}

async function coordsAllowed(deps: QuotePipelineDeps): Promise<boolean> {
  if (typeof deps.qsSubject === "string" && deps.qsSubject.length > 0) {
    return true;
  }
  if (deps.geoSession) {
    return hasSeenSession(deps.env, deps.geoSession.token, deps.geoSession.bucket);
  }
  return false;
}

async function defaultResolvePlace(
  place: PlaceInput,
  locale: GeoLanguage,
  deps: QuotePipelineDeps,
): Promise<ResolvedPlace | null> {
  if (place.kind === "coords") {
    return {
      lng: place.lng,
      lat: place.lat,
      text: place.text,
      place_id: place.place_id,
    };
  }
  if (place.kind === "pin") {
    const reverse = deps.reverse ?? defaultReverse;
    let text = place.text ?? "";
    try {
      // D-37: Geocoding v6 /reverse on the quote path.
      await countMapboxUnit(deps.env, deps.nowMs);
      const got = await reverse(
        { lng: place.lng, lat: place.lat, language: locale },
        deps.env,
      );
      if (got.place?.name) text = got.place.name;
    } catch {
      // Pin already carries coordinates — a reverse miss is not unresolved.
    }
    return { lng: place.lng, lat: place.lat, text };
  }
  const retrieve = deps.retrieve ?? defaultRetrieve;
  // D-37: Search Box /retrieve on the quote path.
  await countMapboxUnit(deps.env, deps.nowMs);
  const got = await retrieve(
    {
      mapboxId: place.mapbox_id,
      sessionToken: place.session_token,
      language: locale,
    },
    deps.env,
  );
  if (!got.place) return null;
  return {
    lng: got.place.lng,
    lat: got.place.lat,
    text: got.place.name,
    place_id: got.place.mapbox_id,
    canton: got.place.canton,
  };
}

function publicRouteLegs(
  routed: RouteLeg[],
  pickup: ResolvedPlace,
  dropoff: ResolvedPlace,
): QuoteRouteLeg[] {
  return routed.map((leg, i) => {
    const origin = i === 0 ? pickup : dropoff;
    const dest = i === 0 ? dropoff : pickup;
    return {
      leg_seq: leg.leg_seq,
      distance_m: leg.distance_m,
      duration_s: leg.duration_s,
      geometry: leg.geometry,
      origin_zone_id: origin.zoneId ?? null,
      dest_zone_id: dest.zoneId ?? null,
    };
  });
}

function toQuoteInput(
  request: QuoteRequest,
  pickup: ResolvedPlace,
  dropoff: ResolvedPlace,
  routed: RouteLeg[],
  computedAt: string,
): QuoteInput {
  return {
    mode: request.mode,
    pax: request.pax,
    bags: request.bags,
    display_currency: request.display_currency,
    computed_at: computedAt,
    legs: request.legs.map((leg, i) => {
      const routedLeg = routed[i]!;
      const origin = i === 0 ? pickup : dropoff;
      const dest = i === 0 ? dropoff : pickup;
      return {
        leg_seq: leg.leg_seq,
        scheduled_local: leg.scheduled_local,
        distance_m: routedLeg.distance_m,
        duration_s: routedLeg.duration_s,
        origin_zone_id: origin.zoneId ?? null,
        dest_zone_id: dest.zoneId ?? null,
        origin_canton: origin.canton ?? null,
        dest_canton: dest.canton ?? null,
        waypoints: i === 0 ? (request.extras?.waypoints ?? []) : [],
      };
    }),
    extras: extrasToRecord(request.extras),
    coupon: request.coupon ?? null,
  };
}

function inputFromLock(
  lock: QuoteLockPayload,
  extras: ExtrasInput | undefined,
  coupon: string | null,
  computedAt: string,
  routed: QuoteRouteLeg[] | null,
): QuoteInput {
  return {
    mode: lock.mode,
    pax: lock.pax,
    bags: lock.bags,
    display_currency: lock.display_currency,
    computed_at: computedAt,
    legs: lock.legs.map((leg, i) => {
      const live = routed?.[i];
      return {
        leg_seq: leg.leg_seq,
        scheduled_local: leg.scheduled_local,
        distance_m: live?.distance_m ?? leg.distance_m,
        duration_s: live?.duration_s ?? leg.duration_s,
        origin_zone_id: live?.origin_zone_id ?? leg.origin_zone_id,
        dest_zone_id: live?.dest_zone_id ?? leg.dest_zone_id,
        waypoints:
          i === 0 ? (extras?.waypoints ?? leg.waypoints) : leg.waypoints,
      };
    }),
    extras: extrasToRecord(extras ?? lock.extras ?? undefined),
    coupon,
  };
}

async function mintSuccess(args: {
  deps: QuotePipelineDeps;
  payload: QuoteLockPayload;
  quote: {
    no_eligible_class: boolean;
    classes: ClassBoardEntry[];
    policy: PolicySnapshot | null;
    rate_version: { id: number; slug: string } | null;
    pricing_live: boolean;
  };
  route: { legs: QuoteRouteLeg[] };
  coupon?: CouponInfo | null;
}): Promise<QuotePipelineOk> {
  const mint = args.deps.mintLock ?? defaultMintLock;
  const lock = await mint(args.deps.lockSecrets, args.payload);
  return {
    ok: true,
    quote_id: args.payload.quote_id,
    lock,
    expires_at: args.payload.exp,
    engine_version: args.payload.engine_version,
    pricing_live: args.quote.pricing_live,
    rate_version: args.quote.rate_version,
    settings_version_id: args.payload.settings_version_id,
    display_currency: args.payload.display_currency,
    route: args.route,
    no_eligible_class: args.quote.no_eligible_class,
    classes: args.quote.classes,
    policy: args.quote.policy,
    ...(args.coupon !== undefined ? { coupon: args.coupon } : {}),
  };
}

function classTotals(
  classes: ClassBoardEntry[],
): QuoteLockPayload["class_totals"] {
  return classes.map((c) => ({
    slug: c.slug,
    total_rappen: c.total_rappen,
  }));
}

type QuoteRunState = {
  body: unknown;
  request?: QuoteRequest;
  pickup?: ResolvedPlace;
  dropoff?: ResolvedPlace;
  settings?: QuoteSettingsSlice;
  routed?: RouteLeg[];
  exp?: string;
};

async function runStep(
  id: QuoteStepId,
  state: QuoteRunState,
  deps: QuotePipelineDeps,
): Promise<StepResult> {
  switch (id) {
    case "zod": {
      const parsed = parseQuoteRequest(state.body);
      if (!parsed.ok) return { ok: false, code: parsed.code };
      state.request = parsed.value;
      return { ok: true };
    }
    case "worker_rate_limit": {
      const guard = deps.rateLimit ?? passGuard;
      const result = await guard();
      return result;
    }
    case "turnstile": {
      const guard = deps.turnstile ?? passGuard;
      return await guard();
    }
    case "daily_mapbox_breaker": {
      // Plan 04-13 supplies the real breaker. Position is the whole point:
      // a breaker that runs after Directions has already paid for the call.
      const guard = deps.mapboxBreaker ?? passGuard;
      return await guard();
    }
    case "resolve_coordinates": {
      const request = state.request!;
      // AM-03: without a suggest session or a verified vamos_qs, kind: "coords"
      // is a /retrieve bypass for a caller who never paid for a session.
      const coordsPlaces = [request.pickup, request.dropoff].some(
        (p) => p.kind === "coords",
      );
      if (coordsPlaces && !(await coordsAllowed(deps))) {
        return { ok: false, code: "retrieve_without_suggest" };
      }
      const locale = request.locale as GeoLanguage;
      const resolve = deps.resolvePlace
        ? deps.resolvePlace
        : (place: PlaceInput, loc: GeoLanguage) =>
            defaultResolvePlace(place, loc, deps);
      const pickup = await resolve(request.pickup, locale);
      const dropoff = await resolve(request.dropoff, locale);
      if (!pickup || !dropoff) {
        return { ok: false, code: "place_unresolved" };
      }
      state.pickup = pickup;
      state.dropoff = dropoff;
      return { ok: true };
    }
    case "same_place": {
      const pickup = state.pickup!;
      const dropoff = state.dropoff!;
      if (sameCoordinate(pickup, dropoff)) {
        return { ok: false, code: "same_place" };
      }
      return { ok: true };
    }
    case "country_box": {
      return { ok: true };
    }
    case "service_area": {
      const settings = await deps.loadSettings();
      if (settings === null) {
        return { ok: false, code: "no_settings_version" };
      }
      state.settings = settings;
      const check = deps.checkServiceArea ?? defaultCheckServiceArea;
      const fixedRoutes = deps.loadFixedRoutes
        ? await deps.loadFixedRoutes()
        : [];
      const result = check({
        origin: {
          lng: state.pickup!.lng,
          lat: state.pickup!.lat,
          zoneId: state.pickup!.zoneId ?? null,
        },
        dest: {
          lng: state.dropoff!.lng,
          lat: state.dropoff!.lat,
          zoneId: state.dropoff!.zoneId ?? null,
        },
        polygon: publishedServiceAreaPolygon(settings.service_area_geojson),
        fixedRoutes,
      });
      if (!result.ok) return { ok: false, code: result.code };
      return { ok: true };
    }
    case "min_advance": {
      const settings = state.settings!;
      const request = state.request!;
      const first = request.legs[0];
      if (!first) return { ok: false, code: "untrusted_input" };
      const check = deps.checkMinAdvance ?? defaultCheckMinAdvance;
      const result = check({
        scheduledLocal: first.scheduled_local,
        minAdvanceMinutes: settings.min_advance_minutes,
        nowMs: deps.nowMs,
      });
      if (!result.ok) {
        return { ok: false, code: result.code, params: result.params };
      }
      return { ok: true };
    }
    case "directions": {
      const request = state.request!;
      const pickup = state.pickup!;
      const dropoff = state.dropoff!;
      const outbound: RouteLegInput = {
        origin: { lng: pickup.lng, lat: pickup.lat },
        destination: { lng: dropoff.lng, lat: dropoff.lat },
        waypoints: request.extras?.waypoints?.map((w) => ({
          lng: w.lng,
          lat: w.lat,
        })),
      };
      const inputs: RouteLegInput[] =
        request.mode === "return"
          ? [
              outbound,
              {
                origin: { lng: dropoff.lng, lat: dropoff.lat },
                destination: { lng: pickup.lng, lat: pickup.lat },
              },
            ]
          : [outbound];
      // D-37: the breaker counts calls, not endpoints, and three of the four
      // billable shapes are geo. This is Directions v5 driving.
      await countMapboxUnit(deps.env, deps.nowMs);
      const routed = await deps.routeLegs(inputs);
      if (!routed.ok) return { ok: false, code: routed.code };
      state.routed = routed.legs;
      return { ok: true };
    }
    case "lock_deadline": {
      const settings = state.settings!;
      const exp = await deps.quoteLockDeadline(settings.id);
      if (exp === null) return { ok: false, code: "no_settings_version" };
      state.exp = exp;
      return { ok: true };
    }
    case "price_and_mint": {
      // Filled by the runner after the walk so mintLock can see the board.
      return { ok: true };
    }
    default: {
      return { ok: false, code: "untrusted_input" };
    }
  }
}

export async function runQuotePipeline(
  body: unknown,
  deps: QuotePipelineDeps,
): Promise<PipelineResult> {
  const state: QuoteRunState = { body };
  for (const step of QUOTE_STEPS) {
    const outcome = await runStep(step.id, state, deps);
    if (!outcome.ok) return outcome;
  }

  const request = state.request!;
  const pickup = state.pickup!;
  const dropoff = state.dropoff!;
  const routed = state.routed!;
  const settings = state.settings!;
  const exp = state.exp!;
  const engineVersion = deps.engineVersion ?? ENGINE_VERSION;
  const quoteId = (deps.mintQuoteId ?? crypto.randomUUID.bind(crypto))();

  const priced = await deps.loadAndPrice(
    deps.env,
    toQuoteInput(request, pickup, dropoff, routed, deps.computedAt),
  );
  if (!priced.ok) return { ok: false, code: priced.code };

  const settingsVersionId = priced.quote.settings_version_id ?? settings.id;
  const route = { legs: publicRouteLegs(routed, pickup, dropoff) };
  const payload: QuoteLockPayload = {
    v: 1,
    quote_id: quoteId,
    exp,
    engine_version: engineVersion,
    rate_version_id: priced.quote.rate_version?.id ?? null,
    settings_version_id: settingsVersionId,
    computed_at: deps.computedAt,
    display_currency: request.display_currency,
    mode: request.mode,
    pax: request.pax,
    bags: request.bags,
    legs: route.legs.map((leg, i) => {
      const origin = i === 0 ? pickup : dropoff;
      const dest = i === 0 ? dropoff : pickup;
      const src = request.legs[i];
      return {
        leg_seq: leg.leg_seq,
        pickup: {
          lng: origin.lng,
          lat: origin.lat,
          text: origin.text,
          ...(origin.place_id ? { place_id: origin.place_id } : {}),
        },
        dropoff: {
          lng: dest.lng,
          lat: dest.lat,
          text: dest.text,
          ...(dest.place_id ? { place_id: dest.place_id } : {}),
        },
        scheduled_local: src?.scheduled_local ?? "",
        distance_m: leg.distance_m,
        duration_s: leg.duration_s,
        origin_zone_id: leg.origin_zone_id,
        dest_zone_id: leg.dest_zone_id,
        waypoints:
          i === 0
            ? (request.extras?.waypoints ?? []).map((w) => ({
                lng: w.lng,
                lat: w.lat,
                text: w.text,
              }))
            : [],
        flight_no: src?.flight_no ?? null,
        landing_source: null,
      };
    }),
    extras: request.extras
      ? {
          child_seats: request.extras.child_seats as 0 | 1 | undefined,
          extra_stops: request.extras.extra_stops as 0 | 1 | undefined,
          oversized_luggage: request.extras.oversized_luggage,
          waypoints: request.extras.waypoints,
        }
      : null,
    coupon: request.coupon ?? null,
    class_totals: classTotals(priced.quote.classes),
  };

  return mintSuccess({
    deps,
    payload,
    quote: priced.quote,
    route,
    coupon: couponInfoFromEval(request.coupon ?? null, priced.coupon),
  });
}

export async function runRepricePipeline(
  body: unknown,
  deps: QuotePipelineDeps,
): Promise<PipelineResult> {
  // D-18 / D-56: count-only extra_stops is legal; a present waypoints[]
  // whose length disagrees with extra_stops is extras_max_stops, not a
  // generic shape complaint. Checked before the strict parse so the
  // code the widget switches on is the extras one.
  if (extraStopsWaypointMismatch(body)) {
    return { ok: false, code: "extras_max_stops" };
  }

  const parsed = parseRepriceRequest(body);
  if (!parsed.ok) return { ok: false, code: parsed.code };
  const request: RepriceRequest = parsed.value;

  const limited = await runStep("worker_rate_limit", { body }, deps);
  if (!limited.ok) return limited;

  const verify = deps.verifyLock ?? defaultVerifyLock;
  const verified = await verify(deps.lockSecrets, request.lock, deps.nowIso);
  if (!verified.ok) {
    if (verified.reason === "expired") {
      return { ok: false, code: "quote_expired" };
    }
    return { ok: false, code: "quote_not_found" };
  }
  const lock = verified.payload;
  if (lock.quote_id !== request.quote_id) {
    return { ok: false, code: "quote_not_found" };
  }

  // D-27: the lock pins extras AND coupon. A waypoint-changing reprice
  // mints a NEW quote_id and a NEW expires_at and re-signs class_totals.
  // A coupon-only reprice KEEPS the original quote_id, expires_at and
  // metres and only rebuilds lines. Mixing follows the stricter rule
  // (new lock). Re-minting the lock on a coupon-only reprice would
  // reset the 30 minutes on every keystroke in the coupon field, and
  // no existing test would notice.
  const changed = waypointsChanged(lock, request.extras);

  let routedPublic: QuoteRouteLeg[] | null = null;
  let quoteId = lock.quote_id;
  let exp = lock.exp;

  if (changed) {
    for (const id of ["turnstile", "daily_mapbox_breaker"] as const) {
      const outcome = await runStep(id, { body }, deps);
      if (!outcome.ok) return outcome;
    }
    const outboundLeg = lock.legs[0];
    if (!outboundLeg) return { ok: false, code: "untrusted_input" };
    const outbound: RouteLegInput = {
      origin: { lng: outboundLeg.pickup.lng, lat: outboundLeg.pickup.lat },
      destination: {
        lng: outboundLeg.dropoff.lng,
        lat: outboundLeg.dropoff.lat,
      },
      waypoints: request.extras?.waypoints?.map((w) => ({
        lng: w.lng,
        lat: w.lat,
      })),
    };
    const inputs: RouteLegInput[] =
      lock.mode === "return" && lock.legs[1]
        ? [
            outbound,
            {
              origin: {
                lng: outboundLeg.dropoff.lng,
                lat: outboundLeg.dropoff.lat,
              },
              destination: {
                lng: outboundLeg.pickup.lng,
                lat: outboundLeg.pickup.lat,
              },
            },
          ]
        : [outbound];
    const routed = await deps.routeLegs(inputs);
    if (!routed.ok) return { ok: false, code: routed.code };
    routedPublic = routed.legs.map((leg, i) => ({
      leg_seq: leg.leg_seq,
      distance_m: leg.distance_m,
      duration_s: leg.duration_s,
      geometry: leg.geometry,
      origin_zone_id: lock.legs[i]?.origin_zone_id ?? null,
      dest_zone_id: lock.legs[i]?.dest_zone_id ?? null,
    }));
    const freshExp = await deps.quoteLockDeadline(lock.settings_version_id);
    if (freshExp === null) return { ok: false, code: "no_settings_version" };
    exp = freshExp;
    quoteId = (deps.mintQuoteId ?? crypto.randomUUID.bind(crypto))();
  }

  const couponCode =
    request.coupon === undefined ? lock.coupon : request.coupon;

  const priced = await deps.loadAndPrice(
    deps.env,
    inputFromLock(
      lock,
      request.extras,
      couponCode,
      deps.computedAt,
      routedPublic,
    ),
  );
  if (!priced.ok) return { ok: false, code: priced.code };

  const route: { legs: QuoteRouteLeg[] } = routedPublic
    ? { legs: routedPublic }
    : {
        legs: lock.legs.map((leg) => ({
          leg_seq: leg.leg_seq,
          distance_m: leg.distance_m,
          duration_s: leg.duration_s,
          geometry: { type: "LineString", coordinates: [] },
          origin_zone_id: leg.origin_zone_id,
          dest_zone_id: leg.dest_zone_id,
        })),
      };

  const extras = request.extras
    ? {
        child_seats: request.extras.child_seats as 0 | 1 | undefined,
        extra_stops: request.extras.extra_stops as 0 | 1 | undefined,
        oversized_luggage: request.extras.oversized_luggage,
        waypoints: request.extras.waypoints ?? lock.extras?.waypoints,
      }
    : lock.extras;

  const payload: QuoteLockPayload = {
    ...lock,
    quote_id: quoteId,
    exp,
    extras,
    coupon: couponCode,
    class_totals: classTotals(priced.quote.classes),
    legs: lock.legs.map((leg, i) => {
      const live = route.legs[i];
      return {
        ...leg,
        distance_m: live?.distance_m ?? leg.distance_m,
        duration_s: live?.duration_s ?? leg.duration_s,
        waypoints:
          i === 0
            ? (request.extras?.waypoints ?? leg.waypoints)
            : leg.waypoints,
      };
    }),
  };

  const coupon: CouponInfo | null = couponInfoFromEval(couponCode, priced.coupon);

  return mintSuccess({
    deps,
    payload,
    quote: priced.quote,
    route,
    coupon,
  });
}

export async function defaultQuoteLockDeadline(
  env: CloudflareEnv,
  settingsVersionId: number,
): Promise<string | null> {
  return mintLockDeadline(env, settingsVersionId);
}

export { defaultRouteLegs, defaultLoadAndPrice };
