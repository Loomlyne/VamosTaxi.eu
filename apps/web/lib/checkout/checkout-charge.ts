// apps/web/lib/checkout/checkout-charge.ts
//
// D-19: one pure function prices the checkout for both the screen and the
// charge — lock class net + ticked extras (by exact code, D-35) − coupon, then
// VAT on top (D-08a / D-34: a coupon, percent or fixed, comes off before VAT).
// The browser sends codes only; every amount comes from the live catalog rows
// the caller loaded (T-26.3-03-01/02). Arithmetic runs through payableRappen so
// the D-08a order has one owner.

import { payableRappen } from "./payable";

/** One passenger extra the live price book offers, with its display names. */
export type ExtraCatalogRow = {
  code: string;
  amountRappen: number;
  labels: { en: string; de: string; fr: string; ar: string };
};

/**
 * One priced line. `coupon` is negative here (display arithmetic); the
 * price snapshot folds it into non-negative amounts (lock-to-rpc.ts).
 */
export type ChargeLine = {
  kind: "fare" | "surcharge" | "coupon" | "vat";
  code: string | null;
  i18n_key: string;
  params: Record<string, unknown>;
  amount_rappen: number;
};

export type CheckoutChargeCoupon = {
  code: string;
  kind: "percent" | "amount";
  /** Hundredths of one percent ('10.00' → 1000), as percentToHundredths. */
  percentHundredths: number | null;
  amountRappen: number | null;
};

/**
 * 261003 fare lines: the two parts the class net already contains, read from the
 * VERIFIED lock's `price_rows` (or the ops board's own kernel lines). They only
 * cut the one Fare line into pieces for the breakdown; they never change an
 * amount. Absent or 0 = no such part.
 */
export type FareParts = {
  airportFeeRappen: number | null;
  route: { amountRappen: number; origin: string | null; destination: string | null } | null;
};

export type CheckoutChargeInput = {
  /** The lock's signed class net (lines only, no checkout extras). */
  classNetRappen: number;
  /**
   * The class net BEFORE any coupon. Whenever a coupon is passed, the fare
   * line and the coupon arithmetic start from this figure; null falls back to
   * classNetRappen (then classNetRappen must itself be pre-coupon, or the
   * coupon comes off twice — callers holding a post-coupon lock pass this).
   */
  preCouponRappen: number | null;
  extraCodes: string[];
  catalog: ExtraCatalogRow[];
  coupon: CheckoutChargeCoupon | null;
  /** lib/checkout/vat.ts scale: 81 = 8.1 %. */
  vatRateBps: number;
  vehicleClassSlug: string;
  /** Breakdown of the class net (see FareParts). Omitted for an old lock: one Fare line. */
  fareParts?: FareParts;
};

export type CheckoutChargeResult =
  | {
      ok: true;
      lines: ChargeLine[];
      netRappen: number;
      vatRappen: number;
      chargedRappen: number;
    }
  | { ok: false; code: "unknown_extra"; extra: string };

function rappen(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
}

/**
 * The pieces the fare line is cut into, or null = keep one line. Split only when
 * every present part is a positive whole number and together they stay below the
 * base; an old lock, a missing row or any bad figure keeps today's single line.
 */
function splitFare(
  base: number,
  parts: FareParts | undefined,
): { fee: number; route: number; origin: string | null; destination: string | null } | null {
  if (!parts) return null;
  const whole = (v: number | null | undefined): number | null | "bad" => {
    if (v == null) return null;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) return "bad";
    return v === 0 ? null : v;
  };
  const fee = whole(parts.airportFeeRappen);
  const route = whole(parts.route?.amountRappen);
  if (fee === "bad" || route === "bad") return null;
  const feeRappen = fee ?? 0;
  const routeRappen = route ?? 0;
  if (feeRappen + routeRappen <= 0 || feeRappen + routeRappen >= base) return null;
  const name = (v: string | null | undefined) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const origin = name(parts.route?.origin);
  const destination = name(parts.route?.destination);
  return {
    fee: feeRappen,
    route: routeRappen,
    origin: origin && destination ? origin : null,
    destination: origin && destination ? destination : null,
  };
}

