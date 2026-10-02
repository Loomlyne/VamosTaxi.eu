// apps/web/lib/ops/booking-trip-change.ts
//
// 26.2 P6: the admin changes the places, the date or time, or the party of a PAID trip on the
// dashboard (plan signed 2026-10-01, owner decisions D1-D16). It extends P1's machine
// (booking-change.ts): the same rules, the same price step (today's live book, the booking's extras
// at the amount paid and its coupon as it applied, VAT), the same routes (…/change/preview and
// …/change), the same staff request through the change machine, the same pay link for the
// difference, the same "Refund due", the same Withdraw change.
//
//   previewTripChange  read-only. A new place: the trip facts step (address search -> Mapbox route,
//                      counted in the daily limit -> airport, city, canton), signed; every class of
//                      today's book priced on the NEW route. Date, time or party on the route as
//                      booked: P1's price step for the classes (a party too big for the class is
//                      offered the classes that fit, D4) and no new price for the class as booked
//                      (D1, D5). An assigned driver's other trips are checked against the new time
//                      and route (D7).
//   confirmTripChange  priced again on the server from the signed facts (no second Mapbox call,
//                      nothing from the browser but the owner's choices), then
//                      booking_staff_trip_change writes the price record and the staff request:
//                        no new price (date, time, party inside the class) -> applied now;
//                        cheaper -> applied now, "Refund due" with the full difference (D3);
//                        dearer  -> the trip keeps its places until the customer pays the
//                                   difference on Stripe's page (24 h), the owner's D14 e-mail.
//                      Applied: the confirmation again; a driver who stays gets the existing "trip
//                      assigned" e-mail for new places or the time-change e-mail for a new time
//                      (D16); a driver taken off gets "trip taken off".
//
// Writes are SECURITY DEFINER functions under asSystem, refusals mapped AROUND the wrapper
// (postgres.js begin() rethrows).

import { sendTripChangePay, type EmailLocale } from "@vamos/emails/confirmation";
import { asSystem, type VamosClaims } from "@/lib/db/identity";
import { supersedePendingEditRequest } from "@/lib/db/system-reads";
import { ENGINE_VERSION } from "@/lib/version";
import { classDisplayName } from "../pricing/public-board";
import type { RateBook } from "../pricing/types";
import { zurichLocalToUtcMs } from "../geo/serviceArea";
import {
  afterChangeApplied,
  classOut,
  confirmBookingChange,
  defaultChangeDeps,
  expireSupersededPage,
  loadChangeBooks,
  loadChangeRules,
  previewBookingChange,
  priceOnBookedRoute,
  savedChargeOf,
  type ChangeBooks,
  type ChangeConfirmed,
  type ChangeContext,
  type ChangeDeps,
  type ChangePreview,
  type DriverClash,
  type KeptDriverMail,
  type LoadedRules,
} from "./booking-change";
import {
  mapChangeSqlError,
  tripTarget,
  type ChangeFail,
  type ChangeRequest,
  type TripChangeInput,
  type TripTarget,
} from "./booking-change-map";
import { classNets, priceClasses, type ClassPrice, type SavedCharge } from "./booking-change-price";
import { DASHBOARD_ORIGIN, openDifferencePayment } from "./edit-request";
import type { SavedTrip, TripFactsInput, TripFactsOk } from "./trip-change-facts";

export const dynamic = "force-dynamic";

export type TripChangePreview = ChangePreview & {
  /** The signed trip facts of a new place, sent back at confirm. */
  lock?: string;
  /** The (new) pickup is an airport: the flight number comes first. */
  pickupIsAirport?: boolean;
  /** Another trip of the assigned driver the trip as edited overlaps (D7). */
  driverClash?: DriverClash;
};

