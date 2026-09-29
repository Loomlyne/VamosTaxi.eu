// apps/web/lib/checkout/extra-label.ts
//
// D-14 / D-35 / G6: an extra is labelled with the owner's name in the customer's
// language. Order: names[locale], names.en, then the humanised code ("child-seat" ->
// "Child seat"). Never the raw code, never a hard-coded map.

export type ExtraNames = Partial<Record<"en" | "de" | "fr" | "ar", string>> | null | undefined;

/** `child-seat` / `pet_crate` -> `Child seat` / `Pet crate`. */
export function humaniseCode(code: string): string {
  const words = code.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : code;
}

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export function extraLabel(names: ExtraNames, code: string, locale: string): string {
  const table = (names ?? {}) as Record<string, unknown>;
  return clean(table[locale]) ?? clean(table.en) ?? humaniseCode(code);
}
