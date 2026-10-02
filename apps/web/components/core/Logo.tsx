import "./Logo.css";
import type { AnchorHTMLAttributes, CSSProperties, HTMLAttributes } from "react";

// the vendored design-system bundle (reference-only, D-30) `function Logo` (components/core/Logo.jsx) — the brand
// mark as supplied artwork, never re-typeset. Three colourways × three forms, all real
// SVG (D-06's white variants included, vendored by Plan 05).
export type LogoVariant = "primary" | "reversed" | "white";
export type LogoForm = "wordmark" | "lockup" | "mark";

// Same inert-getComputedStyle-branch reasoning as Icon.tsx — see that file's comment.
// FALLBACK_BASE is what actually ships, pointed at Plan 05's vendored copy (D-10).
const FALLBACK_BASE = "/brand/logo/";

// 26.2 audit U06-20: the app never sets `--vt-logo-base` (only the mock test harness does), so the
// per-render getComputedStyle read always fell back to this constant. Use it directly.
function logoBase(): string {
  return FALLBACK_BASE;
}

interface LogoOwnProps {
  variant?: LogoVariant;
  form?: LogoForm;
  tagline?: boolean;
  height?: number;
  href?: string;
  style?: CSSProperties;
}

export type LogoProps = LogoOwnProps &
  Omit<
    AnchorHTMLAttributes<HTMLAnchorElement> & HTMLAttributes<HTMLSpanElement>,
    keyof LogoOwnProps | "href"
  >;

export function Logo({
  variant = "primary",
  form,
  tagline = false,
  height = 28,
  href,
  style,
  ...rest
}: LogoProps) {
  const shape = form || (tagline ? "lockup" : "wordmark");
  const img = (
    <img
      src={`${logoBase()}${shape}-${variant}.svg`}
      alt="Vamos Taxi"
      style={{ height, width: "auto", display: "block" }}
    />
  );
  const wrapStyle: CSSProperties = { display: "inline-flex", alignItems: "center", border: 0, ...style };

  if (href) {
    return (
      <a
        href={href}
        aria-label="Vamos Taxi — home"
        style={wrapStyle}
        {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}
      >
        {img}
      </a>
    );
  }

  return (
    <span style={wrapStyle} {...(rest as HTMLAttributes<HTMLSpanElement>)}>
      {img}
    </span>
  );
}
