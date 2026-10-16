// apps/web/lib/ops/quote-lock-hours.ts
//
// Pricing › Distance rules "Price stays valid for" (decision 2026-10-13 item 13, signed 2026-10-14):
// the field sends whole hours, the rate-book PUT stores rate_versions.quote_lock_minutes, and Publish
// copies them onto the settings row as both clocks (item 17, quick 261015-6om).
//
// Maximum: 24 hours, signed by the owner on 2026-10-15 (quick 261015-6om, Task 3 b). Until then no
// maximum was decided and only the int4 column bounded the value. The cap closes the gap left open by
// D3 (plan amendment A1.1): a pay link holds the price a fixed 24 hours from sending and its email says
// so, so checkout can never promise a longer hold than the pay link keeps.
//
// Kept outside route.ts because a Next.js route file may only export its handlers and route config.

/** 24 hours: the longest "Price stays valid for" the owner allows (signed 2026-10-15). */
export const QUOTE_LOCK_MAX_MINUTES = 1440;

/** True for whole minutes from one hour up to the 24-hour cap. */
export function quoteLockMinutesWithinCap(minutes: number): boolean {
  return Number.isSafeInteger(minutes) && minutes >= 60 && minutes <= QUOTE_LOCK_MAX_MINUTES;
}

/**
 * The minutes to store for the field's value, or null when it is not a whole number of hours from 1
 * to 24 (the PUT answers 400 invalid). Accepts a number or a digit string.
 */
export function quoteLockMinutesFromWholeHours(hours: unknown): number | null {
  let n: number;
  if (typeof hours === "number") {
    n = hours;
  } else if (typeof hours === "string" && /^\d+$/.test(hours.trim())) {
    n = Number(hours.trim());
  } else {
    return null;
  }
  if (!Number.isSafeInteger(n) || n < 1) return null;
  const minutes = n * 60;
  return quoteLockMinutesWithinCap(minutes) ? minutes : null;
}
