"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/core";
import type { IconName } from "@/components/core";
import "./checkout-parts.css";

export type DisclosureRowProps = {
  id: string;
  icon: IconName;
  label: string;
  optionalLabel: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
};

/**
 * 44px disclosure (UI-SPEC S2, Section 2): icon, label, "Optional" tag, chevron that
 * turns 180 degrees. The panel stays mounted (hidden) so typed values and focus order
 * survive a toggle and Back from Stripe.
 */
export function DisclosureRow({
  id,
  icon,
  label,
  optionalLabel,
  open,
  onToggle,
  disabled = false,
  children,
}: DisclosureRowProps) {
  const panelId = `${id}-panel`;
  return (
    <div className="vt-codisc" data-open={open ? "true" : "false"} data-co-disclosure={id}>
      <button
        type="button"
        className="vt-codisc__head"
        id={`${id}-button`}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => onToggle(!open)}
      >
        <Icon name={icon} size={18} color="var(--vt-text-muted)" />
        <span className="vt-codisc__label">{label}</span>
        <span className="vt-codisc__tag">{optionalLabel}</span>
        <span className="vt-codisc__chevron" aria-hidden="true">
          <Icon name="chevron-down" size={18} color="var(--vt-text-muted)" />
        </span>
      </button>
      <div className="vt-codisc__panel" id={panelId} role="region" aria-labelledby={`${id}-button`} hidden={!open}>
        {children}
      </div>
    </div>
  );
}
