// apps/web/app/sitemap.ts
//
// D-19: walks the exact same `PUBLIC_ROUTES` array `apps/web/lib/metadata.ts`'s
// `buildAlternates` walks. Languages are the on-page switcher — XML lists the
// unprefixed URL only. Never /de /fr /ar.

import type { MetadataRoute } from "next";
import { PUBLIC_ROUTES, SITE_URL } from "@/lib/metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => {
    const suffix = path === "/" ? "" : path;
    return {
      url: `${SITE_URL}${suffix}` || `${SITE_URL}/`,
    };
  });
}
