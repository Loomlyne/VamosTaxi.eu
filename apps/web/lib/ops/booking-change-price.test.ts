// apps/web/lib/ops/booking-change-price.test.ts
//
// 26.2 P1 price step. Each booking here is "checked out" the way checkout does it (kernel with the
// lock coupon, gross-up, checkoutCharge, snapshotLinesFromCharge) at an exact metre count; the
// price step then sees only what a booking stores (10 m distance, lines, shown class totals) and
// must reproduce that charge to the rappen before it prices another class. Synthetic integer
// rappen only, never a product CHF.

import { describe, expect, it } from "vitest";
import { checkoutCharge, type CheckoutChargeCoupon, type ExtraCatalogRow } from "../checkout/checkout-charge";
import { snapshotLinesFromCharge } from "../checkout/lock-to-rpc";
import { farePartsFromLines } from "../checkout/price-rows";
import { preCouponTotalOfClass } from "../pricing/policy";
import { priceQuote } from "../pricing/priceQuote";
import type { SettingsVersionRow } from "../pricing/policy";
import { roundHalfUp } from "../pricing/round";
import type { DistanceRateRow, RateBook, VehicleClassRow, ZoneRow } from "../pricing/types";
import {
  priceBookingChange,
  quoteInputFromFacts,
  savedChargeFromSnapshot,
  type PriceBook,
  type TripFacts,
} from "./booking-change-price";

const AT = "2026-10-01T08:00:00.000Z";

function cls(slug: string, pax: number, bags: number, sort: number, name: string): VehicleClassRow {
  return { id: `vc-${slug}`, slug, passenger_capacity: pax, luggage_capacity: bags, sort_order: sort, active: true, name };
}

function rate(rv: number, slug: string, base: number, perKm: number, airport: number | null = null): DistanceRateRow {
  return {
    id: rv * 100 + slug.length,
    rate_version_id: rv,
    vehicle_class_id: `vc-${slug}`,
    base_fare_rappen: base,
    per_km_rappen: perKm,
    min_fare_rappen: null,
    max_pax: 8,
    available: true,
    airport_start_rappen: airport,
    city_price_rappen: null,
  };
}

const ECO = cls("eco-x", 4, 4, 1, "Economy");
const BIZ = cls("biz-x", 7, 7, 2, "Business");
const VAN = cls("van-x", 8, 8, 3, "Van luxury");
const AIRPORT: ZoneRow = { id: "z-air", slug: "zrh-air", iata: "ZRH", active: true, zone_type: "airport", tags: [] };

function book(rv: number, perKm: { eco: number; biz: number; van: number }, airport = false): RateBook {
  return {
    rate_version: { id: rv, slug: `rv-${rv}` },
    classes: [ECO, BIZ, VAN],
    distance_rates: [
      rate(rv, ECO.slug, 1000, perKm.eco, airport ? 1500 : null),
      rate(rv, BIZ.slug, 1200, perKm.biz, airport ? 1800 : null),
      rate(rv, VAN.slug, 1400, perKm.van, airport ? 2100 : null),
    ],
    distance_bands: [],
    region_premiums: [],
    fixed_routes: [],
    surcharges: [],
    zones: [AIRPORT],
  };
}

