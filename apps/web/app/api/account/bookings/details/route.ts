export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { customerClaims } from "@/lib/account/session";
import { manageExtrasFromJson } from "@/lib/checkout/manage-money";
import { asCustomer } from "@/lib/db/identity";

const noStore = { "Cache-Control": "private, no-store" };

/**
 * Money and driver for one of the signed-in customer's bookings (manage-booking opened from the
 * account). Ownership is decided inside customer_booking_extras from the JWT e-mail; a miss is a
 * plain null, so a reference that is not theirs looks the same as one that does not exist.
 */
export async function GET(request: Request) {
  const claims = await customerClaims(request);
  if (!claims?.email) {
    return NextResponse.json({ ok: false }, { status: 401, headers: noStore });
  }
  const reference = (new URL(request.url).searchParams.get("ref") ?? "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z0-9-]{4,32}$/.test(reference)) {
    return NextResponse.json({ ok: false }, { status: 404, headers: noStore });
  }
  const { env } = await getCloudflareContext({ async: true });
  try {
    const payload = await asCustomer(env, claims, async (sql) => {
      const rows = await sql<{ payload: unknown }[]>`
        select public.customer_booking_extras(${reference}) as payload
      `;
      return rows[0]?.payload;
    });
    if (!payload) return NextResponse.json({ ok: false }, { status: 404, headers: noStore });
    return NextResponse.json({ ok: true, ...manageExtrasFromJson(payload) }, { headers: noStore });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500, headers: noStore });
  }
}
