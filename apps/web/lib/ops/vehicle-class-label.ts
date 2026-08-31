// Client-safe ADR-012 class labels. Do not import identity here — tables
// are "use client" and webpack cannot bundle postgres.js.

export function vehicleClassLabelKey(slug: string): string | null {
  if (slug === "economy") return "common.vehicleClassEconomy";
  if (slug === "business") return "common.vehicleClassBusiness";
  if (slug === "van") return "common.vehicleClassVan";
  return null;
}
