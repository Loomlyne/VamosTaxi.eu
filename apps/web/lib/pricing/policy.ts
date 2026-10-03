// apps/web/lib/pricing/policy.ts
//
// Policy snapshot + booking-level discount lines (D-06, D-40, D-42).
//
// Negative space: this module contains no policy NUMBER. Free-cancel hours,
// waiting minutes, advance windows and the round-trip percent are
// settings_versions data (ADR-014 §5, seeded by Phase 2 plan 02-09). A literal
// here would be the exact hole ADR-002's NULL discipline exists to prevent.
//
// buildPolicySnapshot emits **eight** keys while the landed
// price_snapshots_policy_shape CHECK requires only five; plan 04-05's migration
// extends the CHECK to the other three (modification_deadline_hours,
// min_advance_minutes, policy_doc). Emitting them now makes that migration a
// no-op against real data rather than a breaking change.
//
// buildReturnTripLine and buildCouponLine are the only two functions in this
// phase that produce a leg_seq: null line, so both set allocation: "pro_rata"
// unconditionally — a single-leg cancellation (ADR-006) has to apportion them
// from the row alone, months later, with no engine available.
//
// Does not raise. currentSettingsVersion returns null when no row qualifies;
// the caller surfaces the no_settings_version catalogue error (500).

import { percentOf, percentToHundredths } from "./round";
import type {
  CancellationTier,
  Line,
  PolicySnapshot,
  SettingsSnapshot,
  SurchargeRow,
} from "./types";

/** settings_versions row as handed to the kernel — includes effective_from. */
export type SettingsVersionRow = SettingsSnapshot & {
  /** ISO timestamptz text — compared lexicographically to computedAt. */
  effective_from: string;
};

/**
 * Pick the row with the greatest effective_from that is <= computedAt.
 * Tie-break on id descending. Never calls a clock.
 */
export function currentSettingsVersion(
  rows: SettingsVersionRow[],
  computedAt: string,
): SettingsVersionRow | null {
  let best: SettingsVersionRow | null = null;
  for (const row of rows) {
    if (row.effective_from > computedAt) continue;
    if (best === null) {
      best = row;
      continue;
    }
    if (row.effective_from > best.effective_from) {
      best = row;
      continue;
    }
    if (
      row.effective_from === best.effective_from &&
      row.id > best.id
    ) {
      best = row;
    }
  }
  return best;
}

/**
 * Eight-key policy object written onto price_snapshots.policy.
 * Null settings columns stay null — "forgot" and "unanswered" stay distinct.
 */
export function buildPolicySnapshot(row: SettingsVersionRow): PolicySnapshot {
  let policy_doc: PolicySnapshot["policy_doc"] = null;
  if (row.policy_doc_slug !== null && row.policy_doc_version !== null) {
    policy_doc = { slug: row.policy_doc_slug, version: row.policy_doc_version };
  } else if (row.policy_doc_slug === null && row.policy_doc_version === null) {
    policy_doc = null;
  } else {
    // One half present is still incomplete — treat as null doc pair.
    policy_doc = null;
  }

  // cancellation_tiers is passed through as the array from the row, never rebuilt.
  const cancellation_tiers: CancellationTier[] = row.cancellation_tiers;

  return {
    settings_version_id: row.id,
    free_cancel_hours: row.free_cancel_hours,
    modification_deadline_hours: row.modification_deadline_hours,
    min_advance_minutes: row.min_advance_minutes,
    airport_waiting_minutes: row.airport_waiting_minutes,
    city_waiting_minutes: row.city_waiting_minutes,
    cancellation_tiers,
    policy_doc,
  };
}

function percentString(value: number | string | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) return null;
    return String(value);
  }
  return value;
}

export interface BuildReturnTripLineArgs {
  mode: "one_way" | "return";
  /** Fare lines only — percent is of Σ fare amounts (D-06). */
  fareLines: Line[];
  /** Active return_trip surcharge row from the rate book, if any. */
  returnTripSurcharge: SurchargeRow | null;
  rateVersionId: number | null;
}

/**
 * Round-trip discount: kind discount, leg_seq null, allocation pro_rata.
 * Emitted only when mode === "return" AND an active return_trip surcharge exists
 * (D-12). Amount is percentOf(Σ fare lines, hundredths) — never of the subtotal
 * including surcharges (D-06).
 */
