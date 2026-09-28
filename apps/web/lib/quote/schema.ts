// apps/web/lib/quote/schema.ts
//
// Zod boundary for POST /api/quote, /api/quote/reprice, and the quote-side of
// checkout intent (D-04, D-35, D-05). Untrusted JSON first meets the engine here.
//
// Two hard rules:
//  1. Every object schema is `.strict()`. A client price field that is merely
//     stripped teaches a reviewer nothing and leaves no log line; a body that
//     FAILS tells us someone tried. The named refusal set below additionally
//     names the field so the failure is not a generic "unrecognized key".
//  2. Mock tokens are normalised in a preprocess step BEFORE the strict union
//     (D-04). `one-way` becomes `one_way`. `hourly` is intercepted in that same
//     step and returned as its own outcome — "we don't sell that yet" is a
//     product answer with four-language copy, not a shape complaint.
//
// Negative space: this module decides no HTTP status and formats no message —
// it returns a discriminated result and plan 04-11's handler maps it through
// errors.ts. It performs no I/O and calls no clock.

import { z } from "zod";
import { parseFareKind, type FareKind, type QuoteMode } from "../pricing/types";
import { CURRENCY_MARKS, type CurrencyCode } from "../currency";

/** Codes `parseQuoteRequest` can emit — handler maps them via errors.ts. */
export type ParseQuoteFailureCode =
  | "untrusted_input"
  | "mode_not_offered"
  | "extras_max_stops"
  | "extras_max_child_seats"
  | "place_out_of_box";

export type ParseQuoteResult =
  | { ok: true; value: QuoteRequest }
  | { ok: false; code: ParseQuoteFailureCode; field?: string };

/**
 * Named client fields that MUST NOT reach the engine (04-API-CONTRACT.md §0).
 * Driven by tests via `it.each` so the list and the suite cannot drift.
 */
export const FORBIDDEN_CLIENT_PRICE_FIELDS = [
  "distance_m",
  "duration_s",
  "distance_km",
  "duration_min",
  "total_rappen",
  "class_totals",
  "rate_version_id",
  "settings_version_id",
  "lines",
  "expires_at",
  "engine_version",
  "hours",
  // D-08b/D-10 (26.1-09): canton, city and airport facts are server-resolved
  // from Mapbox only — never accepted from the request body.
  "origin_canton",
  "dest_canton",
  "canton",
  "origin_city_id",
  "dest_city_id",
  "is_airport",
  "origin_is_airport",
  "airport",
] as const;

export type ForbiddenClientPriceField =
  (typeof FORBIDDEN_CLIENT_PRICE_FIELDS)[number];

const LOCALE_VALUES = ["en", "de", "fr", "ar"] as const;
export type QuoteLocale = (typeof LOCALE_VALUES)[number];

const CURRENCY_VALUES = Object.keys(CURRENCY_MARKS) as CurrencyCode[];

const CLASS_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SCHEDULED_LOCAL_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const placeText = z.string().min(2).max(200);

const PlaceRetrieveSchema = z
  .object({
    kind: z.literal("retrieve"),
    mapbox_id: z.string().min(1).max(256),
    session_token: z.string().min(1).max(128),
    text: placeText,
  })
  .strict();

const PlacePinSchema = z
  .object({
    kind: z.literal("pin"),
    lng: z.number().finite(),
    lat: z.number().finite(),
    text: placeText.optional(),
  })
  .strict();

const PlaceCoordsSchema = z
  .object({
    kind: z.literal("coords"),
    lng: z.number().finite(),
    lat: z.number().finite(),
    text: placeText,
    place_id: z.string().min(1).max(256).optional(),
  })
  .strict();

export const PlaceInputSchema = z.discriminatedUnion("kind", [
  PlaceRetrieveSchema,
  PlacePinSchema,
  PlaceCoordsSchema,
]);

export type PlaceInput = z.infer<typeof PlaceInputSchema>;

const WaypointSchema = z
  .object({
    lng: z.number().finite(),
    lat: z.number().finite(),
    text: placeText,
  })
  .strict();

/**
 * Extras on quote/reprice. Range refusals with their OWN error codes are applied
 * in `parseQuoteRequest` post-guards (readable assignment), not buried in zod max messages.
 */
