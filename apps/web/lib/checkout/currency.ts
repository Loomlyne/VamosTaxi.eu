// apps/web/lib/checkout/currency.ts
//
// Charge currency and Stripe locale map for checkout. Display FX lives in
// lib/fx. Adaptive Pricing may convert presentment; charged currency is CHF.

import type Stripe from "stripe";

/** Stripe `price_data.currency` — CHF is the only priced currency (ADR-004). */
export const CHARGE_CURRENCY = "chf" as const;

export type CheckoutLocale = "en" | "de" | "fr" | "ar";

/**
 * Maps Vamos locale → Checkout Session `locale`. en/de/fr pass as-is. `"ar"`
 * is sent too (Stripe's enum read 2026-09-29 lists it; D-22); if Stripe refuses
 * the locale, createCheckoutSession retries once with `en`.
 */
export function stripeLocale(
  locale: CheckoutLocale,
): Stripe.Checkout.SessionCreateParams.Locale {
  return locale;
}
