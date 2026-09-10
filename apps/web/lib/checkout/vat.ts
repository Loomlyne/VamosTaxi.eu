// Swiss VAT 8.1% is added on top of the lock net (fare + extras).
// 100.00 + 20.00 = 120.00 net → VAT 9.72 → payable 129.72.

export const CH_VAT_RATE_BPS = 81;
export const CH_VAT_GROSS_BPS = 1081;

/** Included slice of a gross amount. Kept for tests that still name the old split. */
export function vatIncludedRappen(grossRappen: number): number {
  if (!Number.isFinite(grossRappen) || grossRappen <= 0) return 0;
  return Math.round((grossRappen * CH_VAT_RATE_BPS) / CH_VAT_GROSS_BPS);
}

/** 8.1% on top of a net amount (fare + extras). */
export function vatOnTopRappen(netRappen: number): number {
  if (!Number.isFinite(netRappen) || netRappen <= 0) return 0;
  return Math.round((netRappen * CH_VAT_RATE_BPS) / 1000);
}

export function payableWithVatRappen(netRappen: number): number {
  return netRappen + vatOnTopRappen(netRappen);
}
