// apps/web/lib/ops/trip-change-facts.test.ts
//
// 26.2 P6: the trip facts of a place change on a paid trip. The quote pipeline runs for real with
// staff guards (no Turnstile, no public rate limit, the real daily Mapbox breaker, no customer
// minimum advance); Mapbox (retrieve, reverse, directions), the settings read and the price board
// are fakes. The facts travel signed from the preview to the confirm: the confirm makes no Mapbox
// call and takes nothing from the browser but the owner's choices.

import { describe, expect, it, vi } from "vitest";
import { mapboxBudgetKey } from "../abuse/breaker";
import type { QuotePipelineDeps } from "../quote/pipeline";
import { mintLock, verifyLock } from "../quote/lock";
import { ENGINE_VERSION } from "../version";
import type { TripChangeInput, TripTarget } from "./booking-change-map";
import { runTripFacts, verifyTripLock, type SavedTrip } from "./trip-change-facts";

const NOW = Date.parse("2026-10-01T08:00:00Z");
const NOW_ISO = new Date(NOW).toISOString();
const EXP = "2026-10-02T08:00:00.000Z";
const SECRET = "p6-test-secret";

function kv(start = 0) {
  const store = new Map<string, string>([[mapboxBudgetKey(NOW), String(start)]]);
  return {
    store,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => void store.set(k, v)),
  };
}

function envWith(units = 0) {
  const QUOTE_ABUSE = kv(units);
  return {
    env: { QUOTE_ABUSE, MAPBOX_DAILY_UNIT_SENTINEL: "5000", QUOTE_LOCK_SECRET: SECRET } as unknown as CloudflareEnv,
    units: () => Number(QUOTE_ABUSE.store.get(mapboxBudgetKey(NOW)) ?? 0),
  };
}

const saved: SavedTrip = {
  pickupText: "Zurich Oerlikon station", pickupPlaceId: "mb-oerlikon", pickupLat: 47.4115, pickupLng: 8.5442,
  dropoffText: "Zurich Airport", dropoffPlaceId: "mb-zrh", dropoffLat: 47.4504, dropoffLng: 8.5624,
  flightNo: null,
};
const noChange: TripChangeInput = { pickup: null, dropoff: null, scheduledLocal: null, pax: null, bags: null, lock: null, driver: null };
const zugPick = { kind: "retrieve" as const, mapbox_id: "mb-zug", session_token: "tok-owner", text: "Zug station, Bahnhofplatz, 6300 Zug" };
const target: TripTarget = { ok: true, scheduledLocal: "2026-10-08T08:00", pax: 3, bags: 2, placesChanged: true, timeChanged: false, partyChanged: false };

const PLACES: Record<string, { name: string; lng: number; lat: number; canton: string | null; cityId: string | null; isAirport: boolean }> = {
  "mb-zug": { name: "Zug station", lng: 8.5152, lat: 47.1737, canton: "ZG", cityId: "city-zug", isAirport: false },
  "mb-zrh": { name: "Zurich Airport", lng: 8.5625, lat: 47.4505, canton: "ZH", cityId: "city-kloten", isAirport: true },
  "mb-oerlikon": { name: "Oerlikon", lng: 8.5442, lat: 47.4115, canton: "ZH", cityId: "city-zurich", isAirport: false },
  "mb-dubai": { name: "Dubai Marina", lng: 55.14, lat: 25.08, canton: null, cityId: "city-dubai", isAirport: false },
};

function geo() {
  const retrieve = vi.fn(async (input: { mapboxId: string; sessionToken: string }) => {
    const p = PLACES[input.mapboxId];
    return {
      place: p
        ? { mapbox_id: input.mapboxId, name: p.name, address: "", lng: p.lng, lat: p.lat, canton: p.canton, cityId: p.cityId, cityName: null, isAirport: p.isAirport }
        : null,
    };
  });
  const reverse = vi.fn(async (input: { lng: number; lat: number }) => ({
    place: { name: "Somewhere", address: "", lng: input.lng, lat: input.lat, canton: "ZH", cityId: "city-zurich", cityName: null, isAirport: false },
  }));
  return { retrieve, reverse };
}

