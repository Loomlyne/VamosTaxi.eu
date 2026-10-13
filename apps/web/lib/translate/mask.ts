// apps/web/lib/translate/mask.ts
//
// Phase 32 RESEARCH C.1: protected spans are swapped for opaque tokens `⟦n⟧` before the model call and
// swapped back after, so the model never sees what it could damage (F-02). Masking order, earlier wins
// on overlap: token-shaped text already in the source, HTML tags and whole `data-tok` spans (ADR-011:
// the pill copy stays English), ICU arguments (heads, `#`, plural/select keys; branch texts stay
// translatable), dictionary `$1..$9`, e-mails and URLs, refs, money, flight numbers, glossary literals.
// Tokens are numbered in order of appearance in the source.
//
// Runtime note (plan 32-09): loaded by plain Node with type stripping; relative imports only, erasable
// TypeScript only, `import type` for types.

import { parse } from "@formatjs/icu-messageformat-parser";
import { PROTECTED_LITERALS, PROTECTED_PATTERNS } from "./glossary";

export type Masked = { masked: string; tokens: string[] };

type Span = { start: number; end: number };

/** Minimal view of the parser's AST that masking needs (location is present with captureLocation). */
type IcuLocation = { start: { offset: number }; end: { offset: number } };
type IcuNode = {
  type: number;
  value?: unknown;
  location?: IcuLocation;
  options?: Record<string, { value: IcuNode[]; location?: IcuLocation }>;
  children?: IcuNode[];
};

// Element type numbers of @formatjs/icu-messageformat-parser (TYPE enum).
const T_LITERAL = 0;
const T_SELECT = 5;
const T_PLURAL = 6;
const T_TAG = 8;

const PARSE_OPTIONS = { captureLocation: true, ignoreTag: true, requiresOtherClause: false } as const;

/** Parses ICU text, or returns null when the text has no brace or is not valid ICU. */
function parseIcu(text: string): IcuNode[] | null {
  if (!text.includes("{")) return null;
  try {
    return parse(text, PARSE_OPTIONS) as unknown as IcuNode[];
  } catch {
    return null;
  }
}

/** Spans of an ICU AST that must not be translated. Branch literal texts are left out. */
function icuSpans(nodes: IcuNode[], out: Span[]): void {
  for (const node of nodes) {
    const loc = node.location;
    if (!loc) continue;
    if (node.type === T_LITERAL) continue;
    if ((node.type === T_PLURAL || node.type === T_SELECT) && node.options) {
      // Head up to the first branch's opening brace, the text between branches, and the closing
      // braces become spans; each branch's content is walked for nested arguments.
      let cursor = loc.start.offset;
      for (const key of Object.keys(node.options)) {
        const opt = node.options[key];
        if (!opt || !opt.location) continue;
        const open = opt.location.start.offset + 1;
        const close = opt.location.end.offset - 1;
        out.push({ start: cursor, end: open });
        icuSpans(opt.value, out);
        cursor = close;
      }
      out.push({ start: cursor, end: loc.end.offset });
      continue;
    }
    if (node.type === T_TAG && node.children) {
      icuSpans(node.children, out);
      continue;
    }
    // argument, number, date, time, pound (#): mask whole.
    out.push({ start: loc.start.offset, end: loc.end.offset });
  }
}

