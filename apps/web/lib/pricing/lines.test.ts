// apps/web/lib/pricing/lines.test.ts
//
// Per-leg line proofs (D-06, D-11, D-12, D-13, D-14, D-17, D-42, D-45, D-46).
// Every priced field is null (launch) or a unit-free synthetic integer — never
// a currency mark.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  airportFeeApplies,
  attachPlaceZones,
  buildAirportFeeLine,
  buildExtraLines,
  buildFareLine,
  buildFixedRouteExtraLine,
  buildLegSurchargeLines,
  numberLines,
  zoneIdMatchingPlace,
} from "./lines";
import { buildCouponLine, sumPreCouponTotal } from "./policy";
import { perKm, roundHalfUp } from "./round";
import type {
  DistanceBandRow,
  DistanceRateRow,
  FixedRouteRow,
  Line,
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
    origin_zone_id:
      partial.origin_zone_id === undefined ? "z-a" : partial.origin_zone_id,
    dest_zone_id:
      partial.dest_zone_id === undefined ? "z-b" : partial.dest_zone_id,
    origin_canton: partial.origin_canton ?? null,
    dest_canton: partial.dest_canton ?? null,
    origin_place: partial.origin_place,
    dest_place: partial.dest_place,
    road: partial.road,
    flight_no: partial.flight_no,
    origin_is_airport: partial.origin_is_airport,
    origin_city_id: partial.origin_city_id,
    dest_city_id: partial.dest_city_id,
    origin_city_name: partial.origin_city_name,
    dest_city_name: partial.dest_city_name,
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
    airport_start_rappen: partial.airport_start_rappen ?? null,
    city_price_rappen: partial.city_price_rappen ?? null,
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
    kind: partial.kind,
    origin_label: partial.origin_label,
    dest_label: partial.dest_label,
  };
}