export function buildReturnTripLine(
  args: BuildReturnTripLineArgs,
): Line | null {
  const { mode, fareLines, returnTripSurcharge, rateVersionId } = args;
  if (mode !== "return") return null;
  if (returnTripSurcharge === null || !returnTripSurcharge.active) return null;

  // Σ fare line amounts (null if any fare is unpriced).
  let fareSum: number | null = 0;
  for (const fl of fareLines) {
    if (fl.kind !== "fare") continue;
    if (fl.amount_rappen === null) {
      fareSum = null;
      break;
    }
    fareSum += fl.amount_rappen;
  }

  const pctStr = percentString(returnTripSurcharge.percent);
  let amount: number | null = null;
  let percentParam: string | number | null = returnTripSurcharge.percent;

  if (pctStr !== null && fareSum !== null) {
    const hundredths = percentToHundredths(pctStr);
    amount = percentOf(fareSum, hundredths);
  }

  // Display percent for ICU — prefer the raw string/number from the row.
  if (typeof percentParam === "string" || typeof percentParam === "number") {
    // keep as-is
  } else {
    percentParam = null;
  }

  return {
    seq: 0, // numbered later
    leg_seq: null,
    kind: "discount",
    code: "return_trip",
    i18n_key: "price.line.round_trip_discount",
    params: { percent: percentParam },
    basis: {
      rule: "percent",
      percent: returnTripSurcharge.percent,
      of_rappen: fareSum,
      of: "fare_lines_sum",
      why: { surcharge_code: "return_trip" },
    },
    source_row: {
      table: "surcharges",
      id: returnTripSurcharge.id,
      ...(rateVersionId !== null ? { rate_version_id: rateVersionId } : {}),
    },
    // leg_seq null ⇒ allocation required for single-leg refund apportionment.
    allocation: "pro_rata",
    amount_rappen: amount,
  };
}

/** Coupon facts already validated by evaluate_coupon (plan 04-10). */
export interface CouponFacts {
  id: number;
  /** Code AS TYPED by the customer — snapshot stores this, not uppercased. */
  code: string;
  kind: "percent" | "amount";
  percent: number | string | null;
  amount_rappen: number | null;
}

export interface BuildCouponLineArgs {
  coupon: CouponFacts;
  /** Pre-coupon total already including the round-trip line (D-06 exception). */
  preCouponTotal: number | null;
}

/**
 * Coupon discount: kind discount, leg_seq null, allocation pro_rata.
 * Percent coupon → percentOf(preCouponTotal); amount coupon → min(amount, total).
 * Amount is a POSITIVE magnitude; sign lives in kind (D-07).
 * basis.clamped records whether the amount coupon bit the ceiling.
 * D-16: coupon applies to the pre-VAT fare+extras total and never drives
 * payable below 0 (clamped to preCouponTotal).
 */
export function buildCouponLine(args: BuildCouponLineArgs): Line {
  const { coupon, preCouponTotal } = args;

  let amount: number | null = null;
  let clamped = false;
  let basisRule: string;
  let basis: Line["basis"];

  if (coupon.kind === "percent") {
    basisRule = "percent";
    const pctStr = percentString(coupon.percent);
    if (pctStr !== null && preCouponTotal !== null) {
      const hundredths = percentToHundredths(pctStr);
      amount = percentOf(preCouponTotal, hundredths);
      // A percent coupon cannot exceed the total by construction when percent ≤ 100,
      // but still never produce a negative remainder.
      if (amount > preCouponTotal) {
        amount = preCouponTotal;
        clamped = true;
      }
    }
    basis = {
      rule: basisRule,
      percent: coupon.percent,
      of_rappen: preCouponTotal,
      of: "pre_coupon_total",
      clamped,
    };
  } else {
    basisRule = "amount";
    if (coupon.amount_rappen !== null && preCouponTotal !== null) {
      if (coupon.amount_rappen > preCouponTotal) {
        amount = preCouponTotal;
        clamped = true;
      } else {
        amount = coupon.amount_rappen;
        clamped = false;
      }
    } else if (coupon.amount_rappen !== null && preCouponTotal === null) {
      amount = null;
    } else {
      amount = null;
    }
    basis = {
      rule: basisRule,
      amount_rappen: coupon.amount_rappen,
      of_rappen: preCouponTotal,
      of: "pre_coupon_total",
      clamped,
    };
  }

  return {
    seq: 0,
    leg_seq: null,
    kind: "discount",
    code: "coupon",
    i18n_key: "price.line.coupon",
    params: { code: coupon.code },
    basis,
    source_row: { table: "coupons", id: coupon.id },
    // leg_seq null ⇒ allocation required for single-leg refund apportionment.
    allocation: "pro_rata",
    amount_rappen: amount,
  };
}

/**
 * Pre-coupon total: Σ non-discount amounts − Σ discount amounts already present
 * (the round-trip line is kind discount and must already be included per D-06).
 * Returns null if any contributing amount is null.
 */
export function sumPreCouponTotal(lines: Line[]): number | null {
  let sum = 0;
  for (const line of lines) {
    if (line.kind === "included") continue; // always null amount, free
    if (line.amount_rappen === null) return null;
    if (line.kind === "discount") {
      sum -= line.amount_rappen;
    } else {
      sum += line.amount_rappen;
    }
  }
  return sum;
}

/**
 * 26.2 audit (U04-1): a class's total BEFORE the coupon line, read from the lines
 * the kernel built. Null when the class is unpriced or any amount is null. Checkout
 * pins this on the lock so it never has to gross a post-coupon total back up
 * (a fixed coupon is clamped to the total, a percent one is rounded: neither inverts).
 */
export function preCouponTotalOfClass(entry: {
  lines: Line[];
  total_rappen: number | null;
}): number | null {
  if (entry.total_rappen === null) return null;
  return sumPreCouponTotal(
    entry.lines.filter((l) => !(l.kind === "discount" && l.code === "coupon")),
  );
}
