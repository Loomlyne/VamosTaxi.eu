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

const POLICY_KEYS = [
  "cancellation_tiers",
  "free_cancel_hours",
  "airport_waiting_minutes",
  "city_waiting_minutes",
  "settings_version_id",
  "modification_deadline_hours",
  "min_advance_minutes",
  "policy_doc",
] as const;

export function snapshotPolicyFromSettings(doc: unknown): Record<string, unknown> | null {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return null;
  const rec = doc as Record<string, unknown>;
  const rawId = rec.id;
  const id =
    typeof rawId === "number" && Number.isFinite(rawId)
      ? rawId
      : typeof rawId === "string" && /^\d+$/.test(rawId)
        ? Number(rawId)
        : NaN;
  if (!Number.isFinite(id)) return null;
  const slug = rec.policy_doc_slug;
  const version = rec.policy_doc_version;
  const policy = {
    settings_version_id: id,
    free_cancel_hours: rec.free_cancel_hours ?? null,
    modification_deadline_hours: rec.modification_deadline_hours ?? null,
    min_advance_minutes: rec.min_advance_minutes ?? null,
    airport_waiting_minutes: rec.airport_waiting_minutes ?? null,
    city_waiting_minutes: rec.city_waiting_minutes ?? null,
    cancellation_tiers: Array.isArray(rec.cancellation_tiers) ? rec.cancellation_tiers : [],
    policy_doc:
      typeof slug === "string" && typeof version === "string" ? { slug, version } : null,
  };
  for (const key of POLICY_KEYS) {
    if (!(key in policy)) return null;
  }
  return policy;
}

export function snapshotFareLines(vehicleClass: string, chargedRappen: number) {
  return [
    {
      seq: 1,
      leg_seq: 1,
      kind: "fare",
      code: "distance_fare",
      i18n_key: "price.line.transfer",
      params: { vehicleClass },
      amount_rappen: chargedRappen,
    },
  ];
}

export function snapshotFromLock(
  payload: QuoteLockPayload,
  vehicleClass: string,
  vehicleClassId: string,
  chargedRappen: number,
  snapshotPolicy: Record<string, unknown>,
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
    lines: snapshotFareLines(vehicleClass, chargedRappen),
    policy: snapshotPolicy,
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
