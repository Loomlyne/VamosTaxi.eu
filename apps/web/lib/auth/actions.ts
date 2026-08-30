// apps/web/lib/auth/actions.ts
//
// Server Actions for auth. This file is the one later plans (05-16) extend
// with sign-in / sign-up. Every action re-reads the session with getUser()
// and never trusts a client-supplied identity. signOutAction takes no
// argument (T-05-05).

"use server";

import { headers } from "next/headers";
import { createNavigation } from "next-intl/navigation";
import { getLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import type { AuthBanner, AuthSubmitPayload } from "@/components/auth/types";
import { log } from "@/lib/logger";
import { AUTH_LOCALE_METADATA_KEY } from "@/lib/supabase/constants";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  localeSchema,
  otpRequestSchema,
  resetEmailSchema,
  signInPasswordSchema,
  signUpPasswordSchema,
  updatePasswordSchema,
} from "./schemas";

const { redirect } = createNavigation(routing);

export type AuthActionResult =
  | { stage: "form"; banner: AuthBanner }
  | { stage: "sent" }
  | { ok: true };

const FORM_CREDENTIALS: AuthActionResult = { stage: "form", banner: "credentials" };

function authLog(action: string, locale: string | null, reason: string): void {
  log("error", "auth", { requestId: crypto.randomUUID(), route: action, locale }, { reason });
}

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "127.0.0.1:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("127.") || host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function localizedHome(locale: string): string {
  return locale === routing.defaultLocale ? "/" : `/${locale}`;
}

function localizedPath(path: string, locale: string): string {
  if (locale === routing.defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

function callbackUrl(origin: string, next: string): string {
  const url = new URL("/api/auth/callback", origin);
  url.searchParams.set("next", next);
  return url.toString();
}

function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export async function signInAction(
  payload: AuthSubmitPayload,
  locale: string,
): Promise<AuthActionResult> {
  const loc = localeSchema.safeParse(locale);
  const body = signInPasswordSchema.safeParse(payload);
  if (!loc.success || !body.success) {
    authLog("signInAction", loc.success ? loc.data : null, "invalid-input");
    return FORM_CREDENTIALS;
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: body.data.email,
    password: body.data.password,
  });
  if (error) {
    authLog("signInAction", loc.data, error.code ?? "auth-failed");
    return FORM_CREDENTIALS;
  }

  redirect({ href: "/", locale: loc.data });
  throw new Error("unreachable");
}

export async function signUpAction(
  payload: AuthSubmitPayload,
  locale: string,
): Promise<AuthActionResult> {
  const loc = localeSchema.safeParse(locale);
  const body = signUpPasswordSchema.safeParse(payload);
  if (!loc.success || !body.success) {
    authLog("signUpAction", loc.success ? loc.data : null, "invalid-input");
    return { stage: "sent" };
  }

  const origin = await requestOrigin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signUp({
    email: body.data.email,
    password: body.data.password,
    options: {
      emailRedirectTo: callbackUrl(origin, localizedHome(loc.data)),
      data: {
        full_name: fullName(body.data.firstName, body.data.lastName),
        [AUTH_LOCALE_METADATA_KEY]: loc.data,
      },
    },
  });
  if (error) {
    authLog("signUpAction", loc.data, error.code ?? "auth-failed");
  }
  return { stage: "sent" };
}

export async function requestOtpAction(
  payload: AuthSubmitPayload,
  locale: string,
): Promise<AuthActionResult> {
  const loc = localeSchema.safeParse(locale);
  const body = otpRequestSchema.safeParse(payload);
  if (!loc.success || !body.success) {
    authLog("requestOtpAction", loc.success ? loc.data : null, "invalid-input");
    return { stage: "sent" };
  }

  const origin = await requestOrigin();
  const supabase = await createServerSupabaseClient();
  const data: Record<string, string> = {
    [AUTH_LOCALE_METADATA_KEY]: loc.data,
  };
  if (body.data.mode === "signup") {
    data.full_name = fullName(body.data.firstName, body.data.lastName);
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: body.data.email,
    options: {
      shouldCreateUser: body.data.mode === "signup",
      emailRedirectTo: callbackUrl(origin, localizedHome(loc.data)),
      data,
    },
  });
  if (error) {
    authLog("requestOtpAction", loc.data, error.code ?? "auth-failed");
  }
  return { stage: "sent" };
}

export async function requestPasswordResetAction(
  email: string,
  locale: string,
): Promise<AuthActionResult> {
  const loc = localeSchema.safeParse(locale);
  const body = resetEmailSchema.safeParse({ email });
  if (!loc.success || !body.success) {
    authLog("requestPasswordResetAction", loc.success ? loc.data : null, "invalid-input");
    return { stage: "sent" };
  }

  const origin = await requestOrigin();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(body.data.email, {
    redirectTo: callbackUrl(origin, localizedPath("/reset-password", loc.data)),
  });
  if (error) {
    authLog("requestPasswordResetAction", loc.data, error.code ?? "auth-failed");
  }
  return { stage: "sent" };
}

export async function updatePasswordAction(password: string): Promise<AuthActionResult> {
  const body = updatePasswordSchema.safeParse({ password });
  if (!body.success) {
    authLog("updatePasswordAction", null, "invalid-input");
    return FORM_CREDENTIALS;
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    authLog("updatePasswordAction", null, userError?.code ?? "no-user");
    return FORM_CREDENTIALS;
  }

  const { error } = await supabase.auth.updateUser({ password: body.data.password });
  if (error) {
    authLog("updatePasswordAction", null, error.code ?? "auth-failed");
    return FORM_CREDENTIALS;
  }
  return { ok: true };
}

export async function signOutAction(): Promise<never> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.getUser();
  await supabase.auth.signOut();
  const locale = await getLocale();
  redirect({ href: "/", locale });
  throw new Error("unreachable");
}
