"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Card } from "@/components/core";
import { Alert } from "@/components/feedback/Alert";
import { Input, Select } from "@/components/forms";
import { formatAmount } from "@/lib/currency";
import { PaymentPanel } from "../../PaymentPanel";

type PayAlertKey =
  | "pricingNotLive"
  | "quoteExpired"
  | "quoteAlreadyBooked"
  | "paymentWindowClosed"
  | "completeCard"
  | "payCouldNotStart";

type PayLinkOpenJson = {
  client_secret?: string;
  client_secret_hex?: string;
  publishable_key?: string;
  reference?: string;
  pickup?: string;
  dropoff?: string;
  amount_rappen?: number | null;
  billing_email?: string;
  code?: string;
  lock_expires_at?: string;
  quote_id?: string;
};

type PanelProps = ComponentProps<typeof PaymentPanel>;

/** Charge-gate codes stay on their Alerts. Unknown opens are not those keys. */
function chargeGateAlert(code: string | undefined): PayAlertKey | null {
  if (code === "pricing_not_live") return "pricingNotLive";
  if (code === "quote_expired") return "quoteExpired";
  if (code === "quote_already_booked") return "quoteAlreadyBooked";
  return null;
}

/**
 * Decorative token clock. Server still refuses. Absent or past means locked.
 * Does not mint a session.
 */
function onPayLinkLockZero(lock_expires_at: string | null): { locked: boolean } {
  if (!lock_expires_at) return { locked: true };
  const at = Date.parse(lock_expires_at);
  if (!Number.isFinite(at) || at <= Date.now()) return { locked: true };
  return { locked: false };
}

function panelProps(props: PanelProps, locked: boolean): PanelProps {
  return { ...props, locked } as PanelProps;
}

/** Expire the stored session. Skip when open never stored a quote id. */
function expireStoredCheckoutSession(quote_id: string | null): void {
  if (!quote_id) return;
  void fetch("/api/checkout/lock-expire", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quote_id }),
  });
}

function alertTone(key: PayAlertKey): "info" | "danger" {
  return key === "pricingNotLive" ? "info" : "danger";
}

function TokenDummyFields() {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const country = new Intl.DisplayNames([locale], { type: "region" }).of("CH") ?? "CH";
  return (
    <div className="vt-checkout__payblock">
      <div className="vt-checkout__payhead">
        <h2>{t("payment")}</h2>
        <p>{t("card-apple-pay-or-twint")}</p>
      </div>
      <div className="vt-checkout__cardblock">
        <h2 className="vt-checkout__method">{t("payWithCard")}</h2>
        <div className="vt-checkout__cardfields" data-checkout-dummy-fields>
          <Input
            label={t("cardNumber")}
            icon="credit-card"
            size="md"
            disabled
            readOnly
            value=""
            placeholder="1234 1234 1234 1234"
            autoComplete="off"
            inputMode="numeric"
          />
          <Select
            className="vt-checkout__card-country"
            label={t("cardCountry")}
            size="md"
            disabled
            value="CH"
            options={[{ value: "CH", label: country }]}
            onChange={() => undefined}
          />
          <Input
            label={t("cardExpiry")}
            size="md"
            disabled
            readOnly
            value=""
            placeholder="MM / YY"
            autoComplete="off"
          />
          <Input
            label={t("cardCvc")}
            size="md"
            disabled
            readOnly
            value=""
            placeholder="CVC"
            autoComplete="off"
            inputMode="numeric"
          />
        </div>
      </div>
    </div>
  );
}

