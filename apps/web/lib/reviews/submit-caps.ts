// apps/web/lib/reviews/submit-caps.ts
//
// Security S11 (2026-10-05): POST /api/reviews/submit had no length cap on any field. The caps sit
// far above what the review page sends (the comment matches the contact form's 4000; a manage token
// is 43 characters, a reference 11, a Turnstile token about 2000), so only a hand-made request
// meets them.

export const REVIEW_FIELD_MAX = Object.freeze({
  comment: 4000,
  token: 128,
  bookingRef: 64,
  photoKey: 256,
  turnstileToken: 4096,
  idempotencyKey: 200,
});

/** True when every capped field is absent, not a string, or within its cap. */
export function reviewFieldsWithinCaps(body: Record<string, unknown>): boolean {
  return (Object.keys(REVIEW_FIELD_MAX) as Array<keyof typeof REVIEW_FIELD_MAX>).every((key) => {
    const value = body[key];
    return typeof value !== "string" || value.length <= REVIEW_FIELD_MAX[key];
  });
}
