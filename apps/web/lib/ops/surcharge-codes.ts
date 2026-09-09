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
] as const;

export type SurchargeCode = (typeof SURCHARGE_CODES)[number];
