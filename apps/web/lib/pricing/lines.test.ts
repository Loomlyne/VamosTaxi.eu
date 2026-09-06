// apps/web/lib/pricing/lines.test.ts
//
// Per-leg line proofs (D-06, D-08, D-42, D-45, D-46). Every priced field is
// null (launch) or a unit-free synthetic integer — never a currency mark.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  buildExtraLines,
  buildFareLine,
  buildLegSurchargeLines,
  numberLines,
} from "./lines";
import type {
  DistanceRateRow,
  FixedRouteRow,
  QuoteLegInput,
  SettingsSnapshot,
  SurchargeRow,
  VehicleClassRow,
  ZoneRow,
} from "./types";

function cls(
  partial: Partial<VehicleClassRow> & Pick<VehicleClassRow, "slug">,
): VehicleClassRow {
  return {
    id: partial.id ?? `vc-${partial.slug}`,
    slug: partial.slug,
    passenger_capacity: partial.passenger_capacity ?? 3,
    luggage_capacity: partial.luggage_capacity ?? 3,
    sort_order: partial.sort_order ?? 0,
    active: partial.active ?? true,
  };
}

function leg(partial: Partial<QuoteLegInput> = {}): QuoteLegInput {
  return {
    leg_seq: partial.leg_seq ?? 1,
    scheduled_local: partial.scheduled_local ?? "2026-09-04T23:10",
    distance_m: partial.distance_m ?? 10_000,
    duration_s: partial.duration_s ?? 900,
    origin_zone_id: partial.origin_zone_id ?? "z-a",
    dest_zone_id: partial.dest_zone_id ?? "z-b",
    waypoints: partial.waypoints ?? [],
  };
}

function rate(
  partial: Partial<DistanceRateRow> & Pick<DistanceRateRow, "vehicle_class_id">,
): DistanceRateRow {
  return {
    id: partial.id ?? 1,
    rate_version_id: partial.rate_version_id ?? 1,
    vehicle_class_id: partial.vehicle_class_id,
    base_fare_rappen: partial.base_fare_rappen ?? null,
    per_km_rappen: partial.per_km_rappen ?? null,
    min_fare_rappen: partial.min_fare_rappen ?? null,
    max_pax: partial.max_pax ?? 3,
    available: partial.available ?? true,
  };
}

function fixed(
  partial: Partial<FixedRouteRow> &
    Pick<FixedRouteRow, "vehicle_class_id" | "origin_zone_id" | "dest_zone_id">,
): FixedRouteRow {
  return {
    id: partial.id ?? 1,
    rate_version_id: partial.rate_version_id ?? 1,
    origin_zone_id: partial.origin_zone_id,
    dest_zone_id: partial.dest_zone_id,
    vehicle_class_id: partial.vehicle_class_id,
    price_rappen: partial.price_rappen ?? null,
    live: partial.live ?? true,
  };
}

function surcharge(partial: Partial<SurchargeRow> & Pick<SurchargeRow, "code">): SurchargeRow {
  return {
    id: partial.id ?? 1,
    rate_version_id: partial.rate_version_id ?? 1,
    code: partial.code,
    kind: partial.kind ?? "amount",
    amount_rappen: partial.amount_rappen ?? null,
    percent: partial.percent ?? null,
    applies_to: partial.applies_to ?? "leg",
    active: partial.active ?? true,
    predicate: partial.predicate ?? { kind: "always" },
    quantity_source: partial.quantity_source ?? null,
  };
}

const business = cls({ slug: "business" });

const airportZone: ZoneRow = {
  id: "z-a",
  slug: "zrh-airport",
  iata: "ZRH",
  active: true,
  zone_type: "airport",
  tags: [],
};
const cityZone: ZoneRow = {
  id: "z-b",
  slug: "zurich-city",
  iata: null,
  active: true,
  zone_type: "city",
  tags: [],
};

