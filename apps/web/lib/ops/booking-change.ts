// apps/web/lib/ops/booking-change.ts
//
// 26.2 P1: the admin changes the class of a PAID trip on the dashboard (plan signed 2026-09-30,
// owner decisions D0-D8, refunds by hand). Two doors, one price step:
//   previewBookingChange  read-only: paid so far, every class of today's live book with its new
//                         total and difference, or the reason it cannot be chosen;
//   confirmBookingChange  priced again on the server (the browser sends a class slug and the two
//                         figures it showed, nothing else), then booking_staff_change writes the
//                         new price record and the staff request through the change machine:
//                           same price  -> applied now, confirmation sent again (D7);
//                           cheaper     -> applied now, "Refund due" for the admin's click;
//                           dearer      -> booking unchanged, Stripe page for the difference open
//                                          24 h, the owner's "pay the difference" mail (D1, D2, D4).
//                         A driver taken off the trip by the change gets the "trip taken off" mail (D6).
// afterExtraSettled runs from the Stripe webhook once the difference is paid.
//
// Reads run as staff (the system role has no table SELECT); writes are SECURITY DEFINER functions
// under asSystem, with refusals mapped AROUND the wrapper (postgres.js begin() rethrows).

import {
  chauffeurEmailLocale,
  sendChauffeurAssign,
  sendChauffeurUnassign,
  sendClassChangePay,
  sendTimeChange,
  type EmailLocale,
} from "@vamos/emails/confirmation";
import { asStaff, asSystem, type VamosClaims } from "@/lib/db/identity";
import { expireCheckoutSession, retrieveCheckoutSession, stripeFromEnv } from "@/lib/checkout/stripe";
import { loadLaunchFlags, loadRateBook } from "@/lib/db/quote";
import { supersedePendingEditRequest } from "@/lib/db/system-reads";
import { countMapboxUnit } from "@/lib/abuse/breaker";
import { retrieve as mapboxRetrieve, reverse as mapboxReverse, type GeoLanguage } from "@/lib/geo/mapbox";
import { mapRateBook } from "@/lib/pricing/rateBook";
import type { RateBook } from "@/lib/pricing/types";
import type { SettingsVersionRow } from "@/lib/pricing/policy";
import { ENGINE_VERSION } from "@/lib/version";
import {
  changeRefusal,
  mapChangeSqlError,
  type ChangeBody,
  type ChangeFail,
  type ChangeFailCode,
} from "./booking-change-map";
import {
  priceBookingChange,
  priceClasses,
  reproduceCharge,
  savedChargeFromSnapshot,
  type BookingChangePrice,
  type ClassPrice,
  type SavedCharge,
  type TripFacts,
} from "./booking-change-price";
import { loadSettingsRows } from "./draft-preview";
import { DASHBOARD_ORIGIN, openDifferencePayment } from "./edit-request";
import { loadQuoteBookDocForVersion } from "./rate-book";
import { resolveStaffBookingId } from "./resolve-booking-id";
import type { TripFactsInput, TripFactsOk } from "./trip-change-facts";
import { deliverBookingConfirmation } from "./voucher";

export const dynamic = "force-dynamic";

/** What the price step and the rules need from one booking (read as staff). */
export type ChangeContext = {
  bookingId: string;
  reference: string;
  locale: string;
  contactEmail: string;
  status: string;
  refundStatus: string;
  legClassSlug: string;
  pickupAtMs: number | null;
  paid: boolean;
  paidRappen: number;
  customerRequestWaiting: boolean;
  /** 26.2 P6: the driver on the first leg, and the turnaround the overlap guard adds to his trips. */
  assignedChauffeurId?: string | null;
  turnaroundMinutes?: number | null;
  leg: {
    pickupText: string;
    dropoffText: string;
    pickupPlaceId: string | null;
    dropoffPlaceId: string | null;
    pickupLat: number | null;
    pickupLng: number | null;
    dropoffLat: number | null;
    dropoffLng: number | null;
    originZoneId: string | null;
    destZoneId: string | null;
    scheduledLocal: string;
    flightNo: string | null;
    pax: number;
    bags: number;
    estimatedMinutes: number | null;
  };
  snapshot: {
    totalRappen: unknown;
    lines: unknown;
    rateVersionId: unknown;
    classSlug: unknown;
    shownAlternatives: unknown;
    distanceKm: number | null;
    durationMin: number | null;
  } | null;
};

/** Mapbox facts of one saved place (the quote's own source for airport, city and canton). */
export type PlaceFacts = { canton: string | null; cityId: string | null; cityName: string | null; isAirport: boolean };

