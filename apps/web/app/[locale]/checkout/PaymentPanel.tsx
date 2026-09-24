"use client";

// D-21: mock payment radios are gone (ADR-014 §6). Card and wallets sit on
// one Checkout Session (Dahlia / @stripe/react-stripe-js/checkout).
//
// Browser: one Stripe.js object per document — module-scoped on purpose.
// Server stripeFromEnv() is per-request. Do not "fix" either into the other.
//
// The card mounts only after checkout type === "success". Confirm uses that
// session. A Stripe error is shown as Stripe sent it.

import {
  CheckoutElementsProvider as CheckoutProvider,
  ExpressCheckoutElement,
  PaymentElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MutableRefObject,
} from "react";
import { useTranslations } from "next-intl";
import { decodeClientSecret } from "@/lib/checkout/client-secret";
import {
  checkoutPageLocale,
  checkoutSessionIdFromSecret,
  checkoutSettleUrl,
} from "@/lib/checkout/return-url";
import { stripeBrowserKey } from "@/lib/checkout/stripe-browser-key";
import { VAMOS_STRIPE_APPEARANCE } from "@/lib/checkout/stripe-appearance";

type ExpressConfirmEvent = Parameters<
  NonNullable<ComponentProps<typeof ExpressCheckoutElement>["onConfirm"]>
>[0];

