export const dynamic = "force-dynamic";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { mapAccountBooking, type AccountSqlRow } from "@/lib/account/bookings";
import { customerClaims } from "@/lib/account/session";
import { MANAGE_COOKIE_NAME, hashManageToken, readManageCookie } from "@/lib/checkout/manage-token";
import { asCustomer } from "@/lib/db/identity";
import { requestCustomerPaidEdit, type CustomerEditAuth } from "@/lib/ops/edit-request";
import { failStatus, type EditPayload } from "@/lib/ops/edit-request-map";
import { accountWriteForbidden } from "@/lib/abuse/account-write";
import { csrfForbidden } from "@/lib/security/origin";

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
  const rows = await asCustomer(env, claims, async (sql) => {
    // D-32: link guest bookings made with this confirmed e-mail before listing. A failure must not break the list.
    try {
      await sql`select public.customer_claim_guest_bookings()`;
    } catch {
      /* listing continues; the claim retries on the next open */
    }
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
  return NextResponse.json(
    { bookings: rows.map((row) => mapAccountBooking(row)) },
    { headers: noStore },
  );
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function payloadFrom(record: Record<string, unknown>): EditPayload {
  const payloadRaw =
    record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>)
      : record;
  return {
    contact_name: str(payloadRaw.contact_name) ?? str(payloadRaw.customer),
    contact_email: str(payloadRaw.contact_email) ?? str(payloadRaw.email),
    contact_phone: str(payloadRaw.contact_phone) ?? str(payloadRaw.phone),
    note: str(payloadRaw.note),
    pickup_text: str(payloadRaw.pickup_text) ?? str(payloadRaw.pickup),
    dropoff_text: str(payloadRaw.dropoff_text) ?? str(payloadRaw.dropoff),
    flight_no: str(payloadRaw.flight_no) ?? str(payloadRaw.flight),
    scheduled_local: str(payloadRaw.scheduled_local),
    pax: num(payloadRaw.pax),
    bags: num(payloadRaw.bags),
    vehicle_class_slug: str(payloadRaw.vehicle_class_slug) ?? str(payloadRaw.klass),
  };
}

export async function POST(request: Request) {
  const blocked = csrfForbidden(request);
  if (blocked) return blocked;
  const limited = await accountWriteForbidden(request);
  if (limited) return limited;
  const claims = await customerClaims(request);
  const jar = await cookies();
  const raw = readManageCookie(jar.get(MANAGE_COOKIE_NAME)?.value ?? "", request.headers.get("cookie"));
  const manageTokenHashHex = raw ? await hashManageToken(raw) : "";

  let auth: CustomerEditAuth | null = null;
  if (claims?.email) {
    auth = { kind: "customer", claims };
  } else if (manageTokenHashHex) {
    auth = { kind: "guest", manageTokenHashHex };
  }
  if (!auth) {
    return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401, headers: noStore });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const bookingKey = str(record.reference) ?? str(record.id) ?? str(record.bookingId) ?? "";
  if (!bookingKey) {
    return NextResponse.json({ ok: false, code: "not-found" }, { status: 404, headers: noStore });
  }

  const { env } = await getCloudflareContext({ async: true });
  let result = await requestCustomerPaidEdit(env, auth, bookingKey, {
    quoteSnapshotId: num(record.quoteSnapshotId),
    lock: str(record.lock),
    vehicleClassSlug: str(record.vehicleClassSlug) ?? payloadFrom(record).vehicle_class_slug,
    payload: payloadFrom(record),
  });

  if (!result.ok && result.code === "not-found" && auth.kind === "customer" && manageTokenHashHex) {
    result = await requestCustomerPaidEdit(
      env,
      { kind: "guest", manageTokenHashHex },
      bookingKey,
      {
        quoteSnapshotId: num(record.quoteSnapshotId),
        lock: str(record.lock),
        vehicleClassSlug: str(record.vehicleClassSlug) ?? payloadFrom(record).vehicle_class_slug,
        payload: payloadFrom(record),
      },
    );
  }

  if (!result.ok) {
    return NextResponse.json({ ok: false, code: result.code }, { status: failStatus(result.code), headers: noStore });
  }
  return NextResponse.json(
    {
      ok: true,
      requestId: result.requestId,
      bookingId: result.bookingId,
      status: result.status,
    },
    { headers: noStore },
  );
}
