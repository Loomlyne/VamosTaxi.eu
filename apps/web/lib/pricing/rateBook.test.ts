// apps/web/lib/pricing/rateBook.test.ts
//
// Pure mapping proofs (D-07, D-33, D-46, research T5). Launch-state fixtures
// keep every priced field null except the one synthetic percent string that
// proves decimals stay text.

import { describe, expect, it } from "vitest";
import {
  derivePricingLive,
  mapRateBook,
  mapSettingsSnapshot,
} from "./rateBook";

const EMPTY_BOOK_DOC = {
  rate_version: null,
  classes: [],
  distance_rates: [],
  fixed_routes: [],
  surcharges: [],
  zones: [],
};

describe("mapRateBook", () => {
  it("maps null to the launch-state empty book", () => {
    const book = mapRateBook(null);
    expect(book.rate_version).toBeNull();
    expect(book.classes).toEqual([]);
    expect(book.distance_rates).toEqual([]);
    expect(book.fixed_routes).toEqual([]);
    expect(book.surcharges).toEqual([]);
    expect(book.zones).toEqual([]);
  });

  it("maps an explicit null-version document to the same launch state", () => {
    const book = mapRateBook(EMPTY_BOOK_DOC);
    expect(book.rate_version).toBeNull();
    expect(book.classes).toEqual([]);
    expect(book.distance_rates).toEqual([]);
    expect(book.fixed_routes).toEqual([]);
    expect(book.surcharges).toEqual([]);
    expect(book.zones).toEqual([]);
  });

  it("preserves a synthetic percent string with no numeric coercion", () => {
    const book = mapRateBook({
      rate_version: null,
      classes: [],
      distance_rates: [],
      fixed_routes: [],
      surcharges: [
        {
          id: 1,
          rate_version_id: 1,
          code: "night",
          kind: "percent",
          amount_rappen: null,
          percent: "10.00",
          applies_to: "leg",
          active: true,
          predicate: { kind: "always" },
          quantity_source: null,
        },
      ],
      zones: [],
    });
    expect(book.surcharges[0]?.percent).toBe("10.00");
    expect(typeof book.surcharges[0]?.percent).toBe("string");
  });

  it("preserves input array order and never re-sorts", () => {
    const classes = [
      {
        id: "vc-van",
        slug: "van",
        passenger_capacity: 8,
        luggage_capacity: 8,
        sort_order: 3,
        active: true,
      },
      {
        id: "vc-economy",
        slug: "economy",
        passenger_capacity: 3,
        luggage_capacity: 3,
        sort_order: 1,
        active: true,
      },
    ];
    const reversed = [classes[1], classes[0]];
    const asWritten = mapRateBook({
      rate_version: null,
      classes,
      distance_rates: [],
      fixed_routes: [],
      surcharges: [],
      zones: [],
    });
    const asReversed = mapRateBook({
      rate_version: null,
      classes: reversed,
      distance_rates: [],
      fixed_routes: [],
      surcharges: [],
      zones: [],
    });
    expect(asWritten.classes.map((c) => c.id)).toEqual(["vc-van", "vc-economy"]);
    expect(asReversed.classes.map((c) => c.id)).toEqual([
      "vc-economy",
      "vc-van",
    ]);
  });

  it("passes an unrecognised predicate kind through to the kernel", () => {
    const book = mapRateBook({
      rate_version: null,
      classes: [],
      distance_rates: [],
      fixed_routes: [],
      surcharges: [
        {
          id: 2,
          rate_version_id: 1,
          code: "mystery",
          kind: "amount",
          amount_rappen: null,
          percent: null,
          applies_to: "leg",
          active: true,
          predicate: { kind: "not_a_real_kind", extra: true },
          quantity_source: null,
        },
      ],
      zones: [],
    });
    expect(book.surcharges[0]?.predicate).toEqual({
      kind: "not_a_real_kind",
      extra: true,
    });
  });

  it("maps zone tags to a string array and absent tags to an empty array", () => {
    const book = mapRateBook({
      rate_version: null,
      classes: [],
      distance_rates: [],
      fixed_routes: [],
      surcharges: [],
      zones: [
        {
          id: "z-ski",
          slug: "zermatt",
          iata: null,
          active: true,
          zone_type: "ski",
          tags: ["ski", "alpine"],
        },
        {
          id: "z-city",
          slug: "zurich-city",
          iata: null,
          active: true,
          zone_type: "city",
        },
      ],
    });
    expect(book.zones[0]?.tags).toEqual(["ski", "alpine"]);
    expect(book.zones[1]?.tags).toEqual([]);
    expect(book.zones[1]?.tags).not.toBeUndefined();
  });

  it("drops unexpected extra keys without throwing", () => {
    const book = mapRateBook({
      rate_version: { id: 9, slug: "draft-v1", status: "draft" },
      classes: [],
      distance_rates: [],
      fixed_routes: [],
      surcharges: [],
      zones: [],
      unexpected_future_key: { nested: true },
    });
    expect(book).not.toHaveProperty("unexpected_future_key");
    expect(book.rate_version).toMatchObject({ id: 9, slug: "draft-v1" });
  });
});

describe("derivePricingLive", () => {
  it("is true only when status is live", () => {
    expect(derivePricingLive({ status: "live" })).toBe(true);
    expect(derivePricingLive({ status: "draft" })).toBe(false);
    expect(derivePricingLive({ status: "retired" })).toBe(false);
    expect(derivePricingLive(null)).toBe(false);
  });
});

describe("mapSettingsSnapshot", () => {
  it("returns null for a null document and does not throw", () => {
    expect(mapSettingsSnapshot(null)).toBeNull();
  });

  it("carries every listed field and defaults a missing operational timezone to Zurich", () => {
    const snap = mapSettingsSnapshot({
      id: 4,
      slug: "baseline",
      quote_lock_minutes: null,
      checkout_window_minutes: null,
      min_advance_minutes: null,
      airport_waiting_minutes: null,
      city_waiting_minutes: null,
      round_trip_discount_percent: null,
      night_window_start: null,
      night_window_end: null,
      night_window_tz: null,
      cancellation_tiers: null,
      policy_doc_slug: null,
      policy_doc_version: null,
      service_area_geojson: null,
    });
    expect(snap).not.toBeNull();
    expect(snap?.quote_lock_minutes).toBeNull();
    expect(snap?.checkout_window_minutes).toBeNull();
    expect(snap?.min_advance_minutes).toBeNull();
    expect(snap?.airport_waiting_minutes).toBeNull();
    expect(snap?.city_waiting_minutes).toBeNull();
    expect(snap?.round_trip_discount_percent).toBeNull();
    expect(snap?.night_window_start).toBeNull();
    expect(snap?.night_window_end).toBeNull();
    expect(snap?.night_window_tz).toBe("Europe/Zurich");
    expect(snap?.cancellation_tiers).toBeNull();
    expect(snap?.policy_doc_slug).toBeNull();
    expect(snap?.policy_doc_version).toBeNull();
    expect(
      (snap as { service_area_geojson: unknown } | null)?.service_area_geojson,
    ).toBeNull();
  });

  it("drops an unexpected extra key without error", () => {
    const snap = mapSettingsSnapshot({
      id: 4,
      slug: "baseline",
      extra_column_from_later_phase: "nope",
    });
    expect(snap).not.toBeNull();
    expect(snap).not.toHaveProperty("extra_column_from_later_phase");
    expect(snap?.slug).toBe("baseline");
  });
});
