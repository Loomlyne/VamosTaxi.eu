export const FLIGHT_NUMBER_RE = /^(?:[A-Z]{2}\d{1,4}|[A-Z][0-9]\d{3,4})$/;

export function normaliseFlightNumber(raw: string): string {
  return String(raw || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function formatFlightInput(raw: string): string {
  const clean = normaliseFlightNumber(raw);
  return clean.slice(0, 2) + (clean.length > 2 ? " " + clean.slice(2).replace(/\D/g, "").slice(0, 4) : "");
}
