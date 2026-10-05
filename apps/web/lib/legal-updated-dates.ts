// apps/web/lib/legal-updated-dates.ts
//
// "Last updated" of each legal page: the day that page's own text last changed (owner, 2026-10-05).
// The single source is the UPDATED block in app/vamos-legal-updated.js, which the DC mocks read in
// the browser. next.config.ts reads the same block through this parser at build time, so the Next.js
// pages print the same date. A display date only: the consent version (lib/consent/policy.ts) is a
// separate constant and nothing here reads it.

export const LEGAL_UPDATED_PAGES = ["cancellation", "cookies", "imprint", "privacy", "terms"] as const;

export type LegalUpdatedPage = (typeof LEGAL_UPDATED_PAGES)[number];

/** Reads `var UPDATED = { page: 'YYYY-MM-DD', … };` out of the source of app/vamos-legal-updated.js. */
export function parseLegalUpdated(src: string): Record<LegalUpdatedPage, string> {
  const block = /var UPDATED = \{([^}]*)\};/.exec(src)?.[1];
  if (block === undefined) throw new Error("app/vamos-legal-updated.js: no `var UPDATED = { … };` block");
  const found = [...block.matchAll(/(?:^|\n)\s*(\w+): '([^']*)'/g)];
  const dates: Record<string, string> = {};
  for (const match of found) {
    const page = match[1]!;
    const iso = match[2]!;
    if (!(LEGAL_UPDATED_PAGES as readonly string[]).includes(page)) {
      throw new Error(`app/vamos-legal-updated.js: UPDATED.${page} is not a legal page`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(`${iso}T00:00:00Z`))) {
      throw new Error(`app/vamos-legal-updated.js: UPDATED.${page} is not a YYYY-MM-DD date`);
    }
    if (page in dates) throw new Error(`app/vamos-legal-updated.js: UPDATED.${page} is set twice`);
    dates[page] = iso;
  }
  for (const page of LEGAL_UPDATED_PAGES) {
    if (!(page in dates)) throw new Error(`app/vamos-legal-updated.js: UPDATED.${page} is missing`);
  }
  return dates as Record<LegalUpdatedPage, string>;
}
