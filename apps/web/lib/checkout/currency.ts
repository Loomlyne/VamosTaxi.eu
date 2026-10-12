// apps/web/lib/checkout/currency.ts
//
// Charge currency and Stripe locale map for checkout. Display FX lives in
// lib/fx, display only. Adaptive Pricing is off (J8): the charged currency is CHF, always.

import type Stripe from "stripe";

/** Stripe `price_data.currency` — CHF is the only priced currency (ADR-004). */
export const CHARGE_CURRENCY = "chf" as const;

export type CheckoutLocale = "en" | "de" | "fr" | "ar";

/**
 * Maps Vamos locale → Checkout Session `locale`. en/de/fr pass as-is. `"ar"`
 * is sent too (Stripe's enum read 2026-09-29 lists it; D-22); if Stripe refuses
 * the locale, createCheckoutSession retries once with `en`.
 *
 * J8 (W1-13), UNVERIFIED: the installed SDK (stripe 22.6.1, OpenAPI v2442) lists no `ar` among the Checkout
 * locales (its type accepts any string). If the live API refuses `ar`, every Arabic Pay is two requests and
 * the Stripe page is English. Left as is until one sandbox session with `locale: "ar"` shows which branch runs.
 */
export function stripeLocale(
  locale: CheckoutLocale,
): Stripe.Checkout.SessionCreateParams.Locale {
  return locale;
}
