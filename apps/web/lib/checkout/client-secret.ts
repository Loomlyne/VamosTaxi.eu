// Stripe Checkout Session secrets may contain "%2F". That is part of the
// secret — never decodeURIComponent it or Checkout init dies.

export function decodeClientSecret(
  secret: string | undefined,
  hex: string | undefined,
): string | null {
  if (hex && /^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return new TextDecoder().decode(bytes);
  }
  const raw = (secret ?? "").trim();
  return raw || null;
}