const settings: SettingsSnapshot = {
  id: 1,
  slug: "baseline",
  free_cancel_hours: null,
  modification_deadline_hours: null,
  min_advance_minutes: null,
  airport_waiting_minutes: null,
  city_waiting_minutes: null,
  manage_link_validity_days: null,
  round_trip_discount_percent: null,
  night_window_start: null,
  night_window_end: null,
  night_window_tz: "Europe/Zurich",
  quote_lock_minutes: null,
  checkout_window_minutes: null,
  cancellation_tiers: [],
  policy_doc_slug: null,
  policy_doc_version: null,
};

describe("buildFareLine — fixed route (D-08)", () => {
  it("matches (origin,dest) as forward and ignores per-km fields", () => {
    const fr = fixed({
      vehicle_class_id: business.id,
      origin_zone_id: "z-a",
      dest_zone_id: "z-b",
      price_rappen: 5000,
      live: true,
      id: 9,
    });
    const line = buildFareLine({
      leg: leg(),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 100,
        per_km_rappen: 50,
        min_fare_rappen: 200,
      }),
      fixedRoutes: [fr],
      rateVersionId: 1,
    });
    expect(line.basis.rule).toBe("fixed_route");
    expect(line.basis.matched).toBe("forward");
    expect(line.i18n_key).toBe("price.line.fixed_route");
    expect(line.amount_rappen).toBe(5000);
    expect(line.basis).not.toHaveProperty("per_km_rappen");
    expect(line.basis).not.toHaveProperty("base_fare_rappen");
  });

  it("matches (dest,origin) as reverse with the same price", () => {
    const fr = fixed({
      vehicle_class_id: business.id,
      origin_zone_id: "z-b",
      dest_zone_id: "z-a",
      price_rappen: 4200,
      live: true,
    });
    const line = buildFareLine({
      leg: leg({ origin_zone_id: "z-a", dest_zone_id: "z-b" }),
      vehicleClass: business,
      distanceRate: null,
      fixedRoutes: [fr],
      rateVersionId: 1,
    });
    expect(line.basis.matched).toBe("reverse");
    expect(line.amount_rappen).toBe(4200);
  });

  it("does not match a live:false fixed route — falls to per-km", () => {
    const fr = fixed({
      vehicle_class_id: business.id,
      origin_zone_id: "z-a",
      dest_zone_id: "z-b",
      price_rappen: 5000,
      live: false,
    });
    const line = buildFareLine({
      leg: leg({ distance_m: 1000 }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 100,
        per_km_rappen: 200,
        min_fare_rappen: null,
      }),
      fixedRoutes: [fr],
      rateVersionId: 1,
    });
    expect(line.basis.rule).toBe("per_km");
    // base 100 + perKm(200, 1000) = 100 + 200 = 300
    expect(line.amount_rappen).toBe(300);
  });
});

describe("buildFareLine — blended km", () => {
  const bands = [
    { id: 1, rate_version_id: 1, from_km: 20, to_km: 50, per_km_rappen: 380 },
    { id: 2, rate_version_id: 1, from_km: 50, to_km: 100, per_km_rappen: 340 },
    { id: 3, rate_version_id: 1, from_km: 100, to_km: 150, per_km_rappen: 320 },
    { id: 4, rate_version_id: 1, from_km: 150, to_km: 200, per_km_rappen: 300 },
    { id: 5, rate_version_id: 1, from_km: 200, to_km: null, per_km_rappen: 280 },
  ];

  it("uses the class floor plus blended extra, not base+per_km", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: 70_000 }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        min_fare_rappen: 10000,
        base_fare_rappen: 1,
        per_km_rappen: 1,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
      distanceBands: bands,
    });
    expect(line.basis.rule).toBe("blended_km");
    expect(line.amount_rappen).toBe(28200);
  });
});

