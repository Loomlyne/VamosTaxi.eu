/**
 * Quick 260928-lat: what the checkout client does with an answer from
 * /api/checkout/intent.
 *
 * `startPayment` sends the lock on screen when it starts. A coupon, extras or
 * flight reprice can re-sign the lock while that request is in flight. The
 * answer then belongs to an amount the rail no longer shows, so it must not
 * mount a card form (success) or drive a coupon recovery (refusal).
 *
 * - `mount`: the lock on screen at answer time is the lock the request sent.
 * - `discard`: the lock changed, or either lock is missing. The caller starts
 *   a fresh request for the lock on screen.
 *
 * Surrounding whitespace is ignored; the signed lock itself is compared exactly.
 */
export type IntentAnswerAction = "mount" | "discard";

export function intentAnswerAction({
  sentLock,
  currentLock,
}: {
  sentLock: string | null | undefined;
  currentLock: string | null | undefined;
}): IntentAnswerAction {
  const sent = typeof sentLock === "string" ? sentLock.trim() : "";
  const current = typeof currentLock === "string" ? currentLock.trim() : "";
  if (!sent || !current) return "discard";
  return sent === current ? "mount" : "discard";
}