export function PayClient({ token }: { token: string }) {
  const t = useTranslations("checkout");
  const [busy, setBusy] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<PayAlertKey | null>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState("");
  const [clientSecretHex, setClientSecretHex] = useState<string | undefined>();
  const [publishable, setPublishable] = useState("");
  const [reference, setReference] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [amountRappen, setAmountRappen] = useState<number | null>(null);
  const [billingEmail, setBillingEmail] = useState("");
  const [cardComplete, setCardComplete] = useState(false);
  const [confirmPay, setConfirmPay] = useState<(() => Promise<void>) | null>(null);
  const [lockExpiresAt, setLockExpiresAt] = useState<string | null>(null);
  const [payLocked, setPayLocked] = useState(false);
  const [storedQuoteId, setStoredQuoteId] = useState<string | null>(null);
  const confirmPayRef = useRef(confirmPay);
  confirmPayRef.current = confirmPay;

  function applyRecap(json: PayLinkOpenJson) {
    setReference(json.reference ?? "");
    setPickup(json.pickup ?? "");
    setDropoff(json.dropoff ?? "");
    setAmountRappen(typeof json.amount_rappen === "number" ? json.amount_rappen : null);
    setBillingEmail(json.billing_email ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/checkout/pay-link/open", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: token.trim().replace(/\s+/g, "") }),
        });
        const json = (await res.json()) as PayLinkOpenJson;
        if (cancelled) return;
        applyRecap(json);
        if (!res.ok) {
          setPayLocked(true);
          setError(chargeGateAlert(json.code) ?? "paymentWindowClosed");
          return;
        }
        const openedQuoteId = typeof json.quote_id === "string" ? json.quote_id : null;
        setStoredQuoteId(openedQuoteId);
        const lockAt = typeof json.lock_expires_at === "string" ? json.lock_expires_at : null;
        const zero = onPayLinkLockZero(lockAt);
        if (zero.locked || !json.client_secret) {
          setPayLocked(true);
          setError(zero.locked ? "quoteExpired" : "paymentWindowClosed");
          if (zero.locked) expireStoredCheckoutSession(openedQuoteId);
          return;
        }
        setLockExpiresAt(lockAt);
        setPayLocked(false);
        setClientSecret(json.client_secret);
        setClientSecretHex(json.client_secret_hex);
        setPublishable(json.publishable_key ?? "");
      } catch {
        if (!cancelled) {
          setPayLocked(true);
          setError("paymentWindowClosed");
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!clientSecret || !lockExpiresAt) return;
    const at = Date.parse(lockExpiresAt);
    if (!Number.isFinite(at)) return;
    const fire = () => {
      const next = onPayLinkLockZero(lockExpiresAt);
      if (!next.locked) return;
      setPayLocked(true);
      setError("quoteExpired");
      expireStoredCheckoutSession(storedQuoteId);
    };
    const delay = at - Date.now();
    if (delay <= 0) {
      fire();
      return;
    }
    const timer = window.setTimeout(fire, delay);
    return () => window.clearTimeout(timer);
  }, [clientSecret, lockExpiresAt, storedQuoteId]);

  async function onPay() {
    if (payLocked || !clientSecret) return;
    if (!cardComplete) {
      setError("completeCard");
      return;
    }
    setPaying(true);
    setError(null);
    setStripeError(null);
    try {
      const deadline = Date.now() + 25_000;
      while (!confirmPayRef.current && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 80));
      }
      const confirm = confirmPayRef.current;
      if (!confirm) {
        setError("payCouldNotStart");
        return;
      }
      await confirm();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (message && message !== "payCouldNotStart" && message !== "checkout-not-ready") {
        setStripeError(message);
        setError(null);
      } else {
        setError("payCouldNotStart");
      }
    } finally {
      setPaying(false);
    }
  }

  const amount = formatAmount(amountRappen == null ? null : amountRappen / 100, "CHF");
  const payDisabled = paying || busy || !clientSecret || payLocked;

  return (
    <div className="vt-checkout" data-checkout-pay-page>
      <Card padding="lg">
        <div className="vt-checkout__sheet">
          <h1>{t("finishPayment")}</h1>
          {reference ? <p>{t("unpaidReference", { reference })}</p> : null}
          {pickup || dropoff ? (
            <p>
              {pickup}
              {pickup && dropoff ? " → " : ""}
              {dropoff}
            </p>
          ) : null}
          <p className="vt-checkout__picked">{amount}</p>
          {stripeError ? <Alert tone="danger">{stripeError}</Alert> : null}
          <Alert role="alert" tone={error ? alertTone(error) : "danger"} hidden={error == null}>
            {error ? t(error) : ""}
          </Alert>
          {clientSecret ? (
            <div className="vt-checkout__payblock">
              <div className="vt-checkout__payhead">
                <h2>{t("payment")}</h2>
                <p>{t("card-apple-pay-or-twint")}</p>
              </div>
              <div className="vt-checkout__paystack">
                <PaymentPanel
                  {...panelProps(
                    {
                      publishableKey: publishable,
                      clientSecret,
                      clientSecretHex,
                      reference,
                      billingEmail,
                      onReady: (fn) => setConfirmPay(() => fn),
                      onComplete: setCardComplete,
                    },
                    payLocked,
                  )}
                />
              </div>
            </div>
          ) : busy ? null : (
            <TokenDummyFields />
          )}
          <div className="vt-checkout__cta" aria-busy={paying || undefined}>
            <Button size="lg" disabled={payDisabled} onClick={() => void onPay()}>
              {t("pay-and-continue")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
