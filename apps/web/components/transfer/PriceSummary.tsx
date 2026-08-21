import "./PriceSummary.css";
import type { ReactNode } from "react";
import { Icon } from "../core";
import type { IconName } from "../core";
import { formatAmount, DEFAULT_CURRENCY } from "../../lib/currency";
import type { CurrencyCode } from "../../lib/currency";

// design-system component bundle (reference-only per D-30), function PriceSummary
// (components/transfer/PriceSummary.jsx, `_ds_bundle.js:44648-44698`). This is where
// the currency rule lives (ADR-004 / I18N-05): no component writes a `CHF`/`EUR`/…
// literal into its own logic — every figure below goes through `formatAmount`
// (`apps/web/lib/currency.ts`), the shared, swappable "mark" layer. Every amount is
// `null`/omitted in this phase (Law 04) and renders the placeholder `000` figure; only
// the mark can change, never the number, until the real matrix lands in Phase 4.
export interface PriceLine {
  label: ReactNode;
  /** `null`/omitted -> the Law 04 placeholder figure. Never invent a real number. */
  amount?: number | null;
  icon?: IconName;
  credit?: boolean;
  muted?: boolean;
}

export interface PriceSummaryProps {
  lines?: PriceLine[];
  total?: number | null;
  /** No built-in English fallback ("Total" in the source) — same "caller supplies, the
   * dictionary resolves at the call site" pattern 01-09-SUMMARY.md established for
   * Counter/DatePicker's hardcoded-in-source copy. */
  totalLabel?: ReactNode;
  currency?: CurrencyCode;
  /** A pending policy value (e.g. the free-cancellation window) renders as a labelled
   * gap pill — the caller passes `<span data-tok>free cancel window</span>` here, per
   * `design-system/tokens/laws.css`'s law 04 — never a `{TOKEN_NAME}` template string. */
  note?: ReactNode;
  inverse?: boolean;
  /** Rule 2 addition — the compiled source has no loading/empty/error concept; UI-SPEC's
   * own Component State Matrix marks all three ("loading = price computing… relevant
   * from Phase 4 on… state exists now"). */
  loading?: boolean;
  loadingLabel?: ReactNode;
  empty?: boolean;
  emptyMessage?: ReactNode;
  error?: ReactNode;
  className?: string;
}

export function PriceSummary({
  lines = [],
  total,
  totalLabel,
  currency = DEFAULT_CURRENCY,
  note,
  inverse = false,
  loading = false,
  loadingLabel,
  empty = false,
  emptyMessage,
  error,
  className = "",
}: PriceSummaryProps) {
  const cls = ["vt-price", inverse ? "vt-price--inverse" : "", className].filter(Boolean).join(" ");

  if (error) {
    return (
      <div className={cls}>
        <p className="vt-price__state vt-price__state--error">
          <Icon name="triangle-alert" size={14} color="var(--vt-danger)" />
          {error}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={cls} aria-busy="true">
        <p className="vt-price__state">
          <Icon name="loader-circle" size={16} color="var(--vt-text-muted)" className="vt-price__spin" />
          {loadingLabel}
        </p>
      </div>
    );
  }

  if (empty) {
    return (
      <div className={cls}>
        <p className="vt-price__state">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cls}>
      {lines.map((l, i) => (
        <div
          key={typeof l.label === "string" ? l.label : i}
          className={"vt-price__row" + (l.credit ? " vt-price__row--credit" : l.muted ? " vt-price__row--muted" : "")}
        >
          <span className="vt-price__label">
            {l.icon ? <Icon name={l.icon} size={15} /> : null}
            {l.label}
          </span>
          {/* Figures keep their own direction inside Arabic (UI-SPEC's Four-Language
              Layout Contract, "Must NOT mirror" table names PriceSummary explicitly). */}
          <span className="vt-price__val vt-dir-keep">{formatAmount(l.amount, currency)}</span>
        </div>
      ))}
      <div className="vt-price__total">
        <span className="vt-price__totallabel">{totalLabel}</span>
        <span className="vt-price__totalval vt-dir-keep">{formatAmount(total, currency)}</span>
      </div>
      {note ? <p className="vt-price__note">{note}</p> : null}
    </div>
  );
}
