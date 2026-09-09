"use client";

// D-21: mock payment radios are gone (ADR-014 §6). Split card fields + Express
// Checkout sit on CheckoutElementsProvider (Dahlia / @stripe/react-stripe-js).
//
// Browser: one Stripe.js object per document — module-scoped on purpose.
// Server stripeFromEnv() is per-request. Do not "fix" either into the other.
//
// Card fields paint without waiting on Checkout Session loadActions. Wallets
// wait on the session. Confirm still goes through useCheckoutElements.

import {
  CheckoutElementsProvider as CheckoutProvider,
  ExpressCheckoutElement,
  useCheckoutElements,
} from "@stripe/react-stripe-js/checkout";
import {
  CardCvcElement,
  CardExpiryElement,
  CardNumberElement,
  Elements,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe, type StripeElementsOptions } from "@stripe/stripe-js";
import { createNavigation } from "next-intl/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/core";
import { Select } from "@/components/forms";
import { routing } from "@/i18n/routing";
import { VAMOS_STRIPE_APPEARANCE } from "@/lib/checkout/stripe-appearance";

const { useRouter } = createNavigation(routing);

type ExpressConfirmEvent = Parameters<
  NonNullable<ComponentProps<typeof ExpressCheckoutElement>["onConfirm"]>
>[0];

const CARD_COUNTRIES = [
  "CH",
  "DE",
  "FR",
  "IT",
  "AT",
  "LI",
  "GB",
  "IE",
  "US",
  "CA",
  "AE",
  "SA",
  "QA",
  "KW",
  "BH",
  "OM",
  "EG",
  "IN",
  "CN",
  "JP",
  "KR",
  "SG",
  "HK",
  "AU",
  "NZ",
  "ES",
  "PT",
  "NL",
  "BE",
  "LU",
  "PL",
  "SE",
  "NO",
  "DK",
  "FI",
] as const;

const CARD_STYLE = {
  base: {
    color: "#1e1f1f",
    fontFamily: "Poppins, system-ui, sans-serif",
    fontSize: "16px",
    fontSmoothing: "antialiased",
    "::placeholder": { color: "#8b8d8d" },
  },
  invalid: { color: "#1e1f1f" },
} as const;

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

function countryOptions(locale: string): { value: string; label: string }[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return CARD_COUNTRIES.map((code) => ({
    value: code,
    label: names.of(code) ?? code,
  }));
}

function CheckoutWallets({ onExpress }: { onExpress: (event: ExpressConfirmEvent) => void }) {
  const checkout = useCheckoutElements();
  if (checkout.type !== "success") return null;
  return (
    <div data-checkout-express>
      <ExpressCheckoutElement
        options={{
          buttonHeight: 48,
          buttonTheme: { applePay: "black", googlePay: "black", paypal: "gold" },
          buttonType: { applePay: "plain", googlePay: "pay", paypal: "paypal" },
          layout: { maxColumns: 2, maxRows: 1, overflow: "never" },
          paymentMethodOrder: ["applePay", "link"],
          paymentMethods: {
            applePay: "always",
            googlePay: "never",
            link: "auto",
            paypal: "never",
          },
        }}
        onConfirm={(event) => onExpress(event)}
      />
    </div>
  );
}

