"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Card } from "@/components/core";
import { Alert } from "@/components/feedback/Alert";
import { PaymentPanel } from "../../PaymentPanel";

export function PayClient({ token }: { token: string }) {
  const t = useTranslations("checkout");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishable, setPublishable] = useState("");
  const [reference, setReference] = useState<string | null>(null);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [confirmPay, setConfirmPay] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/checkout/pay-link/open", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = (await res.json()) as {
          client_secret?: string;
          publishable_key?: string;
          reference?: string;
          pickup?: string;
          dropoff?: string;
          code?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(json.code === "quote_already_booked" ? "quoteAlreadyBooked" : "paymentWindowClosed");
          return;
        }
        setClientSecret(json.client_secret ?? null);
        setPublishable(json.publishable_key ?? "");
        setReference(json.reference ?? null);
        setPickup(json.pickup ?? "");
        setDropoff(json.dropoff ?? "");
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

  return (
    <div className="vt-checkout" data-checkout-pay-page>
      <Card padding="lg">
        <h1>{t("payment")}</h1>
        {pickup || dropoff ? (
          <p>
            {pickup} → {dropoff}
          </p>
        ) : null}
        {error ? <Alert tone="danger">{t(error)}</Alert> : null}
        {busy ? <div data-checkout-pay-skeleton aria-hidden="true" /> : null}
        {clientSecret && reference ? (
          <>
            <PaymentPanel
              publishableKey={publishable}
              clientSecret={clientSecret}
              reference={reference}
              onReady={(fn) => setConfirmPay(() => fn)}
            />
            <Button
              size="lg"
              block
              disabled={busy || !confirmPay}
              onClick={() => {
                if (!confirmPay) return;
                setBusy(true);
                void confirmPay().finally(() => setBusy(false));
              }}
            >
              {t("pay-and-confirm")}
            </Button>
          </>
        ) : null}
      </Card>
    </div>
  );
}
