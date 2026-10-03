// apps/web/lib/checkout/pay-idempotency.ts
//
// The browser's idempotency key for POST /api/checkout/intent. One key per
// selection: a repeated press with nothing changed replays the same booking.
//
// 26.2 audit U11-2: the key must not outlive a failed press. The server opens
// the Stripe session under that key, and a failure after that point expires the
// session. Pressing PAY again with the same key made Stripe replay the dead
// session (or refuse the changed `expires_at` as an idempotency error), so every
// later press failed until the page was reloaded. A failed answer drops the key;
// the next press opens a fresh session.

export type PayIdem = { sel: string; id: string };

/** The key for this selection: the held one when the selection is unchanged, else a new one. */
export function payIdemFor(current: PayIdem | null, sel: string, newId: () => string): PayIdem {
  return current && current.sel === sel ? current : { sel, id: newId() };
}

/**
 * What to hold after an answer. `keep` is true for a success and for an answer given before any
 * Stripe session was opened (the account step); every other failed answer or thrown fetch drops it.
 */
export function payIdemAfter(current: PayIdem | null, keep: boolean): PayIdem | null {
  return keep ? current : null;
}
