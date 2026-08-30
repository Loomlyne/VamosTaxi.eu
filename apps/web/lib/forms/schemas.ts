// apps/web/lib/forms/schemas.ts
//
// SITE-04 zod contract for POST /api/contact.
// Every string `max()` matches a column check in
// `packages/db/supabase/migrations/20260828000002_contact_forms.sql`.
// The contact page (05-17) reuses this so client and server cannot disagree.

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

export type ContactInput = z.infer<typeof contactSchema>;
