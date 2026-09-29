// apps/web/lib/checkout/pay-link-hosted-session.ts
//
// G8 (D-48): the one place that gets-or-creates the Stripe-hosted Checkout
// session for a booking that already passed the pay-link guards (token row
// read, is_test, charge > 0, UAE-prefix stop). Used by the customer's
// /api/checkout/pay-link/open and by the dashboard's Take card. Never a
// client secret, never a card form of ours.

export const dynamic = "force-dynamic";

import { asCheckout } from "@/lib/db/identity";
import { refuse } from "@/lib/checkout/errors";
import { attachPayment } from "@/lib/checkout/attach-payment";
import { loadOpenPayment } from "@/lib/checkout/load-open-payment";
import {
  checkoutPaymentIntentId,
  createCheckoutSession,
  retrieveCheckoutSession,
  checkoutPaymentMethodTypes,
  hostedSessionIsPayable,
  stripeFromEnv,
} from "@/lib/checkout/stripe";
import type { CheckoutLocale } from "@/lib/checkout/currency";

export type HostedPayLinkInput = {
  bookingId: string;
  quoteId: string;
  reference: string;
  payerEmail: string;
  locale: CheckoutLocale;
  charged: number;
  expiresAt: Date;
  successUrl: string;
  cancelUrl: string;
};

export type HostedPayLinkResult =
  | { ok: true; session: { id: string; url: string } }
  | { ok: false; response: Response };

function sqlState(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string") {
    return (err as { code: string }).code;
  }
  return undefined;
}

export async function openHostedPayLinkSession(
  env: CloudflareEnv,
  input: HostedPayLinkInput,
): Promise<HostedPayLinkResult> {
  const { bookingId, quoteId, reference, payerEmail, locale, charged, expiresAt } = input;
  const stripe = stripeFromEnv(env);

  const existing = await asCheckout(env, null, (sql) => loadOpenPayment(sql, quoteId));
  if (existing) {
    const stored = await retrieveCheckoutSession(stripe, existing.stripe_checkout_session_id).catch(
      () => null,
    );
    if (hostedSessionIsPayable(stored, charged) && stored.url) {
      return { ok: true, session: { id: stored.id, url: stored.url } };
    }
  }

  const session = await createCheckoutSession(stripe, {
    chargedRappen: charged,
    bookingId,
    bookingReference: reference,
    customerEmail: payerEmail,
    locale,
    idempotencyKey: `paylink:${reference}:${Math.floor(expiresAt.getTime() / 1000)}`,
    expiresAt,
    uiMode: "hosted_page",
    successUrl: input.successUrl,
    cancelUrl: input.cancelUrl,
    twint: checkoutPaymentMethodTypes(env).includes("twint"),
    productName: `Vamos Taxi ${reference}`,
  });

  const pi = checkoutPaymentIntentId(session);
  if (!session.url) return { ok: false, response: refuse("invalid_request") };

  try {
    await asCheckout(env, null, (sql) =>
      attachPayment(sql, {
        quoteId,
        stripePaymentIntentId: pi,
        stripeCheckoutSessionId: session.id,
        chargedRappen: charged,
      }),
    );
  } catch (err) {
    const state = sqlState(err);
    if (state === "23001" || state === "23505") {
      const open = await asCheckout(env, null, (sql) => loadOpenPayment(sql, quoteId));
      if (open) {
        const stored = await retrieveCheckoutSession(stripe, open.stripe_checkout_session_id).catch(
          () => null,
        );
        if (hostedSessionIsPayable(stored, charged) && stored.url) {
          return { ok: true, session: { id: stored.id, url: stored.url } };
        }
      }
      return { ok: false, response: refuse("quote_already_booked") };
    }
    if (state === "23P01") return { ok: false, response: refuse("quote_expired") };
    throw err;
  }

  return { ok: true, session: { id: session.id, url: session.url } };
}
