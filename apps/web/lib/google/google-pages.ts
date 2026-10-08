/**
 * Server twin of the Google tag's address list (owner decision 2026-10-09). The browser loader
 * `app/vamos-google.js` holds the same list in ES5; `google-pages.test.ts` runs one shared table through both.
 * The list is the Meta page-view list plus the one-page checkout and the booking confirmation. Only the path
 * decides: the query and the hash are never read, never sent (the loader replaces the page address with the
 * path alone). Pay links, manage-booking, sign-in confirm, reset-password, review, the dashboard and ops are never on it.
 */
import { PIXEL_ALLOWED_PATHS } from "../meta/pixel-pages";

const HOST = "vamostaxi.site";
const PREFIXES = ["de", "fr", "ar"] as const;

export const GOOGLE_ALLOWED_PATHS: readonly string[] = Object.freeze([
  ...PIXEL_ALLOWED_PATHS,
  "/checkout",
  ...PREFIXES.map((l) => `/${l}/checkout`),
]);

const CONFIRMATION_RE = /^(\/(de|fr|ar))?\/confirmation\/VT-[0-9]{2}-[0-9]{4,5}$/;

/** May the Google tag run at this address, and may its policy name Google's hosts here? */
export function googlePageAllowed(url: URL): boolean {
  if (url.protocol !== "https:" || url.hostname !== HOST) return false;
  if (url.port !== "" || url.username !== "" || url.password !== "") return false;
  return GOOGLE_ALLOWED_PATHS.includes(url.pathname) || CONFIRMATION_RE.test(url.pathname);
}
