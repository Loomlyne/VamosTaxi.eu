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
  "pet",
  "weekend",
  "holiday",
  "waiting",
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

export function normalizeSurchargeCode(raw: string): string {
  if (raw === "ski") return "ski_rack";
  if (raw === "waiting") return "waiting_city";
  return raw;
}

export function isPassengerExtra(code: string): boolean {
  const n = normalizeSurchargeCode(code);
  return (PASSENGER_EXTRA_CODES as readonly string[]).includes(n);
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