function band(
  partial: Pick<DistanceBandRow, "vehicle_class_id" | "from_km" | "per_km_rappen"> &
    Partial<DistanceBandRow>,
): DistanceBandRow {
  return {
    id: partial.id ?? 1,
    rate_version_id: partial.rate_version_id ?? 1,
    vehicle_class_id: partial.vehicle_class_id,
    from_km: partial.from_km,
    to_km: partial.to_km === undefined ? null : partial.to_km,
    per_km_rappen: partial.per_km_rappen,
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
const economy = cls({ slug: "economy" });

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
  it("a Mapbox place pin does not replace the distance fare or add a city extra", () => {
    const fr = fixed({
      vehicle_class_id: business.id,
      origin_zone_id: "z-a",
      dest_zone_id: "z-b",
      price_rappen: 5000,
      live: true,
      id: 9,
      kind: "place",
    });
    const journey = leg();
    const line = buildFareLine({
      leg: journey,
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
    const extra = buildFixedRouteExtraLine({
      leg: journey,
      vehicleClass: business,
      fixedRoutes: [fr],
      rateVersionId: 1,
    });
    expect(line.code).toBe("distance_fare");
    expect(line.basis.rule).toBe("per_km");
    expect(line.amount_rappen).toBe(100 + perKm(50, 10_000));
    expect(line.amount_rappen).not.toBe(5000);
    expect(extra).toBeNull();
  });

  it("D-17: does not match B→A as A→B — reverse is a separate row", () => {
    const fr = fixed({
      vehicle_class_id: business.id,
      origin_zone_id: "z-b",
      dest_zone_id: "z-a",
      price_rappen: 4200,
      live: true,
    });
    const line = buildFareLine({
      leg: leg({ origin_zone_id: "z-a", dest_zone_id: "z-b", distance_m: 1000 }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 100,
        per_km_rappen: 200,
      }),
      fixedRoutes: [fr],
      rateVersionId: 1,
    });
    expect(line.basis.rule).toBe("per_km");
    expect(line.basis.matched).toBeUndefined();
    expect(line.amount_rappen).toBe(100 + perKm(200, 1000));
    expect(line.amount_rappen).not.toBe(4200);
  });

  it("D-26: unrouted legs do not invent start+0km — only a matching fixed row prices", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: 0, road: false }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 10_000,
        per_km_rappen: 1_200,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
    });
    expect(line.amount_rappen).toBeNull();
    expect(line.basis.unrouted).toBe(true);
  });

  it("D-19: Mapbox metres still take start+km when driving had no road line", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: 75_000, road: false }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 10_000,
        per_km_rappen: 1_200,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
    });
    expect(line.amount_rappen).toBe(10_000 + perKm(1_200, 75_000));
    expect(line.basis.unrouted).toBeUndefined();
  });

  it("D-26: an unrouted place pin does not invent a fare or a city extra", () => {
    const fr = fixed({
      vehicle_class_id: business.id,
      origin_zone_id: "z-a",
      dest_zone_id: "z-b",
      price_rappen: 61_000,
      live: true,
      kind: "place",
    });
    const journey = leg({ distance_m: 0, road: false });
    const line = buildFareLine({
      leg: journey,
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 10_000,
        per_km_rappen: 1_200,
      }),
      fixedRoutes: [fr],
      rateVersionId: 1,
    });
    const extra = buildFixedRouteExtraLine({
      leg: journey,
      vehicleClass: business,
      fixedRoutes: [fr],
      rateVersionId: 1,
    });
    expect(line.basis.rule).toBe("per_km");
    expect(line.amount_rappen).toBeNull();
    expect(line.basis.unrouted).toBe(true);
    expect(extra).toBeNull();
  });

  it("D-26: Mapbox place names attach to service_zones so a typed fixed row prices", () => {
    const zermatt: ZoneRow = {
      id: "z-zermatt",
      slug: "zermatt",
      iata: null,
      active: true,
      zone_type: "ski",
      tags: ["ski"],
    };
    expect(
      zoneIdMatchingPlace("Zermatt, Bahnhofplatz", [zermatt, airportZone]),
    ).toBe("z-zermatt");
    const attached = attachPlaceZones(
      {
        mode: "one_way",
        pax: 1,
        bags: 0,
        display_currency: "CHF",
        computed_at: "2026-09-15T12:00:00.000Z",
        extras: {},
        coupon: null,
        legs: [
          leg({
            origin_zone_id: null,
            dest_zone_id: null,
            origin_place: "Interlaken",
            dest_place: "Zermatt, Valais",
            road: false,
            distance_m: 0,
          }),
        ],
      },
      [zermatt],
    );
    expect(attached.legs[0]?.dest_zone_id).toBe("z-zermatt");
  });

  it("D-20: a place pin does not replace the fare; the canton pair is the extra", () => {
    const zones: ZoneRow[] = [
      {
        id: "z-a",
        slug: "zurich-hb",
        iata: null,
        active: true,
        zone_type: "city",
        tags: ["canton:ZH"],
      },
      {
        id: "z-b",
        slug: "zermatt",
        iata: null,
        active: true,
        zone_type: "ski",
        tags: ["canton:VS"],
      },
      {
        id: "z-zh",
        slug: "canton-zh",
        iata: null,
        active: true,
        zone_type: "other",
        tags: ["canton:ZH"],
      },
      {
        id: "z-vs",
        slug: "canton-vs",
        iata: null,
        active: true,
        zone_type: "other",
        tags: ["canton:VS"],
      },
    ];
    const placeRow = fixed({
      id: 1,
      vehicle_class_id: business.id,
      origin_zone_id: "z-a",
      dest_zone_id: "z-b",
      price_rappen: 5000,
      live: true,
      kind: "place",
    });
    const cantonRow = fixed({
      id: 2,
      vehicle_class_id: business.id,
      origin_zone_id: "z-zh",
      dest_zone_id: "z-vs",
      price_rappen: 9000,
      live: true,
      kind: "canton",
    });
    const line = buildFareLine({
      leg: leg({
        origin_zone_id: "z-a",
        dest_zone_id: "z-b",
        origin_canton: "ZH",
        dest_canton: "VS",
        distance_m: 1000,
      }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 100,
        per_km_rappen: 200,
      }),
      fixedRoutes: [cantonRow, placeRow],
      rateVersionId: 1,
      zones,
    });
    expect(line.code).toBe("distance_fare");
    expect(line.amount_rappen).toBe(100 + perKm(200, 1000));
    const extra = buildFixedRouteExtraLine({
      leg: leg({
        origin_zone_id: "z-a",
        dest_zone_id: "z-b",
        origin_canton: "ZH",
        dest_canton: "VS",
        distance_m: 1000,
      }),
      vehicleClass: business,
      fixedRoutes: [cantonRow, placeRow],
      rateVersionId: 1,
      zones,
    });
    expect(extra?.basis.matched).toBe("canton");
    expect(extra?.amount_rappen).toBe(9000);
    expect(line.amount_rappen).not.toBe(5000);
  });

  it("D-20: canton→canton when no place row; empty canton table does not block", () => {
    const zones: ZoneRow[] = [
      {
        id: "z-zh",
        slug: "canton-zh",
        iata: null,
        active: true,
        zone_type: "other",
        tags: ["canton:ZH"],
      },
      {
        id: "z-vs",
        slug: "canton-vs",
        iata: null,
        active: true,
        zone_type: "other",
        tags: ["canton:VS"],
      },
      {
        id: "z-x",
        slug: "hotel",
        iata: null,
        active: true,
        zone_type: "city",
        tags: [],
      },
      {
        id: "z-y",
        slug: "resort",
        iata: null,
        active: true,
        zone_type: "ski",
        tags: [],
      },
    ];
    const cantonRow = fixed({
      vehicle_class_id: business.id,
      origin_zone_id: "z-zh",
      dest_zone_id: "z-vs",
      price_rappen: 8800,
      live: true,
      kind: "canton",
    });
    const cantonHit = buildFareLine({
      leg: leg({
        origin_zone_id: "z-x",
        dest_zone_id: "z-y",
        origin_canton: "ZH",
        dest_canton: "VS",
        distance_m: 1000,
      }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 100,
        per_km_rappen: 200,
      }),
      fixedRoutes: [cantonRow],
      rateVersionId: 1,
      zones,
    });
    expect(cantonHit.code).toBe("distance_fare");
    expect(cantonHit.amount_rappen).toBe(100 + perKm(200, 1000));
    const cantonExtra = buildFixedRouteExtraLine({
      leg: leg({
        origin_zone_id: "z-x",
        dest_zone_id: "z-y",
        origin_canton: "ZH",
        dest_canton: "VS",
        distance_m: 1000,
      }),
      vehicleClass: business,
      fixedRoutes: [cantonRow],
      rateVersionId: 1,
      zones,
    });
    expect(cantonExtra?.basis.matched).toBe("canton");
    expect(cantonExtra?.amount_rappen).toBe(8800);
    expect(cantonExtra?.kind).toBe("extra");

    const noCantonRows = buildFareLine({
      leg: leg({
        origin_zone_id: "z-x",
        dest_zone_id: "z-y",
        origin_canton: "ZH",
        dest_canton: "VS",
        distance_m: 1000,
      }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 100,
        per_km_rappen: 200,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
      zones,
    });
    expect(noCantonRows.basis.rule).toBe("per_km");
    expect(noCantonRows.amount_rappen).toBe(100 + perKm(200, 1000));
  });

  it("D-20: an airport pin is not a city or canton extra", () => {
    const zones: ZoneRow[] = [
      {
        id: "z-pin",
        slug: "zrh-pin",
        iata: "ZRH",
        active: true,
        zone_type: "airport",
        tags: [],
      },
      {
        id: "z-term",
        slug: "zrh-t2",
        iata: "ZRH",
        active: true,
        zone_type: "airport",
        tags: [],
      },
      {
        id: "z-hotel",
        slug: "hotel",
        iata: null,
        active: true,
        zone_type: "city",
        tags: [],
      },
    ];
    const row = fixed({
      vehicle_class_id: business.id,
      origin_zone_id: "z-pin",
      dest_zone_id: "z-hotel",
      price_rappen: 6100,
      live: true,
      kind: "place",
    });
    const line = buildFareLine({
      leg: leg({
        origin_zone_id: "z-term",
        dest_zone_id: "z-hotel",
        distance_m: 1000,
      }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 100,
        per_km_rappen: 200,
      }),
      fixedRoutes: [row],
      rateVersionId: 1,
      zones,
    });
    expect(line.code).toBe("distance_fare");
    expect(line.amount_rappen).toBe(100 + perKm(200, 1000));
    expect(
      buildFixedRouteExtraLine({
        leg: leg({
          origin_zone_id: "z-term",
          dest_zone_id: "z-hotel",
          distance_m: 1000,
        }),
        vehicleClass: business,
        fixedRoutes: [row],
        rateVersionId: 1,
        zones,
      }),
    ).toBeNull();
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

describe("buildFareLine — D-11 D-12 D-13 D-14 live distance recipe", () => {
  it("D-11: start + (all metres × per-km) with no bands", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: 40_000 }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 1000,
        per_km_rappen: 250,
        min_fare_rappen: 99_999,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
      distanceBands: [],
    });
    expect(line.amount_rappen).toBe(1000 + perKm(250, 40_000));
    expect(line.i18n_key).toBe("price.line.transfer");
    expect(line.params).toEqual({ vehicleClass: "business" });
  });

  it("D-12: 1 km uses that same recipe, no separate minimum", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: 1_000 }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 1000,
        per_km_rappen: 250,
        min_fare_rappen: 99_999,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
      distanceBands: [],
    });
    expect(line.amount_rappen).toBe(1000 + perKm(250, 1_000));
    expect(line.amount_rappen).not.toBe(99_999);
  });

  it("D-08: distance bands for the class never enter the fare amount", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: 40_000 }),
      vehicleClass: economy,
      distanceRate: rate({
        vehicle_class_id: economy.id,
        base_fare_rappen: 1000,
        per_km_rappen: 200,
        min_fare_rappen: 8_000,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
      distanceBands: [
        band({
          id: 1,
          vehicle_class_id: economy.id,
          from_km: 20,
          to_km: 50,
          per_km_rappen: 100,
        }),
        band({
          id: 2,
          vehicle_class_id: business.id,
          from_km: 20,
          to_km: 50,
          per_km_rappen: 999,
        }),
      ],
    });
    // D-08: start + all 40 km × 200 only — the [20, 50) band extra is ignored.
    expect(line.amount_rappen).toBe(1000 + perKm(200, 40_000));
  });

  it("D-08: an overlapping band book still ignores every band — no floor, no minimum", () => {
    const bands = [
      band({
        id: 1,
        vehicle_class_id: economy.id,
        from_km: 20,
        to_km: 50,
        per_km_rappen: 1000,
      }),
      band({
        id: 2,
        vehicle_class_id: economy.id,
        from_km: 30,
        to_km: 60,
        per_km_rappen: 180,
      }),
    ];
    const line = buildFareLine({
      leg: leg({ distance_m: 70_000 }),
      vehicleClass: economy,
      distanceRate: rate({
        vehicle_class_id: economy.id,
        base_fare_rappen: 0,
        per_km_rappen: 100,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
      distanceBands: bands,
    });
    expect(line.amount_rappen).toBe(perKm(100, 70_000));
  });

  it("D-11 D-12: no DISTANCE_FLOOR_KM and no min_fare_rappen floor on the live path", () => {
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
      distanceBands: [],
    });
    // raw = 50 + perKm(100, 100) = 60. min_fare 500 must not raise it.
    expect(line.amount_rappen).toBe(50 + perKm(100, 100));
    expect(line.amount_rappen).not.toBe(500);
  });

  it("D-13: 12.3 km stays 12300 metres into perKm then roundHalfUp to rappen", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: 12_300 }),
      vehicleClass: business,
      distanceRate: rate({
        vehicle_class_id: business.id,
        base_fare_rappen: 1000,
        per_km_rappen: 250,
        min_fare_rappen: null,
      }),
      fixedRoutes: [],
      rateVersionId: 1,
      distanceBands: [],
    });
    expect(perKm(250, 12_300)).toBe(roundHalfUp(250 * 12_300, 1_000));
    expect(line.amount_rappen).toBe(1000 + roundHalfUp(250 * 12_300, 1_000));
  });

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
    expect(line.amount_rappen).toBe(2000);
    expect(line.i18n_key).toBe("price.line.transfer");
    expect(line.params).toEqual({ vehicleClass: "business" });
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
    expect(line.basis.per_km_rappen).toBeNull();
    expect(line.basis.base_fare_rappen).toBeNull();
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

  // 26.2-p4 A4: no automatic waiting exists. A row's code decides nothing, so a
  // row coded waiting / waiting_airport / waiting_city is an ordinary row: no
  // included minutes are looked up by its code, and its amount is not forced to 0.
  const WAITING_CODES = ["waiting", "waiting_airport", "waiting_city"];
  const waitingSettings: SettingsSnapshot = {
    ...settings,
    // unit-free synthetic minutes: they must not reach a price line any more
    airport_waiting_minutes: 7 as number,
    city_waiting_minutes: 9 as number,
  };
  const linesFor = (row: SurchargeRow) =>
    buildLegSurchargeLines({
      leg: leg(),
      fareLine: farePriced,
      surcharges: [row],
      zones: [airportZone, cityZone],
      settings: waitingSettings,
      rateVersionId: 1,
    });
  /** The same lines with the row's code taken out, to compare two codes. */
  const withoutCode = (lines: Line[], code: string) =>
    JSON.parse(JSON.stringify(lines).split(code).join("CODE")) as unknown;

  it("an included row emits kind included and a null amount; no minutes are looked up by its code", () => {
    for (const code of WAITING_CODES) {
      const lines = linesFor(surcharge({ code, kind: "included", predicate: { kind: "always" }, id: 5 }));
      expect(lines, code).toHaveLength(1);
      expect(lines[0]!.kind, code).toBe("included");
      expect(lines[0]!.amount_rappen, code).toBeNull();
      expect(lines[0]!.params?.minutes ?? null, code).toBeNull();
      expect(lines[0]!.basis.included_minutes ?? null, code).toBeNull();
      expect(String(lines[0]!.basis.source ?? ""), code).not.toMatch(/waiting/);
    }
  });

  it("a row coded waiting gives exactly the lines of the same row under any other code", () => {
    const shapes: Array<Partial<SurchargeRow>> = [
      { kind: "included" },
      { kind: "amount", amount_rappen: 0 },
      { kind: "amount", amount_rappen: 1000 },
      { kind: "percent", percent: "10" },
    ];
    for (const shape of shapes) {
      const plain = withoutCode(linesFor(surcharge({ code: "roof-box", id: 5, ...shape })), "roof-box");
      for (const code of WAITING_CODES) {
        const named = withoutCode(linesFor(surcharge({ code, id: 5, ...shape })), code);
        expect(named, `${code} ${JSON.stringify(shape)}`).toEqual(plain);
      }
    }
  });

  it("does not charge a stated zero checkout extra and does charge 1 CHF", () => {
    const zero = buildLegSurchargeLines({
      leg: leg(),
      fareLine: farePriced,
      surcharges: [surcharge({ code: "child-seat", kind: "amount", amount_rappen: 0 })],
      zones: [airportZone, cityZone],
      settings,
      rateVersionId: 1,
    });
    expect(zero).toHaveLength(1);
    expect(zero[0]!.kind).toBe("included");
    expect(zero[0]!.amount_rappen).toBeNull();

    const oneChf = buildLegSurchargeLines({
      leg: leg(),
      fareLine: farePriced,
      surcharges: [surcharge({ code: "ski-bag", kind: "amount", amount_rappen: 100 })],
      zones: [airportZone, cityZone],
      settings,
      rateVersionId: 1,
    });
    expect(oneChf).toHaveLength(1);
    expect(oneChf[0]!.kind).toBe("surcharge");
    expect(oneChf[0]!.amount_rappen).toBe(100);
  });

  it("a row coded waiting with an amount and an applying rule is charged like any other row", () => {
    for (const code of WAITING_CODES) {
      const lines = linesFor(
        surcharge({ code, kind: "amount", amount_rappen: 1000, predicate: { kind: "always" }, id: 5 }),
      );
      expect(lines, code).toHaveLength(1);
      expect(lines[0]!.kind, code).toBe("surcharge");
      expect(lines[0]!.amount_rappen, code).toBe(1000);
      expect(lines[0]!.basis.payable_rappen, code).toBeUndefined();
    }
  });

  it("an extra the owner names 'Waiting' (manual rule) is never added by the quote", () => {
    for (const code of WAITING_CODES) {
      expect(
        linesFor(surcharge({ code, kind: "amount", amount_rappen: 1000, predicate: { kind: "manual" }, id: 5 })),
        code,
      ).toEqual([]);
    }
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

  it("child_seats and oversized still multiply amount × quantity", () => {
    const child = surcharge({
      code: "child_seat",
      kind: "amount",
      amount_rappen: 200,
      quantity_source: "child_seats",
      predicate: { kind: "quantity" },
      id: 14,
    });
    const bag = surcharge({
      code: "oversized_luggage",
      kind: "amount",
      amount_rappen: 100,
      quantity_source: "oversize_bags",
      predicate: { kind: "quantity" },
      id: 16,
    });
    const twoSeats = buildExtraLines({
      legs: [leg({ leg_seq: 1 })],
      surcharges: [child],
      extras: { child_seats: 2 },
      rateVersionId: 1,
    });
    expect(twoSeats).toHaveLength(1);
    expect(twoSeats[0]!.amount_rappen).toBe(400);
    const bags = buildExtraLines({
      legs: [leg({ leg_seq: 1 })],
      surcharges: [bag],
      extras: { oversize_bags: 3 },
      rateVersionId: 1,
    });
    expect(bags).toHaveLength(1);
    expect(bags[0]!.amount_rappen).toBe(300);
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

describe("D-08 / D-08b: fare_kind no longer changes the start; the airport fee is additive", () => {
  const metres = 10_000;
  const start = 1_000;
  const per = 200;
  const km = perKm(per, metres);

  function priced(partial: Partial<DistanceRateRow> = {}) {
    return rate({
      vehicle_class_id: business.id,
      base_fare_rappen: start,
      per_km_rappen: per,
      airport_start_rappen: 2_500,
      city_price_rappen: 700,
      ...partial,
    });
  }

  it("one way is start plus km, and does not add the city price", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: metres }),
      vehicleClass: business,
      distanceRate: priced(),
      fixedRoutes: [],
      rateVersionId: 1,
    });
    expect(line.amount_rappen).toBe(start + km);
    expect(line.code).toBe("distance_fare");
  });

  it("D-08b: fare_kind alone (no airport signal) no longer changes the start or adds a fee", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: metres, origin_zone_id: "z-hotel" }),
      vehicleClass: business,
      distanceRate: priced(),
      fixedRoutes: [],
      rateVersionId: 1,
    });
    expect(line.amount_rappen).toBe(start + km);
    expect(line.basis.start_source).toBe("base_fare_rappen");
    expect(
      buildAirportFeeLine({
        leg: leg({ distance_m: metres, origin_zone_id: "z-hotel" }),
        distanceRate: priced(),
        rateVersionId: 1,
        zones: [airportZone, cityZone],
      }),
    ).toBeNull();
    expect(
      airportFeeApplies(
        leg({ distance_m: metres, origin_zone_id: "z-hotel" }),
        new Map([[airportZone.id, airportZone], [cityZone.id, cityZone]]),
      ),
    ).toBe(false);
  });

  it("D-08b: an airport-zone pickup adds the fee on top of the unchanged start", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: metres, origin_zone_id: airportZone.id }),
      vehicleClass: business,
      distanceRate: priced(),
      fixedRoutes: [],
      rateVersionId: 1,
    });
    const fee = buildAirportFeeLine({
      leg: leg({ distance_m: metres, origin_zone_id: airportZone.id }),
      distanceRate: priced(),
      rateVersionId: 1,
      zones: [airportZone, cityZone],
    });
    expect(line.amount_rappen).toBe(start + km);
    expect(fee).not.toBeNull();
    expect(fee!.kind).toBe("surcharge");
    expect(fee!.code).toBe("airport_fee");
    expect(fee!.i18n_key).toBe("price.line.airport_fee");
    expect(fee!.amount_rappen).toBe(2_500);
    expect(fee!.basis.trigger).toBe("airport_zone");
  });

  it("D-08 (26.4): a flight number alone does not trigger the fee", () => {
    const fee = buildAirportFeeLine({
      leg: leg({
        distance_m: metres,
        origin_zone_id: "z-hotel",
        flight_no: "LX1234",
      }),
      distanceRate: priced(),
      rateVersionId: 1,
      zones: [airportZone, cityZone],
    });
    expect(fee).toBeNull();
  });

  it("D-08b: origin_is_airport (26.1-09 place resolution) alone triggers the fee", () => {
    const fee = buildAirportFeeLine({
      leg: leg({
        distance_m: metres,
        origin_zone_id: "z-hotel",
        origin_is_airport: true,
      }),
      distanceRate: priced(),
      rateVersionId: 1,
      zones: [airportZone, cityZone],
    });
    expect(fee).not.toBeNull();
    expect(fee!.basis.trigger).toBe("airport_place");
  });

  it("D-13: an airport signal with airport_start_rappen null prices null, never 0", () => {
    const fee = buildAirportFeeLine({
      leg: leg({ distance_m: metres, origin_zone_id: airportZone.id }),
      distanceRate: priced({ airport_start_rappen: null }),
      rateVersionId: 1,
      zones: [airportZone, cityZone],
    });
    expect(fee).not.toBeNull();
    expect(fee!.amount_rappen).toBeNull();
  });

  it("not an airport, no flight number — no airport fee line", () => {
    const fee = buildAirportFeeLine({
      leg: leg({ distance_m: metres, origin_zone_id: "z-hotel" }),
      distanceRate: priced(),
      rateVersionId: 1,
      zones: [airportZone, cityZone],
    });
    expect(fee).toBeNull();
  });

  it("an omitted fare kind stays on the same base-start formula", () => {
    const line = buildFareLine({
      leg: leg({ distance_m: metres }),
      vehicleClass: business,
      distanceRate: priced(),
      fixedRoutes: [],
      rateVersionId: 1,
    });
    expect(line.amount_rappen).toBe(start + km);
  });
});

