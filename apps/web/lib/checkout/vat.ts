// Swiss VAT 8.1% is already inside the class floor (80 / 100 / 130 / 150).
// Display the included slice. Never add it on top of the lock total.

export const CH_VAT_RATE_BPS = 81;
export const CH_VAT_GROSS_BPS = 1081;

export function vatIncludedRappen(grossRappen: number): number {
  if (!Number.isFinite(grossRappen) || grossRappen <= 0) return 0;
  return Math.round((grossRappen * CH_VAT_RATE_BPS) / CH_VAT_GROSS_BPS);
}
