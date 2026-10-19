// apps/web/lib/meta/legal-gate.ts
//
// Fail-closed. Not env, not a pill scan, not Accept.
// 2026-10-18 (owner): every Meta tag was removed from the site, browser and server. All three flags are
// false, so the server-side Conversions API (purchase.ts, funnel.ts, the /api/track route) sends nothing and
// saves no Meta click id. The owner installs the next tags himself; these flags open again only with them.
// Do not import the pixel id. Do not import React.

/** The browser pixel and its legal texts are gone (2026-10-18). */
export const META_LEGAL_GATE_OPEN = false as const;

/** Kept for the day a pixel comes back: the owner must confirm both Events Manager switches off again. */
export const META_EVENTS_MANAGER_SWITCHES_OFF = false as const;

/** The booking-step and contact events are gone with the pixel (2026-10-18). */
export const META_EVENTS_OPEN = false as const;

export function metaMeasurementAllowed(): boolean {
  return (META_LEGAL_GATE_OPEN as boolean) === true && (META_EVENTS_MANAGER_SWITCHES_OFF as boolean) === true;
}

/** The page-view gate and the wider events flag, both: the only test the extra events use. */
export function metaEventsAllowed(): boolean {
  return metaMeasurementAllowed() && (META_EVENTS_OPEN as boolean) === true;
}
