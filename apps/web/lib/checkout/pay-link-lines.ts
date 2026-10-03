// apps/web/lib/checkout/pay-link-lines.ts
//
// 26.3-G9: the booking's SAVED fare lines for the pay-link page, read through
// checkout_pay_link_lines (token hash only, vamos_checkout). Amounts are the price
// snapshot's, never today's price book. The page shows them only when they add up to the
// amount Stripe charges.

import { extraLabel, type ExtraNames } from "./extra-label";

export type PayLinkLine = {
  kind: "fare" | "surcharge" | "coupon" | "vat";
  code: string;
  names: ExtraNames;
  vatRateBps: number | null;
  /** As saved: a fare or extra line already has the voucher taken off it; a coupon line saves 0. */
  amountRappen: number;
  /** 261003: the figure before the voucher was taken off (fare and extra lines), when saved. */
  listRappen: number | null;
  /** 261003: the voucher's discount (coupon line), when saved. */
  discountRappen: number | null;
  /** 261003: the two town names of the `fixed_route` line, when both were known at quote time. */
  origin: string | null;
  destination: string | null;
};

type LineRow = {
  kind: unknown;
  code: unknown;
  names: unknown;
  vat_rate_bps: unknown;
  amount_rappen: unknown;
  list_rappen?: unknown;
  discount_rappen?: unknown;
  origin?: unknown;
  destination?: unknown;
};

function wholeOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function placeOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const KINDS = ["fare", "surcharge", "coupon", "vat"] as const;

/** Rows from checkout_pay_link_lines -> lines. Rows of an unknown kind or with a bad amount are dropped. */
export function payLinkLinesFromRows(rows: readonly LineRow[]): PayLinkLine[] {
  const out: PayLinkLine[] = [];
  for (const row of rows) {
    const kind = String(row.kind ?? "");
    const amount = Number(row.amount_rappen);
    if (!(KINDS as readonly string[]).includes(kind) || !Number.isInteger(amount)) continue;
    const bps = row.vat_rate_bps == null ? null : Number(row.vat_rate_bps);
    out.push({
      kind: kind as PayLinkLine["kind"],
      code: String(row.code ?? ""),
      names: row.names && typeof row.names === "object" ? (row.names as ExtraNames) : null,
      vatRateBps: bps != null && Number.isFinite(bps) ? bps : null,
      amountRappen: amount,
      listRappen: wholeOrNull(row.list_rappen),
      discountRappen: wholeOrNull(row.discount_rappen),
      // Both names or neither: a half-known route reads "Route price".
      origin: placeOrNull(row.origin) && placeOrNull(row.destination) ? placeOrNull(row.origin) : null,
      destination: placeOrNull(row.origin) && placeOrNull(row.destination) ? placeOrNull(row.destination) : null,
    });
  }
  return out;
}

/** Lines are only trusted when they sum to the charged amount (fare + extras + voucher + VAT = total). */
export function payLinkLinesForCharge(lines: readonly PayLinkLine[], chargedRappen: number): PayLinkLine[] {
  const sum = lines.reduce((total, line) => total + line.amountRappen, 0);
  return sum === chargedRappen ? [...lines] : [];
}

/**
 * The figure a page shows for a line: fare and extra lines at their pre-voucher figure, the voucher
 * as its (negative) discount, everything else as saved. A line saved before 261003 has neither
 * param, so it shows exactly its saved amount (a legacy voucher saved negative stays negative).
 */
export function payLinkShownRappen(line: PayLinkLine): number {
  if (line.kind === "coupon") {
    return line.discountRappen != null ? -line.discountRappen : line.amountRappen;
  }
  if (line.kind === "fare" || line.kind === "surcharge") return line.listRappen ?? line.amountRappen;
  return line.amountRappen;
}

/** The two fare lines cut out of the fare by checkout (261003). Any other fare code is plain Fare. */
export function isFarePart(line: PayLinkLine): boolean {
  return line.kind === "fare" && (line.code === "airport_fee" || line.code === "fixed_route");
}

/**
 * True when the booking has something to itemise: a ticked extra, or (261003) the airport pickup
 * fee or the route extra as their own lines. Otherwise the page shows the total alone.
 */
export function hasPayLinkExtras(lines: readonly PayLinkLine[]): boolean {
  return lines.some(
    (line) =>
      (line.kind === "surcharge" && line.amountRappen !== 0) ||
      (isFarePart(line) && payLinkShownRappen(line) !== 0),
  );
}

/** Owner's name in the page language: names[locale], names.en, humanised code. Never the raw code. */
export function payLinkExtraName(line: PayLinkLine, locale: string): string {
  return extraLabel(line.names, line.code, locale);
}
