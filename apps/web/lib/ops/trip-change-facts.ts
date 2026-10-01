// apps/web/lib/ops/trip-change-facts.ts
//
// 26.2 P6: the trip facts of a place change on a PAID trip (plan signed 2026-10-01, step 1). The
// new place comes from the address search (suggest -> pick, as New trip); the quote pipeline then
// resolves it with Mapbox (retrieve), resolves the end that stays from its SAVED place and
// coordinates (airport, city and canton are not stored on a booking), checks the same place, the
// area the site books (D2) and asks Mapbox for the driving route — every call counted in the daily
// Mapbox limit, behind the real breaker. The staff door skips the public guards (Turnstile, the
// public rate limit) and the customer's minimum advance (the owner may change until the pickup
// time, P1 D8; a time that has passed is refused before this step).
//
// The facts travel SIGNED from the preview to the confirm, as a quote lock (QUOTE_LOCK_SECRET):
// the confirm verifies the lock and checks it belongs to this booking and this change (the end
// that stays at its saved coordinates, the picked place, the time, the party). No second Mapbox
// call, nothing taken from the browser. The lock's class totals are not money: the price always
// comes from P1's price step (booking-change-price.ts).

import { countMapboxUnit } from "../abuse/breaker";
import { breakerGuard } from "../abuse/guards";
import {
  retrieve as mapboxRetrieve,
  reverse as mapboxReverse,
  type GeoLanguage,
} from "../geo/mapbox";
import { insideEurope } from "../geo/serviceArea";
import { buildQuotePipelineDeps } from "../quote/deps";
import { verifyLock, type QuoteLockLeg, type QuoteLockPayload } from "../quote/lock";
import { lockSecretPresent } from "../quote/lock-secret";
import { runQuotePipeline, type QuotePipelineDeps, type ResolvedPlace } from "../quote/pipeline";
import type { PlaceInput } from "../quote/schema";
import type { ChangeFail, PlacePick, TripChangeInput, TripTarget } from "./booking-change-map";
import type { TripFacts } from "./booking-change-price";

/** The trip as the booking stores it (first leg). */
export type SavedTrip = {
  pickupText: string;
  pickupPlaceId: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  dropoffText: string;
  dropoffPlaceId: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  flightNo: string | null;
};

export type TripFactsInput = {
  /** The booking's language (Mapbox names and the lock's display text). */
  locale: string;
  saved: SavedTrip;
  trip: TripChangeInput;
  target: TripTarget;
};

/** The fields the change writes on the leg: the changed end(s) whole, and the route duration. */
export type TripLegWrite = {
  pickup_text?: string;
  pickup_place_id?: string | null;
  pickup_lat?: number;
  pickup_lng?: number;
  dropoff_text?: string;
  dropoff_place_id?: string | null;
  dropoff_lat?: number;
  dropoff_lng?: number;
  estimated_duration_minutes: number;
};

export type TripFactsOk = {
  ok: true;
  /** Signed; sent back at confirm. */
  lock: string;
  /** What the price kernel needs, with the exact distance of the new route. */
  facts: TripFacts;
  leg: TripLegWrite;
  /** For the price record (price_snapshots.distance_km numeric(7,2), duration_min). */
  distanceKm: number;
  durationMin: number;
  /** The (new) pickup is an airport: the flight number comes first. */
  pickupIsAirport: boolean;
};

export type TripFactsOptions = {
  pipelineDeps?: QuotePipelineDeps;
  retrieve?: typeof mapboxRetrieve;
  reverse?: typeof mapboxReverse;
  nowMs?: number;
};

type End = "pickup" | "dropoff";

function geoLanguage(locale: string): GeoLanguage {
  return locale === "de" || locale === "fr" || locale === "ar" ? locale : "en";
}

function lockSecret(env: CloudflareEnv): string {
  return env.QUOTE_LOCK_SECRET || process.env.QUOTE_LOCK_SECRET || "";
}

function savedEnd(saved: SavedTrip, end: End) {
  return end === "pickup"
    ? { text: saved.pickupText, placeId: saved.pickupPlaceId, lat: saved.pickupLat, lng: saved.pickupLng }
    : { text: saved.dropoffText, placeId: saved.dropoffPlaceId, lat: saved.dropoffLat, lng: saved.dropoffLng };
}

