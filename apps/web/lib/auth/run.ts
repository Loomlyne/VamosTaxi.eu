// apps/web/lib/auth/run.ts
//
// Supabase Auth calls shared by Server Actions and POST /api/auth.
// Never distinguishes "user exists" on signup/otp/reset (enumeration).

import type { AuthBanner } from "../../components/auth/types";
import { safeReturnTo } from "../account/return-to";
import { AUTH_LOCALE_METADATA_KEY } from "../supabase/constants";

export type AuthRunResult =
  | { stage: "form"; banner: AuthBanner }
  | { stage: "sent" }
  | { ok: true };

export type ProfileRunResult = { ok: true } | { ok: false; reason: string };

export type AuthError = { code?: string; message?: string } | null;

export type AuthClient = {
  auth: {
    signInWithPassword(args: {
      email: string;
      password: string;
    }): Promise<{ error: AuthError }>;
    signUp(args: {
      email: string;
      password: string;
      options?: {
        emailRedirectTo?: string;
        data?: Record<string, string>;
      };
    }): Promise<{ error: AuthError }>;
    signInWithOtp(args: {
      email: string;
      options?: {
        shouldCreateUser?: boolean;
        emailRedirectTo?: string;
        data?: Record<string, string>;
      };
    }): Promise<{ error: AuthError }>;
    resetPasswordForEmail(
      email: string,
      options: { redirectTo: string },
    ): Promise<{ error: AuthError }>;
    resend(args: {
      type: "signup";
      email: string;
      options?: { emailRedirectTo?: string };
    }): Promise<{ error: AuthError }>;
    signOut(): Promise<{ error: AuthError }>;
    getUser(): Promise<{ data: { user: unknown | null }; error: AuthError }>;
    updateUser(args: {
      password?: string;
      email?: string;
      data?: Record<string, string>;
    }): Promise<{ error: AuthError }>;
  };
};

export const FORM_CREDENTIALS: AuthRunResult = { stage: "form", banner: "credentials" };
export const SENT: AuthRunResult = { stage: "sent" };

/** base64url of a UTF-8 string; survives any number of URL decodes (no %, +, & or space in it). */
export function toBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function callbackUrl(origin: string, next: string): string {
  const url = new URL("/api/auth/callback", origin);
  // 26.5-07: a checkout return path carries a query full of %XX escapes ("Zurich%20Airport"). On the Worker a route
  // handler sees the URL with its query already decoded once, so the escape became a space, the target failed its
  // check and the customer landed on /checkout with no trip. Such a target travels as base64url instead.
  if (/[%+&#\s?]/.test(next)) url.searchParams.set("nextb", toBase64Url(next));
  else url.searchParams.set("next", next);
  return url.toString();
}

/**
 * Where an e-mail link lands after the callback (D-13): a validated checkout
 * returnTo (with its query) when given, otherwise `home`. Never off-site.
 */
export function emailNext(returnTo: unknown, home: string): string {
  return safeReturnTo(typeof returnTo === "string" ? returnTo : null) ?? home;
}

export function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export async function runSignInPassword(
  supabase: AuthClient,
  input: { email: string; password: string },
): Promise<{ result: AuthRunResult; reason: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  });
  if (error) return { result: FORM_CREDENTIALS, reason: error.code ?? "auth-failed" };
  return { result: { ok: true }, reason: null };
}

export async function runSignUpPassword(
  supabase: AuthClient,
  input: { email: string; password: string; firstName: string; lastName: string; locale: string },
  origin: string,
  home: string,
): Promise<{ result: AuthRunResult; reason: string | null }> {
  const { error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: callbackUrl(origin, home),
      data: {
        full_name: fullName(input.firstName, input.lastName),
        [AUTH_LOCALE_METADATA_KEY]: input.locale,
      },
    },
  });
  return { result: SENT, reason: error ? (error.code ?? "auth-failed") : null };
}

