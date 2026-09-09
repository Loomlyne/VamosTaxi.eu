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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type MutableRefObject,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { Icon } from "@/components/core";
import { Select } from "@/components/forms";
import { routing } from "@/i18n/routing";
import { decodeClientSecret } from "@/lib/checkout/client-secret";
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

const CARD_FONTS = [{ cssSrc: "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap" }];

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

function countryOptions(locale: string): { value: string; label: string }[] {
  const names = new Intl.DisplayNames([locale], { type: "region" });
  return CARD_COUNTRIES.map((code) => ({
    value: code,
    label: names.of(code) ?? code,
  }));
}

function CheckoutWallets({ onExpress }: { onExpress: (event: ExpressConfirmEvent) => void }) {
  const t = useTranslations("checkout");
  const checkout = useCheckoutElements();
  const [hasWallets, setHasWallets] = useState(true);
  if (checkout.type !== "success") return null;
  return (
    <div data-checkout-express hidden={!hasWallets}>
      <h2 className="vt-checkout__method">{t("payWithApplePay")}</h2>
      <ExpressCheckoutElement
        options={{
          buttonHeight: 48,
          buttonTheme: { applePay: "black", googlePay: "black", paypal: "gold" },
          buttonType: { applePay: "plain", googlePay: "pay", paypal: "paypal" },
          layout: { maxColumns: 2, maxRows: 1, overflow: "auto" },
          paymentMethodOrder: ["apple_pay", "link"],
          paymentMethods: {
            applePay: "always",
            googlePay: "never",
            link: "auto",
            paypal: "never",
          },
        }}
        onReady={(event) => {
          const methods = event.availablePaymentMethods;
          setHasWallets(Boolean(methods && (methods.applePay || methods.link)));
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
    <div className="vt-checkout__cardblock">
      <h2 className="vt-checkout__method">{t("payWithCard")}</h2>
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
      <Select
        className="vt-checkout__card-country"
        label={t("cardCountry")}
        options={countries}
        value={country}
        onChange={(event) => setCountry(event.target.value)}
        data-checkout-card-country="true"
      />
      <div className="vt-field" data-checkout-card-expiry>
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
      <div className="vt-field" data-checkout-card-cvc>
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
    </div>
    </div>
  );
}

type CheckoutState = ReturnType<typeof useCheckoutElements>;

function CheckoutSession({
  sessionRef,
  onExpress,
}: {
  sessionRef: MutableRefObject<CheckoutState | null>;
  onExpress: (event: ExpressConfirmEvent) => void;
}) {
  const checkout = useCheckoutElements();
  useEffect(() => {
    sessionRef.current = checkout;
  }, [checkout, sessionRef]);
  return <CheckoutWallets onExpress={onExpress} />;
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
  const router = useRouter();
  const promise = useMemo(() => browserStripe(publishableKey), [publishableKey]);
  const secret = (decodeClientSecret(clientSecret, clientSecretHex) ?? clientSecret ?? "").trim();
  const cardCreate = useRef<(() => Promise<{ id: string; country: string }>) | null>(null);
  const sessionRef = useRef<CheckoutState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onCardCreate = useCallback((create: () => Promise<{ id: string; country: string }>) => {
    cardCreate.current = create;
  }, []);
  const cardOptions = useMemo<StripeElementsOptions>(
    () => ({
      appearance: VAMOS_STRIPE_APPEARANCE,
      fonts: CARD_FONTS,
      loader: "auto",
    }),
    [],
  );

  const waitForCheckout = useCallback(async () => {
    const deadline = Date.now() + 25_000;
    while (Date.now() < deadline) {
      const state = sessionRef.current;
      if (state?.type === "success") return state.checkout;
      if (state?.type === "error") throw new Error(state.error.message);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    throw new Error("payCouldNotStart");
  }, []);

  useEffect(() => {
    sessionRef.current = null;
  }, [secret]);

  useEffect(() => {
    onReady(async () => {
      setError(null);
      try {
        const create = cardCreate.current;
        if (!create) throw new Error("payCouldNotStart");
        const card = await create();
        const checkout = await waitForCheckout();
        const result = await checkout.confirm({
          paymentMethod: card.id,
          email: billingEmail.trim() || undefined,
          billingAddress: {
            name: billingName.trim() || null,
            address: { country: card.country },
          },
          redirect: "if_required",
        });
        if (result.type === "error") {
          throw new Error(result.error.message);
        }
        if (reference) router.push(`/confirmation/${reference}`);
      } catch (err) {
        const message = err instanceof Error && err.message ? err.message : "payCouldNotStart";
        setError(message);
        throw err instanceof Error ? err : new Error(message);
      }
    });
  }, [billingEmail, billingName, onReady, reference, router, waitForCheckout]);

  async function onExpress(event: ExpressConfirmEvent) {
    const state = sessionRef.current;
    if (state?.type !== "success") {
      event.paymentFailed({ reason: "fail" });
      return;
    }
    const result = await state.checkout.confirm({
      expressCheckoutConfirmEvent: event,
      redirect: "if_required",
    });
    if (result.type === "error") {
      event.paymentFailed({ reason: "fail" });
      return;
    }
    if (reference) router.push(`/confirmation/${reference}`);
  }

  return (
    <div className="vt-checkout__pay" data-checkout-pay>
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
          <CheckoutSession sessionRef={sessionRef} onExpress={onExpress} />
        </CheckoutProvider>
      ) : null}
      <Elements stripe={promise} options={cardOptions}>
        <VamosCardFields name={billingName} email={billingEmail} onCreate={onCardCreate} onComplete={onComplete} />
      </Elements>
      {error ? <p data-checkout-pay-error>{error}</p> : null}
    </div>
  );
}
