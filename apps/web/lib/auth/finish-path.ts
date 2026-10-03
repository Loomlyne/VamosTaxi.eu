// apps/web/lib/auth/finish-path.ts
//
// 27.1 (27 D-37), client-safe: where a page sends an account that must still finish, keeping the
// language of the path and, from /checkout, the checkout itself as the return target (the finish
// page reads it with the same rule as lib/account/return-to.ts).

import { safeReturnTo } from "../account/return-to";

const LOCALES = ["de", "fr", "ar"] as const;

/**
 * The finish step for the page at `pathname` + `search`.
 * @param pathname location.pathname of the current page
 * @param search location.search of the current page ("" or "?…")
 */
export function finishPathFrom(pathname: string, search: string): string {
  const first = pathname.split("/").filter(Boolean)[0] ?? "";
  const prefix = (LOCALES as readonly string[]).includes(first) ? `/${first}` : "";
  const q = new URLSearchParams({ state: "finish" });
  const back = safeReturnTo(`${pathname}${search}`);
  if (back) q.set("returnTo", back);
  return `${prefix}/sign-up?${q.toString()}`;
}
