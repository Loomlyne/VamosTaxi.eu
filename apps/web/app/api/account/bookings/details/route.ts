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
  const email = claims.email;
  const { env } = await getCloudflareContext({ async: true });
  try {
    type Answer = { extras: unknown; refundStatus: string; refundOwedRappen: number } | null;
    const payload = await asCustomer(env, claims, async (sql): Promise<Answer> => {
      const rows = await sql<{ payload: unknown }[]>`
        select public.customer_booking_extras(${reference}) as payload
      `;
      const extras = rows[0]?.payload;
      if (!extras) return null;
      // 20-10: the refund row and box of the booking page. Same ownership rule as the account list
      // (the signed-in e-mail). Readable as `authenticated` through the column grant of
      // 20260911234758 (refund_status, refund_owed_rappen, refunded_rappen).
      const refund = await sql<{ refund_status: string | null; refund_owed_rappen: number | string | null }[]>`
        select b.refund_status::text as refund_status, b.refund_owed_rappen
          from public.bookings as b
         where b.reference = ${reference}
           and lower(b.contact_email::text) = lower(${email})
         limit 1
      `;
      const owed = Number(refund[0]?.refund_owed_rappen ?? 0);
      return {
        extras,
        refundStatus: refund[0]?.refund_status ? String(refund[0].refund_status) : "none",
        refundOwedRappen: Number.isFinite(owed) ? owed : 0,
      };
    });
    if (!payload) return NextResponse.json({ ok: false }, { status: 404, headers: noStore });
    return NextResponse.json(
      {
        ok: true,
        ...manageExtrasFromJson(payload.extras),
        refundStatus: payload.refundStatus,
        refundOwedRappen: payload.refundOwedRappen,
      },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 500, headers: noStore });
  }
}
