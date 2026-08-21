import "./Toast.css";
import type { HTMLAttributes, ReactNode } from "react";
import { Icon } from "../core";
import type { IconName } from "../core";

// design-system component bundle (reference-only per D-30), function Toast
// (components/feedback/Toast.jsx).
//
// Law 02 (see Toast.css's header comment): `accent` is dropped from the tone union per
// the plan's explicit instruction, matching Alert. neutral/success/danger are the
// source's remaining tones. Enter/exit motion only — no interaction states
// (Component State Matrix). One toast at a time; no queue/manager is built here.
export type ToastTone = "neutral" | "success" | "danger";

const GLYPH: Record<ToastTone, IconName | null> = {
  neutral: null,
  success: "circle-check",
  danger: "triangle-alert",
};

const COLOUR: Record<ToastTone, string> = {
  neutral: "var(--vt-text-inverse)",
  success: "var(--vt-success)",
  danger: "var(--vt-danger)",
};

interface ToastOwnProps {
  tone?: ToastTone;
  icon?: IconName;
  onClose?: () => void;
  /** Component-owned copy (I18N-01) — the source hardcodes `"Dismiss"` as the close
   * button's aria-label (confirmed by reading `function Toast` directly). No default
   * here, matching the "no default, not a better default" precedent 01-09-SUMMARY.md
   * set for Counter/DatePicker's own component-owned strings; required whenever
   * `onClose` is supplied. */
  dismissLabel?: string;
  children?: ReactNode;
  className?: string;
}

export type ToastProps = ToastOwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof ToastOwnProps>;

export function Toast({
  tone = "neutral",
  icon,
  onClose,
  dismissLabel,
  children,
  className = "",
  ...rest
}: ToastProps) {
  const glyph = icon || GLYPH[tone];
  return (
    // role="status" is an implicit ARIA live region (assertive="polite") — this is
    // the mechanism that satisfies "a toast is announced by assistive technology
    // because it renders inside a live region" (must_haves), ported unchanged from
    // the source, which already carries it.
    <div className={["vt-toast", className].filter(Boolean).join(" ")} role="status" {...rest}>
      {glyph ? <Icon name={glyph} size={18} color={COLOUR[tone]} /> : null}
      <span className="vt-toast__msg">{children}</span>
      {onClose ? (
        <button
          type="button"
          className="vt-toast__close"
          aria-label={dismissLabel}
          onClick={onClose}
        >
          <Icon name="x" size={16} />
        </button>
      ) : null}
    </div>
  );
}