const CARD_FONTS = [{ cssSrc: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" }];

let stripePromise: Promise<Stripe | null> | null = null;
let stripePromiseKey = "";

function browserStripe(publishableKey: string): Promise<Stripe | null> {
  const key = stripeBrowserKey(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, publishableKey);
  if (!key) return Promise.resolve(null);
  if (!stripePromise || stripePromiseKey !== key) {
    stripePromiseKey = key;
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

function noopComplete(_complete: boolean) {}

function CheckoutWallets({ onExpress }: { onExpress: (event: ExpressConfirmEvent) => void }) {
  const t = useTranslations("checkout");
  const checkout = useCheckoutElements();
  const [hasWallets, setHasWallets] = useState(true);
  const [showExpressHeading, setShowExpressHeading] = useState(false);
  if (checkout.type !== "success") return null;
  return (
    <div data-checkout-express hidden={!hasWallets}>
      {showExpressHeading ? <h2 className="vt-checkout__method">{t("payWithExpress")}</h2> : null}
      <ExpressCheckoutElement
        options={{
          buttonHeight: 48,
          buttonTheme: { applePay: "black", googlePay: "black", paypal: "gold" },
          buttonType: { applePay: "plain", googlePay: "pay", paypal: "paypal" },
          layout: { maxColumns: 1, maxRows: 4, overflow: "auto" },
          paymentMethodOrder: ["apple_pay", "amazon_pay", "paypal", "link"],
          paymentMethods: {
            amazonPay: "auto",
            applePay: "always",
            googlePay: "never",
            link: "auto",
            paypal: "auto",
          },
        }}
        onReady={(event) => {
          const methods = event.availablePaymentMethods;
          const applePay = Boolean(methods?.applePay);
          const amazonPay = Boolean(methods?.amazonPay);
          const paypal = Boolean(methods?.paypal);
          const link = Boolean(methods?.link);
          const visible = applePay || amazonPay || paypal || link;
          setShowExpressHeading(visible);
          setHasWallets(visible);
        }}
        onConfirm={(event) => onExpress(event)}
      />
    </div>
  );
}

function CheckoutCard({ onComplete }: { onComplete: (complete: boolean) => void }) {
  const t = useTranslations("checkout");
  const checkout = useCheckoutElements();
  if (checkout.type !== "success") return null;
  return (
    <div className="vt-checkout__cardblock">
      <h2 className="vt-checkout__method">{t("payWithCard")}</h2>
      <div className="vt-checkout__cardfields" data-checkout-card-fields>
        {/* Stripe FieldOption is only auto | never. No optional-while-shown ZIP.
            never hides postal code so a missing ZIP does not block confirm.
            Do not pass a fake postal_code. Card number, expiry, and CVC stay. */}
        <PaymentElement
          options={{
            fields: {
              billingDetails: {
                address: {
                  postalCode: "never",
                },
              },
            },
          }}
          onChange={(event) => onComplete(event.complete)}
        />
      </div>
    </div>
  );
}

type CheckoutState = ReturnType<typeof useCheckoutElements>;
type ReadyCheckout = Extract<CheckoutState, { type: "success" }>["checkout"];

function CheckoutSession({
  sessionRef,
  onExpress,
  onComplete,
}: {
  sessionRef: MutableRefObject<CheckoutState | null>;
  onExpress: (event: ExpressConfirmEvent) => void;
  onComplete: (complete: boolean) => void;
}) {
  const tCommon = useTranslations("common");
  const checkout = useCheckoutElements();
  sessionRef.current = checkout;
  return (
    <>
      {checkout.type === "error" ? (
        <p data-checkout-pay-error role="alert">
          {checkout.error.message}
        </p>
      ) : checkout.type === "loading" ? (
        <p data-checkout-card-status="loading">{tCommon("loading")}</p>
      ) : null}
      <CheckoutWallets onExpress={onExpress} />
      <CheckoutCard onComplete={onComplete} />
    </>
  );
}

function showStripeError(setError: (message: string) => void, message: string): never {
  setError(message);
  throw new Error(message);
}

function paidDestination(reference: string, secret: string): string {
  const sessionId = checkoutSessionIdFromSecret(secret);
  if (!sessionId || typeof window === "undefined") return "";
  return checkoutSettleUrl(
    window.location.origin,
    sessionId,
    checkoutPageLocale(window.location.pathname),
    reference,
  );
}

export function PaymentPanel({
  publishableKey,
  clientSecret,
  clientSecretHex,
  reference,
  billingEmail = "",
  locked = false,
  onReady,
  onComplete = noopComplete,
}: {
  publishableKey: string;
  clientSecret: string;
  clientSecretHex?: string;
  reference: string;
  billingName?: string;
  billingEmail?: string;
  billingPhone?: string;
  locked?: boolean;
  onReady: (confirm: () => Promise<void>) => void;
  onComplete?: (complete: boolean) => void;
}) {
  const promise = useMemo(() => browserStripe(publishableKey), [publishableKey]);
  const secret = (decodeClientSecret(clientSecret, clientSecretHex) ?? clientSecret ?? "").trim();
  const sessionRef = useRef<CheckoutState | null>(null);
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bounced = new URLSearchParams(window.location.search).get("session_id") ?? "";
    if (!bounced) return;
    window.location.replace(
      checkoutSettleUrl(
        window.location.origin,
        bounced,
        checkoutPageLocale(window.location.pathname),
        reference,
      ),
    );
  }, [reference]);

  useEffect(() => {
    onReady(async () => {
      if (locked) return;
      setError(null);
      const deadline = Date.now() + 25_000;
      let checkout: ReadyCheckout | null = null;
      while (Date.now() < deadline) {
        const state = sessionRef.current;
        if (state?.type === "success") {
          checkout = state.checkout;
          break;
        }
        if (state?.type === "error") showStripeError(setError, state.error.message);
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      if (!checkout) showStripeError(setError, "checkout-not-ready");
      const email = billingEmail.trim();
      // Card confirm must not pass returnUrl. Stripe then waits for a redirect
      // that a non-redirect card never starts, and the button spins.
      const result = await checkout.confirm({
        email: email || undefined,
        redirect: "if_required",
      });
      if (result.type === "error") showStripeError(setError, result.error.message);
      const destination = paidDestination(reference, secret);
      if (destination) window.location.assign(destination);
    });
  }, [billingEmail, locked, onReady, reference, secret]);

  async function onExpress(event: ExpressConfirmEvent) {
    if (lockedRef.current) {
      event.paymentFailed({ reason: "fail" });
      return;
    }
    const state = sessionRef.current;
    if (state?.type !== "success") {
      event.paymentFailed({ reason: "fail" });
      return;
    }
    const destination = paidDestination(reference, secret);
    try {
      const result = await state.checkout.confirm({
        expressCheckoutConfirmEvent: event,
        redirect: "if_required",
        ...(destination ? { returnUrl: destination } : {}),
      });
      if (result.type === "error") {
        setError(result.error.message);
        event.paymentFailed({ reason: "fail" });
        return;
      }
      if (destination) window.location.assign(destination);
    } catch (err) {
      setError(err instanceof Error ? err.message : "");
      event.paymentFailed({ reason: "fail" });
    }
  }

  return (
    <div
      className="vt-checkout__pay"
      data-checkout-pay
      data-pay-locked={locked ? "true" : undefined}
      aria-disabled={locked || undefined}
      style={locked ? { pointerEvents: "none" } : undefined}
    >
      {secret ? (
        <CheckoutProvider
          key={secret}
          stripe={promise}
          options={{
            clientSecret: secret,
            elementsOptions: {
              appearance: VAMOS_STRIPE_APPEARANCE,
              fonts: CARD_FONTS,
            },
          }}
        >
          <CheckoutSession sessionRef={sessionRef} onExpress={onExpress} onComplete={onComplete} />
        </CheckoutProvider>
      ) : null}
      {error ? (
        <p data-checkout-pay-error role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
