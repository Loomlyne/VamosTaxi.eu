// Owner decisions 2026-10-09 (D4): the one Google Ads conversion of a booking. A pure decision, so the page's effect is thin and
// the rule is testable: when is the booking confirmed, what did the customer pay, and under which id.
//
// The amount is what was charged in CHF (the receipt), else the booking's total in CHF; display currency never reaches it
// (the currency switch changes the mark, not the number). The id is the real booking reference (owner, D4).
import { BOOKING_REFERENCE_RE } from "./booking-status";
import { voucherBadgeStatus } from "./voucher-badge";

export interface ConversionFacts {
  status: string | undefined;
  paymentStatus: string | null | undefined;
  chargedRappen: number | null | undefined;
  priceTotalRappen: number | null | undefined;
  /** On the return path from Stripe the page first shows the loading screens; the conversion waits for "booked". */
  onReturnPath: boolean;
  returnPhase: string | null;
  reference: string;
  /** When the payment was captured (ISO), if known. */
  paidAt?: string | null;
  /** The clock, injected for tests. */
  nowMs?: number;
}

/** A page opened later (another device, an old link) is not the payment: only a payment this recent counts. */
export const CONVERSION_RECENT_MS = 60 * 60 * 1000;

export interface GoogleConversion {
  value: number;
  transactionId: string;
}

/** The conversion to report now, or null (not confirmed yet, or no real amount to report). */
export function confirmationConversion(f: ConversionFacts): GoogleConversion | null {
  if (!BOOKING_REFERENCE_RE.test(f.reference)) return null;
  const badge = voucherBadgeStatus(f.status, f.paymentStatus ?? null);
  const confirmed = badge === "paid" || badge === "confirmed" || badge === "assigned";
  if (!confirmed) return null;
  if (f.onReturnPath && f.returnPhase !== "booked") return null;
  // The visit that follows the payment: the return path, or a booking paid within the last hour. A confirmed booking
  // opened days later on another device must not report a second conversion (the local-storage key is per device).
  if (!f.onReturnPath) {
    const paid = f.paidAt ? Date.parse(f.paidAt) : NaN;
    const now = f.nowMs ?? Date.now();
    if (!Number.isFinite(paid) || now - paid > CONVERSION_RECENT_MS || paid - now > 5 * 60 * 1000) return null;
  }
  const rappen = [f.chargedRappen, f.priceTotalRappen].find((n): n is number => typeof n === "number" && Number.isInteger(n) && n > 0);
  if (rappen === undefined) return null;
  return { value: rappen / 100, transactionId: f.reference };
}
