import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { LOCALE_COOKIE, localeRewriteResponse, resolveCookieLocale } from "./lib/locale-cookie";
import {
  mintVamosQs,
  VAMOS_QS_ATTRS,
  VAMOS_QS_COOKIE,
  verifyVamosQs,
} from "./lib/abuse/vamos-qs";
import { readConsentSubject } from "./lib/consent/cookie";
import {
  INTERNAL_ASSET_HEADER,
  accountDcPath,
  canonicalPublicFromLeak,
  should404MockLeak,
} from "./lib/dc-mock-urls";
import { publicDashboardPath } from "./lib/ops/paths";
import { passkeyGateInputs, vamosRoleFromAccessToken, type StaffAuthClient } from "./lib/ops/session";
import { effectiveNextLevel, staffGateDecision } from "./lib/ops/staff-gate";
import { MANAGE_COOKIE_NAME } from "./lib/checkout/manage-token";
import { applySeoToHtml, iconHeadTags, isSeoLang, seoPageFor, seoRoute, type SeoLang } from "./lib/seo/head";
import { applySecurityHeaders } from "./lib/security/headers";
import {
  createSupabaseMiddlewareClient,
  updateSession,
} from "./lib/supabase/middleware";

const handleI18nRouting = createMiddleware(routing);

const DC_HOME = "/app/home/home.html";
/** Public DC mocks. /checkout and /checkout/trip|/details|/payment are Next (07-12) — do not add them. /confirmation is Next (07-15). */
const DC_PAGES: Record<string, string> = {
  "/": DC_HOME,
  "/about": "/app/pages/about.html",
  "/faq": "/app/pages/faq.html",
  "/contact": "/app/pages/contact.html",
  "/terms": "/app/pages/terms.html",
  "/privacy": "/app/pages/privacy.html",
  "/cookies": "/app/pages/cookies.html",
  "/cancellation": "/app/pages/cancellation.html",
  "/imprint": "/app/pages/imprint.html",
  "/sign-in": "/app/pages/sign-in.html",
  "/sign-up": "/app/pages/sign-in.html",
  "/reset-password": "/app/pages/reset-password.html",
  "/manage-booking": "/app/pages/manage-booking.html",
  "/booking-detail": "/app/pages/booking-detail.html",
  "/account": "/app/pages/account.html",
  "/bookings": "/app/pages/bookings.html",
  "/coming-soon": "/app/pages/coming-soon.html",
  "/sitemap": "/app/pages/sitemap.html",
};

/** D-24: marketing HTML only. No public /services. Contact GET may cache; POST uncached. */
const MARKETING_CACHE_PATHS = new Set([
  "/",
  "/about",
  "/faq",
  "/contact",
  "/terms",
  "/privacy",
  "/cookies",
  "/cancellation",
  "/imprint",
]);

/** Never CDN-cache tickets or APIs (D-24). Matcher already skips /api; keep the prefix in source. */
const NO_STORE_PATH_PREFIXES = ["/api", "/checkout", "/confirmation", "/bookings", "/account"] as const;

/** D-25: sb-yaumjzvylngfjhtuffqs-auth-token* or any sb-*-auth-token → private, no-store. */
const AUTH_TOKEN_COOKIE_RE = /^sb-.+-auth-token(?:\..+)?$/;

/** Bare `/app/pages/contact` (and home) → public `/contact`. Skip aliases that share a file. */
const DC_FILE_ROUTE: Record<string, string> = {};
for (const [route, file] of Object.entries(DC_PAGES)) {
  if (route === "/sign-up" || route === "/login") continue;
  DC_FILE_ROUTE[file.replace(/\.html$/i, "")] = route;
}

function publicPathFromDcFile(pathname: string): string | null {
  const { localePrefix, path } = localeStrippedPath(pathname);
  const bare = path.replace(/\.dc\.html$/i, "").replace(/\.html$/i, "").replace(/\.dc$/i, "");
  const route = DC_FILE_ROUTE[bare];
  if (!route) return null;
  if (localePrefix && localePrefix !== "en") {
    return route === "/" ? `/${localePrefix}` : `/${localePrefix}${route}`;
  }
  return route;
}

