"use client";

// D-21: mock payment radios are gone (ADR-014 §6). Stripe's Payment Element
// is the method picker. CheckoutProvider is Stripe's CheckoutElementsProvider
// (Dahlia / @stripe/react-stripe-js).
//
// Browser: one Stripe.js object per document — module-scoped on purpose.
// Server stripeFromEnv() is per-request. Do not "fix" either into the other.

import {
  CheckoutElementsProvider as CheckoutProvider,
  CurrencySelectorElement,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import { loadStripe, type Appearance, type Stripe } from "@stripe/stripe-js";
import { createNavigation } from "next-intl/navigation";
import { useEffect, useMemo, useState } from "react";
import { routing } from "@/i18n/routing";

const { useRouter } = createNavigation(routing);

let stripePromise: Promise<Stripe | null> | null = null;

function browserStripe(publishableKey: string): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || publishableKey;
  if (!stripePromise) stripePromise = loadStripe(key);
  return stripePromise;
}

// Hex values exist in design-system/tokens/colors.css. An Element cannot
// resolve var(--vt-*). No coloured glow: focus is the charcoal border.
const APPEARANCE: Appearance = {
  theme: "stripe",
  variables: {
    colorPrimary: "#1E1F1F",
    colorBackground: "#FFFFFF",
    colorText: "#1E1F1F",
    colorTextSecondary: "#545756",
    colorTextPlaceholder: "#767877",
    colorDanger: "#1E1F1F",
    fontFamily: "Poppins, system-ui, sans-serif",
    borderRadius: "999px",
    spacingUnit: "4px",
    gridRowSpacing: "16px",
  },
  rules: {
    ".Input": {
      border: "1px solid #DEDEDE",
      boxShadow: "none",
      height: "54px",
      backgroundColor: "#FFFFFF",
    },
    ".Input:focus": {
      border: "1px solid #1E1F1F",
      boxShadow: "none",
    },
  },
};

export function PaymentPanel({
  publishableKey,
  clientSecret,
  reference,
  onReady,
}: {
  publishableKey: string;
  clientSecret: string;
  reference: string;
  onReady: (confirm: () => Promise<void>) => void;
}) {
  const promise = useMemo(() => browserStripe(publishableKey), [publishableKey]);

  return (
    <div className="vt-checkout__pay" data-checkout-pay>
      <CheckoutProvider
        stripe={promise}
        options={{
          clientSecret,
          elementsOptions: { appearance: APPEARANCE },
        }}
      >
        <CurrencySelectorElement />
        <PaymentElement />
        <ConfirmBinder reference={reference} onReady={onReady} />
      </CheckoutProvider>
    </div>
  );
}

function ConfirmBinder({
  reference,
  onReady,
}: {
  reference: string;
  onReady: (confirm: () => Promise<void>) => void;
}) {
  const checkout = useCheckoutElements();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (checkout.type !== "success") return;
    onReady(async () => {
      setError(null);
      // D-16: Stripe confirm only. This page never writes booking status.
      // /confirmation/{reference} is processing until the webhook lands.
      // TWINT and 3DS may never return to this tab — this handler must be
      // safe to never resume.
      const result = await checkout.checkout.confirm({
        redirect: "if_required",
      });
      if (result.type === "error") {
        setError(result.error.message);
        throw new Error(result.error.message);
      }
      router.push(`/confirmation/${reference}`);
    });
  }, [checkout, onReady, reference, router]);

  if (checkout.type === "loading") {
    return <div data-checkout-pay-skeleton aria-hidden="true" />;
  }
  if (checkout.type === "error") {
    return <p data-checkout-pay-error>{checkout.error.message}</p>;
  }
  if (error) {
    return <p data-checkout-pay-error>{error}</p>;
  }
  return null;
}
