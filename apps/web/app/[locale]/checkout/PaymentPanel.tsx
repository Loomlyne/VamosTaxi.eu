"use client";

// D-21: mock payment radios are gone (ADR-014 §6). Stripe's Payment Element
// is the method picker. CheckoutProvider is Stripe's CheckoutElementsProvider
// (Dahlia / @stripe/react-stripe-js).
//
// Browser: one Stripe.js object per document — module-scoped on purpose.
// Server stripeFromEnv() is per-request. Do not "fix" either into the other.
//
// Do not mount <PaymentElement> while checkout.type === "loading".
// createPaymentElement on an SDK that has not finished loadActions() leaves
// Stripe's 3-bar loader up forever (Pay and confirm on vamostaxi.site).

import {
  CheckoutElementsProvider as CheckoutProvider,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { createNavigation } from "next-intl/navigation";
import { useEffect, useMemo, useState } from "react";
import { routing } from "@/i18n/routing";

const { useRouter } = createNavigation(routing);

let stripePromise: Promise<Stripe | null> | null = null;
let stripePromiseKey = "";

function browserStripe(publishableKey: string): Promise<Stripe | null> {
  const key = (process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || publishableKey || "").trim();
  if (!key || key === "pk_test_placeholder") return Promise.resolve(null);
  if (!stripePromise || stripePromiseKey !== key) {
    stripePromiseKey = key;
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

function noopComplete(_complete: boolean) {}

export function CheckoutPaySkeleton() {
  return (
    <div data-checkout-pay-skeleton aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function decodeClientSecret(secret: string | undefined, hex: string | undefined): string | null {
  if (hex && /^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return new TextDecoder().decode(bytes);
  }
  if (!secret) return null;
  try {
    return decodeURIComponent(secret);
  } catch {
    return secret;
  }
}

export function PaymentPanel({
  publishableKey,
  clientSecret,
  clientSecretHex,
  reference,
  onReady,
  onComplete = noopComplete,
}: {
  publishableKey: string;
  clientSecret: string;
  clientSecretHex?: string;
  reference: string;
  onReady: (confirm: () => Promise<void>) => void;
  onComplete?: (complete: boolean) => void;
}) {
  const promise = useMemo(() => browserStripe(publishableKey), [publishableKey]);
  const secret = decodeClientSecret(clientSecret, clientSecretHex) ?? clientSecret;

  if (!publishableKey || !secret) {
    return <CheckoutPaySkeleton />;
  }

  return (
    <div className="vt-checkout__pay" data-checkout-pay>
      <CheckoutProvider
        key={secret}
        stripe={promise}
        options={{
          clientSecret: secret,
        }}
      >
        <CheckoutFields reference={reference} onReady={onReady} onComplete={onComplete} />
      </CheckoutProvider>
    </div>
  );
}

function CheckoutFields({
  reference,
  onReady,
  onComplete,
}: {
  reference: string;
  onReady: (confirm: () => Promise<void>) => void;
  onComplete: (complete: boolean) => void;
}) {
  const checkout = useCheckoutElements();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (checkout.type !== "success") {
      onComplete(false);
      return;
    }
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
      if (reference) router.push(`/confirmation/${reference}`);
    });
  }, [checkout, onComplete, onReady, reference, router]);

  if (checkout.type === "loading") {
    return <CheckoutPaySkeleton />;
  }
  if (checkout.type === "error") {
    return <CheckoutPaySkeleton />;
  }
  return (
    <>
      <PaymentElement onChange={(event) => onComplete(event.complete)} />
      {error ? <p data-checkout-pay-error>{error}</p> : null}
    </>
  );
}
