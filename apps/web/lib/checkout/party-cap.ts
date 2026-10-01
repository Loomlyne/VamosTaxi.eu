import type { ClassView } from "@/lib/checkout/checkout-quote";
import { PAX_MAX } from "@/lib/checkout/trip-url";

/** A class that may only be blocked by party size or luggage still counts toward the party limit. */
const COUNTS_FOR_CAP = new Set<string | null>([null, "pax", "bags"]);

/**
 * Most seats among the quoted classes that a party could book apart from its size (Van luxury 12 today);
 * null without a quote. A class blocked by `unavailable`, `no_rate` or `route_off` does not count: no party
 * size would make it bookable. Never above the database limit on a leg (`PAX_MAX`).
 */
export function partyCap(classes: readonly Pick<ClassView, "pax" | "block">[] | null | undefined): number | null {
  if (!classes) return null;
  let most = 0;
  for (const c of classes) {
    if (!COUNTS_FOR_CAP.has(c.block)) continue;
    if (Number.isFinite(c.pax) && c.pax > most) most = c.pax;
  }
  return most >= 1 ? Math.min(Math.floor(most), PAX_MAX) : null;
}
