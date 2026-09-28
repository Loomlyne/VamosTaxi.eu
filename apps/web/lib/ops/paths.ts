/** Public dashboard URLs vs internal Next.js `/ops` routes. */

export const OPS_ROOT = "/ops";

// The second factor is the 'mfa' stage of the /login form (AuthForm, 26.1-23), not a page.
export const OPS_AUTH_INTERNAL: readonly string[] = Object.freeze([
  "/ops/sign-in",
  "/ops/accept-invite",
]);

export function publicDashboardPath(internalPath: string): string {
  if (internalPath === "/ops") return "/";
  if (internalPath.startsWith("/ops/")) return internalPath.slice("/ops".length);
  return internalPath;
}

export function internalDashboardPath(publicPath: string): string {
  if (publicPath === "/login" || publicPath === "/ops-login") return "/ops/sign-in";
  if (publicPath === "/" || publicPath === "") return "/ops";
  if (publicPath === "/ops" || publicPath.startsWith("/ops/")) return publicPath;
  return `/ops${publicPath}`;
}
