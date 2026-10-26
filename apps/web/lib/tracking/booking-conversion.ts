// One completed booking -> one conversion for Google Ads, GA4 and Meta (owner 2026-10-26).
// The Google Ads action is the existing booking goal (label from the published GTM-KPKGT4VH container); it used to
// fire only on the old vamostaxi.eu URL, so it is now sent by event from the vamostaxi.site confirmation page.

export const GOOGLE_ADS_CONVERSION = "AW-368142830/2ZvxCLnF2M8cEO7Txa8B";

const SENT_PREFIX = "vamosConv:";
/** Holds even when storage is blocked, for every re-render and refresh of this page load. */
const sentThisLoad = new Set<string>();
/** A revisit long after payment (e-mail link, other device) is not a new conversion. */
const FRESH_MS = 24 * 60 * 60 * 1000;

type Gtag = (...args: unknown[]) => void;
type Fbq = (...args: unknown[]) => void;
type TagWindow = Window & { dataLayer?: unknown[]; gtag?: Gtag; fbq?: Fbq };

export type BookingConversionInput = {
  reference: string;
  /** CHF actually charged, in rappen; null when the receipt has no charge (voucher). */
  chargedRappen: number | null;
  /** ISO time the payment settled; null for a voucher booking. */
  paidAt: string | null;
};

/**
 * Sends the booking conversion once per reference in this browser: Google Ads conversion, GA4 purchase, Meta Purchase.
 * The reference is the transaction_id / eventID, so the vendors drop a repeat from another browser too.
 * @returns true when the events went out, false when skipped (already sent, stale, or no window)
 */
export function sendBookingConversion(input: BookingConversionInput, now: number = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  const w = window as TagWindow;
  if (input.paidAt) {
    const paid = Date.parse(input.paidAt);
    if (Number.isFinite(paid) && now - paid > FRESH_MS) return false;
  }
  if (sentThisLoad.has(input.reference)) return false;
  const key = SENT_PREFIX + input.reference;
  try {
    if (w.localStorage.getItem(key)) return false;
  } catch {
    /* storage unavailable: transaction_id still dedupes on Google's side */
  }

  const value = input.chargedRappen != null && input.chargedRappen > 0 ? Math.round(input.chargedRappen) / 100 : 0;
  const gtag: Gtag =
    typeof w.gtag === "function"
      ? w.gtag
      : function gtag() {
          // Same queue the head tag uses; gtag.js reads it when it loads.
          (w.dataLayer = w.dataLayer || []).push(arguments);
        };
  gtag("event", "conversion", {
    send_to: GOOGLE_ADS_CONVERSION,
    value,
    currency: "CHF",
    transaction_id: input.reference,
  });
  gtag("event", "purchase", { transaction_id: input.reference, value, currency: "CHF" });
  if (typeof w.fbq === "function") {
    w.fbq("track", "Purchase", { value, currency: "CHF" }, { eventID: input.reference });
  }

  sentThisLoad.add(input.reference);
  try {
    w.localStorage.setItem(key, new Date(now).toISOString());
  } catch {
    /* see above */
  }
  return true;
}
