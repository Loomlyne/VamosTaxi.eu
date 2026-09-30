// apps/web/lib/scroll.ts
//
// Scrolling is native (owner, 2026-09-28; both scrollers out 2026-09-30). The one thing the
// app still does by hand is an in-page jump below the sticky header.

/** 76px sticky header plus a small gap. */
export const STICKY_HEADER_OFFSET = -88;

/**
 * Scrolls the page to an element (or the element with this id, with or without a leading
 * `#`), leaving `offset` px above it. Smooth unless the visitor prefers reduced motion.
 * A missing element is a silent no-op.
 *
 * @param target An element, or an element id.
 * @param offset Pixels added to the element's position; negative leaves room for the header.
 */
export function scrollToElement(target: string | HTMLElement, offset: number = STICKY_HEADER_OFFSET): void {
  const el = typeof target === "string" ? document.getElementById(target.replace(/^#/, "")) : target;
  if (!el) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const top = el.getBoundingClientRect().top + window.pageYOffset + offset;
  window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
}
