export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { mapAccountBooking, type AccountSqlRow } from "@/lib/account/bookings";
import { asCustomer, type VamosClaims } from "@/lib/db/identity";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function customerClaims(request: Request): Promise<VamosClaims | null> {
  const supabase = await createServerSupabaseClient(request);
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user?.id) return null;
  const claims: VamosClaims = { sub: user.id, role: "authenticated" };
  if (typeof user.email === "string" && user.email.includes("@")) {
    claims.email = user.email;
  }
  return claims;
}

export async function GET(request: Request) {
  const claims = await customerClaims(request);
  if (!claims?.email) {
    return NextResponse.json({ bookings: [] }, { status: 401 });
  }
  const { env } = await getCloudflareContext({ async: true });
  const rows = await asCustomer(env, claims, async (sql) => {
    return sql<AccountSqlRow[]>`
      select
        b.reference,
        b.status::text as status,
        b.price_total_rappen,
        l.pickup_text,
        l.dropoff_text,
        l.scheduled_local,
        l.scheduled_at,
        l.pax,
        vc.slug as class_slug
      from public.bookings b
      inner join public.booking_legs l
        on l.booking_id = b.id
       and l.leg_seq = 1
      left join public.vehicle_classes vc
        on vc.id = l.vehicle_class_id
      where b.status::text not in ('quote', 'pending')
      order by l.scheduled_at desc nulls last, b.created_at desc
      limit 50
    `;
  });
  return NextResponse.json({ bookings: rows.map((row) => mapAccountBooking(row)) });
}
