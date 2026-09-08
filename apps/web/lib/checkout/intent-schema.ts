// apps/web/lib/checkout/intent-schema.ts
//
// POST /api/checkout/intent request boundary. Quote-side fields follow
// 04-API-CONTRACT.md §6 / lib/quote/intent.ts IntentBody. Checkout-only
// fields (contact, locale, display_currency) live here.

import { z } from "zod";

const FORBIDDEN_SERVER_FIELDS = [
  "total_rappen",
  "distance_m",
  "rate_version_id",
  "lines",
  "expires_at",
] as const;

const extrasSchema = z
  .object({
    child_seats: z.union([z.literal(0), z.literal(1)]).optional(),
    extra_stops: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
    oversized_luggage: z.boolean().optional(),
    waypoints: z
      .array(
        z
          .object({
            lng: z.number().finite(),
            lat: z.number().finite(),
            text: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
  })
  .strict()
  .optional();

const checkoutIntentObject = z
  .object({
    quote_id: z.string().uuid(),
    lock: z.string().min(1),
    vehicle_class: z.enum(["economy", "business", "first", "van"]),
    extras: extrasSchema,
    coupon: z.string().min(1).nullable().optional(),
    contact: z
      .object({
        name: z.string().min(1),
        email: z.string().min(1),
        phone: z.string().min(1),
      })
      .strict(),
    locale: z.enum(["en", "de", "fr", "ar"]),
    display_currency: z.enum(["CHF", "EUR", "USD", "AED"]),
    // Required — Phase 4 D-57. Never .optional(). Never derived from quote_id.
    idempotency_key: z.string().min(1),
  })
  .strict();

export const checkoutIntentSchema = checkoutIntentObject.superRefine((value, ctx) => {
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

export type CheckoutIntentRequest = z.infer<typeof checkoutIntentObject>;

export const checkoutPayLinkSchema = checkoutIntentObject
  .extend({
    billing_kind: z.enum(["individual", "company"]),
    company_name: z.string().max(200).optional().default(""),
    company_address: z.string().max(400).optional().default(""),
    company_vat: z.string().max(40).optional().default(""),
    payer_email: z.string().email(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.billing_kind !== "company") return;
    if (!value.company_name.trim() || !value.company_address.trim() || !value.company_vat.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "company fields required",
        path: ["company_name"],
      });
    }
  });

export type CheckoutPayLinkRequest = z.infer<typeof checkoutPayLinkSchema>;
