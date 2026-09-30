import type { EmailLocale } from "./types";

/** `scheduledLocal` is already a Zurich wall clock, not a UTC instant. */
export function formatPickup(iso: string, locale: EmailLocale): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso.trim());
  if (!m) return iso;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])));
  if (Number.isNaN(dt.getTime())) return iso;
  const tag = locale === "ar" ? "ar" : locale === "de" ? "de-CH" : locale === "fr" ? "fr-CH" : "en-GB";
  const date = new Intl.DateTimeFormat(tag, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
  return `${date} · ${m[4]}:${m[5]}`;
}
