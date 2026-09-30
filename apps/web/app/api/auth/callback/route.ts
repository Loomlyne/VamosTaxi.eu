// apps/web/app/api/auth/callback/route.ts
//
// Magic-link / OTP / recovery landing. Exchanges the code, sets cookies,
// redirects. Renders nothing on any path.

import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { decodeNextParam, validateAuthRedirectTarget } from "@/lib/auth/redirect-target";
import { routing } from "@/i18n/routing";
import { trustedSiteOrigin } from "@/lib/security/origin";
import {
  authSetCookieHeader,
  createServerSupabaseClient,
  type AuthSetCookie,
} from "@/lib/supabase/server";
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

/** Target validation lives in lib/auth/redirect-target.ts (PUBLIC_ROUTES + checkout returnTo). */

function isLocale(value: string): value is (typeof routing.locales)[number] {
  return (routing.locales as readonly string[]).includes(value);
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
  // `nextb` is base64url of the target (a checkout path with a query); the plain `next` is for simple paths.
  const next = decodeNextParam(url.searchParams.get("nextb")) ?? url.searchParams.get("next") ?? url.searchParams.get("redirect_to");
  const locale = localeFromNext(next);
  const origin = trustedSiteOrigin(url.host) ?? "https://vamostaxi.site";
  const ctx = { requestId: crypto.randomUUID(), route: "/api/auth/callback", locale };

  const setCookies: AuthSetCookie[] = [];
  // next/headers cookies().set does not attach to a hand-built redirect on the Worker:
  // every cookie the client wrote goes onto the response by hand.
  const redirectTo = (path: string): NextResponse => {
    const response = NextResponse.redirect(new URL(path, origin), 302);
    for (const cookie of setCookies) response.headers.append("Set-Cookie", authSetCookieHeader(cookie));
    return response;
  };
  const fail = (): NextResponse => redirectTo(signInErrorPath(locale));

  const supabase = await createServerSupabaseClient(request, { cookies: setCookies });
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
  return redirectTo(target);
}