export const ExtrasSchema = z
  .object({
    child_seats: z.number().int().optional(),
    extra_stops: z.number().int().optional(),
    oversized_luggage: z.boolean().optional(),
    waypoints: z.array(WaypointSchema).max(1).optional(),
  })
  .strict();

export type ExtrasInput = z.infer<typeof ExtrasSchema>;

const LegSchema = z
  .object({
    leg_seq: z.union([z.literal(1), z.literal(2)]),
    scheduled_local: z.string().regex(SCHEDULED_LOCAL_RE),
    flight_no: z.string().max(16).nullable().optional(),
  })
  .strict();

const QuoteBodySchema = z
  .object({
    locale: z.enum(LOCALE_VALUES),
    display_currency: z.enum(
      CURRENCY_VALUES as [CurrencyCode, ...CurrencyCode[]],
    ),
    mode: z.enum(["one_way", "return"] as const satisfies readonly QuoteMode[]),
    pickup: PlaceInputSchema,
    dropoff: PlaceInputSchema,
    legs: z.array(LegSchema).min(1).max(2),
    pax: z.number().int().min(1).max(16),
    bags: z.number().int().min(0).max(16),
    preferred_class: z.string().regex(CLASS_SLUG).optional(),
    turnstile_token: z.string().min(1).max(2048).optional(),
    geo_session: z.string().min(1).max(128).optional(),
    extras: ExtrasSchema.optional(),
    coupon: z.string().min(1).max(64).optional(),
    /**
     * Comment 11. Optional so older clients stay one way. Not a client price.
     * Overlap with comment 10: do not treat this as tab chrome.
     */
    fare_kind: z.string().max(32).optional(),
  })
  .strict();

export const QuoteRequestSchema = QuoteBodySchema;

export type QuoteRequest = z.infer<typeof QuoteBodySchema>;

/**
 * D-08b / 26.1-30: the only per-leg fact a reprice may change is the flight
 * number the customer typed at /checkout/details. Everything else on the leg
 * (time, places, boundary facts) stays pinned by the lock.
 */
const RepriceLegSchema = z
  .object({
    leg_seq: z.union([z.literal(1), z.literal(2)]),
    flight_no: z.string().max(16).nullable(),
  })
  .strict();

/** Reprice is no more permissive than quote — same refusal set, pin from lock. */
export const RepriceRequestSchema = z
  .object({
    quote_id: z.string().min(1).max(128),
    lock: z.string().min(1).max(8192),
    locale: z.enum(LOCALE_VALUES),
    display_currency: z.enum(
      CURRENCY_VALUES as [CurrencyCode, ...CurrencyCode[]],
    ),
    preferred_class: z.string().regex(CLASS_SLUG).optional(),
    extras: ExtrasSchema.optional(),
    coupon: z.string().min(1).max(64).nullable().optional(),
    contact_email: z.string().email().max(320).nullable().optional(),
    turnstile_token: z.string().min(1).max(2048).optional(),
    legs: z
      .array(RepriceLegSchema)
      .min(1)
      .max(2)
      .refine(
        (legs) => new Set(legs.map((leg) => leg.leg_seq)).size === legs.length,
        { message: "duplicate leg_seq" },
      )
      .optional(),
  })
  .strict();

