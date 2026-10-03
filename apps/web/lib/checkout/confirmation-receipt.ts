import type { PayLinkExtraCode } from "@vamos/emails/confirmation";
import type { ConfirmationFareLine } from "./booking-read";
import { humaniseCode } from "./extras-catalog";
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

/** @deprecated 26.3 D-35 — use receiptRows; removed by plan 26.3-14. */
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

/** @deprecated 26.3 D-35 — use receiptRows; removed by plan 26.3-14. */
export function extrasOnReceipt(extras: PayLinkExtraCode[] | null | undefined): PayLinkExtraCode[] {
  return Array.isArray(extras) ? extras.filter((code) => code in EXTRA_CODES) : [];
}

/** @deprecated 26.3 D-35 — use receiptRows; removed by plan 26.3-14. */
export function extraRappenByCode(lines: ConfirmationFareLine[]): Partial<Record<PayLinkExtraCode, number>> {
  const out: Partial<Record<PayLinkExtraCode, number>> = {};
  for (const line of lines) {
    if (!(line.code in EXTRA_CODES)) continue;
    out[line.code as PayLinkExtraCode] = line.amountRappen;
  }
  return out;
}

/** Class fare + extras, then 8.1% VAT on that basket, then coupon. Does not invent extras. */
/** @deprecated 26.3 D-35 — use receiptRows; removed by plan 26.3-14. */
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

export type ReceiptRow = {
  /** 261003: `airport_fee` and `route` are the two parts cut out of the fare; old bookings have neither. */
  kind: "fare" | "airport_fee" | "route" | "extra" | "coupon" | "vat" | "total";
  /** Text to show. For fare/vat/total this is the English fallback of `labelKey`. */
  label: string;
  /** Message key when the UI has one (fare, VAT, total, legacy three-code extras). */
  labelKey?: string;
  /** Negative for a voucher. */
  amountRappen: number;
  /** `route` rows only: the two town names as quoted at quote time, when both were known. */
  origin?: string;
  destination?: string;
};

function placeName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function listRappen(line: ConfirmationFareLine): number {
  const list = Number(line.params?.list_rappen);
  return Number.isFinite(list) && list > 0 ? Math.round(list) : line.amountRappen;
}

function extraLabel(line: ConfirmationFareLine, locale: string): { label: string; labelKey?: string } {
  const key = line.i18nKey ?? "";
  // Legacy three-code lines keep the message key they were written with.
  if (key && key !== "price.surcharge.custom" && key.startsWith("price.surcharge.")) {
    return { label: humaniseCode(line.code), labelKey: key };
  }
  const params = line.params ?? {};
  const names = params.names && typeof params.names === "object" ? (params.names as Record<string, unknown>) : {};
  const pick = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");
  const label =
    pick(names[locale]) || pick(names.en) || pick(params.name) || humaniseCode(line.code);
  return { label };
}

/**
 * The receipt, built only from the booking's price-snapshot lines: fare, the airport
 * pickup fee and the route extra when the price has them as their own lines (261003;
 * older bookings keep one Fare line), every ticked extra by name, voucher, VAT, total paid. Any extra code renders; the
 * name comes from the line (its per-language names, then the English name, then
 * the humanised code). `presentment` is accepted for symmetry with the mail;
 * the total row is always the CHF figure that was charged.
 */
export function receiptRows(
  lines: ConfirmationFareLine[],
  locale: string,
  chargedRappen: number | null,
  _presentment?: { amountMinor: number; currency: string } | null,
): ReceiptRow[] {
  const rows: ReceiptRow[] = [];
  let fareIndex = -1;
  let vatRow: ReceiptRow | null = null;
  let couponRow: ReceiptRow | null = null;
  for (const line of lines) {
    const kind = line.kind ?? (line.code === "vat" ? "vat" : line.code === "coupon" || line.code === "discount" ? "coupon" : line.code === "distance_fare" ? "fare" : "surcharge");
    if (kind === "fare" && line.code === "airport_fee") {
      rows.push({ kind: "airport_fee", label: "Airport pickup fee", labelKey: "price.line.airport_fee", amountRappen: listRappen(line) });
    } else if (kind === "fare" && line.code === "fixed_route") {
      const origin = placeName(line.params?.origin);
      const destination = placeName(line.params?.destination);
      rows.push({
        kind: "route",
        label: origin && destination ? `${origin} – ${destination} route` : "Route price",
        labelKey: origin && destination ? "checkout.routePair" : "checkout.routePairPlain",
        amountRappen: listRappen(line),
        ...(origin && destination ? { origin, destination } : {}),
      });
    } else if (kind === "fare") {
      if (fareIndex === -1) {
        fareIndex = rows.length;
        rows.push({ kind: "fare", label: "Fare", labelKey: "price.line.transfer", amountRappen: listRappen(line) });
      } else {
        rows[fareIndex]!.amountRappen += listRappen(line);
      }
    } else if (kind === "surcharge") {
      rows.push({ kind: "extra", ...extraLabel(line, locale), amountRappen: listRappen(line) });
    } else if (kind === "coupon") {
      const discount = Number(line.params?.discount_rappen);
      const amount = Number.isFinite(discount) && discount > 0 ? Math.round(discount) : Math.abs(line.amountRappen);
      if (amount > 0 && !couponRow) {
        couponRow = { kind: "coupon", label: line.code, labelKey: "price.line.coupon", amountRappen: -amount };
      }
    } else if (kind === "vat") {
      const bps = Number(line.params?.vatRateBps);
      const pct = Number.isFinite(bps) && bps > 0 ? ` ${Number((bps / 10).toFixed(1))} %` : "";
      vatRow = { kind: "vat", label: `VAT${pct}`, labelKey: "price.line.vat", amountRappen: line.amountRappen };
    }
  }
  if (couponRow) rows.push(couponRow);
  if (vatRow) rows.push(vatRow);
  if (chargedRappen != null) {
    rows.push({ kind: "total", label: "Total paid", labelKey: "price.line.total", amountRappen: chargedRappen });
  }
  return rows;
}
