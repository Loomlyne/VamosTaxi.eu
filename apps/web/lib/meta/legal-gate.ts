// apps/web/lib/meta/legal-gate.ts
//
// Fail-closed. Not env, not a pill scan, not Accept.
// Phase 26 leaves this false. Do not import the pixel id. Do not import React.

export const META_LEGAL_GATE_OPEN = false as const;

export function metaMeasurementAllowed(): boolean {
  // Intentional. Literal false has no overlap with true; that is the closed gate.
  // @ts-expect-error TS2367 — do not widen the const or delete the comparison.
  return META_LEGAL_GATE_OPEN === true;
}
