// apps/web/lib/forms/schemas.ts
//
// SITE-04 zod contracts for POST /api/contact and /api/partner-application.
// Every string `max()` matches a column check in
// `packages/db/supabase/migrations/20260828000002_contact_forms.sql`.
// Pages (05-17 / 05-19) reuse these so client and server cannot disagree.

import { z } from "zod";
import { routing } from "@/i18n/routing";

const localeSchema = z.enum(routing.locales);
const idempotencyKey = z.string().uuid();
const turnstileToken = z.string().min(1);

export const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  phone: z.string().max(40).default(""),
  bookingRef: z.string().max(32).default(""),
  message: z.string().min(1).max(4000),
  locale: localeSchema,
  turnstileToken,
  idempotencyKey,
});

export const partnerApplicationSchema = z.object({
  name: z.string().min(1).max(200),
  city: z.string().min(1).max(200),
  phone: z.string().min(1).max(40),
  email: z.string().email(),
  vehicle: z.string().min(1).max(200),
  permit: z.string().min(1).max(200),
  acceptedTerms: z.literal(true),
  acceptedPrivacy: z.literal(true),
  locale: localeSchema,
  turnstileToken,
  idempotencyKey,
});

export type ContactInput = z.infer<typeof contactSchema>;
export type PartnerInput = z.infer<typeof partnerApplicationSchema>;
