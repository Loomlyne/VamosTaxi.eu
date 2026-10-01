// apps/web/lib/ops/booking-change-price.ts
//
// 26.2 P1: the price step of a change on a PAID trip. Pure: no database, no Mapbox, no clock.
// Owner decisions (.planning/quick/260930-p1-class-change-reprice/DECISIONS.md):
//   D3  the new fare comes from the price book that is live TODAY;
//   D5  only the class is re-priced: the booking's extras stay at the amount paid, its coupon
//       applies as it did; VAT on top (today's site rate, as checkout charges it);
//   plan the difference is measured against everything paid so far minus refunds.
//
// It first reproduces what the booking was charged, with the booking's OWN price book (the rate
// version on its price record), from the trip facts saved on the booking. Only when that matches
// to the rappen is a new price offered; otherwise the answer is "trip-data" (refuse cleanly).
// The saved distance has 10 m precision (price_snapshots.distance_km numeric(7,2)) while the fare
// was computed on whole metres, so the check scans the metres the saved figure allows and keeps
// those that reproduce the charge (and every class total the customer was shown, when they were
// computed with the same book). A new price that is not the same for every kept metre count is
// refused rather than guessed.
//
// Trip facts are an input, not read from the booking here: P6 (place and time changes) passes new
// facts for the target with an exact distance and reuses this function unchanged.

import { checkoutCharge, type ChargeLine, type CheckoutChargeCoupon, type ExtraCatalogRow } from "../checkout/checkout-charge";
import { snapshotLinesFromCharge, type SnapshotLine } from "../checkout/lock-to-rpc";
import { priceQuote } from "../pricing/priceQuote";
import type { CouponFacts, SettingsVersionRow } from "../pricing/policy";
import { classDisplayName } from "../pricing/public-board";
import { roundHalfUp } from "../pricing/round";
import type { ClassBoardEntry, QuoteInput, RateBook } from "../pricing/types";

/** What the price kernel needs to know about one trip. */
export type TripFacts = {
  scheduledLocal: string;
  /** Best known distance in whole metres. */
  distanceM: number;
  /** Metres either side of distanceM the true distance may be (5 for the saved 10 m figure, 0 when exact). */
  distanceToleranceM: number;
  durationS: number;
  originZoneId: string | null;
  destZoneId: string | null;
  originPlace: string | null;
  destPlace: string | null;
  originCanton: string | null;
  destCanton: string | null;
  originCityId: string | null;
  destCityId: string | null;
  originCityName: string | null;
  destCityName: string | null;
  originIsAirport: boolean;
  flightNo: string | null;
  pax: number;
  bags: number;
};

/** What the booking's own price record says was sold, read from its lines. */
export type SavedCharge = {
  totalRappen: number;
  classSlug: string;
  rateVersionId: number;
  extras: ExtraCatalogRow[];
  coupon: CheckoutChargeCoupon | null;
  vatRateBps: number;
  /** The class totals the customer was shown, when stored ({slug, total_rappen}). */
  shownAlternatives: Array<{ slug: string; total_rappen: number | null }>;
};

export type PriceBook = { book: RateBook; settings: SettingsVersionRow[]; vatRateBps: number };

export type ChangeRefusal =
  | "trip-data"
  | "class-too-small"
  | "class-not-sold"
  | "pricing-not-live";

export type ClassPrice =
  | {
      ok: true;
      slug: string;
      name: string;
      current: boolean;
      newTotalRappen: number;
      differenceRappen: number;
      lines: SnapshotLine[];
    }
  | { ok: false; slug: string; name: string; current: boolean; code: ChangeRefusal };

export type BookingChangePrice =
  | {
      ok: true;
      paidRappen: number;
      currentTotalRappen: number;
      rateVersionId: number;
      classes: ClassPrice[];
    }
  | { ok: false; code: ChangeRefusal };

type Rec = Record<string, unknown>;

function rec(value: unknown): Rec | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Rec) : null;
}

function int(value: unknown): number | null {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) && Number.isInteger(n) ? n : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function labelsOf(params: Rec | null): ExtraCatalogRow["labels"] {
  const names = rec(params?.names);
  const name = str(params?.name) ?? "";
  const pick = (k: string) => str(names?.[k]) ?? name;
  return { en: pick("en"), de: pick("de"), fr: pick("fr"), ar: pick("ar") };
}

/**
 * The booking's price record as the charge it was: extras at the amount paid (before any coupon
 * took from them), the coupon rule, the VAT rate. Null when the record is not the one-charge shape
 * checkout writes (fare + extras + optional coupon + VAT): an older record cannot be reproduced.
 */