// Frozen array, not a module-scope Set (no module-scope collections in apps/web).
const OPS_EXEMPT: readonly string[] = Object.freeze(["/ops/sign-in", "/ops/accept-invite"]);

function stripLocalePath(pathname: string): string {
  let path = pathname;
  const locale = path.match(/^\/(en|de|fr|ar)(?=\/|$)/);
  if (locale) {
    path = path.slice(locale[0].length) || "/";
  }
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return path;
}

function dcMockPath(pathname: string): string | null {
  const path = stripLocalePath(pathname);
  if (accountDcPath(path)) return DC_PAGES["/account"] ?? null;
  return DC_PAGES[path] ?? null;
}

async function serveDcHtml(request: NextRequest, mock: string): Promise<NextResponse> {
  const asset = new URL(mock, request.url);
  const res = await fetch(asset, { headers: { [INTERNAL_ASSET_HEADER]: "1" } });
  let html = await res.text();
  const siteKey = process.env.TURNSTILE_SITE_KEY ?? "";
  html = html.replace(/<head([^>]*)>/i, `<head$1><meta name="vt-turnstile-site-key" content="${siteKey.replace(/&/g, "&amp;").replace(/\"/g, "&quot;")}">`);
  const headers = new Headers(res.headers);
  for (const header of [
    "content-length",
    "content-encoding",
    "etag",
    "last-modified",
    "accept-ranges",
    "content-range",
  ]) {
    headers.delete(header);
  }
  headers.set("content-type", "text/html; charset=utf-8");
  return new NextResponse(html, { status: res.status, headers });
}

/** Address decision for a mock page with a row in lib/seo/pages.json. */
function seoMockRoute(request: NextRequest, pathname: string) {
  const { localePrefix, path } = localeStrippedPath(pathname);
  const cookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const cookieLang: SeoLang = isSeoLang(cookie) ? cookie : "en";
  return seoRoute(path, isSeoLang(localePrefix) ? localePrefix : null, cookieLang);
}

/** Put the table's head into the mock HTML the server sends (first paint, before any script). */
async function withSeoHead(
  res: NextResponse,
  seo: ReturnType<typeof seoMockRoute>,
): Promise<NextResponse> {
  if (seo?.kind !== "serve" || res.status !== 200) return res;
  const html = applySeoToHtml(await res.text(), seo.page, seo.lang, seo.prefixed);
  const headers = new Headers(res.headers);
  headers.delete("content-length");
  return new NextResponse(html, { status: res.status, headers });
}

async function serveOpsDc(
  request: NextRequest,
  cookieSource: NextResponse,
  file: "ops.dc.html" | "ops-login.dc.html",
  injectAuth: boolean,
): Promise<NextResponse> {
  const asset = new URL(`/app/ops/${file}`, request.url);
  const res = await fetch(asset, { headers: { [INTERNAL_ASSET_HEADER]: "1" } });
  let html = await res.text();
  const boot = [
    html.includes('href="/app/ops/"') ? "" : '<base href="/app/ops/">',
    iconHeadTags(),
    injectAuth ? '<script>try{localStorage.setItem("vamosOpsAuth","1")}catch(e){}</script>' : "",
  ].join("");
  html = html.replace(/<head([^>]*)>/i, `<head$1>${boot}`);
  const headers = new Headers();
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "private, no-store");
  applySecurityHeaders(headers);
  const out = new NextResponse(html, { status: res.status, headers });
  copyCookies(cookieSource, out);
  out.cookies.set("vamos_dash", "1", {
    path: "/",
    sameSite: "lax",
    secure: true,
    httpOnly: true,
  });
  return applyStagingNoindex(request, await updateSession(request, out));
}

function qsSecret(): string {
  const value = process.env.VAMOS_QS_SECRET;
  return typeof value === "string" ? value : "";
}

const REQUEST_HOST_HEADER = "x-vamos-request-host";

