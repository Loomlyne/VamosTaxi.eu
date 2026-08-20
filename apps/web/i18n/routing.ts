import { defineRouting } from "next-intl/routing";

// The published URL contract (D-11, D-12; checkpoint resolved 2026-08-20,
// option-a): one dynamic `[locale]` segment, English unprefixed at the
// root, German/French/Arabic prefixed. `localePrefix: 'as-needed'` is what
// makes `/en/about` respond with a 308 redirect to `/about` rather than
// serving duplicate content at two URLs — this is next-intl's own default
// for this mode, not extra configuration. Exactly one canonical URL per
// page, which is what the Phase 11 Freshpage redirect map and the sitemap
// (D-19) both need.
//
// Reversibility: one-way. This is the published contract every hreflang
// alternate and every indexed link is generated against — changing it
// after launch is a redirect migration, not a refactor.
export const routing = defineRouting({
  locales: ["en", "de", "fr", "ar"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
