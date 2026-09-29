import { describe, expect, it } from "vitest";
import type { QuoteLockPayload } from "../quote/lock";
import { checkoutCharge } from "./checkout-charge";
import { checkoutLegsFromLock, snapshotFromLock, snapshotPolicyFromSettings } from "./lock-to-rpc";

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
    class_totals: [{ slug: "economy", total_rappen: 8000 }],
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
        waypoints: [],
        flight_no: "LX123",
        landing_source: null,
      },
    ],
  };
}

describe("checkoutLegsFromLock", () => {
  it("flattens nested pickup/dropoff into RPC columns", () => {
    const [leg] = checkoutLegsFromLock(payload(), CLASS_ID);
    expect(leg).toMatchObject({
      leg_seq: 1,
      direction: "outbound",
      pickup_text: "ZRH",
      pickup_place_id: "poi.1",
      pickup_lat: 47.4,
      pickup_lng: 8.5,
      dropoff_text: "Zurich",
      dropoff_place_id: null,
      scheduled_at: "2026-09-06T08:00:00.000Z",
      scheduled_local: "2026-09-06T10:00:00",
      flight_no: "LX123",
      vehicle_class_id: CLASS_ID,
      pax: 2,
      bags: 1,
      estimated_duration_minutes: 20,
    });
  });
});

describe("snapshotFromLock", () => {
  it("pins vehicle_class_id for create_quote_snapshot", () => {
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
    expect(policy).not.toBeNull();
    const snap = snapshotFromLock(payload(), "economy", CLASS_ID, 8000, policy!);
    expect(snap.vehicle_class_id).toBe(CLASS_ID);
    expect(snap.vehicle_class_slug).toBe("economy");
    expect(snap.total_rappen).toBe(8000);
    expect(snap.legs[0]?.pickup_text).toBe("ZRH");
    expect(snap.lines[0]?.amount_rappen).toBe(8000);
    expect(snap.policy).toMatchObject({ settings_version_id: 3, policy_doc: null, extras: [] });
  });

  it("splits child seat onto its own line so the recap can show it", () => {
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
    expect(policy).not.toBeNull();
    const snap = snapshotFromLock(payload(), "business", CLASS_ID, 12972, policy!, [
      { code: "child_seat", amount_rappen: 2000 },
    ]);
    expect(snap.lines).toEqual([
      expect.objectContaining({ code: "distance_fare", amount_rappen: 10972 }),
      expect.objectContaining({ code: "child_seat", amount_rappen: 2000 }),
    ]);
    expect(snap.lines.reduce((sum, line) => sum + line.amount_rappen, 0)).toBe(12972);
    expect(snap.policy).toMatchObject({ extras: ["child_seat"] });
  });

  it("writes every ticked extra as a generic line from the charge lines (D-35)", () => {
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
    const charge = checkoutCharge({
      classNetRappen: 10000,
      preCouponRappen: null,
      extraCodes: ["owner-thing"],
      catalog: [{ code: "owner-thing", amountRappen: 500, labels }],
      coupon: null,
      vatRateBps: 81,
      vehicleClassSlug: "economy",
    });
    if (!charge.ok) throw new Error("refused");
    const snap = snapshotFromLock(payload(), "economy", CLASS_ID, charge.chargedRappen, policy!, [], charge.lines);
    expect(snap.lines).toEqual([
      expect.objectContaining({ seq: 1, leg_seq: 1, kind: "fare", amount_rappen: 10000 }),
      expect.objectContaining({
        seq: 2,
        kind: "surcharge",
        code: "owner-thing",
        i18n_key: "price.surcharge.custom",
        params: { name: "Owner thing", names: labels },
        amount_rappen: 500,
      }),
      expect.objectContaining({ seq: 3, kind: "vat", amount_rappen: charge.vatRappen }),
    ]);
    expect(snap.lines.reduce((sum, line) => sum + (line.amount_rappen ?? 0), 0)).toBe(snap.total_rappen);
    expect(snap.policy).toMatchObject({ extras: ["owner-thing"] });
  });

  it("keeps every snapshot amount non-negative when a coupon applies (price_snapshots rappen >= 0)", () => {
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
    const charge = checkoutCharge({
      classNetRappen: 10000,
      preCouponRappen: null,
      extraCodes: ["owner-thing"],
      catalog: [{ code: "owner-thing", amountRappen: 500, labels }],
      coupon: { code: "FLAT", kind: "amount", percentHundredths: null, amountRappen: 1000 },
      vatRateBps: 81,
      vehicleClassSlug: "economy",
    });
    if (!charge.ok) throw new Error("refused");
    const snap = snapshotFromLock(payload(), "economy", CLASS_ID, charge.chargedRappen, policy!, [], charge.lines);
    const amounts = snap.lines.map((line) => line.amount_rappen);
    expect(amounts.every((amount) => amount == null || amount >= 0)).toBe(true);
    expect(snap.lines.reduce((sum, line) => sum + (line.amount_rappen ?? 0), 0)).toBe(charge.chargedRappen);
    const coupon = snap.lines.find((line) => line.kind === "coupon");
    expect(coupon).toMatchObject({ code: "FLAT", amount_rappen: null, params: { discount_rappen: 1000 } });
  });
});
