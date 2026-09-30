// apps/web/lib/checkout/intent-schema.ts
//
// POST /api/checkout/intent request boundary. Quote-side fields follow
// 04-API-CONTRACT.md §6 / lib/quote/intent.ts IntentBody. Checkout-only
// fields (contact, locale, display_currency) live here.

import { z } from "zod";
import { parseTripQuery, type Trip } from "./trip-url";

const FORBIDDEN_SERVER_FIELDS = [
  "total_rappen",
  "distance_m",
  "rate_version_id",
  "lines",
  "expires_at",
] as const;

// 26.2-p4 D: no stop on the way — the strict object refuses the old stop fields.
const extrasSchema = z
  .object({
    child_seats: z.union([z.literal(0), z.literal(1)]).optional(),
    oversized_luggage: z.boolean().optional(),
  })
  .strict()
  .optional();

const CLASS_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function parseVehicleClass(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  return CLASS_SLUG.test(s) ? s : null;
}

const vehicleClassField = z.string().min(1).transform((value, ctx) => {
  const slug = parseVehicleClass(value);
  if (!slug) {
    ctx.addIssue({ code: "custom", message: "vehicle_class" });
    return z.NEVER;
  }
  return slug;
});

const couponField = z
  .string()
  .nullable()
  .optional()
  .transform((value) => {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  });

// D-08b / 26.1-30: the flight number shown at /checkout/details. Compared
// with the lock's leg-1 flight_no; a mismatch is price_changed, because the
// airport fee depends on it. Optional so an older client stays payable.
const flightNoField = z
  .string()
  .max(16)
  .nullable()
  .transform((value) => {
    const trimmed = value?.trim() ?? "";
    return trimmed.length > 0 ? trimmed : null;
  })
  .optional();

const contactField = z
  .object({
    name: z.string().min(1),
    email: z.string().min(1),
    phone: z.string().min(1),
  })
  .strict();

const localeField = z.enum(["en", "de", "fr", "ar"]);
const displayCurrencyField = z.enum(["CHF", "EUR", "USD", "AED"]);

const checkoutIntentObject = z
  .object({
    quote_id: z.string().uuid(),
    lock: z.string().min(1),
    vehicle_class: vehicleClassField,
    extras: extrasSchema,
    coupon: couponField,
    flight_no: flightNoField,
    contact: contactField,
    locale: localeField,
    display_currency: displayCurrencyField,
    // Required — Phase 4 D-57. Never .optional(). Never derived from quote_id.
    idempotency_key: z.string().min(1),
  })
  .strict();

const EXTRA_CODE = /^[a-z0-9_-]{1,64}$/;

/**
 * D-05 / D-15: the URL trip as the hosted Pay sends it. Validated by the one
 * parser (parseTripQuery); the intent then cross-checks when, pax, bags and
 * flight against the signed lock. Contact data has no place here.
 */
const tripField = z
  .object({
    from: z.string().nullable().optional(),
    fid: z.string().nullable().optional(),
    to: z.string().nullable().optional(),
    tid: z.string().nullable().optional(),
    gs: z.string().nullable().optional(),
    when: z.string().nullable().optional(),
    pax: z.number().int().nullable().optional(),
    bags: z.number().int().nullable().optional(),
    flight: z.string().max(16).nullable().optional(),
  })
  .strict()
  .transform((value, ctx): Trip => {
    const params = new URLSearchParams();
    for (const [key, raw] of Object.entries(value)) {
      if (raw == null || raw === "") continue;
      params.set(key, String(raw));
    }
    const parsed = parseTripQuery(params);
    if (parsed.errors.length > 0) {
      ctx.addIssue({ code: "custom", message: `trip.${parsed.errors[0]!.field}` });
      return z.NEVER;
    }
    return parsed.trip;
  });

/**
 * 26.5 D-12/D-13: the account choice at PAY. Absent = today's guest flow.
 * `consent` is the Text 1 tick and only counts for "create".
 */
const accountField = z
  .object({
    choice: z.enum(["guest", "create"]),
    consent: z.boolean(),
    turnstile_token: z.string().max(4096).optional(),
    idempotency_key: z.string().max(200).optional(),
    return_to: z.string().max(500).optional(),
  })
  .strict();

const webIntentObject = z
  .object({
    quote_id: z.string().uuid(),
    lock: z.string().min(1),
    vehicle_class: vehicleClassField,
    // D-35: every ticked extra, by exact code. The old three-code `extras`
    // object is refused here (strict).
    extra_codes: z
      .array(z.string().regex(EXTRA_CODE))
      .max(20)
      .optional()
      .transform((codes) => Array.from(new Set(codes ?? []))),
    coupon: couponField,
    flight_no: flightNoField,
    contact: contactField,
    locale: localeField,
    display_currency: displayCurrencyField,
    company_name: z.string().max(200).optional().default(""),
    company_address: z.string().max(400).optional().default(""),
    company_vat: z.string().max(40).optional().default(""),
    driver_note: z.string().max(500).optional().default(""),
    /** A BOOKING id (not a quote id): the unpaid booking this Pay replaces. */
    supersedes: z.string().uuid().optional(),
    trip: tripField,
    account: accountField.optional(),
    idempotency_key: z.string().min(1),
  })
  .strict();

export const checkoutIntentSchema = webIntentObject.superRefine((value, ctx) => {
  // Belt-and-braces over `.strict()`: name the five server-derived fields so a
  // probe is not a generic unrecognized-key failure. Do not delete this as
  // redundant — strict mode drops the name of the field.
  const record = value as Record<string, unknown>;
  for (const field of FORBIDDEN_SERVER_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      ctx.addIssue({
        code: "custom",
        message: `${field} is server-derived and must not be sent`,
        path: [field],
      });
    }
  }
});

/** The pay-link body (mode "pay_link"): the three-code `extras` object. */
export type CheckoutIntentRequest = z.infer<typeof checkoutIntentObject>;

/** The hosted-page Pay body (mode "web"). */
export type CheckoutWebIntentRequest = z.infer<typeof webIntentObject>;

export const checkoutPayLinkSchema = checkoutIntentObject
  .extend({
    billing_kind: z.enum(["individual", "company"]),
    company_name: z.string().max(200).optional().default(""),
    company_address: z.string().max(400).optional().default(""),
    company_vat: z.string().max(40).optional().default(""),
    payer_email: z.string().email(),
  })
  .strict();

export type CheckoutPayLinkRequest = z.infer<typeof checkoutPayLinkSchema>;
