// apps/web/lib/translate/glossary.ts
//
// Phase 32 F-02 (never-translate rules): these spans stay exactly as written, in Latin, in every
// language, Arabic included (D-14a). `mask.ts` swaps them for opaque tokens before the model sees the
// text, so the model cannot damage them, and puts them back afterwards.
//
// Runtime note (plan 32-09): loaded by plain Node with type stripping; relative imports only, erasable
// TypeScript only.

/** Literal words and names that are never translated. Longest first, so "Economy Sedan" wins over parts. */
export const PROTECTED_LITERALS: readonly string[] = [
  "Ride with class",
  "Economy Sedan",
  "Economy Van",
  "Luxury Van",
  "Vamos Taxi",
  "Mastercard",
  "Apple Pay",
  "TWINT",
  "Visa",
  "ZRH",
  "CHF",
];

export type ProtectedPattern = { name: string; re: RegExp };

/**
 * Code-shaped spans that are never translated, in masking order. Each `re` is global; callers must
 * clone it (`new RegExp(re.source, re.flags)`) before use so `lastIndex` never leaks between calls.
 */
export const PROTECTED_PATTERNS: readonly ProtectedPattern[] = [
  // E-mail addresses.
  { name: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  // URLs, without trailing sentence punctuation.
  { name: "url", re: /\b(?:https?:\/\/|www\.)[^\s<>"'«»⟦⟧]*[^\s<>"'«»⟦⟧.,;:!?)]/gi },
  // Booking references, e.g. VT-26-0753.
  { name: "ref", re: /\bVT-\d{2}-\d{4}\b/g },
  // Money: CHF followed by an amount (digits, apostrophes, dots), including the CHF 000 placeholder.
  { name: "money", re: /\bCHF[ \u00a0]?\d(?:[\d'\u2019.]*\d)?/g },
  // Flight numbers, e.g. LX 318 or LX318.
  { name: "flight", re: /\b[A-Z0-9]{2}\s?\d{1,4}\b/g },
];
