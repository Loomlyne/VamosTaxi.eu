// apps/web/lib/google/flag.ts
//
// The Google tag (Google Ads, owner decision 2026-10-09). CLOSED until the owner's Google wording is live on the
// banner, the cookies page and the privacy page in four languages and the consent version has moved: the
// controller opens it in the proof job. While it is false there is no Google host in any policy, and the loader
// (app/vamos-google.js, GOOGLE_ON) does nothing, not even a local consent default. The loader carries the same value.
//
// Do not read env here. Do not import React.

export const GOOGLE_TAG_OPEN = false as const;

/** Public ids from the agency: not secrets. */
export const GOOGLE_TAG_ID = "AW-368142830";
export const GOOGLE_CONVERSION_SEND_TO = "AW-368142830/liI8CIe79pUdEO7Txa8B";

export function googleTagAllowed(): boolean {
  return (GOOGLE_TAG_OPEN as boolean) === true;
}
