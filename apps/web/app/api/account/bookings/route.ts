export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { mapAccountBooking, type AccountSqlRow } from "@/lib/account/bookings";
import { asCustomer } from "@/lib/db/identity";
import { customerClaims } from "@/lib/account/session";

export async function GET(request: Request) {
  const claims = await customerClaims(request);
  const email = claims?.email;
  if (!email) {
    return NextResponse.json({ bookings: [] }, { status: 401 });
  }
  const { env } = await getCloudflareContext({ async: true });
  const rows = await asCustomer(env, claims, async (sql) => {
    return await sql<AccountSqlRow[]>`
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
      where b.status::text <> 'quote'
        and lower(b.contact_email::text) = lower(${email})
      order by case when b.status::text = 'pending' then 0 else 1 end,
               l.scheduled_at desc nulls last
      limit 50
    `;
  });
  return NextResponse.json({ bookings: rows.map((row) => mapAccountBooking(row)) });
}
