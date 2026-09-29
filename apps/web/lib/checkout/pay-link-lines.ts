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
  amountRappen: number;
};

type LineRow = {
  kind: unknown;
  code: unknown;
  names: unknown;
  vat_rate_bps: unknown;
  amount_rappen: unknown;
};

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
    });
  }
  return out;
}

/** Lines are only trusted when they sum to the charged amount (fare + extras + voucher + VAT = total). */
export function payLinkLinesForCharge(lines: readonly PayLinkLine[], chargedRappen: number): PayLinkLine[] {
  const sum = lines.reduce((total, line) => total + line.amountRappen, 0);
  return sum === chargedRappen ? [...lines] : [];
}

/** True when at least one ticked extra is on the booking. No extras: the page shows no breakdown. */
export function hasPayLinkExtras(lines: readonly PayLinkLine[]): boolean {
  return lines.some((line) => line.kind === "surcharge" && line.amountRappen !== 0);
}

/** Owner's name in the page language: names[locale], names.en, humanised code. Never the raw code. */
export function payLinkExtraName(line: PayLinkLine, locale: string): string {
  return extraLabel(line.names, line.code, locale);
}
