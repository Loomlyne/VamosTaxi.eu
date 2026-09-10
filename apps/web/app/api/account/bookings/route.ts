export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { mapAccountBooking, type AccountSqlRow } from "@/lib/account/bookings";
import { customerClaims } from "@/lib/account/session";
import { asCustomer, asSystem } from "@/lib/db/identity";

type AccountFleetRow = {
  reference: string;
  chauffeur_name: string | null;
  vehicle_plate: string | null;
  vehicle_model: string | null;
};

export async function GET(request: Request) {
  const claims = await customerClaims(request);
  if (!claims?.email) {
    return NextResponse.json({ bookings: [] }, { status: 401 });
  }
  const { env } = await getCloudflareContext({ async: true });
  const rows = await asCustomer(env, claims, async (sql) => {
    const out = await sql<AccountSqlRow[]>`
      select
        b.reference,
        b.status::text as status,
        b.price_total_rappen,
        l.pickup_text,
        l.dropoff_text,
        l.scheduled_local,
        l.scheduled_at,
        l.pax
      from public.bookings b
      inner join public.booking_legs l
        on l.booking_id = b.id
       and l.leg_seq = 1
      where b.status::text not in ('quote', 'pending')
      order by l.scheduled_at desc nulls last, b.created_at desc
      limit 50
    `;
    return [...out];
  });
  const fleet = await asSystem(env, async (sql) => {
    const out = await sql<AccountFleetRow[]>`
      select
        b.reference,
        ch.full_name as chauffeur_name,
        v.plate as vehicle_plate,
        v.model as vehicle_model
      from public.bookings b
      inner join public.booking_legs l
        on l.booking_id = b.id
       and l.leg_seq = 1
      left join public.chauffeurs ch on ch.id = l.assigned_chauffeur_id
      left join public.vehicles v on v.id = l.assigned_vehicle_id
      where b.erased_at is null
        and b.status::text not in ('quote', 'pending')
        and lower(b.contact_email::text) = lower(${claims.email})
    `;
    return [...out];
  });
  const fleetByRef: Record<string, AccountFleetRow> = {};
  for (const row of fleet) {
    const ref = row.reference == null ? "" : String(row.reference);
    if (ref) fleetByRef[ref] = row;
  }
  const bookings = rows.map((row) => {
    const extra = fleetByRef[String(row.reference ?? "")] ?? null;
    return mapAccountBooking({
      ...row,
      chauffeur_name: extra?.chauffeur_name ?? null,
      vehicle_plate: extra?.vehicle_plate ?? null,
      vehicle_model: extra?.vehicle_model ?? null,
    });
  });
  return NextResponse.json({ bookings });
}
