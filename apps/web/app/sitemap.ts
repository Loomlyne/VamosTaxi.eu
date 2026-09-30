// apps/web/app/sitemap.ts
//
// D-30: the XML sitemap is this allowlist, not PUBLIC_ROUTES. Option B (2026-09-30): each
// page is listed once per language address with its hreflang set. lib/seo/head.test.ts
// fails when this list and the indexable rows of lib/seo/pages.json differ.

import type { MetadataRoute } from "next";
import type { PublicRoute } from "@/lib/metadata";
import { SEO_LANGS, seoAddress } from "@/lib/seo/head";

export const SITEMAP_ROUTES = [
  "/",
  "/about",
  "/faq",
  "/contact",
  "/terms",
  "/privacy",
  "/imprint",
  "/cookies",
  "/cancellation",
] as const satisfies readonly PublicRoute[];

export default function sitemap(): MetadataRoute.Sitemap {
  return SITEMAP_ROUTES.flatMap((path) =>
    SEO_LANGS.map((lang) => ({
      url: seoAddress(path, lang),
      alternates: {
        languages: Object.fromEntries(SEO_LANGS.map((l) => [l, seoAddress(path, l)])),
      },
    })),
  );
}
