import "./SectionHeader.css";
import type { HTMLAttributes, MouseEvent, ReactNode } from "react";
import { Icon } from "../core";

// design-system component bundle (reference-only per D-30), function SectionHeader
// (components/navigation/SectionHeader.jsx).
//
// Typographic composition only (Component State Matrix: no hover/press/focus/selected/
// disabled/loading/empty/error row of its own) — the optional action-link slot
// inherits whatever Button/link states its own content carries; nothing here gives it
// states it does not have.
export type SectionHeaderLevel = "h1" | "h2" | "h3" | "label";
export type SectionHeaderTone = "default" | "inverse";

interface SectionHeaderOwnProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  level?: SectionHeaderLevel;
  tone?: SectionHeaderTone;
  rule?: boolean;
  action?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export type SectionHeaderProps = SectionHeaderOwnProps &
  Omit<HTMLAttributes<HTMLDivElement>, keyof SectionHeaderOwnProps>;

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  level = "h2",
  tone = "default",
  rule = false,
  action,
  actionLabel,
  onAction,
  className = "",
  ...rest
}: SectionHeaderProps) {
  const cls = [
    "vt-sh",
    `vt-sh--${level}`,
    tone === "inverse" ? "vt-sh--inverse" : "",
    rule ? "vt-sh--rule" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const Tag = level === "h3" || level === "label" ? "h3" : "h2";

  const handleAction = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    onAction?.();
  };

  return (
    <div className={cls} {...rest}>
      <div className="vt-sh__main">
        {eyebrow ? <span className="vt-sh__eyebrow">{eyebrow}</span> : null}
        <Tag className="vt-sh__title">{title}</Tag>
        {subtitle ? <p className="vt-sh__sub">{subtitle}</p> : null}
      </div>
      {action ? (
        <div className="vt-sh__action">{action}</div>
      ) : actionLabel ? (
        <a href="#" className="vt-sh__link vt-sh__action" onClick={handleAction}>
          {actionLabel}
          <Icon name="chevron-right" size={15} className="vt-sh__link-icon" />
        </a>
      ) : null}
    </div>
  );
}
