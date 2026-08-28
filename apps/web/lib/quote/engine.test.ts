// apps/web/lib/quote/engine.test.ts
//
// loadAndPrice composition proofs (D-26, D-33, D-46). Loaders are stubbed —
// no database, no network, no Docker. Priced fields stay null except the
// synthetic integer mix that proves the partially_priced_class path.

import { describe, expect, it } from "vitest";
import { loadAndPrice, type QuoteLoaders } from "./engine";
import type { QuoteInput } from "../pricing/types";

const economy = {
  id: "vc-economy",
  slug: "economy",
  passenger_capacity: 3,
  luggage_capacity: 3,
  sort_order: 1,
  active: true,
};
const business = {
  id: "vc-business",
  slug: "business",
  passenger_capacity: 3,
  luggage_capacity: 3,
  sort_order: 2,
  active: true,
};
const van = {
  id: "vc-van",
  slug: "van",
  passenger_capacity: 8,
  luggage_capacity: 8,
  sort_order: 3,
  active: true,
};

const zoneA = {
  id: "z-a",
  slug: "zrh-airport",
  iata: "ZRH",
  active: true,
  zone_type: "airport",
  tags: [],
};
const zoneB = {
  id: "z-b",
  slug: "zurich-city",
  iata: null,
  active: true,
  zone_type: "city",
  tags: [],
};

function nullRates() {
  return [
    {
      id: 10,
      rate_version_id: 1,
      vehicle_class_id: economy.id,
      base_fare_rappen: null,
      per_km_rappen: null,
      min_fare_rappen: null,
      max_pax: 3,
      available: true,
    },
    {
      id: 11,
      rate_version_id: 1,
      vehicle_class_id: business.id,
      base_fare_rappen: null,
      per_km_rappen: null,
      min_fare_rappen: null,
      max_pax: 3,
      available: true,
    },
    {
      id: 12,
      rate_version_id: 1,
      vehicle_class_id: van.id,
      base_fare_rappen: null,
      per_km_rappen: null,
      min_fare_rappen: null,
      max_pax: 8,
      available: true,
    },
  ];
}

function launchDoc(rateVersion: {
  id: number;
  slug: string;
  status: string;
} | null) {
  return {
    rate_version: rateVersion,
    classes: [economy, business, van],
    distance_rates: nullRates(),
    fixed_routes: [],
    surcharges: [
      {
        id: 9,
        rate_version_id: 1,
        code: "airport_pickup",
        kind: "amount",
        amount_rappen: null,
        percent: null,
        applies_to: "leg",
        active: true,
        predicate: { kind: "always" },
        quantity_source: null,
      },
    ],
    zones: [zoneA, zoneB],
  };
}

function settingsDoc() {
  return {
    id: 4,
    slug: "baseline",
    effective_from: "2026-01-01T00:00:00.000Z",
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
    service_area_geojson: null,
  };
}

function input(computedAt = "2026-09-04T12:00:00.000Z"): QuoteInput {
  return {
    mode: "one_way",
    pax: 2,
    bags: 2,
    display_currency: "XXX",
    computed_at: computedAt,
    legs: [
      {
        leg_seq: 1,
        scheduled_local: "2026-09-04T23:10",
        distance_m: 10_000,
        duration_s: 900,
        origin_zone_id: "z-a",
        dest_zone_id: "z-b",
        waypoints: [],
      },
    ],
    extras: {},
    coupon: null,
  };
}

function unused(): never {
  throw new Error("unused loader called");
}

function stubLoaders(opts: {
  book: unknown;
  settings: unknown;
  onLoadRateBook?: (preferDraft: boolean) => void;
}): QuoteLoaders {
  return {
    loadRateBook: async (_env, loadOpts) => {
      opts.onLoadRateBook?.(loadOpts.preferDraft);
      return opts.book;
    },
    loadSettingsVersion: async () => opts.settings,
    mintLockDeadline: async () => unused(),
    evaluateCoupon: async () => unused(),
  };
}

function fakeEnv(preview?: string): CloudflareEnv {
  if (preview === undefined) return {} as CloudflareEnv;
  return { PRICING_PREVIEW: preview } as CloudflareEnv;
}