describe("buildFareLine — per_km and min-fare (D-06)", () => {
  it("computes base + perKm and sets i18n transfer + vehicleClass", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: 2500 }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 1000,
        per_km_rappen: 400,
        min_fare_rappen: null,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
    });
    // perKm(400, 2500) = roundHalfUp(1_000_000, 1000) = 1000; + base 1000 = 2000
    expect(line.basis.rule).toBe("per_km");
    expect(line.amount_rappen).toBe(2000);
    expect(line.i18n_key).toBe("price.line.transfer");
    expect(line.params).toEqual({ vehicleClass: "business" });
    expect(line.basis.min_fare_applied).toBe(false);
  });

  it("applies min_fare inside the fare line when sum is below minimum", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: 100 }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 50,
        per_km_rappen: 100,
        min_fare_rappen: 500,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
    });
    // raw = 50 + perKm(100,100)=50+10=60 → min 500
    expect(line.amount_rappen).toBe(500);
    expect(line.basis.min_fare_applied).toBe(true);
    expect(line.basis.base_fare_rappen).toBe(50);
    expect(line.basis.per_km_rappen).toBe(100);
  });

  it("launch state: all fare inputs null → amount null with complete basis", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: 18400 }),
      vehicleClass: business,
      distanceRate: rate({ vehicle_class_id: business.id }),
      fixedRoutes: [],
      rateVersionId: 1,
    });
    expect(line.amount_rappen).toBeNull();
    expect(line.basis.rule).toBe("per_km");
    expect(line.basis.per_km_rappen).toBeNull();
    expect(line.basis.base_fare_rappen).toBeNull();
    expect(line.basis.min_fare_rappen).toBeNull();
    expect(line.basis.min_fare_applied).toBe(false);
    expect(line.basis.distance_m).toBe(18400);
  });
});

