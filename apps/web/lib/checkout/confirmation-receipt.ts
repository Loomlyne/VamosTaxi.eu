import type { PayLinkExtraCode } from "@vamos/emails/confirmation";
import type { ConfirmationFareLine } from "./booking-read";

export function rappenToMajor(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value / 100;
}

/** Wall clock in Europe/Zurich — charge is CHF, pickup is Swiss. */
export function formatPaidAt(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const loc = locale === "ar" ? "ar" : locale === "de" ? "de-CH" : locale === "fr" ? "fr-CH" : "en-GB";
  return new Intl.DateTimeFormat(loc, {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function couponOnReceipt(args: {
  couponCode: string | null | undefined;
  discountRappen: number | null | undefined;
  fareLines: ConfirmationFareLine[];
}): { code: string; rappen: number } | null {
  const code = (args.couponCode ?? "").trim();
  if (!code) return null;
  const fromLine = args.fareLines.find((line) => line.code === "coupon" || line.code === "discount");
  const rappen = fromLine
    ? Math.abs(fromLine.amountRappen)
    : args.discountRappen != null && Number.isFinite(args.discountRappen)
      ? Math.abs(args.discountRappen)
      : 0;
  if (rappen <= 0) return null;
  return { code, rappen };
}

export function extrasOnReceipt(extras: PayLinkExtraCode[] | null | undefined): PayLinkExtraCode[] {
  return Array.isArray(extras) ? extras : [];
}
