// apps/web/lib/checkout/currency.ts
//
// Charge currency and Stripe locale map for checkout. Display FX lives in
// lib/fx. Adaptive Pricing may convert presentment; charged currency is CHF.

import type Stripe from "stripe";

/** Stripe `price_data.currency` — CHF is the only priced currency (ADR-004). */
export const CHARGE_CURRENCY = "chf" as const;

export type CheckoutLocale = "en" | "de" | "fr" | "ar";

/**
 * Maps Vamos locale → Checkout Session `locale`. `"ar"` is not in Stripe's
 * published enum; it is still passed through (OtherString) so the Payment
 * Element can follow the page locale rather than silently falling back to `en`.
 */
export function stripeLocale(
  locale: CheckoutLocale,
): Stripe.Checkout.SessionCreateParams.Locale {
  return locale;
}
