import "./ProgressIndicator.css";
import type { HTMLAttributes, ReactNode } from "react";

// design-system component bundle (reference-only per D-30), function
// ProgressIndicator (components/feedback/ProgressIndicator.jsx).
//
// This component *is* the loading-state primitive (Component State Matrix) — a busy
// button or dialog composes it rather than owning a loading prop of its own.
// tone="danger" is the error state (a failed step).
export type ProgressIndicatorTone = "accent" | "charcoal" | "success" | "danger";
export type ProgressIndicatorSize = "sm" | "md";

interface ProgressIndicatorOwnProps {
  value?: number;
  max?: number;
  label?: ReactNode;
  valueLabel?: ReactNode;
  segments?: number;
  tone?: ProgressIndicatorTone;
  size?: ProgressIndicatorSize;
  inverse?: boolean;
  className?: string;
}

export type ProgressIndicatorProps = ProgressIndicatorOwnProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof ProgressIndicatorOwnProps>;

export function ProgressIndicator({
  value = 0,
  max = 100,
  label,
  valueLabel,
  segments,
  tone = "accent",
  size = "md",
  inverse = false,
  className = "",
  ...rest
}: ProgressIndicatorProps) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const cls = [
    "vt-prog",
    `vt-prog--${tone}`,
    size === "sm" ? "vt-prog--sm" : "",
    inverse ? "vt-prog--inverse" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={cls}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      {...rest}
    >
      {label || valueLabel ? (
        <div className="vt-prog__row">
          {label ? <span className="vt-prog__label">{label}</span> : null}
          {valueLabel ? <span className="vt-prog__val">{valueLabel}</span> : null}
        </div>
      ) : null}
      {segments ? (
        <div className="vt-prog__segs">
          {Array.from({ length: segments }).map((_, i) => (
            <span key={i} className={"vt-prog__seg" + (i < value ? " vt-prog__seg--on" : "")} />
          ))}
        </div>
      ) : (
        <div className="vt-prog__track">
          <span className="vt-prog__fill" style={{ width: pct + "%" }} />
        </div>
      )}
    </div>
  );
}
