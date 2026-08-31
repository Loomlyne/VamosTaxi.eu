import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import {
  mintVamosQs,
  VAMOS_QS_ATTRS,
  VAMOS_QS_COOKIE,
  verifyVamosQs,
} from "./lib/abuse/vamos-qs";
import { updateSession } from "./lib/supabase/middleware";

const handleI18nRouting = createMiddleware(routing);

const DC_HOME = "/app/home/home.html";
const DC_OPS = "/app/ops/ops.html";
const DC_OPS_LOGIN = "/app/ops/ops-login.html";
const DASHBOARD_HOSTS = new Set(["dashboard.vamostaxi.site"]);

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
  "/checkout": "/app/pages/checkout.html",
  "/confirmation": "/app/pages/confirmation.html",
  "/manage-booking": "/app/pages/manage-booking.html",
  "/account": "/app/pages/account.html",
  "/bookings": "/app/pages/bookings.html",
  "/coming-soon": "/app/pages/coming-soon.html",
};

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

function requestHost(request: NextRequest): string {
  return (request.headers.get("host") ?? "").split(":")[0]?.toLowerCase() ?? "";
}

function dcMockPath(pathname: string): string | null {
  return DC_PAGES[stripLocalePath(pathname)] ?? null;
}

function dashboardMockPath(request: NextRequest): string | null {
  if (!DASHBOARD_HOSTS.has(requestHost(request))) return null;
  const path = stripLocalePath(request.nextUrl.pathname);
  if (path === "/ops-login" || path === "/login") return DC_OPS_LOGIN;
  return DC_OPS;
}

async function serveDcHtml(request: NextRequest, mock: string): Promise<NextResponse> {
  const asset = new URL(mock, request.url);
  const res = await fetch(asset);
  const headers = new Headers(res.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  return new NextResponse(res.body, { status: res.status, headers });
}

function qsSecret(): string {
  const value = process.env.VAMOS_QS_SECRET;
  return typeof value === "string" ? value : "";
}

export default async function middleware(request: NextRequest) {
  const dashboard = dashboardMockPath(request);
  if (dashboard) {
    return serveDcHtml(request, dashboard);
  }

  const mock = dcMockPath(request.nextUrl.pathname);
  if (mock) {
    return serveDcHtml(request, mock);
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
  const { pathname } = request.nextUrl;
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

  // Auth cookie refresh only on the page path. A 3xx never reaches a Server
  // Component, so skip updateSession — and never construct a new response on
  // the session-refresh path (D-02).
  const isRedirect =
    finalResponse.status >= 300 &&
    finalResponse.status < 400 &&
    Boolean(finalResponse.headers.get("location"));
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
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
