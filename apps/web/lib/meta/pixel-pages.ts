/**
 * Server twin of the Meta page-view allow-list (Phase 28). The browser loader `app/vamos-meta.js`
 * holds the same rules in ES5; both are held together by the shared table in `pixel-pages.cases.ts`.
 * An allow-list decides, never a deny-list (D-02); the denials are tests on top.
 *
 * The rules below contain no Meta host and no pixel id on purpose (Phase 26 needle scan).
 */
import { ACCOUNT_SECTIONS } from "../dc-mock-urls";

const HOST = "vamostaxi.site";
const INDEXABLE = ["about", "faq", "contact", "terms", "privacy", "cookies", "cancellation", "imprint"] as const;
const PREFIXES = ["de", "fr", "ar"] as const;

/** Every path the pixel may count, exact match, no trailing slash. */
export const PIXEL_ALLOWED_PATHS: readonly string[] = Object.freeze([
  "/",
  ...INDEXABLE.map((p) => `/${p}`),
  ...PREFIXES.map((l) => `/${l}`),
  ...PREFIXES.flatMap((l) => INDEXABLE.map((p) => `/${l}/${p}`)),
  "/coming-soon",
  "/sitemap",
  "/account",
  ...ACCOUNT_SECTIONS.map((s) => `/account/${s}`),
  "/bookings",
  "/sign-in",
  "/sign-up",
]);

/**
 * May a page view at this address go to Meta? (META-06, META-07; D-01, D-02, D-03.)
 * Only https://vamostaxi.site, only an allowed path, no query on /sign-in and /sign-up (strict
 * reading, owner 2026-10-03), elsewhere only fbclid and utm_* keys, only a plain anchor as hash, and
 * never an address that carries a booking reference or an e-mail address.
 */
export function pixelPageAllowed(url: URL): boolean {
  if (url.protocol !== "https:" || url.hostname !== HOST) return false;
  if (url.port !== "" || url.username !== "" || url.password !== "") return false;
  if (!PIXEL_ALLOWED_PATHS.includes(url.pathname)) return false;

  if (url.pathname === "/sign-in" || url.pathname === "/sign-up") {
    if (url.href.includes("?")) return false;
  } else if (url.search !== "") {
    for (const key of new URLSearchParams(url.search).keys()) {
      if (key !== "fbclid" && !/^utm_[a-z_]+$/.test(key)) return false;
    }
  }

  if (url.hash !== "" && !/^#[A-Za-z0-9_-]{1,64}$/.test(url.hash)) return false;

  // Decoded once strictly (an undecodable address fails closed), then again leniently, level by level, so a
  // double-encoded @ (%2540) or reference (vt%252D1) cannot slip through. Still changing after five rounds: refuse.
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.href);
  } catch {
    return false;
  }
  for (let round = 0; ; round++) {
    // Credentials were refused above; an @ anywhere else is an e-mail address.
    if (/vt-\d/i.test(decoded) || decoded.includes("@")) return false;
    const next = decoded.replace(/%([0-9A-Fa-f]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
    if (next === decoded) return true;
    if (round >= 5) return false;
    decoded = next;
  }
}
