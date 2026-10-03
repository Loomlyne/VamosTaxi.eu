// 26.1-11 / UI-SPEC §8: "every component of the charge is a labelled line the
// customer can point to". The airport pickup fee (D-08b) and the matched city or
// canton pair (D-09/D-09a) become their own PriceSummary rows. Pure — no React.
//
// Display only. The charge still comes from the signed lock's class_totals and
// the kernel re-run at intent time; these rows never feed a payable amount.
// 261003: `farePartsFromLines` hands the same two figures to checkoutCharge so the
// Fare line is cut into labelled pieces; they only ever split, never add.
// Amounts go through the caller's `toAmount` (FX display conversion); a null
// amount stays null so PriceSummary renders `formatAmount(null)` — the Law 04
// `CHF 000` mark — and nothing here ever invents a figure.
import type { QuoteLockPayload } from "../quote/lock";
import type { FareParts } from "./checkout-charge";

/** The two kernel line codes this builder turns into rows. */
export type BreakdownCode = "airport_fee" | "fixed_route";

/** A kernel line, or the lock's pinned copy of one — only these fields are read. */
export interface BreakdownLine {
  code: string;
  amount_rappen: number | null;
  params?: Record<string, string | number | null>;
}

export type BreakdownLabelKey = "airport_fee" | "routePair" | "routePairPlain";

/** Label resolver — the caller maps keys onto its i18n namespaces. */
export type BreakdownT = (
  key: BreakdownLabelKey,
  values?: { origin: string; destination: string },
) => string;

/** PriceSummary-compatible row (`label`, `amount`, `icon`) plus its source figure. */
export interface BreakdownRow {
  code: BreakdownCode;
  label: string;
  icon: "plane-landing" | "map-pin";
  /** Display amount from `toAmount`; null renders the CHF 000 mark. */
  amount: number | null;
  /** CHF rappen from the kernel line, so the caller can keep the fare row honest. */
  amount_rappen: number | null;
}

function placeNames(
  params: BreakdownLine["params"],
): { origin: string; destination: string } | null {
  const origin = params?.origin;
  const destination = params?.destination;
  if (typeof origin !== "string" || typeof destination !== "string") return null;
  if (!origin.trim() || !destination.trim()) return null;
  return { origin: origin.trim(), destination: destination.trim() };
}

/**
 * One row per `airport_fee` line (icon `plane-landing`) and per `fixed_route`
 * line (icon `map-pin`, "{origin} – {destination} route" or the plain label
 * when the names are unknown), in line order. Every other code is ignored —
 * fare, extras, VAT and coupon rows stay where checkout already draws them.
 */
export function breakdownRows(
  lines: readonly BreakdownLine[],
  t: BreakdownT,
  toAmount: (rappen: number | null) => number | null,
): BreakdownRow[] {
  const rows: BreakdownRow[] = [];
  for (const line of lines) {
    if (line.code === "airport_fee") {
      rows.push({
        code: "airport_fee",
        label: t("airport_fee"),
        icon: "plane-landing",
        amount: toAmount(line.amount_rappen),
        amount_rappen: line.amount_rappen,
      });
    } else if (line.code === "fixed_route") {
      const names = placeNames(line.params);
      rows.push({
        code: "fixed_route",
        label: names ? t("routePair", names) : t("routePairPlain"),
        icon: "map-pin",
        amount: toAmount(line.amount_rappen),
        amount_rappen: line.amount_rappen,
      });
    }
  }
  return rows;
}

/** Sum of the rows' known CHF rappen — what the fare row must not repeat. */
export function breakdownRappen(rows: readonly BreakdownRow[]): number {
  return rows.reduce((sum, row) => sum + (row.amount_rappen ?? 0), 0);
}

/**
 * 261003: the airport fee and the route extra of one class, summed per code over
 * legs (V1 is one way: one leg), for `checkoutCharge({ fareParts })`. The lines
 * come only from the VERIFIED lock's `price_rows` or the ops board's own kernel
 * lines — never from a request body. A null, negative or non-finite amount is
 * kept as given so checkoutCharge refuses to split on it (one Fare line, as
 * today). Returns undefined when neither code is present (old lock).
 */
export function farePartsFromLines(
  lines: readonly BreakdownLine[] | null | undefined,
): FareParts | undefined {
  if (!lines || lines.length === 0) return undefined;
  let fee: number | null = null;
  let route = null as FareParts["route"];
  let bad = false;
  for (const line of lines) {
    if (line.code !== "airport_fee" && line.code !== "fixed_route") continue;
    const amount = line.amount_rappen;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 0) {
      bad = true;
      continue;
    }
    if (line.code === "airport_fee") {
      fee = (fee ?? 0) + amount;
    } else {
      const names = placeNames(line.params);
      route = {
        amountRappen: (route?.amountRappen ?? 0) + amount,
        origin: route?.origin ?? names?.origin ?? null,
        destination: route?.destination ?? names?.destination ?? null,
      };
    }
  }
  // One unreadable part poisons the split: a NaN fee makes checkoutCharge keep one line.
  if (bad) return { airportFeeRappen: Number.NaN, route: null };
  if (fee == null && route == null) return undefined;
  return { airportFeeRappen: fee, route };
}

/**
 * 261003: the chosen class's parts from a VERIFIED lock payload (`verifyLock` ok).
 * Reads `price_rows` for the breakdown only, never for an amount. A lock without
 * the field, another class or a malformed entry gives undefined: one Fare line.
 */
export function farePartsFromLock(
  priceRows: QuoteLockPayload["price_rows"] | undefined,
  slug: string,
): FareParts | undefined {
  if (!Array.isArray(priceRows)) return undefined;
  const entry = priceRows.find((row) => !!row && typeof row === "object" && row.slug === slug);
  if (!entry || !Array.isArray(entry.lines)) return undefined;
  const lines: BreakdownLine[] = [];
  for (const raw of entry.lines) {
    if (!raw || typeof raw !== "object") continue;
    const names = placeNames(raw.params);
    lines.push({
      code: raw.code,
      amount_rappen: typeof raw.amount_rappen === "number" ? raw.amount_rappen : null,
      ...(names ? { params: names } : {}),
    });
  }
  return farePartsFromLines(lines);
}