function pickOf(trip: TripChangeInput, end: End): PlacePick | null {
  return end === "pickup" ? trip.pickup : trip.dropoff;
}

/** The field a place refusal belongs under: the end that changed (the destination when both did). */
function changedField(trip: TripChangeInput): End {
  return trip.dropoff ? "dropoff" : "pickup";
}

/**
 * The pipeline resolves the pickup, then the destination (pipeline.ts resolve_coordinates, awaited
 * one after the other). A changed end is the owner's pick, resolved with his search session; an end
 * that stays keeps its saved text and coordinates and takes airport, city and canton from Mapbox
 * (its saved place id, else the place at its coordinates).
 */
function changeResolver(
  env: CloudflareEnv,
  nowMs: number,
  input: TripFactsInput,
  retrieve: typeof mapboxRetrieve,
  reverse: typeof mapboxReverse,
  seen: { resolved: Partial<Record<End, ResolvedPlace>>; failed: End | null },
) {
  const order: End[] = ["pickup", "dropoff"];
  let call = 0;
  return async (_place: PlaceInput, language: GeoLanguage): Promise<ResolvedPlace | null> => {
    const end = order[Math.min(call, 1)]!;
    call += 1;
    const pick = pickOf(input.trip, end);
    if (pick) {
      await countMapboxUnit(env, nowMs);
      let got: Awaited<ReturnType<typeof mapboxRetrieve>> = { place: null };
      try {
        got = await retrieve({ mapboxId: pick.mapbox_id, sessionToken: pick.session_token, language }, env);
      } catch {
        got = { place: null };
      }
      if (!got.place) {
        seen.failed = end;
        return null;
      }
      const resolved: ResolvedPlace = {
        lng: got.place.lng,
        lat: got.place.lat,
        text: got.place.name || pick.text,
        // The id the owner picked (the binding the confirm checks).
        place_id: pick.mapbox_id,
        canton: got.place.canton,
        cityId: got.place.cityId,
        cityName: got.place.cityName,
        isAirport: got.place.isAirport,
      };
      seen.resolved[end] = resolved;
      return resolved;
    }
    const kept = savedEnd(input.saved, end);
    if (kept.lat == null || kept.lng == null) {
      seen.failed = end;
      return null;
    }
    let facts: { canton: string | null; cityId: string | null; cityName: string | null; isAirport: boolean } | null = null;
    if (kept.placeId) {
      try {
        await countMapboxUnit(env, nowMs);
        const got = await retrieve({ mapboxId: kept.placeId, sessionToken: crypto.randomUUID(), language }, env);
        if (got.place) facts = got.place;
      } catch {
        facts = null;
      }
    }
    if (!facts) {
      try {
        await countMapboxUnit(env, nowMs);
        const got = await reverse({ lng: kept.lng, lat: kept.lat, language }, env);
        if (got.place) facts = got.place;
      } catch {
        facts = null;
      }
    }
    if (!facts) {
      seen.failed = end;
      return null;
    }
    const resolved: ResolvedPlace = {
      lng: kept.lng,
      lat: kept.lat,
      text: kept.text,
      ...(kept.placeId ? { place_id: kept.placeId } : {}),
      canton: facts.canton,
      cityId: facts.cityId,
      cityName: facts.cityName,
      isAirport: facts.isAirport,
    };
    seen.resolved[end] = resolved;
    return resolved;
  };
}

/** The quote body for the trip as edited. Places go to the resolver above; the body only has to parse. */
function pipelineBody(input: TripFactsInput): Record<string, unknown> | null {
  const place = (end: End): Record<string, unknown> | null => {
    const pick = pickOf(input.trip, end);
    if (pick) return { ...pick };
    const kept = savedEnd(input.saved, end);
    if (kept.lat == null || kept.lng == null) return null;
    return { kind: "pin", lng: kept.lng, lat: kept.lat };
  };
  const pickup = place("pickup");
  const dropoff = place("dropoff");
  if (!pickup || !dropoff) return null;
  return {
    locale: geoLanguage(input.locale),
    display_currency: "CHF",
    mode: "one_way",
    pickup,
    dropoff,
    legs: [{ leg_seq: 1, scheduled_local: input.target.scheduledLocal, flight_no: input.saved.flightNo }],
    pax: input.target.pax,
    bags: input.target.bags,
  };
}

