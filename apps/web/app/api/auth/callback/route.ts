// apps/web/app/api/auth/callback/route.ts
//
// Magic-link / OTP / recovery landing. Exchanges the code, sets cookies,
// redirects. Renders nothing on any path.

import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { routing } from "@/i18n/routing";
import { PUBLIC_ROUTES, type PublicRoute } from "@/lib/metadata";
import { trustedSiteOrigin } from "@/lib/security/origin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { log } from "@/lib/logger";

export const dynamic = "force-dynamic";

const OTP_TYPES = new Set<string>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

function isLocale(value: string): value is (typeof routing.locales)[number] {
  return (routing.locales as readonly string[]).includes(value);
}

function localeHome(locale: string): string {
  return locale === routing.defaultLocale ? "/" : `/${locale}`;
}

/**
 * Validate the callback `next` / `redirect_to` target against open-redirect rules:
 * it must start with a single `/`, must not start with `//` or `/\\`, and after
 * stripping a leading locale segment the remaining path must be a member of
 * `PUBLIC_ROUTES`. Anything else (off-site, unknown, protocol-relative) falls
 * back to the locale home.
 */
export function validateAuthRedirectTarget(
  raw: string | null,
  fallbackLocale: string,
): string {
  const locale = isLocale(fallbackLocale) ? fallbackLocale : routing.defaultLocale;
  const home = localeHome(locale);

  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return home;
  }

  const pathOnly = raw.split("?")[0]?.split("#")[0] ?? raw;
  const segments = pathOnly.split("/").filter(Boolean);
  let detectedLocale = locale;
  let routePath: string;

  if (segments[0] && isLocale(segments[0])) {
    detectedLocale = segments[0];
    const rest = segments.slice(1);
    routePath = rest.length === 0 ? "/" : `/${rest.join("/")}`;
  } else {
    routePath = pathOnly === "" ? "/" : pathOnly;
  }

  if (!(PUBLIC_ROUTES as readonly string[]).includes(routePath)) {
    return localeHome(detectedLocale);
  }

  const publicRoute = routePath as PublicRoute;
  if (detectedLocale === routing.defaultLocale) return publicRoute;
  return publicRoute === "/" ? `/${detectedLocale}` : `/${detectedLocale}${publicRoute}`;
}

function signInErrorPath(locale: string): string {
  const path = locale === routing.defaultLocale ? "/sign-in" : `/${locale}/sign-in`;
  return `${path}?error=1`;
}

function localeFromNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return routing.defaultLocale;
  const first = raw.split("/").filter(Boolean)[0];
  return first && isLocale(first) ? first : routing.defaultLocale;
}

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const next = url.searchParams.get("next") ?? url.searchParams.get("redirect_to");
  const locale = localeFromNext(next);
  const origin = trustedSiteOrigin(url.host) ?? "https://vamostaxi.site";
  const ctx = { requestId: crypto.randomUUID(), route: "/api/auth/callback", locale };

  const fail = (): NextResponse =>
    NextResponse.redirect(new URL(signInErrorPath(locale), origin), 302);

  const supabase = await createServerSupabaseClient(request);
  let error: { message?: string; code?: string } | null = null;

  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    ({ error } = await supabase.auth.verifyOtp({
      type: type as EmailOtpType,
      token_hash: tokenHash,
    }));
  } else {
    log("error", "auth-callback", ctx, { reason: "missing-token" });
    return fail();
  }

  if (error) {
    log("error", "auth-callback", ctx, { reason: error.code ?? "exchange-failed" });
    return fail();
  }

  const target = validateAuthRedirectTarget(next, locale);
  return NextResponse.redirect(new URL(target, origin), 302);
}