export function savedChargeFromSnapshot(snapshot: {
  total_rappen: unknown;
  lines: unknown;
  rate_version_id: unknown;
  class_slug: unknown;
  shown_alternatives?: unknown;
}): SavedCharge | null {
  const total = int(snapshot.total_rappen);
  const rateVersionId = int(snapshot.rate_version_id);
  const classSlug = str(snapshot.class_slug);
  if (total == null || rateVersionId == null || !classSlug) return null;
  if (!Array.isArray(snapshot.lines)) return null;
  let fares = 0;
  let vatRateBps: number | null = null;
  let coupon: CheckoutChargeCoupon | null = null;
  const extras: ExtraCatalogRow[] = [];
  for (const raw of snapshot.lines) {
    const line = rec(raw);
    if (!line) return null;
    const kind = str(line.kind);
    const params = rec(line.params);
    if (kind === "fare") {
      fares += 1;
    } else if (kind === "vat") {
      vatRateBps = int(params?.vatRateBps);
    } else if (kind === "surcharge") {
      const code = str(line.code);
      const listed = int(params?.list_rappen) ?? int(line.amount_rappen);
      if (!code || listed == null) return null;
      extras.push({ code, amountRappen: listed, labels: labelsOf(params) });
    } else if (kind === "coupon") {
      const code = str(line.code) ?? "coupon";
      const pct = int(params?.percentHundredths);
      const amount = int(params?.amountRappen);
      if (pct != null && pct > 0) coupon = { code, kind: "percent", percentHundredths: pct, amountRappen: null };
      else if (amount != null && amount > 0) coupon = { code, kind: "amount", percentHundredths: null, amountRappen: amount };
      else return null;
    } else {
      return null;
    }
  }
  if (fares !== 1 || vatRateBps == null) return null;
  const shown: SavedCharge["shownAlternatives"] = [];
  if (Array.isArray(snapshot.shown_alternatives)) {
    for (const raw of snapshot.shown_alternatives) {
      const row = rec(raw);
      const slug = str(row?.slug);
      if (!row || !slug) continue;
      shown.push({ slug, total_rappen: row.total_rappen == null ? null : int(row.total_rappen) });
    }
  }
  return { totalRappen: total, classSlug, rateVersionId, extras, coupon, vatRateBps, shownAlternatives: shown };
}

/** checkout's gross-up of a post-coupon class net (apps/web/lib/checkout/intent.ts grossUpBeforeCouponRappen). */
function grossUpBeforeCouponRappen(postCouponRappen: number, percentHundredths: number): number {
  if (percentHundredths <= 0 || percentHundredths >= 10_000) return postCouponRappen;
  return roundHalfUp(postCouponRappen * 10_000, 10_000 - percentHundredths);
}

function couponFacts(coupon: CheckoutChargeCoupon | null): CouponFacts | null {
  if (!coupon) return null;
  if (coupon.kind === "percent" && coupon.percentHundredths) {
    return { id: 0, code: coupon.code, kind: "percent", percent: (coupon.percentHundredths / 100).toFixed(2), amount_rappen: null };
  }
  if (coupon.kind === "amount" && coupon.amountRappen) {
    return { id: 0, code: coupon.code, kind: "amount", percent: null, amount_rappen: coupon.amountRappen };
  }
  return null;
}

/** The kernel input for one trip, as the checkout lock would carry it (pipeline.ts inputFromLock). */
export function quoteInputFromFacts(facts: TripFacts, distanceM: number, computedAt: string): QuoteInput {
  return {
    mode: "one_way",
    pax: facts.pax,
    bags: facts.bags,
    display_currency: "CHF",
    computed_at: computedAt,
    legs: [
      {
        leg_seq: 1,
        scheduled_local: facts.scheduledLocal,
        distance_m: distanceM,
        duration_s: facts.durationS,
        origin_zone_id: facts.originZoneId,
        dest_zone_id: facts.destZoneId,
        origin_canton: facts.originCanton,
        dest_canton: facts.destCanton,
        origin_place: facts.originPlace,
        dest_place: facts.destPlace,
        road: !(distanceM === 0 && facts.durationS === 0),
        flight_no: facts.flightNo,
        origin_is_airport: facts.originIsAirport,
        origin_city_id: facts.originCityId,
        dest_city_id: facts.destCityId,
        origin_city_name: facts.originCityName,
        dest_city_name: facts.destCityName,
      },
    ],
    extras: {},
    coupon: null,
  };
}

type Board = { classes: ClassBoardEntry[]; partial: Set<string> };

function board(book: PriceBook, facts: TripFacts, distanceM: number, saved: SavedCharge, computedAt: string): Board {
  const quote = priceQuote(book.book, book.settings, quoteInputFromFacts(facts, distanceM, computedAt), {
    coupon: couponFacts(saved.coupon),
  });
  return { classes: quote.classes, partial: new Set(quote.partially_priced_class_slugs) };
}

type Charged = { ok: true; chargedRappen: number; lines: ChargeLine[] } | { ok: false; code: ChangeRefusal };

