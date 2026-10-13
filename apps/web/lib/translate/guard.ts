// apps/web/lib/translate/guard.ts
//
// Phase 32 RESEARCH C.5: the deterministic check every model answer passes before anyone sees it. Any
// failed check rejects the answer and the caller shows the source text (F-07). The guard is also the
// prompt-injection backstop (T-32-01): an answer that opens with chatter, holds a code fence, refuses,
// or adds a link or address the source did not have is rejected.
//
// Order: the raw answer is screened for preambles; the house rules (post-process) run on the still
// masked answer so a restored span is never rewritten; tokens are restored (each exactly once); then
// the digit, length, script, untranslated, ICU, ß and link checks run.
//
// Runtime note (plan 32-09): loaded by plain Node with type stripping; relative imports only.

import { PROTECTED_PATTERNS } from "./glossary";
import { icuSignature, unmask } from "./mask";
import { postProcess, westernDigits } from "./post-process";

export type GuardRejectReason =
  | "tokens"
  | "digits"
  | "length"
  | "script"
  | "untranslated"
  | "preamble"
  | "icu"
  | "eszett"
  | "link";

export type GuardInput = {
  /** Target language of `output`. */
  lang: string;
  /** The original source text. */
  source: string;
  /** The masked source sent to the model. */
  masked: string;
  /** The spans `mask()` took out of the source. */
  tokens: readonly string[];
  /** The model's answer for `lang`, still masked. */
  output: string;
};

export type GuardResult = { ok: true; text: string } | { ok: false; reason: GuardRejectReason };

const PREAMBLE = /^\s*(?:sure|here is|here's|voici|hier ist|certainly)\b/i;
const REFUSAL = /\bI\s+(?:can['’]?t|cannot|am unable to|won['’]t)\b/i;
const FENCE = /```/;
const TOKEN = /⟦\d+⟧/g;
const ARABIC_LETTER = /[\u0621-\u064a\u066e-\u06d3\u06fa-\u06ff]/;
const LETTER = /\p{L}/u;

const RATIO: Record<string, [number, number]> = {
  de: [0.4, 2.5],
  fr: [0.4, 2.5],
  ar: [0.3, 2.5],
};
const RATIO_DEFAULT: [number, number] = [0.3, 2.5];

function digitsOf(text: string): string {
  return (westernDigits(text.replace(TOKEN, " ")).match(/[0-9]/g) ?? []).sort().join("");
}

function wordCount(text: string): number {
  return text
    .replace(TOKEN, " ")
    .split(/\s+/)
    .filter((w) => LETTER.test(w)).length;
}

function linksOf(text: string): string[] {
  const out: string[] = [];
  for (const p of PROTECTED_PATTERNS) {
    if (p.name !== "url" && p.name !== "email") continue;
    const g = new RegExp(p.re.source, p.re.flags);
    for (const m of text.matchAll(g)) out.push(m[0].toLowerCase());
  }
  return out;
}

/**
 * Checks one masked model answer and returns the restored, house-ruled text, or a reason code. Never
 * throws; never logs.
 */
export function guardOutput(input: GuardInput): GuardResult {
  const { lang, source, masked, tokens, output } = input;

  if (PREAMBLE.test(output) || REFUSAL.test(output) || FENCE.test(output)) return { ok: false, reason: "preamble" };

  const processed = postProcess(lang, output, masked);
  const text = unmask(processed, tokens);
  if (text === null) return { ok: false, reason: "tokens" };

  if (digitsOf(processed) !== digitsOf(masked)) return { ok: false, reason: "digits" };

  const srcLen = source.trim().length;
  if (srcLen > 3) {
    const [lo, hi] = RATIO[lang] ?? RATIO_DEFAULT;
    const ratio = text.length / srcLen;
    if (ratio < lo || ratio > hi) return { ok: false, reason: "length" };
  }

  const sourceHasWords = LETTER.test(masked.replace(TOKEN, ""));
  if (lang === "ar") {
    if (sourceHasWords && !ARABIC_LETTER.test(processed.replace(TOKEN, ""))) return { ok: false, reason: "script" };
  } else if (wordCount(masked) > 2 && processed.trim() === masked.trim()) {
    return { ok: false, reason: "untranslated" };
  }

  const sourceSig = icuSignature(source);
  if (sourceSig !== null && icuSignature(text) !== sourceSig) return { ok: false, reason: "icu" };

  if (lang === "de" && /[ßẞ]/.test(text)) return { ok: false, reason: "eszett" };

  const known = new Set(linksOf(source));
  if (linksOf(text).some((l) => !known.has(l))) return { ok: false, reason: "link" };

  return { ok: true, text };
}
