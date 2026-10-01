// apps/web/lib/ops/booking-trip-change.test.ts
//
// 26.2 P6: a change of places, date, time or party on a PAID trip, server side (owner decisions
// D1-D16). Fakes only (identity, the trip facts step, Stripe page, mail); P1's price step runs for
// real on a synthetic book. Synthetic integer rappen, never a product CHF.

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
const openDifferencePayment = vi.fn();
const supersede = vi.fn();
const sendClassChangePay = vi.fn();
const sendTripChangePay = vi.fn();
const sendChauffeurUnassign = vi.fn();
const sendChauffeurAssign = vi.fn();
const sendTimeChange = vi.fn();
const deliverBookingConfirmation = vi.fn();
const expireCheckoutSession = vi.fn();

vi.mock("@/lib/db/identity", () => ({
  asStaff: (...a: unknown[]) => asStaff(...a),
  asSystem: (...a: unknown[]) => asSystem(...a),
}));
vi.mock("./resolve-booking-id", () => ({
  resolveStaffBookingId: async (_e: unknown, _c: unknown, key: string) => (key === "VT-26-0801" ? BOOKING : null),
}));
vi.mock("./edit-request", () => ({
  DASHBOARD_ORIGIN: "https://dashboard.vamostaxi.site",
  openDifferencePayment: (...a: unknown[]) => openDifferencePayment(...a),
}));
vi.mock("@/lib/db/system-reads", () => ({ supersedePendingEditRequest: (...a: unknown[]) => supersede(...a) }));
vi.mock("@vamos/emails/confirmation", () => ({
  sendClassChangePay: (...a: unknown[]) => sendClassChangePay(...a),
  sendTripChangePay: (...a: unknown[]) => sendTripChangePay(...a),
  sendChauffeurUnassign: (...a: unknown[]) => sendChauffeurUnassign(...a),
  sendChauffeurAssign: (...a: unknown[]) => sendChauffeurAssign(...a),
  sendTimeChange: (...a: unknown[]) => sendTimeChange(...a),
  chauffeurEmailLocale: (langs: string[]) => (langs[0] === "fr" ? "fr" : "en"),
}));
vi.mock("@/lib/checkout/stripe", () => ({
  stripeFromEnv: () => ({}),
  expireCheckoutSession: (...a: unknown[]) => expireCheckoutSession(...a),
  retrieveCheckoutSession: vi.fn(),
}));
vi.mock("./voucher", () => ({ deliverBookingConfirmation: (...a: unknown[]) => deliverBookingConfirmation(...a) }));
vi.mock("@/lib/db/quote", () => ({ loadRateBook: vi.fn(), loadLaunchFlags: vi.fn() }));
vi.mock("./draft-preview", () => ({ loadSettingsRows: vi.fn() }));
vi.mock("./rate-book", () => ({ loadQuoteBookDocForVersion: vi.fn() }));

import { afterExtraSettled, type ChangeContext, type ChangeDeps } from "./booking-change";
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

