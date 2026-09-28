"use client";

import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Card, Icon } from "@/components/core";
import { Alert } from "@/components/feedback/Alert";
import { Input, Select } from "@/components/forms";
import { formatAmount } from "@/lib/currency";
import { decodeClientSecret } from "@/lib/checkout/client-secret";
import {
  PAY_LINK_POLL_BUDGET_MS,
  PAY_LINK_POLL_INTERVAL_MS,
  payLinkSessionKey,
  payPollStep,
  payStateFromOpen,
  sessionIdFromClientSecret,
  splitAroundMarker,
  storedPayLinkSessionId,
  type PayAlertKey,
  type PayState,
} from "@/lib/checkout/pay-client-states";
import { PaymentPanel } from "../../PaymentPanel";

/** D-21/D-22: the link is settled — no form, a confirmed-state card instead. */
type DoneView = "alreadyPaid" | "raceRefunded";

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

/** Placeholder marker so the reference can sit in its own LTR span inside the sentence. */
const REFERENCE_MARKER = "\u0001";

/** The recipient's own Checkout Session id from an earlier open on this tab. Hint only — the server decides. */
function readStoredSessionId(token: string): string | null {
  try {
    return storedPayLinkSessionId(window.sessionStorage.getItem(payLinkSessionKey(token)));
  } catch {
    return null;
  }
}

function storeSessionId(token: string, sessionId: string): void {
  try {
    window.sessionStorage.setItem(payLinkSessionKey(token), sessionId);
  } catch {
    // Private mode or storage off: the in-page ref still carries it.
  }
}

async function openPayLink(
  token: string,
  sessionId: string | null,
): Promise<{ ok: boolean; json: PayLinkOpenJson }> {
  const clean = token.trim().replace(/\s+/g, "");
  const res = await fetch("/api/checkout/pay-link/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sessionId ? { token: clean, session_id: sessionId } : { token: clean }),
  });
  const json = (await res.json()) as PayLinkOpenJson;
  return { ok: res.ok, json };
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

/**
 * UI-SPEC §1: already paid (D-21, success tone) or charged twice and refunded
 * (D-22, neutral tone). Static — no action, no card form.
 */
function PayLinkDone({ view, reference }: { view: DoneView; reference: string }) {
  const t = useTranslations("checkout");
  const paid = view === "alreadyPaid";
  const body = paid
    ? splitAroundMarker(t("payLinkAlreadyPaidBody", { reference: REFERENCE_MARKER }), REFERENCE_MARKER)
    : null;
  return (
    <div className="vt-checkout" data-checkout-pay-page data-pay-link-state={view}>
      <Card padding="lg">
        <div className="vt-checkout__sheet" data-pay-link-done={view} role="status">
          <Icon
            name="circle-check"
            size={32}
            color={paid ? "var(--vt-success)" : "var(--vt-text-muted)"}
          />
          <h1>{paid ? t("payLinkAlreadyPaidTitle") : t("payLinkRaceRefundedTitle")}</h1>
          {paid ? (
            reference && body ? (
              <p>
                {body.before}
                <span className="vt-dir-keep" data-pay-link-reference>
                  {reference}
                </span>
                {body.after}
              </p>
            ) : null
          ) : (
            <p>{t("payLinkRaceRefundedBody")}</p>
          )}
        </div>
      </Card>
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
  const [linkExpired, setLinkExpired] = useState(false);
  const [done, setDone] = useState<{ view: DoneView; reference: string } | null>(null);
  const confirmPayRef = useRef(confirmPay);
  confirmPayRef.current = confirmPay;
  const sessionIdRef = useRef<string | null>(null);

  function applyRecap(json: PayLinkOpenJson) {
    setReference(json.reference ?? "");
    setPickup(json.pickup ?? "");
    setDropoff(json.dropoff ?? "");
    setAmountRappen(typeof json.amount_rappen === "number" ? json.amount_rappen : null);
    setBillingEmail(json.billing_email ?? "");
  }

  /** Paid / refunded / expired come from the server's state read (26.1-15), never from the browser. */
  function applyRefusal(state: PayState) {
    setPayLocked(true);
    if (state.kind === "alreadyPaid" || state.kind === "raceRefunded") {
      setDone({ view: state.kind, reference: state.reference });
      return;
    }
    if (state.kind === "expired") {
      setLinkExpired(true);
      return;
    }
    setError(state.kind === "alert" ? state.key : "paymentWindowClosed");
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = readStoredSessionId(token);
        sessionIdRef.current = stored;
        const { ok, json } = await openPayLink(token, stored);
        if (cancelled) return;
        applyRecap(json);
        const state = payStateFromOpen(json);
        if (!ok) {
          applyRefusal(state);
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
        const ownSession = sessionIdFromClientSecret(
          decodeClientSecret(json.client_secret, json.client_secret_hex),
        );
        if (ownSession) {
          sessionIdRef.current = ownSession;
          storeSessionId(token, ownSession);
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

  /**
   * D-21/D-22: after the recipient's own payment confirms, ask the link whether
   * that charge settled (paid — continue to the settle route) or lost the race
   * (refunded duplicate — show the race card). Same budget as the confirmation
   * page's poll; on timeout the settle route decides.
   */
  const afterOwnPayment = useCallback(
    async (destination: string) => {
      setPaying(true);
      const deadline = Date.now() + PAY_LINK_POLL_BUDGET_MS;
      while (Date.now() < deadline) {
        try {
          const { json } = await openPayLink(token, sessionIdRef.current);
          const state = payStateFromOpen(json);
          const step = payPollStep(state);
          if (step === "raceRefunded" && state.kind === "raceRefunded") {
            setPayLocked(true);
            setDone({ view: "raceRefunded", reference: state.reference });
            setPaying(false);
            return;
          }
          if (step === "continue") break;
        } catch {
          // Network blip — keep asking until the budget runs out.
        }
        await new Promise((resolve) => setTimeout(resolve, PAY_LINK_POLL_INTERVAL_MS));
      }
      window.location.assign(destination);
    },
    [token],
  );

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
  // D-20: on this page a closed lock is the pay link's 24 hours running out —
  // the recipient's copy, not the booker's "get a new price".
  const expired = linkExpired || error === "quoteExpired";
  const genericError = expired ? null : error;

  if (done) return <PayLinkDone view={done.view} reference={done.reference} />;

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
          {expired ? (
            <Alert role="alert" tone="danger" title={t("payLinkExpiredTitle")} data-pay-link-expired>
              {t("payLinkExpiredBody")}
            </Alert>
          ) : null}
          <Alert
            role="alert"
            tone={genericError ? alertTone(genericError) : "danger"}
            hidden={genericError == null}
          >
            {genericError ? t(genericError) : ""}
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
                      onPaid: afterOwnPayment,
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