describe("D-08 owner worked example — ZRH Airport → Swiss National Museum, 10.19 km", () => {
  it("2000 start + 3000 airport fee + 2548 per-km = 7548 rappen net; 10% coupon = -755", () => {
    const distanceRate = rate({
      vehicle_class_id: business.id,
      base_fare_rappen: 2_000,
      per_km_rappen: 250,
      airport_start_rappen: 3_000,
    });
    const journey = leg({ origin_zone_id: airportZone.id, distance_m: 10_190 });
    const fare = buildFareLine({
      leg: journey,
      vehicleClass: business,
      distanceRate,
      fixedRoutes: [],
      rateVersionId: 1,
    });
    const fee = buildAirportFeeLine({
      leg: journey,
      distanceRate,
      rateVersionId: 1,
      zones: [airportZone, cityZone],
    });
    expect(fare.amount_rappen).toBe(4_548);
    expect(fee?.amount_rappen).toBe(3_000);
    const net = fare.amount_rappen! + fee!.amount_rappen!;
    expect(net).toBe(7_548);

    const pre = sumPreCouponTotal(numberLines([fare, fee!]));
    expect(pre).toBe(7_548);
    const tenPercent = buildCouponLine({
      coupon: { id: 1, code: "TEN", kind: "percent", percent: "10", amount_rappen: null },
      preCouponTotal: pre,
    });
    // Amount is a positive magnitude; the discount sign lives on the line's kind (D-07).
    expect(tenPercent.amount_rappen).toBe(755);
    expect(pre! - tenPercent.amount_rappen!).toBe(7_548 - 755);
    expect(pre! - tenPercent.amount_rappen!).toBeGreaterThanOrEqual(0);

    const hundredPercent = buildCouponLine({
      coupon: { id: 2, code: "ALL", kind: "percent", percent: "100", amount_rappen: null },
      preCouponTotal: pre,
    });
    expect(pre! - hundredPercent.amount_rappen!).toBe(0);
  });
});

