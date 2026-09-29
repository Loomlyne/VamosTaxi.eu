import type { VamosTrip } from "./vamos-trip";

type Translate = (key: string) => string;

/**
 * D-14 line-up: Economy, Business, Van luxury. Live slugs first, then the legacy
 * slugs older trips may still carry. First is dropped, so it has no label here.
 */
const CLASS_LABEL_KEY: Record<string, string> = {
  saden: "classEconomy",
  economy: "classEconomy",
  "mercedes-benz-v-class": "classBusiness",
  business: "classBusiness",
  "van-luxury": "classVanLuxury",
  van: "classVanLuxury",
};

/** Translated class name for a slug; an unknown slug is returned as-is. */
export function vehicleLabel(id: string, t: Translate): string {
  const key = Object.prototype.hasOwnProperty.call(CLASS_LABEL_KEY, id) ? CLASS_LABEL_KEY[id] : undefined;
  return key ? t(key) : id;
}

/**
 * Name of the picked class as the dashboard spells it (from the trip's class
 * offers), falling back to the stored vehicle name, then to vehicleLabel.
 * Keeps raw slugs off the customer's screen (T-26.1-89).
 */
export function pickedClassName(
  slug: string,
  trip: Pick<VamosTrip, "vehicle" | "vehicleName" | "classOffers"> | null,
  t: Translate,
): string {
  const named = trip?.classOffers?.find((row) => row.slug === slug)?.name;
  if (named) return named;
  if (trip?.vehicle === slug && trip.vehicleName) return trip.vehicleName;
  return vehicleLabel(slug, t);
}