/** Facts, leg fields and figures from a verified lock leg (the confirm and the preview read the same). */
function fromLockLeg(token: string, payload: QuoteLockPayload, leg: QuoteLockLeg, input: TripFactsInput): TripFactsOk {
  const write: TripLegWrite = { estimated_duration_minutes: Math.max(1, Math.round(leg.duration_s / 60)) };
  if (input.trip.pickup) {
    write.pickup_text = leg.pickup.text;
    write.pickup_place_id = leg.pickup.place_id ?? null;
    write.pickup_lat = leg.pickup.lat;
    write.pickup_lng = leg.pickup.lng;
  }
  if (input.trip.dropoff) {
    write.dropoff_text = leg.dropoff.text;
    write.dropoff_place_id = leg.dropoff.place_id ?? null;
    write.dropoff_lat = leg.dropoff.lat;
    write.dropoff_lng = leg.dropoff.lng;
  }
  return {
    ok: true,
    lock: token,
    facts: {
      scheduledLocal: input.target.scheduledLocal,
      distanceM: leg.distance_m,
      distanceToleranceM: 0,
      durationS: leg.duration_s,
      originZoneId: leg.origin_zone_id,
      destZoneId: leg.dest_zone_id,
      originPlace: leg.pickup.text || null,
      destPlace: leg.dropoff.text || null,
      originCanton: leg.origin_canton ?? null,
      destCanton: leg.dest_canton ?? null,
      originCityId: leg.origin_city_id ?? null,
      destCityId: leg.dest_city_id ?? null,
      originCityName: leg.origin_city_name ?? null,
      destCityName: leg.dest_city_name ?? null,
      originIsAirport: leg.origin_is_airport === true,
      flightNo: input.saved.flightNo,
      pax: payload.pax,
      bags: payload.bags,
    },
    leg: write,
    distanceKm: Math.round(leg.distance_m / 10) / 100,
    durationMin: Math.round(leg.duration_s / 60),
    pickupIsAirport: leg.origin_is_airport === true,
  };
}

/** The lock is this change of this booking: the end that stays where it is saved, the pick, the time, the party. */
function lockBelongs(payload: QuoteLockPayload, input: TripFactsInput): QuoteLockLeg | null {
  if (payload.v !== 1 || payload.mode !== "one_way" || payload.legs.length !== 1) return null;
  const leg = payload.legs[0]!;
  if (leg.scheduled_local !== input.target.scheduledLocal) return null;
  if (payload.pax !== input.target.pax || payload.bags !== input.target.bags) return null;
  for (const end of ["pickup", "dropoff"] as const) {
    const place = end === "pickup" ? leg.pickup : leg.dropoff;
    const pick = pickOf(input.trip, end);
    if (pick) {
      if (place.place_id !== pick.mapbox_id) return null;
    } else {
      const kept = savedEnd(input.saved, end);
      if (place.lat !== kept.lat || place.lng !== kept.lng) return null;
      if ((place.place_id ?? null) !== (kept.placeId ?? null)) return null;
    }
  }
  if (!input.trip.pickup && !input.trip.dropoff) return null;
  return leg;
}

/**
 * Preview: the facts of the trip as edited, signed. Refusals name their field (pickup, dropoff):
 * a place the site does not book, the same place at both ends, no road route, a pick Mapbox cannot
 * resolve. The daily Mapbox limit reached answers temporarily-unavailable before any call.
 */
