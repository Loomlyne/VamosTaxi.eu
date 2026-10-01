// apps/web/lib/auth/schemas.ts
//
// Zod boundary for auth Server Actions. Mirrors AuthSubmitPayload plus the
// email-only reset and password-update shapes. The 8-character minimum the
// form enforces client-side is restated here as the enforcing control.

import { z } from "zod";
import { routing } from "@/i18n/routing";

const LOCALES = routing.locales;

export const localeSchema = z.enum(LOCALES);

export const emailSchema = z.string().trim().email().max(254);
export const passwordSchema = z.string().min(8).max(256);
const nameSchema = z.string().trim().min(1).max(80);

/**
 * 27.1: the optional mobile number on /sign-up and on the finish step. Same rule as the account
 * page's phone (`parseProfileFields`): at most 32 characters, at least 9 digits.
 */
export const phoneSchema = z
  .string()
  .trim()
  .max(32)
  .refine((v) => v.replace(/\D/g, "").length >= 9);

export const signInPasswordSchema = z
  .object({
    mode: z.literal("signin"),
    method: z.literal("password"),
    email: emailSchema,
    password: passwordSchema,
  })
  .strict();

export const signInMagicSchema = z
  .object({
    mode: z.literal("signin"),
    method: z.literal("magic"),
    email: emailSchema,
  })
  .strict();

export const signUpPasswordSchema = z
  .object({
    mode: z.literal("signup"),
    method: z.literal("password"),
    email: emailSchema,
    password: passwordSchema,
    firstName: nameSchema,
    lastName: nameSchema,
    phone: phoneSchema.optional(),
    /** 27 D-03a: the account-agreement tick; a sign-up without it is refused. */
    consent: z.literal(true),
  })
  .strict();

export const signUpMagicSchema = z
  .object({
    mode: z.literal("signup"),
    method: z.literal("magic"),
    email: emailSchema,
    firstName: nameSchema,
    lastName: nameSchema,
    phone: phoneSchema.optional(),
    consent: z.literal(true),
  })
  .strict();

export const forgotSchema = z
  .object({
    mode: z.literal("forgot"),
    email: emailSchema,
  })
  .strict();

export const resetEmailSchema = z
  .object({
    email: emailSchema,
  })
  .strict();

export const updatePasswordSchema = z
  .object({
    password: passwordSchema,
  })
  .strict();

/** Checkout "sign-in link" send (26.5-03): existing customers only, behind Turnstile, never creates an account. */
export const checkoutSignInSchema = z
  .object({
    mode: z.literal("signin"),
    method: z.literal("magic"),
    email: emailSchema,
    origin: z.literal("checkout"),
    turnstileToken: z.string().min(1),
    idempotencyKey: z.string().max(100).optional(),
  })
  .strict();

/** 27.1 (27 D-37): the finish step. The e-mail is never taken from the client; it is the session's own. */
export const finishAccountSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    phone: phoneSchema.optional(),
    consent: z.literal(true),
  })
  .strict();

export const otpRequestSchema = z.discriminatedUnion("mode", [
  signInMagicSchema,
  signUpMagicSchema,
]);

/** E-mail code sign-in: six digits, spaces allowed while typing ("123 456"). */
export const verifyCodeSchema = z
  .object({
    email: emailSchema,
    code: z
      .string()
      .transform((value) => value.replace(/\s+/g, ""))
      .pipe(z.string().regex(/^\d{6}$/)),
  })
  .strict();

export const resendConfirmationSchema = z.object({ email: emailSchema }).strict();
