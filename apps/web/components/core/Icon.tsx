import "./Icon.css";
import type { CSSProperties, HTMLAttributes } from "react";

// the vendored design-system bundle (reference-only, D-30) `function Icon` (components/core/Icon.jsx) — CSS-mask
// icon renderer over the vendored Lucide set (D-26). `name` is a union built from the
// 66 SVGs Plan 05 vendored into apps/web/public/brand/icons/ (`ls` run at port time),
// not a bare string — a typo becomes a compile error rather than a silently missing
// glyph. This list is the closed set; adding an icon means vendoring the SVG first,
// then adding its name here in the same commit.
export type IconName =
  | "arrow-left-right"
  | "arrow-right"
  | "arrow-up"
  | "baby"
  | "banknote"
  | "bell"
  | "briefcase"
  | "bus"
  | "calendar"
  | "calendar-days"
  | "car"
  | "car-front"
  | "check"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "chevron-up"
  | "circle-alert"
  | "circle-check"
  | "clock"
  | "credit-card"
  | "ellipsis"
  | "external-link"
  | "eye"
  | "eye-off"
  | "facebook"
  | "file-text"
  | "funnel"
  | "globe"
  | "grip-vertical"
  | "image"
  | "info"
  | "instagram"
  | "layout-dashboard"
  | "list"
  | "loader-circle"
  | "lock"
  | "log-out"
  | "luggage"
  | "mail"
  | "map-pin"
  | "menu"
  | "message-circle"
  | "minus"
  | "navigation"
  | "pencil"
  | "phone"
  | "plane"
  | "plane-landing"
  | "plane-takeoff"
  | "plus"
  | "printer"
  | "receipt"
  | "search"
  | "settings"
  | "shield-check"
  | "snowflake"
  | "star"
  | "ticket"
  | "trash-2"
  | "triangle-alert"
  | "upload"
  | "user"
  | "users"
  | "x"
  | "youtube";

// The source's own asset-base indirection (`--vt-icon-base`, read via
// getComputedStyle) is preserved for signature/behaviour parity (D-22's swappable
// token) but is inert in this port: Icon never becomes a client component (it has no
// interactive behaviour), so `iconBase()` always runs during the one server render
// that produces the shipped HTML, where `typeof window === "undefined"` is always
// true. FALLBACK_BASE is therefore the value that actually ships — pointed at the
// app's own vendored copy (D-10), not the mocks' page-relative "assets/icons/".
const FALLBACK_BASE = "/brand/icons/";

function iconBase(): string {
  if (typeof window === "undefined") return FALLBACK_BASE;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--vt-icon-base");
  const clean = (raw || "").trim().replace(/^["']|["']$/g, "");
  return clean || FALLBACK_BASE;
}

interface IconOwnProps {
  name: IconName;
  size?: number;
  color?: string;
  label?: string;
  style?: CSSProperties;
}

export type IconProps = IconOwnProps & Omit<HTMLAttributes<HTMLSpanElement>, keyof IconOwnProps>;

export function Icon({ name, size = 20, color = "currentColor", label, style, ...rest }: IconProps) {
  // Class-name-free by source design (D-24) — the mask is entirely inline style, the
  // one delivery mechanism this component ever had. See Icon.css for why that file
  // exists and holds no rules.
  const url = `url("${iconBase()}${name}.svg")`;
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flex: "0 0 auto",
        background: color,
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        ...style,
      }}
      {...rest}
    />
  );
}
