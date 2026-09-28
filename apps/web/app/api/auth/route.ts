// POST /api/auth — JSON surface for the DC mock (Server Actions stay on the React forms).
// Session cookies are copied onto this JSON response. next/headers cookies().set
// does not attach to a hand-built Response on the Worker.

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { routing } from "@/i18n/routing";
import { customerClaims } from "@/lib/account/session";
import { checkWriteRateLimit } from "@/lib/abuse/rate-limit";
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
import {
  checkCodeAttemptLimit,
  enrolTotp,
  listFactors,
  passwordSignInRefused,
  staffMfaAccess,
  stepUpTotp,
  unenrolFactor,
  verifyTotpEnrolment,
  type MfaClient,
  type SignInMethod,
} from "@/lib/auth/staff-mfa";
import {
  clearReauthCookie,
  mintReauthCookie,
  reauthGate,
  reauthSecret,
  recentRecovery,
  sendReauthCode,
  verifyOwnPassword,
  verifyReauthCode,
} from "@/lib/auth/reauth";
import {
  parseSignInMethod,
  readOwnSignInMethod,
  setOwnSignInMethod,
} from "@/lib/auth/staff-sign-in-method";
import { asCustomer } from "@/lib/db/identity";
import { getStaffClaims, type StaffAuthClient } from "@/lib/ops/session";
import {
  recordConsent,
  type ConsentLocale,
  type ConsentMethod,
} from "@/lib/consent/bind";
import { mintConsentSubject, readConsentSubject } from "@/lib/consent/cookie";
import { cfConnectingIp, truncateClientIp } from "@/lib/consent/ip";
import {
  authSetCookieHeader,
  createIsolatedSupabaseClient,
  createServerSupabaseClient,
  type AuthSetCookie,
} from "@/lib/supabase/server";
import { csrfForbidden, trustedSiteOrigin } from "@/lib/security/origin";

export const dynamic = "force-dynamic";

function json(
  result: AuthRunResult | ProfileRunResult,
  status = 200,
  setCookies?: readonly string[],
): Response {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  for (const cookie of setCookies ?? []) headers.append("Set-Cookie", cookie);
  return Response.json(result, { status, headers });
}

function sessionJson(
  result: AuthRunResult | ProfileRunResult,
  cookies: readonly AuthSetCookie[],
  status = 200,
): Response {
  return json(result, status, cookies.map(authSetCookieHeader));
}

/** JSON for the staff sign-in-options actions; same no-store + Set-Cookie copy as sessionJson. */
function staffJson(
  body: Record<string, unknown>,
  cookies: readonly AuthSetCookie[] = [],
  status = 200,
  extraCookies: readonly string[] = [],
): Response {
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  for (const cookie of cookies) headers.append("Set-Cookie", authSetCookieHeader(cookie));
  for (const cookie of extraCookies) headers.append("Set-Cookie", cookie);
  return Response.json(body, { status, headers });
}

/** The admin sign-in-options actions (D-16a / D-17). */
function isStaffSignInOptionAction(action: unknown): action is string {
  return (
    typeof action === "string" &&
    (action.startsWith("mfa-") || action.startsWith("reauth-") || action === "set-sign-in-method")
  );
}

function mfaStatus(code: string): number {
  if (code === "reauth-required" || code === "reauth-unavailable" || code === "mfa-aal2-required") {
    return 403;
  }
  if (code === "rate_limited") return 429;
  return 200;
}

function localizedHome(locale: string): string {
  return locale === routing.defaultLocale ? "/" : `/${locale}`;
}

function localizedPath(path: string, locale: string): string {
  if (locale === routing.defaultLocale) return path;
  return path === "/" ? `/${locale}` : `/${locale}${path}`;
}

