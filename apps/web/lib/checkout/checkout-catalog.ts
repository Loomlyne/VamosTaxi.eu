import { asCheckout } from "../db/identity";
import { loadRateBook } from "../db/quote";
import { mapRateBook } from "../pricing/rateBook";
import type { ExtraCatalogRow } from "./checkout-charge";
import { selectableExtras, type ExtraLabelsByCode } from "./extras-catalog";

export type CheckoutCatalogDeps = {
  loadBook: (env: CloudflareEnv) => Promise<unknown>;
  loadLabels: (env: CloudflareEnv) => Promise<ExtraLabelsByCode>;
};

type LabelRow = {
  code: string;
  label_en: string | null;
  label_de: string | null;
  label_fr: string | null;
  label_ar: string | null;
};

/** The four names of every extra, by code. Exported for the local Worker-client test (rest-grants.local.test.ts). */
export async function defaultLoadLabels(env: CloudflareEnv): Promise<ExtraLabelsByCode> {
  // 261005 S6: extra_labels_read is executable by vamos_checkout (and staff), not by anon or Supabase REST.
  const rows = await asCheckout(env, null, async (tx) => tx<LabelRow[]>`select * from public.extra_labels_read()`);
  const out: ExtraLabelsByCode = {};
  for (const row of rows) {
    out[row.code] = { en: row.label_en, de: row.label_de, fr: row.label_fr, ar: row.label_ar };
  }
  return out;
}

/**
 * D-14, D-35, D-44: the one list of tick-box extras for display (extras route),
 * price and charge — every selectable passenger extra of the live book with its
 * four names. Throws when the book cannot be read; callers fail closed.
 * A failed label read is not fatal: names fall back to the humanised code.
 */
export async function loadCheckoutCatalog(
  env: CloudflareEnv,
  deps?: Partial<CheckoutCatalogDeps>,
): Promise<ExtraCatalogRow[]> {
  const loadBook = deps?.loadBook ?? ((e: CloudflareEnv) => loadRateBook(e, { preferDraft: false }));
  const loadLabels = deps?.loadLabels ?? defaultLoadLabels;
  const [raw, labels] = await Promise.all([
    loadBook(env),
    loadLabels(env).catch((): ExtraLabelsByCode => ({})),
  ]);
  const book = mapRateBook(raw);
  return selectableExtras(book.surcharges, labels);
}