const SETTINGS: SettingsVersionRow[] = [
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

const RATES = { eco: 300, biz: 420, van: 510 };
const EXACT_M = 31_417;

function facts(over: Partial<TripFacts> = {}): TripFacts {
  return {
    scheduledLocal: "2026-10-08T10:00",
    distanceM: 31_420, // the saved distance_km 31.42
    distanceToleranceM: 5,
    durationS: 2400,
    originZoneId: null,
    destZoneId: null,
    originPlace: "Bahnhofstrasse 1, Zurich",
    destPlace: "Zug",
    originCanton: "ZH",
    destCanton: "ZG",
    originCityId: "city-zurich",
    destCityId: "city-zug",
    originCityName: "Zurich",
    destCityName: "Zug",
    originIsAirport: false,
    flightNo: null,
    pax: 2,
    bags: 1,
    ...over,
  };
}

const EXTRAS: ExtraCatalogRow[] = [
  { code: "child_seat", amountRappen: 700, labels: { en: "Child seat", de: "Kindersitz", fr: "Siège enfant", ar: "مقعد طفل" } },
  { code: "ski_bag", amountRappen: 450, labels: { en: "Ski bag", de: "Skitasche", fr: "Sac de ski", ar: "حقيبة تزلج" } },
];

function couponFactsOf(c: CheckoutChargeCoupon | null) {
  if (!c) return null;
  return c.kind === "percent"
    ? { id: 1, code: c.code, kind: "percent" as const, percent: (c.percentHundredths! / 100).toFixed(2), amount_rappen: null }
    : { id: 1, code: c.code, kind: "amount" as const, percent: null, amount_rappen: c.amountRappen };
}

/** What checkout charges and stores for one class at an exact metre count (intent.ts order). */
function checkout(b: RateBook, f: TripFacts, metres: number, slug: string, opts: {
  extras?: ExtraCatalogRow[];
  coupon?: CheckoutChargeCoupon | null;
  vat?: number;
  /** 261003: save the fee and route pieces as their own fare lines (what checkout writes now). */
  split?: boolean;
} = {}) {
  const coupon = opts.coupon ?? null;
  const quote = priceQuote(b, SETTINGS, quoteInputFromFacts(f, metres, AT), { coupon: couponFactsOf(coupon) });
  const entry = quote.classes.find((c) => c.slug === slug)!;
  const net = entry.total_rappen!;
  let pre: number | null = null;
  if (coupon?.kind === "percent") pre = roundHalfUp(net * 10_000, 10_000 - coupon.percentHundredths!);
  if (coupon?.kind === "amount") pre = net + coupon.amountRappen!;
  const extras = opts.extras ?? [];
  const charge = checkoutCharge({
    classNetRappen: net,
    preCouponRappen: pre,
    extraCodes: extras.map((e) => e.code),
    catalog: extras,
    coupon,
    vatRateBps: opts.vat ?? 81,
    vehicleClassSlug: slug,
    ...(opts.split
      ? {
          fareParts: farePartsFromLines(
            entry.lines.map((l) => ({
              code: l.code,
              amount_rappen: l.amount_rappen,
              ...(l.params ? { params: l.params as Record<string, string | number | null> } : {}),
            })),
          ),
        }
      : {}),
  });
  if (!charge.ok) throw new Error("fixture charge failed");
  return {
    total_rappen: charge.chargedRappen,
    lines: snapshotLinesFromCharge(charge.lines),
    rate_version_id: b.rate_version!.id,
    class_slug: slug,
    shown_alternatives: quote.classes.map((c) => ({ slug: c.slug, total_rappen: c.eligible ? c.total_rappen : null })),
  };
}

function pb(b: RateBook, vat = 81): PriceBook {
  return { book: b, settings: SETTINGS, vatRateBps: vat };
}

function run(args: {
  booked: ReturnType<typeof checkout>;
  bookingBook?: RateBook;
  today?: RateBook;
  todayVat?: number;
  f?: TripFacts;
  paid?: number;
  dropShown?: boolean;
}) {
  const saved = savedChargeFromSnapshot(args.dropShown ? { ...args.booked, shown_alternatives: [] } : args.booked);
  if (!saved) throw new Error("saved charge did not parse");
  return priceBookingChange({
    bookingBook: pb(args.bookingBook ?? book(18, RATES)),
    today: pb(args.today ?? book(18, RATES), args.todayVat ?? 81),
    facts: args.f ?? facts(),
    saved,
    paidRappen: args.paid ?? args.booked.total_rappen,
    computedAt: AT,
  });
}

function priceOf(result: ReturnType<typeof run>, slug: string) {
  if (!result.ok) throw new Error(`refused: ${result.code}`);
  const row = result.classes.find((c) => c.slug === slug);
  if (!row) throw new Error(`no row for ${slug}`);
  return row;
}

describe("class change price step (D3, D5)", () => {
  const f = facts();
  const today = book(18, RATES);

  it("dearer: Economy booked, Business priced to the rappen, difference against what was paid", () => {
    const booked = checkout(today, f, EXACT_M, ECO.slug);
    const want = checkout(today, f, EXACT_M, BIZ.slug).total_rappen;
    const row = priceOf(run({ booked }), BIZ.slug);
    expect(row).toMatchObject({ ok: true, newTotalRappen: want, differenceRappen: want - booked.total_rappen, current: false, name: "Business" });
    expect(want).toBeGreaterThan(booked.total_rappen);
  });

  it("cheaper: Business booked, Economy shows a negative difference", () => {
    const booked = checkout(today, f, EXACT_M, BIZ.slug);
    const want = checkout(today, f, EXACT_M, ECO.slug).total_rappen;
    const row = priceOf(run({ booked }), ECO.slug);
    expect(row).toMatchObject({ ok: true, newTotalRappen: want, differenceRappen: want - booked.total_rappen });
    expect(row.ok && row.differenceRappen).toBeLessThan(0);
  });

  it("same price: two classes at the same rates give a difference of 0", () => {
    const flat = book(18, { eco: 300, biz: 300, van: 510 });
    flat.distance_rates = flat.distance_rates.map((r) => (r.vehicle_class_id === BIZ.id ? { ...r, base_fare_rappen: 1000 } : r));
    const booked = checkout(flat, f, EXACT_M, ECO.slug);
    const row = priceOf(run({ booked, bookingBook: flat, today: flat }), BIZ.slug);
    expect(row).toMatchObject({ ok: true, differenceRappen: 0 });
  });

  it("extras stay at the amount paid and a percent coupon applies as it did (D5)", () => {
    const coupon: CheckoutChargeCoupon = { code: "SPRING", kind: "percent", percentHundredths: 1250, amountRappen: null };
    const booked = checkout(today, f, EXACT_M, ECO.slug, { extras: EXTRAS, coupon });
    const want = checkout(today, f, EXACT_M, VAN.slug, { extras: EXTRAS, coupon }).total_rappen;
    const row = priceOf(run({ booked }), VAN.slug);
    expect(row).toMatchObject({ ok: true, newTotalRappen: want });
    if (!row.ok) return;
    const kinds = row.lines.map((l) => l.kind);
    expect(kinds).toEqual(["fare", "surcharge", "surcharge", "coupon", "vat"]);
    expect(row.lines.reduce((s, l) => s + (l.amount_rappen ?? 0), 0)).toBe(want);
    expect(row.lines[0]!.params).toMatchObject({ vehicleClass: VAN.slug });
    expect(row.lines.filter((l) => l.kind === "surcharge").map((l) => l.code)).toEqual(["child_seat", "ski_bag"]);
  });

  it("a fixed-amount coupon applies as it did", () => {
    const coupon: CheckoutChargeCoupon = { code: "TEN", kind: "amount", percentHundredths: null, amountRappen: 1000 };
    const booked = checkout(today, f, EXACT_M, BIZ.slug, { coupon });
    const want = checkout(today, f, EXACT_M, ECO.slug, { coupon }).total_rappen;
    expect(priceOf(run({ booked }), ECO.slug)).toMatchObject({ ok: true, newTotalRappen: want });
  });

  it("the paid figure is everything paid minus refunds, not the booked total", () => {
    const booked = checkout(today, f, EXACT_M, ECO.slug);
    const want = checkout(today, f, EXACT_M, BIZ.slug).total_rappen;
    const row = priceOf(run({ booked, paid: booked.total_rappen + 300 }), BIZ.slug);
    expect(row).toMatchObject({ ok: true, differenceRappen: want - booked.total_rappen - 300 });
  });

  it("a class that cannot take the passengers or bags is refused, with the reason", () => {
    const big = facts({ pax: 6 });
    const booked = checkout(today, big, EXACT_M, VAN.slug);
    const result = run({ booked, f: big });
    expect(priceOf(result, ECO.slug)).toMatchObject({ ok: false, code: "class-too-small" });
    expect(priceOf(result, BIZ.slug)).toMatchObject({ ok: true });
  });

  it("D3: priced with today's book; the check still uses the booking's own book", () => {
    const old = book(17, RATES);
    const booked = checkout(old, f, EXACT_M, ECO.slug);
    const newer = book(18, { eco: 330, biz: 450, van: 540 });
    const want = checkout(newer, f, EXACT_M, BIZ.slug).total_rappen;
    const result = run({ booked, bookingBook: old, today: newer });
    expect(result).toMatchObject({ ok: true, rateVersionId: 18, currentTotalRappen: booked.total_rappen });
    expect(priceOf(result, BIZ.slug)).toMatchObject({ ok: true, newTotalRappen: want });
  });

  it("VAT on the new price is today's rate", () => {
    const booked = checkout(today, f, EXACT_M, ECO.slug, { vat: 81 });
    const want = checkout(today, f, EXACT_M, BIZ.slug, { vat: 77 }).total_rappen;
    expect(priceOf(run({ booked, todayVat: 77 }), BIZ.slug)).toMatchObject({ ok: true, newTotalRappen: want });
  });

  it("trip data that does not reproduce the charge is refused (airport fee not in the saved facts)", () => {
    const air = book(18, RATES, true);
    const atAirport = facts({ originIsAirport: true });
    const booked = checkout(air, atAirport, EXACT_M, ECO.slug);
    const result = run({ booked, bookingBook: air, today: air, f: facts({ originIsAirport: false }) });
    expect(result).toEqual({ ok: false, code: "trip-data" });
    expect(run({ booked, bookingBook: air, today: air, f: atAirport }).ok).toBe(true);
  });

  it("a new price that the saved 10 m distance cannot fix to the rappen is refused, not guessed", () => {
    const old = book(17, RATES);
    const booked = checkout(old, f, EXACT_M, ECO.slug);
    const newer = book(18, { eco: 330, biz: 450, van: 540 });
    const result = run({ booked, bookingBook: old, today: newer, dropShown: true });
    expect(priceOf(result, BIZ.slug)).toMatchObject({ ok: false, code: "trip-data" });
  });

  it("the shown class totals pin the distance, so the same-book price is exact", () => {
    const booked = checkout(today, f, EXACT_M, ECO.slug);
    const result = run({ booked });
    for (const slug of [ECO.slug, BIZ.slug, VAN.slug]) {
      expect(priceOf(result, slug)).toMatchObject({ ok: true, newTotalRappen: checkout(today, f, EXACT_M, slug).total_rappen });
    }
    expect(priceOf(result, ECO.slug)).toMatchObject({ current: true, differenceRappen: 0 });
  });
});

// 261003 fare lines: a booking saved with fare pieces (distance_fare + airport_fee + fixed_route)
// must reproduce and re-price (it was "trip-data" before the rule), and the new price record is cut
// the same way. Internal rappen only.
describe("fare lines: airport fee and route pieces", () => {
  const airportBook = book(18, RATES, true);
  const withRoute: RateBook = {
    ...airportBook,
    zones: [
      ...airportBook.zones,
      { id: "z-a", slug: "zurich", iata: null, active: true, zone_type: "city", tags: ["mapbox_place:city-zurich"] },
      { id: "z-b", slug: "zug", iata: null, active: true, zone_type: "city", tags: ["mapbox_place:city-zug"] },
    ],
    fixed_routes: [ECO, BIZ, VAN].map((c, i) => ({
      id: 900 + i,
      rate_version_id: 18,
      origin_zone_id: "z-a",
      dest_zone_id: "z-b",
      vehicle_class_id: c.id,
      price_rappen: 800 + 100 * i,
      live: true,
      kind: "city" as const,
      origin_label: "Zurich",
      dest_label: "Zug",
    })),
  };
  const atAirport = facts({ originIsAirport: true, originPlace: "Zurich Airport, Zurich" });
  const feeCodes = (r: ReturnType<typeof checkout>) => r.lines.filter((l) => l.kind === "fare").map((l) => l.code);

  it("a saved price with distance_fare + airport_fee reproduces and re-prices to the same totals as the one-line price", () => {
    const one = checkout(airportBook, atAirport, EXACT_M, ECO.slug);
    const split = checkout(airportBook, atAirport, EXACT_M, ECO.slug, { split: true });
    expect(feeCodes(one)).toEqual(["distance_fare"]);
    expect(feeCodes(split)).toEqual(["distance_fare", "airport_fee"]);
    expect(split.total_rappen).toBe(one.total_rappen);
    const a = run({ booked: one, bookingBook: airportBook, today: airportBook, f: atAirport });
    const b = run({ booked: split, bookingBook: airportBook, today: airportBook, f: atAirport });
    expect(b.ok).toBe(true);
    for (const slug of [ECO.slug, BIZ.slug, VAN.slug]) {
      expect(priceOf(b, slug)).toMatchObject({ ok: true, newTotalRappen: checkout(airportBook, atAirport, EXACT_M, slug).total_rappen });
      expect(priceOf(b, slug)).toMatchObject({ newTotalRappen: (priceOf(a, slug) as { newTotalRappen: number }).newTotalRappen });
    }
  });

  it("airport + route + extras + coupon: reproduces, and the new record is split with lines adding up to the new total", () => {
    const coupon: CheckoutChargeCoupon = { code: "SPRING", kind: "percent", percentHundredths: 1000, amountRappen: null };
    const booked = checkout(withRoute, atAirport, EXACT_M, ECO.slug, { split: true, extras: EXTRAS, coupon });
    expect(feeCodes(booked)).toEqual(["distance_fare", "airport_fee", "fixed_route"]);
    const result = run({ booked, bookingBook: withRoute, today: withRoute, f: atAirport });
    const row = priceOf(result, BIZ.slug);
    if (!row.ok) throw new Error("refused");
    const want = checkout(withRoute, atAirport, EXACT_M, BIZ.slug, { split: true, extras: EXTRAS, coupon });
    expect(row.newTotalRappen).toBe(want.total_rappen);
    expect(row.lines.filter((l) => l.kind === "fare").map((l) => l.code)).toEqual(["distance_fare", "airport_fee", "fixed_route"]);
    expect(row.lines.find((l) => l.code === "fixed_route")?.params).toEqual({ origin: "Zurich", destination: "Zug" });
    expect(row.lines.reduce((s, l) => s + (l.amount_rappen ?? 0), 0)).toBe(row.newTotalRappen);
    // Every saved non-fare line (extras, coupon, VAT) equals the same charge without parts, rappen
    // for rappen (same board, same pinned pre-coupon fare as the price step reads).
    const entry = priceQuote(withRoute, SETTINGS, quoteInputFromFacts(atAirport, EXACT_M, AT), { coupon: couponFactsOf(coupon) })
      .classes.find((c) => c.slug === BIZ.slug)!;
    const plain = checkoutCharge({
      classNetRappen: entry.total_rappen!,
      preCouponRappen: preCouponTotalOfClass(entry),
      extraCodes: EXTRAS.map((e) => e.code),
      catalog: EXTRAS,
      coupon,
      vatRateBps: 81,
      vehicleClassSlug: BIZ.slug,
    });
    if (!plain.ok) throw new Error("fixture charge failed");
    const rest = (lines: Array<{ kind: string; seq: number }>) => lines.filter((l) => l.kind !== "fare").map(({ seq: _s, ...r }) => r);
    expect(rest(row.lines)).toEqual(rest(snapshotLinesFromCharge(plain.lines)));
    expect(row.newTotalRappen).toBe(plain.chargedRappen);
  });

  it("savedChargeFromSnapshot accepts the two new fare codes and still refuses any other fare code", () => {
    const base = { total_rappen: 10, rate_version_id: 1, class_slug: "eco-x" };
    const vat = { kind: "vat", code: "vat", params: { vatRateBps: 81 }, amount_rappen: 0 };
    const fare = (code: string) => ({ kind: "fare", code, amount_rappen: 3 });
    expect(savedChargeFromSnapshot({ ...base, lines: [fare("distance_fare"), fare("airport_fee"), fare("fixed_route"), vat] })).not.toBeNull();
    expect(savedChargeFromSnapshot({ ...base, lines: [fare("distance_fare"), fare("extra_fare"), vat] })).toBeNull();
    expect(savedChargeFromSnapshot({ ...base, lines: [fare("airport_fee"), vat] })).toBeNull();
    expect(savedChargeFromSnapshot({ ...base, lines: [fare("distance_fare"), fare("distance_fare"), vat] })).toBeNull();
  });
});

describe("savedChargeFromSnapshot", () => {
  it("reads extras before the coupon, the coupon rule and the VAT rate", () => {
    const coupon: CheckoutChargeCoupon = { code: "SPRING", kind: "percent", percentHundredths: 1250, amountRappen: null };
    const booked = checkout(book(18, RATES), facts(), EXACT_M, ECO.slug, { extras: EXTRAS, coupon });
    const saved = savedChargeFromSnapshot(booked)!;
    expect(saved.extras.map((e) => [e.code, e.amountRappen, e.labels.de])).toEqual([
      ["child_seat", 700, "Kindersitz"],
      ["ski_bag", 450, "Skitasche"],
    ]);
    expect(saved.coupon).toEqual(coupon);
    expect(saved.vatRateBps).toBe(81);
  });

  it("refuses a record without a VAT line (older shape) or with a line it does not know", () => {
    const base = { total_rappen: 10, rate_version_id: 1, class_slug: "eco-x" };
    expect(savedChargeFromSnapshot({ ...base, lines: [{ kind: "fare", code: "distance_fare", amount_rappen: 10 }] })).toBeNull();
    expect(
      savedChargeFromSnapshot({
        ...base,
        lines: [
          { kind: "fare", code: "distance_fare", amount_rappen: 9 },
          { kind: "extra_fare", code: "x", amount_rappen: 1 },
          { kind: "vat", code: "vat", params: { vatRateBps: 81 }, amount_rappen: 0 },
        ],
      }),
    ).toBeNull();
  });
});