export async function runTripFacts(
  env: CloudflareEnv,
  input: TripFactsInput,
  opts: TripFactsOptions = {},
): Promise<TripFactsOk | ChangeFail> {
  if (!input.trip.pickup && !input.trip.dropoff) return { ok: false, code: "invalid-body" };
  if (!lockSecretPresent(lockSecret(env), "/api/staff/bookings/change/preview")) {
    return { ok: false, code: "temporarily-unavailable" };
  }
  const body = pipelineBody(input);
  if (!body) return { ok: false, code: "trip-data" };

  const deps = opts.pipelineDeps ?? buildQuotePipelineDeps(env, { dashboardHost: false });
  const nowMs = opts.nowMs ?? deps.nowMs;
  const seen: { resolved: Partial<Record<End, ResolvedPlace>>; failed: End | null } = { resolved: {}, failed: null };
  const staffDeps: QuotePipelineDeps = {
    ...deps,
    // Staff door: signed-in, no Turnstile, no public rate limit. The Mapbox breaker stays.
    rateLimit: undefined,
    turnstile: undefined,
    mapboxBreaker: breakerGuard({ env, nowMs }),
    // P1 D8: the owner may change until the pickup time; a time that has passed is refused before.
    checkMinAdvance: () => ({ ok: true }),
    resolvePlace: changeResolver(env, nowMs, input, opts.retrieve ?? mapboxRetrieve, opts.reverse ?? mapboxReverse, seen),
  };

  let result: Awaited<ReturnType<typeof runQuotePipeline>>;
  try {
    result = await runQuotePipeline(body, staffDeps);
  } catch {
    return { ok: false, code: "temporarily-unavailable" };
  }
  if (!result.ok) {
    switch (result.code) {
      case "place_unresolved":
        if (seen.failed && !pickOf(input.trip, seen.failed)) return { ok: false, code: "trip-data" };
        return { ok: false, code: "place-not-served", field: seen.failed ?? changedField(input.trip) };
      case "same_place":
        return { ok: false, code: "same-place", field: changedField(input.trip) };
      case "out_of_service_area":
      case "place_out_of_box":
      case "service_area_undefined": {
        const outside = (["pickup", "dropoff"] as const).find((end) => {
          const r = seen.resolved[end];
          return pickOf(input.trip, end) && r && !insideEurope(r);
        });
        return { ok: false, code: "place-not-served", field: outside ?? changedField(input.trip) };
      }
      case "temporarily_unavailable":
      case "provider_unavailable":
      case "rate_limited":
        return { ok: false, code: "temporarily-unavailable" };
      case "pricing_not_live":
      case "no_settings_version":
        return { ok: false, code: "pricing-not-live" };
      case "untrusted_input":
      case "malformed":
        return { ok: false, code: "invalid-body" };
      default:
        return { ok: false, code: "unknown" };
    }
  }

  const leg = result.route.legs[0];
  if (!leg || leg.road === false || (leg.distance_m <= 0 && leg.duration_s <= 0)) {
    return { ok: false, code: "no-route", field: changedField(input.trip) };
  }
  const verified = await verifyLock(deps.lockSecrets, result.lock, deps.nowIso);
  if (!verified.ok) return { ok: false, code: "unknown" };
  const own = lockBelongs(verified.payload, input);
  if (!own) return { ok: false, code: "unknown" };
  return fromLockLeg(result.lock, verified.payload, own, input);
}

/**
 * Confirm: the facts of the preview, from its signed lock. Refused (lock-invalid) when the lock was
 * altered, has expired, or was made for another booking or another change; the owner previews again.
 */
export async function verifyTripLock(
  env: CloudflareEnv,
  token: string,
  input: TripFactsInput,
  nowIso: string,
): Promise<TripFactsOk | ChangeFail> {
  const current = lockSecret(env);
  if (!lockSecretPresent(current, "/api/staff/bookings/change")) return { ok: false, code: "temporarily-unavailable" };
  const previous = env.QUOTE_LOCK_SECRET_PREVIOUS || process.env.QUOTE_LOCK_SECRET_PREVIOUS;
  const verified = await verifyLock(previous ? { current, previous } : { current }, token, nowIso);
  if (!verified.ok) return { ok: false, code: "lock-invalid" };
  const leg = lockBelongs(verified.payload, input);
  if (!leg || (leg.distance_m <= 0 && leg.duration_s <= 0)) return { ok: false, code: "lock-invalid" };
  return fromLockLeg(token, verified.payload, leg, input);
}
