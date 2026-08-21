import "./Alert.css";
import type { HTMLAttributes, ReactNode } from "react";
import { Icon } from "../core";
import type { IconName } from "../core";

// design-system component bundle (reference-only per D-30), function Alert
// (components/feedback/Alert.jsx).
//
// Law 02 (see Alert.css's header comment): `accent` is dropped from the tone union —
// the source's fourth tone ships a banned pale-yellow surface. info/success/danger/
// inverse are the source's remaining tones, ported unchanged.
export type AlertTone = "info" | "success" | "danger" | "inverse";

const GLYPH: Record<AlertTone, IconName> = {
  info: "info",
  success: "circle-check",
  danger: "triangle-alert",
  inverse: "info",
};

const COLOUR: Record<AlertTone, string> = {
  info: "var(--vt-text-muted)",
  success: "var(--vt-success)",
  danger: "var(--vt-danger)",
  inverse: "var(--vt-accent)",
};

interface AlertOwnProps {
  tone?: AlertTone;
  title?: ReactNode;
  icon?: IconName;
  children?: ReactNode;
  className?: string;
}

export type AlertProps = AlertOwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof AlertOwnProps>;

export function Alert({
  tone = "info",
  title,
  icon,
  children,
  className = "",
  ...rest
}: AlertProps) {
  return (
    <div
      className={["vt-alert", `vt-alert--${tone}`, className].filter(Boolean).join(" ")}
      role="note"
      {...rest}
    >
      <Icon name={icon || GLYPH[tone]} size={18} color={COLOUR[tone]} />
      <div className="vt-alert__body">
        {title ? <strong className="vt-alert__title">{title}</strong> : null}
        {children}
      </div>
    </div>
  );
}