function hostnameOf(request: NextRequest): string {
  try {
    const host = new URL(request.url).hostname.toLowerCase();
    if (host.length > 0) return host;
  } catch {
    // fall through to Host
  }
  return (request.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
}

function pinRequestHost(request: NextRequest): NextRequest {
  const headers = new Headers(request.headers);
  headers.delete(REQUEST_HOST_HEADER);
  headers.set(REQUEST_HOST_HEADER, hostnameOf(request));
  return new NextRequest(request, { headers });
}

function localeStrippedPath(pathname: string): { localePrefix: string | null; path: string } {
  const match = pathname.match(/^\/(en|de|fr|ar)(?=\/|$)/);
  if (match) {
    const prefix = match[1] ?? null;
    return { localePrefix: prefix, path: pathname.slice(match[0].length) || "/" };
  }
  return { localePrefix: null, path: pathname };
}

function isOpsRequest(pathname: string): boolean {
  const { path } = localeStrippedPath(pathname);
  return path === "/ops" || path.startsWith("/ops/");
}

function isOpsExempt(pathname: string): boolean {
  const { path } = localeStrippedPath(pathname);
  return OPS_EXEMPT.includes(path);
}

/**
 * D-01a: the staff console lives on dashboard.vamostaxi.site.
 * vamostaxi.site never enters the ops branch. Local next-dev treats
 * `/ops/*` as the dashboard so the gate can be exercised without a
 * hosts-file entry. Do not bind vamostaxi.eu.
 */
function isNamedDashboardHost(request: NextRequest): boolean {
  const host = hostnameOf(request);
  return host === "dashboard.vamostaxi.site" || host === "dashboard.localhost";
}

function isDashboardHost(request: NextRequest): boolean {
  if (isNamedDashboardHost(request)) return true;
  const host = hostnameOf(request);
  if ((host === "localhost" || host === "127.0.0.1") && isOpsRequest(request.nextUrl.pathname)) {
    return true;
  }
  return false;
}

function dashboardAbs(request: NextRequest, targetPath: string): URL {
  const { localePrefix } = localeStrippedPath(request.nextUrl.pathname);
  const href =
    localePrefix && localePrefix !== "en"
      ? `/${localePrefix}${targetPath === "/" ? "" : targetPath}`
      : targetPath;
  return new URL(href || "/", request.url);
}

/** D-10 console paths on the dashboard host. Same ops.dc.html document. */
const OPS_CONSOLE_EXACT = new Set([
  "/dashboard",
  "/bookings",
  "/bookings/new",
  "/calendar",
  "/customers",
  "/fleet",
  "/fleet/chauffeurs",
  "/support",
  "/pricing",
  "/profile",
  "/settings",
  "/coupons",
  "/reviews",
  "/pages",
  "/legal",
]);

function normalizeDashboardPath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function isOpsConsolePath(path: string): boolean {
  const p = normalizeDashboardPath(path);
  if (OPS_CONSOLE_EXACT.has(p)) return true;
  const segments = p.split("/").filter(Boolean);
  if (segments.length === 2 && segments[0] === "bookings") return true;
  if (segments.length === 2 && segments[0] === "customers") return true;
  if (segments.length === 3 && segments[0] === "fleet" && segments[1] === "chauffeurs") {
    return true;
  }
  return false;
}

function opsConsoleNotFound(request: NextRequest, cookieSource: NextResponse): NextResponse {
  const headers = new Headers();
  headers.set("content-type", "text/plain; charset=utf-8");
  headers.set("Cache-Control", "private, no-store");
  const out = new NextResponse("Not Found", { status: 404, headers });
  copyCookies(cookieSource, out);
  return applyStagingNoindex(request, out);
}

async function dashboardHostMiddleware(request: NextRequest): Promise<NextResponse> {
  const { path } = localeStrippedPath(request.nextUrl.pathname);

  if (path === "/ops" || path.startsWith("/ops/")) {
    const pub = publicDashboardPath(path);
    const dest = pub === "/" || pub === "" ? "/" : "/login";
    return applyStagingNoindex(request, NextResponse.redirect(dashboardAbs(request, dest), 308));
  }

  if (process.env.DEPLOY_ENV === "ops-changes") {
    if (path === "/login") {
      return serveOpsDc(request, new NextResponse(), "ops-login.dc.html", false);
    }
    if (normalizeDashboardPath(path) === "/") {
      return applyStagingNoindex(request, NextResponse.redirect(dashboardAbs(request, "/dashboard"), 308));
    }
    if (isOpsConsolePath(path)) {
      return serveOpsDc(request, new NextResponse(), "ops.dc.html", true);
    }
    return opsConsoleNotFound(request, new NextResponse());
  }

  const client = createSupabaseMiddlewareClient(request);
  const {
    data: { user },
  } = await client.supabase.auth.getUser();
  const { data: sessionData } = await client.supabase.auth.getSession();
  const role = user
    ? (vamosRoleFromAccessToken(sessionData.session?.access_token) ??
        (typeof user.app_metadata?.vamos_role === "string" ? user.app_metadata.vamos_role : ""))
    : "";
  // INT-09 / D-16 / D-16a / D-16b: admin only; aal2 on every request once a factor is verified.
  // Step-up and deny both fall through to /login, which hosts the step-up (26.1-23).
  const { data: aalData } = user
    ? await client.supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    : { data: null };
  const currentLevel = aalData?.currentLevel;
  const nextLevel = effectiveNextLevel(aalData?.nextLevel, user?.factors);
  const passkey = user
    ? await passkeyGateInputs(client.supabase as StaffAuthClient, {
        role,
        currentLevel,
        nextLevel,
        accessToken: sessionData.session?.access_token,
      })
    : {};
  const gate = staffGateDecision({ role, currentLevel, nextLevel, ...passkey });
  const inConsole = role === "admin" && gate === "allow";
  const dashPath = normalizeDashboardPath(path);

  // /login is the staff sign-in document even with a leftover console session.
  // Putting it after inConsole made signed-in /login return plain "Not Found".
  if (dashPath === "/login") {
    return serveOpsDc(request, client.response, "ops-login.dc.html", false);
  }

  if (inConsole) {
    if (dashPath === "/") {
      return applyStagingNoindex(
        request,
        copyCookies(client.response, NextResponse.redirect(dashboardAbs(request, "/dashboard"), 308)),
      );
    }
    if (isOpsConsolePath(path)) {
      return serveOpsDc(request, client.response, "ops.dc.html", true);
    }
    return opsConsoleNotFound(request, client.response);
  }

  // The email-link callback answers a failed or expired link with /sign-in?error=1. On this
  // host that path is /login, and the form reads ?error=1 to explain what happened.
  const loginUrl = dashboardAbs(request, "/login");
  if (path === "/sign-in" && request.nextUrl.searchParams.get("error") === "1") {
    loginUrl.searchParams.set("error", "1");
  }
  return applyStagingNoindex(
    request,
    copyCookies(client.response, NextResponse.redirect(loginUrl, 308)),
  );
}

function opsRedirectUrl(request: NextRequest, targetPath: string): URL {
  const { localePrefix } = localeStrippedPath(request.nextUrl.pathname);
  const href =
    localePrefix && localePrefix !== "en" ? `/${localePrefix}${targetPath}` : targetPath;
  return new URL(href, request.url);
}

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  return to;
}

