import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import {
  mintVamosQs,
  VAMOS_QS_ATTRS,
  VAMOS_QS_COOKIE,
  verifyVamosQs,
} from "./lib/abuse/vamos-qs";
import { publicDashboardPath } from "./lib/ops/paths";
import { vamosRoleFromAccessToken } from "./lib/ops/session";
import {
  createSupabaseMiddlewareClient,
  updateSession,
} from "./lib/supabase/middleware";

const handleI18nRouting = createMiddleware(routing);

const DC_HOME = "/app/home/home.html";
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
  "/confirmation": "/app/pages/confirmation.html",
  "/manage-booking": "/app/pages/manage-booking.html",
  "/account": "/app/pages/account.html",
  "/bookings": "/app/pages/bookings.html",
  "/coming-soon": "/app/pages/coming-soon.html",
};

const OPS_EXEMPT = new Set(["/ops/sign-in", "/ops/mfa-challenge", "/ops/accept-invite"]);

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
  return DC_PAGES[stripLocalePath(pathname)] ?? null;
}

async function serveDcHtml(request: NextRequest, mock: string): Promise<NextResponse> {
  const asset = new URL(mock, request.url);
  const res = await fetch(asset);
  let html = await res.text();
  if (mock === DC_PAGES["/contact"]) {
    const siteKey = process.env.TURNSTILE_SITE_KEY ?? "";
    html = html.replace(/<head([^>]*)>/i, `<head$1><meta name="vt-turnstile-site-key" content="${siteKey.replace(/&/g, "&amp;").replace(/\"/g, "&quot;")}">`);
  }
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

async function serveOpsDc(
  request: NextRequest,
  cookieSource: NextResponse,
  file: "ops.dc.html" | "ops-login.dc.html",
  injectAuth: boolean,
): Promise<NextResponse> {
  const asset = new URL(`/app/ops/${file}`, request.url);
  const res = await fetch(asset);
  let html = await res.text();
  const boot = [
    html.includes('href="/app/ops/"') ? "" : '<base href="/app/ops/">',
    injectAuth ? '<script>try{localStorage.setItem("vamosOpsAuth","1")}catch(e){}</script>' : "",
  ].join("");
  html = html.replace(/<head([^>]*)>/i, `<head$1>${boot}`);
  const headers = new Headers();
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "private, no-store");
  const out = new NextResponse(html, { status: res.status, headers });
  copyCookies(cookieSource, out);
  out.cookies.set("vamos_dash", "1", { path: "/", sameSite: "lax", secure: true });
  return applyStagingNoindex(await updateSession(request, out));
}

function qsSecret(): string {
  const value = process.env.VAMOS_QS_SECRET;
  return typeof value === "string" ? value : "";
}

