// apps/web/lib/auth/redirect-target.ts
//
// Open-redirect-safe landing target for /api/auth/callback (D-13).

import { routing } from "../../i18n/routing";
import { safeReturnTo } from "../account/return-to";
import { PUBLIC_ROUTES, type PublicRoute } from "../metadata";

function isLocale(value: string): value is (typeof routing.locales)[number] {
  return (routing.locales as readonly string[]).includes(value);
}

function localeAccount(locale: string): string {
  return locale === routing.defaultLocale ? "/account" : `/${locale}/account`;
}

/**
 * Validate the callback `next` / `redirect_to` target against open-redirect rules:
 * it must start with a single `/`, must not start with `//` or `/\\`, and after
 * stripping a leading locale segment the remaining path must be a member of
 * `PUBLIC_ROUTES`. Anything else (off-site, unknown, protocol-relative) falls
 * back to /account. A checkout URL with its query (safeReturnTo) is also allowed.
 */
export function validateAuthRedirectTarget(
  raw: string | null,
  fallbackLocale: string,
): string {
  const locale = isLocale(fallbackLocale) ? fallbackLocale : routing.defaultLocale;
  const home = localeAccount(locale);

  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return home;
  }

  // D-13: checkout with its query survives (same rule as password sign-in).
  const checkout = safeReturnTo(raw);
  if (checkout) return checkout;

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
    return localeAccount(detectedLocale);
  }

  const publicRoute = routePath as PublicRoute;
  if (detectedLocale === routing.defaultLocale) return publicRoute;
  return publicRoute === "/" ? `/${detectedLocale}` : `/${detectedLocale}${publicRoute}`;
}
