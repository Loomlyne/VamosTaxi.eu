// Pure charge-gate predicates. No Stripe SDK, no env, no fare.

/** Null, non-finite, or negative displayed rappen is not selectable. Does not return a fare. */
export function classIsSelectable(displayedRappen: number | null): boolean {
  return displayedRappen !== null && Number.isFinite(displayedRappen) && displayedRappen >= 0;
}

/**
 * Booking is closed for an unpriced quote only when no class has a fare.
 * A null total on an idle slug (CHF 000) is not "not open" when another
 * class on the same trip is priced. Does not invent a fare. Empty means
 * unpriced — the closed alert stays.
 */
export function quoteUnpriced(classRappen: readonly (number | null)[]): boolean {
  return !classRappen.some((row) => classIsSelectable(row));
}

/** True only for the bound UAE test publishable prefix. Callers must not mint when this is true. */
export function stripeAccountIsLegacyUaeTest(publishableKey: string): boolean {
  return publishableKey.startsWith("pk_test_51U65pW");
}

/** 24-hour pay-link hold (D-20/D-20a). The database also caps it at first send + 24 h. */
export const PAY_LINK_HOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Pay-link token expiry: exactly 24 hours after the Postgres now at send time
 * (D-20a — the hold starts when the link is sent, not when the quote was locked).
 * Takes the database clock, never the Worker clock, so the token, the charge gate
 * and the unpaid cron share one clock (`bookings.hold_until`).
 */
export function payLinkTokenExpiresAt(postgresNowIso: string): Date {
  return new Date(Date.parse(postgresNowIso) + PAY_LINK_HOLD_MS);
}

/** Missing class id is the existing pricing-not-live refusal, never a bad request. */
export function refusalForMissingClassId(): "pricing_not_live" {
  return "pricing_not_live";
}