const n = (value: unknown): number => {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const s = (value: unknown): string => (value == null ? "" : String(value));

function emailLocale(locale: string): EmailLocale {
  return locale === "de" || locale === "fr" || locale === "ar" ? locale : "en";
}

function savedTrip(ctx: ChangeContext): SavedTrip {
  return {
    pickupText: ctx.leg.pickupText,
    pickupPlaceId: ctx.leg.pickupPlaceId,
    pickupLat: ctx.leg.pickupLat,
    pickupLng: ctx.leg.pickupLng,
    dropoffText: ctx.leg.dropoffText,
    dropoffPlaceId: ctx.leg.dropoffPlaceId,
    dropoffLat: ctx.leg.dropoffLat,
    dropoffLng: ctx.leg.dropoffLng,
    flightNo: ctx.leg.flightNo,
  };
}

function factsInput(ctx: ChangeContext, trip: TripChangeInput, target: TripTarget): TripFactsInput {
  return { locale: ctx.locale, saved: savedTrip(ctx), trip, target };
}

function todayPriced(books: ChangeBooks) {
  return { book: books.today, settings: books.settings, vatRateBps: books.vatRateBps };
}

function sortedClasses(book: RateBook) {
  return [...book.classes].sort((a, b) => a.sort_order - b.sort_order || (a.slug < b.slug ? -1 : 1));
}

function className(book: RateBook, slug: string): string {
  return classDisplayName(book.classes.find((c) => c.slug === slug), slug);
}

/**
 * D1, D5: a date, a time or a party inside the class moves no money. The class as booked keeps the
 * price paid (when the party fits it); the other classes keep what P1's price step said.
 */
function withNoNewPrice(rows: ClassPrice[], bookedTotalRappen: number, books: ChangeBooks, target: TripTarget): ClassPrice[] {
  return rows.map((row): ClassPrice => {
    if (!row.current) return row;
    let fits: boolean;
    if (row.ok) fits = true;
    else if (row.code === "class-too-small") fits = false;
    else {
      const cls = books.today.classes.find((c) => c.slug === row.slug);
      fits = !!cls && target.pax <= cls.passenger_capacity && target.bags <= cls.luggage_capacity;
    }
    return fits
      ? { ok: true, slug: row.slug, name: row.name, current: true, newTotalRappen: bookedTotalRappen, differenceRappen: 0, lines: [] }
      : { ok: false, slug: row.slug, name: row.name, current: true, code: "class-too-small" };
  });
}

/** Every class of today's book when the route as booked cannot be priced again (P1: trip-data). */
function unpriced(books: ChangeBooks, currentSlug: string, code: Extract<ClassPrice, { ok: false }>["code"]): ClassPrice[] {
  return sortedClasses(books.today).map((cls) => ({
    ok: false, slug: cls.slug, name: classDisplayName(cls, cls.slug), current: cls.slug === currentSlug, code,
  }));
}

/**
 * What the booking was sold at: its price record as the charge it was (null when that record cannot
 * be priced again — a change with no new price still works on it), the class and total as booked.
 */
function booked(ctx: ChangeContext): { saved: SavedCharge | null; classSlug: string; totalRappen: number } {
  const saved = savedChargeOf(ctx);
  return { saved, classSlug: saved ? saved.classSlug : ctx.legClassSlug, totalRappen: saved ? saved.totalRappen : n(ctx.snapshot?.totalRappen) };
}

/** D7: the window the trip as edited takes its driver for (the overlap guard's own rule). */
async function clashFor(
  env: CloudflareEnv,
  claims: VamosClaims,
  ctx: ChangeContext,
  target: TripTarget,
  minutes: number | null,
  deps: ChangeDeps,
): Promise<DriverClash | null> {
  const chauffeurId = s(ctx.assignedChauffeurId).trim();
  if (!chauffeurId || !(target.timeChanged || target.placesChanged) || !deps.findDriverClash) return null;
  const startMs = zurichLocalToUtcMs(target.scheduledLocal) ?? ctx.pickupAtMs;
  if (startMs == null) return null;
  const endMs = startMs + (Math.max(minutes ?? 0, 30) + Math.max(ctx.turnaroundMinutes ?? 0, 0)) * 60_000;
  try {
    return await deps.findDriverClash(env, claims, { bookingId: ctx.bookingId, chauffeurId, startMs, endMs });
  } catch {
    // The write checks the same rule again; a clash it finds asks for the owner's choice.
    return null;
  }
}

function withSaved(rules: LoadedRules, saved: SavedCharge) {
  return { ...rules, saved };
}

/** POST …/change/preview with trip fields: what the trip as edited would cost. Read-only. */
export async function previewTripChange(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
  trip: TripChangeInput,
  deps: ChangeDeps = defaultChangeDeps,
): Promise<TripChangePreview | ChangeFail> {
  const rules = await loadChangeRules(env, claims, bookingKey, deps);
  if (!rules.ok) return rules;
  const { ctx, computedAt } = rules;
  const target = tripTarget(ctx.leg, trip, rules.nowMs);
  if (!target.ok) return target;
  if (!target.placesChanged && !target.timeChanged && !target.partyChanged) {
    return previewBookingChange(env, claims, bookingKey, deps);
  }
  const was = booked(ctx);
  // New places need a new price: the record must be one P1's price step can read.
  if (target.placesChanged && !was.saved) return { ok: false, code: "trip-data" };
  const loadedBooks = await loadChangeBooks(env, claims, { saved: was.saved, computedAt }, deps);
  if (!loadedBooks.ok) return loadedBooks;
  const books = loadedBooks.books;

  let classes: ClassPrice[];
  let facts: TripFactsOk | null = null;
  if (target.placesChanged && was.saved) {
    const step = deps.tripFacts ?? defaultChangeDeps.tripFacts!;
    const got = await step(env, factsInput(ctx, trip, target));
    if (!got.ok) return got;
    facts = got;
    classes = priceClasses({
      today: todayPriced(books),
      facts: got.facts,
      metres: [got.facts.distanceM],
      saved: was.saved,
      paidRappen: ctx.paidRappen,
      currentClassSlug: was.saved.classSlug,
      computedAt,
    });
  } else {
    const priced = was.saved ? await priceOnBookedRoute(env, withSaved(rules, was.saved), books, deps, target) : null;
    const rows = priced && priced.ok
      ? priced.classes
      : unpriced(books, was.classSlug, !priced || priced.code === "trip-data" ? "trip-data" : "class-not-sold");
    classes = withNoNewPrice(rows, was.totalRappen, books, target);
  }

  const minutes = facts ? facts.leg.estimated_duration_minutes : ctx.leg.estimatedMinutes;
  const driverClash = await clashFor(env, claims, ctx, target, minutes, deps);
  return {
    ok: true,
    bookingId: ctx.bookingId,
    reference: ctx.reference,
    currentClass: was.classSlug,
    paidRappen: ctx.paidRappen,
    currentTotalRappen: was.totalRappen,
    rateVersionId: books.today.rate_version!.id,
    classes: classes.map(classOut),
    ...(facts ? { lock: facts.lock, pickupIsAirport: facts.pickupIsAirport } : {}),
    ...(driverClash ? { driverClash } : {}),
  };
}

type TripChangeRow = {
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
  kept_chauffeur_id: string | null;
};

/**
 * POST …/change: the owner confirms what he was shown. A body without trip fields is P1's class
 * change; a class change with nothing else that changes is P1's too (its approved e-mail).
 */
export async function confirmTripChange(
  env: CloudflareEnv,
  claims: VamosClaims,
  bookingKey: string,
  body: ChangeRequest,
  dashboardOrigin: string = DASHBOARD_ORIGIN,
  deps: ChangeDeps = defaultChangeDeps,
): Promise<ChangeConfirmed | ChangeFail> {
  const p1 = { klass: body.klass, expectTotalRappen: body.expectTotalRappen, expectPaidRappen: body.expectPaidRappen };
  const trip = body.trip;
  if (!trip) return confirmBookingChange(env, claims, bookingKey, p1, dashboardOrigin, deps);
  if (body.expectTotalRappen == null || body.expectPaidRappen == null) return { ok: false, code: "invalid-body" };
  // Plan: the change machine refuses a live key until the security session's pre-launch proof.
  if ((env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live_")) return { ok: false, code: "stripe-test-only" };

  const rules = await loadChangeRules(env, claims, bookingKey, deps);
  if (!rules.ok) return rules;
  const { ctx, nowMs, computedAt } = rules;
  const target = tripTarget(ctx.leg, trip, nowMs);
  if (!target.ok) return target;
  const was = booked(ctx);
  const klass = body.klass && body.klass !== was.classSlug ? body.klass : null;
  if (!target.placesChanged && !target.timeChanged && !target.partyChanged) {
    if (klass) return confirmBookingChange(env, claims, bookingKey, p1, dashboardOrigin, deps);
    return { ok: false, code: "no-change" };
  }
  // A new price (new places, a class) needs a record P1's price step can read; a date, time or
  // party inside the class does not (D1, D5).
  const saved = was.saved;
  if ((target.placesChanged || klass) && !saved) return { ok: false, code: "trip-data" };
  const loadedBooks = await loadChangeBooks(env, claims, { saved, computedAt }, deps);
  if (!loadedBooks.ok) return loadedBooks;
  const books = loadedBooks.books;

  const write: Record<string, string | number | null> = {};
  let facts: TripFactsOk | null = null;
  let classes: ClassPrice[] | null = null;
  if (target.placesChanged && saved) {
    if (!trip.lock) return { ok: false, code: "lock-invalid" };
    const verify = deps.verifyTripFacts ?? defaultChangeDeps.verifyTripFacts!;
    const got = await verify(env, trip.lock, factsInput(ctx, trip, target), new Date(nowMs).toISOString());
    if (!got.ok) return got;
    facts = got;
    // A new airport pickup asks for the flight number first, as New trip does (saved at once before).
    if (trip.pickup && got.pickupIsAirport && !s(ctx.leg.flightNo).trim()) return { ok: false, code: "flight-needed" };
    Object.assign(write, got.leg);
    classes = priceClasses({
      today: todayPriced(books),
      facts: got.facts,
      metres: [got.facts.distanceM],
      saved,
      paidRappen: ctx.paidRappen,
      currentClassSlug: saved.classSlug,
      computedAt,
    });
  } else if (klass && saved) {
    const priced = await priceOnBookedRoute(env, withSaved(rules, saved), books, deps, target);
    if (!priced.ok) return priced;
    classes = priced.classes;
  }
  if (target.timeChanged) write.scheduled_local = target.scheduledLocal;
  if (target.pax !== ctx.leg.pax) write.pax = target.pax;
  if (target.bags !== ctx.leg.bags) write.bags = target.bags;

  const targetSlug = klass ?? was.classSlug;
  let price: { rateVersionId: number; total: number; lines: unknown[]; name: string } | null = null;
  if (classes) {
    const row = classes.find((c) => c.slug === targetSlug);
    if (!row) return { ok: false, code: "unknown-class" };
    if (!row.ok) return { ok: false, code: row.code };
    // The owner confirms what he saw; anything that moved since is shown again, never charged.
    if (row.newTotalRappen !== body.expectTotalRappen) return { ok: false, code: "price-changed" };
    price = { rateVersionId: books.today.rate_version!.id, total: row.newTotalRappen, lines: row.lines, name: row.name };
  } else if (body.expectTotalRappen !== was.totalRappen) {
    return { ok: false, code: "price-changed" };
  }
  if (ctx.paidRappen !== body.expectPaidRappen) return { ok: false, code: "paid-changed" };
  const shown = facts && saved ? classNets(todayPriced(books), facts.facts, facts.facts.distanceM, saved, computedAt) : null;

  type Json = Parameters<Parameters<typeof asSystem>[1]>[0]["json"];
  let row: TripChangeRow;
  try {
    row = await asSystem<TripChangeRow>(env, async (sql) => {
      const json = (value: unknown) => sql.json(value as Parameters<Json>[0]);
      const rows = await sql<TripChangeRow[]>`
        select * from public.booking_staff_trip_change(
          ${ctx.bookingId}::uuid,
          ${claims.sub}::uuid,
          ${klass}::text,
          ${json(write)},
          ${price ? price.rateVersionId : null}::bigint,
          ${price ? price.total : null}::int4,
          ${price ? json(price.lines) : null}::jsonb,
          ${ENGINE_VERSION}::text,
          ${facts ? facts.distanceKm : null}::numeric,
          ${facts ? facts.durationMin : null}::int4,
          ${shown ? json(shown) : null}::jsonb,
          ${ctx.paidRappen}::int4,
          ${trip.driver}::text
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
    className: price ? price.name : className(books.today, targetSlug),
    newTotalRappen: n(row.new_total_rappen),
    paidRappen: n(row.paid_rappen),
    differenceRappen: n(row.difference_rappen),
  };

  if (outcome === "extra_required") {
    const opened = await openDifferencePayment(env, {
      requestId: String(row.request_id),
      bookingId: ctx.bookingId,
      differenceRappen: n(row.difference_rappen),
      // The page of the request this change replaced: closed, never reused (one page, one request).
      supersededSessionId: row.old_extra_session_id ? String(row.old_extra_session_id) : null,
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
        const sent = await sendTripChangePay(
          { RESEND_API_KEY: env.RESEND_API_KEY ?? "" },
          {
            reference: ctx.reference,
            locale: emailLocale(ctx.locale),
            changes: {
              ...(typeof write.pickup_text === "string" ? { pickup: write.pickup_text } : {}),
              ...(typeof write.dropoff_text === "string" ? { dropoff: write.dropoff_text } : {}),
              ...(target.timeChanged ? { scheduledLocal: target.scheduledLocal } : {}),
              ...(klass && price ? { className: price.name } : {}),
            },
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
  const keptId = row.kept_chauffeur_id ? String(row.kept_chauffeur_id) : null;
  const kept: KeptDriverMail | null = keptId
    ? target.placesChanged
      ? { chauffeurId: keptId, mail: "assign" }
      : target.timeChanged
        ? { chauffeurId: keptId, mail: "time" }
        : null
    : null;
  const after = await afterChangeApplied(env, ctx.bookingId, row.unassigned_chauffeur_id ? String(row.unassigned_chauffeur_id) : null, kept);
  return { ...base, outcome, payUrl: null, mailed: false, ...after };
}
