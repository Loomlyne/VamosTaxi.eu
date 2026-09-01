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
  })
  .strict();

export const signUpMagicSchema = z
  .object({
    mode: z.literal("signup"),
    method: z.literal("magic"),
    email: emailSchema,
    firstName: nameSchema,
    lastName: nameSchema,
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

export const otpRequestSchema = z.discriminatedUnion("mode", [
  signInMagicSchema,
  signUpMagicSchema,
]);
