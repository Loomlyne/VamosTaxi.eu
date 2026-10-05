// apps/web/lib/auth/actions.ts
//
// Server Actions for auth. This file is the one later plans (05-16) extend
// with sign-in / sign-up. Every action re-reads the session with getUser()
// and never trusts a client-supplied identity. signOutAction takes no
// argument (T-05-05).

"use server";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { headers } from "next/headers";
import { createNavigation } from "next-intl/navigation";
import { getLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import type { AuthBanner, AuthSubmitPayload } from "@/components/auth/types";
import { checkWriteRateLimit } from "@/lib/abuse/rate-limit";
import { recordSignupAgreement } from "./signup-agreement";
import { log } from "@/lib/logger";
import { verifyTurnstile } from "@/lib/turnstile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { trustedSiteOrigin } from "@/lib/security/origin";
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
  const originHeader = h.get("origin");
  if (originHeader) {
    try {
      const pinned = trustedSiteOrigin(new URL(originHeader).host);
      if (pinned) return pinned;
    } catch {
      /* fall through */
    }
  }
  return "https://vamostaxi.site";
}

/** Fail-open if the Workers rate-limit binding is missing (local next dev). */
async function authWriteAllowed(): Promise<boolean> {
  try {
    const { env } = getCloudflareContext();
    const h = await headers();
    const ip = h.get("cf-connecting-ip")?.trim() || "unknown";
    const limited = await checkWriteRateLimit({
      limiter: env.QUOTE_RATE_LIMITER_BARE,
      kind: "auth",
      ip,
    });
    return limited.ok;
  } catch {
    return true;
  }
}

/**
 * The "Verify you are human" check for the two actions that send mail to an address the visitor typed
 * (sign-up, forgot-password). Same helper, action name and hostname binding as the /api/auth route, so an
 * action posted straight at a Next route (Next-Action header) cannot get around the check on /sign-in.
 * Refuses on a missing or oversized token without asking Cloudflare; never throws.
 */
async function challengePassed(token: string | undefined): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;
  try {
    const { env } = getCloudflareContext();
    const bindings = env as unknown as Record<string, string | undefined>;
    const h = await headers();
    const challenge = await verifyTurnstile(env.TURNSTILE_SECRET_KEY ?? process.env.TURNSTILE_SECRET_KEY, token, {
      action: "account",
      idempotencyKey: crypto.randomUUID(),
      allowedHostnames:
        bindings.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES ?? process.env.CONTACT_TURNSTILE_ALLOWED_HOSTNAMES,
      remoteip: h.get("cf-connecting-ip") ?? undefined,
    });
    return challenge.ok;
  } catch {
    return false;
  }
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
  if (!(await authWriteAllowed())) return FORM_CREDENTIALS;

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
  challengeToken?: string,
): Promise<AuthActionResult> {
  const loc = localeSchema.safeParse(locale);
  const body = signUpPasswordSchema.safeParse(payload);
  if (!loc.success || !body.success) {
    authLog("signUpAction", loc.success ? loc.data : null, "invalid-input");
    return { stage: "sent" };
  }
  if (!(await authWriteAllowed())) return { stage: "sent" };
  // S5 (owner, 2026-10-05): no mail and no agreement record without a passed check. Fails closed with the
  // same neutral answer as the rate limit above, so a bot learns nothing about the address.
  if (!(await challengePassed(challengeToken))) {
    authLog("signUpAction", loc.data, "challenge-failed");
    return { stage: "sent" };
  }

  const { env } = getCloudflareContext();
  if (!(await recordSignupAgreement(env, { email: body.data.email, locale: loc.data, headers: await headers() }))) {
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
  challengeToken?: string,
): Promise<AuthActionResult> {
  const loc = localeSchema.safeParse(locale);
  const body = otpRequestSchema.safeParse(payload);
  if (!loc.success || !body.success) {
    authLog("requestOtpAction", loc.success ? loc.data : null, "invalid-input");
    return { stage: "sent" };
  }
  if (!(await authWriteAllowed())) return { stage: "sent" };

  if (body.data.mode === "signup") {
    // S5 (owner, 2026-10-05): the link sign-up makes an account and mails a confirmation, so it needs the same
    // check as the password sign-up. The link sign-IN below never creates an account (createUser false), so it
    // mails existing customers only and needs none.
    if (!(await challengePassed(challengeToken))) {
      authLog("requestOtpAction", loc.data, "challenge-failed");
      return { stage: "sent" };
    }
    const { env } = getCloudflareContext();
    if (!(await recordSignupAgreement(env, { email: body.data.email, locale: loc.data, headers: await headers() }))) {
      return { stage: "sent" };
    }
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
          // 26.2 audit: keep the number the schema accepted, as the password path does.
          phone: body.data.phone,
        }
      : { mode: "signin", email: body.data.email, locale: loc.data, createUser: false },
    origin,
    localizedHome(loc.data),
  );
  if (reason) authLog("requestOtpAction", loc.data, reason);
  return result;
}

export async function requestPasswordResetAction(
  email: string,
  locale: string,
  challengeToken?: string,
): Promise<AuthActionResult> {
  const loc = localeSchema.safeParse(locale);
  const body = resetEmailSchema.safeParse({ email });
  if (!loc.success || !body.success) {
    authLog("requestPasswordResetAction", loc.success ? loc.data : null, "invalid-input");
    return { stage: "sent" };
  }
  if (!(await authWriteAllowed())) return { stage: "sent" };
  // S5 (owner, 2026-10-05): same check as sign-up; refuses with the neutral answer, sends nothing.
  if (!(await challengePassed(challengeToken))) {
    authLog("requestPasswordResetAction", loc.data, "challenge-failed");
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
  if (!(await authWriteAllowed())) return FORM_CREDENTIALS;

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
