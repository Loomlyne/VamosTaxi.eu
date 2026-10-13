// apps/web/lib/translate/hash.ts
//
// Phase 32 F-06: the translation cache is keyed by source text + language. The key is a SHA-256 over
// the source language and the normalised text, so the same words with different spacing hit the same
// row, and the same words in another source language do not.
//
// Runtime note (plan 32-09): loaded by plain Node with type stripping; Web Crypto is global in Node and
// Workers.

/** NFC, trimmed, every whitespace run collapsed to one space. */
export function normaliseSource(text: string): string {
  return text.normalize("NFC").trim().replace(/\s+/g, " ");
}

/** Lower-case hex SHA-256 of `lang + "\n" + normaliseSource(text)` (64 characters). */
export async function sourceHash(lang: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${lang}\n${normaliseSource(text)}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