/** The checkout charge for one class of a priced board (intent.ts order: lock net, gross-up, checkoutCharge). */
function chargeFor(b: Board, slug: string, saved: SavedCharge, vatRateBps: number): Charged {
  const entry = b.classes.find((row) => row.slug === slug);
  if (!entry) return { ok: false, code: "class-not-sold" };
  if (!entry.eligible) {
    return {
      ok: false,
      code: entry.ineligible_reason === "pax" || entry.ineligible_reason === "bags" ? "class-too-small" : "class-not-sold",
    };
  }
  if (entry.total_rappen == null || b.partial.has(slug)) return { ok: false, code: "class-not-sold" };
  const net = entry.total_rappen;
  let pre: number | null = null;
  if (saved.coupon?.kind === "percent" && saved.coupon.percentHundredths) {
    pre = grossUpBeforeCouponRappen(net, saved.coupon.percentHundredths);
  } else if (saved.coupon?.kind === "amount" && saved.coupon.amountRappen) {
    pre = net + saved.coupon.amountRappen;
  }
  const charge = checkoutCharge({
    classNetRappen: net,
    preCouponRappen: pre,
    extraCodes: saved.extras.map((row) => row.code),
    catalog: saved.extras,
    coupon: saved.coupon,
    vatRateBps,
    vehicleClassSlug: slug,
  });
  if (!charge.ok) return { ok: false, code: "trip-data" };
  return { ok: true, chargedRappen: charge.chargedRappen, lines: charge.lines };
}

function metreCandidates(facts: TripFacts): number[] {
  const centre = Math.round(facts.distanceM);
  const span = Math.max(0, Math.round(facts.distanceToleranceM));
  const out: number[] = [];
  for (let m = centre - span; m <= centre + span; m += 1) if (m >= 0) out.push(m);
  return out;
}

/**
 * The metre counts under which the booking's own book reproduces what it was charged (and every
 * class total it showed, when those were computed with that book). Empty = the saved trip facts
 * do not reproduce the price.
 */
export function reproduceCharge(
  bookingBook: PriceBook,
  facts: TripFacts,
  saved: SavedCharge,
  computedAt: string,
): number[] {
  if (bookingBook.book.rate_version?.id !== saved.rateVersionId) return [];
  const kept: number[] = [];
  for (const m of metreCandidates(facts)) {
    const b = board(bookingBook, facts, m, saved, computedAt);
    const current = chargeFor(b, saved.classSlug, saved, saved.vatRateBps);
    if (!current.ok || current.chargedRappen !== saved.totalRappen) continue;
    // Only figures both sides have are compared: a class the party no longer fits (passengers
    // changed since) says nothing about the distance.
    const shownAgree = saved.shownAlternatives.every((shown) => {
      const entry = b.classes.find((row) => row.slug === shown.slug);
      const net = entry && entry.eligible && !b.partial.has(entry.slug) ? entry.total_rappen : null;
      return net == null || shown.total_rappen == null || net === shown.total_rappen;
    });
    if (shownAgree) kept.push(m);
  }
  return kept;
}

/**
 * Price every class of today's live book for the trip, against what is paid so far (net of
 * refunds). `metres` = the distances that reproduced the current charge (same trip) or the exact
 * distance of new facts (P6).
 */
export function priceClasses(args: {
  today: PriceBook;
  facts: TripFacts;
  metres: number[];
  saved: SavedCharge;
  paidRappen: number;
  currentClassSlug: string;
  computedAt: string;
}): ClassPrice[] {
  const { today, facts, metres, saved, paidRappen, currentClassSlug, computedAt } = args;
  const boards = metres.map((m) => board(today, facts, m, saved, computedAt));
  const sorted = [...today.book.classes].sort((a, b) => a.sort_order - b.sort_order || (a.slug < b.slug ? -1 : 1));
  return sorted.map((cls): ClassPrice => {
    const name = classDisplayName(cls, cls.slug);
    const current = cls.slug === currentClassSlug;
    const charges = boards.map((b) => chargeFor(b, cls.slug, saved, today.vatRateBps));
    const first = charges[0];
    if (!first) return { ok: false, slug: cls.slug, name, current, code: "trip-data" };
    if (!first.ok) return { ok: false, slug: cls.slug, name, current, code: first.code };
    const totals = new Set(charges.map((c) => (c.ok ? c.chargedRappen : -1)));
    if (totals.size !== 1) return { ok: false, slug: cls.slug, name, current, code: "trip-data" };
    return {
      ok: true,
      slug: cls.slug,
      name,
      current,
      newTotalRappen: first.chargedRappen,
      differenceRappen: first.chargedRappen - paidRappen,
      lines: snapshotLinesFromCharge(first.lines),
    };
  });
}

/**
 * The whole price step for a class change on the same trip: reproduce the current charge with the
 * booking's own book, then price every class of today's book. paidRappen = captured minus refunds.
 */
export function priceBookingChange(args: {
  bookingBook: PriceBook;
  today: PriceBook;
  facts: TripFacts;
  saved: SavedCharge;
  paidRappen: number;
  computedAt: string;
}): BookingChangePrice {
  const { bookingBook, today, facts, saved, paidRappen, computedAt } = args;
  if (today.book.rate_version == null) return { ok: false, code: "pricing-not-live" };
  const metres = reproduceCharge(bookingBook, facts, saved, computedAt);
  if (metres.length === 0) return { ok: false, code: "trip-data" };
  return {
    ok: true,
    paidRappen,
    currentTotalRappen: saved.totalRappen,
    rateVersionId: today.book.rate_version.id,
    classes: priceClasses({ today, facts, metres, saved, paidRappen, currentClassSlug: saved.classSlug, computedAt }),
  };
}
