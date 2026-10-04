import type { AbstractIntlMessages } from "next-intl";

/**
 * Namespaces a visitor's browser never needs. `ops` is the dashboard's copy (650 strings:
 * refunds, webhooks, review scaffolds …) and `$meta` is build metadata for the i18n checker.
 * Server components still read everything through getTranslations(); only the client provider
 * gets the reduced set (reviewer F7, 2026-10-04: no internal strings in /checkout HTML).
 */
const SERVER_ONLY: readonly string[] = ["ops", "$meta"];

/** Single keys in shipped namespaces that are internal review copy and no client component reads. */
const SERVER_ONLY_KEYS: Record<string, readonly string[]> = {
  common: ["review-scaffold", "review-scaffold-not-part-of-the-published-page"],
};

/** ops.* keys a public client component does read (terms page table of contents). */
const PUBLIC_OPS_KEYS = ["waiting-time"] as const;

/** The messages the client provider ships with every public page. */
export function clientMessages(all: AbstractIntlMessages): AbstractIntlMessages {
  const out: AbstractIntlMessages = {};
  for (const [ns, value] of Object.entries(all)) {
    if (SERVER_ONLY.includes(ns)) continue;
    const drop = SERVER_ONLY_KEYS[ns];
    if (drop && value && typeof value === "object") {
      const kept: AbstractIntlMessages = {};
      for (const [k, v] of Object.entries(value)) if (!drop.includes(k)) kept[k] = v;
      out[ns] = kept;
    } else out[ns] = value;
  }
  const ops = all.ops;
  if (ops && typeof ops === "object") {
    const picked: AbstractIntlMessages = {};
    for (const k of PUBLIC_OPS_KEYS) {
      const v = (ops as AbstractIntlMessages)[k];
      if (v !== undefined) picked[k] = v;
    }
    out.ops = picked;
  }
  return out;
}
