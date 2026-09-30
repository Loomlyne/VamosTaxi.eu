// apps/web/lib/pricing/one-form-fare-parts.test.ts
//
// 26.4 server proof (D-08, D-10, D-12, D-14): the fare is decided from the
// pickup and destination alone — start + per km, + airport fee (pickup is an
// airport), + one city or canton pair, + extras, VAT, coupon.
// Fixture rows only — never live price-book numbers (D-12).

import { describe, expect, it } from "vitest";
import { checkoutCharge } from "../checkout/checkout-charge";
import { mintLock, verifyLock } from "../quote/lock";
import type { QuoteLockPayload } from "../quote/lock";
import { runRepricePipeline, type QuotePipelineDeps } from "../quote/pipeline";
import { priceQuote } from "./priceQuote";
import type { SettingsVersionRow } from "./policy";
import type {
  ClassBoardEntry,
  DistanceRateRow,
  FixedRouteRow,
  PolicySnapshot,
  QuoteInput,
  QuoteLegInput,
  RateBook,
  SurchargeRow,
  VehicleClassRow,
  ZoneRow,
  ZoneType,
} from "./types";

const economy: VehicleClassRow = {
  id: "vc-economy",
  slug: "economy",
  passenger_capacity: 3,
  luggage_capacity: 3,
  sort_order: 1,
  active: true,
};

const BASE = 1_000;
const PER_KM = 200;
const AIRPORT_START = 2_500;
const SEAT = 500;
const CITY_PAIR = 700;
const CANTON_PAIR = 900;
const KM = 10;
const FARE = BASE + PER_KM * KM;

function zone(
  id: string,
  slug: string,
  zone_type: ZoneType,
  tags: string[] = [],
  iata: string | null = null,
): ZoneRow {
  return { id, slug, iata, active: true, zone_type, tags };
}

const airportZone = zone("z-airport", "zrh-airport", "airport", [], "ZRH");
const neutralZone = zone("z-neutral", "hotel", "city");
const cityA = zone("z-city-a", "city-a", "city", ["mapbox_place:place.a"]);
const cityB = zone("z-city-b", "city-b", "city", ["mapbox_place:place.b"]);
const cantonA = zone("z-canton-a", "canton-zh", "other", ["canton:ZH"]);
const cantonB = zone("z-canton-b", "canton-be", "other", ["canton:BE"]);

const rate: DistanceRateRow = {
  id: 11,
  rate_version_id: 1,
  vehicle_class_id: economy.id,
  base_fare_rappen: BASE,
  per_km_rappen: PER_KM,
  min_fare_rappen: null,
  airport_start_rappen: AIRPORT_START,
  city_price_rappen: null,
  max_pax: 3,
  available: true,
};

const seatSurcharge: SurchargeRow = {
  id: 14,
  rate_version_id: 1,
  code: "child_seat",
  kind: "amount",
  amount_rappen: SEAT,
  percent: null,
  applies_to: "leg",
  active: true,
  predicate: { kind: "quantity" },
  quantity_source: "child_seats",
};

function pair(
  id: number,
  kind: "city" | "canton",
  a: ZoneRow,
  b: ZoneRow,
  price: number,
): FixedRouteRow {
  return {
    id,
    rate_version_id: 1,
    origin_zone_id: a.id,
    dest_zone_id: b.id,
    vehicle_class_id: economy.id,
    price_rappen: price,
    live: true,
    kind,
  };
}

const cityRow = pair(21, "city", cityA, cityB, CITY_PAIR);
const cantonRow = pair(22, "canton", cantonA, cantonB, CANTON_PAIR);

function book(fixed: FixedRouteRow[] = []): RateBook {
  return {
    rate_version: { id: 1, slug: "fixture" },
    classes: [economy],
    distance_rates: [rate],
    distance_bands: [],
    region_premiums: [],
    fixed_routes: fixed,
    surcharges: [seatSurcharge],
    zones: [airportZone, neutralZone, cityA, cityB, cantonA, cantonB],
  };
}

function settingsRows(): SettingsVersionRow[] {
  return [
    {
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
    },
  ];
}

function leg(overrides: Partial<QuoteLegInput> = {}): QuoteLegInput {
  return {
    leg_seq: 1,
    scheduled_local: "2026-09-04T12:10",
    distance_m: KM * 1_000,
    duration_s: 900,
    origin_zone_id: neutralZone.id,
    dest_zone_id: neutralZone.id,
    ...overrides,
  };
}

function quote(
  rateBook: RateBook,
  legOverrides: Partial<QuoteLegInput> = {},
  input: Partial<QuoteInput> = {},
) {
  const result = priceQuote(rateBook, settingsRows(), {
    mode: "one_way",
    pax: 2,
    bags: 2,
    display_currency: "XXX",
    computed_at: "2026-09-04T12:00:00.000Z",
    legs: [leg(legOverrides)],
    extras: {},
    coupon: null,
    ...input,
  });
  const eco = result.classes.find((c) => c.slug === "economy");
  if (!eco) throw new Error("missing economy");
  return { result, eco };
}

