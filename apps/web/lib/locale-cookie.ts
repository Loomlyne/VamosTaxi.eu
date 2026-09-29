// apps/web/lib/locale-cookie.ts
//
// D-47: the customer's language follows them onto the Next pages through one cookie,
// NEXT_LOCALE. Pure helpers, safe in middleware (edge) and unit tests.

import { NextResponse, type NextRequest } from "next/server";
import { routing, type Locale } from "@/i18n/routing";

export const LOCALE_COOKIE = "NEXT_LOCALE";
const LOCALE_HEADER = "X-NEXT-INTL-LOCALE";

/** Exact match against the four supported locales; anything else is English. */
export function resolveCookieLocale(value: string | null | undefined): Locale {
  if (typeof value !== "string") return routing.defaultLocale;
  const found = routing.locales.find((locale) => locale === value);
  return found ?? routing.defaultLocale;
}

/**
 * Internal rewrite of an unprefixed Next-page request to `/{locale}{path}`. The address
 * bar keeps the unprefixed URL. `locale` must come from `resolveCookieLocale`.
 */
export function localeRewriteResponse(request: NextRequest, locale: Locale): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname}`;
  const headers = new Headers(request.headers);
  headers.set(LOCALE_HEADER, locale);
  const res = NextResponse.rewrite(url, { request: { headers } });
  return res;
}
