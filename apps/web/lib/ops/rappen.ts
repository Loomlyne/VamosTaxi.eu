// Parse overlay CHF fields into rappen.
// Empty / dash = unfilled (NULL). CHF 0 / 000 / 0.00 is a stated zero (D-15).

export function isPlaceholderAmount(raw: string): boolean {
  const trimmed = raw.trim();
  return trimmed === "" || trimmed === "—" || trimmed === "–";
}

export function rappenFromUnknown(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    if (value === 0) return 0;
    return Number.isInteger(value) ? value : Math.round(value * 100);
  }
  if (typeof value !== "string") return null;
  if (isPlaceholderAmount(value)) return null;
  const n = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function rappenFromMoneySet(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "string") return rappenFromUnknown(value);
  if (typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  if ("CHF" in obj) return rappenFromUnknown(obj.CHF);
  return null;
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