export async function runOtp(
  supabase: AuthClient,
  input: {
    mode: "signin" | "signup";
    email: string;
    locale: string;
    firstName?: string;
    lastName?: string;
    /** false on the staff dashboard: an e-mail link must never create a customer account there. */
    createUser?: boolean;
  },
  origin: string,
  home: string,
): Promise<{ result: AuthRunResult; reason: string | null }> {
  const data: Record<string, string> = { [AUTH_LOCALE_METADATA_KEY]: input.locale };
  if (input.mode === "signup") {
    data.full_name = fullName(input.firstName ?? "", input.lastName ?? "");
  }
  const { error } = await supabase.auth.signInWithOtp({
    email: input.email,
    options: {
      shouldCreateUser: input.createUser !== false,
      emailRedirectTo: callbackUrl(origin, home),
      data,
    },
  });
  return { result: SENT, reason: error ? (error.code ?? "auth-failed") : null };
}

/** Sends the sign-up confirmation mail again. Same answer for every address (enumeration). */
export async function runResendConfirmation(
  supabase: AuthClient,
  email: string,
  origin: string,
  home: string,
): Promise<{ result: AuthRunResult; reason: string | null }> {
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: callbackUrl(origin, home) },
  });
  return { result: SENT, reason: error ? (error.code ?? "auth-failed") : null };
}

export async function runPasswordReset(
  supabase: AuthClient,
  email: string,
  origin: string,
  resetPath: string,
): Promise<{ result: AuthRunResult; reason: string | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: callbackUrl(origin, resetPath),
  });
  return { result: SENT, reason: error ? (error.code ?? "auth-failed") : null };
}

export async function runSignOut(supabase: AuthClient): Promise<AuthRunResult> {
  await supabase.auth.getUser();
  await supabase.auth.signOut();
  return { ok: true };
}

export async function runUpdatePassword(
  supabase: AuthClient,
  password: string,
): Promise<{ result: AuthRunResult; reason: string | null }> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return { result: FORM_CREDENTIALS, reason: userError?.code ?? "no-user" };
  }
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { result: FORM_CREDENTIALS, reason: error.code ?? "auth-failed" };
  return { result: { ok: true }, reason: null };
}

export type ProfileFields =
  | { firstName: string; lastName: string }
  | { phone: string }
  | { email: string };

export function parseProfileFields(fields: Record<string, unknown>): ProfileFields | null {
  const firstName = typeof fields.firstName === "string" ? fields.firstName.trim() : "";
  const lastName = typeof fields.lastName === "string" ? fields.lastName.trim() : "";
  const phone = typeof fields.phone === "string" ? fields.phone.trim() : "";
  const emailRaw = typeof fields.email === "string" ? fields.email.trim() : "";
  if (firstName && lastName && firstName.length <= 80 && lastName.length <= 80) {
    return { firstName, lastName };
  }
  if (emailRaw && emailRaw.length <= 254 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(emailRaw)) {
    return { email: emailRaw };
  }
  const digits = phone.replace(/\D/g, "");
  if (phone && phone.length <= 32 && digits.length >= 9) {
    return { phone };
  }
  return null;
}

export async function runUpdateProfile(
  supabase: AuthClient,
  input: ProfileFields,
): Promise<{ result: ProfileRunResult; reason: string | null }> {
  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return { result: { ok: false, reason: "no-user" }, reason: userError?.code ?? "no-user" };
    }
    if ("email" in input) {
      const { error } = await supabase.auth.updateUser({ email: input.email });
      if (error) {
        return { result: { ok: false, reason: "auth-failed" }, reason: error.code ?? "auth-failed" };
      }
      return { result: { ok: true }, reason: null };
    }
    const data: Record<string, string> =
      "phone" in input
        ? { phone: input.phone }
        : {
            first_name: input.firstName,
            last_name: input.lastName,
            full_name: fullName(input.firstName, input.lastName),
          };
    const { error } = await supabase.auth.updateUser({ data });
    if (error) {
      return { result: { ok: false, reason: "auth-failed" }, reason: error.code ?? "auth-failed" };
    }
    return { result: { ok: true }, reason: null };
  } catch {
    return { result: { ok: false, reason: "throw" }, reason: "throw" };
  }
}
