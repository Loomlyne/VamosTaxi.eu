"use client";

import "./Radio.css";
import type { InputHTMLAttributes, ReactNode } from "react";

// design-system component bundle (reference-only per D-30), function Radio
// (components/forms/Radio.jsx). Same "vt-choice" CSS scope as Checkbox — see that
// file for the shared shape's commentary. No error prop: the field group that
// composes a radio set owns validation, matching the matrix's own Error column (—).

interface RadioOwnProps {
  label?: ReactNode;
  description?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  className?: string;
}

export type RadioProps = RadioOwnProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, keyof RadioOwnProps | "type">;

export function Radio({
  label,
  description,
  checked,
  disabled = false,
  className = "",
  ...rest
}: RadioProps) {
  const box = ["vt-check", "vt-radio", disabled ? "vt-check--disabled" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={box}>
      <input type="radio" checked={checked} disabled={disabled} {...rest} />
      <span className="vt-check__box vt-radio__box">
        {checked ? <span className="vt-radio__dot" /> : null}
      </span>
      <span className="vt-check__text">
        <span>{label}</span>
        {description ? <span className="vt-check__desc">{description}</span> : null}
      </span>
    </label>
  );
}
