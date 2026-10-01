/**
 * Public URL gate: canonical DC paths, leftover 404s, locale prefix strip,
 * and hide `/api/*` from browser document navigation.
 *
 * Keep `DC_MOCK_CANONICAL` in lockstep with `DC_PAGES` in middleware.ts.
 *
 * Never 404 `/app/ops/*` on the dashboard host and never intercept script/css
 * / `.dc.html` mocks — those are how DC pages load. Only document navigations of
 * leftover pretty-URLs 308/404.
 */
import { devGalleryEnabled, isDevGalleryPath } from "./dev-gallery";

import { applySecurityHeaders } from "./security/headers";
import { seoPageFor } from "./seo/head";

export const INTERNAL_ASSET_HEADER = "x-vamos-dc-asset";

export const ACCOUNT_SECTIONS = [
  "transfers",
  "details",
  "mobile",
  "preferences",
  "security",
  "close",
] as const;

export type AccountSection = (typeof ACCOUNT_SECTIONS)[number];

const ACCOUNT_SECTION_SET = new Set<string>(ACCOUNT_SECTIONS);

export const DC_MOCK_CANONICAL: Record<string, string> = {
  "/app/home/home": "/",
  "/app/pages/about": "/about",
  "/app/pages/faq": "/faq",
  "/app/pages/contact": "/contact",
  "/app/pages/terms": "/terms",
  "/app/pages/privacy": "/privacy",
  "/app/pages/cookies": "/cookies",
  "/app/pages/cancellation": "/cancellation",
  "/app/pages/imprint": "/imprint",
  "/app/pages/sign-in": "/sign-in",
  "/app/pages/sign-in-confirm": "/sign-in/confirm",
  "/app/pages/reset-password": "/reset-password",
  "/app/pages/manage-booking": "/manage-booking",
  "/app/pages/booking-detail": "/booking-detail",
  "/app/pages/account": "/account",
  "/app/pages/bookings": "/bookings",
  "/app/pages/coming-soon": "/coming-soon",
  "/app/pages/sitemap": "/sitemap",
};

/** Out of V1 / never a public URL. */
const LEFTOVER_EXACT: readonly string[] = Object.freeze([
  "/become-a-partner",
  "/login",
  "/login/confirm",
  "/ops",
]);

const DOC_DEST: readonly string[] = Object.freeze(["document", "iframe", "embed", "frame", "object"]);

export function isAccountSection(value: string): value is AccountSection {
  return ACCOUNT_SECTION_SET.has(value);
}

export function accountDcPath(pathname: string): string | null {
  const path = pathWithoutLocale(pathname);
  if (path === "/account") return "/account";
  if (!path.startsWith("/account/")) return null;
  const rest = path.slice("/account/".length);
  if (rest.includes("/")) return null;
  return isAccountSection(rest) ? "/account" : null;
}

