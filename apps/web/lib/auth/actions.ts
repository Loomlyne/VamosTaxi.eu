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
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  localeSchema,
  otpRequestSchema,
  resetEmailSchema,
  signInPasswordSchema,
  signUpPasswordSchema,
  updatePasswordSchema,
} from "./schemas";
import {
  FORM_CREDENTIALS as RUN_CREDENTIALS,
  runOtp,
  runPasswordReset,
  runSignInPassword,
  runSignOut,
  runSignUpPassword,
  runUpdatePassword,
} from "./run";

const { redirect } = createNavigation(routing);

export type AuthActionResult =
  | { stage: "form"; banner: AuthBanner }
  | { stage: "sent" }
  | { ok: true };

const FORM_CREDENTIALS: AuthActionResult = RUN_CREDENTIALS;

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
  const { result, reason } = await runSignInPassword(supabase, body.data);
  if (reason) authLog("signInAction", loc.data, reason);
  if ("ok" in result) {
    redirect({ href: "/", locale: loc.data });
    throw new Error("unreachable");
  }
  return result;
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
  const { result, reason } = await runSignUpPassword(
    supabase,
    { ...body.data, locale: loc.data },
    origin,
    localizedHome(loc.data),
  );
  if (reason) authLog("signUpAction", loc.data, reason);
  return result;
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
  const { result, reason } = await runOtp(
    supabase,
    body.data.mode === "signup"
      ? {
          mode: "signup",
          email: body.data.email,
          locale: loc.data,
          firstName: body.data.firstName,
          lastName: body.data.lastName,
        }
      : { mode: "signin", email: body.data.email, locale: loc.data },
    origin,
    localizedHome(loc.data),
  );
  if (reason) authLog("requestOtpAction", loc.data, reason);
  return result;
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
  const { result, reason } = await runPasswordReset(
    supabase,
    body.data.email,
    origin,
    localizedPath("/reset-password", loc.data),
  );
  if (reason) authLog("requestPasswordResetAction", loc.data, reason);
  return result;
}

export async function updatePasswordAction(password: string): Promise<AuthActionResult> {
  const body = updatePasswordSchema.safeParse({ password });
  if (!body.success) {
    authLog("updatePasswordAction", null, "invalid-input");
    return FORM_CREDENTIALS;
  }

  const supabase = await createServerSupabaseClient();
  const { result, reason } = await runUpdatePassword(supabase, body.data.password);
  if (reason) authLog("updatePasswordAction", null, reason);
  return result;
}

export async function signOutAction(): Promise<never> {
  const supabase = await createServerSupabaseClient();
  await runSignOut(supabase);
  const locale = await getLocale();
  redirect({ href: "/", locale });
  throw new Error("unreachable");
}
