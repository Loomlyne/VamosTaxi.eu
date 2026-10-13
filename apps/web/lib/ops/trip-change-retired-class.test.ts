// apps/web/lib/ops/trip-change-retired-class.test.ts
//
// Phase 30 decision 8 (T-30-14d): a date, time or party change on a trip in a retired class is refused
// with the existing `class-not-sold` code, in the preview and on confirm, and writes nothing. The
// address refusal that already holds today is pinned. Fixtures and mocks follow
// booking-trip-change.test.ts (not imported from a test file). Synthetic integer rappen only.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkoutCharge } from "../checkout/checkout-charge";
import { snapshotLinesFromCharge } from "../checkout/lock-to-rpc";
import { priceQuote } from "../pricing/priceQuote";
import type { SettingsVersionRow } from "../pricing/policy";
import type { RateBook } from "../pricing/types";
import type { VamosClaims } from "../db/identity";
import type { ChangeRequest, TripChangeInput } from "./booking-change-map";
import { quoteInputFromFacts, type TripFacts } from "./booking-change-price";
import type { TripFactsOk } from "./trip-change-facts";

const asStaff = vi.fn();
const asSystem = vi.fn();

vi.mock("@/lib/db/identity", () => ({
  asStaff: (...a: unknown[]) => asStaff(...a),
  asSystem: (...a: unknown[]) => asSystem(...a),
}));
vi.mock("./resolve-booking-id", () => ({
  resolveStaffBookingId: async (_e: unknown, _c: unknown, key: string) => (key === "VT-26-0801" ? BOOKING : null),
}));
vi.mock("./edit-request", () => ({
  DASHBOARD_ORIGIN: "https://dashboard.vamostaxi.site",
  openDifferencePayment: vi.fn(),
}));
vi.mock("@/lib/db/system-reads", () => ({ supersedePendingEditRequest: vi.fn() }));
vi.mock("@vamos/emails/confirmation", () => ({
  sendClassChangePay: vi.fn(),
  sendTripChangePay: vi.fn(),
  sendChauffeurUnassign: vi.fn(),
  sendChauffeurAssign: vi.fn(),
  sendTimeChange: vi.fn(),
  chauffeurEmailLocale: () => "en",
}));
vi.mock("@/lib/checkout/stripe", () => ({
  stripeFromEnv: () => ({}),
  expireCheckoutSession: vi.fn(),
  retrieveCheckoutSession: vi.fn(),
}));
vi.mock("./voucher", () => ({ deliverBookingConfirmation: vi.fn() }));
vi.mock("@/lib/db/quote", () => ({ loadRateBook: vi.fn(), loadLaunchFlags: vi.fn() }));
vi.mock("./draft-preview", () => ({ loadSettingsRows: vi.fn() }));
vi.mock("./rate-book", () => ({ loadQuoteBookDocForVersion: vi.fn() }));

import type { ChangeContext, ChangeDeps } from "./booking-change";
import { confirmTripChange, previewTripChange } from "./booking-trip-change";

const BOOKING = "b0000000-0000-4000-8000-000000000801";
const MARCO = "c0000000-0000-4000-8000-000000000801";
const NOW = Date.parse("2026-10-01T08:00:00Z");
const AT = new Date(NOW).toISOString();
const env = { RESEND_API_KEY: "re_test", STRIPE_SECRET_KEY: "sk_test_x" } as unknown as CloudflareEnv;
const claims = { sub: "a0000000-0000-4000-8000-0000000000aa", role: "authenticated" } as VamosClaims;
const ECO = "saden";
const BIZ = "mercedes-benz-v-class";

const SETTINGS: SettingsVersionRow[] = [
  {
    id: 4, slug: "baseline", effective_from: "2026-01-01T00:00:00.000Z", free_cancel_hours: null,
    modification_deadline_hours: null, min_advance_minutes: null, airport_waiting_minutes: null,
    city_waiting_minutes: null, manage_link_validity_days: null, round_trip_discount_percent: null,
    night_window_start: null, night_window_end: null, night_window_tz: "Europe/Zurich", quote_lock_minutes: null,
    checkout_window_minutes: null, cancellation_tiers: [], policy_doc_slug: null, policy_doc_version: null,
  },
];