function requestOrigin(request: Request): string {
  return trustedSiteOrigin(new URL(request.url).host) ?? "https://vamostaxi.site";
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
  const blocked = csrfForbidden(request, "auth");
  if (blocked) return blocked;
  const ctx = { requestId: crypto.randomUUID(), route: "/api/auth", locale: null as string | null };

  const { env } = getCloudflareContext();
  const ip = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
  const limited = await checkWriteRateLimit({
    limiter: env.QUOTE_RATE_LIMITER_BARE,
    kind: "auth",
    ip,
  });
  if (!limited.ok) return json(FORM_CREDENTIALS, 429);

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
  const setCookies: AuthSetCookie[] = [];
  const supabase = await createServerSupabaseClient(request, { cookies: setCookies });

  /** Signs the new session out and answers the generic credentials error (T-26.1-70). */
  const refuseSignIn = async (): Promise<Response> => {
    const from = setCookies.length;
    await runSignOut(supabase);
    // Only the sign-out's cookie removals go back — never the session just refused.
    return sessionJson(FORM_CREDENTIALS, setCookies.slice(from));
  };

  /**
   * D-17: a staff session changing its password or e-mail needs a fresh re-auth.
   * Customers are not gated here. `allowRecovery` lets the reset-password flow
   * through when the session itself came from a recovery link in the last 5 min.
   */
  const staffChangeGate = async (allowRecovery: boolean): Promise<Response | null> => {
    const staff = await getStaffClaims(supabase as StaffAuthClient);
    if (!staff?.app_metadata?.vamos_role) return null;
    if (allowRecovery) {
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (recentRecovery(aal.data?.currentAuthenticationMethods)) return null;
    }
    const fresh = await reauthGate({
      secret: reauthSecret(env),
      cookieHeader: request.headers.get("cookie"),
      userId: staff.sub,
      sessionId: staff.session_id,
    });
    return fresh.ok ? null : staffJson(fresh, [], 403);
  };

  if (action === "signout") {
    await runSignOut(supabase);
    return json({ ok: true }, 200, [...setCookies.map(authSetCookieHeader), clearReauthCookie()]);
  }

  if (action === "update-password") {
    const parsed = updatePasswordSchema.safeParse({ password: fields.password });
    if (!parsed.success) return json(FORM_CREDENTIALS);
    const blockedChange = await staffChangeGate(true);
    if (blockedChange) return blockedChange;
    const { result, reason } = await runUpdatePassword(supabase, parsed.data.password);
    if (reason) log("error", "auth", ctx, { reason, action: "update-password" });
    return json(result);
  }

  if (action === "update-profile") {
    const parsed = parseProfileFields(fields);
    if (!parsed) return json({ ok: false, reason: "invalid" });
    if ("email" in parsed) {
      const blockedChange = await staffChangeGate(false);
      if (blockedChange) return blockedChange;
    }
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

  if (isStaffSignInOptionAction(action)) {
    // D-16a: admin only. Deliberately not requireStaffClaims — the step-up has to
    // work while the session is still aal1.
    const access = staffMfaAccess(await getStaffClaims(supabase as StaffAuthClient));
    if (!access.ok) return staffJson({ ok: false, code: access.code }, [], access.status);
    const claims = access.claims;
    const mfa: MfaClient = supabase;
    const secret = reauthSecret(env);
    const cookieHeader = request.headers.get("cookie");
    const gate = () =>
      reauthGate({ secret, cookieHeader, userId: claims.sub, sessionId: claims.session_id });

    if (action === "mfa-status") {
      const status = await listFactors(mfa);
      if (!status.ok) {
        log("error", "auth", ctx, { reason: status.code, action });
        return staffJson(status);
      }
      let signInMethod: SignInMethod | null = null;
      try {
        signInMethod = await readOwnSignInMethod(env, claims);
      } catch {
        log("error", "auth", ctx, { reason: "sign-in-method-unreadable", action });
      }
      return staffJson({
        ok: true,
        totp: status.totp,
        totpFactorId: status.totpFactorId,
        passkey: status.passkey,
        signInMethod,
      });
    }

    if (action === "mfa-totp-enroll") {
      // D-17b: adding a factor needs the same fresh re-auth as removing one.
      const out = await enrolTotp(mfa, { reauth: await gate() });
      if (!out.ok) log(mfaStatus(out.code) === 403 ? "warn" : "error", "auth", ctx, { reason: out.code, action });
      // The secret is returned once, to the enrolling admin only (T-26.1-71). Never logged.
      return staffJson(out, setCookies, mfaStatus(out.ok ? "" : out.code));
    }

    if (action === "set-sign-in-method") {
      const method = parseSignInMethod(fields.method);
      if (!method) return staffJson({ ok: false, code: "sign-in-method-invalid" }, [], 400);
      const fresh = await gate();
      if (!fresh.ok) return staffJson(fresh, [], 403);
      try {
        await setOwnSignInMethod(env, claims, method);
      } catch {
        log("error", "auth", ctx, { reason: "sign-in-method-write", action });
        return staffJson({ ok: false, code: "sign-in-method-failed" });
      }
      return staffJson({ ok: true, signInMethod: method });
    }

    if (action === "mfa-unenroll") {
      const out = await unenrolFactor(mfa, {
        factorId: fields.factorId,
        aal: claims.aal,
        reauth: await gate(),
      });
      if (!out.ok) log("warn", "auth", ctx, { reason: out.code, action });
      return staffJson(out, setCookies, mfaStatus(out.ok ? "" : out.code));
    }

    // Everything below checks a code or a password: per-account attempt limit on
    // top of the per-IP one (T-26.1-69).
    if (!(await checkCodeAttemptLimit(env.QUOTE_RATE_LIMITER_BARE, claims.sub))) {
      return staffJson({ ok: false, code: "rate_limited" }, [], 429);
    }

    if (action === "mfa-totp-verify") {
      const out = await verifyTotpEnrolment(mfa, { factorId: fields.factorId, code: fields.code });
      if (!out.ok) log("warn", "auth", ctx, { reason: out.code, action });
      return staffJson(out, setCookies, mfaStatus(out.ok ? "" : out.code));
    }

    if (action === "mfa-step-up") {
      const out = await stepUpTotp(mfa, fields.code);
      if (!out.ok) {
        log("warn", "auth", ctx, { reason: out.code, action });
        return staffJson(out, setCookies);
      }
      // aal2 now, so the staff row is readable: a password session on a
      // magic_link account is refused here too (a factor hides the row at aal1).
      const aal = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      let method: SignInMethod | null;
      try {
        method = await readOwnSignInMethod(env, { ...claims, aal: "aal2" });
      } catch {
        log("error", "auth", ctx, { reason: "sign-in-method-unreadable", action });
        return refuseSignIn();
      }
      if (passwordSignInRefused(method, aal.data?.currentAuthenticationMethods)) {
        return refuseSignIn();
      }
      // The refreshed aal2 auth cookies ride on this response.
      return staffJson({ ok: true }, setCookies);
    }

    if (action.startsWith("reauth-")) {
      if (!secret) return staffJson({ ok: false, code: "reauth-unavailable" }, [], 403);
      let proven = false;
      let sessionId = claims.session_id;

      if (action === "reauth-code-send") {
        const sent = await sendReauthCode(createIsolatedSupabaseClient(), claims.email);
        if (!sent) log("error", "auth", ctx, { reason: "reauth-code-send", action });
        return staffJson(sent ? { ok: true } : { ok: false, code: "reauth-send-failed" });
      }

      if (action === "reauth-password") {
        let method: SignInMethod | null;
        try {
          method = await readOwnSignInMethod(env, claims);
        } catch {
          log("error", "auth", ctx, { reason: "sign-in-method-unreadable", action });
          return staffJson({ ok: false, code: "reauth-failed" });
        }
        // A magic_link account re-authenticates with the e-mail code, not a password.
        if (method !== "magic_link") {
          proven = await verifyOwnPassword(createIsolatedSupabaseClient(), claims.email, fields.password);
        }
      } else if (action === "reauth-code-verify") {
        proven = await verifyReauthCode(createIsolatedSupabaseClient(), claims.email, fields.code);
      } else if (action === "reauth-totp") {
        const out = await stepUpTotp(mfa, fields.code);
        proven = out.ok;
        if (proven) {
          // Same session, new aal2 token: re-read the id the cookie binds to.
          const after = await getStaffClaims(supabase as StaffAuthClient);
          sessionId = after?.session_id ?? "";
        }
      } else {
        return staffJson({ ok: false, code: "reauth-failed" }, [], 400);
      }

      if (!proven) {
        log("warn", "auth", ctx, { reason: "reauth-failed", action });
        return staffJson({ ok: false, code: "reauth-failed" }, setCookies);
      }
      const reauthCookie = await mintReauthCookie({ secret, userId: claims.sub, sessionId });
      if (!reauthCookie) return staffJson({ ok: false, code: "reauth-unavailable" }, setCookies, 403);
      return staffJson({ ok: true }, setCookies, 200, [reauthCookie]);
    }

    return staffJson({ ok: false, code: "mfa-invalid-input" }, [], 400);
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
  if ("ok" in result) {
    // D-16a: a staff account set to magic_link refuses a password sign-in with the
    // same generic error as a wrong password. With a factor enrolled the row is
    // hidden at aal1 (null) and mfa-step-up repeats this check at aal2.
    const staff = await getStaffClaims(supabase as StaffAuthClient);
    if (staff?.app_metadata?.vamos_role) {
      let method: SignInMethod | null;
      try {
        method = await readOwnSignInMethod(env, staff);
      } catch {
        log("error", "auth", ctx, { reason: "sign-in-method-unreadable", action: "signin" });
        return refuseSignIn();
      }
      if (passwordSignInRefused(method, ["password"])) return refuseSignIn();
    }
  }
  return sessionJson(result, setCookies);
}
