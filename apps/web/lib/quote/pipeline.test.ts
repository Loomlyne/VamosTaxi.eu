// apps/web/lib/quote/pipeline.test.ts
//
// Ordered §2 walk, coupon-only lock identity, extra_stops count-only, and
// injected-clock proofs. Geo, the database wrappers and the clock are
// stubs — no Docker, no network.

import { describe, expect, it } from "vitest";
import type { ClassBoardEntry, PolicySnapshot } from "../pricing/types";
import { mintLock } from "./lock";
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

  it("with unchanged waypoints returns the SAME quote_id and expires_at and re-runs neither step 10 nor 11", async () => {
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

  it("with changed waypoints returns a DIFFERENT quote_id, a later expires_at, and re-runs step 10", async () => {
    let quoteN = 0;
    let deadlineN = 0;
    const directionsRuns = { n: 0 };
    const deps = baseDeps({
      directionsRuns,
      mintQuoteId: () => {
        quoteN += 1;
        return quoteN === 1
          ? "11111111-1111-4111-8111-111111111111"
          : "22222222-2222-4222-8222-222222222222";
      },
      quoteLockDeadline: async () => {
        deadlineN += 1;
        return deadlineN === 1
          ? "2099-01-01T12:00:00.000Z"
          : "2099-06-01T12:00:00.000Z";
      },
    });
    const first = await runQuotePipeline(validBody(), deps);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const afterQuote = directionsRuns.n;
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
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.quote_id).not.toBe(first.quote_id);
    expect(again.expires_at > first.expires_at).toBe(true);
    expect(directionsRuns.n).toBeGreaterThan(afterQuote);
  });

  it("with extra_stops: 2 and no waypoints key returns ok and does not re-run step 10 (D-18)", async () => {
    const { ok: first, deps, directionsRuns } = await quoted();
    const afterQuote = directionsRuns.n;
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
    expect(again.ok).toBe(true);
    expect(directionsRuns.n).toBe(afterQuote);
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
