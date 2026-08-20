"use client";

import "./Counter.css";
import type { HTMLAttributes, ReactNode } from "react";
import { Icon } from "../core";
import type { IconName } from "../core";

// design-system component bundle (reference-only per D-30), function Counter
// (components/forms/Counter.jsx). Phase 4's passenger/luggage-count control against
// a vehicle-class capacity clamp (min/max come from the caller, not invented here).

export type CounterSize = "sm" | "md" | "lg";

interface CounterOwnProps {
  label?: ReactNode;
  icon?: IconName;
  value?: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  size?: CounterSize;
  /** Rule 2 addition — see Counter.css's header comment: the compiled source has no
   * whole-control disabled concept, only per-button clamp-driven disabling. */
  disabled?: boolean;
  /** Rule 2 addition — matrix: "Error = value outside vehicle-class capacity clamp".
   * Caller-supplied message, same error-message shape as Input/Select/Textarea. */
  error?: ReactNode;
  /** All copy is props-driven (I18N-01) — the source builds these as an English
   * sentence ("Fewer " + (label || "items")); ported instead as two explicit,
   * caller-supplied accessible names with no built-in English fallback. A caller
   * that omits both still gets a usable (if unlabelled) icon button rather than a
   * hardcoded English string; the gallery, English-on-purpose, supplies its own. */
  decrementLabel?: string;
  incrementLabel?: string;
  className?: string;
}

export type CounterProps = CounterOwnProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof CounterOwnProps>;

export function Counter({
  label,
  icon,
  value = 0,
  min = 0,
  max = 8,
  onChange,
  size = "md",
  disabled = false,
  error,
  decrementLabel,
  incrementLabel,
  className = "",
  ...rest
}: CounterProps) {
  const step = (delta: number) => {
    if (disabled) return;
    onChange?.(Math.min(max, Math.max(min, value + delta)));
  };

  const box = [
    "vt-counter__box",
    `vt-counter__box--${size}`,
    disabled ? "vt-counter__box--disabled" : "",
    error ? "vt-counter__box--error" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={["vt-counter", className].filter(Boolean).join(" ")} {...rest}>
      {label ? <span className="vt-counter__label">{label}</span> : null}
      <div className={box}>
        <button
          type="button"
          className="vt-counter__btn"
          onClick={() => step(-1)}
          disabled={disabled || value <= min}
          aria-label={decrementLabel}
        >
          <Icon name="minus" size={16} />
        </button>
        {/* Its value is a figure, so it keeps its direction inside Arabic rather
            than mirroring — .vt-dir-keep (tokens/laws.css law 03, already ported to
            apps/web/public/brand/tokens/laws.css). */}
        <span className="vt-counter__val vt-dir-keep">
          {icon ? <Icon name={icon} size={16} color="var(--vt-text-muted)" /> : null}
          {value}
        </span>
        <button
          type="button"
          className="vt-counter__btn"
          onClick={() => step(1)}
          disabled={disabled || value >= max}
          aria-label={incrementLabel}
        >
          <Icon name="plus" size={16} />
        </button>
      </div>
      {error ? (
        <span className="vt-counter__err">
          <Icon name="triangle-alert" size={13} />
          {error}
        </span>
      ) : null}
    </div>
  );
}
