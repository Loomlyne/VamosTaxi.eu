"use client";

// Resolves a server `i18n_key` ("quote.error.min_advance") to the active language.
// Message keys such as `error.min_advance` contain a literal dot, so a plain
// next-intl lookup cannot reach them; this walks the tree the same way the home
// booking board does. Empty string when the key is unknown.

import { createTranslator, useLocale, useMessages } from "next-intl";

function walk(node: unknown, segs: string[]): unknown {
  if (!node || typeof node !== "object" || segs.length === 0) return undefined;
  const rec = node as Record<string, unknown>;
  const rest = segs.join(".");
  if (typeof rec[rest] === "string") return rec[rest];
  const head = segs[0];
  if (head === undefined) return undefined;
  return head in rec ? walk(rec[head], segs.slice(1)) : undefined;
}

export function useQuoteLabel() {
  const locale = useLocale();
  const messages = useMessages();
  return (key: string, values?: Record<string, string | number>): string => {
    const raw = walk(messages, key.split("."));
    if (typeof raw !== "string" || raw === "") return "";
    if (!values) return raw;
    return createTranslator({ locale, messages: { _msg: raw } })("_msg", values);
  };
}