function hostnameOf(request: NextRequest): string {
  return (request.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
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
  return OPS_EXEMPT.has(path);
}

/**
 * D-01a: the staff console lives on dashboard.vamostaxi.site.
 * vamostaxi.site never enters the ops branch. Local next-dev treats
 * `/ops/*` as the dashboard so the gate can be exercised without a
 * hosts-file entry. Do not bind vamostaxi.eu.
 */
function isOpsChangesPreviewHost(host: string): boolean {
  return host === "vamos-ops-changes.koussayzayeni.workers.dev"
    || host.endsWith("-vamos-ops-changes.koussayzayeni.workers.dev")
    || host === "vamos-web-ops-changes.koussayzayeni.workers.dev"
    || host.endsWith("-vamos-web-ops-changes.koussayzayeni.workers.dev");
}

function isNamedDashboardHost(request: NextRequest): boolean {
  const host = hostnameOf(request);
  return host === "dashboard.vamostaxi.site"
    || host === "dashboard.localhost"
    || isOpsChangesPreviewHost(host);
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

async function dashboardHostMiddleware(request: NextRequest): Promise<NextResponse> {
  const { path } = localeStrippedPath(request.nextUrl.pathname);

  if (path === "/ops" || path.startsWith("/ops/")) {
    const pub = publicDashboardPath(path);
    const dest = pub === "/" || pub === "" ? "/" : "/login";
    return applyStagingNoindex(NextResponse.redirect(dashboardAbs(request, dest), 308));
  }

  if (process.env.DEPLOY_ENV === "ops-changes") {
    if (path === "/login") {
      return serveOpsDc(request, new NextResponse(), "ops-login.dc.html", false);
    }
    if (path !== "/") {
      return applyStagingNoindex(NextResponse.redirect(dashboardAbs(request, "/"), 307));
    }
    return serveOpsDc(request, new NextResponse(), "ops.dc.html", true);
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
  const inConsole = role === "admin" || role === "dispatcher";

  if (inConsole) {
    if (path !== "/") {
      return applyStagingNoindex(
        copyCookies(client.response, NextResponse.redirect(dashboardAbs(request, "/"), 307)),
      );
    }
    return serveOpsDc(request, client.response, "ops.dc.html", true);
  }

  if (path === "/login") {
    return serveOpsDc(request, client.response, "ops-login.dc.html", false);
  }
  return applyStagingNoindex(
    copyCookies(client.response, NextResponse.redirect(dashboardAbs(request, "/login"), 308)),
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

function applyStagingNoindex(response: NextResponse): NextResponse {
  if (process.env.DEPLOY_ENV === "staging" || process.env.DEPLOY_ENV === "ops-changes") {
    response.headers.set("X-Robots-Tag", "noindex");
  }
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
        copyCookies(client.response, NextResponse.redirect(opsRedirectUrl(request, "/ops/sign-in"))),
      );
    }
    const role = user.app_metadata?.vamos_role;
    if (typeof role !== "string" || role.length === 0) {
      return applyStagingNoindex(
        copyCookies(client.response, NextResponse.redirect(opsRedirectUrl(request, "/"))),
      );
    }
    const { data: aal } = await client.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel !== "aal2") {
      return applyStagingNoindex(
        copyCookies(client.response, NextResponse.redirect(opsRedirectUrl(request, "/ops/mfa-challenge"))),
      );
    }
  }

  i18nResponse.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === "set-cookie" || lower === "location") return;
    client.response.headers.set(key, value);
  });
  return applyStagingNoindex(withOpsPathHeader(request, client.response));
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // This Worker is dashboard-only. Never serve the public site.
  if (process.env.DEPLOY_ENV === "ops-changes") {
    return dashboardHostMiddleware(request);
  }

  // Public host never serves the console (D-01a).
  if (!isDashboardHost(request) && isOpsRequest(pathname)) {
    return applyStagingNoindex(NextResponse.redirect(new URL("/", request.url)));
  }

  // Named dashboard host: public URLs have no /ops prefix.
  if (isNamedDashboardHost(request)) {
    return dashboardHostMiddleware(request);
  }

  // Dashboard host is the console, not the public mock gallery.
  if (isDashboardHost(request)) {
    if (!isOpsRequest(pathname)) {
      return applyStagingNoindex(NextResponse.redirect(opsRedirectUrl(request, "/ops")));
    }
  } else {
    const mock = dcMockPath(pathname);
    if (mock) {
      const html = await serveDcHtml(request, mock);
      return applyStagingNoindex(await updateSession(request, html));
    }
  }

  const response = handleI18nRouting(request);

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

  // D-37/T-01-04: staging carries a noindex header so nothing half-built competes with the
  // live site's search ranking; production must never carry it. `DEPLOY_ENV` is a plain,
  // non-secret `vars` entry set only under `apps/web/wrangler.jsonc`'s `env.staging` (typed
  // in `apps/web/lib/env.d.ts`) — undefined under `env.production`, so this branch is a
  // structural no-op there rather than something a forgotten flag flip could leak.
  //
  // Cloudflare Access — the other half of D-37's "staging is gated and unindexed" — is
  // deferred by explicit owner decision; see docs/build/CLOUDFLARE-RESOURCES.md. This
  // header alone does not stop a human or scraper from reaching the URL, only from it
  // ranking if they do.
  if (process.env.DEPLOY_ENV === "staging") {
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

  return finalResponse;
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
