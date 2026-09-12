// apps/web/lib/health/header.ts
//
// X-Vamos-Health-Key compare. Hash both sides with SHA-256 so they are
// equal length, then crypto.subtle.timingSafeEqual. Never string equality.

export const HEALTH_HEADER = "X-Vamos-Health-Key";

export async function healthKeyAuthorized(
  presented: string | null,
  secret: string | undefined,
): Promise<boolean> {
  if (!secret) return false;
  if (!presented) return false;
  const encoder = new TextEncoder();
  // Workers SubtleCrypto.timingSafeEqual — not on DOM lib used by apps/web tsc.
  const subtle = crypto.subtle as unknown as {
    digest(algorithm: AlgorithmIdentifier, data: BufferSource): Promise<ArrayBuffer>;
    timingSafeEqual(
      a: ArrayBuffer | ArrayBufferView,
      b: ArrayBuffer | ArrayBufferView,
    ): boolean;
  };
  const left = await subtle.digest("SHA-256", encoder.encode(presented));
  const right = await subtle.digest("SHA-256", encoder.encode(secret));
  return subtle.timingSafeEqual(left, right);
}
