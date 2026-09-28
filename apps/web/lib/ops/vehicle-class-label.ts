// Client-safe ADR-012 class labels. Do not import identity here — tables
// are "use client" and webpack cannot bundle postgres.js.
//
// 26.1-19 (D-14, D-14a): live slugs saden / mercedes-benz-v-class / van-luxury
// (and the legacy economy / business / van) resolve through class-slug.ts to
// Economy / Business / Van luxury. The keys hold Latin product names in every
// language. First and unknown slugs have no key.

import { classDisplayName } from "./class-slug";

export function vehicleClassLabelKey(slug: string): string | null {
  const name = classDisplayName(slug);
  if (name === "Economy") return "checkout.classEconomy";
  if (name === "Business") return "checkout.classBusiness";
  if (name === "Van luxury") return "checkout.classVanLuxury";
  return null;
}
