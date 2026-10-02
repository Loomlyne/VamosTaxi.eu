"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { Icon } from "@/components/core";
import { e164Phone } from "@/lib/checkout/contact-validate";
import "./Input.css";
import "./PhoneField.css";

function digitsOf(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export { e164Phone };

export function phoneShown(stored: string): string {
  return digitsOf(stored);
}

export type PhoneFieldProps = {
  label: string;
  value: string;
  onChange: (e164: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type" | "size">;

export function PhoneField({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  id,
  ...rest
}: PhoneFieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  // 26.2 audit U06-7: tie the error/hint text to the control; pass `required` as aria-required.
  const msgId = `${inputId}-msg`;
  const describedBy = [rest["aria-describedby"], error || hint ? msgId : ""].filter(Boolean).join(" ") || undefined;
  const [focused, setFocused] = useState(false);
  const shown = phoneShown(value);

  return (
    <div className="vt-field">
      {label ? (
        <label className="vt-field__label" htmlFor={inputId}>
          {label}
          {required ? (
            <span className="vt-field__req" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}
      <div
        className={focused ? "vt-input--focus" : undefined}
        data-vt-phone=""
        data-error={error ? "true" : undefined}
      >
        <Icon name="phone" size={18} />
        <span data-vt-phone-plus="" aria-hidden="true">
          +
        </span>
        <input
          {...rest}
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete={rest.autoComplete ?? "tel"}
          value={shown}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          onChange={(e) => onChange(e164Phone(e.target.value))}
        />
      </div>
      {error ? (
        <span className="vt-field__err" role="alert" id={msgId}>
          {error}
        </span>
      ) : hint ? (
        <span className="vt-field__hint" id={msgId}>{hint}</span>
      ) : null}
    </div>
  );
}
