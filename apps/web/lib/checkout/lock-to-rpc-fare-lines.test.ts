// 261003 fare lines: the split must not move the extras, the coupon spill, the VAT line or any
// total. Internal rappen fixtures, never shown as a price.
import { describe, expect, it } from "vitest";
import type { QuoteLockPayload } from "../quote/lock";
import { checkoutCharge, type CheckoutChargeInput } from "./checkout-charge";
import { snapshotFromLock, snapshotPolicyFromSettings } from "./lock-to-rpc";

const CLASS_ID = "00000000-0000-4000-8000-0000000000aa";

function payload(): QuoteLockPayload {
  return {
    v: 1,
    quote_id: "00000000-0000-4000-8000-000000000001",
    exp: "2026-09-05T13:00:00.000Z",
    engine_version: "quote-engine@test",
    rate_version_id: 1,
    settings_version_id: 1,
    computed_at: "2026-09-05T12:00:00.000Z",
    display_currency: "CHF",
    mode: "one_way",
    pax: 2,
    bags: 1,
    extras: null,
    coupon: null,
    class_totals: [{ slug: "economy", total_rappen: 10000 }],
    legs: [
      {
        leg_seq: 1,
        pickup: { lng: 8.5, lat: 47.4, text: "ZRH", place_id: "poi.1" },
        dropoff: { lng: 8.54, lat: 47.37, text: "Zurich" },
        scheduled_local: "2026-09-06T10:00:00",
        distance_m: 12000,
        duration_s: 1200,
        origin_zone_id: null,
        dest_zone_id: null,
        flight_no: "LX123",
        landing_source: null,
      },
    ],
  };
}

const policy = snapshotPolicyFromSettings({
  id: 3,
  free_cancel_hours: null,
  modification_deadline_hours: null,
  min_advance_minutes: null,
  airport_waiting_minutes: null,
  city_waiting_minutes: null,
  cancellation_tiers: [],
  policy_doc_slug: null,
  policy_doc_version: null,
});
const labels = { en: "Owner thing", de: "Owner thing", fr: "Owner thing", ar: "Owner thing" };
const parts = {
  airportFeeRappen: 1500,
  route: { amountRappen: 2500, origin: "Zürich", destination: "Genève" },
};

function snap(over: { coupon?: CheckoutChargeInput["coupon"]; split: boolean }) {
  const charge = checkoutCharge({
    classNetRappen: 10000,
    preCouponRappen: null,
    extraCodes: ["owner-thing"],
    catalog: [{ code: "owner-thing", amountRappen: 500, labels }],
    coupon: over.coupon ?? null,
    vatRateBps: 81,
    vehicleClassSlug: "economy",
    ...(over.split ? { fareParts: parts } : {}),
  });
  if (!charge.ok) throw new Error("refused");
  return {
    charge,
    snap: snapshotFromLock(payload(), "economy", CLASS_ID, charge.chargedRappen, policy!, charge.lines),
  };
}

type L = { kind: string; seq: number; amount_rappen: number | null };
const notFare = <T extends L>(lines: T[]) =>
  lines.filter((l) => l.kind !== "fare").map(({ seq: _seq, ...rest }) => rest);
const fareSum = (lines: L[]) =>
  lines.filter((l) => l.kind === "fare").reduce((s, l) => s + (l.amount_rappen ?? 0), 0);
const sum = (lines: L[]) => lines.reduce((s, l) => s + (l.amount_rappen ?? 0), 0);

describe("snapshotFromLock with split fare lines", () => {
  it("no coupon: extras, VAT, total and the extras list are identical; the fare pieces add up", () => {
    const one = snap({ split: false });
    const three = snap({ split: true });
    expect(three.snap.total_rappen).toBe(one.snap.total_rappen);
    expect(three.snap.subtotal_rappen).toBe(one.snap.subtotal_rappen);
    expect(three.snap.policy).toEqual(one.snap.policy);
    expect(three.snap.policy).toMatchObject({ extras: ["owner-thing"] });
    expect(notFare(three.snap.lines)).toEqual(notFare(one.snap.lines));
    expect(fareSum(three.snap.lines)).toBe(fareSum(one.snap.lines));
    expect(three.snap.lines.map((l) => [l.seq, l.kind, l.code])).toEqual([
      [1, "fare", "distance_fare"],
      [2, "fare", "airport_fee"],
      [3, "fare", "fixed_route"],
      [4, "surcharge", "owner-thing"],
      [5, "vat", "vat"],
    ]);
    expect(sum(three.snap.lines)).toBe(three.snap.total_rappen);
  });

  it("the old single-line lock saves exactly one distance_fare line", () => {
    const one = snap({ split: false });
    expect(one.snap.lines.filter((l) => l.kind === "fare").map((l) => l.code)).toEqual(["distance_fare"]);
  });

  it("coupon smaller than the fare: the spill stays on the fare pieces, extras untouched, list_rappen kept", () => {
    const coupon = { code: "FLAT", kind: "amount" as const, percentHundredths: null, amountRappen: 7000 };
    const one = snap({ coupon, split: false });
    const three = snap({ coupon, split: true });
    expect(three.snap.total_rappen).toBe(one.snap.total_rappen);
    expect(notFare(three.snap.lines)).toEqual(notFare(one.snap.lines));
    expect(fareSum(three.snap.lines)).toBe(fareSum(one.snap.lines));
    const pieces = three.snap.lines.filter((l) => l.kind === "fare");
    expect(pieces.map((l) => [l.code, l.amount_rappen, l.params.list_rappen])).toEqual([
      ["distance_fare", 0, 6000],
      ["airport_fee", 500, 1500],
      ["fixed_route", 2500, undefined],
    ]);
    expect(three.snap.lines.every((l) => l.amount_rappen == null || l.amount_rappen >= 0)).toBe(true);
    expect(sum(three.snap.lines)).toBe(three.snap.total_rappen);
  });

  it("coupon bigger than the fare spills into the extras exactly as before", () => {
    const coupon = { code: "BIG", kind: "amount" as const, percentHundredths: null, amountRappen: 10200 };
    const one = snap({ coupon, split: false });
    const three = snap({ coupon, split: true });
    const extra = (s: typeof one) => s.snap.lines.find((l) => l.kind === "surcharge");
    expect(extra(three)).toMatchObject({ amount_rappen: 300, params: { list_rappen: 500 } });
    expect(notFare(three.snap.lines)).toEqual(notFare(one.snap.lines));
    expect(three.snap.total_rappen).toBe(one.snap.total_rappen);
    expect(three.snap.lines.find((l) => l.kind === "coupon")).toMatchObject({
      amount_rappen: null,
      params: { discount_rappen: 10200 },
    });
    expect(sum(three.snap.lines)).toBe(three.snap.total_rappen);
  });

  it("percent coupon: charged, VAT, net and every saved non-fare line match the unsplit charge", () => {
    const coupon = { code: "TEN", kind: "percent" as const, percentHundredths: 1000, amountRappen: null };
    const one = snap({ coupon, split: false });
    const three = snap({ coupon, split: true });
    expect(three.charge.chargedRappen).toBe(one.charge.chargedRappen);
    expect(three.charge.vatRappen).toBe(one.charge.vatRappen);
    expect(three.charge.netRappen).toBe(one.charge.netRappen);
    expect(notFare(three.snap.lines)).toEqual(notFare(one.snap.lines));
    expect(fareSum(three.snap.lines)).toBe(fareSum(one.snap.lines));
    expect(sum(three.snap.lines)).toBe(three.snap.total_rappen);
  });
});
