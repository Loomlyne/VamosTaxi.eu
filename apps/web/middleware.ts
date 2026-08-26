import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);

export default function middleware(request: NextRequest) {
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

  return finalResponse;
}

export const config = {
  // Match every path except Next internals, the dev-only gallery's static
  // assets, and files that carry an extension (fonts/icons/images served
  // from public/brand/ per D-10).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
