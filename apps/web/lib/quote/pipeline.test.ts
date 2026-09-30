// apps/web/lib/quote/pipeline.test.ts
//
// Ordered §2 walk, reprice lock identity, the refused stop fields, and
// injected-clock proofs. Geo, the database wrappers and the clock are
// stubs — no Docker, no network.

import { describe, expect, it } from "vitest";
import type { ClassBoardEntry, PolicySnapshot, QuoteInput } from "../pricing/types";
import { mintLock, verifyLock } from "./lock";
import type { QuoteLockPayload } from "./lock";
import {
  QUOTE_STEPS,
  runQuotePipeline,
  runRepricePipeline,
  type QuotePipelineDeps,
  type QuotePipelineOk,
} from "./pipeline";
import type { LoadAndPriceResult } from "./engine";

const FAKE_SECRET = "test-quote-lock-secret-current-not-real-00";

const ZURICH = { kind: "pin" as const, lng: 8.5417, lat: 47.3769, text: "Zurich HB" };
const ZRH = { kind: "pin" as const, lng: 8.5624, lat: 47.4504, text: "ZRH" };

const EXPECTED_STEP_IDS = [
  "zod",
  "worker_rate_limit",
  "turnstile",
  "daily_mapbox_breaker",
  "resolve_coordinates",
  "same_place",
  "country_box",
  "service_area",
  "min_advance",
  "directions",
  "lock_deadline",
  "price_and_mint",
] as const;

function board(): ClassBoardEntry[] {
  return [
    {
      slug: "economy",
      eligible: true,
      ineligible_reason: null,
      effective_max_pax: 3,
      max_bags: 3,
      fixed_route: false,
      total_rappen: null,
      lines: [],
    },
    {
      slug: "business",
      eligible: true,
      ineligible_reason: null,
      effective_max_pax: 3,
      max_bags: 3,
      fixed_route: false,
      total_rappen: null,
      lines: [],
    },
    {
      slug: "van",
      eligible: true,
      ineligible_reason: null,
      effective_max_pax: 8,
      max_bags: 8,
      fixed_route: false,
      total_rappen: null,
      lines: [],
    },
  ];
}

function policy(): PolicySnapshot {
  return {
    settings_version_id: 1,
    free_cancel_hours: null,
    modification_deadline_hours: null,
    min_advance_minutes: null,
    airport_waiting_minutes: null,
    city_waiting_minutes: null,
    cancellation_tiers: [],
    policy_doc: null,
  };
}

function pricedOk(): LoadAndPriceResult {
  return {
    ok: true,
    quote: {
      no_eligible_class: false,
      classes: board(),
      policy: policy(),
      rate_version: null,
      engine_version: "quote-engine@test",
      pricing_live: false,
      settings_version_id: 1,
      partially_priced_class_slugs: [],
      computed_at: "2026-08-28T12:00:00.000Z",
    },
  };
}

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    locale: "en",
    display_currency: "CHF",
    mode: "one_way",
    pickup: ZURICH,
    dropoff: ZRH,
    legs: [{ leg_seq: 1, scheduled_local: "2026-09-01T10:30" }],
    pax: 2,
    bags: 1,
    ...overrides,
  };
}

function fakeEnv(): CloudflareEnv {
  return {} as CloudflareEnv;
}

function geometry(): RouteLegGeometry {
  return {
    type: "LineString",
    coordinates: [
      [ZURICH.lng, ZURICH.lat],
      [ZRH.lng, ZRH.lat],
    ],
  };
}

type RouteLegGeometry = {
  type: "LineString";
  coordinates: [number, number][];
};

function stubRoute(legs: Array<{ origin: unknown; destination: unknown }>) {
  return {
    ok: true as const,
    legs: legs.map((_, i) => ({
      leg_seq: (i === 0 ? 1 : 2) as 1 | 2,
      distance_m: 12_000,
      duration_s: 1_200,
      geometry: geometry(),
    })),
  };
}

