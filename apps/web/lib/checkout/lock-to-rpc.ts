// apps/web/lib/checkout/lock-to-rpc.ts
//
// checkout_create_booking / create_quote_snapshot read pickup_text and
// vehicle_class_id. The HMAC lock stores nested pickup/dropoff and a class
// slug. Map once here so both /intent and /pay-link send the same JSON.

import type postgres from "postgres";
import type { QuoteLockPayload } from "../quote/lock";

export type CheckoutRpcLeg = {
  leg_seq: number;
  direction: "outbound" | "return";
  pickup_text: string;
  pickup_place_id: string | null;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_text: string;
  dropoff_place_id: string | null;
  dropoff_lat: number;
  dropoff_lng: number;
  scheduled_at: string;
  scheduled_local: string;
  flight_no: string | null;
  vehicle_class_id: string;
  pax: number;
  bags: number;
  estimated_duration_minutes: number;
};

export async function lookupVehicleClassId(
  sql: postgres.Sql | postgres.TransactionSql,
  slug: string,
): Promise<string | null> {
  const rows = await sql<{ id: string }[]>`
    select id::text as id
      from public.vehicle_classes
     where slug = ${slug}
     limit 1
  `;
  return rows[0]?.id ?? null;
}

export function checkoutLegsFromLock(
  payload: QuoteLockPayload,
  vehicleClassId: string,
): CheckoutRpcLeg[] {
  return payload.legs.map((leg, index) => ({
    leg_seq: leg.leg_seq,
    direction: payload.mode === "return" && index === 1 ? "return" : "outbound",
    pickup_text: leg.pickup.text,
    pickup_place_id: leg.pickup.place_id ?? null,
    pickup_lat: leg.pickup.lat,
    pickup_lng: leg.pickup.lng,
    dropoff_text: leg.dropoff.text,
    dropoff_place_id: leg.dropoff.place_id ?? null,
    dropoff_lat: leg.dropoff.lat,
    dropoff_lng: leg.dropoff.lng,
    scheduled_at: leg.scheduled_local,
    scheduled_local: leg.scheduled_local,
    flight_no: leg.flight_no,
    vehicle_class_id: vehicleClassId,
    pax: payload.pax,
    bags: payload.bags,
    estimated_duration_minutes: Math.max(0, Math.round(leg.duration_s / 60)),
  }));
}

export function snapshotFromLock(
  payload: QuoteLockPayload,
  vehicleClass: string,
  vehicleClassId: string,
  chargedRappen: number,
) {
  const legs = checkoutLegsFromLock(payload, vehicleClassId);
  return {
    vehicle_class_id: vehicleClassId,
    vehicle_class_slug: vehicleClass,
    rate_version_id: payload.rate_version_id,
    settings_version_id: payload.settings_version_id,
    engine_version: payload.engine_version,
    lock_exp: payload.exp,
    pax: payload.pax,
    bags: payload.bags,
    lines: [],
    policy: {},
    shown_alternatives: payload.class_totals,
    legs,
    display_currency: payload.display_currency,
    source: "web",
    subtotal_rappen: chargedRappen,
    surcharges_rappen: 0,
    discount_rappen: 0,
    total_rappen: chargedRappen,
    distance_km: payload.legs.reduce((sum, leg) => sum + leg.distance_m, 0) / 1000,
    duration_min: Math.round(payload.legs.reduce((sum, leg) => sum + leg.duration_s, 0) / 60),
    coupon_code: payload.coupon,
  };
}
