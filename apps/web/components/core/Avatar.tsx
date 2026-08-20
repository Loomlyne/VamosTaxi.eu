"use client";

import "./Avatar.css";
import { useEffect, useRef, useState } from "react";
import type { HTMLAttributes } from "react";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";

// design-system component bundle (reference-only per D-30), function Avatar
// (components/core/Avatar.jsx).
export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AvatarShape = "circle" | "square";
export type AvatarTone = "default" | "accent" | "inverse";
export type AvatarStatus = "online" | "busy" | "off";

const SIZES: Record<AvatarSize, number> = { xs: 24, sm: 32, md: 40, lg: 56, xl: 72 };
const DOT: Record<AvatarStatus, string> = {
  online: "var(--vt-success)",
  busy: "var(--vt-danger)",
  off: "var(--vt-grey-400)",
};

function initials(name?: string): string {
  return String(name || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase();
}

interface AvatarOwnProps {
  name?: string;
  src?: string;
  icon?: IconName;
  size?: AvatarSize;
  shape?: AvatarShape;
  tone?: AvatarTone;
  status?: AvatarStatus;
  className?: string;
}

export type AvatarProps = AvatarOwnProps & Omit<HTMLAttributes<HTMLSpanElement>, keyof AvatarOwnProps>;

export function Avatar({
  name,
  src,
  icon,
  size = "md",
  shape = "circle",
  tone = "default",
  status,
  className = "",
  ...rest
}: AvatarProps) {
  // Rule 2 addition — not present in the compiled source (see 01-06-SUMMARY.md §
  // Deviations). The source's own `src ? <img> : icon ? <Icon> : initials(name)`
  // branch has no error handling at all: a failed image request would render the
  // browser's broken-image glyph, which both the state matrix's documented contract
  // ("loading/empty/error... fall back to the initials monogram, never a
  // broken-image glyph") and the design system's own empty-state rule forbid.
  // Tracking failure locally and falling through to the branch the source already
  // has is additive behaviour, not an invented prop or class.
  //
  // Two-pronged check, not just onError: this is SSR'd markup, so the browser
  // starts loading the <img> the instant it parses the initial HTML — before
  // React hydrates and attaches any listener. A same-origin 404 (the gallery's own
  // "error" fixture, and the common real case of an expired photo URL) routinely
  // fails *before* hydration completes, and the DOM `error` event on <img> does
  // not bubble, so a purely event-driven handler silently misses it (verified
  // directly during this plan's execution — the naive onError-only version left
  // the broken source in the DOM after a real page load). The mount-time
  // `complete && naturalWidth === 0` check catches that already-failed case; the
  // onError handler still covers a failure that happens after hydration.
  const imgRef = useRef<HTMLImageElement>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
    const el = imgRef.current;
    if (el && el.complete && el.naturalWidth === 0) {
      setImgFailed(true);
    }
  }, [src]);

  const showImg = Boolean(src) && !imgFailed;

  const px = SIZES[size] || SIZES.md;
  const cls = [
    "vt-avatar",
    `vt-avatar--${shape}`,
    tone !== "default" ? `vt-avatar--${tone}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      className={cls}
      style={{ width: px, height: px, fontSize: Math.round(px * 0.38) }}
      title={name || undefined}
      {...rest}
    >
      {showImg ? (
        <img ref={imgRef} src={src} alt={name || ""} onError={() => setImgFailed(true)} />
      ) : icon ? (
        <Icon name={icon} size={Math.round(px * 0.5)} />
      ) : (
        initials(name)
      )}
      {status && DOT[status] ? <span className="vt-avatar__dot" style={{ background: DOT[status] }} /> : null}
    </span>
  );
}
