"use client";

import "./Textarea.css";
import { useId, useState } from "react";
import type { CSSProperties, FocusEvent, ReactNode, TextareaHTMLAttributes } from "react";
import { Icon } from "../core";

// design-system component bundle (reference-only per D-30), function Textarea
// (components/forms/Textarea.jsx). Same field shape and focus/error-over-hint
// ordering as Input (01-PATTERNS.md) — see Input.tsx for the shared commentary.

interface TextareaOwnProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  rows?: number;
  disabled?: boolean;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

export type TextareaProps = TextareaOwnProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, keyof TextareaOwnProps>;

export function Textarea({
  label,
  hint,
  error,
  rows = 3,
  disabled = false,
  id,
  className = "",
  style,
  onFocus,
  onBlur,
  "aria-describedby": ariaDescribedBy,
  ...rest
}: TextareaProps) {
  const [focus, setFocus] = useState(false);
  const generatedId = useId();
  const fid = id || generatedId;
  // 26.2 audit U06-7: tie the error/hint text to the control so a screen reader reads it.
  const msgId = `${fid}-msg`;
  const describedBy = [ariaDescribedBy, error || hint ? msgId : ""].filter(Boolean).join(" ") || undefined;

  const box = [
    "vt-input",
    "vt-input--area",
    focus ? "vt-input--focus" : "",
    error ? "vt-input--error" : "",
    disabled ? "vt-input--disabled" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Rule 1 fix (bug), same class as Input.tsx's — see that file's comment for why
  // chaining rather than letting a caller-supplied handler silently replace the
  // source's own is required for the focused-border must_have to hold.
  const handleFocus = (e: FocusEvent<HTMLTextAreaElement>) => {
    setFocus(true);
    onFocus?.(e);
  };
  const handleBlur = (e: FocusEvent<HTMLTextAreaElement>) => {
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
      <div className={box} style={style}>
        <textarea
          id={fid}
          rows={rows}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
        />
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
