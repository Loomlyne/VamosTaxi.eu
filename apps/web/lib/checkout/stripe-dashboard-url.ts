// apps/web/lib/checkout/stripe-dashboard-url.ts
//
// Phase 31 (D-06, C-01): the dashboard no longer sends refunds; REFUND opens the booking's
// PaymentIntent page in the Stripe Dashboard, where the owner refunds with Stripe's own button.
// This module builds that link and nothing else: pure, no I/O, no env access. The caller passes
// the mode read from the Worker's secret key (`stripeSecretKeyMode`), never a browser value, and
// the optional account id from the plain var STRIPE_ACCOUNT_ID.
//
// The origin is fixed. The account id and the PaymentIntent id are regex-checked, so neither can
// add a path segment, a query, a fragment or another host: a malformed account id is dropped (the
// link opens the account the owner is signed into), a malformed PaymentIntent id gives null.
//
// The URL forms (`/{acct}/payments/{pi}` live, `/{acct}/test/payments/{pi}` test) are research
// assumption A1 (31-RESEARCH Q4); the controller opens one on a real payment before ship.
// Server-only: the links are served on a staff-only admin route, so the account id never reaches a
// public page.

import type { StripeMode } from "./stripe-mode";

/** The only origin a dashboard link may point at. */
const STRIPE_DASHBOARD_ORIGIN = "https://dashboard.stripe.com";

/** A Stripe account id. No trimming: a value with spaces is malformed and dropped. */
const STRIPE_ACCOUNT_ID = /^acct_[A-Za-z0-9]{8,64}$/;

/** A PaymentIntent id, same shape discipline as the payment ids in stripe-fee.ts, `pi_` only. */
const PAYMENT_INTENT_ID = /^pi_[A-Za-z0-9_]{1,250}$/;

/**
 * The Stripe Dashboard page of one PaymentIntent, or null when the mode is unknown or the id is
 * not a PaymentIntent id. An account id that is unset or malformed leaves the account segment out.
 */
export function stripePaymentUrl(i: {
  mode: StripeMode | null;
  accountId?: string | null;
  paymentIntentId: string;
}): string | null {
  if (i.mode !== "live" && i.mode !== "test") return null;
  if (typeof i.paymentIntentId !== "string" || !PAYMENT_INTENT_ID.test(i.paymentIntentId)) return null;
  const account =
    typeof i.accountId === "string" && STRIPE_ACCOUNT_ID.test(i.accountId) ? `/${i.accountId}` : "";
  const test = i.mode === "test" ? "/test" : "";
  return `${STRIPE_DASHBOARD_ORIGIN}${account}${test}/payments/${i.paymentIntentId}`;
}