function baseDeps(
  overrides: Partial<QuotePipelineDeps> & {
    directionsRuns?: { n: number };
    deadlineRuns?: { n: number };
  } = {},
): QuotePipelineDeps {
  const directionsRuns = overrides.directionsRuns ?? { n: 0 };
  const deadlineRuns = overrides.deadlineRuns ?? { n: 0 };
  const {
    directionsRuns: _d,
    deadlineRuns: _dl,
    ...rest
  } = overrides;
  return {
    env: fakeEnv(),
    lockSecrets: { current: FAKE_SECRET },
    nowMs: Date.UTC(2026, 7, 1, 8, 0, 0),
    computedAt: "2026-08-28T12:00:00.000Z",
    nowIso: "2026-08-28T12:00:00.000Z",
    engineVersion: "quote-engine@testhash",
    mintQuoteId: () => "11111111-1111-4111-8111-111111111111",
    loadSettings: async () => ({
      id: 1,
      min_advance_minutes: null,
      service_area_geojson: null,
    }),
    checkServiceArea: () => ({ ok: true }),
    quoteLockDeadline: async () => {
      deadlineRuns.n += 1;
      return "2099-01-01T12:00:00.000Z";
    },
    loadAndPrice: async () => pricedOk(),
    routeLegs: async (legs) => {
      directionsRuns.n += legs.length;
      return stubRoute(legs);
    },
    reverse: async () => ({ place: null }),
    retrieve: async () => ({ place: null }),
    ...rest,
  };
}

describe("QUOTE_STEPS step order", () => {
  it("is a frozen array whose twelve ids match §2 exactly", () => {
    expect(Object.isFrozen(QUOTE_STEPS)).toBe(true);
    expect(QUOTE_STEPS.map((s) => s.id)).toEqual([...EXPECTED_STEP_IDS]);
    expect(QUOTE_STEPS).toHaveLength(12);
  });
});

