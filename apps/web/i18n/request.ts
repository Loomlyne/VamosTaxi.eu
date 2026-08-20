import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";
import { routing, type Locale } from "./routing";

/**
 * The loader seam D-14 names: Phase 1's implementation reads the matching
 * JSON file below; Phase 6 swaps this function's body for a
 * `content_strings` query and no call site elsewhere has to move.
 */
async function loadMessages(locale: Locale) {
  return (await import(`./messages/${locale}.json`)).default;
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;

  // T-01-02 (Tampering): the `[locale]` route param is matched against the
  // fixed four-locale list before it is ever used to build a path or a
  // dictionary key. An unrecognised segment 404s here rather than being
  // concatenated into an `import()` specifier or a lookup key.
  const locale = routing.locales.find((supported) => supported === requested);
  if (!locale) {
    notFound();
  }

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