function book(rv: number, ecoActive = true): RateBook {
  const cls = (slug: string, pax: number, sort: number, name: string, active = true) => ({
    id: `vc-${slug}`, slug, passenger_capacity: pax, luggage_capacity: pax, sort_order: sort, active, name,
  });
  const rate = (slug: string, base: number, perKm: number) => ({
    id: rv * 10 + base, rate_version_id: rv, vehicle_class_id: `vc-${slug}`, base_fare_rappen: base, per_km_rappen: perKm,
    min_fare_rappen: null, max_pax: 8, available: true, airport_start_rappen: null, city_price_rappen: null,
  });
  return {
    rate_version: { id: rv, slug: `rv-${rv}` },
    classes: [cls(ECO, 4, 1, "Economy", ecoActive), cls(BIZ, 7, 2, "Business"), cls("van-luxury", 8, 3, "Van luxury")],
    distance_rates: [rate(ECO, 1000, 300), rate(BIZ, 1200, 420), rate("van-luxury", 1400, 510)],
    distance_bands: [], region_premiums: [], fixed_routes: [], surcharges: [], zones: [],
  };
}

function docOf(b: RateBook) {
  return { rate_version: { ...b.rate_version, status: "live" }, classes: b.classes, distance_rates: b.distance_rates,
    distance_bands: [], region_premiums: [], fixed_routes: [], surcharges: [], zones: [] };
}

const BOOKED: TripFacts = {
  scheduledLocal: "2026-10-08T08:00", distanceM: 31_417, distanceToleranceM: 0, durationS: 2400,
  originZoneId: null, destZoneId: null, originPlace: "Zurich Oerlikon", destPlace: "Zurich Airport", originCanton: null, destCanton: null,
  originCityId: null, destCityId: null, originCityName: null, destCityName: null, originIsAirport: false,
  flightNo: null, pax: 3, bags: 2,
};

/** What checkout charges for a class on a trip (fare net -> VAT). */
function charge(facts: TripFacts, slug: string): { total: number; lines: ReturnType<typeof snapshotLinesFromCharge>; shown: { slug: string; total_rappen: number | null }[] } {
  const quote = priceQuote(book(18), SETTINGS, quoteInputFromFacts(facts, facts.distanceM, AT));
  const net = quote.classes.find((c) => c.slug === slug)!.total_rappen!;
  const c = checkoutCharge({ classNetRappen: net, preCouponRappen: null, extraCodes: [], catalog: [], coupon: null, vatRateBps: 81, vehicleClassSlug: slug });
  if (!c.ok) throw new Error("fixture");
  return { total: c.chargedRappen, lines: snapshotLinesFromCharge(c.lines), shown: quote.classes.map((x) => ({ slug: x.slug, total_rappen: x.eligible ? x.total_rappen : null })) };
}

function context(over: Partial<ChangeContext> = {}): ChangeContext {
  const booked = charge(BOOKED, ECO);
  return {
    bookingId: BOOKING, reference: "VT-26-0801", locale: "de", contactEmail: "anna@example.test",
    status: "assigned", refundStatus: "none", legClassSlug: ECO, pickupAtMs: NOW + 168 * 3_600_000,
    paid: true, paidRappen: booked.total, customerRequestWaiting: false,
    assignedChauffeurId: MARCO, turnaroundMinutes: 30,
    leg: {
      pickupText: "Zurich Oerlikon", dropoffText: "Zurich Airport", pickupPlaceId: "mb-oerlikon", dropoffPlaceId: "mb-zrh",
      pickupLat: 47.4115, pickupLng: 8.5442, dropoffLat: 47.4504, dropoffLng: 8.5624, originZoneId: null, destZoneId: null,
      scheduledLocal: "2026-10-08T08:00", flightNo: null, pax: 3, bags: 2, estimatedMinutes: 40,
    },
    snapshot: {
      totalRappen: booked.total, lines: booked.lines, rateVersionId: 18, classSlug: ECO,
      shownAlternatives: booked.shown, distanceKm: 31.42, durationMin: 40,
    },
    ...over,
  };
}

const NO_CHANGE: TripChangeInput = { pickup: null, dropoff: null, scheduledLocal: null, pax: null, bags: null, lock: null, driver: null };
const ZUG = { kind: "retrieve" as const, mapbox_id: "mb-zug", session_token: "tok-1", text: "Zug station, Bahnhofplatz, 6300 Zug" };

/** The facts step's answer for a new pickup at Zug (a longer route). */
function zugFacts(metres = 42_517, over: Partial<TripFactsOk> = {}): TripFactsOk {
  return {
    ok: true,
    lock: "v1.signed.facts",
    facts: { ...BOOKED, distanceM: metres, durationS: 3_300, originPlace: "Zug station", originCanton: "ZG", originCityId: "city-zug" },
    leg: { pickup_text: "Zug station", pickup_place_id: "mb-zug", pickup_lat: 47.1737, pickup_lng: 8.5152, estimated_duration_minutes: 55 },
    distanceKm: Math.round(metres / 10) / 100,
    durationMin: 55,
    pickupIsAirport: false,
    ...over,
  };
}

