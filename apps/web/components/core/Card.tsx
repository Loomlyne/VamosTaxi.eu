import "./Card.css";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

// design-system component bundle (reference-only per D-30), function Card
// (components/core/Card.jsx).
//
// Law 02: the source's `accent` tone (background var(--vt-bg-accent-tint), border
// from the yellow scale's pale 200 step) is a banned pale-yellow surface. Dropped
// from the union and from Card.css — see 01-06-SUMMARY.md § Deviations. Every other
// tone is untouched.
export type CardTone = "default" | "flat" | "raised" | "floating" | "inverse";
export type CardPadding = "none" | "sm" | "md" | "lg";

interface CardOwnProps<T extends ElementType> {
  as?: T;
  tone?: CardTone;
  padding?: CardPadding;
  selectable?: boolean;
  selected?: boolean;
  children?: ReactNode;
  className?: string;
}

export type CardProps<T extends ElementType = "div"> = CardOwnProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof CardOwnProps<T>>;

export function Card<T extends ElementType = "div">({
  as,
  tone = "default",
  padding = "md",
  selectable = false,
  selected = false,
  children,
  className = "",
  ...rest
}: CardProps<T>) {
  const Tag = (as ?? "div") as ElementType;
  const cls = [
    "vt-card",
    tone !== "default" ? `vt-card--${tone}` : "",
    `vt-card--pad-${padding}`,
    selectable ? "vt-card--selectable" : "",
    selected ? "vt-card--selected" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  );
}
