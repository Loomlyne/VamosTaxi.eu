// apps/web/lib/ops/bookings.ts
//
// Read-only staff board (comment 9). Does not assign, refund, or confirm.
// Cash is not a V1 payment path — unpaid means card or pay-link still open.
// Income uses summed captured payments, not the latest payment row alone.

import { asStaff, type VamosClaims } from "@/lib/db/identity";
import { mapBoardBooking, type OpsBookingRow, type SqlBoardRow } from "@/lib/ops/bookings-map";
import { classOwnName } from "@/lib/ops/class-slug";

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
        b.created_at,
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
        l.vehicle_class_id,
        vc.name as class_name,
        ch.full_name as chauffeur_name,
        ch.email as chauffeur_email,
        ch.plate as chauffeur_plate,
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
        ed.edit_class_slug,
        ed.edit_class_name,
        ed.edit_extra_rappen,
        ed.edit_extra_expires_at,
        rf.refund_rappen,
        b.refund_status,
        b.refund_owed_rappen,
        cap.captured_rappen,
        coalesce(tp.trip_passed, false) as trip_passed,
        dsp.status as dispute_status,
        dsp.reason as dispute_reason,
        snap.duration_min,
        snap.distance_km,
        snap.coupon_code,
        snap.policy,
        snap.lines,
        ev.events,
        l.arrived_at
      from public.bookings b
      left join lateral (
        select *
        from public.booking_legs leg
        where leg.booking_id = b.id
        order by leg.leg_seq
        limit 1
      ) l on true
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
          coalesce(sum(pay.charged_rappen) filter (where pay.captured_at is not null and extra.id is not null), 0) as extra_rappen,
          coalesce(sum(pay.charged_rappen) filter (where pay.captured_at is not null), 0) as captured_rappen
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
          qs.total_rappen as edit_quote_total,
          -- 26.2 P1: a class change waiting for the difference: the new class, the difference, until when.
          r.payload ->> 'vehicle_class_slug' as edit_class_slug,
          ecls.name as edit_class_name,
          xs.total_rappen as edit_extra_rappen,
          xs.expires_at as edit_extra_expires_at
        from public.booking_edit_requests r
        join public.price_snapshots qs on qs.id = r.quote_snapshot_id
        left join public.vehicle_classes ecls on ecls.slug = r.payload ->> 'vehicle_class_slug'
        left join public.price_snapshots xs on xs.id = r.extra_snapshot_id
        where r.booking_id = b.id
          and r.status = 'requested'
          -- D4: a difference not paid within 24 hours has ended; the booking reads as it is.
          and (xs.id is null or xs.expires_at > now())
        order by r.created_at desc
        limit 1
      ) ed on true
      -- D-25: the trip has happened once the earliest leg's original pickup is past.
      -- Computed with SQL now() so the Worker clock never decides it.
      left join lateral (
        select min(bl.original_scheduled_at) <= now() as trip_passed
        from public.booking_legs bl
        where bl.booking_id = b.id
      ) tp on true
      -- D-07: latest Stripe dispute only (staff SELECT under RLS). Status word
      -- and reason code, never evidence text.
      left join lateral (
        select d.status, d.reason
        from public.booking_disputes d
        where d.booking_id = b.id
        order by d.stripe_created desc
        limit 1
      ) dsp on true
      left join lateral (
        select coalesce(sum(br.refund_rappen), 0) as refund_rappen
        from public.booking_refunds br
        where br.booking_id = b.id
          and not exists (select 1 from public.booking_refund_reversals rv where rv.refund_id = br.id)
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

/**
 * One line of the dashboard's "Money in": a class by its own name. An empty `klass` is income whose
 * booking has no class row (it cannot happen today: a leg always has one); the dashboard words it.
 */
export type DashboardClassLine = { klass: string; rappen: number };

/** What the money query returns per class row (and one row with no class row for income that has none). */
export type DashboardClassSqlRow = {
  class_slug: string | null;
  class_name: string | null;
  sort_order: number | string | null;
  /** The class is on offer: active and not hidden. */
  live: boolean | null;
  income_rappen: number | string;
};

export type DashboardMoney = {
  period: MoneyPeriod;
  incomeRappen: number;
  refundRappen: number;
  feeRappen: number;
  /** Captured fares in the period: captured payments that are not a class-change difference. Average fare = income / this. */
  fareCount: number;
  /** Income split by the booking's class, in price-book order. The lines add up to incomeRappen. */
  byClass: DashboardClassLine[];
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

/** Milliseconds Zurich's wall clock is ahead of UTC at `ms` (3 600 000 in winter, 7 200 000 in summer). */
function zurichOffsetMs(ms: number): number {
  const parts: Record<string, string> = {};
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date(ms))
    .forEach((part) => {
      parts[part.type] = part.value;
    });
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return wall - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant 00:00 Europe/Zurich starts on `ymd` (YYYY-MM-DD), as a UTC ISO string: 2026-10-04 starts at
 * 2026-10-03T22:00:00.000Z, 2026-01-15 at 2026-01-14T23:00:00.000Z. Zurich's clock changes at 02:00/03:00,
 * never at midnight, so every day has exactly one midnight.
 *
 * 261004: the dashboard used `${ymd}::date at time zone 'Europe/Zurich'`, which turns a date into a
 * wall-clock timestamp read in the session's zone (UTC on Supabase): the day started at 02:00 UTC
 * (04:00 Zurich in summer), so a fare captured between midnight and 04:00 fell out of Today, 7 days and 30 days.
 */
export function zurichMidnightUtc(ymd: string): string {
  const bits = ymd.split("-");
  const guess = Date.UTC(Number(bits[0]), Number(bits[1]) - 1, Number(bits[2]));
  const first = guess - zurichOffsetMs(guess);
  return new Date(guess - zurichOffsetMs(first)).toISOString();
}

/** Where a dashboard period starts (UTC ISO instant, Zurich midnight), or null for all time. */
export function periodStartUtc(period: MoneyPeriod, now = new Date()): string | null {
  const fromYmd = periodFromYmd(period, zurichYmd(now));
  return fromYmd === null ? null : zurichMidnightUtc(fromYmd);
}

/**
 * The dashboard's "Money in" lines (U10, 2026-10-05). One line per class name, from the live vehicle
 * classes: every class on offer (active, not hidden), in price-book order (`sort_order`, then slug, the
 * order the price book lists them), each by its own stored name. A class that is no longer on offer
 * (the legacy rows, a dropped class) appears only while it has income in the period, under its own name:
 * "first" is First, never Economy. Two class rows with the same name are one line (the live `saden` and
 * the legacy `economy` are both Economy), placed where the first of them sits. The lines add up to the
 * rows' income; income with no class row is the last line, with an empty name.
 */
export function moneyClassLines(rows: readonly DashboardClassSqlRow[]): DashboardClassLine[] {
  type Line = { klass: string; order: number; slug: string; rappen: number; show: boolean };
  const lines: Line[] = [];
  let unclassed = 0;
  for (const row of rows) {
    const income = rappenOf(row.income_rappen);
    const slug = row.class_slug ? String(row.class_slug) : "";
    if (!slug) {
      unclassed += income;
      continue;
    }
    const stored = String(row.class_name ?? "").trim();
    const name = stored || classOwnName(slug);
    const sort = Number(row.sort_order);
    const order = Number.isFinite(sort) ? sort : 0;
    const show = row.live === true || income > 0;
    const line = lines.find((l) => l.klass.toLowerCase() === name.toLowerCase());
    if (!line) {
      lines.push({ klass: name, order, slug, rappen: income, show });
      continue;
    }
    line.rappen += income;
    line.show = line.show || show;
    if (order < line.order || (order === line.order && slug < line.slug)) {
      line.klass = name;
      line.order = order;
      line.slug = slug;
    }
  }
  const out = lines
    .filter((l) => l.show)
    .sort((a, b) => a.order - b.order || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .map((l) => ({ klass: l.klass, rappen: l.rappen }));
  if (unclassed > 0) out.push({ klass: "", rappen: unclassed });
  return out;
}

function rappenOf(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

function countOf(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

export async function loadDashboardMoney(
  env: CloudflareEnv,
  claims: VamosClaims,
  period: MoneyPeriod,
  now = new Date(),
): Promise<DashboardMoney> {
  // An instant with its zone (…Z), never a bare date: the bound value means the same on the Worker and on a Mac.
  const fromUtc = periodStartUtc(period, now);
  return asStaff(env, claims, async (sql) => {
    // One row per captured payment in the period, with the booking's class (first leg) and whether the
    // payment is a class-change difference (an extra, as the board reads it), so income, the class lines
    // and the fare count come from the same rows and always agree.
    // U10: every class row comes back (price-book order), with its income in the period, so the class
    // lines carry each class's own stored name and a class with no income yet still has its line. The
    // full join keeps income whose booking has no class row (class_slug null) too.
    const rows = await sql<
      (DashboardClassSqlRow & {
        fee_rappen: number | string;
        fare_count: number | string;
      })[]
    >`
      with paid as (
        select
          p.charged_rappen,
          p.stripe_fee_rappen,
          l.vehicle_class_id as class_id,
          exists (
            select 1
            from public.booking_edit_requests as extra
            where extra.extra_snapshot_id = p.snapshot_id
          ) as is_extra
        from public.booking_payments as p
        left join lateral (
          select leg.vehicle_class_id
          from public.booking_legs as leg
          where leg.booking_id = p.booking_id
          order by leg.leg_seq
          limit 1
        ) as l on true
        where p.captured_at is not null
          and (${fromUtc}::timestamptz is null or p.captured_at >= ${fromUtc}::timestamptz)
      ),
      by_class as (
        select
          class_id,
          coalesce(sum(charged_rappen), 0)::int as income_rappen,
          coalesce(sum(stripe_fee_rappen) filter (where stripe_fee_rappen is not null), 0)::int as fee_rappen,
          (count(*) filter (where not is_extra))::int as fare_count
        from paid
        group by class_id
      )
      select
        vc.slug as class_slug,
        vc.name as class_name,
        vc.sort_order,
        (vc.active and vc.hidden_at is null) as live,
        coalesce(b.income_rappen, 0)::int as income_rappen,
        coalesce(b.fee_rappen, 0)::int as fee_rappen,
        coalesce(b.fare_count, 0)::int as fare_count
      from public.vehicle_classes as vc
      full join by_class as b on b.class_id = vc.id
      order by vc.sort_order, vc.slug
    `;
    const refundSum = await sql<{ refund_rappen: number | string }[]>`
      select coalesce(sum(r.refund_rappen), 0)::int as refund_rappen
      from public.booking_refunds as r
      where
        not exists (select 1 from public.booking_refund_reversals as rv where rv.refund_id = r.id)
        and (
          ${fromUtc}::timestamptz is null
          or r.decided_at >= ${fromUtc}::timestamptz
        )
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
        not exists (select 1 from public.booking_refund_reversals as rv where rv.refund_id = r.id)
        and (
          ${fromUtc}::timestamptz is null
          or r.decided_at >= ${fromUtc}::timestamptz
        )
      order by r.decided_at desc, r.id desc
    `;
    let incomeRappen = 0;
    let feeRappen = 0;
    let fareCount = 0;
    for (const row of rows) {
      incomeRappen += rappenOf(row.income_rappen);
      feeRappen += rappenOf(row.fee_rappen);
      fareCount += countOf(row.fare_count);
    }
    const byClass = moneyClassLines(rows);
    return {
      period,
      incomeRappen,
      refundRappen: rappenOf(refundSum[0]?.refund_rappen),
      feeRappen,
      fareCount,
      byClass,
      refunds: lines.map((line) => ({
        customer: String(line.customer ?? "").trim(),
        booking: String(line.booking ?? "").trim(),
        amountRappen: rappenOf(line.amount_rappen),
      })),
    };
  });
}
