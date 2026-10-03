// apps/web/lib/checkout/trip-url.ts
//
// D-05: the trip travels in the URL — `/checkout?from=…&fid=…&to=…&tid=…&gs=…
// &when=YYYY-MM-DDTHH:MM&pax=&bags=&flight=` — from the home box to the
// checkout, and back again in the Stripe cancel_url and the resume
// trip_query (D-24). `class` and `extras` carry the selection through sign-in
// (D-13). One parser and one builder, pure, server- and client-side.
//
// Nothing here is trusted for money: /api/quote and the intent re-validate
// against their own schemas and the signed lock. A bad value is dropped (null)
// and, for a visible form field, reported — never thrown. Contact data (name,
// e-mail, phone) never goes in the URL.

import { z } from "zod";

export type TripField = "from" | "flight" | "to" | "when" | "travellers";

/** Form order, as on the home box and the checkout trip editor. */
const FIELD_ORDER: readonly TripField[] = ["from", "flight", "to", "when", "travellers"];

export type TripFieldError = { field: TripField; reason: "required" | "invalid" };

export type Trip = {
  from: string | null;
  /** Mapbox `mapbox_id` of the pickup suggestion. */
  fid: string | null;
  to: string | null;
  tid: string | null;
  /** The home's Mapbox geo session token. */
  gs: string | null;
  /** Europe/Zurich wall clock, `YYYY-MM-DDTHH:MM`. */
  when: string | null;
  pax: number | null;
  bags: number | null;
  /** Normalised, no space: `LX318`. */
  flight: string | null;
  /** For display: `LX 318`. */
  flightDisplay: string | null;
  /** Vehicle class slug picked before sign-in. */
  class: string | null;
  /** Ticked extra codes, exact, deduped, max 20. */
  extras: string[];
  /** quote_id of the booking to refill after Back from Stripe. */
  resume: string | null;
  /** Payment outcome shown after Back (`unpaid`, `failed`, `cancelled`). */
  pay: string | null;
};

export type ParsedTrip = { trip: Trip; errors: TripFieldError[] };

export const PAX_MIN = 1;
/**
 * Database limit on one leg (`booking_legs.pax` 1..16), the same bound `POST /api/quote` accepts.
 * Which class fits a party is decided by the class rows (quote eligibility; `lib/quote/intent.ts`
 * refuses an ineligible class), not by this number.
 */
export const PAX_MAX = 16;
export const BAGS_MAX = 16;
export const TEXT_MAX = 200;
export const EXTRAS_MAX = 20;

const WHEN_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const FLIGHT_RE = /^([A-Z0-9]{2,3}?)\s?(\d{1,4}[A-Z]?)$/;
const CODE_RE = /^[a-z0-9_-]{1,64}$/;
const SLUG_RE = /^[a-z0-9_-]{1,64}$/;

const text = z.string().trim().min(1).max(TEXT_MAX);
const uuid = z.string().uuid();
const intIn = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d{1,3}$/)
    .transform(Number)
    .pipe(z.number().int().min(min).max(max));
const payOutcome = z.enum(["unpaid", "failed", "cancelled"]);

function read(params: URLSearchParams | Record<string, string | undefined>, key: string): string | null {
  const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
  if (typeof raw !== "string") return null;
  return raw.trim() === "" ? null : raw;
}

function pick<T>(schema: z.ZodType<T>, raw: string | null): T | null {
  if (raw == null) return null;
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function validWhen(raw: string): boolean {
  const m = WHEN_RE.exec(raw);
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  if (h > 23 || mi > 59) return false;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** `lx 318` → `{ flight: "LX318", display: "LX 318" }`, or null. */
export function normaliseFlight(raw: string): { flight: string; display: string } | null {
  const m = FLIGHT_RE.exec(raw.trim().toUpperCase().replace(/\s+/g, " "));
  if (!m) return null;
  return { flight: `${m[1]}${m[2]}`, display: `${m[1]} ${m[2]}` };
}

function parseExtras(raw: string | null): string[] {
  if (!raw) return [];
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const code = part.trim();
    if (!CODE_RE.test(code) || out.includes(code)) continue;
    out.push(code);
    if (out.length >= EXTRAS_MAX) break;
  }
  return out;
}

/** D-05: read the URL trip. Never throws; bad values are null. */
export function parseTripQuery(
  params: URLSearchParams | Record<string, string | undefined>,
): ParsedTrip {
  const errors = new Map<TripField, TripFieldError["reason"]>();
  const flag = (field: TripField, raw: string | null, value: unknown) => {
    if (value != null) return;
    if (!errors.has(field)) errors.set(field, raw == null ? "required" : "invalid");
  };

  const rawFrom = read(params, "from");
  const from = pick(text, rawFrom);
  flag("from", rawFrom, from);

  const rawFlight = read(params, "flight");
  const flightParts = rawFlight == null || rawFlight.length > 16 ? null : normaliseFlight(rawFlight);
  if (rawFlight != null && !flightParts) errors.set("flight", "invalid");

  const rawTo = read(params, "to");
  const to = pick(text, rawTo);
  flag("to", rawTo, to);

  const rawWhen = read(params, "when");
  const when = rawWhen != null && validWhen(rawWhen) ? rawWhen : null;
  flag("when", rawWhen, when);

  const rawPax = read(params, "pax");
  const pax = pick(intIn(PAX_MIN, PAX_MAX), rawPax);
  flag("travellers", rawPax, pax);

  const rawBags = read(params, "bags");
  const bags = rawBags == null ? 0 : pick(intIn(0, BAGS_MAX), rawBags);
  if (bags == null) errors.set("travellers", errors.get("travellers") ?? "invalid");

  const rawClass = read(params, "class");
  const trip: Trip = {
    from,
    fid: pick(text, read(params, "fid")),
    to,
    tid: pick(text, read(params, "tid")),
    gs: pick(uuid, read(params, "gs")),
    when,
    pax,
    bags,
    flight: flightParts?.flight ?? null,
    flightDisplay: flightParts?.display ?? null,
    class: rawClass != null && SLUG_RE.test(rawClass) ? rawClass : null,
    extras: parseExtras(read(params, "extras")),
    resume: pick(uuid, read(params, "resume")),
    pay: pick(payOutcome, read(params, "pay")),
  };

  const ordered: TripFieldError[] = [];
  for (const field of FIELD_ORDER) {
    const reason = errors.get(field);
    if (reason) ordered.push({ field, reason });
  }
  return { trip, errors: ordered };
}

export type BuildTripOptions = {
  /** Add `resume` (Stripe cancel_url, D-24). */
  resume?: boolean;
  /** Add `pay` (return-route outcome). */
  pay?: boolean;
};

/**
 * D-05/D-24: the URL trip as a query string (no leading `?`). Only trip keys;
 * never name, e-mail or phone. `resume`/`pay` only when asked.
 */
export function buildTripQuery(trip: Trip, opts: BuildTripOptions = {}): string {
  const params = new URLSearchParams();
  const put = (key: string, value: string | number | null | undefined) => {
    if (value == null || value === "") return;
    params.set(key, String(value));
  };
  put("from", trip.from);
  put("fid", trip.fid);
  put("to", trip.to);
  put("tid", trip.tid);
  put("gs", trip.gs);
  put("when", trip.when);
  put("pax", trip.pax);
  put("bags", trip.bags);
  put("flight", trip.flight);
  put("class", trip.class);
  if (trip.extras.length > 0) put("extras", trip.extras.join(","));
  if (opts.resume) put("resume", trip.resume);
  if (opts.pay) put("pay", trip.pay);
  return params.toString();
}
