import type { PayLinkExtraCode } from "@vamos/emails/confirmation";
import type { ConfirmationFareLine } from "./booking-read";
import { vatIncludedRappen, vatOnTopRappen } from "./vat";

const EXTRA_CODES: Record<PayLinkExtraCode, true> = {
  child_seat: true,
  oversized_luggage: true,
  extra_stop: true,
};

export function rappenToMajor(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return value / 100;
}

function localeTag(locale: string): string {
  if (locale === "ar") return "ar";
  if (locale === "de") return "de-CH";
  if (locale === "fr") return "fr-CH";
  return "en-GB";
}

function parseWall(scheduledLocal: string): { y: number; mo: number; d: number; h: number; min: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(scheduledLocal.trim());
  if (!match) return null;
  return {
    y: Number(match[1]),
    mo: Number(match[2]),
    d: Number(match[3]),
    h: Number(match[4]),
    min: Number(match[5]),
  };
}

export function formatTripDate(scheduledLocal: string, locale: string): string {
  const wall = parseWall(scheduledLocal);
  if (!wall) return scheduledLocal.trim();
  const date = new Date(Date.UTC(wall.y, wall.mo - 1, wall.d));
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: "UTC",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatTripTime(scheduledLocal: string): string {
  const wall = parseWall(scheduledLocal);
  if (!wall) return "";
  return `${String(wall.h).padStart(2, "0")}:${String(wall.min).padStart(2, "0")}`;
}

export function addMinutesLocal(scheduledLocal: string, minutes: number): string {
  const wall = parseWall(scheduledLocal);
  if (!wall || !Number.isFinite(minutes)) return "";
  const total = wall.h * 60 + wall.min + Math.round(minutes);
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const min = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function parseInstant(iso: string): Date | null {
  const trimmed = iso.trim();
  if (!trimmed) return null;
  const normalized = trimmed
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** Wall clock in Europe/Zurich — charge is CHF, pickup is Swiss. */
export function formatPaidAt(iso: string, locale: string): string {
  const date = parseInstant(iso);
  if (!date) return "";
  return new Intl.DateTimeFormat(localeTag(locale), {
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
  return Array.isArray(extras) ? extras.filter((code) => code in EXTRA_CODES) : [];
}

export function extrasFromFareLines(lines: ConfirmationFareLine[]): PayLinkExtraCode[] {
  const out: PayLinkExtraCode[] = [];
  for (const line of lines) {
    if (!(line.code in EXTRA_CODES)) continue;
    const code = line.code as PayLinkExtraCode;
    if (!out.includes(code)) out.push(code);
  }
  return out;
}

export function extraRappenByCode(lines: ConfirmationFareLine[]): Partial<Record<PayLinkExtraCode, number>> {
  const out: Partial<Record<PayLinkExtraCode, number>> = {};
  for (const line of lines) {
    if (!(line.code in EXTRA_CODES)) continue;
    out[line.code as PayLinkExtraCode] = line.amountRappen;
  }
  return out;
}

/** Class fare + extras, then 8.1% VAT on that basket, then coupon. Does not invent extras. */
export function receiptPriceSplit(args: {
  totalRappen: number | null | undefined;
  extraRappen: Partial<Record<PayLinkExtraCode, number>>;
  discountRappen?: number | null;
  /** loadLaunchFlags().vat_rate_bps. Omitted/null → 81. */
  vatRateBps?: number | null;
}): {
  fareRappen: number;
  vatRappen: number;
  extras: { code: PayLinkExtraCode; rappen: number }[];
  couponRappen: number;
  couponPercent: number | null;
} | null {
  const gross = args.totalRappen;
  if (gross == null || !Number.isFinite(gross) || gross <= 0) return null;
  const extras: { code: PayLinkExtraCode; rappen: number }[] = [];
  for (const code of Object.keys(EXTRA_CODES) as PayLinkExtraCode[]) {
    const rappen = args.extraRappen[code];
    if (rappen == null || !Number.isFinite(rappen) || rappen === 0) continue;
    extras.push({ code, rappen });
  }
  const extraSum = extras.reduce((sum, row) => sum + row.rappen, 0);
  const discount =
    args.discountRappen != null && Number.isFinite(args.discountRappen) ? Math.abs(args.discountRappen) : 0;
  const fareRappen = Math.max(0, gross - vatIncludedRappen(gross) - extraSum + discount);
  const vatRappen = vatOnTopRappen(fareRappen + extraSum, args.vatRateBps);
  const couponRappen = Math.max(0, fareRappen + extraSum + vatRappen - gross);
  const couponPercent =
    discount > 0 && fareRappen > 0 ? Math.round((discount / fareRappen) * 100) : null;
  return { fareRappen, vatRappen, extras, couponRappen, couponPercent };
}

export function mergeExtras(
  fromPolicy: PayLinkExtraCode[],
  fromLines: ConfirmationFareLine[],
): PayLinkExtraCode[] {
  const out = extrasOnReceipt(fromPolicy);
  for (const code of extrasFromFareLines(fromLines)) {
    if (!out.includes(code)) out.push(code);
  }
  return out;
}
