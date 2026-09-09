// apps/web/lib/ops/bookings.ts
//
// Read-only staff board (comment 9). Does not assign, refund, or confirm.
// Cash is not a V1 payment path — unpaid means card or pay-link still open.

import { asStaff, type VamosClaims } from "@/lib/db/identity";
import { mapBoardBooking, type OpsBookingRow, type SqlBoardRow } from "@/lib/ops/bookings-map";

export type { OpsBookingRow } from "@/lib/ops/bookings-map";
export { mapBoardBooking } from "@/lib/ops/bookings-map";

export const dynamic = "force-dynamic";

export async function loadBookings(env: CloudflareEnv, claims: VamosClaims): Promise<OpsBookingRow[]> {
  return asStaff(env, claims, async (sql) => {
    const rows = await sql<SqlBoardRow[]>`
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
        vc.slug as class_slug,
        ch.full_name as chauffeur_name,
        p.status as payment_status,
        p.captured_at,
        p.created_at as payment_created_at,
        p.stripe_checkout_session_id
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
      left join lateral (
        select *
        from public.booking_payments pay
        where pay.booking_id = b.id
        order by pay.created_at desc
        limit 1
      ) p on true
      where b.erased_at is null
      order by l.scheduled_at desc nulls last, b.created_at desc
    `;
    return rows.map(mapBoardBooking);
  });
}
