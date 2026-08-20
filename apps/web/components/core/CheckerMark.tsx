import "./CheckerMark.css";
import type { CSSProperties, ImgHTMLAttributes } from "react";

// the vendored design-system bundle (reference-only, D-30) `function CheckerMark` (components/core/CheckerMark.jsx)
// — the brand's checker motif: the three yellow "pixels" that top the logo's V, blown
// up. Supplied artwork (apps/web/public/brand/patterns/checker-mark.png, vendored by
// Plan 05), decorative only. The mock's own aria treatment — `alt=""` +
// `aria-hidden="true"` — is ported verbatim, not re-decided (this batch's action:
// "the mock marks it hidden from screen readers and the port does not re-decide
// that").
const FALLBACK_BASE = "/brand/patterns/";

function patternBase(): string {
  if (typeof window === "undefined") return FALLBACK_BASE;
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--vt-pattern-base");
  const clean = (raw || "").trim().replace(/^["']|["']$/g, "");
  return clean || FALLBACK_BASE;
}

interface CheckerMarkOwnProps {
  size?: number;
  opacity?: number;
  style?: CSSProperties;
}

export type CheckerMarkProps = CheckerMarkOwnProps &
  Omit<ImgHTMLAttributes<HTMLImageElement>, keyof CheckerMarkOwnProps | "src" | "alt" | "aria-hidden">;

export function CheckerMark({ size = 72, opacity = 1, style, ...rest }: CheckerMarkProps) {
  return (
    <img
      src={`${patternBase()}checker-mark.png`}
      alt=""
      aria-hidden="true"
      style={{ width: size, height: size, opacity, display: "block", ...style }}
      {...rest}
    />
  );
}
