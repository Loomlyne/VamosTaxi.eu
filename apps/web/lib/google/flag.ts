// apps/web/lib/google/flag.ts
//
// The Google tag (Google Ads, owner decision 2026-10-09). Opened 2026-10-09: the adopted wording is live in
// four languages and the consent version is 2026-10-09. The loader (app/vamos-google.js, GOOGLE_ON) carries
// the same value. While it is false there is no Google host in any policy, and the loader does nothing.
//
// GA4 (adopted wording .planning/decisions/2026-10-11-ga4-wording.md, consent version 2026-10-13): GA4_OPEN is
// ANALYTICS_ON in the loader. It needs GOOGLE_TAG_OPEN too. Closing it alone stops the GA4 config, its events and
// its purchase; the Ads tag is unchanged.
//
// Google Tag Manager (owner choice 2026-10-13 "Add GTM behind consent"): GTM_OPEN is GTM_ON in the loader. Wording
// adopted as written 2026-10-13 (.planning/decisions/2026-10-13-gtm-wording.md); same consent version 2026-10-13.
// OFF since 2026-10-15: the agency container holds duplicate Google Ads and GA4 tags the owner cannot edit; turn
// back on only when the container is clean (.planning/decisions/2026-10-15-gtm-off.md). ON again 2026-10-16: the
// controller read the live container's published tags as empty (.planning/decisions/2026-10-16-tracking-before-consent.md).
// While off, its adopted texts are not rendered. When on, it loads only with Analytics AND Marketing on. A test pins
// each pair.
//
// Consent Mode ADVANCED since 2026-10-16: gtag.js loads for every visitor on the listed pages with consent denied
// (cookieless pings); the adopted wording is .planning/decisions/2026-10-16-google-advanced-consent-wording.md.
//
// Do not read env here. Do not import React.

export const GOOGLE_TAG_OPEN = true as const;
export const GA4_OPEN = true as const;
export const GTM_OPEN = true as const;

/** Public ids from the agency and the owner: not secrets. */
export const GOOGLE_TAG_ID = "AW-368142830";
export const GOOGLE_CONVERSION_SEND_TO = "AW-368142830/liI8CIe79pUdEO7Txa8B";
export const GA4_MEASUREMENT_ID = "G-K5MZME44P6";
export const GTM_CONTAINER_ID = "GTM-KPKGT4VH";

export function googleTagAllowed(): boolean {
  return (GOOGLE_TAG_OPEN as boolean) === true;
}