function VamosCardFields({
  name,
  email,
  onCreate,
  onComplete,
}: {
  name: string;
  email: string;
  onCreate: (create: () => Promise<{ id: string; country: string }>) => void;
  onComplete: (ok: boolean) => void;
}) {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const stripe = useStripe();
  const elements = useElements();
  const [numberOk, setNumberOk] = useState(false);
  const [expiryOk, setExpiryOk] = useState(false);
  const [cvcOk, setCvcOk] = useState(false);
  const [brand, setBrand] = useState("unknown");
  const [country, setCountry] = useState("CH");
  const countries = useMemo(() => countryOptions(locale), [locale]);

  useEffect(() => {
    if (!stripe || !elements) return;
    onCreate(async () => {
      const number = elements.getElement(CardNumberElement);
      if (!number) throw new Error("payCouldNotStart");
      const created = await stripe.createPaymentMethod({
        type: "card",
        card: number,
        billing_details: {
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          address: { country },
        },
      });
      if (created.error || !created.paymentMethod?.id) {
        throw new Error(created.error?.message ?? "payCouldNotStart");
      }
      return { id: created.paymentMethod.id, country };
    });
  }, [country, email, elements, name, onCreate, stripe]);

  useEffect(() => {
    onComplete(numberOk && expiryOk && cvcOk);
  }, [cvcOk, expiryOk, numberOk, onComplete]);

  return (
    <div className="vt-checkout__cardfields" data-checkout-card-fields>
      <div className="vt-field" data-checkout-card-number>
        <span className="vt-field__label">{t("cardNumber")}</span>
        <div className="vt-input vt-input--md">
          <span className="vt-checkout__card-brand" data-checkout-card-brand={brand}>
            <Icon name="credit-card" size={16} />
          </span>
          <div className="vt-checkout__stripe-el">
            <CardNumberElement
              options={{
                disableLink: true,
                placeholder: "1234 1234 1234 1234",
                showIcon: false,
                style: CARD_STYLE,
              }}
              onChange={(event) => {
                setNumberOk(event.complete);
                setBrand(event.brand || "unknown");
              }}
              onReady={() => undefined}
            />
          </div>
        </div>
      </div>
      <div className="vt-checkout__card-row">
        <div className="vt-field">
          <span className="vt-field__label">{t("cardExpiry")}</span>
          <div className="vt-input vt-input--md">
            <div className="vt-checkout__stripe-el">
              <CardExpiryElement
                options={{ placeholder: "MM / YY", style: CARD_STYLE }}
                onChange={(event) => setExpiryOk(event.complete)}
              />
            </div>
          </div>
        </div>
        <div className="vt-field">
          <span className="vt-field__label">{t("cardCvc")}</span>
          <div className="vt-input vt-input--md">
            <div className="vt-checkout__stripe-el">
              <CardCvcElement
                options={{ placeholder: "CVC", style: CARD_STYLE }}
                onChange={(event) => setCvcOk(event.complete)}
              />
            </div>
          </div>
        </div>
        <Select
          className="vt-checkout__card-country"
          label={t("cardCountry")}
          options={countries}
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          data-checkout-card-country="true"
        />
      </div>
    </div>
  );
}

function CheckoutFields({
  reference,
  billingName,
  billingEmail,
  stripePromise: promise,
  onReady,
  onComplete,
}: {
  reference: string;
  billingName: string;
  billingEmail: string;
  stripePromise: Promise<Stripe | null>;
  onReady: (confirm: () => Promise<void>) => void;
  onComplete: (complete: boolean) => void;
}) {
  const checkout = useCheckoutElements();
  const router = useRouter();
  const cardCreate = useRef<(() => Promise<{ id: string; country: string }>) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onCardCreate = useCallback((create: () => Promise<{ id: string; country: string }>) => {
    cardCreate.current = create;
  }, []);

  useEffect(() => {
    if (checkout.type !== "success") return;
    onReady(async () => {
      setError(null);
      const create = cardCreate.current;
      if (!create) throw new Error("payCouldNotStart");
      const card = await create();
      const result = await checkout.checkout.confirm({
        paymentMethod: card.id,
        email: billingEmail.trim() || undefined,
        billingAddress: {
          name: billingName.trim() || null,
          address: { country: card.country },
        },
        redirect: "if_required",
      });
      if (result.type === "error") {
        setError(result.error.message);
        throw new Error(result.error.message);
      }
      if (reference) router.push(`/confirmation/${reference}`);
    });
  }, [billingEmail, billingName, checkout, onReady, reference, router]);

  async function onExpress(event: ExpressConfirmEvent) {
    if (checkout.type !== "success") {
      event.paymentFailed({ reason: "fail" });
      return;
    }
    const result = await checkout.checkout.confirm({
      expressCheckoutConfirmEvent: event,
      redirect: "if_required",
    });
    if (result.type === "error") {
      event.paymentFailed({ reason: "fail" });
      return;
    }
    if (reference) router.push(`/confirmation/${reference}`);
  }

  const cardOptions = useMemo<StripeElementsOptions>(
    () => ({
      appearance: VAMOS_STRIPE_APPEARANCE,
      fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" }],
      loader: "auto",
    }),
    [],
  );

  return (
    <>
      <CheckoutWallets onExpress={onExpress} />
      <Elements stripe={promise} options={cardOptions}>
        <VamosCardFields name={billingName} email={billingEmail} onCreate={onCardCreate} onComplete={onComplete} />
      </Elements>
      {error ? <p data-checkout-pay-error>{error}</p> : null}
    </>
  );
}

export function PaymentPanel({
  publishableKey,
  clientSecret,
  clientSecretHex,
  reference,
  billingName = "",
  billingEmail = "",
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
          elementsOptions: {
            appearance: VAMOS_STRIPE_APPEARANCE,
            fonts: [{ cssSrc: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" }],
          },
        }}
      >
        <CheckoutFields
          reference={reference}
          billingName={billingName}
          billingEmail={billingEmail}
          stripePromise={promise}
          onReady={onReady}
          onComplete={onComplete}
        />
      </CheckoutProvider>
    </div>
  );
}
