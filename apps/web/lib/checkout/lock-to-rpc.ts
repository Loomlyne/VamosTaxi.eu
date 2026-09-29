// apps/web/lib/checkout/lock-to-rpc.ts
//
// checkout_create_booking / create_quote_snapshot read pickup_text and
// vehicle_class_id. The HMAC lock stores nested pickup/dropoff and a class
// slug. Map once here so both /intent and /pay-link send the same JSON.

import type postgres from "postgres";
import type { QuoteLockPayload } from "../quote/lock";
import { zurichLocalToUtcMs } from "../geo/serviceArea";
import type { ChargeLine } from "./checkout-charge";
import type { SnapshotExtraFare } from "./extras-catalog";
import { payLinkExtras } from "./pay-link";

/**
 * A lock leg whose wall clock cannot be turned into an instant (D-36,
 * T-26.3-03-03). Callers map it to the `invalid_request` refusal.
 */
export class InvalidScheduleError extends Error {
  readonly refusal = "invalid_request" as const;
  constructor(readonly scheduledLocal: string) {
    super("invalid_request: scheduled_local is not a Zurich wall clock");
    this.name = "InvalidScheduleError";
  }
}

/** D-36: `scheduled_local` read in Europe/Zurich → the UTC `scheduled_at`. */
export function scheduledAtFromLocal(scheduledLocal: string): string {
  const ms = zurichLocalToUtcMs(scheduledLocal);
  if (ms == null) throw new InvalidScheduleError(scheduledLocal);
  return new Date(ms).toISOString();
}

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
    scheduled_at: scheduledAtFromLocal(leg.scheduled_local),
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

export function snapshotFareLines(
  vehicleClass: string,
  chargedRappen: number,
  extras: SnapshotExtraFare[] = [],
) {
  const priced = extras.filter(
    (row) => Number.isFinite(row.amount_rappen) && row.amount_rappen > 0,
  );
  const extraSum = priced.reduce((sum, row) => sum + row.amount_rappen, 0);
  const split = extraSum > 0 && extraSum < chargedRappen;
  const lines: Array<{
    seq: number;
    leg_seq: number;
    kind: string;
    code: string;
    i18n_key: string;
    params: Record<string, string | number>;
    amount_rappen: number;
  }> = [
    {
      seq: 1,
      leg_seq: 1,
      kind: "fare",
      code: "distance_fare",
      i18n_key: "price.line.transfer",
      params: { vehicleClass },
      amount_rappen: split ? chargedRappen - extraSum : chargedRappen,
    },
  ];
  if (!split) return lines;
  let seq = 2;
  for (const row of priced) {
    lines.push({
      seq,
      leg_seq: 1,
      kind: "surcharge",
      code: row.code,
      i18n_key: `price.surcharge.${row.code}.label`,
      params: { n: 1 },
      amount_rappen: row.amount_rappen,
    });
    seq += 1;
  }
  return lines;
}

export type SnapshotLine = {
  seq: number;
  leg_seq: number;
  kind: string;
  code: string;
  i18n_key: string;
  params: Record<string, unknown>;
  amount_rappen: number | null;
};

/**
 * checkoutCharge lines → price_snapshots.lines. The table's reconcile trigger
 * sums every amount as the non-negative `rappen` domain and must equal
 * total_rappen, so the negative coupon line cannot be stored as is: its
 * discount is taken off the fare line first, then the extras in order (each
 * keeps its pre-coupon figure in params.list_rappen), and the coupon line
 * carries amount_rappen null with params.discount_rappen for the receipt.
 */
export function snapshotLinesFromCharge(chargeLines: ChargeLine[]): SnapshotLine[] {
  const coupon = chargeLines.find((line) => line.kind === "coupon");
  let discountLeft = coupon ? Math.max(0, -coupon.amount_rappen) : 0;
  const out: SnapshotLine[] = [];
  let seq = 1;
  for (const line of chargeLines) {
    if (line.kind === "coupon") {
      out.push({
        seq: seq++,
        leg_seq: 1,
        kind: "coupon",
        code: line.code ?? "coupon",
        i18n_key: line.i18n_key,
        params: { ...line.params, discount_rappen: Math.max(0, -line.amount_rappen) },
        amount_rappen: null,
      });
      continue;
    }
    let amount = line.amount_rappen;
    let params = line.params;
    if (discountLeft > 0 && (line.kind === "fare" || line.kind === "surcharge") && amount > 0) {
      const take = Math.min(discountLeft, amount);
      discountLeft -= take;
      params = { ...params, list_rappen: amount };
      amount -= take;
    }
    out.push({
      seq: seq++,
      leg_seq: 1,
      kind: line.kind,
      code: line.code ?? line.kind,
      i18n_key: line.i18n_key,
      params,
      amount_rappen: amount,
    });
  }
  return out;
}

export function snapshotFromLock(
  payload: QuoteLockPayload,
  vehicleClass: string,
  vehicleClassId: string,
  chargedRappen: number,
  snapshotPolicy: Record<string, unknown>,
  extraFares: SnapshotExtraFare[] = [],
  chargeLines?: ChargeLine[],
) {
  const legs = checkoutLegsFromLock(payload, vehicleClassId);
  let extras: string[];
  let lines: SnapshotLine[];
  if (chargeLines) {
    // D-35: every ticked extra, by exact code, from the one charge function.
    extras = [];
    for (const line of chargeLines) {
      if (line.kind === "surcharge" && line.code && !extras.includes(line.code)) {
        extras.push(line.code);
      }
    }
    lines = snapshotLinesFromCharge(chargeLines);
  } else {
    // Legacy path until intent.ts switches to checkoutCharge (plan 26.3-09).
    extras = payLinkExtras(payload.extras);
    for (const row of extraFares) {
      if (!extras.includes(row.code)) extras.push(row.code);
    }
    lines = snapshotFareLines(vehicleClass, chargedRappen, extraFares);
  }
  return {
    vehicle_class_id: vehicleClassId,
    vehicle_class_slug: vehicleClass,
    rate_version_id: payload.rate_version_id,
    settings_version_id: payload.settings_version_id,
    engine_version: payload.engine_version,
    lock_exp: payload.exp,
    pax: payload.pax,
    bags: payload.bags,
    lines,
    policy: {
      ...snapshotPolicy,
      extras,
    },
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
