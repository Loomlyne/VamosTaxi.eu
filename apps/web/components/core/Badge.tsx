import "./Badge.css";
import type { HTMLAttributes, ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

// design-system component bundle (reference-only per D-30), function Badge
// (components/core/Badge.jsx).
//
// Law 02 (CLAUDE.md § "Never use tinted yellow or brownish surfaces"; tokens/laws.css):
// the source's `warning` tone (background from the yellow scale's pale 100 step,
// text from its brown 700 step) is a banned pale/brown surface. Dropped from the
// union and from Badge.css rather than shipped and relying on laws.css's runtime
// alias — see
// 01-06-SUMMARY.md § Deviations. Every other tone the source declares is untouched,
// including `accent`, which uses the full-strength `--vt-yellow` token and is not
// banned.
export type BadgeTone = "neutral" | "accent" | "success" | "danger" | "info" | "inverse" | "outline";

interface BadgeOwnProps {
  tone?: BadgeTone;
  icon?: IconName;
  children?: ReactNode;
  className?: string;
}

export type BadgeProps = BadgeOwnProps & Omit<HTMLAttributes<HTMLSpanElement>, keyof BadgeOwnProps>;

export function Badge({ tone = "neutral", icon, children, className = "", ...rest }: BadgeProps) {
  const cls = ["vt-badge", `vt-badge--${tone}`, className].filter(Boolean).join(" ");
  return (
    <span className={cls} {...rest}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
    </span>
  );
}
