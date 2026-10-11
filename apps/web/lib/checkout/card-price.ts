// apps/web/lib/checkout/card-price.ts
//
// What a class card shows on the quote step and on /checkout: the lock's class net with Swiss VAT
// included. It runs the same payableRappen the checkout charge runs (class net, no extras, no
// voucher), so the card, the checkout total and the Stripe amount are one number. Display only:
// no stored amount and no charge reads this file. Cards show the price before extras/voucher.

import { payableRappen } from "./payable";

/** The class net with VAT on top, in CHF rappen. null in, null out (pricing not live). */
export function classCardRappen(netRappen: number | null | undefined, vatRateBps?: number | null): number | null {
  if (netRappen == null || !Number.isFinite(netRappen)) return null;
  return payableRappen({
    classNetRappen: netRappen,
    extraAddRappen: 0,
    vatRateBps: vatRateBps ?? Number.NaN,
  }).chargedRappen;
}

/** The VAT slice inside that card price, for the "VAT 8.1 % included" row. */
export function classCardVatRappen(netRappen: number | null | undefined, vatRateBps?: number | null): number | null {
  if (netRappen == null || !Number.isFinite(netRappen)) return null;
  return payableRappen({
    classNetRappen: netRappen,
    extraAddRappen: 0,
    vatRateBps: vatRateBps ?? Number.NaN,
  }).vatRappen;
}
