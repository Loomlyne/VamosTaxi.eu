// apps/web/lib/checkout/flight-no.ts
//
// D-08b / 26.1-30: the airport fee follows the flight number, so the flight
// number shown at /checkout/details must be the one the signed lock priced.
// The client peeks the (unsigned) lock payload only to decide whether to
// re-price; the server intent re-checks against the verified lock.

import { base64urlDecode } from "../crypto/hmac";

/** Comparison key: case and spacing ignored; blank or missing means no flight. */
export function flightKey(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toUpperCase();
}

/** Leg-1 `flight_no` from the lock payload, or null. Never trusted for money. */
export function peekLockFlightNo(lock: string | undefined): string | null {
  if (!lock) return null;
  const parts = lock.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = new TextDecoder().decode(base64urlDecode(parts[1]));
    const payload: unknown = JSON.parse(json);
    if (!payload || typeof payload !== "object") return null;
    const legs = (payload as { legs?: unknown }).legs;
    if (!Array.isArray(legs) || !legs[0] || typeof legs[0] !== "object") return null;
    const flight = (legs[0] as { flight_no?: unknown }).flight_no;
    return typeof flight === "string" && flight.trim().length > 0 ? flight : null;
  } catch {
    return null;
  }
}

/** True when the details flight number is not the one the lock priced. */
export function lockFlightNoDiffers(lock: string | undefined, flight: string): boolean {
  if (!lock) return false;
  return flightKey(flight) !== flightKey(peekLockFlightNo(lock));
}
