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

  it("paints a live fixed-route class the idle distance board would drop, with no fare", () => {
    const van = classRow({
      slug: "mercedes-benz-v-class",
      name: "Mercedes-Benz V-Class",
      sort_order: 0,
      passenger_capacity: 7,
      luggage_capacity: 6,
    });
    const sclass = classRow({
      slug: "mercedes-s-class-special",
      name: "Mercedes S-Class Special",
      sort_order: 0,
      passenger_capacity: 3,
      luggage_capacity: 3,
    });
    const economy = classRow({
      slug: "economy",
      name: "Economy",
      sort_order: 1,
      passenger_capacity: 4,
      luggage_capacity: 3,
      photo_path: "classes/economy.jpg",
    });
    const leftover = classRow({ slug: "mahaha", name: "mahaha", sort_order: 0 });
    const fixed: FixedRouteRow = {
      id: 9,
      rate_version_id: 1,
      origin_zone_id: "z-a",
      dest_zone_id: "z-b",
      vehicle_class_id: economy.id,
      price_rappen: 25900,
      live: true,
      kind: "place",
    };
    const board = liveBookBoard(
      book({
        classes: [leftover, economy, sclass, van],
        distance_rates: [
          rateRow({ vehicle_class_id: van.id, max_pax: 7 }),
          rateRow({ vehicle_class_id: sclass.id, max_pax: 3 }),
        ],
        fixed_routes: [fixed],
      }),
    );
    expect(board.map((c) => c.slug)).toEqual([
      "mercedes-benz-v-class",
      "mercedes-s-class-special",
      "economy",
    ]);
    expect(board.find((c) => c.slug === "economy")?.name).toBe("Economy");
    expect(board.find((c) => c.slug === "economy")?.total_rappen).toBeNull();
    expect(board.map((c) => c.slug)).not.toContain("mahaha");
  });

  it("follows vehicle_classes.sort_order for already-public classes and leaves inactive slugs out", () => {
    const van = classRow({
      slug: "mercedes-benz-v-class",
      name: "Mercedes-Benz V-Class",
      sort_order: 20,
    });
    const sclass = classRow({
      slug: "mercedes-s-class-special",
      name: "Mercedes S-Class Special",
      sort_order: 10,
    });
    const economy = classRow({ slug: "economy", name: "Economy", sort_order: 0, active: false });
    const business = classRow({ slug: "business", name: "Business", sort_order: 1, active: false });
    const first = classRow({ slug: "first", name: "First", sort_order: 2, active: false });
    const vanLegacy = classRow({ slug: "van", name: "Van", sort_order: 3, active: false });
    const mahaha = classRow({ slug: "mahaha", name: "mahaha", sort_order: 4, active: false });
    const board = liveBookBoard(
      book({
        classes: [van, economy, sclass, mahaha, business, first, vanLegacy],
        distance_rates: [
          rateRow({ vehicle_class_id: van.id, id: 1 }),
          rateRow({ vehicle_class_id: sclass.id, id: 2 }),
          rateRow({ vehicle_class_id: economy.id, id: 3 }),
        ],
      }),
    );
    expect(board.map((c) => c.slug)).toEqual([
      "mercedes-s-class-special",
      "mercedes-benz-v-class",
    ]);
  });

  it("does not revive a class whose fixed routes are all dark", () => {
    const economy = classRow({ slug: "economy", sort_order: 1 });
    const dark: FixedRouteRow = {
      id: 1,
      rate_version_id: 1,
      origin_zone_id: "z-a",
      dest_zone_id: "z-b",
      vehicle_class_id: economy.id,
      price_rappen: 10000,
      live: false,
      kind: "place",
    };
    const board = liveBookBoard(
      book({
        classes: [economy],
        distance_rates: [],
        fixed_routes: [dark],
      }),
    );
    expect(board).toEqual([]);
  });

  it("omits a dashboard-deleted class even when a live rate and a live fixed route remain", () => {
    const kept = classRow({
      slug: "mercedes-benz-v-class",
      name: "Mercedes-Benz V-Class",
      sort_order: 0,
    });
    const gone = classRow({
      slug: "economy",
      name: "Economy",
      sort_order: 1,
      active: false,
    });
    const fixed: FixedRouteRow = {
      id: 4,
      rate_version_id: 1,
      origin_zone_id: "z-a",
      dest_zone_id: "z-b",
      vehicle_class_id: gone.id,
      price_rappen: 25900,
      live: true,
      kind: "place",
    };
    const board = liveBookBoard(
      book({
        classes: [gone, kept],
        distance_rates: [
          rateRow({ vehicle_class_id: kept.id }),
          rateRow({ vehicle_class_id: gone.id, id: 2 }),
        ],
        fixed_routes: [fixed],
      }),
    );
    expect(board.map((c) => c.slug)).toEqual(["mercedes-benz-v-class"]);
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
        from_mapbox_id: null,
        to_mapbox_id: null,
      },
    ]);
  });

  it("uses ops content_strings names and mapbox tags, never demo cities", () => {
    const origin: ZoneRow = {
      id: "z-origin",
      slug: "zurich-airport-the-circle-16-flughafen-ch-8302-k",
      iata: null,
      active: true,
      zone_type: "other",
      tags: ["mapbox:mbx-origin"],
    };
    const dest: ZoneRow = {
      id: "z-dest",
      slug: "swiss-national-museum-museumstrasse-2-8001-zu-ri",
      iata: null,
      active: true,
      zone_type: "other",
      tags: ["mapbox:mbx-dest"],
    };
    const live: FixedRouteRow = {
      id: 1,
      rate_version_id: 1,
      origin_zone_id: origin.id,
      dest_zone_id: dest.id,
      vehicle_class_id: "vc-economy",
      price_rappen: 10000,
      live: true,
      kind: "place",
    };
    const names = new Map([
      [origin.slug, "Zurich Airport, The Circle 16-Flughafen CH, 8302 Kloten, Switzerland"],
      [dest.slug, "Swiss National Museum, Museumstrasse 2, 8001 Zürich, Switzerland"],
    ]);
    const catalog = publicCatalogRoutes(
      book({
        classes: [classRow({ slug: "economy" })],
        distance_rates: [rateRow({ vehicle_class_id: "vc-economy" })],
        fixed_routes: [live],
        zones: [origin, dest],
      }),
      names,
    );
    expect(catalog).toEqual([
      {
        key: `${origin.id}::${dest.id}`,
        from: "Zurich Airport, The Circle 16-Flughafen CH, 8302 Kloten, Switzerland",
        to: "Swiss National Museum, Museumstrasse 2, 8001 Zürich, Switzerland",
        from_mapbox_id: "mbx-origin",
        to_mapbox_id: "mbx-dest",
      },
    ]);
  });
});
