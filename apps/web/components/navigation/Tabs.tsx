import "./Tabs.css";
import type { HTMLAttributes } from "react";
import { Icon } from "../core";
import type { IconName } from "../core";

// design-system component bundle (reference-only per D-30), function Tabs
// (components/navigation/Tabs.jsx).
export type TabsVariant = "segmented" | "underline";

export interface TabsItem {
  value: string;
  label: string;
  icon?: IconName;
  /** Rule 2 addition (01-10-PLAN.md's own Task 1 action: "Tabs carries hover, focus,
   * selected, and a per-tab disabled state — disabled applies to one tab, never to the
   * whole control"). The compiled source's `function Tabs` has no disabled concept at
   * all — confirmed by reading it directly, `items` only ever carry
   * `value`/`label`/`icon`. Disabling one tab, not the whole control, is the only
   * shape that matches the stated contract. */
  disabled?: boolean;
}

interface TabsOwnProps {
  items?: (string | TabsItem)[];
  value?: string;
  onChange?: (value: string) => void;
  variant?: TabsVariant;
  block?: boolean;
  className?: string;
}

export type TabsProps = TabsOwnProps & Omit<HTMLAttributes<HTMLDivElement>, keyof TabsOwnProps>;

export function Tabs({
  items = [],
  value,
  onChange,
  variant = "segmented",
  block = false,
  className = "",
  ...rest
}: TabsProps) {
  const cls = [
    "vt-tabs",
    variant === "segmented" ? "" : `vt-tabs--${variant}`,
    block ? "vt-tabs--block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    // This row owns its own horizontal scroll (Tabs.css's Rule 2 overflow-x:auto addition).
    <div className={cls} role="tablist" {...rest}>
      {items.map((it) => {
        const id = typeof it === "string" ? it : it.value;
        const label = typeof it === "string" ? it : it.label;
        const icon = typeof it === "string" ? undefined : it.icon;
        const disabled = typeof it === "string" ? false : (it.disabled ?? false);
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            className={["vt-tab", active ? "vt-tab--active" : "", disabled ? "vt-tab--disabled" : ""]
              .filter(Boolean)
              .join(" ")}
            onClick={() => !disabled && onChange?.(id)}
          >
            {icon ? <Icon name={icon} size={16} /> : null}
            {label}
          </button>
        );
      })}
    </div>
  );
}