describe("buildLegSurchargeLines (D-06, D-42)", () => {
  const farePriced = buildFareLine({
    leg: leg({ distance_m: 1000, scheduled_local: "2026-09-04T23:10" }),
    vehicleClass: business,
    distanceRate: rate({
      vehicle_class_id: business.id,
      base_fare_rappen: 1000,
      per_km_rappen: 0,
      min_fare_rappen: null,
    }),
    fixedRoutes: [],
    rateVersionId: 1,
  });

  it("percent surcharge is percentOf(fare line) with of_line_seq", () => {
    const night = surcharge({
      code: "night",
      kind: "percent",
      percent: "10",
      predicate: {
        kind: "local_time_window",
        tz: "Europe/Zurich",
        from: "20:00",
        to: "06:00",
      },
      id: 11,
    });
    const lines = buildLegSurchargeLines({
      leg: leg({ scheduled_local: "2026-09-04T23:10" }),
      fareLine: farePriced,
      surcharges: [night],
      zones: [airportZone, cityZone],
      settings,
      rateVersionId: 1,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.basis.rule).toBe("percent");
    expect(lines[0]!.basis.of_line_seq).toBe(farePriced.seq);
    expect(lines[0]!.basis.of_rappen).toBe(farePriced.amount_rappen);
    // 10% of 1000 = 100
    expect(lines[0]!.amount_rappen).toBe(100);
  });

  it("shuffling surcharge input yields byte-identical numbered output (D-06)", () => {
    const rows: SurchargeRow[] = [
      surcharge({
        code: "night",
        kind: "percent",
        percent: "10",
        predicate: {
          kind: "local_time_window",
          tz: "Europe/Zurich",
          from: "20:00",
          to: "06:00",
        },
        id: 11,
      }),
      surcharge({
        code: "airport_pickup",
        kind: "amount",
        amount_rappen: 300,
        predicate: { kind: "pickup_zone_type", zone_type: "airport" },
        id: 9,
      }),
      surcharge({
        code: "waiting_airport",
        kind: "included",
        predicate: { kind: "always" },
        id: 5,
      }),
    ];

    const build = (order: SurchargeRow[]) =>
      numberLines(
        buildLegSurchargeLines({
          leg: leg({ scheduled_local: "2026-09-04T23:10", origin_zone_id: "z-a" }),
          fareLine: farePriced,
          surcharges: order,
          zones: [airportZone, cityZone],
          settings: { ...settings, airport_waiting_minutes: null },
          rateVersionId: 1,
        }),
      );

    fc.assert(
      fc.property(fc.shuffledSubarray(rows, { minLength: 3, maxLength: 3 }), (perm) => {
        const a = JSON.stringify(build(perm));
        const b = JSON.stringify(build(rows));
        expect(a).toBe(b);
      }),
      { numRuns: 30 },
    );
  });

  it("included surcharge emits kind included, null amount, minutes from settings", () => {
    const waiting = surcharge({
      code: "waiting_airport",
      kind: "included",
      predicate: { kind: "always" },
      id: 5,
    });
    const withMinutes: SettingsSnapshot = {
      ...settings,
      airport_waiting_minutes: null, // launch — minutes may be null until seed
    };
    // D-42: real minutes when present
    const pricedSettings: SettingsSnapshot = {
      ...settings,
      airport_waiting_minutes: null,
    };
    // Use a non-policy number only in the test fixture path via synthetic field
    // injected through a local override object (launch-state amounts stay null).
    const lines = buildLegSurchargeLines({
      leg: leg(),
      fareLine: farePriced,
      surcharges: [waiting],
      zones: [airportZone, cityZone],
      settings: {
        ...pricedSettings,
        // unit-free synthetic minutes for the included-line shape proof
        airport_waiting_minutes: 7 as number,
      },
      rateVersionId: 1,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.kind).toBe("included");
    expect(lines[0]!.amount_rappen).toBeNull();
    expect(lines[0]!.params?.minutes).toBe(7);
    expect(lines[0]!.basis.source).toBe(
      "settings_versions.airport_waiting_minutes",
    );
    void withMinutes;
  });

  it("non-applying predicate emits NO line", () => {
    const night = surcharge({
      code: "night",
      kind: "percent",
      percent: "10",
      predicate: {
        kind: "local_time_window",
        tz: "Europe/Zurich",
        from: "20:00",
        to: "06:00",
      },
    });
    const lines = buildLegSurchargeLines({
      leg: leg({ scheduled_local: "2026-09-04T12:00" }),
      fareLine: farePriced,
      surcharges: [night],
      zones: [airportZone, cityZone],
      settings,
      rateVersionId: 1,
    });
    expect(lines).toHaveLength(0);
  });

  it("null operands still emit the line with null amount and complete basis", () => {
    const fareNull = buildFareLine({
      leg: leg(),
      vehicleClass: business,
      distanceRate: rate({ vehicle_class_id: business.id }),
      fixedRoutes: [],
      rateVersionId: 1,
    });
    const night = surcharge({
      code: "night",
      kind: "percent",
      percent: null,
      predicate: { kind: "always" },
    });
    const lines = buildLegSurchargeLines({
      leg: leg(),
      fareLine: fareNull,
      surcharges: [night],
      zones: [],
      settings,
      rateVersionId: 1,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.amount_rappen).toBeNull();
    expect(lines[0]!.basis.of_line_seq).toBe(fareNull.seq);
    expect(lines[0]!.basis.rule).toBe("percent");
  });
});

describe("buildExtraLines (D-45)", () => {
  const legsTwo = [
    leg({ leg_seq: 1 }),
    leg({ leg_seq: 2, origin_zone_id: "z-b", dest_zone_id: "z-a" }),
  ];

  it("child_seats: 1 on a two-leg return emits TWO lines, leg_seq 1 and 2, n:1", () => {
    const child = surcharge({
      code: "child_seat",
      kind: "amount",
      amount_rappen: 200,
      quantity_source: "child_seats",
      predicate: { kind: "quantity" },
      id: 14,
    });
    const lines = buildExtraLines({
      legs: legsTwo,
      surcharges: [child],
      extras: { child_seats: 1 },
      rateVersionId: 1,
    });
    expect(lines).toHaveLength(2);
    expect(lines.map((l) => l.leg_seq).sort()).toEqual([1, 2]);
    expect(lines.every((l) => l.params?.n === 1)).toBe(true);
    expect(lines.every((l) => l.leg_seq !== null)).toBe(true);
    expect(lines.every((l) => l.amount_rappen === 200)).toBe(true);
  });

  it("extra_stops: 2 emits ONE line on leg_seq 1 only, amount × 2", () => {
    const stop = surcharge({
      code: "extra_stop",
      kind: "amount",
      amount_rappen: 150,
      quantity_source: "extra_stops",
      predicate: { kind: "quantity" },
      id: 15,
    });
    const lines = buildExtraLines({
      legs: legsTwo,
      surcharges: [stop],
      extras: { extra_stops: 2 },
      rateVersionId: 1,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.leg_seq).toBe(1);
    expect(lines[0]!.params?.n).toBe(2);
    expect(lines[0]!.amount_rappen).toBe(300);
  });

  it("oversized_luggage: true duplicates onto both legs; false emits nothing", () => {
    const bag = surcharge({
      code: "oversized_luggage",
      kind: "amount",
      amount_rappen: 100,
      quantity_source: "oversize_bags",
      predicate: { kind: "quantity" },
      id: 16,
    });
    const on = buildExtraLines({
      legs: legsTwo,
      surcharges: [bag],
      extras: { oversized_luggage: true },
      rateVersionId: 1,
    });
    expect(on).toHaveLength(2);
    const off = buildExtraLines({
      legs: legsTwo,
      surcharges: [bag],
      extras: { oversized_luggage: false },
      rateVersionId: 1,
    });
    expect(off).toHaveLength(0);
  });

  it("quantity of zero emits no line", () => {
    const child = surcharge({
      code: "child_seat",
      kind: "amount",
      amount_rappen: 200,
      quantity_source: "child_seats",
      predicate: { kind: "quantity" },
    });
    const lines = buildExtraLines({
      legs: legsTwo,
      surcharges: [child],
      extras: { child_seats: 0 },
      rateVersionId: 1,
    });
    expect(lines).toHaveLength(0);
  });

  it("launch-state extras emit null amounts with n param", () => {
    const child = surcharge({
      code: "child_seat",
      kind: "amount",
      amount_rappen: null,
      quantity_source: "child_seats",
      predicate: { kind: "quantity" },
    });
    const lines = buildExtraLines({
      legs: [leg({ leg_seq: 1 })],
      surcharges: [child],
      extras: { child_seats: 1 },
      rateVersionId: null,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.amount_rappen).toBeNull();
    expect(lines[0]!.params?.n).toBe(1);
  });
});

describe("numberLines (T5)", () => {
  it("assigns consecutive seq independent of input order", () => {
    const a = {
      seq: 99,
      leg_seq: 1,
      kind: "surcharge" as const,
      code: "night",
      i18n_key: "price.surcharge.night.label",
      basis: { rule: "percent" as const, of_line_seq: 50 },
      amount_rappen: null,
    };
    const b = {
      seq: 50,
      leg_seq: 1,
      kind: "fare" as const,
      code: "distance_fare",
      i18n_key: "price.line.transfer",
      basis: { rule: "per_km" as const },
      amount_rappen: null,
    };
    const numbered = numberLines([a, b]);
    expect(numbered[0]!.code).toBe("distance_fare");
    expect(numbered[0]!.seq).toBe(1);
    expect(numbered[1]!.code).toBe("night");
    expect(numbered[1]!.seq).toBe(2);
    expect(numbered[1]!.basis.of_line_seq).toBe(1);
  });

  it("does not invent superseded i18n keys or vehicle_class param", () => {
    const line = buildFareLine({
      leg: leg(),
      vehicleClass: business,
      distanceRate: rate({ vehicle_class_id: business.id }),
      fixedRoutes: [],
      rateVersionId: null,
    });
    expect(line.i18n_key).not.toBe("price.line.return_discount");
    expect(line.params).not.toHaveProperty("vehicle_class");
    expect(line.params?.vehicleClass).toBe("business");
  });
});
