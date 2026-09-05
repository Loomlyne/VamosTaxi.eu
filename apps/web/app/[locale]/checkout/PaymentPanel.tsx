"use client";

// D-21: the mock's Card/PayPal/Cash radios are gone. PayPal has no Swiss-merchant
// Stripe support (OWNER-ANSWERS.md) and cash-to-driver is ADR-014 §6 No. Stripe's
// Payment Element is the method picker. CheckoutProvider is Stripe's
// CheckoutElementsProvider (Dahlia / @stripe/react-stripe-js@9).

import { CheckoutElementsProvider as CheckoutProvider, CurrencySelectorElement, PaymentElement } from "@stripe/react-stripe-js/checkout";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useMemo } from "react";

let stripePromise: Promise<Stripe | null> | null = null;

function stripe(publishableKey: string): Promise<Stripe | null> {
  if (!stripePromise) stripePromise = loadStripe(publishableKey);
  return stripePromise;
}

export function PaymentPanel({
  publishableKey,
  clientSecret,
}: {
  publishableKey: string;
  clientSecret: string;
}) {
  const promise = useMemo(() => stripe(publishableKey), [publishableKey]);

  return (
    <div className="vt-checkout__pay">
      <CheckoutProvider
        stripe={promise}
        options={{ clientSecret }}
      >
        <CurrencySelectorElement />
        <PaymentElement />
      </CheckoutProvider>
    </div>
  );
}
