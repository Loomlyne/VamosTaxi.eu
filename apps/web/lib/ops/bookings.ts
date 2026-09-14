// apps/web/lib/ops/bookings.ts
//
// Read-only staff board (comment 9). Does not assign, refund, or confirm.
// Cash is not a V1 payment path — unpaid means card or pay-link still open.
// Income uses summed captured payments, not the latest payment row alone.

import { asStaff, type VamosClaims } from "@/lib/db/identity";
import { mapBoardBooking, type OpsBookingRow, type SqlBoardRow } from "@/lib/ops/bookings-map";

export type { OpsBookingRow } from "@/lib/ops/bookings-map";
export { mapBoardBooking } from "@/lib/ops/bookings-map";

export type OpsBookingEvent = {
  id: string;
  kind: string;
  at: string;
  actorKind: string;
  actorLabel: string;
  payload: unknown;
};

export type OpsBookingWithEvents = OpsBookingRow & { events: OpsBookingEvent[] };

function parseEvents(raw: unknown): OpsBookingEvent[] {
  const list = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  if (!Array.isArray(list)) return [];
  const out: OpsBookingEvent[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    out.push({
      id: rec.id == null ? "" : String(rec.id),
      kind: rec.kind == null ? "" : String(rec.kind),
      at: rec.at instanceof Date ? rec.at.toISOString() : rec.at == null ? "" : String(rec.at),
      actorKind: rec.actorKind == null ? "" : String(rec.actorKind),
      actorLabel: rec.actorLabel == null ? "" : String(rec.actorLabel),
      payload: rec.payload ?? {},
    });
  }
  return out;
}

export const dynamic = "force-dynamic";

export async function loadBookings(
  env: CloudflareEnv,
  claims: VamosClaims,
): Promise<OpsBookingWithEvents[]> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<(SqlBoardRow & { events: unknown })[]>`
      select
        b.id,
        b.reference,
        b.status::text as status,
        b.contact_name,
        b.contact_email::text as contact_email,
        b.contact_phone,
        b.company_name,
        b.note,
        b.pay_link_sent_at,
        l.pickup_text,
        l.dropoff_text,
        l.scheduled_local,
        l.scheduled_at,
        l.flight_no,
        l.pax,
        l.bags,
        l.estimated_duration_minutes,
        l.assigned_chauffeur_id,
        l.assigned_vehicle_id,
        vc.slug as class_slug,
        ch.full_name as chauffeur_name,
        ch.email as chauffeur_email,
        v.plate as vehicle_plate,
        v.model as vehicle_model,
        p.status as payment_status,
        p.created_at as payment_created_at,
        p.stripe_checkout_session_id,
        cap.captured_at,
        cap.charged_rappen,
        snap.total_rappen as snapshot_total_rappen,
        cap.extra_rappen,
        ed.edit_request_id,
        ed.edit_actor,
        ed.edit_quote_total,
        ed.extra_session_id,
        rf.refund_rappen,
        snap.duration_min,
        snap.distance_km,
        snap.coupon_code,
        snap.policy,
        ev.events,
        l.arrived_at,
        live.free_wait_minutes,
        live.waiting_amount_rappen
      from public.bookings b
      left join lateral (
        select *
        from public.booking_legs leg
        where leg.booking_id = b.id
        order by leg.leg_seq
        limit 1
      ) l on true
      left join lateral (
        select
          rv.free_wait_minutes,
          s.amount_rappen as waiting_amount_rappen
        from public.rate_versions rv
        left join public.surcharges s
          on s.rate_version_id = rv.id
         and s.active = true
         and s.code in ('waiting_airport', 'waiting', 'waiting_city')
        where rv.status = 'live'
        order by case s.code
          when 'waiting_airport' then 0
          when 'waiting' then 1
          else 2
        end
        limit 1
      ) live on true
      left join public.vehicle_classes vc on vc.id = l.vehicle_class_id
      left join public.chauffeurs ch on ch.id = l.assigned_chauffeur_id
      left join public.vehicles v on v.id = l.assigned_vehicle_id
      left join lateral (
        select
          pay.status,
          pay.created_at,
          pay.stripe_checkout_session_id
        from public.booking_payments pay
        where pay.booking_id = b.id
        order by pay.created_at desc
        limit 1
      ) p on true
      left join lateral (
        select
          min(pay.captured_at) filter (where extra.id is null) as captured_at,
          coalesce(sum(pay.charged_rappen) filter (where pay.captured_at is not null and extra.id is null), 0) as charged_rappen,
          coalesce(sum(pay.charged_rappen) filter (where pay.captured_at is not null and extra.id is not null), 0) as extra_rappen
        from public.booking_payments pay
        left join public.booking_edit_requests extra
          on extra.extra_snapshot_id = pay.snapshot_id
        where pay.booking_id = b.id
      ) cap on true
      left join lateral (
        select
          r.id as edit_request_id,
          r.actor::text as edit_actor,
          r.extra_session_id,
          qs.total_rappen as edit_quote_total
        from public.booking_edit_requests r
        join public.price_snapshots qs on qs.id = r.quote_snapshot_id
        where r.booking_id = b.id
          and r.status = 'requested'
        order by r.created_at desc
        limit 1
      ) ed on true
      left join lateral (
        select coalesce(sum(br.refund_rappen), 0) as refund_rappen
        from public.booking_refunds br
        where br.booking_id = b.id
      ) rf on true
      left join lateral (
        select
          s.duration_min,
          s.distance_km,
          s.total_rappen,
          s.coupon_code,
          s.policy,
          s.lines
        from public.price_snapshots s
        where s.booking_id = b.id
        order by s.computed_at desc nulls last
        limit 1
      ) snap on true
      left join lateral (
        select coalesce(
          json_agg(
            json_build_object(
              'id', e.id,
              'kind', e.kind,
              'at', e.at,
              'actorKind', e.actor_kind,
              'actorLabel', e.actor_label,
              'payload', e.payload
            )
            order by e.at asc, e.id asc
          ),
          '[]'::json
        ) as events
        from public.booking_events e
        where e.booking_id = b.id
      ) ev on true
      where b.erased_at is null
      order by l.scheduled_at desc nulls last, b.created_at desc
    `;
    return rows.map((row) => ({
      ...mapBoardBooking(row),
      events: parseEvents(row.events),
    }));
  });
}

