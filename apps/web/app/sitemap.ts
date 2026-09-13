// apps/web/app/sitemap.ts
//
// D-30: XML sitemap is this allowlist, not PUBLIC_ROUTES. Languages are the
// on-page switcher — XML lists the unprefixed SITE_URL only. Never /de /fr /ar.

import type { MetadataRoute } from "next";
import { SITE_URL, type PublicRoute } from "@/lib/metadata";

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
  return SITEMAP_ROUTES.map((path) => {
    const suffix = path === "/" ? "" : path;
    return {
      url: `${SITE_URL}${suffix}` || `${SITE_URL}/`,
    };
  });
}
