import { BAGS_MAX, PAX_MAX, PAX_MIN, normaliseFlight, type TripField } from "@/lib/checkout/trip-url";

const AIRPORT_NAME = /airport|flughafen|a[eéè]roport|مطار/i;

/** True when a place name reads as an airport. The name is only a hint; the place lookup settles it. */
export function airportByName(text: string): boolean {
  return AIRPORT_NAME.test(text);
}

export type EditorFieldErrors = Partial<Record<TripField, "required" | "invalid" | "same">>;

/**
 * Pure: the same gaps the home box reports, in the same order (UI-SPEC S2).
 * Flight (D-09): required only for an airport pickup; a filled value is always format-checked.
 */
export function validateEditor(input: {
  from: string;
  fromId: string | null;
  to: string;
  toId: string | null;
  airport: boolean;
  flight: string;
  when: string | null;
  pax: number;
  bags: number;
}): EditorFieldErrors {
  const errors: EditorFieldErrors = {};
  if (!input.from.trim()) errors.from = "required";
  if (input.flight.trim()) {
    if (!normaliseFlight(input.flight)) errors.flight = "invalid";
  } else if (input.airport) {
    errors.flight = "required";
  }
  if (!input.to.trim()) errors.to = "required";
  else if (
    input.from.trim() &&
    ((input.fromId && input.fromId === input.toId) ||
      input.from.trim().toLowerCase() === input.to.trim().toLowerCase())
  ) {
    errors.to = "same";
  }
  if (!input.when) errors.when = "required";
  if (input.pax < PAX_MIN || input.pax > PAX_MAX || input.bags < 0 || input.bags > BAGS_MAX) {
    errors.travellers = "invalid";
  }
  return errors;
}