export type MoneyPeriod = "today" | "week" | "month" | "all";

export type DashboardRefundLine = {
  customer: string;
  booking: string;
  amountRappen: number;
};

export type DashboardMoney = {
  period: MoneyPeriod;
  incomeRappen: number;
  refundRappen: number;
  feeRappen: number;
  refunds: DashboardRefundLine[];
};

export function parseMoneyPeriod(raw: string | null | undefined): MoneyPeriod {
  if (raw === "week" || raw === "month" || raw === "all") return raw;
  return "today";
}

export function zurichYmd(at = new Date()): string {
  const parts: Record<string, string> = {};
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(at)
    .forEach((part) => {
      parts[part.type] = part.value;
    });
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const bits = ymd.split("-");
  const year = Number(bits[0]);
  const month = Number(bits[1]);
  const day = Number(bits[2]);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + days);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function periodFromYmd(period: MoneyPeriod, todayYmd: string): string | null {
  if (period === "all") return null;
  if (period === "today") return todayYmd;
  if (period === "week") return addDaysYmd(todayYmd, -6);
  return addDaysYmd(todayYmd, -29);
}

function rappenOf(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

export async function loadDashboardMoney(
  env: CloudflareEnv,
  claims: VamosClaims,
  period: MoneyPeriod,
  now = new Date(),
): Promise<DashboardMoney> {
  const fromYmd = periodFromYmd(period, zurichYmd(now));
  return asStaff(env, claims, async (sql) => {
    const sums = await sql<{ income_rappen: number | string; fee_rappen: number | string }[]>`
      select
        coalesce(sum(p.charged_rappen), 0)::int as income_rappen,
        coalesce(sum(p.stripe_fee_rappen) filter (where p.stripe_fee_rappen is not null), 0)::int as fee_rappen
      from public.booking_payments as p
      where p.captured_at is not null
        and (
          ${fromYmd}::text is null
          or p.captured_at >= (${fromYmd}::date at time zone 'Europe/Zurich')
        )
    `;
    const refundSum = await sql<{ refund_rappen: number | string }[]>`
      select coalesce(sum(r.refund_rappen), 0)::int as refund_rappen
      from public.booking_refunds as r
      where
        ${fromYmd}::text is null
        or r.decided_at >= (${fromYmd}::date at time zone 'Europe/Zurich')
    `;
    const lines = await sql<
      { customer: string | null; booking: string | null; amount_rappen: number | string }[]
    >`
      select
        b.contact_name as customer,
        b.reference as booking,
        r.refund_rappen as amount_rappen
      from public.booking_refunds as r
      join public.bookings as b on b.id = r.booking_id
      where
        ${fromYmd}::text is null
        or r.decided_at >= (${fromYmd}::date at time zone 'Europe/Zurich')
      order by r.decided_at desc, r.id desc
    `;
    return {
      period,
      incomeRappen: rappenOf(sums[0]?.income_rappen),
      refundRappen: rappenOf(refundSum[0]?.refund_rappen),
      feeRappen: rappenOf(sums[0]?.fee_rappen),
      refunds: lines.map((line) => ({
        customer: String(line.customer ?? "").trim(),
        booking: String(line.booking ?? "").trim(),
        amountRappen: rappenOf(line.amount_rappen),
      })),
    };
  });
}
