"use client";

import "./Input.css";
import { useId, useState } from "react";
import type { FocusEvent, InputHTMLAttributes, ReactNode } from "react";
import { Icon } from "../core";
import type { IconName } from "../core";

// design-system component bundle (reference-only per D-30), function Input
// (components/forms/Input.jsx). The representative form-control shape all eight
// controls in this batch follow (01-PATTERNS.md's Input excerpt).
export type InputSize = "sm" | "md" | "lg";

interface InputOwnProps {
  label?: ReactNode;
  hint?: ReactNode;
  /** Renders under the field in --vt-danger, replacing the hint (never both at once —
   * error always wins, exactly the source's own fallback ordering, ported verbatim). */
  error?: ReactNode;
  icon?: IconName;
  suffix?: ReactNode;
  size?: InputSize;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export type InputProps = InputOwnProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, keyof InputOwnProps>;

export function Input({
  label,
  hint,
  error,
  icon,
  suffix,
  size = "md",
  required = false,
  disabled = false,
  id,
  className = "",
  onFocus,
  onBlur,
  ...rest
}: InputProps) {
  // Law 01's stated exception: focus is tracked in local state to drive
  // .vt-input--focus, but the charcoal border is the only signal that reaches the
  // page — Input.css's own .vt-input--focus rule sets its box-shadow to none
  // directly (see Input.css's header comment for why). Do not swap this for the
  // button/card focus ring.
  const [focus, setFocus] = useState(false);
  const generatedId = useId();
  const fid = id || generatedId;

  const box = [
    "vt-input",
    `vt-input--${size}`,
    focus ? "vt-input--focus" : "",
    error ? "vt-input--error" : "",
    disabled ? "vt-input--disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Rule 1 fix (bug — see 01-09-SUMMARY.md § Deviations): the compiled source builds
  // this element with `_extends({..., onFocus: () => setFocus(true), onBlur: () =>
  // setFocus(false)}, rest)` — Object.assign semantics mean a caller-supplied
  // onFocus/onBlur in `rest` silently *replaces* the source's own handler, so the
  // focused border (a must_have this very plan states) would never appear for any
  // field whose caller also needs its own onFocus/onBlur (routine in a real booking
  // form — analytics, validation-on-blur). Chaining both here, rather than letting
  // one silently win, is a correctness fix, not a behaviour change for the common
  // case where the caller passes neither.
  const handleFocus = (e: FocusEvent<HTMLInputElement>) => {
    setFocus(true);
    onFocus?.(e);
  };
  const handleBlur = (e: FocusEvent<HTMLInputElement>) => {
    setFocus(false);
    onBlur?.(e);
  };

  return (
    <div className={["vt-field", className].filter(Boolean).join(" ")}>
      {label ? (
        <label className="vt-field__label" htmlFor={fid}>
          {label}
          {required ? <span className="vt-field__req"> *</span> : null}
        </label>
      ) : null}
      <div className={box}>
        {icon ? <Icon name={icon} size={18} color="var(--vt-text-muted)" /> : null}
        <input
          id={fid}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
        />
        {suffix ? <span className="vt-input__affix">{suffix}</span> : null}
      </div>
      {error ? (
        <span className="vt-field__err">
          <Icon name="triangle-alert" size={13} />
          {error}
        </span>
      ) : hint ? (
        <span className="vt-field__hint">{hint}</span>
      ) : null}
    </div>
  );
}
