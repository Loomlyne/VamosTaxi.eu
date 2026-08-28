// apps/web/lib/pricing/policy.test.ts
//
// Policy snapshot + booking-level discount proofs (D-06, D-40, D-42, D-46).
// No policy NUMBER is asserted from source — fixtures inject unit-free values.

import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import {
  buildCouponLine,
  buildPolicySnapshot,
  buildReturnTripLine,
  currentSettingsVersion,
  sumPreCouponTotal,
  type CouponFacts,
  type SettingsVersionRow,
} from "./policy";
import type { Line, SurchargeRow } from "./types";

function settingsRow(
  partial: Partial<SettingsVersionRow> &
    Pick<SettingsVersionRow, "id" | "effective_from">,
): SettingsVersionRow {
  return {
    id: partial.id,
    slug: partial.slug ?? `sv-${partial.id}`,
    effective_from: partial.effective_from,
    free_cancel_hours: partial.free_cancel_hours ?? null,
    modification_deadline_hours: partial.modification_deadline_hours ?? null,
    min_advance_minutes: partial.min_advance_minutes ?? null,
    airport_waiting_minutes: partial.airport_waiting_minutes ?? null,
    city_waiting_minutes: partial.city_waiting_minutes ?? null,
    manage_link_validity_days: partial.manage_link_validity_days ?? null,
    round_trip_discount_percent: partial.round_trip_discount_percent ?? null,
    night_window_start: partial.night_window_start ?? null,
    night_window_end: partial.night_window_end ?? null,
    night_window_tz: partial.night_window_tz ?? "Europe/Zurich",
    quote_lock_minutes: partial.quote_lock_minutes ?? null,
    checkout_window_minutes: partial.checkout_window_minutes ?? null,
    cancellation_tiers: partial.cancellation_tiers ?? [],
    policy_doc_slug: partial.policy_doc_slug ?? null,
    policy_doc_version: partial.policy_doc_version ?? null,
  };
}

function fareLine(amount: number | null, leg_seq = 1): Line {
  return {
    seq: leg_seq,
    leg_seq,
    kind: "fare",
    code: "distance_fare",
    i18n_key: "price.line.transfer",
    basis: { rule: "per_km" },
    amount_rappen: amount,
  };
}

describe("currentSettingsVersion", () => {
  it("picks greatest effective_from <= computedAt", () => {
    const rows = [
      settingsRow({ id: 1, effective_from: "2026-01-01T00:00:00Z" }),
      settingsRow({ id: 2, effective_from: "2026-06-01T00:00:00Z" }),
      settingsRow({ id: 3, effective_from: "2027-01-01T00:00:00Z" }),
    ];
    const picked = currentSettingsVersion(rows, "2026-09-01T12:00:00Z");
    expect(picked?.id).toBe(2);
  });

  it("breaks a tie on id descending", () => {
    const rows = [
      settingsRow({ id: 4, effective_from: "2026-06-01T00:00:00Z" }),
      settingsRow({ id: 7, effective_from: "2026-06-01T00:00:00Z" }),
      settingsRow({ id: 5, effective_from: "2026-06-01T00:00:00Z" }),
    ];
    const picked = currentSettingsVersion(rows, "2026-09-01T00:00:00Z");
    expect(picked?.id).toBe(7);
  });

  it("returns null when no row qualifies", () => {
    const rows = [
      settingsRow({ id: 1, effective_from: "2027-01-01T00:00:00Z" }),
    ];
    expect(currentSettingsVersion(rows, "2026-01-01T00:00:00Z")).toBeNull();
  });

  it("never needs a clock — same input always same pick", () => {
    const rows = [
      settingsRow({ id: 1, effective_from: "2020-01-01T00:00:00Z" }),
      settingsRow({ id: 2, effective_from: "2025-01-01T00:00:00Z" }),
    ];
    const a = currentSettingsVersion(rows, "2026-01-01T00:00:00Z");
    const b = currentSettingsVersion(rows, "2026-01-01T00:00:00Z");
    expect(a).toEqual(b);
    expect(a?.id).toBe(2);
  });
});

describe("buildPolicySnapshot", () => {
  it("emits all eight keys when every settings column is null", () => {
    const snap = buildPolicySnapshot(
      settingsRow({ id: 9, effective_from: "2026-01-01T00:00:00Z" }),
    );
    const keys = Object.keys(snap).sort();
    expect(keys).toEqual(
      [
        "airport_waiting_minutes",
        "cancellation_tiers",
        "city_waiting_minutes",
        "free_cancel_hours",
        "min_advance_minutes",
        "modification_deadline_hours",
        "policy_doc",
        "settings_version_id",
      ].sort(),
    );
    expect(snap.settings_version_id).toBe(9);
    expect(snap.free_cancel_hours).toBeNull();
    expect(snap.modification_deadline_hours).toBeNull();
    expect(snap.min_advance_minutes).toBeNull();
    expect(snap.airport_waiting_minutes).toBeNull();
    expect(snap.city_waiting_minutes).toBeNull();
    expect(snap.cancellation_tiers).toEqual([]);
    expect(snap.policy_doc).toBeNull();
  });

  it("builds policy_doc from slug+version pair", () => {
    const snap = buildPolicySnapshot(
      settingsRow({
        id: 1,
        effective_from: "2026-01-01T00:00:00Z",
        policy_doc_slug: "cancellation",
        policy_doc_version: "2026-08-01",
      }),
    );
    expect(snap.policy_doc).toEqual({
      slug: "cancellation",
      version: "2026-08-01",
    });
  });

  it("passes cancellation_tiers through without rebuilding", () => {
    const tiers = [
      { from_hours_before: 1, refund_percent: 100 },
      { no_show: true, refund_percent: 0 },
    ];
    const snap = buildPolicySnapshot(
      settingsRow({
        id: 1,
        effective_from: "2026-01-01T00:00:00Z",
        cancellation_tiers: tiers,
      }),
    );
    expect(snap.cancellation_tiers).toBe(tiers);
  });
});

