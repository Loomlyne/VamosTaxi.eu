// apps/web/lib/checkout/party-intent-van-luxury-12.test.ts
//
// Quick 261001: a party of 10 is priced by the real engine on the live class rows (Economy 3, Business 7,
// Van luxury 12), the lock is minted the way /api/quote mints it, and the payment step reads it with the
// route's own repriceFromLock. Economy and Business are refused at payment; Van luxury goes through.
// Rate amounts are 1-3 rappen stand-ins: what is under test is who fits, not a price.

import { describe, expect, it } from "vitest";
import { priceQuote } from "../pricing/priceQuote";
import type { SettingsVersionRow } from "../pricing/policy";
import type { DistanceRateRow, QuoteInput, RateBook, VehicleClassRow } from "../pricing/types";
import { checkIntentAgainstLock } from "../quote/intent";
import { mintLock, type QuoteLockPayload } from "../quote/lock";
import { repriceFromLock } from "./reprice";

const SECRET = "test-quote-lock-secret-van-luxury-12-not-real";
const NOW = "2026-10-02T08:00:00.000Z";

function classRow(slug: string, sort_order: number, passenger_capacity: number, luggage_capacity: number): VehicleClassRow {
  return { id: `vc-${slug}`, slug, passenger_capacity, luggage_capacity, sort_order, active: true };
}

function rateRow(id: number, vehicle_class_id: string, max_pax: number): DistanceRateRow {
  return { id, rate_version_id: 18, vehicle_class_id, base_fare_rappen: 1, per_km_rappen: 2, min_fare_rappen: 3, max_pax, available: true };
}

function liveBook(): RateBook {
  const saden = classRow("saden", 0, 3, 3);
  const business = classRow("mercedes-benz-v-class", 10, 7, 6);
  const van = classRow("van-luxury", 20, 12, 9);
  return {
    rate_version: { id: 18, slug: "live-test" },
    classes: [saden, business, van],
    distance_rates: [rateRow(1, saden.id, 3), rateRow(2, business.id, 7), rateRow(3, van.id, 12)],
    distance_bands: [],
    region_premiums: [],
    fixed_routes: [],
    surcharges: [],
    zones: [],
  };
}

const settings: SettingsVersionRow[] = [
  {
    id: 1, slug: "baseline", effective_from: "2026-01-01T00:00:00.000Z",
    free_cancel_hours: null, modification_deadline_hours: null, min_advance_minutes: null,
    airport_waiting_minutes: null, city_waiting_minutes: null, manage_link_validity_days: null,
    round_trip_discount_percent: null, night_window_start: null, night_window_end: null,
    night_window_tz: "Europe/Zurich", quote_lock_minutes: null, checkout_window_minutes: null,
    cancellation_tiers: [], policy_doc_slug: null, policy_doc_version: null,
  },
];

function journey(pax: number): QuoteInput {
  return {
    mode: "one_way", pax, bags: 2, display_currency: "CHF", computed_at: NOW,
    legs: [{ leg_seq: 1, scheduled_local: "2026-10-10T10:00", distance_m: 30_000, duration_s: 1800, origin_zone_id: null, dest_zone_id: null }],
    extras: {}, coupon: null,
  };
}

/** Prices the party with the real engine and mints the lock the quote route would hand the browser. */
async function lockFor(pax: number) {
  const priced = priceQuote(liveBook(), settings, journey(pax));
  const payload: QuoteLockPayload = {
    v: 1, quote_id: `q_vl12_${pax}`, exp: "2099-01-01T00:00:00.000Z", engine_version: "quote-engine@test",
    rate_version_id: 18, settings_version_id: 1, computed_at: NOW, display_currency: "CHF", mode: "one_way", pax, bags: 2,
    legs: [{
      leg_seq: 1, pickup: { lng: 8.5402, lat: 47.3782, text: "Zurich HB" }, dropoff: { lng: 8.515, lat: 47.1736, text: "Zug" },
      scheduled_local: "2026-10-10T10:00:00", distance_m: 30_000, duration_s: 1800, origin_zone_id: null, dest_zone_id: null,
      waypoints: [], flight_no: null, landing_source: null,
    }],
    extras: null, coupon: null,
    class_totals: priced.classes.map((c) => ({ slug: c.slug, total_rappen: c.total_rappen })),
  };
  return { payload, lock: await mintLock({ current: SECRET }, payload) };
}

function pay(payload: QuoteLockPayload, lock: string, vehicle_class: string) {
  return checkIntentAgainstLock(
    { quote_id: payload.quote_id, lock, vehicle_class: vehicle_class as never, idempotency_key: `idem-${vehicle_class}` },
    {
      secrets: { current: SECRET },
      workerNowIso: NOW,
      postgresNowIso: NOW,
      recompute: (p) => repriceFromLock(p, { pricingLive: true, liveRateVersionId: 18 }),
    },
  );
}

describe("a 10-traveller lock at the payment step (real engine, real repriceFromLock)", () => {
  it("the engine prices only Van luxury for 10", async () => {
    const { payload } = await lockFor(10);
    expect(payload.class_totals.map((c) => [c.slug, c.total_rappen != null])).toEqual([
      ["saden", false],
      ["mercedes-benz-v-class", false],
      ["van-luxury", true],
    ]);
  });

  it("refuses Economy", async () => {
    const { payload, lock } = await lockFor(10);
    expect((await pay(payload, lock, "saden")).ok).toBe(false);
  });

  it("refuses Business", async () => {
    const { payload, lock } = await lockFor(10);
    expect((await pay(payload, lock, "mercedes-benz-v-class")).ok).toBe(false);
  });

  it("lets Van luxury through", async () => {
    const { payload, lock } = await lockFor(10);
    const result = await pay(payload, lock, "van-luxury");
    expect(result.ok).toBe(true);
  });

  it("lets Economy through for 3 (the same check is not simply closed)", async () => {
    const { payload, lock } = await lockFor(3);
    expect((await pay(payload, lock, "saden")).ok).toBe(true);
  });
});