function book(rv: number): RateBook {
  const cls = (slug: string, pax: number, sort: number, name: string) => ({
    id: `vc-${slug}`, slug, passenger_capacity: pax, luggage_capacity: pax, sort_order: sort, active: true, name,
  });
  const rate = (slug: string, base: number, perKm: number) => ({
    id: rv * 10 + base, rate_version_id: rv, vehicle_class_id: `vc-${slug}`, base_fare_rappen: base, per_km_rappen: perKm,
    min_fare_rappen: null, max_pax: 8, available: true, airport_start_rappen: null, city_price_rappen: null,
  });
  return {
    rate_version: { id: rv, slug: `rv-${rv}` },
    classes: [cls(ECO, 4, 1, "Economy"), cls(BIZ, 7, 2, "Business"), cls("van-luxury", 8, 3, "Van luxury")],
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

function deps(ctx: ChangeContext, over: Partial<ChangeDeps> = {}): ChangeDeps {
  return {
    now: () => NOW,
    loadContext: async () => ctx,
    loadLiveBook: async () => docOf(book(18)),
    loadBookByVersion: vi.fn(async () => docOf(book(18))),
    loadVatRateBps: async () => 81,
    loadSettings: async () => SETTINGS,
    resolvePlace: vi.fn(async () => null),
    tripFacts: vi.fn(async () => zugFacts()),
    verifyTripFacts: vi.fn(async () => zugFacts()),
    findDriverClash: vi.fn(async () => null),
    ...over,
  };
}

let calls: { text: string; values: unknown[] }[] = [];
/** asSystem as postgres.js begin() runs it: a query error the callback caught is rethrown. */
function systemReturns(rowsByText: (text: string) => unknown[] | Error) {
  asSystem.mockImplementation(async (_env: unknown, fn: (sql: unknown) => Promise<unknown>) => {
    let uncaught: unknown;
    const sql = Object.assign(
      (strings: TemplateStringsArray, ...values: unknown[]) => {
        const out = rowsByText(strings.join("?"));
        calls.push({ text: strings.join("?"), values });
        const q = out instanceof Error ? Promise.reject(out) : Promise.resolve(out);
        q.catch((e: unknown) => {
          if (uncaught === undefined) uncaught = e;
        });
        return q;
      },
      { json: (v: unknown) => ({ __json: v }) },
    );
    const result = await fn(sql);
    if (uncaught !== undefined) throw uncaught;
    return result;
  });
}

function tripRow(outcome: string, difference: number, total: number, paid: number, over: Record<string, unknown> = {}) {
  return [{
    request_id: "e0000000-0000-4000-8000-000000000001", booking_id: BOOKING, outcome, difference_rappen: difference,
    new_total_rappen: total, paid_rappen: paid, quote_snapshot_id: "91", extra_snapshot_id: outcome === "extra_required" ? "92" : null,
    old_extra_session_id: null, old_extra_snapshot_id: null, unassigned_chauffeur_id: null, kept_chauffeur_id: null, ...over,
  }];
}

const MAIL_FACTS = [{ email: "marco@example.test", languages_csv: "fr,de", reference: "VT-26-0801", pickup_text: "Zug station", dropoff_text: "Zurich Airport", scheduled_local: "2026-10-08T10:00" }];

function body(trip: Partial<TripChangeInput>, figures: { klass?: string | null; total: number | null; paid: number | null }): ChangeRequest {
  return { klass: figures.klass ?? null, expectTotalRappen: figures.total, expectPaidRappen: figures.paid, trip: { ...NO_CHANGE, ...trip } };
}

beforeEach(() => {
  vi.clearAllMocks();
  calls = [];
  deliverBookingConfirmation.mockResolvedValue({ ok: true, email: "anna@example.test" });
  sendTripChangePay.mockResolvedValue({ ok: true, providerMessageId: "m1" });
  sendClassChangePay.mockResolvedValue({ ok: true, providerMessageId: "m0" });
  sendChauffeurAssign.mockResolvedValue({ ok: true, providerMessageId: "m3" });
  sendChauffeurUnassign.mockResolvedValue({ ok: true, providerMessageId: "m4" });
  sendTimeChange.mockResolvedValue({ ok: true, providerMessageId: "m5" });
});

// ---------------------------------------------------------------------------------------------
describe("previewTripChange (read-only)", () => {
  it("a new pickup: every class priced on the NEW route with today's book, the signed facts, no write", async () => {
    const ctx = context();
    const d = deps(ctx);
    const res = await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, pickup: ZUG }, d);
    expect(res).toMatchObject({ ok: true, currentClass: ECO, paidRappen: ctx.paidRappen, lock: "v1.signed.facts", pickupIsAirport: false });
    if (!res.ok) return;
    const eco = res.classes.find((c) => c.slug === ECO)!;
    const want = charge({ ...BOOKED, distanceM: 42_517, durationS: 3_300 }, ECO).total;
    expect(eco).toMatchObject({ ok: true, current: true, newTotalRappen: want, differenceRappen: want - ctx.paidRappen });
    expect(eco.differenceRappen).toBeGreaterThan(0);
    expect(d.tripFacts).toHaveBeenCalledWith(env, expect.objectContaining({
      locale: "de",
      trip: expect.objectContaining({ pickup: ZUG }),
      target: expect.objectContaining({ scheduledLocal: "2026-10-08T08:00", pax: 3, bags: 2, placesChanged: true }),
      saved: expect.objectContaining({ dropoffPlaceId: "mb-zrh", dropoffLat: 47.4504 }),
    }));
    // The trip as booked is not priced again through Mapbox: the new facts are exact.
    expect(d.resolvePlace).not.toHaveBeenCalled();
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("a place refusal comes back under its field and nothing else is worked out (D2)", async () => {
    const d = deps(context(), { tripFacts: vi.fn(async () => ({ ok: false as const, code: "place-not-served" as const, field: "pickup" as const })) });
    expect(await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, pickup: ZUG }, d)).toEqual({ ok: false, code: "place-not-served", field: "pickup" });
  });

  it("date or time only: no new price, the customer keeps the price paid (D1); no Mapbox, no facts step", async () => {
    const ctx = context();
    const d = deps(ctx);
    const res = await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, scheduledLocal: "2026-10-08T10:00" }, d);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.classes.find((c) => c.current)).toMatchObject({ ok: true, newTotalRappen: ctx.paidRappen, differenceRappen: 0 });
    expect(res).not.toHaveProperty("lock");
    expect(d.tripFacts).not.toHaveBeenCalled();
    expect(d.resolvePlace).not.toHaveBeenCalled();
  });

  it("a time that has passed is refused under the time field", async () => {
    expect(await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, scheduledLocal: "2026-09-30T10:00" }, deps(context())))
      .toEqual({ ok: false, code: "past-time", field: "when" });
  });

  it("more passengers than the class takes: the class is too small, the classes that fit are priced (D4)", async () => {
    const ctx = context();
    const res = await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, pax: 6 }, deps(ctx));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.classes.find((c) => c.slug === ECO)).toMatchObject({ ok: false, code: "class-too-small", current: true });
    const biz = res.classes.find((c) => c.slug === BIZ)!;
    expect(biz).toMatchObject({ ok: true, newTotalRappen: charge(BOOKED, BIZ).total });
  });

  it("passengers inside the class: no new price (D5)", async () => {
    const ctx = context();
    const res = await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, pax: 4 }, deps(ctx));
    expect(res).toMatchObject({ ok: true });
    if (!res.ok) return;
    expect(res.classes.find((c) => c.current)).toMatchObject({ ok: true, newTotalRappen: ctx.paidRappen, differenceRappen: 0 });
  });

  it("an assigned driver: the new time is checked against his other trips (D7)", async () => {
    const findDriverClash = vi.fn(async () => ({ reference: "VT-26-0807", time: "10:30" }));
    const res = await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, scheduledLocal: "2026-10-08T10:00" }, deps(context(), { findDriverClash }));
    expect(res).toMatchObject({ ok: true, driverClash: { reference: "VT-26-0807", time: "10:30" } });
    // 10:00 Zurich (CEST) = 08:00 UTC; 40 min route + 30 min turnaround.
    expect(findDriverClash).toHaveBeenCalledWith(env, claims, {
      bookingId: BOOKING, chauffeurId: MARCO, startMs: Date.parse("2026-10-08T08:00:00Z"), endMs: Date.parse("2026-10-08T09:10:00Z"),
    });
  });

  it("a new place takes the driver for the NEW route's duration", async () => {
    const findDriverClash = vi.fn(async () => null);
    await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, pickup: ZUG }, deps(context(), { findDriverClash }));
    expect(findDriverClash).toHaveBeenCalledWith(env, claims, expect.objectContaining({
      startMs: Date.parse("2026-10-08T06:00:00Z"), endMs: Date.parse("2026-10-08T07:25:00Z"),
    }));
  });

  it("no driver, or only the party changed: no clash read", async () => {
    const findDriverClash = vi.fn(async () => null);
    await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, scheduledLocal: "2026-10-08T10:00" }, deps(context({ assignedChauffeurId: null }), { findDriverClash }));
    await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, pax: 4 }, deps(context(), { findDriverClash }));
    expect(findDriverClash).not.toHaveBeenCalled();
  });

  it("the plan rules first: unpaid, too late, a customer request waiting", async () => {
    const t = { ...NO_CHANGE, scheduledLocal: "2026-10-08T10:00" };
    expect(await previewTripChange(env, claims, "VT-26-0801", t, deps(context({ paid: false })))).toEqual({ ok: false, code: "unpaid" });
    expect(await previewTripChange(env, claims, "VT-26-0801", t, deps(context({ pickupAtMs: NOW - 1 })))).toEqual({ ok: false, code: "too-late" });
    expect(await previewTripChange(env, claims, "VT-26-0801", t, deps(context({ customerRequestWaiting: true })))).toEqual({ ok: false, code: "customer-request-waiting" });
  });
});

