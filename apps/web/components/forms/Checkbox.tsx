"use client";

import "./Checkbox.css";
import { useEffect, useRef } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { Icon } from "../core";

// design-system component bundle (reference-only per D-30), function Checkbox
// (components/forms/Checkbox.jsx). Same "vt-choice" CSS scope as Radio.

interface CheckboxOwnProps {
  label?: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  /** Rule 2 addition — see Checkbox.css's header comment. The compiled source has no
   * indeterminate concept; the matrix's own "Selected = checked/indeterminate" row
   * requires it. `indeterminate` is a DOM-only property (no HTML attribute, no JSX
   * prop React exposes directly) — set imperatively on the underlying input via ref,
   * the same pattern React's own docs recommend for this exact case. */
  indeterminate?: boolean;
  /** Rule 2 addition — matrix: "error = invalid". A boolean border-only signal, not an
   * error-message prop like Input's — Checkbox has no message slot of its own in the
   * source; the field group composing several checkboxes owns the message. */
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}

export type CheckboxProps = CheckboxOwnProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, keyof CheckboxOwnProps | "type">;

export function Checkbox({
  label,
  description,
  checked,
  indeterminate = false,
  invalid = false,
  disabled = false,
  className = "",
  ...rest
}: CheckboxProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  const box = [
    "vt-check",
    disabled ? "vt-check--disabled" : "",
    invalid ? "vt-check--invalid" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={box}>
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        aria-checked={indeterminate ? "mixed" : undefined}
        {...rest}
      />
      <span className="vt-check__box">
        {indeterminate ? (
          <Icon name="minus" size={14} color="var(--vt-charcoal-900)" />
        ) : checked ? (
          <Icon name="check" size={14} color="var(--vt-charcoal-900)" />
        ) : null}
      </span>
      <span className="vt-check__text">
        <span>{label}</span>
        {description ? <span className="vt-check__desc">{description}</span> : null}
      </span>
    </label>
  );
}
