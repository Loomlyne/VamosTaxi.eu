// apps/web/lib/google/flag.ts
//
// The Google tag (Google Ads, owner decision 2026-10-09). Opened 2026-10-09: the adopted wording is live in
// four languages and the consent version is 2026-10-09. The loader (app/vamos-google.js, GOOGLE_ON) carries
// the same value. While it is false there is no Google host in any policy, and the loader does nothing.
//
// Do not read env here. Do not import React.

export const GOOGLE_TAG_OPEN = true as const;

/** Public ids from the agency: not secrets. */
export const GOOGLE_TAG_ID = "AW-368142830";
export const GOOGLE_CONVERSION_SEND_TO = "AW-368142830/liI8CIe79pUdEO7Txa8B";

export function googleTagAllowed(): boolean {
  return (GOOGLE_TAG_OPEN as boolean) === true;
}
