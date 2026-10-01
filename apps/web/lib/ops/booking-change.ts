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
  sendChauffeurUnassign,
  sendClassChangePay,
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
};

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

export const defaultChangeDeps: ChangeDeps = {
  now: () => Date.now(),
  loadContext: defaultLoadContext,
  loadLiveBook: (env) => loadRateBook(env, { preferDraft: false }),
  loadBookByVersion: loadQuoteBookDocForVersion,
  loadVatRateBps: async (env) => (await loadLaunchFlags(env)).vat_rate_bps,
  loadSettings: async (env, claims, computedAt) => (await loadSettingsRows(env, claims, computedAt)).rows,
  resolvePlace: defaultResolvePlace,
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

/** Rules, then the price step (stored facts when the shown totals pin them, else the Mapbox facts). */
async function priceForBooking(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
  deps: ChangeDeps,
): Promise<Priced | ChangeFail> {
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

  const saved = ctx.snapshot
    ? savedChargeFromSnapshot({
        total_rappen: ctx.snapshot.totalRappen,
        lines: ctx.snapshot.lines,
        rate_version_id: ctx.snapshot.rateVersionId,
        class_slug: ctx.snapshot.classSlug,
        shown_alternatives: ctx.snapshot.shownAlternatives,
      })
    : null;
  // The price record must be of the class the trip has (an old in-place class edit breaks that).
  if (!saved || saved.classSlug !== ctx.legClassSlug) return { ok: false, code: "trip-data" };

  const computedAt = new Date(nowMs).toISOString();
  let today: RateBook;
  let bookingBook: RateBook;
  let vatRateBps: number;
  let settings: SettingsVersionRow[];
  try {
    today = mapRateBook(await deps.loadLiveBook(env));
    if (!today.rate_version) return { ok: false, code: "pricing-not-live" };
    bookingBook =
      saved.rateVersionId === today.rate_version.id
        ? today
        : mapRateBook(await deps.loadBookByVersion(env, claims, saved.rateVersionId));
    vatRateBps = await deps.loadVatRateBps(env);
    settings = await deps.loadSettings(env, claims, computedAt);
  } catch {
    return { ok: false, code: "unknown" };
  }

  const attempt = (facts: TripFacts | null) =>
    facts
      ? priceBookingChange({
          bookingBook: { book: bookingBook, settings, vatRateBps: saved.vatRateBps },
          today: { book: today, settings, vatRateBps },
          facts,
          saved,
          paidRappen: ctx.paidRappen,
          computedAt,
        })
      : ({ ok: false, code: "trip-data" } as const);

  // Same book and the customer's shown class totals on record: the stored trip is checked against
  // every class total, no Mapbox call needed.
  if (saved.rateVersionId === today.rate_version.id && saved.shownAlternatives.length > 0) {
    const stored = attempt(tripFactsFromContext(ctx, null));
    if (stored.ok) return { ok: true, ctx, saved, price: stored };
  }
  // Otherwise the saved places through Mapbox (airport, city, canton), checked against the charge.
  const language = geoLanguage(ctx.locale);
  const [origin, dest] = await Promise.all([
    deps.resolvePlace(env, { placeId: ctx.leg.pickupPlaceId, lat: ctx.leg.pickupLat, lng: ctx.leg.pickupLng }, language),
    deps.resolvePlace(env, { placeId: ctx.leg.dropoffPlaceId, lat: ctx.leg.dropoffLat, lng: ctx.leg.dropoffLng }, language),
  ]);
  if (origin || dest) {
    const resolved = attempt(tripFactsFromContext(ctx, { origin, dest }));
    if (resolved.ok) return { ok: true, ctx, saved, price: resolved };
  }
  return { ok: false, code: "trip-data" };
}

function classOut(row: ClassPrice): ChangeClass {
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
    return { ...base, outcome: "extra_required", payUrl: opened.url, mailed, confirmationSent: false, driverTakenOff: false };
  }

  if (outcome !== "applied" && outcome !== "refund_due") return { ok: false, code: "unknown" };
  const after = await afterChangeApplied(env, ctx.bookingId, row.unassigned_chauffeur_id ? String(row.unassigned_chauffeur_id) : null);
  return { ...base, outcome, payUrl: null, mailed: false, ...after };
}

/**
 * After a change was applied (on confirm, or when the difference was paid): the confirmation again
 * with the new class and total (D7); the driver taken off the trip gets the "trip taken off" mail
 * (D6). Mail is best effort: the change already committed.
 */
export async function afterChangeApplied(
  env: CloudflareEnv,
  bookingId: string,
  unassignedChauffeurId: string | null,
): Promise<{ confirmationSent: boolean; driverTakenOff: boolean }> {
  let confirmationSent = false;
  try {
    confirmationSent = (await deliverBookingConfirmation(env, bookingId)).ok;
  } catch {
    confirmationSent = false;
  }
  let driverTakenOff = false;
  if (unassignedChauffeurId) {
    driverTakenOff = true;
    try {
      const facts = await asSystem(env, async (sql) => {
        const rows = await sql<
          { email: string | null; languages_csv: string | null; reference: string; pickup_text: string | null; dropoff_text: string | null; scheduled_local: string | null }[]
        >`select * from public.booking_change_mail_facts(${bookingId}::uuid, ${unassignedChauffeurId}::uuid)`;
        return rows[0] ?? null;
      });
      const to = s(facts?.email).trim();
      const key = env.RESEND_API_KEY ?? "";
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
  return { confirmationSent, driverTakenOff };
}

/** Stripe webhook: the difference of a change was paid and the change applied. */
export async function afterExtraSettled(
  env: CloudflareEnv,
  row: { booking_id: string; applied?: boolean; unassigned_chauffeur_id?: string | null },
): Promise<void> {
  if (row.applied !== true) return;
  await afterChangeApplied(env, row.booking_id, row.unassigned_chauffeur_id ?? null);
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
