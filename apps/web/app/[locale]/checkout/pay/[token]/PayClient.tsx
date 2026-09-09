"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card } from "@/components/core";
import { Alert } from "@/components/feedback/Alert";
import { formatAmount } from "@/lib/currency";
import { PaymentPanel } from "../../PaymentPanel";

export function PayClient({ token }: { token: string }) {
  const t = useTranslations("checkout");
  const [busy, setBusy] = useState(true);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/checkout/pay-link/open", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token: token.trim().replace(/\s+/g, "") }),
        });
        const json = (await res.json()) as {
          client_secret?: string;
          client_secret_hex?: string;
          publishable_key?: string;
          reference?: string;
          pickup?: string;
          dropoff?: string;
          amount_rappen?: number | null;
          billing_email?: string;
          code?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(json.code === "quote_already_booked" ? "quoteAlreadyBooked" : "paymentWindowClosed");
          return;
        }
        setClientSecret(json.client_secret ?? "");
        setClientSecretHex(json.client_secret_hex);
        setPublishable(json.publishable_key ?? "");
        setReference(json.reference ?? "");
        setPickup(json.pickup ?? "");
        setDropoff(json.dropoff ?? "");
        setAmountRappen(typeof json.amount_rappen === "number" ? json.amount_rappen : null);
        setBillingEmail(json.billing_email ?? "");
      } catch {
        if (!cancelled) setError("paymentWindowClosed");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function onPay() {
    if (!cardComplete || !confirmPay) {
      setError("payCouldNotStart");
      return;
    }
    setPaying(true);
    setError(null);
    try {
      await confirmPay();
    } catch {
      setError("payCouldNotStart");
    } finally {
      setPaying(false);
    }
  }

  const amount = formatAmount(amountRappen == null ? null : amountRappen / 100, "CHF");

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
          {error ? <Alert tone="danger">{t(error)}</Alert> : null}
          {clientSecret ? (
            <>
              <div className="vt-checkout__payblock">
                <div className="vt-checkout__payhead">
                  <h2>{t("payment")}</h2>
                  <p>{t("card-apple-pay-or-twint")}</p>
                </div>
                <div className="vt-checkout__paystack">
                  <PaymentPanel
                    publishableKey={publishable}
                    clientSecret={clientSecret}
                    clientSecretHex={clientSecretHex}
                    reference={reference}
                    billingEmail={billingEmail}
                    onReady={(fn) => setConfirmPay(() => fn)}
                    onComplete={setCardComplete}
                  />
                </div>
              </div>
              <div className="vt-checkout__cta" aria-busy={paying || undefined}>
                <Button size="lg" disabled={paying || busy || !cardComplete} onClick={() => void onPay()}>
                  {t("pay-and-continue")}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
