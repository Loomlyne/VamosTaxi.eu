"use client";

import "./Tooltip.css";
import { useState } from "react";
import type { HTMLAttributes, ReactNode } from "react";

// design-system component bundle (reference-only per D-30), function Tooltip
// (components/feedback/Tooltip.jsx).
//
// "Open" = hover/focus-triggered visibility, not a distinct interaction state
// (Component State Matrix) — modelled as internal state exactly as the source does,
// not as a controllable prop.
export type TooltipPlacement = "top" | "bottom" | "right";

interface TooltipOwnProps {
  label: ReactNode;
  placement?: TooltipPlacement;
  children?: ReactNode;
  className?: string;
}

export type TooltipProps = TooltipOwnProps &
  Omit<HTMLAttributes<HTMLSpanElement>, keyof TooltipOwnProps>;

export function Tooltip({
  label,
  placement = "top",
  children,
  className = "",
  ...rest
}: TooltipProps) {
  const [on, setOn] = useState(false);
  return (
    <span
      className={["vt-tip", className].filter(Boolean).join(" ")}
      onMouseEnter={() => setOn(true)}
      onMouseLeave={() => setOn(false)}
      onFocus={() => setOn(true)}
      onBlur={() => setOn(false)}
      {...rest}
    >
      {children}
      <span
        role="tooltip"
        className={`vt-tip__bubble vt-tip__bubble--${placement}${on ? " vt-tip__bubble--on" : ""}`}
      >
        {label}
      </span>
    </span>
  );
}
