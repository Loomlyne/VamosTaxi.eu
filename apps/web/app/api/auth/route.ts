// POST /api/auth — JSON surface for the DC mock (Server Actions stay on the React forms).
// Cookies are set by @supabase/ssr via createServerSupabaseClient.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { routing } from "@/i18n/routing";
import { customerClaims } from "@/lib/account/session";
import { log } from "@/lib/logger";
import {
  localeSchema,
  otpRequestSchema,
  resetEmailSchema,
  signInPasswordSchema,
  signUpPasswordSchema,
  updatePasswordSchema,
} from "@/lib/auth/schemas";
import {
  FORM_CREDENTIALS,
  parseProfileFields,
  runOtp,
  runPasswordReset,
  runSignInPassword,
  runSignOut,
  runSignUpPassword,
  runUpdatePassword,
  runUpdateProfile,
  SENT,
  type AuthRunResult,
  type ProfileRunResult,
} from "@/lib/auth/run";
import { asCustomer } from "@/lib/db/identity";
import {
  recordConsent,
  type ConsentLocale,
  type ConsentMethod,
} from "@/lib/consent/bind";
import { mintConsentSubject, readConsentSubject } from "@/lib/consent/cookie";
import { cfConnectingIp, truncateClientIp } from "@/lib/consent/ip";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function json(result: AuthRunResult | ProfileRunResult, status = 200): Response {
  return Response.json(result, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function localizedHome(locale: string): string {
  return locale === routing.defaultLocale ? "/" : `/${locale}`;
}

function localizedPath(path: string, locale: string): string {
  if (locale === routing.defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwarded = request.headers.get("x-forwarded-host");
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  if (forwarded) return `${proto}://${forwarded}`;
  return url.origin;
}

const CONSENT_LOCALES = new Set<ConsentLocale>(["en", "de", "fr", "ar"]);

async function appendSignupConsent(
  request: Request,
  locale: string,
  ctx: { requestId: string; route: string; locale: string | null },
): Promise<void> {
  const existing = readConsentSubject(request.headers.get("cookie"));
  const subject = existing ?? mintConsentSubject();
  const method: ConsentMethod = existing ? "settings_change" : "reject_all";
  const consentLocale: ConsentLocale = CONSENT_LOCALES.has(locale as ConsentLocale)
    ? (locale as ConsentLocale)
    : "en";
  const claims = await customerClaims(request);
  if (!claims) {
    log("warn", "auth", ctx, { reason: "consent-no-session" });
    return;
  }
  try {
    const { env } = getCloudflareContext();
    await asCustomer(env, claims, async (tx) => {
      await recordConsent(tx, {
        subject,
        method,
        locale: consentLocale,
        userAgent: request.headers.get("user-agent"),
        ipTruncated: truncateClientIp(cfConnectingIp(request.headers)),
      });
    });
  } catch {
    log("error", "auth", ctx, { reason: "consent-write" });
  }
}

export async function POST(request: Request): Promise<Response> {
  const ctx = { requestId: crypto.randomUUID(), route: "/api/auth", locale: null as string | null };

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return json(FORM_CREDENTIALS, 400);
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return json(FORM_CREDENTIALS, 400);
  }
  const body = raw as Record<string, unknown>;
  const { locale: localeRaw, action, ...fields } = body;

  const locParsed = localeSchema.safeParse(typeof localeRaw === "string" ? localeRaw : "en");
  const locale = locParsed.success ? locParsed.data : routing.defaultLocale;
  ctx.locale = locale;

  const origin = requestOrigin(request);
  const supabase = await createServerSupabaseClient(request);

  if (action === "signout") {
    await runSignOut(supabase);
    return json({ ok: true });
  }

  if (action === "update-password") {
    const parsed = updatePasswordSchema.safeParse({ password: fields.password });
    if (!parsed.success) return json(FORM_CREDENTIALS);
    const { result, reason } = await runUpdatePassword(supabase, parsed.data.password);
    if (reason) log("error", "auth", ctx, { reason, action: "update-password" });
    return json(result);
  }

  if (action === "update-profile") {
    const parsed = parseProfileFields(fields);
    if (!parsed) return json({ ok: false, reason: "invalid" });
    try {
      const { result, reason } = await runUpdateProfile(supabase, parsed);
      if (reason) log("error", "auth", ctx, { reason, action: "update-profile" });
      return json(result);
    } catch {
      log("error", "auth", ctx, { reason: "throw", action: "update-profile" });
      return json({ ok: false, reason: "throw" });
    }
  }

  if (action === "passkey-start") {
    const { data, error } = await supabase.auth.passkey.startAuthentication();
    if (error || !data) {
      if (error) log("error", "auth", ctx, { reason: error.code ?? "passkey-start", action: "passkey-start" });
      return json(FORM_CREDENTIALS);
    }
    return Response.json(
      { challenge_id: data.challenge_id, options: data.options },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (action === "passkey-verify") {
    const challengeId = typeof fields.challengeId === "string" ? fields.challengeId : "";
    const credential = fields.credential;
    if (!challengeId || !credential || typeof credential !== "object") return json(FORM_CREDENTIALS);
    const { data, error } = await supabase.auth.passkey.verifyAuthentication({
      challengeId,
      credential: credential as never,
    });
    if (error || !data?.session) {
      if (error) log("error", "auth", ctx, { reason: error.code ?? "passkey-verify", action: "passkey-verify" });
      return json(FORM_CREDENTIALS);
    }
    return json({ ok: true });
  }

  if (action === "passkey-register-start") {
    const { data, error } = await supabase.auth.passkey.startRegistration();
    if (error || !data) {
      if (error) log("error", "auth", ctx, { reason: error.code ?? "passkey-register-start", action: "passkey-register-start" });
      return json(FORM_CREDENTIALS);
    }
    return Response.json(
      { challenge_id: data.challenge_id, options: data.options },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  if (action === "passkey-register-verify") {
    const challengeId = typeof fields.challengeId === "string" ? fields.challengeId : "";
    const credential = fields.credential;
    if (!challengeId || !credential || typeof credential !== "object") return json(FORM_CREDENTIALS);
    const { error } = await supabase.auth.passkey.verifyRegistration({
      challengeId,
      credential: credential as never,
    });
    if (error) {
      log("error", "auth", ctx, { reason: error.code ?? "passkey-register-verify", action: "passkey-register-verify" });
      return json(FORM_CREDENTIALS);
    }
    return json({ ok: true });
  }

  if (fields.mode === "forgot") {
    const parsed = resetEmailSchema.safeParse({ email: fields.email });
    if (!parsed.success) return json(SENT);
    const { result, reason } = await runPasswordReset(
      supabase,
      parsed.data.email,
      origin,
      localizedPath("/reset-password", locale),
    );
    if (reason) log("error", "auth", ctx, { reason, action: "reset" });
    return json(result);
  }

  if (fields.method === "magic") {
    const parsed = otpRequestSchema.safeParse(fields);
    if (!parsed.success) return json(SENT);
    const { result, reason } = await runOtp(
      supabase,
      parsed.data.mode === "signup"
        ? {
            mode: "signup",
            email: parsed.data.email,
            locale,
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
          }
        : { mode: "signin", email: parsed.data.email, locale },
      origin,
      localizedHome(locale),
    );
    if (reason) log("error", "auth", ctx, { reason, action: "otp" });
    if (!reason && parsed.data.mode === "signup") {
      await appendSignupConsent(request, locale, ctx);
    }
    return json(result);
  }

  if (fields.mode === "signup") {
    const parsed = signUpPasswordSchema.safeParse(fields);
    if (!parsed.success) return json(SENT);
    const { result, reason } = await runSignUpPassword(
      supabase,
      { ...parsed.data, locale },
      origin,
      localizedHome(locale),
    );
    if (reason) log("error", "auth", ctx, { reason, action: "signup" });
    if (!reason) await appendSignupConsent(request, locale, ctx);
    return json(result);
  }

  const parsed = signInPasswordSchema.safeParse(fields);
  if (!parsed.success) return json(FORM_CREDENTIALS);
  const { result, reason } = await runSignInPassword(supabase, parsed.data);
  if (reason) log("error", "auth", ctx, { reason, action: "signin" });
  return json(result);
}
