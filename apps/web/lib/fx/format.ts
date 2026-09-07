// Display FX only. Charge stays CHF. Never invent a rate.

import { formatAmount, type CurrencyCode } from "../currency";
import { chfRappenToMinor, rateToMillionths } from "./convert";
import type { FxRates } from "./fetchRates";

export type DisplayMoney = {
  major: number | null;
  currency: CurrencyCode;
  usedFx: boolean;
};

export function formatChfRate(rate: number): string {
  return rate.toLocaleString("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/** CHF rappen → display major + mark. FX down or unknown rate → keep CHF. */
export function chfRappenToDisplay(
  rappen: number | null | undefined,
  currency: CurrencyCode,
  rates: FxRates | null,
): DisplayMoney {
  if (rappen == null) {
    return { major: null, currency, usedFx: false };
  }
  if (currency === "CHF") {
    return { major: rappen / 100, currency: "CHF", usedFx: false };
  }
  const rate = rates?.[currency];
  if (!(typeof rate === "number" && rate > 0)) {
    return { major: rappen / 100, currency: "CHF", usedFx: false };
  }
  const minor = chfRappenToMinor(rappen, rateToMillionths(rate));
  return { major: minor / 100, currency, usedFx: true };
}

export function formatChfRappen(
  rappen: number | null | undefined,
  currency: CurrencyCode,
  rates: FxRates | null,
): string {
  const shown = chfRappenToDisplay(rappen, currency, rates);
  return formatAmount(shown.major, shown.currency);
}