/** D-19: the single price the customer sees and the card is charged. */
export function checkoutCharge(input: CheckoutChargeInput): CheckoutChargeResult {
  const byCode = new Map<string, ExtraCatalogRow>();
  for (const row of input.catalog) {
    if (!byCode.has(row.code)) byCode.set(row.code, row);
  }

  const picked: ExtraCatalogRow[] = [];
  const seen = new Set<string>();
  for (const code of input.extraCodes) {
    if (seen.has(code)) continue;
    seen.add(code);
    const row = byCode.get(code);
    if (!row) return { ok: false, code: "unknown_extra", extra: code };
    picked.push(row);
  }
  const extrasRappen = picked.reduce((sum, row) => sum + rappen(row.amountRappen), 0);

  const coupon = input.coupon;
  const percent = coupon?.kind === "percent" ? rappen(coupon.percentHundredths) : 0;
  const fixed = coupon?.kind === "amount" ? rappen(coupon.amountRappen) : 0;
  const hasCoupon = percent > 0 || fixed > 0;
  const fareRappen = hasCoupon
    ? rappen(input.preCouponRappen ?? input.classNetRappen)
    : rappen(input.classNetRappen);

  let payable;
  if (percent > 0) {
    payable = payableRappen({
      classNetRappen: fareRappen,
      preCouponRappen: fareRappen,
      extraAddRappen: extrasRappen,
      couponPercent: percent,
      vatRateBps: input.vatRateBps,
    });
  } else {
    // D-34: a fixed coupon comes off the pre-VAT fare + extras, floor 0.
    const net = Math.max(0, fareRappen + extrasRappen - fixed);
    payable = payableRappen({
      classNetRappen: net,
      extraAddRappen: 0,
      vatRateBps: input.vatRateBps,
    });
  }
  const discountRappen = fareRappen + extrasRappen - payable.netRappen;

  // Everything above is the money. From here the one fare line is only cut into pieces that add
  // up to it (the lines-sum guard below still runs), so no figure above can move.
  const split = splitFare(fareRappen, input.fareParts);
  const lines: ChargeLine[] = [
    {
      kind: "fare",
      code: "distance_fare",
      i18n_key: "price.line.transfer",
      params: { vehicleClass: input.vehicleClassSlug },
      amount_rappen: split ? fareRappen - split.fee - split.route : fareRappen,
    },
  ];
  if (split && split.fee > 0) {
    lines.push({
      kind: "fare",
      code: "airport_fee",
      i18n_key: "price.line.airport_fee",
      params: {},
      amount_rappen: split.fee,
    });
  }
  if (split && split.route > 0) {
    lines.push({
      kind: "fare",
      code: "fixed_route",
      i18n_key: "price.line.fixed_route",
      params: split.origin && split.destination ? { origin: split.origin, destination: split.destination } : {},
      amount_rappen: split.route,
    });
  }
  for (const row of picked) {
    lines.push({
      kind: "surcharge",
      code: row.code,
      i18n_key: "price.surcharge.custom",
      params: { name: row.labels.en, names: row.labels },
      amount_rappen: rappen(row.amountRappen),
    });
  }
  if (coupon && hasCoupon) {
    lines.push({
      kind: "coupon",
      code: coupon.code,
      i18n_key: "price.line.coupon",
      params: coupon.kind === "percent" ? { percentHundredths: percent } : { amountRappen: fixed },
      amount_rappen: -discountRappen,
    });
  }
  lines.push({
    kind: "vat",
    code: "vat",
    i18n_key: "price.line.vat",
    params: { vatRateBps: input.vatRateBps },
    amount_rappen: payable.vatRappen,
  });

  const sum = lines.reduce((total, line) => total + line.amount_rappen, 0);
  if (sum !== payable.chargedRappen) {
    // Unreachable by construction; refuse to hand out a price whose lines lie.
    throw new Error(`checkoutCharge lines ${sum} != charged ${payable.chargedRappen}`);
  }

  return {
    ok: true,
    lines,
    netRappen: payable.netRappen,
    vatRappen: payable.vatRappen,
    chargedRappen: payable.chargedRappen,
  };
}
