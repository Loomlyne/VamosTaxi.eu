// Checkout extras tiles follow the live rate book — the same rows ops priced.
// Automatic codes (night, weekend, …) stay off the passenger extras card.

import { isPassengerExtra, normalizeSurchargeCode } from "../ops/surcharge-codes";
import type { ExtraCatalogRow } from "./checkout-charge";

export type CheckoutExtraJson = {
  code: string;
  kind: "amount" | "percent" | "included";
  amount_rappen: number | null;
  percent: number | string | null;
  toggle: boolean;
  /** Already on the quote total. Checkout must not add it again. */
  pricedInQuote?: boolean;
};

export type ExtraUi = {
  labelKey:
    | "childSeat"
    | "meetGreet"
    | "freeWait"
    | "extraOversized"
    | "additional-stop-2"
    | "extraSki"
    | "extraPet";
  toggle: boolean;
};

export const FREE_WAIT_CODE = "free_wait";
export const MEET_GREET_CODE = "meet_greet";

/** @deprecated 26.3 D-35 — removed by plan 26.3-21 */
const EXTRA_UI: Record<string, ExtraUi> = {
  child_seat: { labelKey: "childSeat", toggle: true },
  meet_greet: { labelKey: "meetGreet", toggle: false },
  free_wait: { labelKey: "freeWait", toggle: false },
  extra_stop: { labelKey: "additional-stop-2", toggle: true },
  oversized_luggage: { labelKey: "extraOversized", toggle: true },
  ski: { labelKey: "extraSki", toggle: true },
  ski_rack: { labelKey: "extraSki", toggle: true },
  pet: { labelKey: "extraPet", toggle: true },
};

/** @deprecated 26.3 D-35 — removed by plan 26.3-21 */
export function extraUi(code: string): ExtraUi | null {
  return EXTRA_UI[code] ?? EXTRA_UI[normalizeSurchargeCode(code)] ?? null;
}

export type ExtraToggles = {
  childSeat: boolean;
  oversized: boolean;
  extraStop: boolean;
  skiRack: boolean;
  extraCodes: string[];
  /** D-34: always on. Not a customer off-switch. */
  meetGreet?: boolean;
  /** D-34: always on when pickup is an airport. Not a customer off-switch. */
  freeWait?: boolean;
  /**
   * Free wait applies only on airport pickup. Explicit false is city/other.
   * Omitted means the caller has not classified the pin — follow the toggle.
   */
  airportPickup?: boolean;
};

export function airportPickupFromPlace(place: unknown): boolean | undefined {
  if (!place || typeof place !== "object" || Array.isArray(place)) return undefined;
  const rec = place as Record<string, unknown>;
  if (rec.zone_type === "airport") return true;
  if (typeof rec.zone_type === "string") return false;
  return undefined;
}

/** @deprecated 26.3 D-35 — removed by plan 26.3-21 */
export function extraIsOn(code: string, toggles: ExtraToggles): boolean {
  if (code === "child_seat") return toggles.childSeat;
  if (code === "oversized_luggage") return toggles.oversized;
  if (code === "extra_stop") return toggles.extraStop;
  if (code === "ski" || code === "ski_rack") return toggles.skiRack;
  // Included dashboard chips recap when they are on the live book (catalog filter).
  if (code === MEET_GREET_CODE || code === FREE_WAIT_CODE) return true;
  return toggles.extraCodes.includes(code);
}

export type RecapExtraLine = {
  code: string;
  labelKey: ExtraUi["labelKey"] | null;
};

export type RecapExtraFare = RecapExtraLine & {
  amount_rappen: number | null;
};

export type LockExtrasPeek = {
  child_seats?: number | null;
  extra_stops?: number | null;
  oversized_luggage?: boolean | null;
};

/** @deprecated 26.3 D-35 — removed by plan 26.3-21 */
export function lockHasExtra(extras: LockExtrasPeek | null | undefined, code: string): boolean {
  if (!extras) return false;
  if (code === "child_seat") return extras.child_seats === 1;
  if (code === "oversized_luggage") return extras.oversized_luggage === true;
  if (code === "extra_stop") return (extras.extra_stops ?? 0) > 0;
  return false;
}

export type SnapshotExtraFare = {
  code: string;
  amount_rappen: number;
};

function isWaitingPayableCode(code: string): boolean {
  const n = normalizeSurchargeCode(code);
  return n === "waiting_airport" || n === "waiting_city" || n === "extra_wait";
}

/** @deprecated 26.3 D-35 — removed by plan 26.3-21 */
export function extraFaresOn(
  catalog: CheckoutExtraJson[],
  on: (code: string) => boolean,
): SnapshotExtraFare[] {
  const out: SnapshotExtraFare[] = [];
  for (const row of catalog) {
    if (!on(row.code)) continue;
    if (row.pricedInQuote) continue;
    if (isWaitingPayableCode(row.code) || row.code === FREE_WAIT_CODE) continue;
    if (isExtraStopCode(row.code)) continue;
    if (row.kind !== "amount" || row.amount_rappen == null || row.amount_rappen < 1) continue;
    out.push({ code: row.code, amount_rappen: row.amount_rappen });
  }
  return out;
}

