/** Public dashboard URLs vs internal Next.js `/ops` routes. */

export const OPS_ROOT = "/ops";

export const OPS_AUTH_INTERNAL: readonly string[] = Object.freeze([
  "/ops/sign-in",
  "/ops/mfa-challenge",
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
