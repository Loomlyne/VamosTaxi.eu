// Details and payment are different pages. The details page's React state
// dies on navigation, so the card box mounts with no client secret and
// Stripe never draws Card, Apple Pay, or TWINT. Keep the secret for this
// quote in the tab. A new quote must not reuse it.

const KEY = "vamosCheckoutSession";

export type StoredCheckoutSession = {
  quoteId: string;
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

export function readCheckoutSession(quoteId: string): StoredCheckoutSession | null {
  const id = quoteId.trim();
  if (!id) return null;
  const box = storage();
  if (!box) return null;
  try {
    const parsed: unknown = JSON.parse(box.getItem(KEY) ?? "");
    if (!parsed || typeof parsed !== "object") return null;
    const row = parsed as Partial<StoredCheckoutSession>;
    if (row.quoteId !== id || typeof row.clientSecret !== "string" || !row.clientSecret) return null;
    return {
      quoteId: id,
      clientSecret: row.clientSecret,
      clientSecretHex: typeof row.clientSecretHex === "string" ? row.clientSecretHex : undefined,
      publishableKey: typeof row.publishableKey === "string" ? row.publishableKey : undefined,
      reference: typeof row.reference === "string" ? row.reference : undefined,
    };
  } catch {
    return null;
  }
}

export function writeCheckoutSession(session: StoredCheckoutSession): void {
  const box = storage();
  if (!box || !session.quoteId || !session.clientSecret) return;
  try {
    box.setItem(KEY, JSON.stringify(session));
  } catch {
    // private mode — the in-memory secret still paints this view
  }
}