function deps(ctx: ChangeContext, over: Partial<ChangeDeps> = {}, ecoActive = true): ChangeDeps {
  return {
    now: () => NOW,
    loadContext: async () => ctx,
    loadLiveBook: async () => docOf(book(18, ecoActive)),
    loadBookByVersion: vi.fn(async () => docOf(book(18, ecoActive))),
    loadVatRateBps: async () => 81,
    loadSettings: async () => SETTINGS,
    resolvePlace: vi.fn(async () => null),
    tripFacts: vi.fn(async () => zugFacts()),
    verifyTripFacts: vi.fn(async () => zugFacts()),
    findDriverClash: vi.fn(async () => null),
    ...over,
  };
}

function body(trip: Partial<TripChangeInput>, figures: { total: number | null; paid: number | null }): ChangeRequest {
  return { klass: null, expectTotalRappen: figures.total, expectPaidRappen: figures.paid, trip: { ...NO_CHANGE, ...trip } };
}

beforeEach(() => {
  vi.clearAllMocks();
  asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(async () => []));
});

const retired = (over: Partial<ChangeContext> = {}) => context({ legClassRetired: true, ...over });

describe("a trip in a retired class is not moved (decision 8)", () => {
  it("preview of a date-only change: the booked class row is refused with class-not-sold", async () => {
    const ctx = retired();
    const res = await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, scheduledLocal: "2026-10-08T10:00" }, deps(ctx));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.classes.find((c) => c.current)).toMatchObject({ ok: false, slug: ECO, code: "class-not-sold" });
  });

  it("confirm of the same change is refused and nothing is written", async () => {
    const ctx = retired();
    const res = await confirmTripChange(env, claims, "VT-26-0801", body({ scheduledLocal: "2026-10-08T10:00" }, { total: ctx.paidRappen, paid: ctx.paidRappen }), undefined, deps(ctx));
    expect(res).toEqual({ ok: false, code: "class-not-sold" });
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("a party-only change inside the class is refused the same way, no write", async () => {
    const ctx = retired();
    const res = await confirmTripChange(env, claims, "VT-26-0801", body({ pax: 2 }, { total: ctx.paidRappen, paid: ctx.paidRappen }), undefined, deps(ctx));
    expect(res).toEqual({ ok: false, code: "class-not-sold" });
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("the same date change with the class not retired still reaches booking_staff_trip_change", async () => {
    const ctx = context();
    const texts: string[] = [];
    asSystem.mockImplementation(async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) => {
      const sql = Object.assign(
        (strings: TemplateStringsArray) => {
          texts.push(strings.join("?"));
          return Promise.resolve([{
            request_id: "e0000000-0000-4000-8000-000000000001", booking_id: BOOKING, outcome: "applied", difference_rappen: 0,
            new_total_rappen: ctx.paidRappen, paid_rappen: ctx.paidRappen, quote_snapshot_id: "91", extra_snapshot_id: null,
            old_extra_session_id: null, old_extra_snapshot_id: null, unassigned_chauffeur_id: null, kept_chauffeur_id: null,
          }]);
        },
        { json: (v: unknown) => ({ __json: v }) },
      );
      return fn(sql);
    });
    const res = await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, scheduledLocal: "2026-10-08T10:00" }, deps(ctx));
    expect(res.ok && res.classes.find((c) => c.current)).toMatchObject({ ok: true });
    await confirmTripChange(env, claims, "VT-26-0801", body({ scheduledLocal: "2026-10-08T10:00" }, { total: ctx.paidRappen, paid: ctx.paidRappen }), undefined, deps(ctx));
    expect(texts.some((t) => t.includes("booking_staff_trip_change"))).toBe(true);
  });

  it("pins today's address refusal: a new pickup while the booked class is not in today's book is refused", async () => {
    const ctx = context();
    const res = await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, pickup: ZUG }, deps(ctx, {}, false));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.classes.find((c) => c.current)).toMatchObject({ ok: false, code: "class-not-sold" });
  });

  it("loadChangeContext reads the class's hidden_at into legClassRetired", () => {
    const src = readFileSync(fileURLToPath(new URL("./booking-change.ts", import.meta.url)), "utf8");
    expect(src).toContain("(lvc.hidden_at is not null) as leg_class_retired");
    expect(src).toMatch(/legClassRetired: row\.leg_class_retired === true/);
  });
});
