// apps/web/lib/google/steps.ts
//
// GA4 (adopted wording .planning/decisions/2026-10-11-ga4-wording.md): the booking steps Meta gets also go to
// Google Analytics, from the browser, through the loader (app/vamos-google.js, VamosGoogle.track). Only the step
// name travels: no amount, no route, no class, nothing typed. The loader decides everything else (flags, address
// list, server-confirmed Analytics consent, once per press); before it has loaded, a step is simply not counted.

export type GoogleStep = "InitiateCheckout" | "AddPaymentInfo";

type Win = { VamosGoogle?: { track?: (name: string) => boolean } };

/** Tells the loader a booking step happened. Never throws, never blocks the visitor. */
export function googleStep(step: GoogleStep, win: unknown = typeof window === "undefined" ? undefined : window): void {
  try {
    const g = (win as Win | undefined)?.VamosGoogle;
    if (g && typeof g.track === "function") g.track(step);
  } catch {
    // a step that is not counted is never an error for the visitor
  }
}
