/**
 * Dashboard console path rules (D-10), one tested place. Phase 30 CLS-11: the chauffeur screen
 * lives at /chauffeurs; the old /fleet addresses only forward there.
 */

/** D-10 console paths on the dashboard host. Same ops.dc.html document. */
export const OPS_CONSOLE_EXACT = new Set([
  "/dashboard",
  "/bookings",
  "/bookings/new",
  "/calendar",
  "/customers",
  "/chauffeurs",
  "/support",
  "/pricing",
  "/profile",
  "/settings",
  "/coupons",
  "/reviews",
  "/pages",
  "/legal",
]);

/** Drops one trailing slash (not on the root path). */
export function normalizeDashboardPath(path: string): string {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/** True when the (locale-stripped) path is a console screen the ops document serves. */
export function isOpsConsolePath(path: string): boolean {
  const p = normalizeDashboardPath(path);
  if (OPS_CONSOLE_EXACT.has(p)) return true;
  const segments = p.split("/").filter(Boolean);
  if (segments.length === 2 && segments[0] === "bookings") return true;
  if (segments.length === 2 && segments[0] === "customers") return true;
  if (segments.length === 2 && segments[0] === "chauffeurs") return true;
  return false;
}

/**
 * Phase 30 CLS-11: the old fleet addresses and where they forward. Returns the /chauffeurs
 * address for "/fleet", "/fleet/chauffeurs" and "/fleet/chauffeurs/<id>", else null. Works on
 * the locale-stripped path; the caller adds the locale prefix.
 */
export function legacyChauffeursPath(path: string): string | null {
  const p = normalizeDashboardPath(path);
  if (p === "/fleet" || p === "/fleet/chauffeurs") return "/chauffeurs";
  const segments = p.split("/").filter(Boolean);
  if (segments.length === 3 && segments[0] === "fleet" && segments[1] === "chauffeurs") {
    return `/chauffeurs/${segments[2]}`;
  }
  return null;
}
