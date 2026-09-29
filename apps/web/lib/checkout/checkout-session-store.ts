// Details and payment are different pages. The details page's React state
// dies on navigation, so the card box mounts with no client secret and
// Stripe never draws Card, Apple Pay, or TWINT. Keep the secret for this
// quote in the tab. A new quote must not reuse it.
//
// Quick 260928-rld: a coupon or flight reprice keeps the quote id but re-signs
// the lock, so the quote id alone cannot tell whether a stored session was
// opened for the price on screen. The lock it was opened for is stored next to
// the secret (the lock is already client-visible, so this adds no exposure) and
// a session is only restored for that exact lock. A mismatch, or an entry
// written before this change without a lock, is stale and deleted.

const KEY = "vamosCheckoutSession";

export type StoredCheckoutSession = {
  quoteId: string;
  /** The signed lock the payment session was created for (its fingerprint). */
  lock: string;
  clientSecret: string;
  clientSecretHex?: string;
  publishableKey?: string;
  reference?: string;
};

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function drop(box: Storage): void {
  try {
    box.removeItem(KEY);
  } catch {
    // private mode — nothing was stored
  }
}

/**
 * The stored session for `quoteId`, only when it was created for `lock` (the
 * lock currently on screen). A stored session for this quote with another lock
 * or no lock is deleted and null is returned.
 */
export function readCheckoutSession(quoteId: string, lock: string): StoredCheckoutSession | null {
  const id = quoteId.trim();
  if (!id) return null;
  const box = storage();
  if (!box) return null;
  try {
    const parsed: unknown = JSON.parse(box.getItem(KEY) ?? "");
    if (!parsed || typeof parsed !== "object") return null;
    const row = parsed as Partial<StoredCheckoutSession>;
    if (row.quoteId !== id) return null;
    const current = lock.trim();
    if (typeof row.lock !== "string" || !row.lock || !current || row.lock !== current) {
      drop(box);
      return null;
    }
    if (typeof row.clientSecret !== "string" || !row.clientSecret) return null;
    return {
      quoteId: id,
      lock: row.lock,
      clientSecret: row.clientSecret,
      clientSecretHex: typeof row.clientSecretHex === "string" ? row.clientSecretHex : undefined,
      publishableKey: typeof row.publishableKey === "string" ? row.publishableKey : undefined,
      reference: typeof row.reference === "string" ? row.reference : undefined,
    };
  } catch {
    return null;
  }
}

/** Store the session with the lock it was created for. Skipped without a lock. */
export function writeCheckoutSession(session: StoredCheckoutSession): void {
  const box = storage();
  if (!box || !session.quoteId || !session.lock || !session.clientSecret) return;
  try {
    box.setItem(KEY, JSON.stringify(session));
  } catch {
    // private mode — the in-memory secret still paints this view
  }
}

/**
 * Remove the stored session for `quoteId`. Called wherever the lock is
 * re-signed or the price on screen no longer matches the stored session.
 */
export function clearCheckoutSession(quoteId: string): void {
  const id = quoteId.trim();
  const box = storage();
  if (!box || !id) return;
  try {
    const parsed: unknown = JSON.parse(box.getItem(KEY) ?? "");
    if (parsed && typeof parsed === "object" && (parsed as { quoteId?: unknown }).quoteId !== id) return;
  } catch {
    // unreadable entry — drop it
  }
  drop(box);
}
