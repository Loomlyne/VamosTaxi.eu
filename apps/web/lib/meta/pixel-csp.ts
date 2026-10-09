/**
 * Second lock for the Meta page view (Phase 28, META-07, D-05): the security policy of a mock page
 * lets the browser reach Meta's hosts only on a clean address, and only while both code flags are on.
 * The answer depends on the address alone, never on the visitor, so cached marketing HTML stays
 * identical for everyone. Pay links, checkout, confirmation, manage-booking, ops and the dashboard
 * never get a Meta host, even if the loader had a bug.
 *
 * 2026-10-09: the same function also adds Google's documented Ads hosts on the addresses of the Google tag
 * (`lib/google/google-pages.ts`) while its flag is open. Meta and Google are decided independently, by address.
 */
import { contentSecurityPolicy } from "../security/headers";
import { googleTagAllowed } from "../google/flag";
import { googlePageAllowed } from "../google/google-pages";
import { pixelPageAllowed } from "./pixel-pages";

/** The Content-Security-Policy to send for this address, or null to keep the default one. */
export function metaPixelCspFor(url: URL, measurementAllowed: boolean): string | null {
  const meta = measurementAllowed && pixelPageAllowed(url);
  const google = googleTagAllowed() && googlePageAllowed(url);
  if (!meta && !google) return null;
  return contentSecurityPolicy({ metaPixel: meta, googleTag: google });
}
