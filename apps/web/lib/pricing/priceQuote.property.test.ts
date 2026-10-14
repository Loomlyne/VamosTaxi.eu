// apps/web/lib/pricing/priceQuote.property.test.ts
//
// GAP-2 (04-VALIDATION.md): property-based proofs for the quote pipeline.
// Only properties the code documents are asserted (priceQuote.ts header,
// assembleTotals identity, policy.ts D-16 coupon clamp, round.ts half-up).
// Generators are bounded; fast-check seeds are fixed so a failure replays.
// There is no VAT step in priceQuote today: "total" is Σ signed lines.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { assembleTotals, priceQuote } from "./priceQuote";
import type { CouponFacts, SettingsVersionRow } from "./policy";
import { percentOf, percentToHundredths } from "./round";
import type {
  DistanceRateRow,
  QuoteInput,
  QuoteLegInput,
  RateBook,
  SurchargeRow,
  VehicleClassRow,
  ZoneRow,
} from "./types";

const SEED = 20261011;
const RUNS = 200;
const cfg = { seed: SEED, numRuns: RUNS };

const economy: VehicleClassRow = {
  id: "vc-economy",
  slug: "economy",
  passenger_capacity: 3,
  luggage_capacity: 3,
  sort_order: 1,
  active: true,
};

const zones: ZoneRow[] = [
  { id: "z-a", slug: "zrh-airport", iata: "ZRH", active: true, zone_type: "airport", tags: [] },
  { id: "z-b", slug: "zurich-city", iata: null, active: true, zone_type: "city", tags: [] },
];

function surcharge(
  p: Partial<SurchargeRow> & Pick<SurchargeRow, "code">,
): SurchargeRow {
  return {
    id: p.id ?? 1,
    rate_version_id: 1,
    code: p.code,
    kind: p.kind ?? "amount",
    amount_rappen: p.amount_rappen ?? null,
    percent: p.percent ?? null,
    applies_to: p.applies_to ?? "leg",
    active: p.active ?? true,
    predicate: p.predicate ?? { kind: "always" },
    quantity_source: p.quantity_source ?? null,
  };
}

interface BookParams {
  base: number;
  perKm: number;
  min: number;
  airportStart: number;
  airportFee: number;
  nightPct: string;
  returnPct: string;
  seat: number;
}

function buildBook(p: BookParams): RateBook {
  const rate: DistanceRateRow = {
    id: 10,
    rate_version_id: 1,
    vehicle_class_id: economy.id,
    base_fare_rappen: p.base,
    per_km_rappen: p.perKm,
    min_fare_rappen: p.min,
    airport_start_rappen: p.airportStart,
    city_price_rappen: null,
    max_pax: 3,
    available: true,
  };
  return {
    rate_version: { id: 1, slug: "prop" },
    classes: [economy],
    distance_rates: [rate],
    fixed_routes: [],
    surcharges: [
      surcharge({
        id: 9,
        code: "airport_pickup",
        kind: "amount",
        amount_rappen: p.airportFee,
        predicate: { kind: "pickup_zone_type", zone_type: "airport" },
      }),
      surcharge({
        id: 11,
        code: "night",
        kind: "percent",
        percent: p.nightPct,
        predicate: {
          kind: "local_time_window",
          tz: "Europe/Zurich",
          from: "20:00",
          to: "06:00",
        },
      }),
      surcharge({ id: 5, code: "waiting_airport", kind: "included" }),
      surcharge({
        id: 14,
        code: "child_seat",
        kind: "amount",
        amount_rappen: p.seat,
        quantity_source: "child_seats",
        predicate: { kind: "quantity" },
      }),
      surcharge({
        id: 20,
        code: "return_trip",
        kind: "percent",
        percent: p.returnPct,
        applies_to: "booking",
      }),
    ],
    zones,
  };
}

const settings: SettingsVersionRow[] = [
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

// ---- generators (bounded) ---------------------------------------------------

const pctString = fc
  .tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 99 }))
  .map(([w, f]) => (w === 100 ? "100" : `${w}.${String(f).padStart(2, "0")}`));

const bookParams: fc.Arbitrary<BookParams> = fc.record({
  base: fc.integer({ min: 0, max: 5_000 }),
  perKm: fc.integer({ min: 0, max: 1_000 }),
  min: fc.integer({ min: 0, max: 5_000 }),
  airportStart: fc.integer({ min: 0, max: 5_000 }),
  airportFee: fc.integer({ min: 0, max: 2_000 }),
  nightPct: pctString,
  returnPct: pctString,
  seat: fc.integer({ min: 0, max: 1_000 }),
});

const hhmm = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 0, max: 59 }))
  .map(([h, m]) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);

const zoneId = fc.constantFrom("z-a", "z-b");