function isExtraStopCode(code: string): boolean {
  return normalizeSurchargeCode(code) === "extra_stop";
}

/** Public extra-stop cap is hardcoded 1 (D-21). Ignore the live-book column. */
export const PUBLIC_MAX_EXTRA_STOPS = 1;

/**
 * Cap extra-stop places at 1 (D-21). Book max_extra_stops is not the public cap.
 */
export function capExtraStops(requested: number, _maxFromBook?: unknown): number {
  const req = Number.isFinite(requested) ? Math.max(0, Math.trunc(requested)) : 0;
  return Math.min(req, PUBLIC_MAX_EXTRA_STOPS);
}

/** @deprecated 26.3 D-35 — removed by plan 26.3-21 */
export function recapExtraFares(
  catalog: CheckoutExtraJson[],
  on: (code: string) => boolean,
): RecapExtraFare[] {
  const out: RecapExtraFare[] = [];
  for (const row of catalog) {
    const ui = extraUi(row.code);
    if (!on(row.code)) continue;
    out.push({
      code: row.code,
      labelKey: ui?.labelKey ?? null,
      amount_rappen: isExtraStopCode(row.code)
        ? null
        : row.kind === "amount"
          ? row.amount_rappen
          : null,
    });
  }
  return out;
}

/** @deprecated 26.3 D-35 — removed by plan 26.3-21 */
export function recapExtras(
  catalog: CheckoutExtraJson[],
  on: (code: string) => boolean,
): RecapExtraLine[] {
  return recapExtraFares(catalog, on).map(({ code, labelKey }) => ({ code, labelKey }));
}

/** @deprecated 26.3 D-35 — removed by plan 26.3-21 */
export function extraRappenOutsideLock(
  extras: LockExtrasPeek | null | undefined,
  catalog: CheckoutExtraJson[],
  on: (code: string) => boolean,
): number {
  let add = 0;
  for (const row of catalog) {
    if (!on(row.code)) continue;
    if (isExtraStopCode(row.code)) continue;
    if (isWaitingPayableCode(row.code) || row.code === FREE_WAIT_CODE) continue;
    if (row.pricedInQuote) continue;
    if (row.kind !== "amount" || row.amount_rappen == null || row.amount_rappen < 1) continue;
    if (lockHasExtra(extras, row.code)) continue;
    add += row.amount_rappen;
  }
  return add;
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

/** Always-on amount rows are already in the quote. Do not charge them twice at checkout. */
function pricedOnQuote(row: SurchargeLike): boolean {
  if (row.kind !== "amount") return false;
  if (row.amount_rappen == null || row.amount_rappen < 1) return false;
  if (row.quantity_source) return false;
  return row.predicate?.kind === "always";
}

/** Public extra-stop cap is hardcoded 1 (D-21). The live-book column is ignored. */
export function publishedMaxExtraStops(_value?: unknown): number {
  return PUBLIC_MAX_EXTRA_STOPS;
}

/** Child seat / oversized / pet: book amount × quantity. Extra stop is not this. */
export function extraAmountTimesQty(
  amountRappen: number | null,
  quantity: number,
): number | null {
  if (amountRappen == null || !Number.isFinite(amountRappen) || quantity <= 0) {
    return null;
  }
  return amountRappen * quantity;
}

/** @deprecated 26.3 D-35 — removed by plan 26.3-21 */
export function catalogFromSurcharges(rows: SurchargeLike[]): CheckoutExtraJson[] {
  const out: CheckoutExtraJson[] = [];
  for (const row of rows) {
    if (!row.active) continue;
    if (!isPassengerExtra(row.code)) continue;
    const ui = extraUi(row.code);
    const free =
      !isExtraStopCode(row.code) &&
      (row.kind === "included" || row.amount_rappen === 0);
    const inQuote = pricedOnQuote(row);
    out.push({
      code: row.code,
      kind: free ? "included" : row.kind,
      amount_rappen: isExtraStopCode(row.code) || free ? null : row.amount_rappen,
      percent: row.percent,
      toggle: free || inQuote ? false : (ui?.toggle ?? true),
      ...(inQuote ? { pricedInQuote: true } : {}),
    });
  }
  return out;
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
 * D-35: the tick-box extras on the live book. Any active passenger surcharge
 * with a fixed amount ≥ 1 rappen, by its exact code — never matched or renamed.
 * Automatic codes (night, waiting…), always-on quote rows, extra stop (needs an
 * address), percent and included rows are not tick boxes.
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
    if (!isPassengerExtra(row.code)) continue;
    if (pricedOnQuote(row)) continue;
    if (row.code === "extra_stop" || row.quantity_source === "extra_stops") continue;
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
