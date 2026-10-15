// quote_settings_version(timestamptz) returns jsonb of the settings row
// (04-06). Selecting it as a table with no argument throws, which is why
// the checkout rail showed a TBC pill on live. Never invent hours.

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return null;
}

export type CheckoutPolicy = {
  freeCancelHours: number | null;
  /** Payment window: POST /api/checkout/intent gates payment_window_closed on it. */
  checkoutWindowMinutes: number | null;
  /**
   * The "Price stays valid for" minutes Publish stamps on the settings row as quote_lock_minutes
   * (decision item 17). Display only: the server clocks decide.
   */
  priceHoldMinutes: number | null;
};

export function policyHours(doc: unknown): CheckoutPolicy {
  if (doc === null || typeof doc !== "object") {
    return { freeCancelHours: null, checkoutWindowMinutes: null, priceHoldMinutes: null };
  }
  const rec = doc as Record<string, unknown>;
  return {
    freeCancelHours: asInt(rec.free_cancel_hours),
    checkoutWindowMinutes: asInt(rec.checkout_window_minutes),
    priceHoldMinutes: asInt(rec.quote_lock_minutes),
  };
}
