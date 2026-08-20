import "./IconButton.css";
import type { ButtonHTMLAttributes } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

// design-system component bundle (reference-only per D-30), function IconButton
// (components/core/IconButton.jsx).
//
// NOTE (see 01-06-SUMMARY.md § Deviations): the UI-SPEC's Component State Matrix
// marks IconButton with a Selected state ("toggled icon buttons... e.g. the header's
// notification affordance"), but neither the compiled source signature (no
// selected/pressed prop, no CSS rule for one) nor the cited real usage supports it —
// SiteHeader.dc.html's notification bell is a bespoke `[data-hd-bell]` button with its
// own CSS, not built from IconButton at all. There is nothing to port this state from,
// so no prop or class is invented here to fill the gap; IconButton ships with exactly
// the signature and states the source declares (default/hover/press/focus/disabled).
export type IconButtonVariant = "plain" | "outline" | "solid" | "inverse";
export type IconButtonSize = "sm" | "md" | "lg";

interface IconButtonOwnProps {
  icon: IconName;
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
  className?: string;
}

export type IconButtonProps = IconButtonOwnProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof IconButtonOwnProps | "type">;

export function IconButton({
  icon,
  label,
  variant = "plain",
  size = "md",
  disabled = false,
  className = "",
  ...rest
}: IconButtonProps) {
  const cls = ["vt-iconbtn", `vt-iconbtn--${variant}`, `vt-iconbtn--${size}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} aria-label={label} title={label} disabled={disabled} {...rest}>
      <Icon name={icon} size={size === "sm" ? 16 : 20} />
    </button>
  );
}
