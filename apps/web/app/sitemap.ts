// apps/web/app/sitemap.ts
//
// D-19: walks the exact same `PUBLIC_ROUTES` array `apps/web/lib/metadata.ts`'s
// `buildAlternates` walks — sharing the list, rather than each maintaining its own, is
// what makes the sitemap and the hreflang alternates unable to drift apart. Next's own
// `sitemap.ts` file convention serves this at `/sitemap.xml` with no further wiring.
//
// Dev-only gallery routes (`app/[locale]/dev/components/**`) are never listed in
// `PUBLIC_ROUTES`, so they are structurally absent here — not filtered out after the
// fact, which would be one more place a future addition could forget the exclusion.

import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { PUBLIC_ROUTES, SITE_URL } from "@/lib/metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path) => {
    const suffix = path === "/" ? "" : path;
    const languages: Record<string, string> = {};
    for (const locale of routing.locales) {
      const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
      languages[locale] = `${SITE_URL}${prefix}${suffix}` || `${SITE_URL}/`;
    }

    return {
      url: `${SITE_URL}${suffix}` || `${SITE_URL}/`,
      alternates: { languages },
    };
  });
}
