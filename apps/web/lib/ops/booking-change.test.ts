// apps/web/lib/ops/booking-change.test.ts
//
// 26.2 P1: the dashboard's class change, server side. Fakes only (identity, Stripe page, mail);
// the price step runs for real on a synthetic book. Synthetic integer rappen, never a product CHF.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkoutCharge } from "../checkout/checkout-charge";
import { snapshotLinesFromCharge } from "../checkout/lock-to-rpc";
import { priceQuote } from "../pricing/priceQuote";
import type { SettingsVersionRow } from "../pricing/policy";
import type { RateBook } from "../pricing/types";
import type { VamosClaims } from "../db/identity";
import { quoteInputFromFacts, type TripFacts } from "./booking-change-price";

const asStaff = vi.fn();
const asSystem = vi.fn();
const openDifferencePayment = vi.fn();
const supersede = vi.fn();
const sendClassChangePay = vi.fn();
const sendChauffeurUnassign = vi.fn();
const deliverBookingConfirmation = vi.fn();
const expireCheckoutSession = vi.fn();
const retrieveCheckoutSession = vi.fn();

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
  sendChauffeurUnassign: (...a: unknown[]) => sendChauffeurUnassign(...a),
  chauffeurEmailLocale: (langs: string[]) => (langs[0] === "fr" ? "fr" : "en"),
}));
vi.mock("./voucher", () => ({ deliverBookingConfirmation: (...a: unknown[]) => deliverBookingConfirmation(...a) }));
vi.mock("@/lib/checkout/stripe", () => ({
  stripeFromEnv: () => ({}),
  expireCheckoutSession: (...a: unknown[]) => expireCheckoutSession(...a),
  retrieveCheckoutSession: (...a: unknown[]) => retrieveCheckoutSession(...a),
}));
vi.mock("@/lib/db/quote", () => ({ loadRateBook: vi.fn(), loadLaunchFlags: vi.fn() }));
vi.mock("./draft-preview", () => ({ loadSettingsRows: vi.fn() }));
vi.mock("./rate-book", () => ({ loadQuoteBookDocForVersion: vi.fn() }));

import {
  afterExtraSettled,
  closeWaitingStaffPage,
  confirmBookingChange,
  loadWaitingChange,
  previewBookingChange,
  type ChangeContext,
  type ChangeDeps,
} from "./booking-change";

const BOOKING = "b0000000-0000-4000-8000-000000000801";
const CHAUFFEUR = "c0000000-0000-4000-8000-000000000801";
const NOW = Date.parse("2026-10-01T08:00:00Z");
const AT = new Date(NOW).toISOString();
const env = { RESEND_API_KEY: "re_test", STRIPE_SECRET_KEY: "sk_test_x" } as unknown as CloudflareEnv;
const claims = { sub: "a0000000-0000-4000-8000-0000000000aa", role: "authenticated" } as VamosClaims;

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
    classes: [cls("saden", 4, 1, "Economy"), cls("mercedes-benz-v-class", 7, 2, "Business"), cls("van-luxury", 8, 3, "Van luxury")],
    distance_rates: [rate("saden", 1000, 300), rate("mercedes-benz-v-class", 1200, 420), rate("van-luxury", 1400, 510)],
    distance_bands: [], region_premiums: [], fixed_routes: [], surcharges: [], zones: [],
  };
}

const FACTS: TripFacts = {
  scheduledLocal: "2026-10-08T10:00", distanceM: 31_417, distanceToleranceM: 0, durationS: 2400,
  originZoneId: null, destZoneId: null, originPlace: "Zurich", destPlace: "Zug", originCanton: null, destCanton: null,
  originCityId: null, destCityId: null, originCityName: null, destCityName: null, originIsAirport: false,
  flightNo: null, pax: 2, bags: 1,
};

