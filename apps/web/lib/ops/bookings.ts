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
        cap.extra_rappen,
        ed.edit_request_id,
        ed.edit_actor,
        ed.edit_quote_total,
        ed.extra_session_id,
        rf.refund_rappen,
        ev.events
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
          coalesce(sum(pay.charged_rappen) filter (where pay.captured_at is not null and extra.id is not null), 0) as extra_rappen
        from public.booking_payments pay
        left join public.booking_edit_requests extra
          on extra.extra_snapshot_id = pay.price_snapshot_id
        where pay.booking_id = b.id
      ) cap on true
      left join lateral (
        select
          r.id as edit_request_id,
          r.actor_kind::text as edit_actor,
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