describe("Comment 8 city and canton pair extra", () => {
  const metres = 1_000;
  const start = 100;
  const per = 200;
  const pair = 5_000;
  const seat = 200;
  const couponOff = 400;

  function distanceRate() {
    return rate({
      vehicle_class_id: business.id,
      base_fare_rappen: start,
      per_km_rappen: per,
    });
  }

  it("one way is start plus the full distance, plus the matching city pair, plus an extra, minus the coupon", () => {
    const cityRow = fixed({
      id: 8,
      vehicle_class_id: business.id,
      origin_zone_id: "z-de",
      dest_zone_id: "z-paris",
      price_rappen: pair,
      live: true,
      kind: "city",
      origin_label: "Germany",
      dest_label: "Paris",
    });
    const journey = leg({
      origin_zone_id: null,
      dest_zone_id: null,
      origin_place: "Hotel, Berlin, Germany",
      dest_place: "Gare de Lyon, Paris, France",
      distance_m: metres,
    });
    const fare = buildFareLine({
      leg: journey,
      vehicleClass: business,
      distanceRate: distanceRate(),
      fixedRoutes: [cityRow],
      rateVersionId: 1,
    });
    const extra = buildFixedRouteExtraLine({
      leg: journey,
      vehicleClass: business,
      fixedRoutes: [cityRow],
      rateVersionId: 1,
    });
    const seats = buildExtraLines({
      legs: [journey],
      surcharges: [
        surcharge({
          code: "child_seat",
          kind: "amount",
          amount_rappen: seat,
          quantity_source: "child_seats",
          predicate: { kind: "quantity" },
        }),
      ],
      extras: { child_seats: 1 },
      rateVersionId: 1,
    });
    expect(fare.code).toBe("distance_fare");
    expect(fare.amount_rappen).toBe(start + perKm(per, metres));
    expect(extra).not.toBeNull();
    expect(extra!.code).toBe("fixed_route");
    expect(extra!.kind).toBe("extra");
    expect(extra!.basis.matched).toBe("city");
    expect(extra!.amount_rappen).toBe(pair);
    expect(seats[0]!.amount_rappen).toBe(seat);
    const pre = sumPreCouponTotal(numberLines([fare, extra!, ...seats]));
    const coupon = buildCouponLine({
      coupon: {
        id: 3,
        code: "OFF",
        kind: "amount",
        percent: null,
        amount_rappen: couponOff,
      },
      preCouponTotal: pre,
    });
    expect(pre).toBe(start + perKm(per, metres) + pair + seat);
    expect(coupon.amount_rappen).toBe(couponOff);
    expect(pre! - coupon.amount_rappen!).toBe(
      start + perKm(per, metres) + pair + seat - couponOff,
    );
  });

  it("does not invent a city extra when the pair does not match", () => {
    const cityRow = fixed({
      vehicle_class_id: business.id,
      origin_zone_id: "z-de",
      dest_zone_id: "z-paris",
      price_rappen: pair,
      live: true,
      kind: "city",
      origin_label: "Germany",
      dest_label: "Paris",
    });
    const journey = leg({
      origin_place: "Bahnhof, Zurich",
      dest_place: "Bern",
      origin_canton: "ZH",
      dest_canton: "BE",
      distance_m: metres,
    });
    const fare = buildFareLine({
      leg: journey,
      vehicleClass: business,
      distanceRate: distanceRate(),
      fixedRoutes: [cityRow],
      rateVersionId: 1,
    });
    expect(fare.amount_rappen).toBe(start + perKm(per, metres));
    expect(
      buildFixedRouteExtraLine({
        leg: journey,
        vehicleClass: business,
        fixedRoutes: [cityRow],
        rateVersionId: 1,
      }),
    ).toBeNull();
  });

  it("D-09: a city pair covers both directions — a Paris→Germany row matches a Germany→Paris leg", () => {
    const reverseRow = fixed({
      vehicle_class_id: business.id,
      origin_zone_id: "z-paris",
      dest_zone_id: "z-de",
      price_rappen: pair,
      live: true,
      kind: "city",
      origin_label: "Paris",
      dest_label: "Germany",
    });
    const journey = leg({
      origin_place: "Hotel, Berlin, Germany",
      dest_place: "Gare de Lyon, Paris, France",
      distance_m: metres,
    });
    const extra = buildFixedRouteExtraLine({
      leg: journey,
      vehicleClass: business,
      fixedRoutes: [reverseRow],
      rateVersionId: 1,
    });
    expect(extra?.basis.matched).toBe("city");
    expect(extra?.amount_rappen).toBe(pair);
  });

  it("D-09: the same place both ends is no pair — label same-place guard", () => {
    const cityRow = fixed({
      vehicle_class_id: business.id,
      origin_zone_id: "z-de",
      dest_zone_id: "z-de",
      price_rappen: pair,
      live: true,
      kind: "city",
      origin_label: "Berlin",
      dest_label: "Berlin",
    });
    const journey = leg({
      origin_place: "Hotel, Berlin",
      dest_place: "hotel, berlin",
      distance_m: metres,
    });
    expect(
      buildFixedRouteExtraLine({
        leg: journey,
        vehicleClass: business,
        fixedRoutes: [cityRow],
        rateVersionId: 1,
      }),
    ).toBeNull();
  });

  it("D-09 / 26.1-09: Mapbox city ids match both directions and are preferred over the label", () => {
    const berlinZone: ZoneRow = {
      id: "z-berlin",
      slug: "berlin",
      iata: null,
      active: true,
      zone_type: "city",
      tags: ["mapbox_place:place.berlin"],
    };
    const parisZone: ZoneRow = {
      id: "z-paris-city",
      slug: "paris",
      iata: null,
      active: true,
      zone_type: "city",
      tags: ["mapbox_place:place.paris"],
    };
    const row = fixed({
      vehicle_class_id: business.id,
      origin_zone_id: "z-paris-city",
      dest_zone_id: "z-berlin",
      price_rappen: pair,
      live: true,
      kind: "city",
    });
    const journey = leg({
      origin_zone_id: "z-berlin",
      dest_zone_id: "z-paris-city",
      origin_city_id: "place.berlin",
      dest_city_id: "place.paris",
      distance_m: metres,
    });
    const extra = buildFixedRouteExtraLine({
      leg: journey,
      vehicleClass: business,
      fixedRoutes: [row],
      rateVersionId: 1,
      zones: [berlinZone, parisZone],
    });
    expect(extra?.basis.matched).toBe("city");
    expect(extra?.amount_rappen).toBe(pair);
  });

  it("D-09: same Mapbox city id both ends is no pair even with a stray matching row", () => {
    const berlinZone: ZoneRow = {
      id: "z-berlin",
      slug: "berlin",
      iata: null,
      active: true,
      zone_type: "city",
      tags: ["mapbox_place:place.berlin"],
    };
    const journey = leg({
      origin_zone_id: "z-berlin",
      dest_zone_id: "z-berlin",
      origin_city_id: "place.berlin",
      dest_city_id: "place.berlin",
      distance_m: metres,
    });
    expect(
      buildFixedRouteExtraLine({
        leg: journey,
        vehicleClass: business,
        fixedRoutes: [],
        rateVersionId: 1,
        zones: [berlinZone],
      }),
    ).toBeNull();
  });

  it("D-09: a canton pair covers both directions — a BE→ZH row matches a ZH→BE leg", () => {
    const zones: ZoneRow[] = [
      {
        id: "z-zh",
        slug: "canton-zh",
        iata: null,
        active: true,
        zone_type: "other",
        tags: ["canton:ZH"],
      },
      {
        id: "z-vs",
        slug: "canton-vs",
        iata: null,
        active: true,
        zone_type: "other",
        tags: ["canton:VS"],
      },
    ];
    const reverse = fixed({
      id: 5,
      vehicle_class_id: business.id,
      origin_zone_id: "z-vs",
      dest_zone_id: "z-zh",
      price_rappen: pair,
      live: true,
      kind: "canton",
    });
    const journey = leg({
      origin_zone_id: "z-hotel",
      dest_zone_id: "z-ski",
      origin_canton: "ZH",
      dest_canton: "VS",
      origin_place: "Zurich",
      dest_place: "Zermatt",
      distance_m: metres,
    });
    const fare = buildFareLine({
      leg: journey,
      vehicleClass: business,
      distanceRate: distanceRate(),
      fixedRoutes: [reverse],
      rateVersionId: 1,
    });
    const extra = buildFixedRouteExtraLine({
      leg: journey,
      vehicleClass: business,
      fixedRoutes: [reverse],
      rateVersionId: 1,
      zones,
    });
    expect(fare.amount_rappen).toBe(start + perKm(per, metres));
    expect(extra?.basis.matched).toBe("canton");
    expect(extra?.amount_rappen).toBe(pair);
  });

  it("D-09: same canton both ends is no pair — the guard, not a match", () => {
    const zones: ZoneRow[] = [
      {
        id: "z-zh-a",
        slug: "zh-a",
        iata: null,
        active: true,
        zone_type: "other",
        tags: ["canton:ZH"],
      },
      {
        id: "z-zh-b",
        slug: "zh-b",
        iata: null,
        active: true,
        zone_type: "other",
        tags: ["canton:ZH"],
      },
    ];
    const cantonRow = fixed({
      vehicle_class_id: business.id,
      origin_zone_id: "z-zh-a",
      dest_zone_id: "z-zh-a",
      price_rappen: pair,
      live: true,
      kind: "canton",
    });
    const extra = buildFixedRouteExtraLine({
      leg: leg({
        origin_zone_id: "z-zh-a",
        dest_zone_id: "z-zh-b",
        origin_canton: "ZH",
        dest_canton: "ZH",
        distance_m: metres,
      }),
      vehicleClass: business,
      fixedRoutes: [cantonRow],
      rateVersionId: 1,
      zones,
    });
    expect(extra).toBeNull();
  });

  it("D-09a: a city pair wins over a canton pair on the same trip", () => {
    const zones: ZoneRow[] = [
      {
        id: "z-zh",
        slug: "canton-zh",
        iata: null,
        active: true,
        zone_type: "other",
        tags: ["canton:ZH"],
      },
      {
        id: "z-vs",
        slug: "canton-vs",
        iata: null,
        active: true,
        zone_type: "other",
        tags: ["canton:VS"],
      },
    ];
    const cantonRow = fixed({
      id: 4,
      vehicle_class_id: business.id,
      origin_zone_id: "z-zh",
      dest_zone_id: "z-vs",
      price_rappen: pair,
      live: true,
      kind: "canton",
    });
    const cityRow = fixed({
      id: 6,
      vehicle_class_id: business.id,
      origin_zone_id: "z-zurich",
      dest_zone_id: "z-zermatt",
      price_rappen: 7_700,
      live: true,
      kind: "city",
      origin_label: "Zurich",
      dest_label: "Zermatt",
    });
    const extra = buildFixedRouteExtraLine({
      leg: leg({
        origin_canton: "ZH",
        dest_canton: "VS",
        origin_place: "Bahnhof, Zurich",
        dest_place: "Zermatt, Valais",
        distance_m: metres,
      }),
      vehicleClass: business,
      fixedRoutes: [cityRow, cantonRow],
      rateVersionId: 1,
      zones,
    });
    expect(extra?.basis.matched).toBe("city");
    expect(extra?.amount_rappen).toBe(7_700);
  });
});

