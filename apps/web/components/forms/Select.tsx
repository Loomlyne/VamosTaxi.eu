"use client";

import "./Select.css";
import { useId, useState } from "react";
import type { FocusEvent, ReactNode, SelectHTMLAttributes } from "react";
import { Icon } from "../core";
import type { IconName } from "../core";

// design-system component bundle (reference-only per D-30), function Select
// (components/forms/Select.jsx). Same field shape as Input — see Input.tsx.
export type SelectSize = "sm" | "md" | "lg";
export type SelectOption = string | { value: string; label: string };

interface SelectOwnProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  icon?: IconName;
  options?: SelectOption[];
  placeholder?: string;
  size?: SelectSize;
  disabled?: boolean;
  /** Rule 2 addition — see Select.css's header comment. Neither the compiled source
   * nor any mock usage has this concept; the plan's own must_haves direct it built
   * ("Only the select and the date picker have a loading state"). */
  loading?: boolean;
  id?: string;
  className?: string;
}

export type SelectProps = SelectOwnProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, keyof SelectOwnProps>;

export function Select({
  label,
  hint,
  error,
  icon,
  options = [],
  placeholder,
  size = "md",
  disabled = false,
  loading = false,
  id,
  className = "",
  onFocus,
  onBlur,
  "aria-describedby": ariaDescribedBy,
  ...rest
}: SelectProps) {
  const [focus, setFocus] = useState(false);
  const generatedId = useId();
  const fid = id || generatedId;
  // 26.2 audit U06-7: tie the error/hint text to the control so a screen reader reads it.
  const msgId = `${fid}-msg`;
  const describedBy = [ariaDescribedBy, error || hint ? msgId : ""].filter(Boolean).join(" ") || undefined;

  const box = [
    "vt-input",
    "vt-select",
    `vt-input--${size}`,
    focus ? "vt-input--focus" : "",
    error ? "vt-input--error" : "",
    disabled ? "vt-input--disabled" : "",
    loading ? "vt-input--loading" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Rule 1 fix, same class as Input.tsx's chaining fix.
  const handleFocus = (e: FocusEvent<HTMLSelectElement>) => {
    setFocus(true);
    onFocus?.(e);
  };
  const handleBlur = (e: FocusEvent<HTMLSelectElement>) => {
    setFocus(false);
    onBlur?.(e);
  };

  return (
    <div className={["vt-field", className].filter(Boolean).join(" ")}>
      {label ? (
        <label className="vt-field__label" htmlFor={fid}>
          {label}
        </label>
      ) : null}
      <div className={box}>
        {icon ? <Icon name={icon} size={18} color="var(--vt-text-muted)" /> : null}
        <select
          id={fid}
          disabled={disabled || loading}
          // Rule 2 addition — the compiled source sets aria-invalid on Input and
          // Textarea's native element when `error` is set but omits it on Select's
          // (confirmed by reading the source signature directly); an inconsistency
          // that leaves Select's own error state invisible to assistive tech even
          // though the field visibly renders the error message below it. Added for
          // parity with its two siblings.
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-busy={loading || undefined}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((o) => {
            const value = typeof o === "string" ? o : o.value;
            const text = typeof o === "string" ? o : o.label;
            return (
              <option key={value} value={value}>
                {text}
              </option>
            );
          })}
        </select>
        {loading ? (
          // Purely decorative — `aria-busy` on the <select> above is what assistive
          // tech announces; no `label` here so Icon renders aria-hidden (no
          // hardcoded English string, per the plan's copy-is-props-driven rule).
          <Icon
            name="loader-circle"
            size={16}
            color="var(--vt-text-muted)"
            className="vt-select__spin"
          />
        ) : (
          <Icon name="chevron-down" size={16} color="var(--vt-text-muted)" />
        )}
      </div>
      {error ? (
        <span className="vt-field__err" id={msgId}>
          <Icon name="triangle-alert" size={13} />
          {error}
        </span>
      ) : hint ? (
        <span className="vt-field__hint" id={msgId}>{hint}</span>
      ) : null}
    </div>
  );
}