export type ChangeDeps = {
  now: () => number;
  loadContext: (env: CloudflareEnv, claims: VamosClaims, bookingId: string) => Promise<ChangeContext | null>;
  loadLiveBook: (env: CloudflareEnv) => Promise<unknown>;
  loadBookByVersion: (env: CloudflareEnv, claims: VamosClaims, versionId: number) => Promise<unknown>;
  loadVatRateBps: (env: CloudflareEnv) => Promise<number>;
  loadSettings: (env: CloudflareEnv, claims: VamosClaims, computedAt: string) => Promise<SettingsVersionRow[]>;
  resolvePlace: (
    env: CloudflareEnv,
    place: { placeId: string | null; lat: number | null; lng: number | null },
    language: GeoLanguage,
  ) => Promise<PlaceFacts | null>;
  /** 26.2 P6: the trip facts of a new place (preview; Mapbox through the quote pipeline, signed). */
  tripFacts?: (env: CloudflareEnv, input: TripFactsInput) => Promise<TripFactsOk | ChangeFail>;
  /** 26.2 P6: the same facts from the preview's signed lock (confirm; no Mapbox call). */
  verifyTripFacts?: (env: CloudflareEnv, token: string, input: TripFactsInput, nowIso: string) => Promise<TripFactsOk | ChangeFail>;
  /** 26.2 P6 (D7): another trip of the assigned driver that the trip as edited would overlap. */
  findDriverClash?: (env: CloudflareEnv, claims: VamosClaims, query: DriverClashQuery) => Promise<DriverClash | null>;
};

/** 26.2 P6: the time window the trip as edited takes the driver (the overlap guard's own window). */
export type DriverClashQuery = { bookingId: string; chauffeurId: string; startMs: number; endMs: number };
/** 26.2 P6: the other trip, as the Edit names it ("VT-26-0807, pickup at 10:30"). */
export type DriverClash = { reference: string; time: string };

export type ChangeClass = {
  slug: string;
  name: string;
  current: boolean;
  ok: boolean;
  newTotalRappen: number | null;
  differenceRappen: number | null;
  code: ChangeFailCode | null;
};

export type ChangePreview = {
  ok: true;
  bookingId: string;
  reference: string;
  currentClass: string;
  paidRappen: number;
  currentTotalRappen: number;
  rateVersionId: number;
  classes: ChangeClass[];
};

export type ChangeConfirmed = {
  ok: true;
  bookingId: string;
  reference: string;
  outcome: "applied" | "refund_due" | "extra_required";
  className: string;
  newTotalRappen: number;
  paidRappen: number;
  differenceRappen: number;
  /** extra_required: the Stripe page for the difference (also behind "Copy payment link"). */
  payUrl: string | null;
  /** extra_required: the "pay the difference" mail went out. */
  mailed: boolean;
  /** applied / refund_due: the confirmation went out again (D7). */
  confirmationSent: boolean;
  /** A driver was taken off the trip (D6); his "trip taken off" mail is best effort. */
  driverTakenOff: boolean;
  /** 26.2 P6 (D7, D16): the driver who stays was sent the new details (trip assigned / time change). */
  driverUpdated: boolean;
};

const n = (value: unknown): number => {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const numOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const x = Number(value);
  return Number.isFinite(x) ? x : null;
};
const s = (value: unknown): string => (value == null ? "" : String(value));
const sOrNull = (value: unknown): string | null => {
  const v = s(value).trim();
  return v ? v : null;
};

function geoLanguage(locale: string): GeoLanguage {
  return locale === "de" || locale === "fr" || locale === "ar" ? locale : "en";
}

function emailLocale(locale: string): EmailLocale {
  return locale === "de" || locale === "fr" || locale === "ar" ? locale : "en";
}

type ContextRow = Record<string, unknown>;

