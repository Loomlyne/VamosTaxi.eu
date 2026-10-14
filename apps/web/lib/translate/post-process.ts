// apps/web/lib/translate/post-process.ts
//
// Phase 32 F-03: house rules applied in code after every model answer, not only asked for in the
// prompt. German: "ss", never "ß" (Swiss German). Arabic: Western digits 0-9. All languages: trimmed,
// no doubled spaces, no wrapping quotes the source did not have.
//
// Runtime note (plan 32-09): loaded by plain Node with type stripping; erasable TypeScript only.

/** Opening and closing quote pairs a model may wrap a whole answer in. */
const QUOTE_PAIRS: readonly [string, string][] = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["„", "“"],
  ["‚", "‘"],
  ["‘", "’"],
  ["«", "»"],
  ["»", "«"],
  ["‹", "›"],
];

const OPENING_QUOTES = /^["'“”„‚‘’«»‹›]/;

function stripWrappingQuotes(text: string, source: string | undefined): string {
  if (source !== undefined && OPENING_QUOTES.test(source.trim())) return text;
  for (const [open, close] of QUOTE_PAIRS) {
    if (text.length > open.length + close.length && text.startsWith(open) && text.endsWith(close)) {
      const inner = text.slice(open.length, text.length - close.length);
      // Only a pair that wraps the whole text: the inner part must not close and reopen.
      if (!inner.includes(open) && !inner.includes(close)) return inner.trim();
    }
  }
  return text;
}

/** Arabic-Indic (U+0660-0669) and Persian (U+06F0-06F9) digits to 0-9. */
export function westernDigits(text: string): string {
  return text
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Applies the house rules for `lang` to a model answer. `source` (the text that was translated) decides
 * whether wrapping quotes are kept; without it, wrapping quotes are removed.
 */
export function postProcess(lang: string, text: string, source?: string): string {
  let out = text.replace(/[ \t\u00a0]{2,}/g, " ").trim();
  out = stripWrappingQuotes(out, source);
  if (lang === "de") out = out.replace(/ß/g, "ss").replace(/ẞ/g, "SS");
  if (lang === "ar") out = westernDigits(out);
  return out;
}
