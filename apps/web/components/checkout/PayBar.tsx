"use client";

import type { ReactNode } from "react";
import { Alert } from "@/components/feedback/Alert";
import { Button, Icon } from "@/components/core";
import "./checkout-parts.css";

export type PayBarState = "idle" | "disabled" | "loading" | "error";

export type PayBarProps = {
  /** `bar`: sticky bottom bar at 1080px and below. `rail`: block PAY in the right rail. */
  variant: "bar" | "rail";
  state?: PayBarState;
  totalLabel: string;
  /** Formatted amount. Ignored while `totalNote` is set. */
  total?: string | null;
  /** Replaces the amount: "Choose a class", "Updating price", "Getting your fixed prices". */
  totalNote?: string | null;
  /** The word: "Pay". */
  payLabel: string;
  /** Formatted amount beside the word; omitted while no class is chosen (label reads "PAY"). */
  payAmount?: string | null;
  loadingLabel: string;
  /** Alert tone danger above PAY (state "error"). */
  error?: string | null;
  /** One polite live region announces the first PAY error. */
  liveMessage?: string;
  reassurance?: string;
  /** Turnstile sits directly above PAY when a challenge shows. */
  challenge?: ReactNode;
  onPay?: () => void;
  /** Tapping "Total" on the bar scrolls to section 3's summary. */
  onTotal?: () => void;
};

/**
 * The only PAY on the page (UI-SPEC S2). States: default, hover/press and focus (CSS,
 * from the design-system Button), disabled, loading (spinner + "Opening payment"),
 * error (danger Alert above). Total placeholders are words, per DS section 3 States.
 */
export function PayBar({
  variant,
  state = "idle",
  totalLabel,
  total,
  totalNote,
  payLabel,
  payAmount,
  loadingLabel,
  error,
  liveMessage = "",
  reassurance,
  challenge,
  onPay,
  onTotal,
}: PayBarProps) {
  const loading = state === "loading";
  const disabled = state === "disabled" || loading;
  const shownError = state === "error" ? error : null;

  const totalBlock = (
    <>
      <span className="vt-copay__label">{totalLabel}</span>
      {totalNote ? (
        <span className="vt-copay__note" data-co-total-note>
          {totalNote}
        </span>
      ) : (
        <span className="vt-copay__amount vt-dir-keep" data-co-total>
          {total}
        </span>
      )}
    </>
  );

  return (
    <div className={`vt-copay vt-copay--${variant}`} data-co-pay-bar={variant} data-state={state}>
      <p className="vt-copay__live" role="status" aria-live="polite" data-co-live>
        {liveMessage}
      </p>
      {shownError ? (
        <Alert tone="danger" role="alert" data-co-pay-error>
          {shownError}
        </Alert>
      ) : null}
      {challenge ? <div className="vt-copay__challenge">{challenge}</div> : null}
      <div className="vt-copay__row">
        {variant === "bar" && onTotal ? (
          <button type="button" className="vt-copay__total vt-copay__total--button" onClick={onTotal} data-co-total-link>
            {totalBlock}
          </button>
        ) : (
          <div className="vt-copay__total">{totalBlock}</div>
        )}
        <Button
          size="lg"
          block={variant === "rail"}
          disabled={disabled}
          aria-busy={loading || undefined}
          onClick={onPay}
          className="vt-copay__pay"
          data-co-pay
        >
          {loading ? (
            <>
              <Icon name="loader-circle" size={18} className="vt-copay__spin" />
              {loadingLabel}
            </>
          ) : (
            <>
              <Icon name="lock" size={16} />
              <span>{payLabel}</span>
              {payAmount ? <span className="vt-dir-keep">{payAmount}</span> : null}
            </>
          )}
        </Button>
      </div>
      {reassurance ? <p className="vt-copay__reassure">{reassurance}</p> : null}
    </div>
  );
}