export type RepriceRequest = z.infer<typeof RepriceRequestSchema>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Walk the tree; return the first forbidden field name found, else null. */
function findForbiddenField(
  value: unknown,
  depth = 0,
): ForbiddenClientPriceField | null {
  if (depth > 8 || value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findForbiddenField(item, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (!isPlainObject(value)) return null;
  for (const key of Object.keys(value)) {
    if (
      (FORBIDDEN_CLIENT_PRICE_FIELDS as readonly string[]).includes(key)
    ) {
      return key as ForbiddenClientPriceField;
    }
    const hit = findForbiddenField(value[key], depth + 1);
    if (hit) return hit;
  }
  return null;
}

type ParseFailure = {
  ok: false;
  code: ParseQuoteFailureCode;
  field?: string;
};

function checkExtrasGuards(
  extras: ExtrasInput | undefined,
): ParseFailure | null {
  if (!extras) return null;

  if (extras.child_seats !== undefined) {
    if (extras.child_seats < 0 || extras.child_seats > 1) {
      return { ok: false, code: "extras_max_child_seats", field: "child_seats" };
    }
  }

  if (extras.extra_stops !== undefined) {
    if (extras.extra_stops < 0 || extras.extra_stops > 1) {
      return { ok: false, code: "extras_max_stops", field: "extra_stops" };
    }
  }

  // D-56 / D-18: count-only payload is legal; when waypoints ARE sent, lengths must match.
  if (extras.waypoints !== undefined) {
    const stops = extras.extra_stops ?? 0;
    if (extras.waypoints.length !== stops) {
      return { ok: false, code: "untrusted_input", field: "waypoints" };
    }
  }

  return null;
}

/**
 * Normalise widget mode tokens before the strict union (D-04).
 * Returns a failure for hourly; mutates nothing on other values.
 */
function preprocessMode(
  raw: Record<string, unknown>,
):
  | { ok: true; mode: QuoteMode }
  | { ok: false; code: ParseQuoteFailureCode; field?: string } {
  const mode = raw.mode;
  if (mode === undefined) {
    return { ok: false, code: "untrusted_input", field: "mode" };
  }
  if (mode === "hourly") {
    return { ok: false, code: "mode_not_offered", field: "mode" };
  }
  if (mode === "one-way") {
    return { ok: true, mode: "one_way" };
  }
  if (mode === "one_way" || mode === "return") {
    return { ok: true, mode };
  }
  return { ok: false, code: "untrusted_input", field: "mode" };
}

/**
 * Parse an untrusted quote body. Discriminated result only — no HTTP, no copy.
 */
export function parseQuoteRequest(body: unknown): ParseQuoteResult {
  if (!isPlainObject(body)) {
    return { ok: false, code: "untrusted_input" };
  }

  const forbidden = findForbiddenField(body);
  if (forbidden) {
    return { ok: false, code: "untrusted_input", field: forbidden };
  }

  const modeResult = preprocessMode(body);
  if (!modeResult.ok) {
    return modeResult;
  }

  const candidate = { ...body, mode: modeResult.mode };

  const parsed = QuoteBodySchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field =
      issue && issue.path.length > 0 ? String(issue.path[0]) : undefined;
    return { ok: false, code: "untrusted_input", field };
  }

  const value = parsed.data;

  // Legs count must match mode (one_way → 1, return → 2).
  if (value.mode === "one_way" && value.legs.length !== 1) {
    return { ok: false, code: "untrusted_input", field: "legs" };
  }
  if (value.mode === "return" && value.legs.length !== 2) {
    return { ok: false, code: "untrusted_input", field: "legs" };
  }

  const extrasFail = checkExtrasGuards(value.extras);
  if (extrasFail) return extrasFail;

  if (value.fare_kind !== undefined && parseFareKind(value.fare_kind) === null) {
    return { ok: false, code: "untrusted_input", field: "fare_kind" };
  }
  const fareKind: FareKind = parseFareKind(value.fare_kind) ?? "one_way";

  return { ok: true, value: { ...value, fare_kind: fareKind } };
}

/**
 * Parse a reprice body. Same refusal set as quote; places/pax/bags come from the lock.
 */
export function parseRepriceRequest(
  body: unknown,
):
  | { ok: true; value: RepriceRequest }
  | { ok: false; code: ParseQuoteFailureCode; field?: string } {
  if (!isPlainObject(body)) {
    return { ok: false, code: "untrusted_input" };
  }

  const forbidden = findForbiddenField(body);
  if (forbidden) {
    return { ok: false, code: "untrusted_input", field: forbidden };
  }

  // Reprice must not accept journey fields that belong on /api/quote only.
  // `legs` is allowed but narrowed to { leg_seq, flight_no } (26.1-30).
  for (const key of [
    "pax",
    "bags",
    "pickup",
    "dropoff",
    "mode",
    "hours",
    "fare_kind",
  ] as const) {
    if (key in body) {
      return { ok: false, code: "untrusted_input", field: key };
    }
  }

  const parsed = RepriceRequestSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field =
      issue && issue.path.length > 0 ? String(issue.path[0]) : undefined;
    return { ok: false, code: "untrusted_input", field };
  }

  const extrasFail = checkExtrasGuards(parsed.data.extras);
  if (extrasFail) return extrasFail;

  return { ok: true, value: parsed.data };
}
