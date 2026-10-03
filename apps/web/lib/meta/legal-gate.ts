// apps/web/lib/meta/legal-gate.ts
//
// Fail-closed. Not env, not a pill scan, not Accept.
// Two flags, both still false after Phase 28 plan 28-03; plan 28-07 opens them in one commit.
// Do not import the pixel id. Do not import React.

/** The owner's three legal texts are live on the banner, the cookies page and the privacy page. */
export const META_LEGAL_GATE_OPEN = false as const;

/**
 * The owner confirmed both Events Manager switches off for the pixel
 * (.planning/decisions/2026-10-01-meta-events-manager-switches.md, addendum 2026-10-03).
 * If he ever reports a switch back on, this goes false again.
 */
export const META_EVENTS_MANAGER_SWITCHES_OFF = false as const;

export function metaMeasurementAllowed(): boolean {
  // Intentional. Literal false has no overlap with true; that is the closed gate.
  // Plan 28-07 removes this directive in the same commit that flips the flags (an unused
  // directive fails typecheck).
  // @ts-expect-error TS2367 — do not widen the consts or delete the comparison.
  return META_LEGAL_GATE_OPEN === true && META_EVENTS_MANAGER_SWITCHES_OFF === true;
}