function legArb(seq: number, day: number): fc.Arbitrary<QuoteLegInput> {
  return fc
    .record({
      time: hhmm,
      // distance_m 0 is the documented unpriced case (buildFareLine: no metres -> null amount).
      distance_m: fc.integer({ min: 1, max: 300_000 }),
      duration_s: fc.integer({ min: 0, max: 20_000 }),
      o: zoneId,
      d: zoneId,
    })
    .map((x) => ({
      leg_seq: seq,
      scheduled_local: `2026-09-${String(day).padStart(2, "0")}T${x.time}`,
      distance_m: x.distance_m,
      duration_s: x.duration_s,
      origin_zone_id: x.o,
      dest_zone_id: x.d,
    }));
}

type Journey = Pick<QuoteInput, "mode" | "legs" | "extras" | "pax" | "bags">;

const journeyArb: fc.Arbitrary<Journey> = fc.oneof(
  fc
    .tuple(legArb(1, 4), fc.integer({ min: 0, max: 3 }))
    .map(([leg, seats]) => ({
      mode: "one_way" as const,
      legs: [leg],
      extras: { child_seats: seats },
      pax: 2,
      bags: 2,
    })),
  fc
    .tuple(legArb(1, 4), legArb(2, 10), fc.integer({ min: 0, max: 3 }))
    .map(([l1, l2, seats]) => ({
      mode: "return" as const,
      legs: [l1, l2],
      extras: { child_seats: seats },
      pax: 2,
      bags: 2,
    })),
);

const computedAt = fc
  .integer({ min: 0, max: 14 })
  .map((y) => `${2026 + y}-09-04T12:00:00.000Z`);

const couponArb: fc.Arbitrary<CouponFacts> = fc.oneof(
  pctString.map((p) => ({
    id: 3,
    code: "SAVE",
    kind: "percent" as const,
    percent: p,
    amount_rappen: null,
  })),
  fc.integer({ min: 0, max: 100_000 }).map((a) => ({
    id: 4,
    code: "FLAT",
    kind: "amount" as const,
    percent: null,
    amount_rappen: a,
  })),
);

function mkInput(j: Journey, computed_at = "2026-09-04T12:00:00.000Z"): QuoteInput {
  return { ...j, display_currency: "XXX", computed_at, coupon: null };
}

function economyEntry(out: ReturnType<typeof priceQuote>) {
  const e = out.classes.find((c) => c.slug === "economy");
  if (!e || !e.eligible) throw new Error("economy must be eligible in fixtures");
  return e;
}

function signedSum(lines: { kind: string; amount_rappen: number | null }[]) {
  let s = 0;
  for (const l of lines) {
    if (l.kind === "included") continue;
    s += l.kind === "discount" ? -(l.amount_rappen as number) : (l.amount_rappen as number);
  }
  return s;
}

// ---- properties -------------------------------------------------------------

