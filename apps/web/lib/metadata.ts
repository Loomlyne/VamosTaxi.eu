// apps/web/lib/metadata.ts
//
// D-19: hreflang alternates and the sitemap are generated from one shared route list —
// not per-page metadata exports. Eighteen public pages (the mock inventory under
// `app/pages/` plus home) is eighteen places to forget one; this file is that one place.
// Later phases add a route to `PUBLIC_ROUTES` as they build it and both the alternates
// and `app/sitemap.ts` (which walks this same array — see that file) pick it up for
// free, with no second list to keep in sync.
//
// Server-only module (Metadata generation and `app/sitemap.ts` both run on the server) —
// no client-exposed env var is needed here, so this deliberately does not introduce a
// new `NEXT_PUBLIC_*` identifier that would need registering in
// `scripts/public-env-allowlist.json` (D-35) for a value nothing client-side reads.

import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { isSeoLang, seoAddress, seoPageFor } from "@/lib/seo/head";

/** D-33: the published production domain. Staging serves the same alternates under its
 *  own host with `X-Robots-Tag: noindex` (middleware.ts) — the canonical URLs declared
 *  here describe the production site's own shape, not whichever host is currently
 *  serving the request. */
export const SITE_URL = "https://vamostaxi.site";

/**
 * The public route contract (D-19's own count), derived from the mock inventory
 * under `app/pages/` plus home. Every entry here is a static, non-parameterised path —
 * `booking-detail.dc.html` (a `[ref]`-scoped page per PROJECT.md's route table) is
 * deliberately excluded: this helper only knows how to alternate a fixed path today,
 * and a phase that builds a dynamic-segment page extends `buildAlternates` (or calls it
 * per-instance with a resolved path) rather than listing an unresolvable pattern here.
 *
 * Phase ownership for routes this phase does not build (D-01 / PHASE_5_ROUTES):
 *   /checkout, /confirmation → Phase 7
 *   /account, /bookings → Phase 8
 *   /manage-booking → Phase 9
 * `/coming-soon` maps to no requirement id — unowned, flagged for the owner in
 * plan 05-24. Kept in PUBLIC_ROUTES so the published sitemap does not silently
 * drop it. Do not delete this entry to "fix" a 404.
 */
export const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/account",
  "/bookings",
  "/cancellation",
  "/checkout",
  "/coming-soon",
  "/confirmation",
  "/contact",
  "/cookies",
  "/faq",
  "/imprint",
  "/manage-booking",
  "/privacy",
  "/reset-password",
  "/sign-in",
  // `/sign-up` is its own canonical URL (not `/sign-in?mode=signup`). One path
  // per page is what `buildAlternates` and `app/sitemap.ts` both walk, and what
  // next-intl `localePrefix: "as-needed"` publishes as a single hreflang set.
  "/sign-up",
  "/sitemap",
  "/terms",
] as const;

export type PublicRoute = (typeof PUBLIC_ROUTES)[number];

function localizedUrl(locale: string, path: PublicRoute): string {
  // Option B (2026-09-30): the nine indexable pages live at /de /fr /ar. Every other
  // route keeps its one unprefixed address.
  const page = seoPageFor(path);
  if (page?.indexable && isSeoLang(locale)) return seoAddress(path, locale);
  const suffix = path === "/" ? "" : path;
  return `${SITE_URL}${suffix}` || `${SITE_URL}/`;
}

/**
 * All four language alternates plus `x-default`, for one route — the single helper
 * D-19 asks every public page to call instead of declaring its own `alternates` block.
 * `x-default` and the canonical URL both point at the unprefixed (English) path, since
 * D-12 puts English at the root.
 */
export function buildAlternates(path: PublicRoute): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = localizedUrl(locale, path);
  }
  languages["x-default"] = localizedUrl(routing.defaultLocale, path);

  return {
    canonical: localizedUrl(routing.defaultLocale, path),
    languages,
  };
}