const codes = (eco: { lines: { code: string | null }[] }) =>
  eco.lines.map((l) => l.code);
const count = (eco: { lines: { code: string | null }[] }, code: string) =>
  eco.lines.filter((l) => l.code === code).length;

describe("D-10 owner cases: the server decides every fare part", () => {
  it("case a: a plain pickup is start + per km and nothing else", () => {
    const { eco } = quote(book());
    expect(codes(eco)).toEqual(["distance_fare"]);
    expect(eco.total_rappen).toBe(FARE);
  });

  it("case b: an airport pickup adds the fee on top of the base start", () => {
    const { eco } = quote(book(), { origin_is_airport: true });
    expect(codes(eco)).toEqual(["distance_fare", "airport_fee"]);
    expect(eco.lines.find((l) => l.code === "distance_fare")?.amount_rappen).toBe(FARE);
    expect(eco.total_rappen).toBe(FARE + AIRPORT_START);
  });

  it("case b-zone: an airport-zone pickup adds the fee", () => {
    const { eco } = quote(book(), { origin_zone_id: airportZone.id });
    expect(codes(eco)).toEqual(["distance_fare", "airport_fee"]);
    expect(eco.total_rappen).toBe(FARE + AIRPORT_START);
  });

  it("case c: a city pair adds exactly one fixed_route line, in both directions", () => {
    const forward = quote(book([cityRow]), {
      origin_zone_id: cityA.id,
      dest_zone_id: cityB.id,
      origin_city_id: "place.a",
      dest_city_id: "place.b",
    }).eco;
    expect(codes(forward)).toEqual(["distance_fare", "fixed_route"]);
    expect(forward.total_rappen).toBe(FARE + CITY_PAIR);

    const reversed = quote(book([cityRow]), {
      origin_zone_id: cityB.id,
      dest_zone_id: cityA.id,
      origin_city_id: "place.b",
      dest_city_id: "place.a",
    }).eco;
    expect(count(reversed, "fixed_route")).toBe(1);
    expect(count(reversed, "distance_fare")).toBe(1);
    expect(reversed.total_rappen).toBe(FARE + CITY_PAIR);
  });

  it("case c-single: a city row and a canton row both matching give one line, the city amount", () => {
    const both = zone("z-both-a", "both-a", "city", ["mapbox_place:place.x", "canton:ZH"]);
    const both2 = zone("z-both-b", "both-b", "city", ["mapbox_place:place.y", "canton:BE"]);
    const rb = book([
      pair(31, "city", both, both2, CITY_PAIR),
      pair(32, "canton", cantonA, cantonB, CANTON_PAIR),
    ]);
    rb.zones = [...rb.zones, both, both2];
    const { eco } = quote(rb, {
      origin_zone_id: both.id,
      dest_zone_id: both2.id,
      origin_city_id: "place.x",
      dest_city_id: "place.y",
      origin_canton: "ZH",
      dest_canton: "BE",
    });
    expect(count(eco, "fixed_route")).toBe(1);
    expect(eco.lines.find((l) => l.code === "fixed_route")?.amount_rappen).toBe(CITY_PAIR);
    expect(eco.total_rappen).toBe(FARE + CITY_PAIR);
  });

  it("case d: airport pickup + canton pair + child seat = every part, and checkout adds extra, coupon, VAT", () => {
    const { eco } = quote(
      book([cantonRow]),
      {
        origin_zone_id: airportZone.id,
        dest_zone_id: cantonB.id,
        origin_canton: "ZH",
        dest_canton: "BE",
      },
      { extras: { child_seats: 1 } },
    );
    expect(codes(eco)).toEqual(["distance_fare", "airport_fee", "child_seat", "fixed_route"]);
    const total = FARE + AIRPORT_START + CANTON_PAIR + SEAT;
    expect(eco.total_rappen).toBe(total);

    const extra = 400;
    const coupon = 300;
    const charged = checkoutCharge({
      classNetRappen: total,
      preCouponRappen: total,
      extraCodes: ["wait"],
      catalog: [
        { code: "wait", amountRappen: extra, labels: { en: "w", de: "w", fr: "w", ar: "w" } },
      ],
      coupon: { code: "C", kind: "amount", percentHundredths: null, amountRappen: coupon },
      vatRateBps: 81,
      vehicleClassSlug: "economy",
    });
    if (!charged.ok) throw new Error("charge failed");
    expect(charged.netRappen).toBe(total + extra - coupon);
    expect(charged.chargedRappen).toBe(charged.netRappen + charged.vatRappen);
    expect(charged.vatRappen).toBeGreaterThan(0);
    expect(charged.lines.reduce((s, l) => s + l.amount_rappen, 0)).toBe(charged.chargedRappen);
  });
});