/** The booking's stored price record, as checkout wrote it at 31 417 m. */
function storedSnapshot(b: RateBook, slug: string) {
  const quote = priceQuote(b, SETTINGS, quoteInputFromFacts(FACTS, 31_417, AT));
  const net = quote.classes.find((c) => c.slug === slug)!.total_rappen!;
  const charge = checkoutCharge({ classNetRappen: net, preCouponRappen: null, extraCodes: [], catalog: [], coupon: null, vatRateBps: 81, vehicleClassSlug: slug });
  if (!charge.ok) throw new Error("fixture");
  return {
    total: charge.chargedRappen,
    snapshot: {
      totalRappen: charge.chargedRappen,
      lines: snapshotLinesFromCharge(charge.lines),
      rateVersionId: b.rate_version!.id,
      classSlug: slug,
      shownAlternatives: quote.classes.map((c) => ({ slug: c.slug, total_rappen: c.total_rappen })),
      distanceKm: 31.42,
      durationMin: 40,
    },
  };
}

function charged(b: RateBook, slug: string): number {
  return storedSnapshot(b, slug).total;
}

function context(over: Partial<ChangeContext> = {}, slug = "saden", b = book(18)): ChangeContext {
  const { snapshot, total } = storedSnapshot(b, slug);
  return {
    bookingId: BOOKING, reference: "VT-26-0801", locale: "de", contactEmail: "anna@example.test",
    status: "confirmed", refundStatus: "none", legClassSlug: slug, pickupAtMs: NOW + 48 * 3_600_000,
    paid: true, paidRappen: total, customerRequestWaiting: false,
    leg: {
      pickupText: "Zurich", dropoffText: "Zug", pickupPlaceId: "dXJuOm1ieHBvaTpaUkg", dropoffPlaceId: null,
      pickupLat: 47.37, pickupLng: 8.54, dropoffLat: 47.17, dropoffLng: 8.52, originZoneId: null, destZoneId: null,
      scheduledLocal: "2026-10-08T10:00", flightNo: null, pax: 2, bags: 1, estimatedMinutes: 40,
    },
    snapshot,
    ...over,
  };
}

function deps(ctx: ChangeContext, over: Partial<ChangeDeps> = {}): ChangeDeps {
  return {
    now: () => NOW,
    loadContext: async () => ctx,
    loadLiveBook: async () => liveDoc,
    loadBookByVersion: vi.fn(async () => liveDoc),
    loadVatRateBps: async () => 81,
    loadSettings: async () => SETTINGS,
    resolvePlace: vi.fn(async () => null),
    ...over,
  };
}

// mapRateBook reads a quote_rate_book document; a RateBook in that shape maps onto itself.
let liveDoc: unknown;

beforeEach(() => {
  vi.clearAllMocks();
  liveDoc = docOf(book(18));
  deliverBookingConfirmation.mockResolvedValue({ ok: true, email: "anna@example.test" });
  sendClassChangePay.mockResolvedValue({ ok: true, providerMessageId: "m1" });
  sendChauffeurUnassign.mockResolvedValue({ ok: true, providerMessageId: "m2" });
});

function docOf(b: RateBook) {
  return {
    rate_version: { ...b.rate_version, status: "live" },
    classes: b.classes,
    distance_rates: b.distance_rates,
    distance_bands: [], region_premiums: [], fixed_routes: [], surcharges: [], zones: [],
  };
}

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
let calls: { text: string; values: unknown[] }[] = [];
beforeEach(() => {
  calls = [];
});