describe("26.1-11 pair line carries the two place names (UI-SPEC §8)", () => {
  const berlinZone: ZoneRow = {
    id: "z-berlin",
    slug: "berlin",
    iata: null,
    active: true,
    zone_type: "city",
    tags: ["mapbox_place:place.berlin"],
  };
  const parisZone: ZoneRow = {
    id: "z-paris-city",
    slug: "paris",
    iata: null,
    active: true,
    zone_type: "city",
    tags: ["mapbox_place:place.paris"],
  };
  const row = fixed({
    vehicle_class_id: business.id,
    origin_zone_id: "z-paris-city",
    dest_zone_id: "z-berlin",
    price_rappen: 5_000,
    live: true,
    kind: "city",
  });
  const ids = {
    origin_zone_id: "z-berlin",
    dest_zone_id: "z-paris-city",
    origin_city_id: "place.berlin",
    dest_city_id: "place.paris",
  };

  function build(partial: Partial<QuoteLegInput>) {
    return buildFixedRouteExtraLine({
      leg: leg({ ...ids, ...partial }),
      vehicleClass: business,
      fixedRoutes: [row],
      rateVersionId: 1,
      zones: [berlinZone, parisZone],
    });
  }

  it("stamps params { origin, destination } in the leg's own direction when both names are known", () => {
    const extra = build({ origin_city_name: "Berlin", dest_city_name: "Paris" });
    expect(extra?.code).toBe("fixed_route");
    expect(extra?.params).toEqual({ origin: "Berlin", destination: "Paris" });
  });

  it("carries no params when a name is missing or blank", () => {
    expect(build({ origin_city_name: "Berlin", dest_city_name: null })?.params).toBeUndefined();
    expect(build({ origin_city_name: "  ", dest_city_name: "Paris" })?.params).toBeUndefined();
    expect(build({})?.params).toBeUndefined();
  });

  it("names never change the match or the amount", () => {
    const named = build({ origin_city_name: "Rome", dest_city_name: "Oslo" });
    const plain = build({});
    expect(named?.amount_rappen).toBe(plain?.amount_rappen);
    expect(named?.basis).toEqual(plain?.basis);
    expect(named?.source_row).toEqual(plain?.source_row);
  });
});