function pipelineDeps(env: CloudflareEnv, route: { distance_m: number; duration_s: number } | null = { distance_m: 42_517, duration_s: 3_300 }): QuotePipelineDeps {
  return {
    env,
    lockSecrets: { current: SECRET },
    nowMs: NOW,
    computedAt: NOW_ISO,
    nowIso: NOW_ISO,
    engineVersion: ENGINE_VERSION,
    quoteLockDeadline: async () => EXP,
    loadAndPrice: async (_e, input) => ({
      ok: true,
      quote: {
        no_eligible_class: true, classes: [], policy: null, rate_version: { id: 18, slug: "rv-18" }, engine_version: ENGINE_VERSION,
        pricing_live: true, settings_version_id: 4, partially_priced_class_slugs: [], computed_at: input.computed_at,
      },
    }),
    loadSettings: async () => ({ id: 4, min_advance_minutes: 180, service_area_geojson: null }),
    routeLegs: vi.fn(async (legs) =>
      route
        ? { ok: true as const, legs: legs.map((_l: unknown, i: number) => ({ leg_seq: (i + 1) as 1 | 2, ...route, geometry: { type: "LineString" as const, coordinates: [] } })) }
        : { ok: false as const, code: "route_unavailable" as const },
    ),
  };
}

describe("the trip facts of a new place (preview)", () => {
  it("the pick is resolved with the owner's search session, the other end from its saved place and coordinates", async () => {
    const { env, units } = envWith();
    const g = geo();
    const deps = pipelineDeps(env);
    const out = await runTripFacts(env, { locale: "de", saved, trip: { ...noChange, pickup: zugPick }, target }, { pipelineDeps: deps, ...g, nowMs: NOW });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(g.retrieve.mock.calls.map((c) => [c[0].mapboxId, c[0].sessionToken === "tok-owner"])).toEqual([["mb-zug", true], ["mb-zrh", false]]);
    // The route runs from the NEW pickup to the destination as SAVED (its stored coordinates).
    const legs = (deps.routeLegs as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(legs).toEqual([{ origin: { lng: 8.5152, lat: 47.1737 }, destination: { lng: 8.5624, lat: 47.4504 } }]);
    // Two retrieves and one Directions call are counted in the daily Mapbox limit.
    expect(units()).toBe(3);
    expect(out.facts).toMatchObject({
      scheduledLocal: "2026-10-08T08:00", distanceM: 42_517, distanceToleranceM: 0, durationS: 3_300,
      originPlace: "Zug station", destPlace: "Zurich Airport", originCanton: "ZG", destCanton: "ZH",
      originCityId: "city-zug", destCityId: "city-kloten", originIsAirport: false, pax: 3, bags: 2,
    });
    expect(out.leg).toEqual({
      pickup_text: "Zug station", pickup_place_id: "mb-zug", pickup_lat: 47.1737, pickup_lng: 8.5152,
      estimated_duration_minutes: 55,
    });
    expect(out.distanceKm).toBe(42.52);
    expect(out.durationMin).toBe(55);
    expect(out.pickupIsAirport).toBe(false);
    const verified = await verifyLock({ current: SECRET }, out.lock, NOW_ISO);
    expect(verified.ok).toBe(true);
  });

  it("a new airport pickup says so (the flight number comes first)", async () => {
    const { env } = envWith();
    const g = geo();
    const out = await runTripFacts(
      env,
      { locale: "en", saved: { ...saved, dropoffText: "Zug", dropoffPlaceId: "mb-zug", dropoffLat: 47.1737, dropoffLng: 8.5152 },
        trip: { ...noChange, pickup: { ...zugPick, mapbox_id: "mb-zrh" } }, target },
      { pipelineDeps: pipelineDeps(env), ...g, nowMs: NOW },
    );
    expect(out).toMatchObject({ ok: true, pickupIsAirport: true, facts: { originIsAirport: true } });
  });

  it("a saved place Mapbox no longer finds falls back to its saved coordinates", async () => {
    const { env } = envWith();
    const g = geo();
    const out = await runTripFacts(env, { locale: "en", saved: { ...saved, dropoffPlaceId: "mb-gone" }, trip: { ...noChange, pickup: zugPick }, target },
      { pipelineDeps: pipelineDeps(env), ...g, nowMs: NOW });
    expect(out.ok).toBe(true);
    expect(g.reverse).toHaveBeenCalledWith(expect.objectContaining({ lng: 8.5624, lat: 47.4504 }), env);
  });

  it("a place outside the area the site books is refused under its field (D2)", async () => {
    const { env } = envWith();
    const out = await runTripFacts(env, { locale: "en", saved, trip: { ...noChange, pickup: { ...zugPick, mapbox_id: "mb-dubai" } }, target },
      { pipelineDeps: pipelineDeps(env), ...geo(), nowMs: NOW });
    expect(out).toEqual({ ok: false, code: "place-not-served", field: "pickup" });
  });

  it("a destination on the pickup is the same place", async () => {
    const { env } = envWith();
    const out = await runTripFacts(env, { locale: "en", saved, trip: { ...noChange, dropoff: { ...zugPick, mapbox_id: "mb-oerlikon" } }, target },
      { pipelineDeps: pipelineDeps(env), ...geo(), nowMs: NOW });
    expect(out).toEqual({ ok: false, code: "same-place", field: "dropoff" });
  });

  it("no road route is refused, never priced at 0 km", async () => {
    const { env } = envWith();
    const out = await runTripFacts(env, { locale: "en", saved, trip: { ...noChange, dropoff: zugPick }, target },
      { pipelineDeps: pipelineDeps(env, null), ...geo(), nowMs: NOW });
    expect(out).toEqual({ ok: false, code: "no-route", field: "dropoff" });
  });

  it("a pick Mapbox cannot resolve is refused under its field", async () => {
    const { env } = envWith();
    const out = await runTripFacts(env, { locale: "en", saved, trip: { ...noChange, pickup: { ...zugPick, mapbox_id: "mb-unknown" } }, target },
      { pipelineDeps: pipelineDeps(env), ...geo(), nowMs: NOW });
    expect(out).toEqual({ ok: false, code: "place-not-served", field: "pickup" });
  });

  it("the daily Mapbox limit reached: nothing is called", async () => {
    const { env } = envWith(5000);
    const g = geo();
    const out = await runTripFacts(env, { locale: "en", saved, trip: { ...noChange, pickup: zugPick }, target },
      { pipelineDeps: pipelineDeps(env), ...g, nowMs: NOW });
    expect(out).toEqual({ ok: false, code: "temporarily-unavailable" });
    expect(g.retrieve).not.toHaveBeenCalled();
  });

  it("the other end has no saved coordinates: the trip cannot be priced again", async () => {
    const { env } = envWith();
    const out = await runTripFacts(env, { locale: "en", saved: { ...saved, dropoffLat: null, dropoffLng: null }, trip: { ...noChange, pickup: zugPick }, target },
      { pipelineDeps: pipelineDeps(env), ...geo(), nowMs: NOW });
    expect(out).toEqual({ ok: false, code: "trip-data" });
  });

  it("the customer's minimum advance does not bind the owner (a pickup 1 h away)", async () => {
    const { env } = envWith();
    const out = await runTripFacts(env, { locale: "en", saved, trip: { ...noChange, pickup: zugPick }, target: { ...target, scheduledLocal: "2026-10-01T11:00" } },
      { pipelineDeps: pipelineDeps(env), ...geo(), nowMs: NOW });
    expect(out.ok).toBe(true);
  });
});

describe("the signed facts at confirm (no Mapbox call, nothing from the browser)", () => {
  async function preview(trip: TripChangeInput = { ...noChange, pickup: zugPick }) {
    const { env } = envWith();
    const out = await runTripFacts(env, { locale: "de", saved, trip, target }, { pipelineDeps: pipelineDeps(env), ...geo(), nowMs: NOW });
    if (!out.ok) throw new Error("preview refused");
    return { env, out };
  }

  it("the same facts come back from the lock", async () => {
    const { env, out } = await preview();
    const g = geo();
    const back = await verifyTripLock(env, out.lock, { locale: "de", saved, trip: { ...noChange, pickup: zugPick }, target }, NOW_ISO);
    expect(back).toEqual({ ...out, ok: true });
    expect(g.retrieve).not.toHaveBeenCalled();
  });

  it("a lock that was changed, expired, or minted for another trip is refused", async () => {
    const { env, out } = await preview();
    const input = { locale: "de", saved, trip: { ...noChange, pickup: zugPick }, target };
    const [kid, body, mac] = out.lock.split(".");
    expect(await verifyTripLock(env, `${kid}.${body}x.${mac}`, input, NOW_ISO)).toEqual({ ok: false, code: "lock-invalid" });
    expect(await verifyTripLock(env, out.lock, input, "2026-10-03T00:00:00.000Z")).toEqual({ ok: false, code: "lock-invalid" });
    // Another booking (its destination is elsewhere), another pick, another time, another party.
    expect(await verifyTripLock(env, out.lock, { ...input, saved: { ...saved, dropoffLat: 47.0 } }, NOW_ISO)).toEqual({ ok: false, code: "lock-invalid" });
    expect(await verifyTripLock(env, out.lock, { ...input, trip: { ...input.trip, pickup: { ...zugPick, mapbox_id: "mb-other" } } }, NOW_ISO)).toEqual({ ok: false, code: "lock-invalid" });
    expect(await verifyTripLock(env, out.lock, { ...input, target: { ...target, scheduledLocal: "2026-10-08T09:00" } }, NOW_ISO)).toEqual({ ok: false, code: "lock-invalid" });
    expect(await verifyTripLock(env, out.lock, { ...input, target: { ...target, pax: 4 } }, NOW_ISO)).toEqual({ ok: false, code: "lock-invalid" });
    // A change of the destination cannot ride on a lock made for a new pickup.
    expect(await verifyTripLock(env, out.lock, { ...input, trip: { ...noChange, dropoff: zugPick } }, NOW_ISO)).toEqual({ ok: false, code: "lock-invalid" });
  });

  it("a lock of the public quote (no booking binding) cannot pass for this booking's facts", async () => {
    const { env } = await preview();
    const foreign = await mintLock({ current: SECRET }, {
      v: 1, quote_id: "q", exp: EXP, engine_version: ENGINE_VERSION, rate_version_id: 18, settings_version_id: 4, computed_at: NOW_ISO,
      display_currency: "CHF", mode: "one_way", pax: 3, bags: 2,
      legs: [{ leg_seq: 1, pickup: { lng: 8.5152, lat: 47.1737, text: "Zug station", place_id: "mb-zug" },
        dropoff: { lng: 9.0, lat: 47.0, text: "Elsewhere" }, scheduled_local: "2026-10-08T08:00", distance_m: 1000, duration_s: 60,
        origin_zone_id: null, dest_zone_id: null, flight_no: null, landing_source: null }],
      extras: null, coupon: null, class_totals: [],
    });
    expect(await verifyTripLock(env, foreign, { locale: "de", saved, trip: { ...noChange, pickup: zugPick }, target }, NOW_ISO))
      .toEqual({ ok: false, code: "lock-invalid" });
  });

  it("no lock secret bound: refused, never a lock signed with an empty key", async () => {
    const { out } = await preview();
    const env = { QUOTE_LOCK_SECRET: "" } as unknown as CloudflareEnv;
    expect(await verifyTripLock(env, out.lock, { locale: "de", saved, trip: { ...noChange, pickup: zugPick }, target }, NOW_ISO))
      .toEqual({ ok: false, code: "temporarily-unavailable" });
  });
});
