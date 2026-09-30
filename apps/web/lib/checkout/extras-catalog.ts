// Checkout extras tiles follow the live rate book — the same rows ops priced.
// 26.2-p4: a row is a tick box by its own columns (selectableExtras), never by its name.

import type { ExtraCatalogRow } from "./checkout-charge";

export function airportPickupFromPlace(place: unknown): boolean | undefined {
  if (!place || typeof place !== "object" || Array.isArray(place)) return undefined;
  const rec = place as Record<string, unknown>;
  if (rec.zone_type === "airport") return true;
  if (typeof rec.zone_type === "string") return false;
  return undefined;
}

export type SnapshotExtraFare = {
  code: string;
  amount_rappen: number;
};

/** Public extra-stop cap is hardcoded 1 (D-21). Ignore the live-book column. */
export const PUBLIC_MAX_EXTRA_STOPS = 1;

/**
 * Cap extra-stop places at 1 (D-21). Book max_extra_stops is not the public cap.
 */
export function capExtraStops(requested: number, _maxFromBook?: unknown): number {
  const req = Number.isFinite(requested) ? Math.max(0, Math.trunc(requested)) : 0;
  return Math.min(req, PUBLIC_MAX_EXTRA_STOPS);
}

export type SurchargeLike = {
  code: string;
  kind: "amount" | "percent" | "included";
  amount_rappen: number | null;
  percent: number | string | null;
  active: boolean;
  quantity_source?: string | null;
  predicate?: { kind?: string } | null;
};

/** Public extra-stop cap is hardcoded 1 (D-21). The live-book column is ignored. */
export function publishedMaxExtraStops(_value?: unknown): number {
  return PUBLIC_MAX_EXTRA_STOPS;
}

/** Book amount × quantity. */
export function extraAmountTimesQty(
  amountRappen: number | null,
  quantity: number,
): number | null {
  if (amountRappen == null || !Number.isFinite(amountRappen) || quantity <= 0) {
    return null;
  }
  return amountRappen * quantity;
}

/** Display names for one extra, any language may be missing (plan 07's extra_labels). */
export type ExtraLabelsByCode = Record<
  string,
  Partial<{ en: string | null; de: string | null; fr: string | null; ar: string | null }> | undefined
>;

/** `child-seat` → `Child seat`. The fallback name when the owner saved no label. */
export function humaniseCode(code: string): string {
  const words = code
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (!words) return code;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function labelOr(value: string | null | undefined, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * D-35, 26.2-p4: the tick-box extras on the live book. The row decides, never
 * its name: active, a fixed amount ≥ 1 rappen, the rule "manual" (chosen by the
 * customer; the pricing page writes it for every extra, and the reader hands the
 * old string-stored rule on as the same), and no quantity source. The code is
 * used exactly as stored — never matched or renamed.
 * Rows with any other rule (always, zone, time window, quantity) are the fare
 * engine's; rows without a rule, percent rows, included rows and amount 0 are
 * not tick boxes.
 */
export function selectableExtras(
  surcharges: SurchargeLike[],
  labelsByCode: ExtraLabelsByCode,
): ExtraCatalogRow[] {
  const out: ExtraCatalogRow[] = [];
  const seen = new Set<string>();
  for (const row of surcharges) {
    if (!row.active) continue;
    if (row.kind !== "amount") continue;
    const amount = row.amount_rappen;
    if (amount == null || !Number.isInteger(amount) || amount < 1) continue;
    if (row.predicate?.kind !== "manual") continue;
    if (row.quantity_source) continue;
    if (seen.has(row.code)) continue;
    seen.add(row.code);
    const fallback = humaniseCode(row.code);
    const named = labelsByCode[row.code] ?? {};
    out.push({
      code: row.code,
      amountRappen: amount,
      labels: {
        en: labelOr(named.en, fallback),
        de: labelOr(named.de, fallback),
        fr: labelOr(named.fr, fallback),
        ar: labelOr(named.ar, fallback),
      },
    });
  }
  return out;
}
