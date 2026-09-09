// apps/web/lib/checkout/steps.ts
//
// D-30 step URLs and deep-link bounce. Pure — no identity, no db, no Stripe.

export const CHECKOUT_STEPS = ["trip", "details", "payment"] as const;

export type CheckoutStep = (typeof CHECKOUT_STEPS)[number];

export type CheckoutTripLock = {
  lock?: string | null;
  quote_id?: string | null;
  quoteId?: string | null;
  detailsComplete?: boolean | null;
  expires_at?: string | null;
};

export function lockExpired(trip: CheckoutTripLock | null | undefined): boolean {
  const raw = trip?.expires_at;
  if (!raw) return false;
  const at = Date.parse(raw);
  return Number.isFinite(at) && at < Date.now();
}

export function hasQuoteLock(trip: CheckoutTripLock | null | undefined): boolean {
  if (!trip) return false;
  const id = trip.quote_id || trip.quoteId;
  if (!trip.lock || !id) return false;
  return !lockExpired(trip);
}

export function hasDetails(trip: CheckoutTripLock | null | undefined): boolean {
  return Boolean(trip?.detailsComplete);
}

/** Unprefixed path to send the visitor to, or null to stay. */
export function bouncePath(
  step: CheckoutStep,
  trip: CheckoutTripLock | null | undefined,
): string | null {
  if (!hasQuoteLock(trip)) return "/";
  if (step === "payment" && !hasDetails(trip)) return "/checkout/details";
  return null;
}

export function bareCheckoutPath(trip: CheckoutTripLock | null | undefined): string {
  return hasQuoteLock(trip) ? "/checkout/trip" : "/";
}

export function localePath(locale: string, path: string): string {
  if (!locale || locale === "en") return path;
  if (path === "/") return `/${locale}`;
  return `/${locale}${path}`;
}

export function checkoutStepPath(step: CheckoutStep): `/checkout/${CheckoutStep}` {
  return `/checkout/${step}`;
}

/**
 * Hours for ICU `{hours}` copy when the window is a whole number of hours.
 * Do not hardcode 24 — the minutes come from quote_settings_version.
 */
export function checkoutWindowHours(minutes: number | null | undefined): number | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  if (minutes % 60 !== 0) return null;
  return minutes / 60;
}
