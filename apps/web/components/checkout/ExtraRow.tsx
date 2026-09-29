"use client";

import { Checkbox } from "@/components/forms/Checkbox";
import "./checkout-parts.css";

export type ExtraRowProps = {
  code: string;
  /** The owner's name in the customer's language. Never the raw code. */
  name: string;
  /** Formatted, without the plus: `CHF 10.00`. */
  amount: string;
  checked: boolean;
  disabled?: boolean;
  /** The server is repricing after a change. */
  updating?: boolean;
  onChange: (checked: boolean) => void;
};

/** One tick-box extra: 44px Checkbox row, name from data, "+ amount" at the inline end. */
export function ExtraRow({ code, name, amount, checked, disabled = false, updating = false, onChange }: ExtraRowProps) {
  const state = disabled ? "disabled" : updating ? "updating" : checked ? "checked" : "unchecked";
  return (
    <div className="vt-coextra" data-co-extra={code} data-state={state}>
      <Checkbox
        label={name}
        checked={checked}
        disabled={disabled}
        aria-busy={updating || undefined}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="vt-coextra__amount vt-dir-keep" data-co-extra-amount>
        + {amount}
      </span>
    </div>
  );
}