/** One read as staff: booking, first leg, bound price record, money in and out, waiting requests. */
async function defaultLoadContext(env: CloudflareEnv, claims: VamosClaims, bookingId: string): Promise<ChangeContext | null> {
  const row = await asStaff(env, claims, async (sql) => {
    const rows = await sql<ContextRow[]>`
      select b.id::text as booking_id,
             b.reference,
             b.locale,
             b.contact_email::text as contact_email,
             b.status::text as status,
             b.refund_status::text as refund_status,
             l.pickup_text, l.dropoff_text, l.pickup_place_id, l.dropoff_place_id,
             l.pickup_lat, l.pickup_lng, l.dropoff_lat, l.dropoff_lng,
             l.origin_zone_id::text as origin_zone_id, l.dest_zone_id::text as dest_zone_id,
             l.scheduled_local, l.flight_no, l.pax, l.bags, l.estimated_duration_minutes,
             l.assigned_chauffeur_id::text as assigned_chauffeur_id, l.turnaround_buffer_minutes,
             lvc.slug as leg_class_slug,
             (select min(x.scheduled_at) from public.booking_legs as x where x.booking_id = b.id) as pickup_at,
             s.id as snapshot_id, s.total_rappen, s.lines, s.rate_version_id, s.shown_alternatives,
             s.distance_km, s.duration_min, svc.slug as snapshot_class_slug,
             (select count(*) from public.booking_payments as p
               where p.booking_id = b.id and p.captured_at is not null) as captured_count,
             (select coalesce(sum(p.charged_rappen), 0) from public.booking_payments as p
               where p.booking_id = b.id and p.captured_at is not null) as captured_rappen,
             (select coalesce(sum(r.refund_rappen), 0) from public.booking_refunds as r
               where r.booking_id = b.id) as refunded_rappen,
             exists (select 1 from public.booking_edit_requests as e
                      where e.booking_id = b.id and e.status = 'requested' and e.actor = 'customer') as customer_waiting
        from public.bookings as b
        join lateral (
          select * from public.booking_legs as leg where leg.booking_id = b.id order by leg.leg_seq limit 1
        ) as l on true
        left join public.vehicle_classes as lvc on lvc.id = l.vehicle_class_id
        left join public.price_snapshots as s on s.id = b.price_snapshot_id
        left join public.vehicle_classes as svc on svc.id = s.vehicle_class_id
       where b.id = ${bookingId}::uuid
         and b.erased_at is null
       limit 1
    `;
    return rows[0] ?? null;
  });
  if (!row) return null;
  const pickupAt = row.pickup_at instanceof Date ? row.pickup_at.getTime() : Date.parse(s(row.pickup_at));
  return {
    bookingId: s(row.booking_id),
    reference: s(row.reference),
    locale: s(row.locale) || "en",
    contactEmail: s(row.contact_email).trim(),
    status: s(row.status),
    refundStatus: s(row.refund_status) || "none",
    legClassSlug: s(row.leg_class_slug),
    pickupAtMs: Number.isFinite(pickupAt) ? pickupAt : null,
    paid: n(row.captured_count) > 0,
    paidRappen: n(row.captured_rappen) - n(row.refunded_rappen),
    customerRequestWaiting: row.customer_waiting === true,
    assignedChauffeurId: sOrNull(row.assigned_chauffeur_id),
    turnaroundMinutes: numOrNull(row.turnaround_buffer_minutes),
    leg: {
      pickupText: s(row.pickup_text),
      dropoffText: s(row.dropoff_text),
      pickupPlaceId: sOrNull(row.pickup_place_id),
      dropoffPlaceId: sOrNull(row.dropoff_place_id),
      pickupLat: numOrNull(row.pickup_lat),
      pickupLng: numOrNull(row.pickup_lng),
      dropoffLat: numOrNull(row.dropoff_lat),
      dropoffLng: numOrNull(row.dropoff_lng),
      originZoneId: sOrNull(row.origin_zone_id),
      destZoneId: sOrNull(row.dest_zone_id),
      scheduledLocal: s(row.scheduled_local),
      flightNo: sOrNull(row.flight_no),
      pax: n(row.pax) || 1,
      bags: n(row.bags),
      estimatedMinutes: numOrNull(row.estimated_duration_minutes),
    },
    snapshot: row.snapshot_id == null
      ? null
      : {
          totalRappen: row.total_rappen,
          lines: row.lines,
          rateVersionId: row.rate_version_id,
          classSlug: row.snapshot_class_slug,
          shownAlternatives: row.shown_alternatives,
          distanceKm: numOrNull(row.distance_km),
          durationMin: numOrNull(row.duration_min),
        },
  };
}

