// apps/web/lib/meta/legal-gate.ts
//
// Fail-closed. Not env, not a pill scan, not Accept.
// Phase 28 plan 28-07 opened both flags. If either condition stops being true, set it back to false:
// the loader (app/vamos-meta.js) and the mock-page policy (lib/meta/pixel-csp.ts) both follow.
// Do not import the pixel id. Do not import React.

/**
 * The owner's three legal texts are live on the banner, the cookies page and the privacy page in four
 * languages: Phase 27 ship ce55cd75, the de/fr/ar lines 3cac1fc5, decision 2026-09-30-meta-wording.
 */
export const META_LEGAL_GATE_OPEN = true as const;

/**
 * The owner confirmed both Events Manager switches off for the pixel on 2026-10-03
 * (.planning/decisions/2026-10-01-meta-events-manager-switches.md, addendum 2026-10-03; Meta's setup file
 * re-read at 2026-10-03 14:00:50 UTC). If he ever reports a switch back on, this goes false again.
 */
export const META_EVENTS_MANAGER_SWITCHES_OFF = true as const;

export function metaMeasurementAllowed(): boolean {
  return META_LEGAL_GATE_OPEN === true && META_EVENTS_MANAGER_SWITCHES_OFF === true;
}