const PRIVATE_NOINDEX_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/reset-password",
  "/manage-booking",
  "/booking-detail",
  "/review",
  "/account",
  "/bookings",
  "/coming-soon",
  "/sitemap",
  "/checkout",
  "/confirmation",
  "/ops",
] as const;

function isPrivateNoindexPath(path: string): boolean {
  return PRIVATE_NOINDEX_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function applyStagingNoindex(request: NextRequest, response: NextResponse): NextResponse {
  // D-03: public vamostaxi.site and www.vamostaxi.site stay indexable on Worker
  // vamos (DEPLOY_ENV staging). D-04: dashboard / ops-changes always noindex.
  // D-08: env.production is unused — host-split is the indexable path, not an
  // undefined DEPLOY_ENV.
  applySecurityHeaders(response.headers);
  if (isDashboardHost(request) || process.env.DEPLOY_ENV === "ops-changes") {
    response.headers.set("X-Robots-Tag", "noindex");
  }
  if (hostnameOf(request).endsWith(".workers.dev")) {
    response.headers.set("X-Robots-Tag", "noindex");
  }
  if (isPrivateNoindexPath(stripLocalePath(request.nextUrl.pathname))) response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

function isNoStorePath(path: string): boolean {
  return NO_STORE_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function hasAuthTokenCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => AUTH_TOKEN_COOKIE_RE.test(cookie.name));
}

/**
 * Public-host Cache-Control after locale/auth work. Worker still runs
 * gatePublicRequest — these headers do not skip the Worker.
 */
function applyPublicCacheHeaders(
  request: NextRequest,
  response: NextResponse,
  languageVaries = false,
): NextResponse {
  const path = stripLocalePath(request.nextUrl.pathname);
  const nocache = request.nextUrl.searchParams.has("nocache");
  const personal = isNoStorePath(path);
  const authed = hasAuthTokenCookie(request);

  const localised = languageVaries && resolveCookieLocale(request.cookies.get(LOCALE_COOKIE)?.value) !== routing.defaultLocale;
  if (personal || nocache || authed || localised || isDashboardHost(request)) {
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  const marketingGet =
    request.method === "GET" &&
    response.status === 200 &&
    MARKETING_CACHE_PATHS.has(path);

  if (!marketingGet) {
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  // D-08 / T-10-12: banner vs no-banner. Boolean presence only — never the UUID.
  const present = readConsentSubject(request.headers.get("cookie")) ? "1" : "0";
  response.headers.set("X-Consent-Present", present);
  response.headers.append("Vary", "X-Consent-Present");
  response.headers.set(
    "Cache-Control",
    "public, s-maxage=300, stale-while-revalidate=3600",
  );
  return response;
}

function withOpsPathHeader(request: NextRequest, base: NextResponse): NextResponse {
  const { path } = localeStrippedPath(request.nextUrl.pathname);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-vamos-ops-path", path);
  const next = NextResponse.next({ request: { headers: requestHeaders } });
  copyCookies(base, next);
  base.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie" || key.toLowerCase() === "location") return;
    next.headers.set(key, value);
  });
  return next;
}

async function opsStaffGate(request: NextRequest, i18nResponse: NextResponse): Promise<NextResponse> {
  const client = createSupabaseMiddlewareClient(request);
  const {
    data: { user },
  } = await client.supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!isOpsExempt(pathname)) {
    if (!user) {
      return applyStagingNoindex(
        request,
        copyCookies(client.response, NextResponse.redirect(opsRedirectUrl(request, "/ops/sign-in"))),
      );
    }
    // vamos_role is hook-minted into the access token; getUser()'s app_metadata does not carry it.
    const { data: sessionData } = await client.supabase.auth.getSession();
    const role =
      vamosRoleFromAccessToken(sessionData.session?.access_token) ??
      (typeof user.app_metadata?.vamos_role === "string" ? user.app_metadata.vamos_role : "");
    if (role.length === 0) {
      return applyStagingNoindex(
        request,
        copyCookies(client.response, NextResponse.redirect(opsRedirectUrl(request, "/"))),
      );
    }
    // INT-09 / D-16 / D-16a / D-16b: same decision as the dashboard host and requireStaffClaims.
    // Step-up and deny go to sign-in; there is no separate MFA page.
    const { data: aalData } = await client.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const currentLevel = aalData?.currentLevel;
    const nextLevel = effectiveNextLevel(aalData?.nextLevel, user.factors);
    const passkey = await passkeyGateInputs(client.supabase as StaffAuthClient, {
      role,
      currentLevel,
      nextLevel,
      accessToken: sessionData.session?.access_token,
    });
    const gate = staffGateDecision({ role, currentLevel, nextLevel, ...passkey });
    if (gate !== "allow") {
      return applyStagingNoindex(
        request,
        copyCookies(client.response, NextResponse.redirect(opsRedirectUrl(request, "/ops/sign-in"))),
      );
    }
  }

  i18nResponse.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "set-cookie" || lower === "location") return;
    client.response.headers.set(key, value);
  });
  return applyStagingNoindex(request, withOpsPathHeader(request, client.response));
}

