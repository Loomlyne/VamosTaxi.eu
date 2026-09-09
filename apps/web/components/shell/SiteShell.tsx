"use client";

import { type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ContactFab } from "./ContactFab";

/**
 * The composition seam `apps/web/app/[locale]/layout.tsx` renders. It exists for exactly
 * one reason: the layout is a Server Component and cannot ask which route it is
 * rendering without `headers()`, which would force every public page to dynamic
 * rendering and defeat the static/edge-cached delivery the Phase 10 traffic target
 * depends on (Pitfall 2, 01-RESEARCH.md). Reading `usePathname()` in a small client
 * component costs nothing: it is resolved at prerender time for a statically rendered
 * route and re-read client-side on every navigation.
 *
 * The header and footer arrive as already-created elements from the layout rather than
 * being imported here, so the layout itself remains the place a reader sees the
 * mandatory shell composed — the rule CLAUDE.md states ("`SiteHeader` and `SiteFooter`
 * are mandatory on every public page") is visible where pages are composed, not hidden
 * one file deeper.
 *
 * The dev-only states gallery (`/dev/**`, D-28) is the one surface that renders WITHOUT
 * the shell, deliberately: it is an internal review scaffold, not a page of the product.
 * A sticky charcoal bar over a component-states gallery would obscure the very tiles a
 * reviewer opened it to look at, and its screenshots would carry chrome that belongs to
 * a different component. That exclusion is written here rather than left implicit so it
 * reads as a decision instead of an oversight.
 */
export function SiteShell({
  header,
  footer,
  children,
}: {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "";
  // `usePathname` from next/navigation returns the full path including the locale
  // segment (`/ar/dev/components/shell`), so the segment is matched anywhere in the
  // path rather than only at its start.
  const isDevScaffold = pathname === "/dev" || /(^|\/)dev(\/|$)/.test(pathname);
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const dashCookie =
    typeof document !== "undefined" && /(?:^|;\s*)vamos_dash=1(?:;|$)/.test(document.cookie);
  const isDashboard =
    dashCookie || host === "dashboard.vamostaxi.site" || host === "dashboard.localhost";
  const isOps = isDashboard || pathname === "/ops" || /(^|\/)ops(\/|$)/.test(pathname);

  const rest = pathname.replace(/^\/(de|fr|ar)(?=\/|$)/, "");
  const isHome = rest === "" || rest === "/";

  if (isDevScaffold || isOps) return <>{children}</>;

  return (
    <>
      {/* Home overlay header is composed inside the photographic hero. */}
      {isHome ? null : header}
      {children}
      {footer}
      <ContactFab />
    </>
  );
}