describe("priceQuote — property: determinism", () => {
  it("same inputs give JSON.stringify-equal output regardless of computed_at", () => {
    fc.assert(
      fc.property(bookParams, journeyArb, computedAt, computedAt, (bp, j, t1, t2) => {
        const book = buildBook(bp);
        const a = priceQuote(book, settings, mkInput(j, t1));
        const b = priceQuote(book, settings, mkInput(j, t2));
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      cfg,
    );
  });

  it("repeated calls with identical input are JSON.stringify-equal, with and without a coupon", () => {
    fc.assert(
      fc.property(bookParams, journeyArb, fc.option(couponArb, { nil: null }), (bp, j, coupon) => {
        const book = buildBook(bp);
        const a = priceQuote(book, settings, mkInput(j), { coupon });
        const b = priceQuote(book, settings, mkInput(j), { coupon });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      }),
      cfg,
    );
  });
});

describe("priceQuote — property: total equals the sum of its lines", () => {
  it("class total_rappen is the signed Σ of priced lines; assembleTotals agrees; every amount is a non-negative integer", () => {
    fc.assert(
      fc.property(bookParams, journeyArb, fc.option(couponArb, { nil: null }), (bp, j, coupon) => {
        const out = priceQuote(buildBook(bp), settings, mkInput(j), { coupon });
        const e = economyEntry(out);
        expect(out.partially_priced_class_slugs).toEqual([]);
        expect(e.total_rappen).not.toBeNull();
        for (const l of e.lines) {
          if (l.kind === "included") continue;
          expect(Number.isSafeInteger(l.amount_rappen)).toBe(true);
          expect(l.amount_rappen as number).toBeGreaterThanOrEqual(0);
        }
        expect(e.total_rappen).toBe(signedSum(e.lines));
        const t = assembleTotals(e.lines);
        expect(t.total_rappen).toBe(e.total_rappen);
        expect(t.total_rappen).toBe(
          (t.subtotal_rappen as number) +
            (t.surcharges_rappen as number) -
            (t.discount_rappen as number),
        );
      }),
      cfg,
    );
  });

  it("line seq values are 1..n in order", () => {
    fc.assert(
      fc.property(bookParams, journeyArb, fc.option(couponArb, { nil: null }), (bp, j, coupon) => {
        const e = economyEntry(
          priceQuote(buildBook(bp), settings, mkInput(j), { coupon }),
        );
        expect(e.lines.map((l) => l.seq)).toEqual(e.lines.map((_, i) => i + 1));
      }),
      cfg,
    );
  });
});

describe("priceQuote — property: surcharge and coupon ordering", () => {
  it("order of independent surcharge rows in the book does not change the total or any line", () => {
    fc.assert(
      fc.property(
        bookParams,
        journeyArb,
        fc.option(couponArb, { nil: null }),
        fc.infiniteStream(fc.nat()),
        (bp, j, coupon, rnd) => {
          const book = buildBook(bp);
          // deterministic Fisher-Yates driven by the fast-check stream
          const sc = [...book.surcharges];
          const it = rnd[Symbol.iterator]();
          for (let i = sc.length - 1; i > 0; i -= 1) {
            const k = it.next().value % (i + 1);
            [sc[i], sc[k]] = [sc[k]!, sc[i]!];
          }
          const base = priceQuote(book, settings, mkInput(j), { coupon });
          const shuffled = priceQuote({ ...book, surcharges: sc }, settings, mkInput(j), { coupon });
          expect(economyEntry(shuffled).total_rappen).toBe(economyEntry(base).total_rappen);
          expect(JSON.stringify(shuffled)).toBe(JSON.stringify(base));
        },
      ),
      cfg,
    );
  });

  it("percent surcharges are rounded half-up once per line, on the leg's fare line only", () => {
    fc.assert(
      fc.property(bookParams, journeyArb, (bp, j) => {
        const e = economyEntry(priceQuote(buildBook(bp), settings, mkInput(j)));
        for (const leg of j.legs) {
          const fare = e.lines.find((l) => l.kind === "fare" && l.leg_seq === leg.leg_seq);
          const night = e.lines.find((l) => l.code === "night" && l.leg_seq === leg.leg_seq);
          if (!fare || !night) continue;
          expect(night.amount_rappen).toBe(
            percentOf(fare.amount_rappen as number, percentToHundredths(bp.nightPct)),
          );
        }
        const ret = e.lines.find((l) => l.code === "return_trip");
        if (ret) {
          const fareSum = e.lines
            .filter((l) => l.kind === "fare")
            .reduce((s, l) => s + (l.amount_rappen as number), 0);
          expect(ret.amount_rappen).toBe(
            percentOf(fareSum, percentToHundredths(bp.returnPct)),
          );
        }
      }),
      cfg,
    );
  });

  it("total is never negative, with or without a coupon", () => {
    fc.assert(
      fc.property(bookParams, journeyArb, fc.option(couponArb, { nil: null }), (bp, j, coupon) => {
        const e = economyEntry(
          priceQuote(buildBook(bp), settings, mkInput(j), { coupon }),
        );
        expect(e.total_rappen as number).toBeGreaterThanOrEqual(0);
      }),
      cfg,
    );
  });

  it("a coupon never increases the total; discount is clamped to the pre-coupon total and total = pre - discount", () => {
    fc.assert(
      fc.property(bookParams, journeyArb, couponArb, (bp, j, coupon) => {
        const book = buildBook(bp);
        const without = economyEntry(priceQuote(book, settings, mkInput(j)));
        const withC = economyEntry(priceQuote(book, settings, mkInput(j), { coupon }));
        const pre = without.total_rappen as number;
        const after = withC.total_rappen as number;
        expect(after).toBeLessThanOrEqual(pre);
        expect(after).toBeGreaterThanOrEqual(0);
        // return_trip may itself be a discount-kind line, so pick the coupon by code.
        const disc = withC.lines.filter((l) => l.code === "coupon");
        expect(disc).toHaveLength(1);
        expect(disc[0]!.amount_rappen as number).toBeLessThanOrEqual(pre);
        expect(after).toBe(pre - (disc[0]!.amount_rappen as number));
        // The coupon is computed from the pre-coupon lines and changes none of them
        // (lines are re-sorted by numberLines, so compare by code + leg, not position).
        const key = (l: { code: string; leg_seq: number | null; amount_rappen: number | null }) =>
          `${l.code}|${String(l.leg_seq)}|${String(l.amount_rappen)}`;
        expect(withC.lines.filter((l) => l.code !== "coupon").map(key).sort()).toEqual(
          without.lines.map(key).sort(),
        );
      }),
      cfg,
    );
  });

  it("a larger percent coupon never yields a larger total (monotone)", () => {
    fc.assert(
      fc.property(
        bookParams,
        journeyArb,
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 100 }),
        (bp, j, p1, p2) => {
          const [lo, hi] = p1 <= p2 ? [p1, p2] : [p2, p1];
          const mk = (p: number): CouponFacts => ({
            id: 3,
            code: "SAVE",
            kind: "percent",
            percent: String(p),
            amount_rappen: null,
          });
          const book = buildBook(bp);
          const tLo = economyEntry(priceQuote(book, settings, mkInput(j), { coupon: mk(lo) }));
          const tHi = economyEntry(priceQuote(book, settings, mkInput(j), { coupon: mk(hi) }));
          expect(tHi.total_rappen as number).toBeLessThanOrEqual(tLo.total_rappen as number);
        },
      ),
      cfg,
    );
  });
});