describe("loadAndPrice", () => {
  it("returns a complete unpriced labelled board when rate_version is null", async () => {
    const result = await loadAndPrice(
      fakeEnv(),
      input(),
      stubLoaders({ book: launchDoc(null), settings: settingsDoc() }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.pricing_live).toBe(false);
    expect(result.quote.rate_version).toBeNull();
    expect(result.quote.classes.map((c) => c.slug)).toEqual([
      "economy",
      "business",
      "van",
    ]);
    expect(result.quote.classes.every((c) => c.total_rappen === null)).toBe(
      true,
    );
    expect(result).not.toBeInstanceOf(Response);
  });

  it("names a draft version and still reports pricing_live false", async () => {
    const result = await loadAndPrice(
      fakeEnv("true"),
      input(),
      stubLoaders({
        book: launchDoc({ id: 3, slug: "draft-v1", status: "draft" }),
        settings: settingsDoc(),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.pricing_live).toBe(false);
    expect(result.quote.rate_version).toEqual({ id: 3, slug: "draft-v1" });
  });

  it("prices a retired version and still reports pricing_live false (D-26)", async () => {
    const result = await loadAndPrice(
      fakeEnv(),
      input(),
      stubLoaders({
        book: launchDoc({ id: 2, slug: "retired-v1", status: "retired" }),
        settings: settingsDoc(),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.pricing_live).toBe(false);
    expect(result.quote.rate_version).toEqual({ id: 2, slug: "retired-v1" });
    expect(result.quote.classes).toHaveLength(3);
  });

  it("passes preferDraft true only when the preview binding is the string true", async () => {
    const cases: Array<[string | undefined, boolean]> = [
      [undefined, false],
      ["false", false],
      ["TRUE", false],
      ["1", false],
      ["true", true],
    ];
    for (const [value, expected] of cases) {
      let seen: boolean | undefined;
      await loadAndPrice(
        fakeEnv(value),
        input(),
        stubLoaders({
          book: launchDoc(null),
          settings: settingsDoc(),
          onLoadRateBook: (preferDraft) => {
            seen = preferDraft;
          },
        }),
      );
      expect(seen, `preview=${String(value)}`).toBe(expected);
    }
  });

  it("maps a null settings version to no_settings_version", async () => {
    const result = await loadAndPrice(
      fakeEnv(),
      input(),
      stubLoaders({ book: launchDoc(null), settings: null }),
    );
    expect(result).toEqual({ ok: false, code: "no_settings_version" });
  });

  it("maps a mixed-null class to partially_priced_class", async () => {
    const book = launchDoc({ id: 1, slug: "live-v1", status: "live" });
    book.distance_rates = [
      {
        id: 10,
        rate_version_id: 1,
        vehicle_class_id: economy.id,
        base_fare_rappen: 1000,
        per_km_rappen: 0,
        min_fare_rappen: 0,
        max_pax: 3,
        available: true,
      },
      {
        id: 11,
        rate_version_id: 1,
        vehicle_class_id: business.id,
        base_fare_rappen: null,
        per_km_rappen: null,
        min_fare_rappen: null,
        max_pax: 3,
        available: true,
      },
      {
        id: 12,
        rate_version_id: 1,
        vehicle_class_id: van.id,
        base_fare_rappen: null,
        per_km_rappen: null,
        min_fare_rappen: null,
        max_pax: 8,
        available: true,
      },
    ];
    const result = await loadAndPrice(
      fakeEnv(),
      input(),
      stubLoaders({ book, settings: settingsDoc() }),
    );
    expect(result).toEqual({ ok: false, code: "partially_priced_class" });
  });

  it("is identical across wall-clock besides the echoed computed_at", async () => {
    const deps = stubLoaders({
      book: launchDoc(null),
      settings: settingsDoc(),
    });
    const a = await loadAndPrice(
      fakeEnv(),
      input("2026-01-01T00:00:00.000Z"),
      deps,
    );
    const b = await loadAndPrice(
      fakeEnv(),
      input("2026-12-31T23:59:59.000Z"),
      deps,
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.quote.computed_at).toBe("2026-01-01T00:00:00.000Z");
    expect(b.quote.computed_at).toBe("2026-12-31T23:59:59.000Z");
    const restA = { ...a.quote, computed_at: null };
    const restB = { ...b.quote, computed_at: null };
    expect(restA).toEqual(restB);
  });
});
