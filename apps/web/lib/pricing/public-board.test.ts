// Idle public board is the live book (D-29 D-31 D-32). No four-class ladder.

import { describe, expect, it } from "vitest";
import { classDisplayName, liveBookBoard, publicCatalogRoutes } from "./public-board";
import type {
  DistanceRateRow,
  FixedRouteRow,
  RateBook,
  VehicleClassRow,
  ZoneRow,
} from "./types";

function classRow(
  partial: Partial<VehicleClassRow> & Pick<VehicleClassRow, "slug">,
): VehicleClassRow {
  return {
    id: partial.id ?? `vc-${partial.slug}`,
    slug: partial.slug,
    passenger_capacity: partial.passenger_capacity ?? 3,
    luggage_capacity: partial.luggage_capacity ?? 3,
    sort_order: partial.sort_order ?? 0,
    active: partial.active ?? true,
    name: partial.name ?? null,
    photo_path: partial.photo_path ?? null,
  };
}

function rateRow(
  partial: Partial<DistanceRateRow> & Pick<DistanceRateRow, "vehicle_class_id">,
): DistanceRateRow {
  return {
    id: partial.id ?? 1,
    rate_version_id: 1,
    vehicle_class_id: partial.vehicle_class_id,
    base_fare_rappen: null,
    per_km_rappen: null,
    min_fare_rappen: null,
    max_pax: partial.max_pax ?? 3,
    available: partial.available ?? true,
    hide_from_public: partial.hide_from_public,
  };
}

function book(partial: Partial<RateBook> & Pick<RateBook, "classes" | "distance_rates">): RateBook {
  return {
    rate_version: { id: 1, slug: "live" },
    classes: partial.classes,
    distance_rates: partial.distance_rates,
    distance_bands: [],
    region_premiums: [],
    fixed_routes: partial.fixed_routes ?? [],
    surcharges: [],
    zones: partial.zones ?? [],
  };
}

describe("liveBookBoard", () => {
  it("lists rated classes and omits an unrated leftover (D-31)", () => {
    const economy = classRow({ slug: "economy", sort_order: 1 });
    const suv = classRow({
      slug: "suv-plus",
      name: "SUV Plus",
      photo_path: "classes/abc.jpg",
      sort_order: 2,
      passenger_capacity: 6,
      luggage_capacity: 5,
    });
    const board = liveBookBoard(
      book({
        classes: [economy, suv],
        distance_rates: [rateRow({ vehicle_class_id: suv.id, max_pax: 6 })],
      }),
    );
    expect(board.map((c) => c.slug)).toEqual(["suv-plus"]);
    expect(board[0]?.name).toBe("SUV Plus");
    expect(board[0]?.photo_url).toBe("/photos/classes/abc.jpg");
    expect(board[0]?.total_rappen).toBeNull();
  });

  it("keeps hide_from_public listed as unavailable (D-32)", () => {
    const van = classRow({ slug: "van", sort_order: 1 });
    const board = liveBookBoard(
      book({
        classes: [van],
        distance_rates: [
          rateRow({ vehicle_class_id: van.id, hide_from_public: true }),
        ],
      }),
    );
    expect(board).toHaveLength(1);
    expect(board[0]?.eligible).toBe(false);
    expect(board[0]?.ineligible_reason).toBe("unavailable");
  });

  it("title-cases a kebab slug when name is empty", () => {
    expect(classDisplayName(undefined, "suv-plus")).toBe("Suv Plus");
    expect(classDisplayName(classRow({ slug: "van", name: "  Van  " }), "van")).toBe(
      "Van",
    );
  });
});

describe("publicCatalogRoutes", () => {
  it("lists unique live place pairs and skips canton and dark rows", () => {
    const zrh: ZoneRow = {
      id: "z-zrh",
      slug: "zurich-airport",
      iata: "ZRH",
      active: true,
      zone_type: "airport",
      tags: [],
    };
    const zermatt: ZoneRow = {
      id: "z-zermatt",
      slug: "zermatt",
      iata: null,
      active: true,
      zone_type: "ski",
      tags: [],
    };
    const zh: ZoneRow = {
      id: "z-zh",
      slug: "canton-zh",
      iata: null,
      active: true,
      zone_type: "other",
      tags: ["canton:ZH"],
    };
    const vs: ZoneRow = {
      id: "z-vs",
      slug: "canton-vs",
      iata: null,
      active: true,
      zone_type: "other",
      tags: ["canton:VS"],
    };
    const live: FixedRouteRow = {
      id: 1,
      rate_version_id: 1,
      origin_zone_id: zrh.id,
      dest_zone_id: zermatt.id,
      vehicle_class_id: "vc-economy",
      price_rappen: 25900,
      live: true,
      kind: "place",
    };
    const liveVan: FixedRouteRow = {
      ...live,
      id: 2,
      vehicle_class_id: "vc-van",
    };
    const dark: FixedRouteRow = {
      ...live,
      id: 3,
      live: false,
    };
    const canton: FixedRouteRow = {
      id: 4,
      rate_version_id: 1,
      origin_zone_id: zh.id,
      dest_zone_id: vs.id,
      vehicle_class_id: "vc-economy",
      price_rappen: 10000,
      live: true,
      kind: "canton",
    };
    const catalog = publicCatalogRoutes(
      book({
        classes: [classRow({ slug: "economy" })],
        distance_rates: [rateRow({ vehicle_class_id: "vc-economy" })],
        fixed_routes: [live, liveVan, dark, canton],
        zones: [zrh, zermatt, zh, vs],
      }),
    );
    expect(catalog).toEqual([
      {
        key: `${zrh.id}::${zermatt.id}`,
        from: "Zurich Airport (ZRH)",
        to: "Zermatt",
      },
    ]);
  });
});
