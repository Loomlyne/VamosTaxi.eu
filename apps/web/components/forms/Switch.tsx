"use client";

import "./Switch.css";
import type { InputHTMLAttributes, ReactNode } from "react";

// design-system component bundle (reference-only per D-30), function Switch
// (components/forms/Switch.jsx). No error prop — same reasoning as Radio.tsx.

interface SwitchOwnProps {
  label?: ReactNode;
  checked?: boolean;
  disabled?: boolean;
  className?: string;
}

export type SwitchProps = SwitchOwnProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, keyof SwitchOwnProps | "type" | "role">;

export function Switch({
  label,
  checked,
  disabled = false,
  className = "",
  ...rest
}: SwitchProps) {
  const box = ["vt-switch", disabled ? "vt-switch--disabled" : "", className]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={box}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} {...rest} />
      <span className="vt-switch__track">
        <span className="vt-switch__knob" />
      </span>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