describe("previewBookingChange (read-only)", () => {
  it("prices every live class against what was paid, from the stored trip, without Mapbox and without a write", async () => {
    const ctx = context();
    const d = deps(ctx);
    const res = await previewBookingChange(env, claims, "VT-26-0801", d);
    expect(res).toMatchObject({ ok: true, currentClass: "saden", paidRappen: ctx.paidRappen, rateVersionId: 18 });
    if (!res.ok) return;
    const biz = res.classes.find((c) => c.slug === "mercedes-benz-v-class")!;
    expect(biz).toMatchObject({ ok: true, name: "Business", newTotalRappen: charged(book(18), "mercedes-benz-v-class") });
    expect(biz.differenceRappen).toBe(biz.newTotalRappen! - ctx.paidRappen);
    expect(res.classes.map((c) => c.name)).toEqual(["Economy", "Business", "Van luxury"]);
    expect(res.classes.find((c) => c.slug === "saden")).toMatchObject({ current: true, differenceRappen: 0 });
    expect(d.resolvePlace).not.toHaveBeenCalled();
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("refuses by the plan rules before pricing: unpaid, too late, a customer request waiting", async () => {
    expect(await previewBookingChange(env, claims, "VT-26-0801", deps(context({ paid: false })))).toEqual({ ok: false, code: "unpaid" });
    expect(await previewBookingChange(env, claims, "VT-26-0801", deps(context({ pickupAtMs: NOW - 1 })))).toEqual({ ok: false, code: "too-late" });
    expect(await previewBookingChange(env, claims, "VT-26-0801", deps(context({ customerRequestWaiting: true })))).toEqual({
      ok: false,
      code: "customer-request-waiting",
    });
    expect(await previewBookingChange(env, claims, "nope", deps(context()))).toEqual({ ok: false, code: "not-found" });
  });

  it("refuses trip-data when the price record is not of the trip's class (an old in-place class edit)", async () => {
    expect(await previewBookingChange(env, claims, "VT-26-0801", deps(context({ legClassSlug: "mercedes-benz-v-class" })))).toEqual({
      ok: false,
      code: "trip-data",
    });
  });

  it("D3: a booking made with an older book is checked with that book and priced with today's, through the saved places", async () => {
    const old = book(17);
    const ctx = context({}, "saden", old);
    ctx.snapshot!.shownAlternatives = [];
    const loadOld = vi.fn(async () => docOf(old));
    const resolvePlace = vi.fn(async () => ({ canton: "ZH", cityId: "c-zh", cityName: "Zurich", isAirport: false }));
    const res = await previewBookingChange(env, claims, "VT-26-0801", deps(ctx, { loadBookByVersion: loadOld, resolvePlace }));
    expect(loadOld).toHaveBeenCalledWith(env, claims, 17);
    expect(resolvePlace).toHaveBeenCalledTimes(2);
    expect(res.ok).toBe(true);
  });
});

describe("confirmBookingChange", () => {
  const BIZ = "mercedes-benz-v-class";

  function staffChangeRow(outcome: string, difference: number, total: number, paid: number, unassigned: string | null = null) {
    return [{
      request_id: "e0000000-0000-4000-8000-000000000001", booking_id: BOOKING, outcome, difference_rappen: difference,
      new_total_rappen: total, paid_rappen: paid, quote_snapshot_id: "91", extra_snapshot_id: outcome === "extra_required" ? "92" : null,
      old_extra_session_id: null, old_extra_snapshot_id: null, unassigned_chauffeur_id: unassigned,
    }];
  }

  it("dearer: one write, the Stripe page for the difference, the owner's pay mail with the amounts in order", async () => {
    const ctx = context();
    const total = charged(book(18), BIZ);
    systemReturns((text) => (text.includes("booking_staff_change") ? staffChangeRow("extra_required", total - ctx.paidRappen, total, ctx.paidRappen) : []));
    openDifferencePayment.mockResolvedValue({ ok: true, sessionId: "cs_test_d", url: "https://checkout.stripe.test/c/pay/cs_test_d" });
    const res = await confirmBookingChange(env, claims, "VT-26-0801", { klass: BIZ, expectTotalRappen: total, expectPaidRappen: ctx.paidRappen }, "https://dashboard.vamostaxi.site", deps(ctx));
    expect(res).toMatchObject({ ok: true, outcome: "extra_required", className: "Business", mailed: true, payUrl: "https://checkout.stripe.test/c/pay/cs_test_d", confirmationSent: false });
    const write = calls.find((c) => c.text.includes("booking_staff_change"))!;
    expect(write.values.slice(0, 5)).toEqual([BOOKING, claims.sub, BIZ, 18, total]);
    expect((write.values[5] as { __json: unknown[] }).__json.length).toBeGreaterThan(1);
    expect(write.values[7]).toBe(ctx.paidRappen);
    expect(openDifferencePayment).toHaveBeenCalledWith(env, expect.objectContaining({ bookingId: BOOKING, differenceRappen: total - ctx.paidRappen }));
    expect(sendClassChangePay).toHaveBeenCalledWith(
      { RESEND_API_KEY: "re_test" },
      { reference: "VT-26-0801", locale: "de", className: "Business", newTotalRappen: total, paidRappen: ctx.paidRappen, differenceRappen: total - ctx.paidRappen, payUrl: "https://checkout.stripe.test/c/pay/cs_test_d" },
      "anna@example.test",
    );
    expect(deliverBookingConfirmation).not.toHaveBeenCalled();
  });

  it("261002 review round 2, warning 4: a dearer change that replaced a waiting one hands its page on as the REPLACED page, never as its own", async () => {
    const ctx = context();
    const total = charged(book(18), BIZ);
    const row = staffChangeRow("extra_required", total - ctx.paidRappen, total, ctx.paidRappen);
    row[0]!.old_extra_session_id = "cs_test_old" as unknown as null;
    row[0]!.old_extra_snapshot_id = "90" as unknown as null;
    systemReturns((text) => (text.includes("booking_staff_change") ? row : []));
    openDifferencePayment.mockResolvedValue({ ok: true, sessionId: "cs_test_new", url: "https://checkout.stripe.test/c/pay/cs_test_new" });
    const res = await confirmBookingChange(env, claims, "VT-26-0801", { klass: BIZ, expectTotalRappen: total, expectPaidRappen: ctx.paidRappen }, "https://dashboard.vamostaxi.site", deps(ctx));
    expect(res).toMatchObject({ ok: true, outcome: "extra_required", payUrl: "https://checkout.stripe.test/c/pay/cs_test_new" });
    expect(openDifferencePayment).toHaveBeenCalledTimes(1);
    const args = openDifferencePayment.mock.calls[0]![1] as Record<string, unknown>;
    expect(args).toMatchObject({ requestId: "e0000000-0000-4000-8000-000000000001", bookingId: BOOKING, supersededSessionId: "cs_test_old" });
    expect(args.ownSessionId ?? null).toBeNull();
    expect(args).not.toHaveProperty("oldSessionId");
  });

  it("cheaper: applied at once, Refund due, no Stripe page, confirmation again and the driver told (D6, D7)", async () => {
    const ctx = context({}, BIZ);
    const total = charged(book(18), "saden");
    systemReturns((text) => {
      if (text.includes("booking_staff_change")) return staffChangeRow("refund_due", total - ctx.paidRappen, total, ctx.paidRappen, CHAUFFEUR);
      if (text.includes("booking_change_mail_facts")) return [{ email: "driver@example.test", languages_csv: "fr,en", reference: "VT-26-0801", pickup_text: "Zurich", dropoff_text: "Zug", scheduled_local: "2026-10-08T10:00" }];
      return [];
    });
    const res = await confirmBookingChange(env, claims, "VT-26-0801", { klass: "saden", expectTotalRappen: total, expectPaidRappen: ctx.paidRappen }, undefined, deps(ctx));
    expect(res).toMatchObject({ ok: true, outcome: "refund_due", payUrl: null, confirmationSent: true, driverTakenOff: true });
    expect(openDifferencePayment).not.toHaveBeenCalled();
    expect(deliverBookingConfirmation).toHaveBeenCalledWith(env, BOOKING);
    expect(sendChauffeurUnassign).toHaveBeenCalledWith(
      { RESEND_API_KEY: "re_test" },
      { reference: "VT-26-0801", locale: "fr", pickupText: "Zurich", dropoffText: "Zug", scheduledLocal: "2026-10-08T10:00" },
      "driver@example.test",
    );
  });

  it("a price or a paid figure that moved since the preview is refused before any write", async () => {
    const ctx = context();
    const total = charged(book(18), BIZ);
    expect(await confirmBookingChange(env, claims, "VT-26-0801", { klass: BIZ, expectTotalRappen: total + 1, expectPaidRappen: ctx.paidRappen }, undefined, deps(ctx))).toEqual({ ok: false, code: "price-changed" });
    expect(await confirmBookingChange(env, claims, "VT-26-0801", { klass: BIZ, expectTotalRappen: total, expectPaidRappen: ctx.paidRappen - 1 }, undefined, deps(ctx))).toEqual({ ok: false, code: "paid-changed" });
    expect(await confirmBookingChange(env, claims, "VT-26-0801", { klass: "saden", expectTotalRappen: ctx.paidRappen, expectPaidRappen: ctx.paidRappen }, undefined, deps(ctx))).toEqual({ ok: false, code: "same-class" });
    expect(await confirmBookingChange(env, claims, "VT-26-0801", { klass: "first", expectTotalRappen: 1, expectPaidRappen: ctx.paidRappen }, undefined, deps(ctx))).toEqual({ ok: false, code: "unknown-class" });
    expect(asSystem).not.toHaveBeenCalled();
  });

  it("a refusal raised inside the write is mapped around asSystem (begin() rethrows)", async () => {
    const ctx = context();
    const total = charged(book(18), BIZ);
    systemReturns(() => Object.assign(new Error("customer-request-waiting"), { code: "P0001" }));
    expect(await confirmBookingChange(env, claims, "VT-26-0801", { klass: BIZ, expectTotalRappen: total, expectPaidRappen: ctx.paidRappen }, undefined, deps(ctx))).toEqual({
      ok: false,
      code: "customer-request-waiting",
    });
  });

  it("no Stripe page: the request ends, nothing waits without a way to pay", async () => {
    const ctx = context();
    const total = charged(book(18), BIZ);
    systemReturns((text) => (text.includes("booking_staff_change") ? staffChangeRow("extra_required", 3, total, ctx.paidRappen) : []));
    openDifferencePayment.mockResolvedValue({ ok: false, code: "stripe-failed" });
    expect(await confirmBookingChange(env, claims, "VT-26-0801", { klass: BIZ, expectTotalRappen: total, expectPaidRappen: ctx.paidRappen }, undefined, deps(ctx))).toEqual({ ok: false, code: "stripe-failed" });
    expect(supersede).toHaveBeenCalledWith(env, BOOKING);
    expect(sendClassChangePay).not.toHaveBeenCalled();
  });

  it("a live Stripe key is refused (pre-launch item of the security session, not lifted here)", async () => {
    const live = { ...env, STRIPE_SECRET_KEY: "sk_live_x" } as unknown as CloudflareEnv;
    expect(await confirmBookingChange(live, claims, "VT-26-0801", { klass: BIZ, expectTotalRappen: 1, expectPaidRappen: 1 }, undefined, deps(context()))).toEqual({ ok: false, code: "stripe-test-only" });
  });

  it("the body must name a class and both figures", async () => {
    expect(await confirmBookingChange(env, claims, "VT-26-0801", { klass: BIZ, expectTotalRappen: null, expectPaidRappen: 1 }, undefined, deps(context()))).toEqual({ ok: false, code: "invalid-body" });
  });
});

// 261002 settle safety (P6 follow-ups review R4, warning 3): the owner makes a new change while the customer
// has just paid the waiting one. The waiting staff change's page is checked first: paid -> the new change is
// refused (the payment applies the waiting one); not paid -> the page is closed, then the new change goes on.
// Without this the first payment became Refund due and a second link went out.
describe("a staff change never replaces a page just paid (confirmBookingChange)", () => {
  const BIZ = "mercedes-benz-v-class";
  const REQUEST = "e0000000-0000-4000-8000-000000000802";

  /** What the owner's confirm sends: the class and the two figures the preview showed. */
  function confirmBody(ctx: ChangeContext) {
    return { klass: BIZ, expectTotalRappen: charged(book(18), BIZ), expectPaidRappen: ctx.paidRappen };
  }

  /** The booking's waiting change request, as the staff read finds it (none, or one row). */
  function waitingIs(row: Record<string, unknown> | null) {
    asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(async () => (row ? [row] : [])));
  }
  const staffWaits = { request_id: REQUEST, actor: "staff", extra_session_id: "cs_test_wait", reference: "VT-26-0801" };

  function staffChangeRowFor(outcome: string, difference: number, total: number, paid: number) {
    return {
      request_id: "e0000000-0000-4000-8000-000000000001", booking_id: BOOKING, outcome, difference_rappen: difference,
      new_total_rappen: total, paid_rappen: paid, quote_snapshot_id: "91", extra_snapshot_id: "92",
      old_extra_session_id: null, old_extra_snapshot_id: null, unassigned_chauffeur_id: null,
    };
  }

  function writeAnswers(ctx: ChangeContext, over: Record<string, unknown> = {}) {
    const total = charged(book(18), BIZ);
    systemReturns((text) =>
      text.includes("booking_staff_change")
        ? [{ ...staffChangeRowFor("extra_required", total - ctx.paidRappen, total, ctx.paidRappen), ...over }]
        : [],
    );
  }

  beforeEach(() => {
    for (const m of [asStaff, asSystem, expireCheckoutSession, retrieveCheckoutSession, openDifferencePayment]) m.mockReset();
    sendClassChangePay.mockResolvedValue({ ok: true, providerMessageId: "m1" });
    openDifferencePayment.mockResolvedValue({ ok: true, sessionId: "cs_test_new", url: "https://checkout.stripe.test/c/pay/cs_test_new" });
    waitingIs(null);
  });

  it("she paid the waiting page in the same second: refused as already-paid, the write is never called", async () => {
    const ctx = context();
    waitingIs(staffWaits);
    writeAnswers(ctx);
    expireCheckoutSession.mockRejectedValue(new Error("This Checkout Session is not open"));
    retrieveCheckoutSession.mockResolvedValue({ id: "cs_test_wait", status: "complete" });
    expect(await confirmBookingChange(env, claims, "VT-26-0801", confirmBody(ctx), undefined, deps(ctx))).toEqual({ ok: false, code: "already-paid" });
    expect(expireCheckoutSession.mock.calls.map((c) => c[1])).toEqual(["cs_test_wait"]);
    expect(asSystem).not.toHaveBeenCalled();
    expect(calls.some((c) => c.text.includes("booking_staff_change"))).toBe(false);
    expect(openDifferencePayment).not.toHaveBeenCalled();
    expect(sendClassChangePay).not.toHaveBeenCalled();
  });

  it("the waiting page is open: closed once, THEN the write runs as before", async () => {
    const ctx = context();
    waitingIs(staffWaits);
    const order: string[] = [];
    expireCheckoutSession.mockImplementation(async (_s: unknown, id: string) => {
      order.push(`expire:${id}`);
      return { status: "expired" };
    });
    const total = charged(book(18), BIZ);
    systemReturns((text) => {
      if (text.includes("booking_staff_change")) {
        order.push("write");
        return [staffChangeRowFor("extra_required", total - ctx.paidRappen, total, ctx.paidRappen)];
      }
      return [];
    });
    const res = await confirmBookingChange(env, claims, "VT-26-0801", confirmBody(ctx), undefined, deps(ctx));
    expect(res).toMatchObject({ ok: true, outcome: "extra_required", payUrl: "https://checkout.stripe.test/c/pay/cs_test_new" });
    expect(order).toEqual(["expire:cs_test_wait", "write"]);
    expect(expireCheckoutSession).toHaveBeenCalledTimes(1);
    expect(retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it("the page had already expired (Stripe refuses, the re-read says expired): the new change goes on", async () => {
    const ctx = context();
    waitingIs(staffWaits);
    writeAnswers(ctx);
    expireCheckoutSession.mockRejectedValue(new Error("This Checkout Session is not open"));
    retrieveCheckoutSession.mockResolvedValue({ id: "cs_test_wait", status: "expired" });
    expect(await confirmBookingChange(env, claims, "VT-26-0801", confirmBody(ctx), undefined, deps(ctx))).toMatchObject({ ok: true, outcome: "extra_required" });
    expect(calls.some((c) => c.text.includes("booking_staff_change"))).toBe(true);
  });

  it("Stripe refuses the close and the re-read says the page is still open (or does not answer): stripe-failed, nothing is written", async () => {
    const ctx = context();
    waitingIs(staffWaits);
    writeAnswers(ctx);
    expireCheckoutSession.mockRejectedValue(new Error("timeout"));
    retrieveCheckoutSession.mockResolvedValue({ id: "cs_test_wait", status: "open" });
    expect(await confirmBookingChange(env, claims, "VT-26-0801", confirmBody(ctx), undefined, deps(ctx))).toEqual({ ok: false, code: "stripe-failed" });
    retrieveCheckoutSession.mockRejectedValue(new Error("timeout"));
    expect(await confirmBookingChange(env, claims, "VT-26-0801", confirmBody(ctx), undefined, deps(ctx))).toEqual({ ok: false, code: "stripe-failed" });
    expect(asSystem).not.toHaveBeenCalled();
    expect(openDifferencePayment).not.toHaveBeenCalled();
  });

  it("no waiting change: no Stripe call at all, the write runs as before", async () => {
    const ctx = context();
    waitingIs(null);
    writeAnswers(ctx);
    expect(await confirmBookingChange(env, claims, "VT-26-0801", confirmBody(ctx), undefined, deps(ctx))).toMatchObject({ ok: true, outcome: "extra_required" });
    expect(asStaff).toHaveBeenCalledTimes(1);
    expect(expireCheckoutSession).not.toHaveBeenCalled();
    expect(retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it("a waiting CUSTOMER request is not touched here (the database refuses with customer-request-waiting)", async () => {
    const ctx = context();
    waitingIs({ ...staffWaits, actor: "customer" });
    systemReturns(() => Object.assign(new Error("customer-request-waiting"), { code: "P0001" }));
    expect(await confirmBookingChange(env, claims, "VT-26-0801", confirmBody(ctx), undefined, deps(ctx))).toEqual({ ok: false, code: "customer-request-waiting" });
    expect(expireCheckoutSession).not.toHaveBeenCalled();
    expect(retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it("a waiting staff change that never got a page has nothing to close: no Stripe call", async () => {
    const ctx = context();
    for (const page of [null, ""]) {
      waitingIs({ ...staffWaits, extra_session_id: page });
      writeAnswers(ctx);
      expect(await confirmBookingChange(env, claims, "VT-26-0801", confirmBody(ctx), undefined, deps(ctx))).toMatchObject({ ok: true });
    }
    expect(expireCheckoutSession).not.toHaveBeenCalled();
    expect(retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it("the read of the waiting request failing: unknown, nothing is written", async () => {
    const ctx = context();
    asStaff.mockRejectedValue(new Error("connection terminated"));
    writeAnswers(ctx);
    expect(await confirmBookingChange(env, claims, "VT-26-0801", confirmBody(ctx), undefined, deps(ctx))).toEqual({ ok: false, code: "unknown" });
    expect(asSystem).not.toHaveBeenCalled();
    expect(expireCheckoutSession).not.toHaveBeenCalled();
  });

  it("the check sits AFTER every price check: a figure that moved is refused before the waiting request is even read", async () => {
    const ctx = context();
    waitingIs(staffWaits);
    const b = confirmBody(ctx);
    expect(await confirmBookingChange(env, claims, "VT-26-0801", { ...b, expectTotalRappen: b.expectTotalRappen + 1 }, undefined, deps(ctx))).toEqual({ ok: false, code: "price-changed" });
    expect(await confirmBookingChange(env, claims, "VT-26-0801", { ...b, expectPaidRappen: b.expectPaidRappen - 1 }, undefined, deps(ctx))).toEqual({ ok: false, code: "paid-changed" });
    expect(asStaff).not.toHaveBeenCalled();
    expect(expireCheckoutSession).not.toHaveBeenCalled();
  });

  it("the later close of the replaced page by the write stays (harmless: Stripe says it is not open)", async () => {
    const ctx = context();
    waitingIs(staffWaits);
    writeAnswers(ctx, { old_extra_session_id: "cs_test_wait" });
    expireCheckoutSession.mockResolvedValue({ status: "expired" });
    await confirmBookingChange(env, claims, "VT-26-0801", confirmBody(ctx), undefined, deps(ctx));
    expect(openDifferencePayment.mock.calls[0]![1]).toMatchObject({ supersededSessionId: "cs_test_wait" });
  });
});

describe("closeWaitingStaffPage and loadWaitingChange (the helpers Withdraw and both confirms share)", () => {
  beforeEach(() => {
    for (const m of [asStaff, expireCheckoutSession, retrieveCheckoutSession]) m.mockReset();
  });

  it("no page: closed, Stripe is not called", async () => {
    for (const page of [null, undefined, "", "  "]) {
      expect(await closeWaitingStaffPage(env, page)).toBe("closed");
    }
    expect(expireCheckoutSession).not.toHaveBeenCalled();
    expect(retrieveCheckoutSession).not.toHaveBeenCalled();
  });

  it("closed once on success; a refused close is re-read: complete = already-paid, expired = closed, anything else = stripe-failed", async () => {
    expireCheckoutSession.mockResolvedValueOnce({ status: "expired" });
    expect(await closeWaitingStaffPage(env, "cs_test_wait")).toBe("closed");
    expect(expireCheckoutSession).toHaveBeenCalledTimes(1);
    expect(retrieveCheckoutSession).not.toHaveBeenCalled();

    expireCheckoutSession.mockRejectedValue(new Error("not open"));
    for (const [status, want] of [["complete", "already-paid"], ["expired", "closed"], ["open", "stripe-failed"], ["", "stripe-failed"]] as const) {
      retrieveCheckoutSession.mockResolvedValueOnce({ status });
      expect(await closeWaitingStaffPage(env, "cs_test_wait")).toBe(want);
    }
    retrieveCheckoutSession.mockRejectedValueOnce(new Error("timeout"));
    expect(await closeWaitingStaffPage(env, "cs_test_wait")).toBe("stripe-failed");
  });

  it("loadWaitingChange reads the newest request still 'requested' of the booking, as staff; none is null; a read error is thrown", async () => {
    let seen: { text: string; values: unknown[] } | null = null;
    asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) =>
      fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        seen = { text: strings.join("?"), values };
        return [{ request_id: "r1", actor: "staff", extra_session_id: "cs_test_wait", reference: "VT-26-0801" }];
      }),
    );
    expect(await loadWaitingChange(env, claims, BOOKING)).toEqual({ request_id: "r1", actor: "staff", extra_session_id: "cs_test_wait", reference: "VT-26-0801" });
    expect(seen!.values).toEqual([BOOKING]);
    expect(seen!.text).toMatch(/r\.status = 'requested'/);
    expect(seen!.text).toMatch(/order by r\.created_at desc\s+limit 1/);
    asStaff.mockImplementation(async (_e: unknown, _c: unknown, fn: (sql: unknown) => unknown) => fn(async () => []));
    expect(await loadWaitingChange(env, claims, BOOKING)).toBeNull();
    asStaff.mockRejectedValue(new Error("boom"));
    await expect(loadWaitingChange(env, claims, BOOKING)).rejects.toThrow("boom");
  });
});

describe("afterExtraSettled (Stripe webhook, the difference was paid)", () => {
  it("applied: the confirmation goes again and the driver taken off is told", async () => {
    systemReturns((text) =>
      text.includes("booking_change_mail_facts")
        ? [{ email: "driver@example.test", languages_csv: "de", reference: "VT-26-0801", pickup_text: "A", dropoff_text: "B", scheduled_local: "2026-10-08T10:00" }]
        : [],
    );
    await afterExtraSettled(env, { booking_id: BOOKING, applied: true, unassigned_chauffeur_id: CHAUFFEUR });
    expect(deliverBookingConfirmation).toHaveBeenCalledWith(env, BOOKING);
    expect(sendChauffeurUnassign).toHaveBeenCalledTimes(1);
  });

  it("not applied (the request had ended): nothing is sent", async () => {
    await afterExtraSettled(env, { booking_id: BOOKING, applied: false, unassigned_chauffeur_id: null });
    expect(deliverBookingConfirmation).not.toHaveBeenCalled();
    expect(sendChauffeurUnassign).not.toHaveBeenCalled();
  });
});
