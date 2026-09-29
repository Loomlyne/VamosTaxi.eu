/** Locale the geo and quote APIs accept; anything else falls back to English. */
export function geoLocale(locale: string): "en" | "de" | "fr" | "ar" {
  if (locale === "de" || locale === "fr" || locale === "ar") return locale;
  return "en";
}