export default async function middleware(request: NextRequest) {
  request = pinRequestHost(request);
  const { pathname } = request.nextUrl;

  // D-05: www → apex 301. Canonical is https://vamostaxi.site. No DNS this plan.
  if (hostnameOf(request) === "www.vamostaxi.site") {
    const dest = new URL(`https://vamostaxi.site${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(dest, 301);
  }

  // This Worker is dashboard-only. Never serve the public site.
  if (process.env.DEPLOY_ENV === "ops-changes") {
    return dashboardHostMiddleware(request);
  }

  // Languages live on the page switcher, not /de /fr /ar /en.
  if (!isDashboardHost(request)) {
    const { localePrefix, path } = localeStrippedPath(pathname);
    // Option B (owner, 2026-09-30): /de /fr /ar are real addresses on the indexable pages.
    const seoAddressable = localePrefix !== "en" && Boolean(seoPageFor(path)?.indexable);
    if (localePrefix && !seoAddressable) {
      const url = request.nextUrl.clone();
      url.pathname = path;
      const res = NextResponse.redirect(url, 308);
      res.cookies.set("NEXT_LOCALE", localePrefix, {
        path: "/",
        sameSite: "lax",
        secure: true,
        maxAge: 31536000,
      });
      return applyPublicCacheHeaders(request, applyStagingNoindex(request, res));
    }
  }

  // K100: manage token is a secret. Set HttpOnly cookie and 302-strip the query
  // so Referer and access logs do not keep it. Guest cancel/flight already
  // prefer vt_manage.
  if (!isDashboardHost(request)) {
    const { path } = localeStrippedPath(pathname);
    if (path === "/manage-booking" || path === "/booking-detail") {
      const token = (
        request.nextUrl.searchParams.get("token") ??
        request.nextUrl.searchParams.get("mb") ??
        ""
      ).trim();
      if (token) {
        const url = request.nextUrl.clone();
        url.searchParams.delete("token");
        url.searchParams.delete("mb");
        const res = NextResponse.redirect(url, 302);
        res.cookies.set(MANAGE_COOKIE_NAME, token, {
          httpOnly: true,
          sameSite: "lax",
          secure: true,
          path: "/",
          maxAge: 60 * 60 * 24 * 30,
        });
        return applyStagingNoindex(request, res);
      }
    }
  }

  // Public host never serves the console (D-01a). Leftover /ops is 404.
  if (!isDashboardHost(request) && isOpsRequest(pathname)) {
    const gone = request.nextUrl.clone();
    gone.pathname = "/__vamos_gone";
    gone.search = "";
    return applyStagingNoindex(request, NextResponse.rewrite(gone));
  }

  // Named dashboard host: public URLs have no /ops prefix.
  if (isNamedDashboardHost(request)) {
    return dashboardHostMiddleware(request);
  }

  // Dashboard host is the console, not the public mock gallery.
  if (isDashboardHost(request)) {
    if (!isOpsRequest(pathname)) {
      return applyStagingNoindex(request, NextResponse.redirect(opsRedirectUrl(request, "/ops")));
    }
  } else {
    const bounced = canonicalPublicFromLeak(pathname) ?? publicPathFromDcFile(pathname);
    if (bounced && bounced !== pathname) {
      const url = request.nextUrl.clone();
      url.pathname = bounced;
      return applyStagingNoindex(request, NextResponse.redirect(url, 308));
    }
    if (should404MockLeak(pathname)) {
      const gone = request.nextUrl.clone();
      gone.pathname = "/__vamos_gone";
      gone.search = "";
      return applyStagingNoindex(request, NextResponse.rewrite(gone));
    }
    const mock = dcMockPath(pathname);
    if (mock) {
      const seo = seoMockRoute(request, pathname);
      if (seo?.kind === "redirect") {
        const url = request.nextUrl.clone();
        url.pathname = seo.to;
        return applyPublicCacheHeaders(request, applyStagingNoindex(request, NextResponse.redirect(url, 302)));
      }
      const html = await serveDcHtml(request, mock);
      return applyPublicCacheHeaders(
        request,
        applyStagingNoindex(request, await updateSession(request, await withSeoHead(html, seo))),
      );
    }
  }

  // D-47: unprefixed Next page + a chosen non-English language -> internal rewrite to
  // /{locale}/... (address stays unprefixed). English / no / invalid cookie: next-intl as before.
  const cookieLocale = resolveCookieLocale(request.cookies.get(LOCALE_COOKIE)?.value);
  const response =
    !isDashboardHost(request) &&
    cookieLocale !== routing.defaultLocale &&
    !localeStrippedPath(pathname).localePrefix
      ? localeRewriteResponse(request, cookieLocale)
      : handleI18nRouting(request);
  response.headers.append("Vary", "Cookie");

  // Checkpoint (D-11/D-12, resolved 2026-08-20, option-a): a request whose
  // path explicitly carries the default locale's prefix (`/en`, `/en/...`)
  // must permanently redirect (308) to the unprefixed canonical URL — one
  // canonical URL per page for the Phase 11 redirect map and every hreflang
  // alternate. next-intl's own middleware issues this same redirect as a
  // 307 with no config surface to change it (verified against the
  // installed next-intl source — `NextResponse.redirect(url)` with no
  // explicit status), so the status is corrected here.
  //
  // Deliberately scoped to an explicit `/en` prefix only — a browser-locale
  // auto-detection redirect (e.g. `/` -> `/de` from `Accept-Language`) is a
  // preference-based redirect, not a canonical-URL fact, and must stay a
  // 307 so it is never permanently cached by a client whose preference
  // later changes.
  const isDefaultLocalePrefixed = pathname === "/en" || pathname.startsWith("/en/");

  let finalResponse = response;

  if (isDefaultLocalePrefixed && response.status === 307) {
    const location = response.headers.get("location");
    if (location) {
      const permanent = NextResponse.redirect(location, 308);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "location") {
          permanent.headers.set(key, value);
        }
      });
      finalResponse = permanent;
    }
  }

  const isRedirect =
    finalResponse.status >= 300 &&
    finalResponse.status < 400 &&
    Boolean(finalResponse.headers.get("location"));

  // D-01a: staff gate only on the dashboard host (and local `/ops/*`).
  // vamostaxi.site never enters this branch.
  if (!isRedirect && isDashboardHost(request) && isOpsRequest(pathname)) {
    return opsStaffGate(request, finalResponse);
  }

  // Auth cookie refresh only on the page path. A 3xx never reaches a Server
  // Component, so skip updateSession — and never construct a new response on
  // the session-refresh path (D-02).
  if (!isRedirect) {
    finalResponse = await updateSession(request, finalResponse);
  }

  // D-03/D-04: public vamostaxi.site and www.vamostaxi.site stay indexable even when
  // Worker vamos runs with DEPLOY_ENV=staging. Dashboard (and ops-changes) always
  // noindex. env.production is unused (D-08) — host-split is the indexable path,
  // not an undefined DEPLOY_ENV.
  if (isDashboardHost(request) || process.env.DEPLOY_ENV === "ops-changes") {
    finalResponse.headers.set("X-Robots-Tag", "noindex");
  }

  // vamos_qs is minted here, not in a route handler: the cookie must exist
  // before the first /api/quote, and the first thing a visitor requests is a
  // page. Matcher carves /api/* out, so this is the first document response.
  const secret = qsSecret();
  if (secret.length > 0) {
    const existing = request.cookies.get(VAMOS_QS_COOKIE)?.value;
    const subject = await verifyVamosQs(secret, existing);
    if (!subject) {
      const token = await mintVamosQs(secret, crypto.randomUUID());
      finalResponse.headers.append(
        "Set-Cookie",
        `${VAMOS_QS_COOKIE}=${token}; ${VAMOS_QS_ATTRS}`,
      );
    }
  }

  return applyPublicCacheHeaders(request, finalResponse, true);
}

export const config = {
  // Match every path except Next internals, the dev-only gallery's static
  // assets, and files that carry an extension (fonts/icons/images served
  // from public/brand/ per D-10).
  //
  // Unchanged for 06-03: `/ops/*` (and `/de/ops` etc.) already match this
  // pattern — the negative lookahead only excludes `api`, `_next`, `_vercel`,
  // and dotted filenames.
  //
  // Phase 7: `/api/stripe/webhook` is under `/api/*`, so this matcher never
  // reads the body. constructEventAsync needs the exact bytes Stripe signed.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