function regexSpans(text: string, re: RegExp, out: Span[]): void {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = g.exec(text)) !== null) {
    if (m[0].length === 0) {
      g.lastIndex += 1;
      continue;
    }
    out.push({ start: m.index, end: m.index + m[0].length });
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces every protected span with `⟦n⟧`. `tokens[n]` is the original span. Numbering follows the
 * order of appearance in the source.
 */
export function mask(text: string): Masked {
  const candidates: Span[][] = [];
  const push = (fill: (out: Span[]) => void) => {
    const out: Span[] = [];
    fill(out);
    candidates.push(out);
  };

  // 0. Token-shaped text already in the source (or a stray bracket), so unmask never confuses it.
  push((o) => regexSpans(text, /⟦[^⟦⟧]*⟧|[⟦⟧]/g, o));
  // 1. Whole data-tok spans, then any HTML tag.
  push((o) => regexSpans(text, /<span\b[^>]*\bdata-tok\b[^>]*>[\s\S]*?<\/span>/gi, o));
  push((o) => regexSpans(text, /<\/?[A-Za-z][^<>]*>/g, o));
  // 2. ICU arguments.
  push((o) => {
    const ast = parseIcu(text);
    if (ast) icuSpans(ast, o);
  });
  // 3. Dictionary $1..$9.
  push((o) => regexSpans(text, /\$[1-9]/g, o));
  // 4. E-mails, URLs, refs, money, flight numbers.
  for (const p of PROTECTED_PATTERNS) push((o) => regexSpans(text, p.re, o));
  // 5. Glossary literals, longest first, on word boundaries.
  for (const lit of PROTECTED_LITERALS) {
    push((o) => regexSpans(text, new RegExp(`(?<![A-Za-z0-9])${escapeRe(lit)}(?![A-Za-z0-9])`, "g"), o));
  }

  const accepted: Span[] = [];
  for (const group of candidates) {
    for (const s of group) {
      if (s.end <= s.start) continue;
      if (accepted.some((a) => s.start < a.end && a.start < s.end)) continue;
      accepted.push(s);
    }
  }
  accepted.sort((a, b) => a.start - b.start);

  const tokens: string[] = [];
  let masked = "";
  let cursor = 0;
  for (const s of accepted) {
    masked += text.slice(cursor, s.start) + `⟦${tokens.length}⟧`;
    tokens.push(text.slice(s.start, s.end));
    cursor = s.end;
  }
  masked += text.slice(cursor);
  return { masked, tokens };
}

/**
 * Puts the original spans back. Returns null when any token is missing, appears twice, is unknown, or
 * a bracket is left that is not part of a well-formed token.
 */
export function unmask(text: string, tokens: readonly string[]): string | null {
  const seen = new Set<number>();
  for (const m of text.matchAll(/⟦(\d+)⟧/g)) {
    const digits = m[1] ?? "";
    const n = Number(digits);
    if (String(n) !== digits || n >= tokens.length || seen.has(n)) return null;
    seen.add(n);
  }
  if (seen.size !== tokens.length) return null;
  if (/[⟦⟧]/.test(text.replace(/⟦\d+⟧/g, ""))) return null;
  return text.replace(/⟦(\d+)⟧/g, (_all, digits: string) => tokens[Number(digits)] ?? "");
}

function signatureParts(nodes: IcuNode[], out: string[]): void {
  for (const node of nodes) {
    if (node.type === T_LITERAL) continue;
    if ((node.type === T_PLURAL || node.type === T_SELECT) && node.options) {
      const keys = Object.keys(node.options).sort();
      out.push(`${node.type === T_PLURAL ? "plural" : "select"}:${String(node.value)}[${keys.join(",")}]`);
      for (const key of keys) {
        const opt = node.options[key];
        if (opt) signatureParts(opt.value, out);
      }
      continue;
    }
    if (node.type === T_TAG) {
      if (node.children) signatureParts(node.children, out);
      continue;
    }
    out.push(node.value === undefined ? `t${node.type}` : `t${node.type}:${String(node.value)}`);
  }
}

/**
 * The ICU shape of a message: argument names, plural/select keys and `#` uses, sorted. Null when the
 * text is not ICU (no brace, does not parse, or holds no argument).
 */
export function icuSignature(text: string): string | null {
  const ast = parseIcu(text);
  if (!ast) return null;
  const parts: string[] = [];
  signatureParts(ast, parts);
  if (parts.length === 0) return null;
  return parts.sort().join("|");
}