describe("runQuotePipeline", () => {
  it("short-circuits at the first failing step: 6+8+9 together return same_place", async () => {
    let serviceCalled = false;
    let minCalled = false;
    const result = await runQuotePipeline(
      validBody({
        dropoff: { ...ZURICH, text: "also zurich" },
      }),
      baseDeps({
        checkServiceArea: () => {
          serviceCalled = true;
          return { ok: false, code: "out_of_service_area" };
        },
        checkMinAdvance: () => {
          minCalled = true;
          return { ok: false, code: "min_advance", params: { minutes: 180 } };
        },
        loadSettings: async () => ({
          id: 1,
          min_advance_minutes: 180,
          service_area_geojson: null,
        }),
      }),
    );
    expect(result).toEqual({ ok: false, code: "same_place" });
    expect(serviceCalled).toBe(false);
    expect(minCalled).toBe(false);
  });

  it("skips step 9 entirely when min_advance_minutes is null, even one minute away", async () => {
    // 2026-09-01T10:30 Europe/Zurich = 08:30Z; one minute earlier is 08:29Z.
    const result = await runQuotePipeline(
      validBody(),
      baseDeps({
        nowMs: Date.UTC(2026, 8, 1, 8, 29, 0),
        loadSettings: async () => ({
          id: 1,
          min_advance_minutes: null,
          service_area_geojson: null,
        }),
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("returns min_advance with params when the threshold is set and pickup is too soon", async () => {
    const result = await runQuotePipeline(
      validBody(),
      baseDeps({
        nowMs: Date.UTC(2026, 8, 1, 8, 29, 0),
        loadSettings: async () => ({
          id: 1,
          min_advance_minutes: 180,
          service_area_geojson: null,
        }),
        checkServiceArea: () => ({ ok: true }),
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("min_advance");
    expect(result.params).toEqual({ minutes: 180 });
  });

  it("runs green with steps 2/3/4 absent (injected no-ops)", async () => {
    const result = await runQuotePipeline(validBody(), baseDeps());
    expect(result.ok).toBe(true);
  });

  it("calls injected guards in §2 position, breaker before resolve", async () => {
    const order: string[] = [];
    const result = await runQuotePipeline(
      validBody(),
      baseDeps({
        rateLimit: async () => {
          order.push("rate");
          return { ok: true };
        },
        turnstile: async () => {
          order.push("turnstile");
          return { ok: true };
        },
        mapboxBreaker: async () => {
          order.push("breaker");
          return { ok: false, code: "temporarily_unavailable" };
        },
        resolvePlace: async () => {
          order.push("resolve");
          return { lng: ZURICH.lng, lat: ZURICH.lat, text: ZURICH.text };
        },
      }),
    );
    expect(result).toEqual({ ok: false, code: "temporarily_unavailable" });
    expect(order).toEqual(["rate", "turnstile", "breaker"]);
  });

  it("calls step 10 once per leg regardless of how many classes the book carries", async () => {
    const directionsRuns = { n: 0 };
    const result = await runQuotePipeline(
      validBody(),
      baseDeps({ directionsRuns }),
    );
    expect(result.ok).toBe(true);
    expect(directionsRuns.n).toBe(1);
  });

  it("does not refuse the quote when Directions returns route_unavailable (D-26)", async () => {
    const result = await runQuotePipeline(
      validBody(),
      baseDeps({
        routeLegs: async () => ({ ok: false, code: "route_unavailable" }),
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("takes exp from quoteLockDeadline; advancing the system clock does not change expires_at", async () => {
    const frozen = "2099-01-01T12:00:00.000Z";
    const depsA = baseDeps({
      nowMs: 1,
      quoteLockDeadline: async () => frozen,
    });
    const a = await runQuotePipeline(validBody(), depsA);
    const depsB = baseDeps({
      nowMs: 1 + 3_600_000,
      quoteLockDeadline: async () => frozen,
    });
    const b = await runQuotePipeline(validBody(), depsB);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.expires_at).toBe(frozen);
    expect(b.expires_at).toBe(frozen);
  });

  it("refuses hourly as mode_not_offered at step 1", async () => {
    const result = await runQuotePipeline(
      validBody({ mode: "hourly" }),
      baseDeps(),
    );
    expect(result).toEqual({ ok: false, code: "mode_not_offered" });
  });

  it("normalises one-way to one_way at step 1", async () => {
    const result = await runQuotePipeline(
      validBody({ mode: "one-way" }),
      baseDeps(),
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a retrieve that does not resolve as place_unresolved", async () => {
    const result = await runQuotePipeline(
      validBody({
        pickup: {
          kind: "retrieve",
          mapbox_id: "unknown",
          session_token: "sess",
          text: "Somewhere",
        },
      }),
      baseDeps(),
    );
    expect(result).toEqual({ ok: false, code: "place_unresolved" });
  });

  describe("boundary facts and flight number thread to the kernel (D-08b, D-10, 26.1-09)", () => {
    it("threads legs[0].flight_no into QuoteLegInput.flight_no", async () => {
      let captured: QuoteInput | undefined;
      const result = await runQuotePipeline(
        validBody({
          legs: [
            { leg_seq: 1, scheduled_local: "2026-09-01T10:30", flight_no: "LX1234" },
          ],
        }),
        baseDeps({
          loadAndPrice: async (_env, input) => {
            captured = input;
            return pricedOk();
          },
        }),
      );
      expect(result.ok).toBe(true);
      expect(captured?.legs[0]?.flight_no).toBe("LX1234");
    });

    it("resolves canton, city id and airport flag for a PIN pickup via reverse (closes the pin-canton gap)", async () => {
      let captured: QuoteInput | undefined;
      const result = await runQuotePipeline(
        validBody(),
        baseDeps({
          reverse: async () => ({
            place: {
              name: "Zurich Airport",
              address: "Flughafen Zürich",
              lng: ZURICH.lng,
              lat: ZURICH.lat,
              canton: "ZH",
              cityId: "place.zurich",
              cityName: "Zürich",
              isAirport: true,
            },
          }),
          loadAndPrice: async (_env, input) => {
            captured = input;
            return pricedOk();
          },
        }),
      );
      expect(result.ok).toBe(true);
      expect(captured?.legs[0]?.origin_canton).toBe("ZH");
      expect(captured?.legs[0]?.origin_city_id).toBe("place.zurich");
      expect(captured?.legs[0]?.origin_is_airport).toBe(true);
    });

    it("an airport POI pickup produces origin_is_airport true and a non-airport pickup produces false", async () => {
      let captured: QuoteInput | undefined;
      const nonAirport = await runQuotePipeline(
        validBody(),
        baseDeps({
          reverse: async () => ({
            place: {
              name: "Bahnhofstrasse 1",
              address: "Bahnhofstrasse 1",
              lng: ZURICH.lng,
              lat: ZURICH.lat,
              canton: "ZH",
              cityId: "place.zurich",
              cityName: "Zürich",
              isAirport: false,
            },
          }),
          loadAndPrice: async (_env, input) => {
            captured = input;
            return pricedOk();
          },
        }),
      );
      expect(nonAirport.ok).toBe(true);
      expect(captured?.legs[0]?.origin_is_airport).toBe(false);
    });
  });

  describe("strict schema refuses client-sent boundary facts (D-08b/D-10)", () => {
    it.each(["origin_canton", "canton", "origin_city_id", "is_airport", "airport"])(
      "refuses a top-level %s as untrusted_input",
      async (field) => {
        const result = await runQuotePipeline(
          validBody({ [field]: field === "is_airport" ? true : "ZH" }),
          baseDeps(),
        );
        expect(result).toEqual({ ok: false, code: "untrusted_input" });
      },
    );
  });
});

describe("the lock carries and restores boundary facts across reprice (26.1-09)", () => {
  it("the lock pins origin_city_id/dest_city_id/origin_is_airport; inputFromLock restores them on a coupon-only reprice", async () => {
    const directionsRuns = { n: 0 };
    const deadlineRuns = { n: 0 };
    const deps = baseDeps({
      directionsRuns,
      deadlineRuns,
      reverse: async () => ({
        place: {
          name: "Zurich Airport",
          address: "Flughafen Zürich",
          lng: ZURICH.lng,
          lat: ZURICH.lat,
          canton: "ZH",
          cityId: "place.zurich",
          cityName: "Zürich",
          isAirport: true,
        },
      }),
    });
    const first = await runQuotePipeline(validBody(), deps);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    let captured: QuoteInput | undefined;
    const again = await runRepricePipeline(
      {
        quote_id: first.quote_id,
        lock: first.lock,
        locale: "en",
        display_currency: "CHF",
        coupon: "SAVE10",
      },
      {
        ...deps,
        loadAndPrice: async (_env, input) => {
          captured = input;
          return pricedOk();
        },
      },
    );
    expect(again.ok).toBe(true);
    expect(captured?.legs[0]?.origin_city_id).toBe("place.zurich");
    expect(captured?.legs[0]?.origin_is_airport).toBe(true);
  });

  it("a lock signed before origin_city_id/dest_city_id/origin_is_airport existed still verifies and prices with those fields undefined", async () => {
    const oldPayload: QuoteLockPayload = {
      v: 1,
      quote_id: "q_pre_26_1_09",
      exp: "2099-01-01T00:00:00.000Z",
      engine_version: "quote-engine@test",
      rate_version_id: null,
      settings_version_id: 1,
      computed_at: "2026-08-28T12:00:00.000Z",
      display_currency: "CHF",
      mode: "one_way",
      pax: 2,
      bags: 1,
      legs: [
        {
          leg_seq: 1,
          pickup: { lng: ZURICH.lng, lat: ZURICH.lat, text: "Zurich HB" },
          dropoff: { lng: ZRH.lng, lat: ZRH.lat, text: "ZRH" },
          scheduled_local: "2026-09-01T10:30:00",
          distance_m: 12_000,
          duration_s: 1_200,
          origin_zone_id: null,
          dest_zone_id: null,
          waypoints: [],
          flight_no: null,
          landing_source: null,
        },
      ],
      extras: null,
      coupon: null,
      class_totals: [],
    };
    const token = await mintLock({ current: FAKE_SECRET }, oldPayload);
    let captured: QuoteInput | undefined;
    const result = await runRepricePipeline(
      { quote_id: "q_pre_26_1_09", lock: token, locale: "en", display_currency: "CHF" },
      baseDeps({
        loadAndPrice: async (_env, input) => {
          captured = input;
          return pricedOk();
        },
      }),
    );
    expect(result.ok).toBe(true);
    expect(captured?.legs[0]?.origin_city_id).toBeNull();
    expect(captured?.legs[0]?.dest_city_id).toBeNull();
    expect(captured?.legs[0]?.origin_is_airport).toBe(false);
    // 26.1-11: an old lock has no display names — the pair row falls back to its plain label.
    expect(captured?.legs[0]?.origin_city_name).toBeNull();
    expect(captured?.legs[0]?.dest_city_name).toBeNull();
  });

  it("26.1-11: the Mapbox city name reaches the kernel on quote and survives the lock on reprice", async () => {
    const deps = baseDeps({
      reverse: async (input) => ({
        place: {
          name: input.lng === ZURICH.lng ? "Zurich HB" : "Zurich Airport",
          address: "",
          lng: input.lng,
          lat: input.lat,
          canton: "ZH",
          cityId: input.lng === ZURICH.lng ? "place.zurich" : "place.kloten",
          cityName: input.lng === ZURICH.lng ? "Zürich" : "Kloten",
          isAirport: input.lng !== ZURICH.lng,
        },
      }),
    });
    let quoted: QuoteInput | undefined;
    const first = await runQuotePipeline(validBody(), {
      ...deps,
      loadAndPrice: async (env, input) => {
        quoted = input;
        return deps.loadAndPrice(env, input);
      },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const origin = quoted?.legs[0]?.origin_city_name;
    const dest = quoted?.legs[0]?.dest_city_name;
    expect(origin).toBe("Zürich");
    expect(dest).toBe("Kloten");

    let repriced: QuoteInput | undefined;
    const again = await runRepricePipeline(
      {
        quote_id: first.quote_id,
        lock: first.lock,
        locale: "en",
        display_currency: "CHF",
        coupon: "SAVE10",
      },
      {
        ...deps,
        loadAndPrice: async (_env, input) => {
          repriced = input;
          return pricedOk();
        },
      },
    );
    expect(again.ok).toBe(true);
    expect(repriced?.legs[0]?.origin_city_name).toBe(origin);
    expect(repriced?.legs[0]?.dest_city_name).toBe(dest);
  });

  it("26.1-11: the lock pins each class's airport-fee and route-pair lines for display; a reprice re-signs them from the new board", async () => {
    const withRows = (): LoadAndPriceResult => {
      const base = pricedOk();
      if (!base.ok) return base;
      const classes = board().map((c) =>
        c.slug === "business"
          ? {
              ...c,
              lines: [
                {
                  seq: 1,
                  leg_seq: 1,
                  kind: "fare" as const,
                  code: "distance_fare",
                  i18n_key: "price.line.transfer",
                  basis: { rule: "per_km" },
                  amount_rappen: null,
                },
                {
                  seq: 2,
                  leg_seq: 1,
                  kind: "fare" as const,
                  code: "airport_fee",
                  i18n_key: "price.line.airport_fee",
                  basis: { rule: "airport_fee" },
                  amount_rappen: null,
                },
                {
                  seq: 3,
                  leg_seq: 1,
                  kind: "extra" as const,
                  code: "fixed_route",
                  i18n_key: "price.line.fixed_route",
                  params: { origin: "Zürich", destination: "Kloten" },
                  basis: { rule: "fixed_route", matched: "city" },
                  amount_rappen: null,
                },
              ],
            }
          : c,
      );
      return { ...base, quote: { ...base.quote, classes } };
    };
    const deps = baseDeps({ loadAndPrice: async () => withRows() });
    const first = await runQuotePipeline(validBody(), deps);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const verified = await verifyLock({ current: FAKE_SECRET }, first.lock, "2026-08-28T12:00:00.000Z");
    if (!verified.ok) throw new Error("lock did not verify");
    expect(verified.payload.price_rows).toEqual([
      {
        slug: "business",
        lines: [
          { code: "airport_fee", leg_seq: 1, amount_rappen: null },
          {
            code: "fixed_route",
            leg_seq: 1,
            amount_rappen: null,
            params: { origin: "Zürich", destination: "Kloten" },
          },
        ],
      },
    ]);

    const again = await runRepricePipeline(
      { quote_id: first.quote_id, lock: first.lock, locale: "en", display_currency: "CHF", coupon: "SAVE10" },
      { ...deps, loadAndPrice: async () => pricedOk() },
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const reverified = await verifyLock({ current: FAKE_SECRET }, again.lock, "2026-08-28T12:00:00.000Z");
    if (!reverified.ok) throw new Error("re-signed lock did not verify");
    expect(reverified.payload.price_rows).toBeUndefined();
  });
});

describe("runRepricePipeline", () => {
  async function quoted(
    extraDeps: Partial<QuotePipelineDeps> = {},
  ): Promise<{ ok: QuotePipelineOk; deps: QuotePipelineDeps; directionsRuns: { n: number }; deadlineRuns: { n: number } }> {
    const directionsRuns = { n: 0 };
    const deadlineRuns = { n: 0 };
    const deps = baseDeps({ directionsRuns, deadlineRuns, ...extraDeps });
    const result = await runQuotePipeline(validBody(), deps);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("quote failed");
    return { ok: result, deps, directionsRuns, deadlineRuns };
  }

  it("returns the SAME quote_id and expires_at and re-runs neither step 10 nor 11", async () => {
    const { ok: first, deps, directionsRuns, deadlineRuns } = await quoted();
    const afterQuoteDirections = directionsRuns.n;
    const afterQuoteDeadline = deadlineRuns.n;
    const again = await runRepricePipeline(
      {
        quote_id: first.quote_id,
        lock: first.lock,
        locale: "en",
        display_currency: "CHF",
        coupon: "SAVE10",
      },
      deps,
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.quote_id).toBe(first.quote_id);
    expect(again.expires_at).toBe(first.expires_at);
    expect(directionsRuns.n).toBe(afterQuoteDirections);
    expect(deadlineRuns.n).toBe(afterQuoteDeadline);
  });

  it("26.2-p4 D: a reprice body that carries a stop list is refused before any Directions call or Mapbox unit", async () => {
    const store = new Map<string, string>();
    const env = {
      QUOTE_ABUSE: {
        get: async (key: string) => store.get(key) ?? null,
        put: async (key: string, value: string) => {
          store.set(key, value);
        },
      },
    } as unknown as CloudflareEnv;
    const units = () => Number([...store.values()][0] ?? "0");
    const directionsRuns = { n: 0 };
    const deps = baseDeps({ env, directionsRuns });
    const first = await runQuotePipeline(validBody(), deps);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const afterQuote = { units: units(), directions: directionsRuns.n };
    const again = await runRepricePipeline(
      {
        quote_id: first.quote_id,
        lock: first.lock,
        locale: "en",
        display_currency: "CHF",
        extras: {
          extra_stops: 1,
          waypoints: [{ lng: 8.55, lat: 47.38, text: "stop" }],
        },
      },
      deps,
    );
    expect(again).toEqual({ ok: false, code: "extras_max_stops" });
    expect(units()).toBe(afterQuote.units);
    expect(directionsRuns.n).toBe(afterQuote.directions);
  });

  it("26.2-p4 D: a reprice body with extra_stops: 0 is refused too (there is no stop)", async () => {
    const { ok: first, deps } = await quoted();
    const again = await runRepricePipeline(
      {
        quote_id: first.quote_id,
        lock: first.lock,
        locale: "en",
        display_currency: "CHF",
        extras: { extra_stops: 0 },
      },
      deps,
    );
    expect(again).toEqual({ ok: false, code: "extras_max_stops" });
  });

  it("with extra_stops: 2 and no waypoints key returns extras_max_stops (D-21)", async () => {
    const { ok: first, deps } = await quoted();
    const again = await runRepricePipeline(
      {
        quote_id: first.quote_id,
        lock: first.lock,
        locale: "en",
        display_currency: "CHF",
        extras: { extra_stops: 2 },
      },
      deps,
    );
    expect(again).toEqual({ ok: false, code: "extras_max_stops" });
  });

  it("with extra_stops: 2 and three waypoints returns extras_max_stops", async () => {
    const result = await runRepricePipeline(
      {
        quote_id: "x",
        lock: "y",
        locale: "en",
        display_currency: "CHF",
        extras: {
          extra_stops: 2,
          waypoints: [
            { lng: 8.55, lat: 47.38, text: "a" },
            { lng: 8.56, lat: 47.39, text: "b" },
            { lng: 8.57, lat: 47.4, text: "c" },
          ],
        },
      },
      baseDeps(),
    );
    expect(result).toEqual({ ok: false, code: "extras_max_stops" });
  });

  it("with a body carrying pax returns untrusted_input", async () => {
    const token = await mintLock(
      { current: FAKE_SECRET },
      {
        v: 1,
        quote_id: "q",
        exp: "2099-01-01T00:00:00.000Z",
        engine_version: "quote-engine@test",
        rate_version_id: null,
        settings_version_id: 1,
        computed_at: "2026-08-28T12:00:00.000Z",
        display_currency: "CHF",
        mode: "one_way",
        pax: 2,
        bags: 1,
        legs: [],
        extras: null,
        coupon: null,
        class_totals: [],
      },
    );
    const result = await runRepricePipeline(
      {
        quote_id: "q",
        lock: token,
        locale: "en",
        display_currency: "CHF",
        pax: 4,
      },
      baseDeps(),
    );
    expect(result).toEqual({ ok: false, code: "untrusted_input" });
  });
});

describe("runRepricePipeline — checkout flight number re-signs the lock (D-08b, 26.1-30)", () => {
  async function quotedNoFlight() {
    const deps = baseDeps();
    const first = await runQuotePipeline(validBody(), deps);
    if (!first.ok) throw new Error("quote failed");
    return { first, deps };
  }

  async function lockLegs(token: string) {
    const verified = await verifyLock(
      { current: FAKE_SECRET },
      token,
      "2026-08-28T12:00:00.000Z",
    );
    if (!verified.ok) throw new Error("lock did not verify");
    return verified.payload.legs;
  }

  it("a new leg-1 flight number reaches the kernel and is pinned into the re-signed lock", async () => {
    const { first, deps } = await quotedNoFlight();
    expect((await lockLegs(first.lock))[0]?.flight_no).toBeNull();

    let captured: QuoteInput | undefined;
    const again = await runRepricePipeline(
      {
        quote_id: first.quote_id,
        lock: first.lock,
        locale: "en",
        display_currency: "CHF",
        legs: [{ leg_seq: 1, flight_no: " LX1234 " }],
      },
      {
        ...deps,
        loadAndPrice: async (_env, input) => {
          captured = input;
          return pricedOk();
        },
      },
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    // Kernel still sees the flight number (kept on the lock); it no longer adds a fee (26.4 D-08).
    expect(captured?.legs[0]?.flight_no).toBe("LX1234");
    expect((await lockLegs(again.lock))[0]?.flight_no).toBe("LX1234");
    // No route change: same quote identity, same deadline (like coupon-only).
    expect(again.quote_id).toBe(first.quote_id);
    expect(again.expires_at).toBe(first.expires_at);
  });

  it("an explicit null or blank clears the lock's flight number", async () => {
    const { first, deps } = await quotedNoFlight();
    const withFlight = await runRepricePipeline(
      {
        quote_id: first.quote_id,
        lock: first.lock,
        locale: "en",
        display_currency: "CHF",
        legs: [{ leg_seq: 1, flight_no: "LX1234" }],
      },
      deps,
    );
    if (!withFlight.ok) throw new Error("reprice failed");
    for (const cleared of [null, "   "]) {
      let captured: QuoteInput | undefined;
      const again = await runRepricePipeline(
        {
          quote_id: withFlight.quote_id,
          lock: withFlight.lock,
          locale: "en",
          display_currency: "CHF",
          legs: [{ leg_seq: 1, flight_no: cleared }],
        },
        {
          ...deps,
          loadAndPrice: async (_env, input) => {
            captured = input;
            return pricedOk();
          },
        },
      );
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(captured?.legs[0]?.flight_no).toBeNull();
      expect((await lockLegs(again.lock))[0]?.flight_no).toBeNull();
    }
  });

  it("a reprice without legs keeps the lock's flight number", async () => {
    const { first, deps } = await quotedNoFlight();
    const withFlight = await runRepricePipeline(
      {
        quote_id: first.quote_id,
        lock: first.lock,
        locale: "en",
        display_currency: "CHF",
        legs: [{ leg_seq: 1, flight_no: "LX1234" }],
      },
      deps,
    );
    if (!withFlight.ok) throw new Error("reprice failed");
    const again = await runRepricePipeline(
      {
        quote_id: withFlight.quote_id,
        lock: withFlight.lock,
        locale: "en",
        display_currency: "CHF",
        coupon: "SAVE10",
      },
      deps,
    );
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect((await lockLegs(again.lock))[0]?.flight_no).toBe("LX1234");
  });

  it("refuses a leg_seq the lock does not have", async () => {
    const { first, deps } = await quotedNoFlight();
    const result = await runRepricePipeline(
      {
        quote_id: first.quote_id,
        lock: first.lock,
        locale: "en",
        display_currency: "CHF",
        legs: [{ leg_seq: 2, flight_no: "LX1234" }],
      },
      deps,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("untrusted_input");
  });
});
