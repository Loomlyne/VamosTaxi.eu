import "./Button.css";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

// Prop union types and defaults match the vendored design-system's compiled
// `function Button` source (see 01-PATTERNS.md's Button excerpt) exactly
// (D-29). There is no `loading` prop on the source Button — a busy CTA
// composes Button + ProgressIndicator per the Component State Matrix
// (01-UI-SPEC.md); do not invent one here.
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "light"
  | "danger";

export type ButtonSize = "sm" | "md" | "lg";

interface ButtonOwnProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /**
   * Lucide icon name rendered before the label. Accepted now for exact
   * signature parity with the bundle (D-29); rendered once the `Icon`
   * component ports in the primitives batch (D-27/Plan 06) — until then
   * this is a no-op glyph slot, never a hand-drawn SVG or emoji stand-in
   * (CLAUDE.md's icon law).
   */
  icon?: string;
  iconEnd?: string;
  block?: boolean;
  sentenceCase?: boolean;
  disabled?: boolean;
  href?: string;
  children?: ReactNode;
  className?: string;
}

type AnchorOrButtonAttrs = Omit<
  ButtonHTMLAttributes<HTMLButtonElement> &
    AnchorHTMLAttributes<HTMLAnchorElement>,
  keyof ButtonOwnProps | "type"
>;

export type ButtonProps = ButtonOwnProps &
  AnchorOrButtonAttrs & {
    type?: ButtonHTMLAttributes<HTMLButtonElement>["type"];
  };

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconEnd,
  block = false,
  sentenceCase = false,
  disabled = false,
  href,
  type = "button",
  children,
  className = "",
  ...rest
}: ButtonProps) {
  // Class-name assembly copied verbatim from the source (D-24) — only the
  // CSS delivery mechanism changes (the static import above, not the
  // runtime style-injection helper the source used, per Pitfall 1).
  const cls = [
    "vt-btn",
    `vt-btn--${variant}`,
    `vt-btn--${size}`,
    block ? "vt-btn--block" : "",
    sentenceCase ? "vt-btn--sentence" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      {icon ? <span aria-hidden="true" data-vt-icon={icon} /> : null}
      {children}
      {iconEnd ? <span aria-hidden="true" data-vt-icon={iconEnd} /> : null}
    </>
  );

  if (href) {
    return (
      <a
        href={disabled ? undefined : href}
        className={cls}
        aria-disabled={disabled || undefined}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {inner}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={cls}
      disabled={disabled}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {inner}
    </button>
  );
}
