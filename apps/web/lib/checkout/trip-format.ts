// Trip strip line 2: "Tue 29 Sept, 08:15". The URL carries the Zurich wall clock
// (`YYYY-MM-DDTHH:MM`), so it is formatted as a plain calendar value, never shifted
// by the visitor's time zone.

const TAG: Record<string, string> = { en: "en-GB", de: "de-CH", fr: "fr-CH", ar: "ar-u-nu-latn" };

export function formatTripWhen(when: string | null, locale: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(when ?? "");
  if (!m) return "";
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const day = new Intl.DateTimeFormat(TAG[locale] ?? "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, mo - 1, d)));
  return `${day}, ${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** `2026-10-02T08:15` -> `{ date: "2026-10-02", time: "08:15" }`. */
export function splitWhen(when: string | null): { date: string; time: string } {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(when ?? "");
  return m ? { date: m[1] as string, time: m[2] as string } : { date: "", time: "" };
}

export function joinWhen(date: string, time: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(time) ? `${date}T${time}` : null;
}