describe("D-08 airport fee from the pickup only", () => {
  it("a drop-off at an airport adds no fee", () => {
    const zoneDrop = quote(book(), { dest_zone_id: airportZone.id }).eco;
    expect(count(zoneDrop, "airport_fee")).toBe(0);
    expect(zoneDrop.total_rappen).toBe(FARE);
  });

  it("negative flight: a flight number on a non-airport pickup adds no airport_fee", () => {
    const { eco } = quote(book(), { flight_no: "LX1234" });
    expect(count(eco, "airport_fee")).toBe(0);
    expect(eco.total_rappen).toBe(FARE);
  });

  it("flight on an airport pickup gives exactly one airport_fee, no double", () => {
    const { eco } = quote(book(), { origin_is_airport: true, flight_no: "LX1234" });
    expect(count(eco, "airport_fee")).toBe(1);
    expect(eco.total_rappen).toBe(FARE + AIRPORT_START);
  });
});

describe("D-14 fare_kind changes nothing", () => {
  it("the four fare_kind values give JSON-identical classes", () => {
    const rb = book([cantonRow]);
    const legOv: Partial<QuoteLegInput> = {
      origin_is_airport: true,
      dest_zone_id: cantonB.id,
      origin_zone_id: cantonA.id,
      origin_canton: "ZH",
      dest_canton: "BE",
    };
    const results = [undefined, "one_way", "airport_pickup", "city_to_city"].map((kind) =>
      JSON.stringify(
        quote(rb, legOv, {
          extras: { child_seats: 1 },
          // Not part of QuoteInput any more (D-14): an old caller may still send it.
          ...({ fare_kind: kind } as object),
        }).result.classes,
      ),
    );
    expect(new Set(results).size).toBe(1);
  });
});

describe("R1 legacy lock with fare_kind", () => {
  const SECRET = "test-quote-lock-secret-current-not-real-00";

  function payload(fare_kind?: QuoteLockPayload["fare_kind"]): QuoteLockPayload {
    return {
      v: 1,
      quote_id: "q_legacy",
      exp: "2099-01-01T00:00:00.000Z",
      engine_version: "quote-engine@test",
      rate_version_id: null,
      settings_version_id: 1,
      computed_at: "2026-08-28T12:00:00.000Z",
      display_currency: "CHF",
      mode: "one_way",
      ...(fare_kind ? { fare_kind } : {}),
      pax: 2,
      bags: 1,
      legs: [
        {
          leg_seq: 1,
          pickup: { lng: 8.54, lat: 47.37, text: "Zurich HB" },
          dropoff: { lng: 8.56, lat: 47.45, text: "ZRH" },
          scheduled_local: "2026-09-01T10:30:00",
          distance_m: KM * 1_000,
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
  }

  const board: ClassBoardEntry[] = [];
  const policy: PolicySnapshot = {
    settings_version_id: 1,
    free_cancel_hours: null,
    modification_deadline_hours: null,
    min_advance_minutes: null,
    airport_waiting_minutes: null,
    city_waiting_minutes: null,
    cancellation_tiers: [],
    policy_doc: null,
  };

  async function repriced(fare_kind?: QuoteLockPayload["fare_kind"]) {
    const token = await mintLock({ current: SECRET }, payload(fare_kind));
    const verified = await verifyLock({ current: SECRET }, token, "2026-08-28T12:00:00.000Z");
    expect(verified.ok).toBe(true);
    let captured: QuoteInput | undefined;
    const deps = {
      env: {} as CloudflareEnv,
      lockSecrets: { current: SECRET },
      nowMs: Date.UTC(2026, 7, 1, 8, 0, 0),
      computedAt: "2026-08-28T12:00:00.000Z",
      nowIso: "2026-08-28T12:00:00.000Z",
      engineVersion: "quote-engine@testhash",
      mintQuoteId: () => "11111111-1111-4111-8111-111111111111",
      loadSettings: async () => ({ id: 1, min_advance_minutes: null, service_area_geojson: null }),
      checkServiceArea: () => ({ ok: true }),
      quoteLockDeadline: async () => "2099-01-01T12:00:00.000Z",
      loadAndPrice: async (_env: unknown, input: QuoteInput) => {
        captured = input;
        return {
          ok: true,
          quote: {
            no_eligible_class: false,
            classes: board,
            policy,
            rate_version: null,
            engine_version: "quote-engine@test",
            pricing_live: false,
            settings_version_id: 1,
            partially_priced_class_slugs: [],
            computed_at: "2026-08-28T12:00:00.000Z",
          },
        };
      },
      routeLegs: async () => ({ ok: false, code: "route_unavailable" }),
      reverse: async () => ({ place: null }),
      retrieve: async () => ({ place: null }),
    } as unknown as QuotePipelineDeps;
    const result = await runRepricePipeline(
      { quote_id: "q_legacy", lock: token, locale: "en", display_currency: "CHF" },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!captured) throw new Error("kernel not reached");
    return priceQuote(book(), settingsRows(), captured);
  }

  it("a lock carrying fare_kind verifies and reprices to the same classes as one without it", async () => {
    const without = await repriced();
    const withKind = await repriced("airport_pickup");
    expect(JSON.stringify(withKind.classes)).toBe(JSON.stringify(without.classes));
    expect(without.classes[0]?.total_rappen).toBe(FARE);
  });
});