async function defaultResolvePlace(
  env: CloudflareEnv,
  place: { placeId: string | null; lat: number | null; lng: number | null },
  language: GeoLanguage,
): Promise<PlaceFacts | null> {
  // The saved place first (the quote's own Mapbox id), then its saved coordinates.
  if (place.placeId) {
    try {
      await countMapboxUnit(env);
      const got = await mapboxRetrieve({ mapboxId: place.placeId, sessionToken: crypto.randomUUID(), language }, env);
      if (got.place) {
        return { canton: got.place.canton, cityId: got.place.cityId, cityName: got.place.cityName, isAirport: got.place.isAirport };
      }
    } catch {
      // fall through to the coordinates
    }
  }
  if (place.lat != null && place.lng != null) {
    try {
      await countMapboxUnit(env);
      const got = await mapboxReverse({ lng: place.lng, lat: place.lat, language }, env);
      if (got.place) {
        return { canton: got.place.canton, cityId: got.place.cityId, cityName: got.place.cityName, isAirport: got.place.isAirport };
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Another trip of the driver that the window would overlap: the same rule as the table's overlap
 * guard (booking_legs_chauffeur_no_overlap), read as staff. The earliest one is named.
 */
async function defaultFindDriverClash(env: CloudflareEnv, claims: VamosClaims, q: DriverClashQuery): Promise<DriverClash | null> {
  const start = new Date(q.startMs).toISOString();
  const end = new Date(q.endMs).toISOString();
  const row = await asStaff(env, claims, async (sql) => {
    const rows = await sql<{ reference: string; scheduled_local: string }[]>`
      select b.reference, o.scheduled_local
        from public.booking_legs as o
        join public.bookings as b on b.id = o.booking_id
       where o.booking_id <> ${q.bookingId}::uuid
         and o.assigned_chauffeur_id = ${q.chauffeurId}::uuid
         and o.status not in ('cancelled', 'no_show')
         and o.scheduled_range && tstzrange(${start}::timestamptz, ${end}::timestamptz, '[)')
       order by o.scheduled_at
       limit 1
    `;
    return rows[0] ?? null;
  });
  if (!row) return null;
  return { reference: s(row.reference), time: s(row.scheduled_local).slice(11, 16) };
}

export const defaultChangeDeps: ChangeDeps = {
  now: () => Date.now(),
  loadContext: defaultLoadContext,
  loadLiveBook: (env) => loadRateBook(env, { preferDraft: false }),
  loadBookByVersion: loadQuoteBookDocForVersion,
  loadVatRateBps: async (env) => (await loadLaunchFlags(env)).vat_rate_bps,
  loadSettings: async (env, claims, computedAt) => (await loadSettingsRows(env, claims, computedAt)).rows,
  resolvePlace: defaultResolvePlace,
  // Loaded on use: the quote pipeline (and its engine) only when a place changes.
  tripFacts: async (env, input) => (await import("./trip-change-facts")).runTripFacts(env, input),
  verifyTripFacts: async (env, token, input, nowIso) => (await import("./trip-change-facts")).verifyTripLock(env, token, input, nowIso),
  findDriverClash: defaultFindDriverClash,
};

/**
 * The trip as the kernel needs it, from what the booking stores. Places: the Mapbox facts of the
 * saved places, or none (text and zones only). Null when the record has no distance.
 */
export function tripFactsFromContext(
  ctx: ChangeContext,
  places: { origin: PlaceFacts | null; dest: PlaceFacts | null } | null,
): TripFacts | null {
  const km = ctx.snapshot?.distanceKm;
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  const minutes = ctx.snapshot?.durationMin ?? ctx.leg.estimatedMinutes ?? 0;
  return {
    scheduledLocal: ctx.leg.scheduledLocal.slice(0, 16),
    distanceM: Math.round(km * 1000),
    // price_snapshots.distance_km is numeric(7,2): the true metres are within 5 of it.
    distanceToleranceM: 5,
    durationS: Math.max(0, Math.round(minutes * 60)),
    originZoneId: ctx.leg.originZoneId,
    destZoneId: ctx.leg.destZoneId,
    originPlace: ctx.leg.pickupText || null,
    destPlace: ctx.leg.dropoffText || null,
    originCanton: places?.origin?.canton ?? null,
    destCanton: places?.dest?.canton ?? null,
    originCityId: places?.origin?.cityId ?? null,
    destCityId: places?.dest?.cityId ?? null,
    originCityName: places?.origin?.cityName ?? null,
    destCityName: places?.dest?.cityName ?? null,
    originIsAirport: places?.origin?.isAirport === true,
    flightNo: ctx.leg.flightNo,
    pax: ctx.leg.pax,
    bags: ctx.leg.bags,
  };
}

type Priced = { ok: true; ctx: ChangeContext; saved: SavedCharge; price: Extract<BookingChangePrice, { ok: true }> };

/** The booking a change starts from: rules checked, its price record read as the charge it was. */
export type LoadedChange = { ok: true; ctx: ChangeContext; saved: SavedCharge; nowMs: number; computedAt: string };

/** The booking with the plan rules checked (P6: a change with no new price needs no more). */
export type LoadedRules = { ok: true; ctx: ChangeContext; nowMs: number; computedAt: string };

/** The plan rules (paid, editable, before pickup, no refund in flight, no customer request waiting). */
export async function loadChangeRules(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
  deps: ChangeDeps,
): Promise<LoadedRules | ChangeFail> {
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };
  let ctx: ChangeContext | null;
  try {
    const bookingId = await resolveStaffBookingId(env, claims, key);
    if (!bookingId) return { ok: false, code: "not-found" };
    ctx = await deps.loadContext(env, claims, bookingId);
  } catch {
    return { ok: false, code: "unknown" };
  }
  if (!ctx) return { ok: false, code: "not-found" };

  const nowMs = deps.now();
  const refusal = changeRefusal(
    {
      paid: ctx.paid,
      status: ctx.status,
      refundStatus: ctx.refundStatus,
      pickupAtMs: ctx.pickupAtMs,
      customerRequestWaiting: ctx.customerRequestWaiting,
    },
    nowMs,
  );
  if (refusal) return { ok: false, code: refusal };
  return { ok: true, ctx, nowMs, computedAt: new Date(nowMs).toISOString() };
}

/**
 * The booking's price record as the charge it was, or null when it cannot be priced again: not the
 * one-charge shape checkout writes, or not of the class the trip has (an old in-place class edit).
 */
export function savedChargeOf(ctx: ChangeContext): SavedCharge | null {
  const saved = ctx.snapshot
    ? savedChargeFromSnapshot({
        total_rappen: ctx.snapshot.totalRappen,
        lines: ctx.snapshot.lines,
        rate_version_id: ctx.snapshot.rateVersionId,
        class_slug: ctx.snapshot.classSlug,
        shown_alternatives: ctx.snapshot.shownAlternatives,
      })
    : null;
  return saved && saved.classSlug === ctx.legClassSlug ? saved : null;
}

/** The plan rules, then the booking's own price record (P1; a P6 change with a new price starts from the same). */
export async function loadChangeContext(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
  deps: ChangeDeps,
): Promise<LoadedChange | ChangeFail> {
  const rules = await loadChangeRules(env, claims, bookingKey, deps);
  if (!rules.ok) return rules;
  const saved = savedChargeOf(rules.ctx);
  if (!saved) return { ok: false, code: "trip-data" };
  return { ...rules, saved };
}

/** Today's live book (D3), the booking's own book, today's VAT rate and the settings. */
export type ChangeBooks = { today: RateBook; bookingBook: RateBook; vatRateBps: number; settings: SettingsVersionRow[] };

export async function loadChangeBooks(
  env: CloudflareEnv,
  claims: VamosClaims,
  loaded: { saved: SavedCharge | null; computedAt: string },
  deps: ChangeDeps,
): Promise<{ ok: true; books: ChangeBooks } | ChangeFail> {
  const { saved, computedAt } = loaded;
  try {
    const today = mapRateBook(await deps.loadLiveBook(env));
    if (!today.rate_version) return { ok: false, code: "pricing-not-live" };
    // P6: a change with no new price on a record that cannot be priced again needs today's book only.
    const bookingBook =
      !saved || saved.rateVersionId === today.rate_version.id
        ? today
        : mapRateBook(await deps.loadBookByVersion(env, claims, saved.rateVersionId));
    const vatRateBps = await deps.loadVatRateBps(env);
    const settings = await deps.loadSettings(env, claims, computedAt);
    return { ok: true, books: { today, bookingBook, vatRateBps, settings } };
  } catch {
    return { ok: false, code: "unknown" };
  }
}

/** P6: the trip as edited on the route as booked (date, time, party); places do not change here. */
export type PartyTarget = { scheduledLocal: string; pax: number; bags: number };

/**
 * The price step on the route as booked (P1): the stored trip when the shown class totals pin it,
 * else the saved places through Mapbox, checked against what was charged; then every class of
 * today's book. With a target (P6) the check uses the trip as booked and the new prices the trip as
 * edited (a party that changes which classes fit).
 */
export async function priceOnBookedRoute(
  env: CloudflareEnv,
  loaded: LoadedChange,
  books: ChangeBooks,
  deps: ChangeDeps,
  target?: PartyTarget,
): Promise<Extract<BookingChangePrice, { ok: true }> | ChangeFail> {
  const { ctx, saved, computedAt } = loaded;
  const { today, bookingBook, vatRateBps, settings } = books;
  const todayId = today.rate_version?.id;
  if (todayId == null) return { ok: false, code: "pricing-not-live" };
  const attempt = (facts: TripFacts | null): BookingChangePrice => {
    if (!facts) return { ok: false, code: "trip-data" };
    const bookingPriced = { book: bookingBook, settings, vatRateBps: saved.vatRateBps };
    const todayPriced = { book: today, settings, vatRateBps };
    if (!target) {
      return priceBookingChange({ bookingBook: bookingPriced, today: todayPriced, facts, saved, paidRappen: ctx.paidRappen, computedAt });
    }
    const metres = reproduceCharge(bookingPriced, facts, saved, computedAt);
    if (metres.length === 0) return { ok: false, code: "trip-data" };
    return {
      ok: true,
      paidRappen: ctx.paidRappen,
      currentTotalRappen: saved.totalRappen,
      rateVersionId: todayId,
      classes: priceClasses({
        today: todayPriced,
        facts: { ...facts, scheduledLocal: target.scheduledLocal, pax: target.pax, bags: target.bags },
        metres,
        saved,
        paidRappen: ctx.paidRappen,
        currentClassSlug: saved.classSlug,
        computedAt,
      }),
    };
  };

  // Same book and the customer's shown class totals on record: the stored trip is checked against
  // every class total, no Mapbox call needed.
  if (saved.rateVersionId === todayId && saved.shownAlternatives.length > 0) {
    const stored = attempt(tripFactsFromContext(ctx, null));
    if (stored.ok) return stored;
  }
  // Otherwise the saved places through Mapbox (airport, city, canton), checked against the charge.
  const language = geoLanguage(ctx.locale);
  const [origin, dest] = await Promise.all([
    deps.resolvePlace(env, { placeId: ctx.leg.pickupPlaceId, lat: ctx.leg.pickupLat, lng: ctx.leg.pickupLng }, language),
    deps.resolvePlace(env, { placeId: ctx.leg.dropoffPlaceId, lat: ctx.leg.dropoffLat, lng: ctx.leg.dropoffLng }, language),
  ]);
  if (origin || dest) {
    const resolved = attempt(tripFactsFromContext(ctx, { origin, dest }));
    if (resolved.ok) return resolved;
  }
  return { ok: false, code: "trip-data" };
}

/** Rules, then the price step (stored facts when the shown totals pin them, else the Mapbox facts). */
async function priceForBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
  deps: ChangeDeps,
): Promise<Priced | ChangeFail> {
  const loaded = await loadChangeContext(env, claims, bookingKey, deps);
  if (!loaded.ok) return loaded;
  const loadedBooks = await loadChangeBooks(env, claims, loaded, deps);
  if (!loadedBooks.ok) return loadedBooks;
  const price = await priceOnBookedRoute(env, loaded, loadedBooks.books, deps);
  if (!price.ok) return price;
  return { ok: true, ctx: loaded.ctx, saved: loaded.saved, price };
}

export function classOut(row: ClassPrice): ChangeClass {
  return row.ok
    ? { slug: row.slug, name: row.name, current: row.current, ok: true, newTotalRappen: row.newTotalRappen, differenceRappen: row.differenceRappen, code: null }
    : { slug: row.slug, name: row.name, current: row.current, ok: false, newTotalRappen: null, differenceRappen: null, code: row.code };
}

/** POST …/change/preview: what each class would cost now. Read-only. */
export async function previewBookingChange(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
  deps: ChangeDeps = defaultChangeDeps,
): Promise<ChangePreview | ChangeFail> {
  const priced = await priceForBooking(env, claims, bookingKey, deps);
  if (!priced.ok) return priced;
  return {
    ok: true,
    bookingId: priced.ctx.bookingId,
    reference: priced.ctx.reference,
    currentClass: priced.saved.classSlug,
    paidRappen: priced.price.paidRappen,
    currentTotalRappen: priced.price.currentTotalRappen,
    rateVersionId: priced.price.rateVersionId,
    classes: priced.price.classes.map(classOut),
  };
}

type StaffChangeRow = {
  request_id: string;
  booking_id: string;
  outcome: string;
  difference_rappen: number;
  new_total_rappen: number;
  paid_rappen: number;
  extra_snapshot_id: number | string | null;
  old_extra_session_id: string | null;
  old_extra_snapshot_id: number | string | null;
  unassigned_chauffeur_id: string | null;
};

/** POST …/change: the admin confirms the class he was shown. */
export async function confirmBookingChange(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
  body: ChangeBody,
  dashboardOrigin: string = DASHBOARD_ORIGIN,
  deps: ChangeDeps = defaultChangeDeps,
): Promise<ChangeConfirmed | ChangeFail> {
  if (!body.klass || body.expectTotalRappen == null || body.expectPaidRappen == null) {
    return { ok: false, code: "invalid-body" };
  }
  // Plan: the change machine refuses a live key until the security session's pre-launch proof.
  if ((env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_")) return { ok: false, code: "stripe-test-only" };

  const priced = await priceForBooking(env, claims, bookingKey, deps);
  if (!priced.ok) return priced;
  const { ctx, price } = priced;
  const target = price.classes.find((row) => row.slug === body.klass);
  if (!target) return { ok: false, code: "unknown-class" };
  if (target.current) return { ok: false, code: "same-class" };
  if (!target.ok) return { ok: false, code: target.code };
  // The admin confirms what he saw; anything that moved since is shown again, never charged.
  if (target.newTotalRappen !== body.expectTotalRappen) return { ok: false, code: "price-changed" };
  if (price.paidRappen !== body.expectPaidRappen) return { ok: false, code: "paid-changed" };

  let row: StaffChangeRow;
  try {
    row = await asSystem<StaffChangeRow>(env, async (sql) => {
      const rows = await sql<StaffChangeRow[]>`
        select * from public.booking_staff_change(
          ${ctx.bookingId}::uuid,
          ${claims.sub}::uuid,
          ${target.slug}::text,
          ${price.rateVersionId}::bigint,
          ${target.newTotalRappen}::int4,
          ${sql.json(target.lines as unknown as Parameters<typeof sql.json>[0])},
          ${ENGINE_VERSION}::text,
          ${price.paidRappen}::int4
        )
      `;
      const first = rows[0];
      if (!first) throw Object.assign(new Error("not-found"), { code: "P0002" });
      return first;
    });
  } catch (err) {
    return mapChangeSqlError(err);
  }

  const outcome = String(row.outcome);
  const base = {
    ok: true as const,
    bookingId: ctx.bookingId,
    reference: ctx.reference,
    className: target.name,
    newTotalRappen: n(row.new_total_rappen),
    paidRappen: n(row.paid_rappen),
    differenceRappen: n(row.difference_rappen),
  };

  if (outcome === "extra_required") {
    const opened = await openDifferencePayment(env, {
      requestId: String(row.request_id),
      bookingId: ctx.bookingId,
      differenceRappen: n(row.difference_rappen),
      oldSessionId: row.old_extra_session_id ? String(row.old_extra_session_id) : null,
      oldExtraSnapshotId: row.old_extra_snapshot_id == null ? null : n(row.old_extra_snapshot_id),
      dashboardOrigin,
    });
    if (!opened.ok) {
      // No waiting state without a way to pay: the request ends, the booking stays as it is.
      try {
        await supersedePendingEditRequest(env, ctx.bookingId);
      } catch {
        // The request ends by itself after 24 hours.
      }
      return { ok: false, code: opened.code === "stripe-failed" ? "stripe-failed" : "unknown" };
    }
    let mailed = false;
    if (opened.url && ctx.contactEmail) {
      try {
        const sent = await sendClassChangePay(
          { RESEND_API_KEY: env.RESEND_API_KEY ?? "" },
          {
            reference: ctx.reference,
            locale: emailLocale(ctx.locale),
            className: target.name,
            newTotalRappen: base.newTotalRappen,
            paidRappen: base.paidRappen,
            differenceRappen: base.differenceRappen,
            payUrl: opened.url,
          },
          ctx.contactEmail,
        );
        mailed = sent.ok;
      } catch {
        mailed = false;
      }
    }
    return { ...base, outcome: "extra_required", payUrl: opened.url, mailed, confirmationSent: false, driverTakenOff: false, driverUpdated: false };
  }

  if (outcome !== "applied" && outcome !== "refund_due") return { ok: false, code: "unknown" };
  await expireSupersededPage(env, row.old_extra_session_id);
  const after = await afterChangeApplied(env, ctx.bookingId, row.unassigned_chauffeur_id ? String(row.unassigned_chauffeur_id) : null);
  return { ...base, outcome, payUrl: null, mailed: false, ...after };
}

/**
 * 26.2 P6: a change applied at once replaced a dearer change that still waited for its payment.
 * Its Stripe page is closed, so the old link cannot be paid for a change that will never apply.
 * Best effort: a payment that still arrives is recorded and shows as Refund due (P1 C6).
 */
export async function expireSupersededPage(env: CloudflareEnv, sessionId: string | null | undefined): Promise<void> {
  const id = s(sessionId).trim();
  if (!id) return;
  try {
    await expireCheckoutSession(stripeFromEnv(env), id);
  } catch {
    // Already expired or paid.
  }
}

/** 26.2 P6 (D16): the existing e-mail a driver who stays on the trip gets. */
export type KeptDriverMail = { chauffeurId: string; mail: "assign" | "time" };

type MailFactsRow = {
  email: string | null;
  languages_csv: string | null;
  reference: string;
  pickup_text: string | null;
  dropoff_text: string | null;
  scheduled_local: string | null;
};

async function driverMailFacts(env: CloudflareEnv, bookingId: string, chauffeurId: string): Promise<MailFactsRow | null> {
  return asSystem(env, async (sql) => {
    const rows = await sql<MailFactsRow[]>`select * from public.booking_change_mail_facts(${bookingId}::uuid, ${chauffeurId}::uuid)`;
    return rows[0] ?? null;
  });
}

/**
 * After a change was applied (on confirm, or when the difference was paid): the confirmation again
 * with the new class and total (D7); the driver taken off the trip gets the "trip taken off" mail
 * (D6); a driver who stays gets the existing "trip assigned" mail again for new places, or the
 * existing time-change mail for a new time alone (26.2 P6, D16). Mail is best effort: the change
 * already committed.
 */
export async function afterChangeApplied(
  env: CloudflareEnv,
  bookingId: string,
  unassignedChauffeurId: string | null,
  kept: KeptDriverMail | null = null,
): Promise<{ confirmationSent: boolean; driverTakenOff: boolean; driverUpdated: boolean }> {
  let confirmationSent = false;
  try {
    confirmationSent = (await deliverBookingConfirmation(env, bookingId)).ok;
  } catch {
    confirmationSent = false;
  }
  const key = env.RESEND_API_KEY ?? "";
  let driverTakenOff = false;
  if (unassignedChauffeurId) {
    driverTakenOff = true;
    try {
      const facts = await driverMailFacts(env, bookingId, unassignedChauffeurId);
      const to = s(facts?.email).trim();
      if (facts && to && key) {
        await sendChauffeurUnassign(
          { RESEND_API_KEY: key },
          {
            reference: s(facts.reference),
            locale: chauffeurEmailLocale(s(facts.languages_csv).split(",").map((x) => x.trim()).filter(Boolean)),
            pickupText: s(facts.pickup_text),
            dropoffText: s(facts.dropoff_text),
            scheduledLocal: s(facts.scheduled_local),
          },
          to,
        );
      }
    } catch {
      // The driver is off the trip either way; the dashboard shows it unassigned.
    }
  }
  let driverUpdated = false;
  if (kept && kept.chauffeurId !== unassignedChauffeurId) {
    try {
      const facts = await driverMailFacts(env, bookingId, kept.chauffeurId);
      const to = s(facts?.email).trim();
      if (facts && to && key) {
        const trip = {
          reference: s(facts.reference),
          locale: chauffeurEmailLocale(s(facts.languages_csv).split(",").map((x) => x.trim()).filter(Boolean)),
          pickupText: s(facts.pickup_text),
          dropoffText: s(facts.dropoff_text),
          scheduledLocal: s(facts.scheduled_local),
        };
        const sent =
          kept.mail === "assign"
            ? await sendChauffeurAssign({ RESEND_API_KEY: key }, trip, to)
            : await sendTimeChange({ RESEND_API_KEY: key }, { ...trip, outcome: "confirmed" }, to);
        driverUpdated = sent.ok;
      }
    } catch {
      driverUpdated = false;
    }
  }
  return { confirmationSent, driverTakenOff, driverUpdated };
}

type RequestFactsRow = {
  booking_id: string;
  places_changed: boolean;
  time_changed: boolean;
  party_changed: boolean;
  class_changed: boolean;
  assigned_chauffeur_id: string | null;
};

/** 26.2 P6: which existing e-mail a driver who stayed gets: new places, else a new time alone. */
export function keptDriverMail(facts: { places_changed: boolean; time_changed: boolean; class_changed: boolean; assigned_chauffeur_id: string | null } | null): KeptDriverMail | null {
  if (!facts || facts.class_changed || !facts.assigned_chauffeur_id) return null;
  if (facts.places_changed) return { chauffeurId: String(facts.assigned_chauffeur_id), mail: "assign" };
  if (facts.time_changed) return { chauffeurId: String(facts.assigned_chauffeur_id), mail: "time" };
  return null;
}

/** Stripe webhook: the difference of a change was paid and the change applied. */
export async function afterExtraSettled(
  env: CloudflareEnv,
  row: { booking_id: string; applied?: boolean; unassigned_chauffeur_id?: string | null; request_id?: string | null },
): Promise<void> {
  if (row.applied !== true) return;
  let kept: KeptDriverMail | null = null;
  const requestId = s(row.request_id).trim();
  if (requestId) {
    try {
      const facts = await asSystem(env, async (sql) => {
        const rows = await sql<RequestFactsRow[]>`select * from public.booking_change_request_facts(${requestId}::uuid)`;
        return rows[0] ?? null;
      });
      kept = keptDriverMail(facts);
    } catch {
      kept = null;
    }
  }
  await afterChangeApplied(env, row.booking_id, row.unassigned_chauffeur_id ?? null, kept);
}

type WaitingRow = { request_id: string; actor: string; extra_session_id: string | null; reference: string };

/**
 * "Withdraw change" (owner sign-off 2026-10-01): end the admin's dearer class change that waits for
 * the customer's payment. The Stripe page for the difference is closed FIRST, so an ended request
 * never leaves a link that still works. If she paid in the same second the page is already
 * complete: the answer is already-paid and nothing is ended (the payment applies the change). If the
 * page had expired already, the request is ended all the same. Nothing is charged; the booking is
 * not touched.
 */
export async function withdrawBookingChange(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
): Promise<{ ok: true; bookingId: string; reference: string } | ChangeFail> {
  if ((env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_")) return { ok: false, code: "stripe-test-only" };
  const key = bookingKey.trim();
  if (!key) return { ok: false, code: "not-found" };

  let bookingId: string | null;
  let waiting: WaitingRow | null;
  try {
    bookingId = await resolveStaffBookingId(env, claims, key);
    if (!bookingId) return { ok: false, code: "not-found" };
    const id = bookingId;
    waiting = await asStaff(env, claims, async (sql) => {
      const rows = await sql<WaitingRow[]>`
        select r.id::text as request_id, r.actor::text as actor, r.extra_session_id, b.reference
          from public.booking_edit_requests as r
          join public.bookings as b on b.id = r.booking_id
         where r.booking_id = ${id}::uuid
           and r.status = 'requested'
         order by r.created_at desc
         limit 1
      `;
      return rows[0] ?? null;
    });
  } catch {
    return { ok: false, code: "unknown" };
  }
  if (!waiting || waiting.actor !== "staff" || !waiting.extra_session_id) return { ok: false, code: "nothing-waiting" };

  const stripe = stripeFromEnv(env);
  try {
    await expireCheckoutSession(stripe, waiting.extra_session_id);
  } catch {
    let status = "";
    try {
      status = String((await retrieveCheckoutSession(stripe, waiting.extra_session_id))?.status ?? "");
    } catch {
      status = "";
    }
    if (status === "complete") return { ok: false, code: "already-paid" };
    if (status !== "expired") return { ok: false, code: "stripe-failed" };
  }

  const ids = { bookingId, requestId: waiting.request_id };
  try {
    await asSystem(env, async (sql) => {
      await sql`
        select * from public.booking_change_withdraw(
          ${ids.bookingId}::uuid,
          ${ids.requestId}::uuid,
          ${claims.sub}::uuid
        )
      `;
      return null;
    });
  } catch (err) {
    return mapChangeSqlError(err);
  }
  return { ok: true, bookingId, reference: String(waiting.reference) };
}
