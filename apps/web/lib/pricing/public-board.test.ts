// Idle public board is the live book (D-29 D-31 D-32). No four-class ladder.

import { describe, expect, it } from "vitest";
import { classDisplayName, liveBookBoard } from "./public-board";
import type {
  DistanceRateRow,
  RateBook,
  VehicleClassRow,
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
    zones: [],
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
