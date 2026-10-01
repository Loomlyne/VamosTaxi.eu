export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { mapAccountBooking, type AccountSqlRow } from "@/lib/account/bookings";
import { customerClaims } from "@/lib/account/session";
import { asCustomer } from "@/lib/db/identity";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const claims = await customerClaims(request);
  const email = claims?.email;
  if (!email) {
    return NextResponse.json(
      { bookings: [] },
      { status: 401, headers: noStore },
    );
  }
  const { env } = await getCloudflareContext({ async: true });
  // D-32: link guest bookings made with this confirmed e-mail before listing. A failure must not
  // break the list, so the claim runs in its own transaction: a failed query aborts the transaction
  // it runs in, and postgres.js begin() throws it again after the callback even when caught inside.
  // Owner, 2026-10-01: show the bookings anyway; the claim retries on the next open.
  try {
    await asCustomer(env, claims, async (sql) => {
      await sql`select public.customer_claim_guest_bookings()`;
      return null;
    });
  } catch (err) {
    console.error("account_claim_guest_bookings_failed", err instanceof Error ? err.message : String(err));
  }
  let rows: AccountSqlRow[];
  try {
    rows = await asCustomer(env, claims, async (sql) => {
      return await sql<AccountSqlRow[]>`
        select
          b.reference,
          b.status::text as status,
          b.price_total_rappen,
          l.pickup_text,
          l.dropoff_text,
          l.scheduled_local,
          l.scheduled_at,
          l.pax,
          l.flight_no,
          b.contact_email,
          b.is_test,
          b.pay_link_sent_at,
          exists (select 1 from public.reviews r where r.booking_id = b.id) as has_review
        from public.bookings b
        inner join public.booking_legs l
          on l.booking_id = b.id
         and l.leg_seq = 1
        where b.status::text <> 'quote'
          and (
            b.status::text <> 'pending'
            or b.pay_link_sent_at is not null
          )
          and lower(b.contact_email::text) = lower(${email})
        order by case when b.status::text = 'pending' then 0 else 1 end,
                 l.scheduled_at desc nulls last
        limit 50
      `;
    });
  } catch {
    /* Never let a failed read look like an empty list: the pages show an error state on 500. */
    return NextResponse.json({ error: "list_failed" }, { status: 500, headers: noStore });
  }
  return NextResponse.json(
    { bookings: rows.map((row) => mapAccountBooking(row)) },
    { headers: noStore },
  );
}

// P6 review 1 (2026-10-02): the generic POST is retired. It took a quote snapshot id, a public quote
// lock and a free payload from the browser, so a customer could lower the price of a time change; no
// page called it. A customer's change is the time change (POST /api/account/bookings/time-change or
// /api/manage/time-change), priced at the booking's own total.
