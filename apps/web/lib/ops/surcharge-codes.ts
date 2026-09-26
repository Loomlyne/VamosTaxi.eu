// Client-safe surcharge code list. rate-book.ts also imports identity;
// tables must not.

export const SURCHARGE_CODES = [
  "airport_pickup",
  "night",
  "waiting_airport",
  "waiting_city",
  "extra_stop",
  "child_seat",
  "oversized_luggage",
  "meet_greet",
  "ski_rack",
  "ski",
  "pet",
  "weekend",
  "holiday",
  "waiting",
  "free_wait",
  "extra_wait",
] as const;

export type SurchargeCode = (typeof SURCHARGE_CODES)[number];

export const PASSENGER_EXTRA_CODES = [
  "child_seat",
  "meet_greet",
  "extra_stop",
  "oversized_luggage",
  "ski_rack",
  "ski",
  "pet",
] as const;

/** Automatic predicate kinds — never checkout chips (D-36). */
export const AUTOMATIC_SURCHARGE_CODES = [
  "airport_pickup",
  "night",
  "waiting_airport",
  "waiting_city",
  "waiting",
  "weekend",
  "holiday",
  "extra_wait",
] as const;

export function normalizeSurchargeCode(raw: string): string {
  if (raw === "ski") return "ski_rack";
  if (raw === "waiting") return "waiting_city";
  return raw;
}

export function isAutomaticSurcharge(code: string): boolean {
  const n = normalizeSurchargeCode(code);
  return (AUTOMATIC_SURCHARGE_CODES as readonly string[]).includes(n);
}

/** Extra-chip membership is the live book, not a closed union (D-35). */
export function isPassengerExtra(code: string): boolean {
  const n = normalizeSurchargeCode(code);
  if (!n || n === "return_trip") return false;
  return !isAutomaticSurcharge(n);
}

/**
 * Checkout extra amount rule. Stated CHF 0 is included and not charged.
 * Any positive price, including 1 CHF, is an extra. Empty is unfilled — do not invent 0.
 * `rappen` is already converted (1 CHF = 100).
 */
export function checkoutExtraKindFromRappen(
  rappen: number | null,
): "included" | "amount" | null {
  if (rappen == null) return null;
  if (rappen === 0) return "included";
  if (rappen > 0) return "amount";
  return null;
}

export function extraWriteFields(code: string): {
  predicate: { kind: "quantity" | "always" };
  quantitySource: "child_seats" | "extra_stops" | "oversize_bags" | null;
} {
  const n = normalizeSurchargeCode(code);
  if (n === "child_seat") {
    return { predicate: { kind: "quantity" }, quantitySource: "child_seats" };
  }
  if (n === "extra_stop") {
    return { predicate: { kind: "quantity" }, quantitySource: "extra_stops" };
  }
  if (n === "oversized_luggage") {
    return { predicate: { kind: "quantity" }, quantitySource: "oversize_bags" };
  }
  return { predicate: { kind: "always" }, quantitySource: null };
}