describe("buildReturnTripLine (D-06, D-12)", () => {
  const returnSurcharge: SurchargeRow = {
    id: 20,
    rate_version_id: 1,
    code: "return_trip",
    kind: "percent",
    amount_rappen: null,
    percent: "10",
    applies_to: "booking",
    active: true,
    predicate: { kind: "always" },
    quantity_source: null,
  };

  it("emits discount with pro_rata allocation and fare-sum basis", () => {
    const line = buildReturnTripLine({
      mode: "return",
      fareLines: [fareLine(1000, 1), fareLine(2000, 2)],
      returnTripSurcharge: returnSurcharge,
      rateVersionId: 1,
    });
    expect(line).not.toBeNull();
    expect(line!.kind).toBe("discount");
    expect(line!.leg_seq).toBeNull();
    expect(line!.allocation).toBe("pro_rata");
    expect(line!.i18n_key).toBe("price.line.round_trip_discount");
    expect(line!.params?.percent).toBe("10");
    // 10% of 3000 = 300
    expect(line!.amount_rappen).toBe(300);
    expect(line!.basis.of_rappen).toBe(3000);
  });

  it("emits nothing for one_way", () => {
    expect(
      buildReturnTripLine({
        mode: "one_way",
        fareLines: [fareLine(1000)],
        returnTripSurcharge: returnSurcharge,
        rateVersionId: 1,
      }),
    ).toBeNull();
  });

  it("emits nothing when no return_trip surcharge row", () => {
    expect(
      buildReturnTripLine({
        mode: "return",
        fareLines: [fareLine(1000), fareLine(1000)],
        returnTripSurcharge: null,
        rateVersionId: 1,
      }),
    ).toBeNull();
  });

  it("null percent / null fares still emit shape with null amount", () => {
    const unpriced: SurchargeRow = { ...returnSurcharge, percent: null };
    const line = buildReturnTripLine({
      mode: "return",
      fareLines: [fareLine(null, 1), fareLine(null, 2)],
      returnTripSurcharge: unpriced,
      rateVersionId: null,
    });
    expect(line).not.toBeNull();
    expect(line!.amount_rappen).toBeNull();
    expect(line!.allocation).toBe("pro_rata");
  });
});

describe("buildCouponLine (D-06, D-07)", () => {
  it("percent coupon is percentOf(preCouponTotal) with code as typed", () => {
    const coupon: CouponFacts = {
      id: 3,
      code: "zrh20",
      kind: "percent",
      percent: "20",
      amount_rappen: null,
    };
    const line = buildCouponLine({ coupon, preCouponTotal: 1000 });
    expect(line.kind).toBe("discount");
    expect(line.leg_seq).toBeNull();
    expect(line.allocation).toBe("pro_rata");
    expect(line.i18n_key).toBe("price.line.coupon");
    expect(line.params?.code).toBe("zrh20");
    expect(line.amount_rappen).toBe(200);
    expect(line.basis.of).toBe("pre_coupon_total");
    expect(line.basis.clamped).toBe(false);
  });

  it("amount coupon clamps with min(amount, preCouponTotal) and records clamped", () => {
    const coupon: CouponFacts = {
      id: 4,
      code: "FLAT",
      kind: "amount",
      percent: null,
      amount_rappen: 5000,
    };
    const line = buildCouponLine({ coupon, preCouponTotal: 1200 });
    expect(line.amount_rappen).toBe(1200);
    expect(line.basis.clamped).toBe(true);
  });

  it("amount is a positive magnitude (sign lives in kind)", () => {
    const line = buildCouponLine({
      coupon: {
        id: 1,
        code: "X",
        kind: "percent",
        percent: "50",
        amount_rappen: null,
      },
      preCouponTotal: 800,
    });
    expect(line.amount_rappen).toBeGreaterThan(0);
    expect(line.kind).toBe("discount");
  });

  it("property: coupon of any magnitude yields non-negative remainder", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100_000 }),
        fc.integer({ min: 0, max: 100_000 }),
        (pre, couponAmt) => {
          const line = buildCouponLine({
            coupon: {
              id: 1,
              code: "P",
              kind: "amount",
              percent: null,
              amount_rappen: couponAmt,
            },
            preCouponTotal: pre,
          });
          const disc = line.amount_rappen ?? 0;
          expect(pre - disc).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("pre-coupon total already includes round-trip (sumPreCouponTotal)", () => {
    const lines: Line[] = [
      fareLine(1000, 1),
      fareLine(1000, 2),
      {
        seq: 3,
        leg_seq: 1,
        kind: "surcharge",
        code: "night",
        i18n_key: "price.surcharge.night.label",
        basis: { rule: "percent" },
        amount_rappen: 100,
      },
      {
        seq: 4,
        leg_seq: null,
        kind: "discount",
        code: "return_trip",
        i18n_key: "price.line.round_trip_discount",
        basis: { rule: "percent" },
        allocation: "pro_rata",
        amount_rappen: 200,
      },
    ];
    // fare 1000+1000 + surcharge 100 − return 200 = 1900
    expect(sumPreCouponTotal(lines)).toBe(1900);
  });
});