// ---------------------------------------------------------------------------------------------
describe("confirmTripChange", () => {
  it("dearer place change: the facts from the signed lock (never the browser), one write, the D14 e-mail", async () => {
    const ctx = context();
    const want = charge({ ...BOOKED, distanceM: 42_517, durationS: 3_300 }, ECO).total;
    systemReturns((text) => (text.includes("booking_staff_trip_change") ? tripRow("extra_required", want - ctx.paidRappen, want, ctx.paidRappen) : []));
    openDifferencePayment.mockResolvedValue({ ok: true, sessionId: "cs_test_t", url: "https://checkout.stripe.test/c/pay/cs_test_t" });
    const d = deps(ctx);
    // The browser's place text differs from the facts: the facts win.
    const res = await confirmTripChange(env, claims, "VT-26-0801",
      body({ pickup: { ...ZUG, text: "Somewhere cheaper" }, lock: "v1.signed.facts" }, { total: want, paid: ctx.paidRappen }), undefined, d);
    expect(res).toMatchObject({ ok: true, outcome: "extra_required", mailed: true, payUrl: "https://checkout.stripe.test/c/pay/cs_test_t", driverUpdated: false });
    expect(d.verifyTripFacts).toHaveBeenCalledWith(env, "v1.signed.facts", expect.objectContaining({ target: expect.objectContaining({ placesChanged: true }) }), AT);
    expect(d.tripFacts).not.toHaveBeenCalled();
    const write = calls.find((c) => c.text.includes("booking_staff_trip_change"))!;
    expect(write.values[0]).toBe(BOOKING);
    expect(write.values[2]).toBeNull();
    expect((write.values[3] as { __json: unknown }).__json).toEqual({
      pickup_text: "Zug station", pickup_place_id: "mb-zug", pickup_lat: 47.1737, pickup_lng: 8.5152, estimated_duration_minutes: 55,
    });
    expect(write.values[4]).toBe(18);
    expect(write.values[5]).toBe(want);
    expect((write.values[6] as { __json: unknown[] }).__json.length).toBeGreaterThan(1);
    expect(write.values.slice(8, 10)).toEqual([42.52, 55]);
    expect((write.values[10] as { __json: unknown[] }).__json).toEqual(expect.arrayContaining([expect.objectContaining({ slug: ECO })]));
    expect(write.values[11]).toBe(ctx.paidRappen);
    expect(write.values[12]).toBeNull();
    expect(sendTripChangePay).toHaveBeenCalledWith(
      { RESEND_API_KEY: "re_test" },
      { reference: "VT-26-0801", locale: "de", changes: { pickup: "Zug station" }, newTotalRappen: want, paidRappen: ctx.paidRappen, differenceRappen: want - ctx.paidRappen, payUrl: "https://checkout.stripe.test/c/pay/cs_test_t" },
      "anna@example.test",
    );
    expect(sendClassChangePay).not.toHaveBeenCalled();
    expect(deliverBookingConfirmation).not.toHaveBeenCalled();
  });

  it("cheaper place change: written now, Refund due, confirmation again, Marco stays and gets 'trip assigned' (D3, D16)", async () => {
    const ctx = context();
    const short = charge({ ...BOOKED, distanceM: 12_000, durationS: 1_200 }, ECO).total;
    systemReturns((text) => {
      if (text.includes("booking_staff_trip_change")) return tripRow("refund_due", short - ctx.paidRappen, short, ctx.paidRappen, { kept_chauffeur_id: MARCO });
      if (text.includes("booking_change_mail_facts")) return MAIL_FACTS;
      return [];
    });
    const d = deps(ctx, { verifyTripFacts: vi.fn(async () => zugFacts(12_000)) });
    const res = await confirmTripChange(env, claims, "VT-26-0801", body({ pickup: ZUG, lock: "v1.signed.facts" }, { total: short, paid: ctx.paidRappen }), undefined, d);
    expect(res).toMatchObject({ ok: true, outcome: "refund_due", confirmationSent: true, driverTakenOff: false, driverUpdated: true });
    expect(deliverBookingConfirmation).toHaveBeenCalledWith(env, BOOKING);
    expect(sendChauffeurAssign).toHaveBeenCalledWith(
      { RESEND_API_KEY: "re_test" },
      { reference: "VT-26-0801", locale: "fr", pickupText: "Zug station", dropoffText: "Zurich Airport", scheduledLocal: "2026-10-08T10:00" },
      "marco@example.test",
    );
    expect(sendTimeChange).not.toHaveBeenCalled();
    expect(openDifferencePayment).not.toHaveBeenCalled();
  });

  it("time only: no price is sent, no lock needed, applied; Marco gets the existing time-change e-mail (D1, D16)", async () => {
    const ctx = context();
    systemReturns((text) => {
      if (text.includes("booking_staff_trip_change")) return tripRow("applied", 0, ctx.paidRappen, ctx.paidRappen, { kept_chauffeur_id: MARCO });
      if (text.includes("booking_change_mail_facts")) return MAIL_FACTS;
      return [];
    });
    const d = deps(ctx);
    const res = await confirmTripChange(env, claims, "VT-26-0801", body({ scheduledLocal: "2026-10-08T10:00" }, { total: ctx.paidRappen, paid: ctx.paidRappen }), undefined, d);
    expect(res).toMatchObject({ ok: true, outcome: "applied", confirmationSent: true, driverUpdated: true });
    const write = calls.find((c) => c.text.includes("booking_staff_trip_change"))!;
    expect((write.values[3] as { __json: unknown }).__json).toEqual({ scheduled_local: "2026-10-08T10:00" });
    expect(write.values.slice(4, 7)).toEqual([null, null, null]);
    expect(write.values.slice(8, 11)).toEqual([null, null, null]);
    expect(d.verifyTripFacts).not.toHaveBeenCalled();
    expect(sendTimeChange).toHaveBeenCalledWith(
      { RESEND_API_KEY: "re_test" },
      expect.objectContaining({ reference: "VT-26-0801", locale: "fr", scheduledLocal: "2026-10-08T10:00", outcome: "confirmed" }),
      "marco@example.test",
    );
    expect(sendChauffeurAssign).not.toHaveBeenCalled();
  });

  it("party too big + a larger class: one price for the whole change, the class goes to the write", async () => {
    const ctx = context();
    const biz = charge(BOOKED, BIZ).total;
    systemReturns((text) => (text.includes("booking_staff_trip_change") ? tripRow("extra_required", biz - ctx.paidRappen, biz, ctx.paidRappen) : []));
    openDifferencePayment.mockResolvedValue({ ok: true, sessionId: "cs_test_g", url: "https://checkout.stripe.test/c/pay/cs_test_g" });
    const res = await confirmTripChange(env, claims, "VT-26-0801", body({ pax: 6 }, { klass: BIZ, total: biz, paid: ctx.paidRappen }), undefined, deps(ctx));
    expect(res).toMatchObject({ ok: true, outcome: "extra_required", className: "Business" });
    const write = calls.find((c) => c.text.includes("booking_staff_trip_change"))!;
    expect(write.values[2]).toBe(BIZ);
    expect((write.values[3] as { __json: unknown }).__json).toEqual({ pax: 6 });
    expect(write.values[5]).toBe(biz);
    // A trip change (not a class change alone): the D14 e-mail, with the new class sentence.
    expect(sendTripChangePay.mock.calls[0]![1]).toMatchObject({ changes: { className: "Business" } });
    expect(sendClassChangePay).not.toHaveBeenCalled();
  });

  it("a class change alone sent with an unchanged party is P1's class change (P1's e-mail)", async () => {
    const ctx = context();
    const biz = charge(BOOKED, BIZ).total;
    systemReturns((text) => (text.includes("booking_staff_change") ? [{ ...tripRow("extra_required", biz - ctx.paidRappen, biz, ctx.paidRappen)[0] }] : []));
    openDifferencePayment.mockResolvedValue({ ok: true, sessionId: "cs_test_c", url: "https://checkout.stripe.test/c/pay/cs_test_c" });
    const res = await confirmTripChange(env, claims, "VT-26-0801", body({ pax: 3 }, { klass: BIZ, total: biz, paid: ctx.paidRappen }), undefined, deps(ctx));
    expect(res).toMatchObject({ ok: true, outcome: "extra_required" });
    expect(calls.some((c) => c.text.includes("booking_staff_trip_change"))).toBe(false);
    expect(sendClassChangePay).toHaveBeenCalledTimes(1);
    expect(sendTripChangePay).not.toHaveBeenCalled();
  });

  it("figures or facts that moved since the preview are refused before any write", async () => {
    const ctx = context();
    const want = charge({ ...BOOKED, distanceM: 42_517, durationS: 3_300 }, ECO).total;
    const d = deps(ctx);
    expect(await confirmTripChange(env, claims, "VT-26-0801", body({ pickup: ZUG, lock: "v1.signed.facts" }, { total: want + 1, paid: ctx.paidRappen }), undefined, d)).toEqual({ ok: false, code: "price-changed" });
    expect(await confirmTripChange(env, claims, "VT-26-0801", body({ pickup: ZUG, lock: "v1.signed.facts" }, { total: want, paid: ctx.paidRappen - 1 }), undefined, d)).toEqual({ ok: false, code: "paid-changed" });
    expect(await confirmTripChange(env, claims, "VT-26-0801", body({ pickup: ZUG }, { total: want, paid: ctx.paidRappen }), undefined, d)).toEqual({ ok: false, code: "lock-invalid" });
    expect(await confirmTripChange(env, claims, "VT-26-0801", body({ pickup: ZUG, lock: "x" }, { total: want, paid: ctx.paidRappen }), undefined,
      deps(ctx, { verifyTripFacts: vi.fn(async () => ({ ok: false as const, code: "lock-invalid" as const })) }))).toEqual({ ok: false, code: "lock-invalid" });
    expect(await confirmTripChange(env, claims, "VT-26-0801", body({ scheduledLocal: "2026-10-08T10:00" }, { total: ctx.paidRappen + 1, paid: ctx.paidRappen }), undefined, d)).toEqual({ ok: false, code: "price-changed" });
    expect(await confirmTripChange(env, claims, "VT-26-0801", body({ scheduledLocal: "2026-10-08T08:00" }, { total: ctx.paidRappen, paid: ctx.paidRappen }), undefined, d)).toEqual({ ok: false, code: "no-change" });
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("a new airport pickup needs the flight number first (as on New trip)", async () => {
    const ctx = context();
    const d = deps(ctx, { verifyTripFacts: vi.fn(async () => zugFacts(42_517, { pickupIsAirport: true })) });
    const want = charge({ ...BOOKED, distanceM: 42_517, durationS: 3_300, originIsAirport: true }, ECO).total;
    expect(await confirmTripChange(env, claims, "VT-26-0801", body({ pickup: ZUG, lock: "v1.signed.facts" }, { total: want, paid: ctx.paidRappen }), undefined, d))
      .toEqual({ ok: false, code: "flight-needed" });
  });

  it("a refusal raised inside the write is mapped around asSystem: Keep on an overlap (D11 open), choice needed", async () => {
    const ctx = context();
    systemReturns(() => Object.assign(new Error("driver-overlap"), { code: "P0001" }));
    expect(await confirmTripChange(env, claims, "VT-26-0801", body({ scheduledLocal: "2026-10-08T10:00", driver: "keep" }, { total: ctx.paidRappen, paid: ctx.paidRappen }), undefined, deps(ctx)))
      .toEqual({ ok: false, code: "driver-overlap" });
    systemReturns(() => Object.assign(new Error("driver-choice-needed"), { code: "P0001" }));
    expect(await confirmTripChange(env, claims, "VT-26-0801", body({ scheduledLocal: "2026-10-08T10:00" }, { total: ctx.paidRappen, paid: ctx.paidRappen }), undefined, deps(ctx)))
      .toEqual({ ok: false, code: "driver-choice-needed" });
  });

  it("the owner took Marco off: he gets 'trip taken off', the driver choice goes to the write", async () => {
    const ctx = context();
    systemReturns((text) => {
      if (text.includes("booking_staff_trip_change")) return tripRow("applied", 0, ctx.paidRappen, ctx.paidRappen, { unassigned_chauffeur_id: MARCO });
      if (text.includes("booking_change_mail_facts")) return MAIL_FACTS;
      return [];
    });
    const res = await confirmTripChange(env, claims, "VT-26-0801", body({ scheduledLocal: "2026-10-08T10:00", driver: "unassign" }, { total: ctx.paidRappen, paid: ctx.paidRappen }), undefined, deps(ctx));
    expect(res).toMatchObject({ ok: true, driverTakenOff: true, driverUpdated: false });
    expect(calls.find((c) => c.text.includes("booking_staff_trip_change"))!.values[12]).toBe("unassign");
    expect(sendChauffeurUnassign).toHaveBeenCalledTimes(1);
    expect(sendTimeChange).not.toHaveBeenCalled();
  });

  it("a dearer change that waited is replaced by one applied now: its Stripe page is closed", async () => {
    const ctx = context();
    systemReturns((text) => (text.includes("booking_staff_trip_change") ? tripRow("applied", 0, ctx.paidRappen, ctx.paidRappen, { old_extra_session_id: "cs_old" }) : []));
    await confirmTripChange(env, claims, "VT-26-0801", body({ pax: 4 }, { total: ctx.paidRappen, paid: ctx.paidRappen }), undefined, deps(ctx));
    expect(expireCheckoutSession).toHaveBeenCalledWith({}, "cs_old");
  });

  it("no Stripe page: the request ends, nothing waits without a way to pay", async () => {
    const ctx = context();
    const want = charge({ ...BOOKED, distanceM: 42_517, durationS: 3_300 }, ECO).total;
    systemReturns((text) => (text.includes("booking_staff_trip_change") ? tripRow("extra_required", 3, want, ctx.paidRappen) : []));
    openDifferencePayment.mockResolvedValue({ ok: false, code: "stripe-failed" });
    expect(await confirmTripChange(env, claims, "VT-26-0801", body({ pickup: ZUG, lock: "v1.signed.facts" }, { total: want, paid: ctx.paidRappen }), undefined, deps(ctx)))
      .toEqual({ ok: false, code: "stripe-failed" });
    expect(supersede).toHaveBeenCalledWith(env, BOOKING);
    expect(sendTripChangePay).not.toHaveBeenCalled();
  });

  it("a live Stripe key is refused (pre-launch item, not lifted here)", async () => {
    const live = { ...env, STRIPE_SECRET_KEY: "sk_live_x" } as unknown as CloudflareEnv;
    expect(await confirmTripChange(live, claims, "VT-26-0801", body({ pax: 4 }, { total: 1, paid: 1 }), undefined, deps(context()))).toEqual({ ok: false, code: "stripe-test-only" });
  });
});

// ---------------------------------------------------------------------------------------------
describe("afterExtraSettled: the difference of a trip change was paid", () => {
  function facts(row: Record<string, unknown>) {
    systemReturns((text) => {
      if (text.includes("booking_change_request_facts")) return [{ booking_id: BOOKING, places_changed: false, time_changed: false, party_changed: false, class_changed: false, assigned_chauffeur_id: MARCO, ...row }];
      if (text.includes("booking_change_mail_facts")) return MAIL_FACTS;
      return [];
    });
  }

  it("new places: the kept driver gets 'trip assigned' again", async () => {
    facts({ places_changed: true });
    await afterExtraSettled(env, { booking_id: BOOKING, applied: true, unassigned_chauffeur_id: null, request_id: "e0000000-0000-4000-8000-000000000001" });
    expect(deliverBookingConfirmation).toHaveBeenCalledWith(env, BOOKING);
    expect(sendChauffeurAssign).toHaveBeenCalledTimes(1);
  });

  it("a class change took him off: no 'kept' e-mail, the 'taken off' one", async () => {
    facts({ places_changed: true, class_changed: true, assigned_chauffeur_id: null });
    await afterExtraSettled(env, { booking_id: BOOKING, applied: true, unassigned_chauffeur_id: MARCO, request_id: "e0000000-0000-4000-8000-000000000001" });
    expect(sendChauffeurAssign).not.toHaveBeenCalled();
    expect(sendChauffeurUnassign).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------------------------
describe("a price record that cannot be priced again (older shape, or an old in-place class edit)", () => {
  const oldShape = (ctx: ChangeContext): ChangeContext => ({
    ...ctx,
    snapshot: { ...ctx.snapshot!, lines: [{ kind: "fare", code: "legacy", amount_rappen: Number(ctx.snapshot!.totalRappen) }] },
  });

  it("a date or time change still works (no price needed, D1): the class as booked keeps the price paid", async () => {
    const ctx = oldShape(context());
    const res = await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, scheduledLocal: "2026-10-08T10:00" }, deps(ctx));
    expect(res).toMatchObject({ ok: true, currentClass: ECO, currentTotalRappen: ctx.paidRappen });
    if (!res.ok) return;
    expect(res.classes.find((c) => c.current)).toMatchObject({ ok: true, newTotalRappen: ctx.paidRappen, differenceRappen: 0 });
    expect(res.classes.filter((c) => !c.current).every((c) => c.code === "trip-data")).toBe(true);

    systemReturns((text) => (text.includes("booking_staff_trip_change") ? tripRow("applied", 0, ctx.paidRappen, ctx.paidRappen) : []));
    const done = await confirmTripChange(env, claims, "VT-26-0801", body({ scheduledLocal: "2026-10-08T10:00" }, { total: ctx.paidRappen, paid: ctx.paidRappen }), undefined, deps(ctx));
    expect(done).toMatchObject({ ok: true, outcome: "applied" });
  });

  it("a new place or a class needs a price: refused as trip-data (cancel and make a new trip)", async () => {
    const ctx = oldShape(context());
    expect(await previewTripChange(env, claims, "VT-26-0801", { ...NO_CHANGE, pickup: ZUG }, deps(ctx))).toEqual({ ok: false, code: "trip-data" });
    expect(await confirmTripChange(env, claims, "VT-26-0801", body({ pax: 6 }, { klass: BIZ, total: 1, paid: ctx.paidRappen }), undefined, deps(ctx)))
      .toEqual({ ok: false, code: "trip-data" });
  });
});
