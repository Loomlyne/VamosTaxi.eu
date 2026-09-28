// apps/web/lib/ops/class-slug.ts
//
// D-14 class line-up for ops writes: Economy (saden), Business
// (mercedes-benz-v-class), Van luxury (van-luxury). Ops sends either the display
// name or a slug; both resolve to the live slug. Legacy names (economy, business,
// van) move onto the live class. First is dropped and resolves to nothing, so an
// edit that names it keeps the stored class.

const LIVE_SLUG_BY_KEY: Record<string, string> = {
  saden: "saden",
  economy: "saden",
  "mercedes-benz-v-class": "mercedes-benz-v-class",
  business: "mercedes-benz-v-class",
  "van-luxury": "van-luxury",
  van: "van-luxury",
};

const DISPLAY_NAME_BY_SLUG: Record<string, string> = {
  saden: "Economy",
  economy: "Economy",
  "mercedes-benz-v-class": "Business",
  business: "Business",
  "van-luxury": "Van luxury",
  van: "Van luxury",
};

function own(table: Record<string, string>, key: string): string | null {
  return Object.prototype.hasOwnProperty.call(table, key) ? (table[key] ?? null) : null;
}

/** Live vehicle_classes slug for a display name or slug, or null when unknown. */
export function liveClassSlug(label: string): string | null {
  const key = label.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return own(LIVE_SLUG_BY_KEY, key);
}

/** Display name for a live or legacy slug, or null when the slug is not one of the three. */
export function classDisplayName(slug: string): string | null {
  return own(DISPLAY_NAME_BY_SLUG, slug.trim().toLowerCase());
}
