// Swiss VAT 8.1% is added on top of the lock net (fare + extras).
// 100.00 + 20.00 = 120.00 net → VAT 9.72 → payable 129.72.

export const CH_VAT_RATE_BPS = 81;
export const CH_VAT_GROSS_BPS = 1081;

/**
 * The rate as the customer reads it, for "VAT {rate} %": 81 → "8.1". This scale is tenths of a
 * percent (81 = 8.1 %, gross 1081), not basis points. 26.2 audit: /checkout and the pay-link
 * page divided by 100 and showed "VAT 0.81 %" while charging 8.1 %. "" when there is no rate.
 */
export function vatPercentLabel(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps) || bps < 0) return "";
  return String(Number((bps / 10).toFixed(1)));
}

/** Omitted/null/non-finite/negative → 81. 0 is a real rate (no VAT). */
function vatBps(bps?: number | null): number {
  if (bps == null || !Number.isFinite(bps) || bps < 0) return CH_VAT_RATE_BPS;
  return Math.trunc(bps);
}

/** Included slice of a gross amount. Kept for tests that still name the old split. */
export function vatIncludedRappen(grossRappen: number): number {
  if (!Number.isFinite(grossRappen) || grossRappen <= 0) return 0;
  return Math.round((grossRappen * CH_VAT_RATE_BPS) / CH_VAT_GROSS_BPS);
}

/** 8.1% on top of a net amount (fare + extras). Optional bps defaults to CH_VAT_RATE_BPS. */
export function vatOnTopRappen(netRappen: number, bps?: number | null): number {
  if (!Number.isFinite(netRappen) || netRappen <= 0) return 0;
  return Math.round((netRappen * vatBps(bps)) / 1000);
}

export function payableWithVatRappen(netRappen: number, bps?: number | null): number {
  return netRappen + vatOnTopRappen(netRappen, bps);
}
