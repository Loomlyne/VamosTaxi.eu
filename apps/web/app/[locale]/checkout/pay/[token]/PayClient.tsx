"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Button, Card, Icon } from "@/components/core";
import { Alert } from "@/components/feedback/Alert";
import { formatAmount } from "@/lib/currency";
import { PriceSummary, RouteSummary, type PriceLine } from "@/components/transfer";
import { hasPayLinkExtras, payLinkExtraName, type PayLinkLine } from "@/lib/checkout/pay-link-lines";
import { vatPercentLabel } from "@/lib/checkout/vat";
import {
  payLinkSessionKey,
  payStateFromOpen,
  splitAroundMarker,
  storedPayLinkSessionId,
  type PayAlertKey,
  type PayState,
} from "@/lib/checkout/pay-client-states";
import "./pay-link.css";

/** D-21/D-22: the link is settled — no form, a confirmed-state card instead. */
type DoneView = "alreadyPaid" | "raceRefunded";

type PayLinkOpenJson = {
  /** Stripe-hosted page (D-46). Never a client secret: no card form on this site. */
  url?: string;
  session_id?: string;
  reference?: string;
  pickup?: string;
  dropoff?: string;
  amount_rappen?: number | null;
  code?: string;
  lock_expires_at?: string;
  quote_id?: string;
  /** G9: saved fare lines (fare, extras, voucher, VAT); only sent when they add up to `amount_rappen`. */
  lines?: PayLinkLine[];
};

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
  const locale = useLocale();
  const [busy, setBusy] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<PayAlertKey | null>(null);
  const [startFailed, setStartFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [reference, setReference] = useState("");
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [amountRappen, setAmountRappen] = useState<number | null>(null);
  const [saved, setSaved] = useState<PayLinkLine[]>([]);
  const [lockExpiresAt, setLockExpiresAt] = useState<string | null>(null);
  const [payLocked, setPayLocked] = useState(false);
  const [storedQuoteId, setStoredQuoteId] = useState<string | null>(null);
  const [linkExpired, setLinkExpired] = useState(false);
  const [done, setDone] = useState<{ view: DoneView; reference: string } | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  function applyRecap(json: PayLinkOpenJson) {
    setReference(json.reference ?? "");
    setPickup(json.pickup ?? "");
    setDropoff(json.dropoff ?? "");
    setAmountRappen(typeof json.amount_rappen === "number" ? json.amount_rappen : null);
    setSaved(Array.isArray(json.lines) ? json.lines : []);
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

  /** Remember the recipient's own session id so a later open can tell a refunded duplicate (D-22). */
  function rememberSession(json: PayLinkOpenJson) {
    const own = storedPayLinkSessionId(json.session_id);
    if (own) {
      sessionIdRef.current = own;
      storeSessionId(token, own);
    }
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
        if (zero.locked || !json.url) {
          setPayLocked(true);
          setError(zero.locked ? "quoteExpired" : "paymentWindowClosed");
          if (zero.locked) expireStoredCheckoutSession(openedQuoteId);
          return;
        }
        rememberSession(json);
        setLockExpiresAt(lockAt);
        setPayLocked(false);
        setReady(true);
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
    // rememberSession only reads `token`, the effect's own dependency.
  }, [token]);

  useEffect(() => {
    if (!ready || !lockExpiresAt) return;
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
  }, [ready, lockExpiresAt, storedQuoteId]);

  /** PAY: ask the server for the (reused or fresh) hosted session, then leave for Stripe's page. */
  async function onPay() {
    if (payLocked || !ready || opening) return;
    setOpening(true);
    setStartFailed(false);
    try {
      const { ok, json } = await openPayLink(token, sessionIdRef.current);
      const state = payStateFromOpen(json);
      if (!ok || !json.url) {
        if (state.kind === "alert" && state.key === "paymentWindowClosed") {
          setStartFailed(true);
        } else {
          applyRefusal(state);
        }
        setOpening(false);
        return;
      }
      rememberSession(json);
      window.location.assign(json.url);
    } catch {
      setStartFailed(true);
      setOpening(false);
    }
  }

  const total = amountRappen == null ? null : amountRappen / 100;
  // G9: with extras on the booking, each saved line is shown above the total. Without, the total alone.
  const priceLines: PriceLine[] = hasPayLinkExtras(saved)
    ? saved.map((line): PriceLine => {
        const amount = line.amountRappen / 100;
        switch (line.kind) {
          case "fare":
            return { label: t("fareExVat"), amount };
          case "surcharge":
            return { label: `+ ${payLinkExtraName(line, locale)}`, amount };
          case "coupon":
            return { label: t("couponCode", { code: line.code }), amount, credit: true };
          default: {
            const rate = vatPercentLabel(line.vatRateBps);
            return { label: rate ? t("receiptVat", { rate }) : t("receiptVatPlain"), amount };
          }
        }
      })
    : [];
  const payDisabled = opening || busy || !ready || payLocked;
  // D-20: on this page a closed lock is the pay link's 24 hours running out —
  // the recipient's copy, not the booker's "get a new price".
  const expired = linkExpired || error === "quoteExpired";
  const genericError = expired ? null : error;

  if (done) return <PayLinkDone view={done.view} reference={done.reference} />;

  return (
    <div className="vt-checkout" data-checkout-pay-page>
      <Card padding="lg">
        <div className="vt-checkout__sheet" data-pay-link-sheet>
          <h1>{t("finishPayment")}</h1>
          {reference ? <p data-pay-link-reference>{t("unpaidReference", { reference })}</p> : null}
          {expired ? (
            <Alert role="alert" tone="danger" title={t("payLinkExpiredTitle")} data-pay-link-expired>
              {t("payLinkExpiredBody")}
            </Alert>
          ) : null}
          {genericError ? (
            <Alert role="alert" tone={alertTone(genericError)}>
              {t(genericError)}
            </Alert>
          ) : null}
          {startFailed ? (
            <Alert role="alert" tone="danger" data-pay-link-start-failed>
              {t("payStartFailed")}
            </Alert>
          ) : null}
          {pickup || dropoff ? <RouteSummary pickup={pickup} dropoff={dropoff} /> : null}
          {amountRappen != null ? (
            <div data-pay-link-price data-pay-link-lines={priceLines.length > 0 ? "1" : undefined}>
              <PriceSummary
                lines={priceLines.length > 0 ? priceLines : undefined}
                total={total}
                totalLabel={t("total")}
                currency="CHF"
              />
            </div>
          ) : null}
          {ready ? (
            <p className="vt-checkout__method-note" data-pay-link-method-note>
              {t("methodNote")}
            </p>
          ) : null}
          <div className="vt-checkout__cta" aria-busy={opening || undefined}>
            <Button
              size="lg"
              disabled={payDisabled}
              icon={opening ? undefined : "lock"}
              onClick={() => void onPay()}
            >
              {opening ? t("openingPayment") : t("payTotal", { total: formatAmount(total, "CHF") })}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