export function pathWithoutLocale(pathname: string): string {
  const locale = pathname.match(/^\/(en|de|fr|ar)(?=\/|$)/);
  let path = locale ? pathname.slice(locale[0].length) || "/" : pathname;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

export function localePrefix(pathname: string): "en" | "de" | "fr" | "ar" | null {
  const match = pathname.match(/^\/(en|de|fr|ar)(?=\/|$)/);
  const code = match?.[1];
  if (code === "en" || code === "de" || code === "fr" || code === "ar") return code;
  return null;
}

function stripAssetExt(pathname: string): string {
  return pathname
    .replace(/\.dc\.html$/i, "")
    .replace(/\.html$/i, "")
    .replace(/\.dc$/i, "");
}

function isDashboardHost(hostname: string): boolean {
  const host = hostname.split(":")[0]?.toLowerCase() ?? "";
  return host === "dashboard.vamostaxi.site" || host === "dashboard.localhost";
}

function isDocumentNav(request: Request): boolean {
  const dest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();
  return DOC_DEST.includes(dest);
}

function isInternalAsset(request: Request): boolean {
  return request.headers.get(INTERNAL_ASSET_HEADER) === "1";
}

function empty404(): Response {
  return new Response(null, { status: 404, headers: { "cache-control": "private, no-store" } });
}

function isMockPublicPath(path: string): boolean {
  return (
    path === "/dev" ||
    path === "/app/pages" ||
    path === "/app/home" ||
    path === "/app/ops" ||
    path.startsWith("/app/pages/") ||
    path.startsWith("/app/home/") ||
    path.startsWith("/app/ops/") ||
    path.startsWith("/dev/")
  );
}

function isOpsAssetPath(path: string): boolean {
  return path === "/app/ops" || path.startsWith("/app/ops/");
}

function redirectTo(
  url: URL,
  destPath: string,
  prefix: "en" | "de" | "fr" | "ar" | null,
): Response {
  url.pathname = destPath;
  const headers = new Headers({ location: url.toString() });
  if (prefix) {
    headers.set(
      "set-cookie",
      `NEXT_LOCALE=${prefix}; Path=/; SameSite=Lax; Secure; Max-Age=31536000`,
    );
  }
  return new Response(null, { status: 308, headers });
}

/** The address a page has in a language: prefixed on the nine indexable pages, else unchanged. */
function languageAddress(path: string, prefix: "en" | "de" | "fr" | "ar" | null): string {
  if (!prefix || prefix === "en" || !seoPageFor(path)?.indexable) return path;
  return path === "/" ? `/${prefix}` : `/${prefix}${path}`;
}

export function canonicalPublicFromLeak(pathname: string): string | null {
  const path = stripAssetExt(pathWithoutLocale(pathname));
  return DC_MOCK_CANONICAL[path] ?? null;
}

export function should404MockLeak(pathname: string): boolean {
  if (canonicalPublicFromLeak(pathname)) return false;
  const path = stripAssetExt(pathWithoutLocale(pathname));
  if (LEFTOVER_EXACT.includes(path) || path.startsWith("/ops/")) return true;
  if (isDevGalleryPath(path) && devGalleryEnabled()) return false;
  return isMockPublicPath(path);
}

/**
 * API routes that are links: the browser opens them as a document and they answer
 * with a redirect or a file. Everything else under /api stays hidden from the
 * address bar.
 *  - /api/checkout/return   after a payment, and Stripe's own return_url
 *  - /api/auth/callback     sign-up, magic-link and password-reset e-mail links
 * The calendar file route (/api/checkout/invite/*) is gone (26.3 D-30/D-41): the
 * confirmation page has no Add to calendar button, and a document GET there is 404.
 */
const BROWSER_API_EXACT: readonly string[] = Object.freeze([
  "/api/checkout/return",
  "/api/auth/callback",
]);
const BROWSER_API_ONE_SEGMENT: readonly string[] = Object.freeze([]);

function isBrowserApiLink(path: string): boolean {
  if (BROWSER_API_EXACT.includes(path)) return true;
  return BROWSER_API_ONE_SEGMENT.some((prefix) => {
    if (!path.startsWith(prefix)) return false;
    const rest = path.slice(prefix.length);
    return rest.length > 0 && !rest.includes("/");
  });
}

/**
 * Worker/middleware gate.
 * `"not-found"` → serve the product 404 page (document leftovers / browsed APIs).
 */
export function gatePublicRequest(request: Request): Response | "not-found" | null {
  const url = new URL(request.url);
  const dashboard = isDashboardHost(url.hostname);
  const prefix = dashboard ? null : localePrefix(url.pathname);
  const path = pathWithoutLocale(url.pathname);

  if (path === "/api" || path.startsWith("/api/")) {
    const hiddenDev = path === "/api/dev" || path.startsWith("/api/dev/");
    if (hiddenDev) return isDocumentNav(request) ? "not-found" : empty404();
    if (isBrowserApiLink(path)) return null;
    if (isDocumentNav(request)) {
      if (
        dashboard &&
        (path === "/api/staff/chauffeurs" || path.startsWith("/api/staff/chauffeurs/"))
      ) {
        return redirectTo(url, "/fleet/chauffeurs", null);
      }
      return "not-found";
    }
    return null;
  }

  if (isInternalAsset(request)) return null;

  // Dashboard mocks (`OpsSidebar.dc.html`, design-system, …) must hit CF assets.
  if (dashboard && isOpsAssetPath(path)) return null;

  if (!dashboard && (LEFTOVER_EXACT.includes(path) || path.startsWith("/ops/"))) {
    return "not-found";
  }

  if (isMockPublicPath(path)) {
    // Scripts, CSS, `.dc.html` mocks, fetch() — not address-bar visits.
    if (!isDocumentNav(request)) return null;
    const dest = canonicalPublicFromLeak(path);
    if (dest) return redirectTo(url, languageAddress(dest, prefix), prefix);
    return "not-found";
  }

  // Option B (2026-09-30): /de /fr /ar are real addresses on the indexable pages.
  if (prefix && languageAddress(path, prefix) === path) return redirectTo(url, path, prefix);

  return null;
}

/** @deprecated use gatePublicRequest */
export function gateLeakedMockRequest(request: Request): Response | null {
  const gated = gatePublicRequest(request);
  if (gated === "not-found") return empty404();
  return gated;
}

/** True for `/app/ops` and every file under it (the dashboard screens and their scripts). */
export function isOpsAssetRequest(request: Request): boolean {
  const { pathname } = new URL(request.url);
  return pathname === "/app/ops" || pathname.startsWith("/app/ops/");
}

/**
 * F16: the dashboard screens are served on the dashboard host only. Call with the
 * request already pinned to this Worker's surface (host = dashboard host on the
 * `vamos-dashboard` entrypoint), BEFORE any asset-host rewrite and BEFORE the
 * internal-asset header check (a public client can send that header).
 * Public host: a private no-store 404. Dashboard host: null (serve it).
 */
export function guardOpsAsset(request: Request): Response | null {
  if (!isOpsAssetRequest(request)) return null;
  if (isDashboardHost(new URL(request.url).hostname)) return null;
  const headers = new Headers({ "cache-control": "private, no-store" });
  applySecurityHeaders(headers);
  return new Response(null, { status: 404, headers });
}

/** Full security headers and noindex on a dashboard screen file (asset responses carry none). */
export function withOpsAssetHeaders(res: Response): Response {
  const headers = new Headers(res.headers);
  applySecurityHeaders(headers);
  headers.set("X-Robots-Tag", "noindex");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

/**
 * F16: answer a dashboard screen file straight from the assets binding. A named entrypoint
 * (`Dashboard`) does not pass through the asset layer, so the file is fetched here. Call only
 * after `guardOpsAsset` let the request through. A missing file stays a private no-store 404
 * that carries the security headers.
 */
export async function serveOpsAsset(
  request: Request,
  assets: { fetch(request: Request): Promise<Response> },
): Promise<Response> {
  const res = await assets.fetch(request);
  if (res.status === 404) {
    const headers = new Headers({ "cache-control": "private, no-store" });
    applySecurityHeaders(headers);
    headers.set("X-Robots-Tag", "noindex");
    return new Response(null, { status: 404, headers });
  }
  return withOpsAssetHeaders(res);
}
