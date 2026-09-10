import { describe, expect, it } from "vitest";
import type { QuoteLockPayload } from "../quote/lock";
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
      scheduled_at: "2026-09-06T10:00:00",
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
});
